// ── Thermal theme — 2D heat-field take on the lava lamp (flat, FLIR-style) ─
// Kept as an alternate look; the default lava theme is the 3D one.
// Metaballs with a compact polynomial kernel (f = w·(1−(d/R)²)² inside R,
// zero outside), summed per pixel in a fragment shader and mapped through an
// ironbow-ish ramp sampled off the NOCTA thermal shirt. Overlapping blobs sum
// fields, so near-passes neck together and merge zones run hotter — which is
// both the lava-lamp move and thermally correct. Renders on warm paper with
// the field suppressed under the text block (same zone trick as the ASCII
// theme). No libraries, WebGL1, one fullscreen triangle.
(function () {
  window.__themes = window.__themes || {};

  const config = {
    blobs: 9,
    rMin: 0.22, rMax: 0.5,          // outer field radius, fraction of min(vw, vh)
    weightMin: 0.85, weightMax: 1.3, // peak heat: <0.95 tops out amber, >1.1 burns to cream
    riseMin: 60, riseMax: 115,      // seconds per rise+fall cycle; big blobs get the slow end
    loiter: 1.7,                    // tanh shaping — higher = longer dwell at top/bottom
    yAmpMin: 0.35, yAmpMax: 0.55,   // vertical travel, fraction of height (0.5 grazes the edges)
    wanderPeriodMin: 45, wanderPeriodMax: 85,
    wanderAmpMin: 0.04, wanderAmpMax: 0.11, // sideways drift, fraction of width
    breatheAmp: 0.11, breathePeriodMin: 26, breathePeriodMax: 46,
    // The molten pool: one wide blob parked below the bottom edge, so the
    // lamp reads as heated from beneath.
    pool: { r: 0.7, weight: 0.95, y: 1.25, wanderAmp: 0.05, wanderPeriod: 95 },
    // Cursor is a gentle heat source (peaks purple-magenta, never a hot core).
    cursor: { r: 230, weight: 0.4, easeIn: 2.5, easeOut: 1.1, idleMs: 350 },
    // Tap/click = a heat bloom that expands and cools away.
    pulseSlots: 3,
    pulse: { r0: 90, r1: 520, dur: 2.4, weight: 0.85 },
    // Thermal ramp, cold → hot. Each stop is [hex, fadeStart, fadeEnd] in
    // field units; a blob's core color is its weight landed on this scale.
    paper: '#f2efe9',
    palette: [
      ['#3b2d6e', 0.07, 0.22], // navy shell
      ['#6b2d86', 0.22, 0.36], // purple
      ['#c62a7e', 0.36, 0.52], // magenta
      ['#ef5a3a', 0.52, 0.68], // orange
      ['#f5a623', 0.68, 0.82], // amber
      ['#f7d84b', 0.82, 0.95], // yellow
      ['#fdf6e3', 0.95, 1.16], // near-white core
    ],
    zonePadX: 44, zonePadY: 30, zoneFade: 130,
    // Fake volume: light the field's gradient like a height map. Subtle by
    // design — the thermal ramp itself is doing the 3D work.
    relief: 520, shade: 0.12, gloss: 0.08, glossPow: 24,
    dprMax: 2,
  };

  const rand = (a, b) => a + Math.random() * (b - a);

  function hexToGLSL(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => (v / 255).toFixed(4);
    return `vec3(${f(n >> 16 & 255)}, ${f(n >> 8 & 255)}, ${f(n & 255)})`;
  }

  // Slot layout in the uniform array: [blobs][pool][cursor][pulses]
  const COUNT = config.blobs + 1 + 1 + config.pulseSlots;
  const POOL = config.blobs, CURSOR = POOL + 1, PULSE0 = CURSOR + 1;

  const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

  function fragSource() {
    const ramp = config.palette
      .map(([hex, a, b]) =>
        `c = mix(c, ${hexToGLSL(hex)}, smoothstep(${a.toFixed(3)}, ${b.toFixed(3)}, f));`)
      .join('\n  ');
    // Scalars ride in u_meta so total uniform vectors stay within WebGL1's
    // guaranteed minimum of 16 (u_b[${COUNT}] + u_meta + u_zone).
    return `
precision highp float;
uniform vec4 u_meta;     // viewport w, h (CSS px), dpr, zone fade px
uniform vec4 u_b[${COUNT}]; // x, y, R (CSS px), weight
uniform vec4 u_zone;     // cx, cy, hw, hh (CSS px)

vec3 ramp(float f) {
  vec3 c = ${hexToGLSL(config.paper)};
  ${ramp}
  return c;
}

void main() {
  vec2 p = gl_FragCoord.xy / u_meta.z;
  p.y = u_meta.y - p.y; // match top-left page coords

  float f = 0.0;
  vec2 g = vec2(0.0); // field gradient, for relief lighting
  for (int i = 0; i < ${COUNT}; i++) {
    vec4 b = u_b[i];
    vec2 d = p - b.xy;
    float rr = b.z * b.z;
    float q = dot(d, d) / rr;
    if (q < 1.0) {
      float m = 1.0 - q;
      f += b.w * m * m;
      g -= (4.0 * b.w * m / rr) * d;
    }
  }

  // The field parts around the text block (quadratic falloff, like ascii).
  vec2 zd = max(abs(p - u_zone.xy) - u_zone.zw, vec2(0.0));
  float zk = 1.0 - clamp(length(zd) / u_meta.w, 0.0, 1.0);
  float keep = 1.0 - zk * zk;
  f *= keep;
  g *= keep;

  vec3 c = ramp(f);

  // Relief: treat the field as a height map, light it from the upper left.
  float mask = smoothstep(0.07, 0.30, f); // paper stays flat
  vec3 n = normalize(vec3(-g * ${config.relief.toFixed(1)}, 1.0));
  vec3 L = normalize(vec3(-0.45, -0.55, 0.72));
  c *= 1.0 + ${config.shade.toFixed(3)} * (dot(n, L) - L.z) * mask;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  c += pow(max(dot(n, H), 0.0), ${config.glossPow.toFixed(1)}) * ${config.gloss.toFixed(3)} * mask;

  // Dither so the slow gradients don't band at 8 bits.
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (dn - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(c, 1.0);
}`;
  }

  function makeBlobs() {
    const blobs = [];
    for (let i = 0; i < config.blobs; i++) {
      const r = rand(config.rMin, config.rMax);
      // Mass matters: bigger blobs rise and fall on the slow end of the range.
      const heft = (r - config.rMin) / (config.rMax - config.rMin);
      blobs.push({
        bx: (i + 0.5) / config.blobs + rand(-0.5, 0.5) / config.blobs,
        r,
        w: rand(config.weightMin, config.weightMax),
        risePeriod: (config.riseMin + heft * (config.riseMax - config.riseMin)) * rand(0.9, 1.1),
        risePhase: rand(0, 1),
        yAmp: rand(config.yAmpMin, config.yAmpMax),
        wanderPeriod: rand(config.wanderPeriodMin, config.wanderPeriodMax),
        wanderPhase: rand(0, 1),
        wanderAmp: rand(config.wanderAmpMin, config.wanderAmpMax),
        breathePeriod: rand(config.breathePeriodMin, config.breathePeriodMax),
        breathePhase: rand(0, 1),
      });
    }
    return blobs;
  }

  window.__themes.thermal = {
    start(content) {
      const canvas = document.createElement('canvas');
      canvas.className = 'bg-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);

      const gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'low-power',
      });
      if (!gl) { canvas.remove(); return; } // paper + text still stand alone

      // ── program ──
      function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.error('lava shader:', gl.getShaderInfoLog(s));
          return null;
        }
        return s;
      }
      let loc = null;
      function initGL() {
        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, fragSource());
        if (!vs || !fs) return false;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.error('lava link:', gl.getProgramInfoLog(prog));
          return false;
        }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, 'a');
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        loc = {
          meta: gl.getUniformLocation(prog, 'u_meta'),
          b: gl.getUniformLocation(prog, 'u_b'),
          zone: gl.getUniformLocation(prog, 'u_zone'),
        };
        return true;
      }
      if (!initGL()) { canvas.remove(); return; }

      // ── state ──
      const blobs = makeBlobs();
      const data = new Float32Array(COUNT * 4);
      const pulses = []; // {x, y, born}
      const zone = { cx: 0, cy: 0, hw: 0, hh: 0 };
      let vw = 0, vh = 0, dpr = 1;
      const cur = { x: -1e4, y: -1e4, lastMove: -1e9, w: 0 };

      function pack(i, x, y, r, w) {
        const o = i * 4;
        data[o] = x; data[o + 1] = y; data[o + 2] = r; data[o + 3] = w;
      }
      const packOff = (i) => pack(i, -1e5, -1e5, 1, 0);

      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, config.dprMax);
        vw = window.innerWidth;
        vh = window.innerHeight;
        canvas.width = Math.floor(vw * dpr);
        canvas.height = Math.floor(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform4f(loc.meta, vw, vh, dpr, config.zoneFade);
      }

      function measureZone() {
        const r = content.getBoundingClientRect();
        zone.cx = r.left + r.width / 2;
        zone.cy = r.top + r.height / 2;
        zone.hw = r.width / 2 + config.zonePadX;
        zone.hh = r.height / 2 + config.zonePadY;
      }

      const TWO_PI = Math.PI * 2;
      const loiterNorm = Math.tanh(config.loiter);

      function render(now, dt) {
        const t = now / 1000;
        const minDim = Math.min(vw, vh);

        for (let i = 0; i < blobs.length; i++) {
          const b = blobs[i];
          // Buoyancy: a tanh-shaped sine spends its time loitering at the
          // extremes — blobs dwell at the bottom, rise, dwell at the top.
          const shaped = Math.tanh(Math.sin(TWO_PI * (t / b.risePeriod + b.risePhase)) * config.loiter) / loiterNorm;
          const y = (0.5 + b.yAmp * shaped) * vh;
          const x = (b.bx + Math.sin(TWO_PI * (t / b.wanderPeriod + b.wanderPhase)) * b.wanderAmp) * vw;
          const r = b.r * minDim * (1 + config.breatheAmp * Math.sin(TWO_PI * (t / b.breathePeriod + b.breathePhase)));
          pack(i, x, y, r, b.w);
        }

        const pool = config.pool;
        pack(POOL,
          (0.5 + Math.sin(TWO_PI * t / pool.wanderPeriod) * pool.wanderAmp) * vw,
          pool.y * vh, pool.r * minDim, pool.weight);

        // Cursor heat eases in while the pointer moves, cools when it stops.
        const active = now - cur.lastMove < config.cursor.idleMs;
        const target = active ? config.cursor.weight : 0;
        const rate = active ? config.cursor.easeIn : config.cursor.easeOut;
        cur.w += (target - cur.w) * (1 - Math.exp(-dt * rate));
        if (cur.w > 0.005) pack(CURSOR, cur.x, cur.y, config.cursor.r, cur.w);
        else packOff(CURSOR);

        for (let i = 0; i < config.pulseSlots; i++) {
          const p = pulses[i];
          const age = p ? (now - p.born) / 1000 / config.pulse.dur : 1;
          if (age < 1) {
            const ease = 1 - Math.pow(1 - age, 3);
            pack(PULSE0 + i,
              p.x, p.y,
              config.pulse.r0 + (config.pulse.r1 - config.pulse.r0) * ease,
              config.pulse.weight * (1 - age) * (1 - age));
          } else packOff(PULSE0 + i);
        }

        const zoneBreath = Math.sin(now * 0.0006) * 4;
        gl.uniform4f(loc.zone, zone.cx, zone.cy, zone.hw + zoneBreath, zone.hh + zoneBreath);
        gl.uniform4fv(loc.b, data);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // ── lifecycle ──
      resize();
      measureZone();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureZone);
      window.addEventListener('load', measureZone);

      let resizeTimer = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { resize(); measureZone(); renderOnce(); }, 120);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);

      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      function renderOnce() { if (reduced) render(30000, 0.016); }
      if (reduced) {
        renderOnce(); // one still frame of the lamp; no motion, no input
        return;
      }

      window.addEventListener('pointermove', (e) => {
        cur.x = e.clientX; cur.y = e.clientY;
        cur.lastMove = performance.now();
      });
      let downT = 0, downX = 0, downY = 0;
      window.addEventListener('pointerdown', (e) => {
        downT = performance.now();
        downX = e.clientX; downY = e.clientY;
        cur.x = e.clientX; cur.y = e.clientY;
        cur.lastMove = downT;
      });
      window.addEventListener('pointerup', (e) => {
        const drift = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (performance.now() - downT < 300 && drift < 9) {
          pulses.push({ x: e.clientX, y: e.clientY, born: performance.now() });
          if (pulses.length > config.pulseSlots) pulses.shift();
        }
      });

      let raf = 0;
      let lastNow = performance.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) lastNow = performance.now();
      });
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        cancelAnimationFrame(raf);
      });
      canvas.addEventListener('webglcontextrestored', () => {
        if (initGL()) { resize(); raf = requestAnimationFrame(loop); }
      });

      function loop(now) {
        const dt = Math.min(0.05, (now - lastNow) / 1000);
        lastNow = now;
        render(now, dt);
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
    },
  };
})();
