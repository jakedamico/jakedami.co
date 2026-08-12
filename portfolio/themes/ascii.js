// ── ASCII field theme — ported from the war-room backdrop engine ───────────
// (AsciiRenderer + Input + BackgroundField, config baked to the defaults;
// simplex-noise's createNoise3D inlined below.)
//
// The base noise is domain-warped: each sample point first drifts on two
// companion noise fields before the real lookup, so the masses read as smoke
// pulled by currents rather than round blobs.
(function () {
  window.__themes = window.__themes || {};

  // 3D simplex noise (Stefan Gustavson's algorithm, compact port).
  function createNoise3D(random = Math.random) {
    const F3 = 1 / 3, G3 = 1 / 6;
    const grad3 = new Float32Array([
      1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
      1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
      0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1,
    ]);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (random() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }

    return function noise3D(xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3,  y3 = y0 - 1 + 3 * G3,  z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;

      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0;
      else {
        const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0);
      }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0;
      else {
        const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1);
      }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0;
      else {
        const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2);
      }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0;
      else {
        const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
        t3 *= t3;
        n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3);
      }
      return 32 * (n0 + n1 + n2 + n3);
    };
  }

  // Field tuning — war-room backdrop base, re-tuned lava-lamp: bigger blobs
  // (noiseScale down), slower drift (noiseTimeScale down). visibilityThreshold
  // is the black-space knob: cells below it draw nothing, so raising it carves
  // the carpet into slow masses floating in void. Raise for more black.
  const config = {
    cellSize: 12,
    mobileCellSize: 13,
    mobileBreakpoint: 720,
    noiseScale: 0.021,
    // Phones: noiseScale is per-CELL, and a phone fits far fewer cells — at
    // the desktop scale one mass outspans the whole screen ("zoomed in").
    // Higher scale = smaller features, so masses fit the small screen.
    mobileNoiseScale: 0.045,
    noiseTimeScale: 0.00012,
    // Domain warp. warpAmp = how hard the currents pull (higher = wispier,
    // thinner filaments; lower = closer to round blobs). warpBias = flat
    // energy added to give the warped, thinned field its body back.
    warpAmp: 1.25,
    warpBias: 0.05,
    ramp: ' .,:;+*o#',
    cursorBgRadius: 180,
    rippleSpeed: 280,
    rippleDecay: 0.945,
    rippleBand: 34,
    swipeMinSpeed: 1.6,
    bgFont: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    brightnessFloor: 60,
    brightnessCeil: 158,
    visibilityThreshold: 0.5,
  };

  // iOS WebKit detection — mirrors the @supports (-webkit-touch-callout)
  // scope in the shell CSS.
  const IS_IOS = !!(window.CSS && CSS.supports && CSS.supports('-webkit-touch-callout', 'none'));
  // Must match --runway in the shell CSS: the invisible scroll offset that
  // puts real field pixels behind the iOS status bar.
  const IOS_RUNWAY = 80;

  // iOS Safari: window.innerHeight is the SMALL viewport (URL bar visible),
  // so a canvas sized from it stops short of the chrome. On iOS, size to the
  // PHYSICAL screen plus the scroll runway; elsewhere, to max(innerHeight,
  // 100lvh via probe). Extra height is harmless — anchored at the top.
  function canvasHeight() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;';
    document.body.appendChild(el);
    const lvh = el.offsetHeight;
    el.remove();
    const screenH = IS_IOS && window.screen ? window.screen.height || 0 : 0;
    return Math.max(window.innerHeight, lvh || 0, screenH) + (IS_IOS ? IOS_RUNWAY : 0);
  }

  const SCRAMBLE_CHARS = "01!@#$%^&*/\\|<>{}[]+=~?:;.";
  const DISTURB_DECAY = 0.9;
  const SCRAMBLE_MS = 90;
  const SCRAMBLE_RADIUS = 70;
  const SCRAMBLE_MAX_P = 0.35;

  class AsciiRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      // alpha:true on purpose: an opaque canvas lets Chrome use LCD subpixel
      // antialiasing on fillText, which tints dense glyph fields orange/blue.
      // A transparent backing store forces grayscale AA. We still paint our
      // own black every frame, so nothing else changes.
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.noise = createNoise3D();
      this.t = 0;
      this.clock = 0;
      this.ripples = [];
      this.disturbance = 0;
      this.scrambled = [];
      this.zone = null; // soft void the field parts around (the text block)
      this.resize();
    }

    // Rect (+padding) the field flows around. fade = falloff width in px.
    setZone(cx, cy, hw, hh, fade = 96) {
      this.zone = { cx, cy, hw, hh, fade };
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = canvasHeight();
      this.viewport = { width: w, height: h, dpr };
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isMobile = w < config.mobileBreakpoint;
      this.cell = isMobile ? config.mobileCellSize : config.cellSize;
      this.noiseScaleEff = isMobile ? config.mobileNoiseScale : config.noiseScale;
      this.cols = Math.ceil(w / this.cell) + 1;
      this.rows = Math.ceil(h / this.cell) + 1;
      this.ctx.font = `${this.cell - 2}px ${config.bgFont}`;
      this.ctx.textBaseline = 'middle';
      this.ctx.textAlign = 'center';

      this.buckets = new Array(config.ramp.length);
      for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    }

    addRipple(x, y) {
      this.ripples.push({ x, y, t: 0, alpha: 1 });
    }

    kick(amount = 1) {
      this.disturbance = Math.max(this.disturbance, amount);
    }

    render(dt, cursor) {
      const ctx = this.ctx;
      const { width, height } = this.viewport;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      this.t += dt * config.noiseTimeScale * (1 + this.disturbance * 1.4);
      this.clock += dt;
      const scrambleTick = (this.clock / SCRAMBLE_MS) | 0;
      const breath = Math.sin(this.t * 0.18) * 0.05;
      const zoneBreath = Math.sin(this.clock * 0.0006) * 4;

      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.t += dt / 1000;
        r.alpha *= Math.pow(config.rippleDecay, dt / 16);
        if (r.alpha < 0.025) this.ripples.splice(i, 1);
      }

      const ramp = config.ramp;
      const rampMax = ramp.length - 1;
      const cell = this.cell;
      const ns = this.noiseScaleEff;
      const cursorActive = cursor.active;
      const cursorR = config.cursorBgRadius;
      const cursorR2 = cursorR * cursorR;
      const rippleSpeed = config.rippleSpeed;
      const rippleBand = config.rippleBand;
      const minN = config.visibilityThreshold;
      const invSpan = 1 / (1 - minN);
      const warpAmp = config.warpAmp;
      const warpBias = config.warpBias;

      const buckets = this.buckets;
      for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
      const scrambled = this.scrambled;
      scrambled.length = 0;

      const rows = this.rows;
      const cols = this.cols;
      for (let j = 0; j < rows; j++) {
        const y = j * cell;
        for (let i = 0; i < cols; i++) {
          const x = i * cell;
          // Domain warp: the sample point drifts on two companion noise
          // fields before the real lookup — blobs become smoke.
          const wx = this.noise(i * ns + 13.7, j * ns + 7.3, this.t);
          const wy = this.noise(i * ns - 9.2, j * ns + 3.1, this.t);
          let n = this.noise(i * ns + warpAmp * wx, j * ns + warpAmp * wy, this.t) * 0.5 + 0.5 + warpBias;

          let scrambleH = 0;
          if (cursorActive) {
            const dx = x - cursor.x;
            const dy = y - cursor.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < cursorR2) {
              const k = 1 - Math.sqrt(d2) / cursorR;
              n += k * k * 0.45;
            }
            if (d2 < SCRAMBLE_RADIUS * SCRAMBLE_RADIUS) {
              const sk = 1 - Math.sqrt(d2) / SCRAMBLE_RADIUS;
              let h = ((i * 73856093) ^ (j * 19349663) ^ (scrambleTick * 83492791)) >>> 0;
              h = (h ^ (h >>> 13)) >>> 0;
              if (h % 1024 < sk * sk * SCRAMBLE_MAX_P * 1024) scrambleH = h || 1;
            }
          }

          n += this.disturbance * 0.08 + breath;

          // The field parts around the text: full suppression inside the
          // zone's core, smooth quadratic falloff at its edge. The void
          // breathes a few px with the field so it reads as alive, and
          // ripples still wash partway through rather than dying at it.
          let wash = 1;
          if (this.zone) {
            const z = this.zone;
            const zdx = Math.max(0, Math.abs(x - z.cx) - (z.hw + zoneBreath));
            const zdy = Math.max(0, Math.abs(y - z.cy) - (z.hh + zoneBreath));
            const zd = Math.hypot(zdx, zdy);
            if (zd < z.fade) {
              const kf = 1 - zd / z.fade;
              n *= 1 - kf * kf;
              wash = 1 - kf * 0.55;
            }
          }

          for (let k = 0; k < this.ripples.length; k++) {
            const r = this.ripples[k];
            const dx = x - r.x;
            const dy = y - r.y;
            const d = Math.hypot(dx, dy);
            const ring = Math.abs(d - r.t * rippleSpeed);
            if (ring < rippleBand) {
              n += (1 - ring / rippleBand) * r.alpha * 0.55 * wash;
            }
          }

          if (n < minN) continue;
          if (n > 1) n = 1;
          // Restretch what survives the cut across the whole ramp, so a mass
          // still fades ' .,:' at its rim instead of starting mid-ramp and
          // ending in a hard edge against the black.
          const nn = (n - minN) * invSpan;
          const idx = Math.min(rampMax, Math.max(1, (nn * (rampMax + 1)) | 0));
          if (scrambleH) {
            scrambled.push(x, y, scrambleH, idx);
            continue;
          }
          buckets[idx].push(x, y);
        }
      }

      const floor = config.brightnessFloor;
      const range = config.brightnessCeil - floor;
      for (let i = 1; i < buckets.length; i++) {
        const arr = buckets[i];
        if (!arr.length) continue;
        const t = i / rampMax;
        const gray = Math.floor(floor + t * range);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        const ch = ramp[i];
        for (let k = 0; k < arr.length; k += 2) {
          ctx.fillText(ch, arr[k], arr[k + 1]);
        }
      }

      for (let k = 0; k < scrambled.length; k += 4) {
        const gray = Math.floor(floor + (scrambled[k + 3] / rampMax) * range);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        const ch = SCRAMBLE_CHARS[(scrambled[k + 2] >>> 10) % SCRAMBLE_CHARS.length];
        ctx.fillText(ch, scrambled[k], scrambled[k + 1]);
      }

      if (this.disturbance > 0.001) this.disturbance *= Math.pow(DISTURB_DECAY, dt / 16);
      else this.disturbance = 0;
    }
  }

  class Input {
    constructor() {
      this.cursor = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, lastT: 0 };
      this.listeners = { impulse: [], ripple: [] };
      this.dragging = false;
      this.pointerDownAt = 0;
      this.pointerDownPos = { x: 0, y: 0 };

      // Page coordinates throughout (not client): the canvas sits at the
      // document origin, and on iOS the document is parked a runway's worth
      // of scroll down — pageX/Y stays aligned with canvas pixels either way.
      this._onMove = (e) => this.updateCursor(e.pageX, e.pageY);
      this._onDown = (e) => {
        this.updateCursor(e.pageX, e.pageY);
        this.dragging = true;
        this.pointerDownAt = performance.now();
        this.pointerDownPos = { x: e.pageX, y: e.pageY };
      };
      this._onUp = (e) => {
        if (!this.dragging) return;
        const dt = performance.now() - this.pointerDownAt;
        const drift = Math.hypot(e.pageX - this.pointerDownPos.x, e.pageY - this.pointerDownPos.y);
        if (dt < 260 && drift < 8) this.emit('ripple', { x: e.pageX, y: e.pageY });
        else this.maybeImpulse();
        this.dragging = false;
      };
      this._onTouchStart = (e) => {
        if (!e.touches[0]) return;
        const t = e.touches[0];
        Object.assign(this.cursor, { x: t.pageX, y: t.pageY, vx: 0, vy: 0, lastT: performance.now(), active: true });
        this.dragging = true;
        this.pointerDownAt = performance.now();
        this.pointerDownPos = { x: t.pageX, y: t.pageY };
      };
      this._onTouchMove = (e) => {
        if (e.touches[0]) this.updateCursor(e.touches[0].pageX, e.touches[0].pageY);
      };
      this._onTouchEnd = () => {
        const dt = performance.now() - this.pointerDownAt;
        const drift = Math.hypot(this.cursor.x - this.pointerDownPos.x, this.cursor.y - this.pointerDownPos.y);
        if (dt < 260 && drift < 10) this.emit('ripple', { x: this.cursor.x, y: this.cursor.y });
        else this.maybeImpulse();
        this.dragging = false;
      };

      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('mousedown', this._onDown);
      window.addEventListener('mouseup', this._onUp);
      window.addEventListener('touchstart', this._onTouchStart, { passive: true });
      window.addEventListener('touchmove', this._onTouchMove, { passive: true });
      window.addEventListener('touchend', this._onTouchEnd);
      window.addEventListener('touchcancel', this._onTouchEnd);
    }

    on(name, fn) { this.listeners[name].push(fn); }
    emit(name, payload) { for (const fn of this.listeners[name]) fn(payload); }

    updateCursor(x, y) {
      const now = performance.now();
      const last = this.cursor.lastT || now;
      const dt = Math.max(8, now - last);
      const smooth = 0.55;
      const nvx = ((x - this.cursor.x) / dt) * 16;
      const nvy = ((y - this.cursor.y) / dt) * 16;
      this.cursor.vx = this.cursor.vx * (1 - smooth) + nvx * smooth;
      this.cursor.vy = this.cursor.vy * (1 - smooth) + nvy * smooth;
      this.cursor.x = x;
      this.cursor.y = y;
      this.cursor.lastT = now;
      this.cursor.active = true;
    }

    maybeImpulse() {
      if (Math.hypot(this.cursor.vx, this.cursor.vy) < config.swipeMinSpeed) return;
      this.emit('impulse', { x: this.cursor.x, y: this.cursor.y });
    }
  }

  window.__themes.ascii = {
    start(content) {
      // Lifecycle — BackgroundField, inlined.
      const canvas = document.createElement('canvas');
      canvas.className = 'bg-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);

      const bg = new AsciiRenderer(canvas);
      const input = new Input();
      input.on('ripple', (p) => bg.addRipple(p.x, p.y));
      input.on('impulse', (p) => bg.addRipple(p.x, p.y));

      // Tell the renderer where the text block sits so the field parts around
      // it — in page coordinates, to match the canvas at the document origin.
      function measureZone() {
        const r = content.getBoundingClientRect();
        bg.setZone(
          r.left + window.scrollX + r.width / 2,
          r.top + window.scrollY + r.height / 2,
          r.width / 2 + 30,
          r.height / 2 + 22
        );
      }
      // iOS: park the scroll past the runway so Safari composites field
      // pixels behind the status bar, and snap back if the user disturbs it.
      if (IS_IOS) {
        const park = () => window.scrollTo(0, IOS_RUNWAY);
        park();
        // Kill the scroll GESTURE, not the scroll ability: preventDefault on
        // touchmove means the parked offset can never be disturbed — the page
        // feels completely static, yet Safari keeps compositing the scrolled-
        // past field pixels behind the status bar. Taps, the ripple, and link
        // clicks are untouched (only panning is eaten).
        document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        // Safety net: if anything programmatic nudges the offset (rotation,
        // Safari internals), glide it back.
        let parkTimer = 0;
        window.addEventListener('scroll', () => {
          clearTimeout(parkTimer);
          parkTimer = setTimeout(() => {
            if (Math.abs(window.scrollY - IOS_RUNWAY) > 1) park();
          }, 90);
        }, { passive: true });
        window.addEventListener('load', park);
        window.addEventListener('orientationchange', () => setTimeout(park, 200));
      }

      measureZone();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureZone);
      window.addEventListener('load', measureZone);

      let resizeTimer = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { bg.resize(); measureZone(); }, 120);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);

      let lastT = performance.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) lastT = performance.now();
      });

      // A quiet greeting: one kick so the field scrambles-then-settles on load.
      bg.kick(0.6);

      function loop(now) {
        const dt = Math.min(40, now - lastT);
        lastT = now;
        bg.render(dt, input.cursor);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    },
  };
})();
