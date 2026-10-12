// ── Landscape theme — a night meadow drawn in colored ASCII ───────────────
// Every cell of a monospace grid is one glyph chosen by a procedural
// material. Grass leans with a wind field (| / \ ' , `), a generated castle
// sits on the horizon in front of a dense treeline, flowers and fireflies dot
// the meadow, a campfire throws warm light over the grass around it, and a
// lake along the bottom mirrors the skyline through wave jitter. Weather
// rolls through on a slow noise clock: rain streaks slant with the wind,
// splash where they land, veil the moon and stars, and flash with lightning
// when it's heavy.
//
// Rendering: fillText per cell is too slow at this density, so every
// (glyph, color) pair is pre-rendered once into an atlas and cells are
// drawImage'd from it. The sky/treeline/castle backdrop is static and cached
// on an offscreen canvas; only the meadow, water, and effects redraw per
// frame. Everything is sized and drawn in device pixels so glyphs stay crisp.
//
// Pointer: hover parts the grass and brightens the water; tap rings outward —
// a wind burst through the meadow, a ripple that breaks the reflection on
// the lake. Fireflies drift toward the cursor.
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

  const config = {
    fontPx: 13, mobileFontPx: 10, mobileBreakpoint: 720,
    bg: '#05070c',
    horizon: 0.36,                       // castle base / treeline foot, fraction of height
    shore: 0.70,                         // waterline, fraction of height
    moon: { x: 0.80, y: 0.11, r: 2.4 },  // r in rows
    castleX: 0.5,
    campfire: { x: 0.24, y: 0.66, r: 8.5 }, // y = fraction of the meadow band; r = light radius in rows
    wind: { scale: 0.09, speed: 0.55, gust: 0.6 },
    cursorRadius: 150,                   // css px
    rippleSpeed: 240, rippleDecay: 0.94, rippleBand: 26,
    fireflies: 16, firefliesMobile: 9,
    cellsPerDrop: 40, dropsMax: 420,     // rain pool size scales with the grid
    font: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  };

  // Color ramps, dark → bright. The atlas holds every ramp twice: once as is,
  // once tinted and dimmed for the lake reflection.
  const RAMPS = {
    star:   ['#3f4858', '#78839a', '#c9d1de', '#ffffff'],
    moon:   ['#5c5a4c', '#8f8b74', '#d4ceae', '#f1ebd2'],
    trees:  ['#0f181c', '#152329', '#1b2f36', '#223d44', '#2b4c53'],
    stone:  ['#303947', '#46515f', '#5f6b80', '#7f8ca3', '#a3b0c5'],
    face:   ['#151c27', '#1b2534', '#222e40', '#2a384d'],
    window: ['#5d4416', '#a8792a', '#e2b347', '#ffd977'],
    fire:   ['#6e2609', '#b94a17', '#ec8428', '#ffc451', '#fff2b0'],
    wood:   ['#3d2a1a', '#5c4028'],
    flag:   ['#6e1b26', '#b42f3f'],
    grass:  ['#0e2113', '#16321c', '#1e4525', '#2a5b30', '#36733b', '#45894a', '#58a357', '#71bd68'],
    warm:   ['#2a3418', '#45521f', '#657026', '#8a8f33', '#ad9f42', '#cfae4e'],
    white:  ['#7f7f7f', '#f2f2f2'],
    cream:  ['#857f5f', '#f5e8a3'],
    pink:   ['#7d5566', '#e8a0c0'],
    lilac:  ['#625a7d', '#b9a6e6'],
    red:    ['#7a3838', '#e86a6a'],
    fly:    ['#5e6b26', '#aabf3f', '#e4f283'],
    water:  ['#0b1726', '#102338', '#17334f', '#20476b', '#2f6289', '#4b84ad'],
    sand:   ['#3f3c31', '#5e5a47'],
    rain:   ['#2f3744', '#4c5666', '#7b8798'],
  };
  const FLOWERS = ['white', 'cream', 'pink', 'lilac', 'red'];
  const palette = [];
  const OFF = {};
  for (const name in RAMPS) { OFF[name] = palette.length; for (const c of RAMPS[name]) palette.push(c); }
  const WATER_TINT = [26, 58, 88];
  const reflected = palette.map((hex) => {
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const mixv = (c, w) => ((c * 0.55 + w * 0.45) * 0.52) | 0;
    return `rgb(${mixv(r, WATER_TINT[0])},${mixv(g, WATER_TINT[1])},${mixv(b, WATER_TINT[2])})`;
  });

  const GLYPHS = ['|', '/', '\\', "'", '"', ',', '.', '`', '~', '-', '_', '=', '*', 'o', '+', 'x',
    '@', 'O', '0', '%', '&', '#', 'M', 'W', '8', 'Q', '$', 'n', '^', '[', ']', '<', '>', '(', ')', ':', ';', '!'];
  const G = {};
  GLYPHS.forEach((ch, k) => { G[ch] = k; });
  const TREE_TEX = ['%', '&', '#', '@', 'M', 'W', '8', '$'];
  const FACE_TEX = ['%', '&', '#', '@', '$', '8', 'Q', '0'];
  const FLAME = ['*', '^', "'", '"'];

  // The castle is built, not hand-typed: a keep flanked by two towers, curtain
  // walls between them, low outer walls at the ends. s = 1 on phones, 2 on
  // wide screens (wider and taller so it still reads on a fine grid). The
  // left half and the keep are drawn, then mirrored, so it is symmetric by
  // construction. | _ n ^ [ ] are stone; w = window, * = torch, > = flag,
  // g = the dark gate opening.
  function buildCastle(s) {
    const keepW = 11 + 8 * (s - 1), towerW = 7 + 4 * (s - 1);
    const curtainW = 6 + 4 * (s - 1), outerW = 6 + 3 * (s - 1);
    const H = 16 + 3 * (s - 1);
    const keepTop = 2, towerTop = 5 + (s - 1), curtainTop = 8 + (s - 1), outerTop = 9 + 2 * (s - 1);
    const W = 2 * (outerW + towerW + curtainW) + keepW;
    const g = [];
    for (let r = 0; r < H; r++) g.push(Array(W).fill(' '));
    const put = (r, c, str) => { for (let k = 0; k < str.length; k++) g[r][c + k] = str[k]; };
    const cren = (w) => { let str = ''; for (let k = 0; k < w; k++) str += k % 2 === 0 ? '_' : 'n'; return str; };
    const t0 = outerW, c0 = outerW + towerW, k0 = outerW + towerW + curtainW;
    const mid = k0 + (keepW >> 1);
    // tower + keep: crenellated roof and two walls
    for (const [x0, w, top] of [[t0, towerW, towerTop], [k0, keepW, keepTop]]) {
      put(top, x0, cren(w));
      for (let r = top + 1; r < H - 1; r++) { g[r][x0] = '|'; g[r][x0 + w - 1] = '|'; }
    }
    // curtain + outer walls: roof only (their sides are the neighbours'), end post
    put(curtainTop, c0, cren(curtainW));
    put(outerTop, 0, cren(outerW));
    for (let r = outerTop + 1; r < H - 1; r++) g[r][0] = '|';
    // base
    for (let c = 0; c < W; c++) g[H - 1][c] = '_';
    for (const c of [0, t0, t0 + towerW - 1, k0, k0 + keepW - 1]) g[H - 1][c] = '|';
    // windows
    const archRow = H - 4 - (s - 1);
    for (let r = keepTop + 2; r < archRow; r += 3) put(r, mid - 1, '[w]');
    const tmid = t0 + (towerW >> 1);
    for (let r = towerTop + 2; r < H - 2; r += 4) put(r, tmid - 1, '[w]');
    for (let r = outerTop + 2; r < H - 1; r += 2) g[r][outerW >> 1] = 'w';
    // gate: arch, posts, dark opening, torches either side
    const half = (3 + 2 * (s - 1) >> 1) + 1;
    put(archRow, mid - half, '_'.repeat(half) + '^' + '_'.repeat(half));
    for (let r = archRow + 1; r < H; r++) {
      g[r][mid - half] = '|'; g[r][mid + half] = '|';
      if (r < H - 1) for (let c = mid - half + 1; c < mid + half; c++) g[r][c] = 'g';
    }
    g[archRow + 1][mid - half - 1] = '*';
    // mirror the left half onto the right, then raise the flag
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < mid; c++) {
        const ch = g[r][c];
        g[r][W - 1 - c] = ch === '[' ? ']' : ch === ']' ? '[' : ch;
      }
    }
    g[0][mid] = '|'; g[0][mid + 1] = '>'; g[1][mid] = '|';
    return g.map((r) => r.join(''));
  }

  // Per-cell deterministic randomness. s = salt, so one cell can draw
  // several independent values.
  function hash(i, j, s) {
    let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(s, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  // iOS WebKit detection + scroll runway — mirrors the ascii theme and the
  // @supports (-webkit-touch-callout) scope in the shell CSS.
  const IS_IOS = !!(window.CSS && CSS.supports && CSS.supports('-webkit-touch-callout', 'none'));
  const IOS_RUNWAY = 80;
  function canvasHeight() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;';
    document.body.appendChild(el);
    const lvh = el.offsetHeight;
    el.remove();
    const screenH = IS_IOS && window.screen ? window.screen.height || 0 : 0;
    return Math.max(window.innerHeight, lvh || 0, screenH) + (IS_IOS ? IOS_RUNWAY : 0);
  }

  function buildAtlas(cw, ch, fontD) {
    const cv = document.createElement('canvas');
    cv.width = GLYPHS.length * cw;
    cv.height = palette.length * 2 * ch;
    const c = cv.getContext('2d');
    c.font = `${fontD}px ${config.font}`;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    for (let p = 0; p < palette.length * 2; p++) {
      c.fillStyle = p < palette.length ? palette[p] : reflected[p - palette.length];
      const y = p * ch + ch * 0.5 + 1;
      for (let g = 0; g < GLYPHS.length; g++) c.fillText(GLYPHS[g], g * cw + cw * 0.5, y);
    }
    return cv;
  }

  class Landscape {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.noise = createNoise3D();
      this.t = 0;
      this.frame = 0;
      this.ripples = [];
      this.zone = null;
      this.sparks = [];
      this.splashes = [];
      this.shoot = null;
      this.flash = 0;
      this.rain = 0;
      this.windBias = 0;
      this.fireFlick = 1;
      this.resize();
    }

    // Rect (+padding) the meadow thins around, in css px (converted here).
    setZone(cx, cy, hw, hh, fade = 90) {
      const d = this.dpr;
      this.zone = { cx: cx * d, cy: cy * d, hw: hw * d, hh: hh * d, fade: fade * d };
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = canvasHeight();
      this.dpr = dpr;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.W = this.canvas.width;
      this.H = this.canvas.height;
      this.mobile = w < config.mobileBreakpoint;
      const fontD = Math.round((this.mobile ? config.mobileFontPx : config.fontPx) * dpr);
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${fontD}px ${config.font}`;
      this.cw = Math.max(4, Math.round(ctx.measureText('M').width));
      this.ch = Math.max(6, Math.round(fontD * 1.12));
      this.cols = Math.ceil(this.W / this.cw) + 1;
      this.rows = Math.ceil(this.H / this.ch) + 1;
      this.atlas = buildAtlas(this.cw, this.ch, fontD);
      const atlas = this.atlas, cw = this.cw, ch = this.ch;
      this.put = (g, c, x, y) => ctx.drawImage(atlas, g * cw, c * ch, cw, ch, x, y, cw, ch);
      this.buildScene();
      // Grid stats, readable from devtools (the zone is re-measured by the shell).
      this.canvas.dataset.grid = `${this.cols}x${this.rows} cell=${cw}x${ch} dpr=${dpr} castle=${this.scale}`;
    }

    buildScene() {
      const { cols, rows, cw, ch } = this;
      const n = cols * rows;
      const noise = this.noise;
      this.sGlyph = new Uint8Array(n);   // 0 = empty, else glyph index + 1
      this.sColor = new Uint16Array(n);
      this.dGlyph = new Uint8Array(n);   // per-frame copy + dynamic overlays, read by the reflection
      this.dColor = new Uint16Array(n);
      this.horizon = Math.round(rows * config.horizon);
      this.shore = Math.round(rows * config.shore);
      const horizon = this.horizon;

      // Treeline height and waterline wobble, per column.
      this.skyline = new Int16Array(cols);
      this.shoreAt = new Int16Array(cols);
      for (let i = 0; i < cols; i++) {
        const a = noise(i * 0.06, 0.5, 0) * 0.5 + 0.5;
        const b = noise(i * 0.25, 3.5, 0) * 0.5 + 0.5;
        this.skyline[i] = horizon - (1 + Math.floor(a * 6 + b * 2.5));
        this.shoreAt[i] = this.shore + Math.round(noise(i * 0.05, 7.5, 0) * 1.6);
      }

      this.moon = { i: Math.round(cols * config.moon.x), j: Math.round(rows * config.moon.y), r: config.moon.r };

      // Castle placement + silhouette mask (interior cells get a stone-face
      // texture; sky shows between the towers above the curtain walls).
      const s = cols >= 110 && horizon >= 20 ? 2 : 1;
      this.scale = s;
      const CASTLE = buildCastle(s);
      const cwid = CASTLE[0].length, chgt = CASTLE.length;
      const ci0 = Math.round(cols * config.castleX - cwid / 2);
      const cj0 = horizon - chgt;
      this.windows = []; this.torches = []; this.flag = null;
      const mask = new Uint8Array(n);
      const colTop = new Int16Array(cwid).fill(999);
      for (let r = 0; r < chgt; r++) for (let c = 0; c < cwid; c++) if (CASTLE[r][c] !== ' ' && colTop[c] === 999) colTop[c] = r;
      const stoneSet = '|_n^[]';
      for (let r = 0; r < chgt; r++) {
        const row = CASTLE[r];
        for (let c = 0; c < cwid; c++) {
          const i = ci0 + c, j = cj0 + r;
          if (i < 0 || i >= cols || j < 0 || j >= rows) continue;
          const chr = row[c];
          const idx = j * cols + i;
          let solid = chr !== ' ';
          if (!solid) {
            const left = row.slice(0, c).trim().length > 0;
            const right = row.slice(c + 1).trim().length > 0;
            solid = left && right && r > colTop[c];
          }
          if (!solid) continue;
          mask[idx] = 1;
          const h = hash(i, j, 20), h2 = hash(i, j, 21);
          if (stoneSet.indexOf(chr) >= 0) {
            // Moonlit from the right (the moon hangs there), darker at the base.
            const k = 3 + (c > cwid / 2 ? 1 : 0) - (h < 0.3 ? 1 : 0) - (r === chgt - 1 ? 1 : 0);
            this.sGlyph[idx] = G[chr] + 1;
            this.sColor[idx] = OFF.stone + clamp(k, 0, 4);
          } else if (chr === 'w') {
            this.windows.push({ i, j, phase: h * 10, lit: h2 < 0.72 });
          } else if (chr === '*') {
            this.torches.push({ i, j });
          } else if (chr === '>') {
            this.flag = { i: i - 1, j };          // pole column; the pennant flies to either side
          } else if (chr === 'g') {
            // gate opening: stays dark
          } else if (h < 0.62) {
            this.sGlyph[idx] = G[FACE_TEX[(h2 * 8) | 0]] + 1;
            this.sColor[idx] = OFF.face + ((h * 5) | 0) % 4;
          }
        }
      }
      this.castleMask = mask;

      // Treeline: dense dark texture from the skyline down to the horizon.
      for (let i = 0; i < cols; i++) {
        for (let j = this.skyline[i]; j < horizon; j++) {
          if (j < 0) continue;
          const idx = j * cols + i;
          if (mask[idx]) continue;
          const h = hash(i, j, 30);
          if (h < 0.08) continue;
          const lit = noise(i * 0.12, j * 0.2, 1) * 0.5 + 0.5;
          const k = Math.round(lit * 2.5) + (j - this.skyline[i] < 1 ? 1 : 0) - (h < 0.3 ? 1 : 0);
          this.sGlyph[idx] = G[TREE_TEX[(hash(i, j, 31) * 8) | 0]] + 1;
          this.sColor[idx] = OFF.trees + clamp(k, 0, 3);
        }
      }

      // Stars: hashed into the open sky.
      this.stars = [];
      const m = this.moon, ar = cw / ch;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < this.skyline[i]; j++) {
          const h = hash(i, j, 40);
          if (h > 0.012 || mask[j * cols + i]) continue;
          const dx = (i - m.i) * ar, dy = j - m.j;
          if (dx * dx + dy * dy < (m.r + 1.5) * (m.r + 1.5)) continue;
          this.stars.push({ i, j, phase: hash(i, j, 41) * 6.283, speed: 0.6 + hash(i, j, 42) * 1.6, b: 0.4 + (h / 0.012) * 0.6 });
        }
      }

      // Cache the static backdrop (treeline + castle stone) once.
      const back = document.createElement('canvas');
      back.width = this.W; back.height = this.H;
      const bctx = back.getContext('2d');
      const atlas = this.atlas;
      for (let j = 0; j < horizon; j++) {
        for (let i = 0; i < cols; i++) {
          const idx = j * cols + i;
          const g = this.sGlyph[idx];
          if (!g) continue;
          bctx.drawImage(atlas, (g - 1) * cw, this.sColor[idx] * ch, cw, ch, i * cw, j * ch, cw, ch);
        }
      }
      this.backdrop = back;

      // Campfire in the meadow, low-left so it never crowds the words.
      const span = this.shore - horizon;
      this.fire = {
        i: Math.round(cols * config.campfire.x),
        j: horizon + Math.round(span * config.campfire.y),
        r: config.campfire.r * (s === 2 ? 1.5 : 1),
        w: s,
      };

      // Fireflies wander the meadow band.
      this.fireflies = [];
      const nf = this.mobile ? config.firefliesMobile : config.fireflies;
      for (let k = 0; k < nf; k++) {
        this.fireflies.push({
          x: Math.random() * cols, y: horizon + 2 + Math.random() * (span - 4),
          phase: Math.random() * 6.283, seed: Math.random() * 100,
        });
      }

      // Rain drops: a fixed pool, a rain-proportional share of which is live.
      this.drops = [];
      const nd = Math.min(config.dropsMax, Math.round((cols * rows) / config.cellsPerDrop));
      for (let k = 0; k < nd; k++) this.drops.push({ on: false, x0: 0, y0: 0, y: 0, land: 0, speed: 30, len: 2 });
      this.sparks.length = 0;
      this.splashes.length = 0;
    }

    addRipple(x, y) {
      // x, y in css page px → device px
      this.ripples.push({ x: x * this.dpr, y: y * this.dpr, t: 0, alpha: 1 });
    }

    // Soft void around the text: returns 0..1 (1 = fully inside).
    zoneK(xc, yc, zb) {
      const z = this.zone;
      if (!z) return 0;
      const zdx = Math.max(0, Math.abs(xc - z.cx) - (z.hw + zb));
      const zdy = Math.max(0, Math.abs(yc - z.cy) - (z.hh + zb));
      const zd = Math.sqrt(zdx * zdx + zdy * zdy);
      return zd < z.fade ? 1 - zd / z.fade : 0;
    }

    render(dt, cursor, still) {
      const ctx = this.ctx;
      const { W, H, cols, dpr } = this;
      this.t += dt / 1000;
      this.frame++;
      const t = this.t;
      const noise = this.noise;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = config.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this.backdrop, 0, 0);
      const skyN = this.horizon * cols;
      this.dGlyph.set(this.sGlyph.subarray(0, skyN));
      this.dColor.set(this.sColor.subarray(0, skyN));

      // Weather clock: rain fades in when the slow noise crests.
      const wn = noise(t * 0.016, 0, 4) * 0.5 + 0.5;
      this.rain = still ? 0 : smooth(0.5, 0.7, wn);
      this.windBias = noise(t * 0.045, 2, 5) * 0.5 + this.rain * 0.45;
      this.fireFlick = 0.78 + 0.22 * (noise(t * 3.1, 0, 2) * 0.5 + 0.5);

      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.t += dt / 1000;
        r.alpha *= Math.pow(config.rippleDecay, dt / 16);
        if (r.alpha < 0.025) this.ripples.splice(i, 1);
      }

      const cx = cursor.x * dpr, cy = cursor.y * dpr;
      this.drawSky(dt);
      this.drawCastle();
      this.drawMeadow(cx, cy, cursor.active, cursor.vx);
      this.drawFire(dt);
      this.drawFireflies(dt, cx, cy, cursor.active);
      this.drawWater(cx, cy, cursor.active);
      this.drawRain(dt);
    }

    drawSky(dt) {
      const { cols, cw, ch, put, dGlyph, dColor } = this;
      const t = this.t, rain = this.rain;
      // Moon: drawn live so rain can veil it.
      const m = this.moon, ar = cw / ch;
      const span = Math.ceil(m.r / ar) + 1;
      const veil = rain > 0.7 ? 2 : rain > 0.35 ? 1 : 0;
      for (let j = m.j - Math.ceil(m.r) - 1; j <= m.j + Math.ceil(m.r) + 1; j++) {
        for (let i = m.i - span; i <= m.i + span; i++) {
          if (i < 0 || i >= cols || j < 0) continue;
          const dx = (i - m.i) * ar, dy = j - m.j;
          const d = Math.sqrt(dx * dx + dy * dy) / m.r;
          if (d > 1) continue;
          const edge = d > 0.74;
          const k = clamp((edge ? 2 : 3) - veil - (hash(i, j, 50) < 0.12 ? 1 : 0), 0, 3);
          const g = edge ? G['o'] : (hash(i, j, 51) < 0.5 ? G['@'] : G['O']);
          put(g, OFF.moon + k, i * cw, j * ch);
          const idx = j * cols + i;
          dGlyph[idx] = g + 1; dColor[idx] = OFF.moon + k;
        }
      }
      // Stars twinkle; rain clouds them over.
      const stars = this.stars;
      for (let s = 0; s < stars.length; s++) {
        const st = stars[s];
        const b = st.b * (0.55 + 0.45 * Math.sin(t * st.speed + st.phase)) * (1 - rain * 0.9);
        if (b < 0.12) continue;
        const k = b > 0.75 ? 3 : b > 0.5 ? 2 : b > 0.3 ? 1 : 0;
        const g = b > 0.8 ? G['*'] : b > 0.5 ? G['+'] : G['.'];
        put(g, OFF.star + k, st.i * cw, st.j * ch);
        if (k >= 2) { const idx = st.j * cols + st.i; dGlyph[idx] = g + 1; dColor[idx] = OFF.star + k; }
      }
      // A shooting star now and then, clear nights only.
      if (!this.shoot && rain < 0.3 && Math.random() < dt * 0.00006) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.shoot = { x: Math.random() * cols, y: 1 + Math.random() * (this.horizon * 0.35), vx: dir * 0.055, vy: 0.012, life: 0 };
      }
      const sh = this.shoot;
      if (sh) {
        sh.life += dt;
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        for (let q = 0; q < 4; q++) {
          const xi = Math.round(sh.x - sh.vx * q * 14), yj = Math.round(sh.y - sh.vy * q * 14);
          if (xi < 0 || xi >= cols || yj < 0 || yj >= this.skyline[xi]) continue;
          put(q === 0 ? G['*'] : G['.'], OFF.star + (q === 0 ? 3 : 2 - (q >> 1)), xi * cw, yj * ch);
        }
        if (sh.life > 900 || sh.x < -2 || sh.x > cols + 2) this.shoot = null;
      }
    }

    drawCastle() {
      const { cols, cw, ch, put, dGlyph, dColor } = this;
      const t = this.t, noise = this.noise, frame = this.frame;
      for (let w = 0; w < this.windows.length; w++) {
        const win = this.windows[w];
        const idx = win.j * cols + win.i;
        if (!win.lit) { put(G[':'], OFF.face + 2, win.i * cw, win.j * ch); continue; }
        const f = noise(win.phase, t * 2.4, 7) * 0.5 + 0.5;
        const k = 1 + Math.round(f * 2);
        put(G['#'], OFF.window + k, win.i * cw, win.j * ch);
        dGlyph[idx] = G['#'] + 1; dColor[idx] = OFF.window + k;
      }
      for (let q = 0; q < this.torches.length; q++) {
        const tc = this.torches[q];
        const h = hash(tc.i, tc.j, frame >> 2);
        const g = G[FLAME[(h * 4) | 0]];
        const k = 2 + ((h * 100) | 0) % 3;
        put(g, OFF.fire + k, tc.i * cw, tc.j * ch);
        const idx = tc.j * cols + tc.i;
        dGlyph[idx] = g + 1; dColor[idx] = OFF.fire + k;
      }
      const fl = this.flag;
      if (fl) {
        const right = this.windBias >= 0;
        const i = right ? fl.i + 1 : fl.i - 1;
        const flap = noise(t * 3, 0, 8) > 0.35;
        const g = flap ? G[right ? '>' : '<'] : G['-'];
        put(g, OFF.flag + 1, i * cw, fl.j * ch);
        const idx = fl.j * cols + i;
        dGlyph[idx] = g + 1; dColor[idx] = OFF.flag + 1;
      }
    }

    drawMeadow(cx, cy, cActive, vx) {
      const { cols, cw, ch, horizon, shore, noise, put, dpr } = this;
      const t = this.t, rain = this.rain, windBias = this.windBias;
      const fire = this.fire, flick = this.fireFlick;
      const ws = config.wind.scale, wsp = config.wind.speed, gustAmp = config.wind.gust;
      const span = Math.max(1, shore - horizon);
      const R = config.cursorRadius * dpr, R2 = R * R;
      const ripples = this.ripples, nr = ripples.length;
      const rs = config.rippleSpeed * dpr, rb = config.rippleBand * dpr;
      const zb = Math.sin(t * 0.6) * 3 * dpr;
      const hasZone = !!this.zone;
      const gO = OFF.grass, wO = OFF.warm;
      const gI = G['|'], gR = G['/'], gL = G['\\'], sU = G["'"], sR = G[','], sL = G['`'], fS = G['*'], fO = G['o'];
      const fireR = fire.r * ch;
      const maxShore = shore + 3;
      const shoreAt = this.shoreAt;
      const rainDim = 1 - rain * 0.18;

      for (let j = horizon; j < maxShore; j++) {
        const y = j * ch, yc = y + ch * 0.5;
        const depth = Math.min(1, (j - horizon) / span);
        const gustRow = noise(j * 0.09, t * 0.22, 3) * 1.6;
        const rowBase = (0.3 + 0.4 * depth) * rainDim;
        const fdy = (j - fire.j) * ch;
        for (let i = 0; i < cols; i++) {
          if (j >= shoreAt[i]) continue;
          const h = hash(i, j, 1);
          if (h < 0.1) continue;                    // bare patch
          const x = i * cw, xc = x + cw * 0.5;
          const h2 = hash(i, j, 2);
          let lean = noise(i * ws + t * wsp, j * ws * 2.2, t * 0.25) * 1.1 + windBias;
          const gw = Math.sin(i * 0.05 - t * 1.3 + gustRow);
          const gust = gw > 0 ? gw * gw * gw * gustAmp : 0;
          lean += gust;
          if (cActive) {
            const dx = xc - cx, dy = yc - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              const k = 1 - Math.sqrt(d2) / R;
              lean += (dx > 0 ? 1 : -1) * k * k * 1.6 + vx * 0.02 * k;
            }
          }
          for (let r = 0; r < nr; r++) {
            const rp = ripples[r];
            const dx = xc - rp.x, dy = yc - rp.y;
            const ring = Math.abs(Math.sqrt(dx * dx + dy * dy) - rp.t * rs);
            if (ring < rb) lean += (dx > 0 ? 1 : -1) * (1 - ring / rb) * rp.alpha * 1.5;
          }
          let shade = rowBase + 0.18 * (noise(i * 0.035, j * 0.07, t * 0.04) + 1) * 0.5
            + 0.2 * Math.min(1, Math.abs(lean)) + gust * 0.4;
          if (hasZone) {
            const kf = this.zoneK(xc, yc, zb);
            if (kf > 0) {
              if (hash(i, j, 3) < kf * kf * 1.15) continue;
              shade *= 1 - kf * 0.6;
            }
          }
          let warm = 0;
          const fdx = (i - fire.i) * cw;
          const fd = Math.sqrt(fdx * fdx + fdy * fdy) / fireR;
          if (fd < 1) warm = (1 - fd) * (1 - fd) * flick;

          const short = h < 0.36;
          let g, col;
          if (h2 < 0.04 && !short) {
            // flower
            const ramp = OFF[FLOWERS[((h2 * 1000) | 0) % 5]];
            const pulse = Math.sin(t * 1.1 + h * 6.283) > -0.35 ? 1 : 0;
            col = ramp + (warm > 0.1 ? 1 : pulse);
            g = ((h2 * 10000) | 0) % 10 < 7 ? fS : fO;
          } else {
            if (warm > 0.1) {
              col = wO + clamp(Math.round((shade * 0.5 + warm * 0.9) * 5), 0, 5);
            } else {
              let k = clamp(Math.round(shade * 7), 0, 7);
              if (short) k = Math.max(0, k - 1);
              col = gO + k;
            }
            if (short) g = Math.abs(lean) < 0.3 ? sU : (lean > 0 ? sR : sL);
            else g = Math.abs(lean) < 0.22 ? gI : (lean > 0 ? gR : gL);
          }
          put(g, col, x, y);
        }
      }
    }

    drawFire(dt) {
      const { cw, ch, put, cols } = this;
      const f = this.fire, frame = this.frame, windBias = this.windBias;
      const s = f.w;
      for (let di = -s; di <= s; di++) put(G['_'], OFF.wood + (di === 0 ? 0 : 1), (f.i + di) * cw, f.j * ch);
      const lean = Math.round(windBias * 1.4);
      for (let r = 1; r <= s + 2; r++) {
        const j = f.j - r;
        const shift = r >= 2 ? lean : 0;
        const w = Math.max(0, s + 1 - r);
        const keep = r === 1 ? 1 : r === 2 ? 0.72 : r === 3 ? 0.45 : 0.3;
        for (let di = -w; di <= w; di++) {
          const i = f.i + di + shift;
          const h = hash(i, j, 60 + (frame >> 2));
          if (h > keep) continue;
          const g = G[FLAME[(h * 4) | 0]];
          const k = r === 1 ? 4 - (h > 0.6 ? 1 : 0) : r === 2 ? 3 - (h > 0.5 ? 1 : 0) : Math.max(1, 5 - r);
          put(g, OFF.fire + k, i * cw, j * ch);
        }
      }
      // Sparks: lift off, drift with the wind, cool and fade.
      if (Math.random() < dt * 0.004) {
        this.sparks.push({ x: f.i + (Math.random() - 0.5) * 2, y: f.j - 2, life: 0, seed: Math.random() * 50 });
      }
      for (let s2 = this.sparks.length - 1; s2 >= 0; s2--) {
        const sp = this.sparks[s2];
        sp.life += dt;
        sp.y -= dt * 0.004;
        sp.x += (windBias * 0.003 + this.noise(sp.seed, sp.life * 0.002, 9) * 0.004) * dt;
        if (sp.life > 1300 || sp.y < 0) { this.sparks.splice(s2, 1); continue; }
        const i = Math.round(sp.x), j = Math.round(sp.y);
        if (i < 0 || i >= cols) continue;
        put(G['.'], OFF.fire + (sp.life < 500 ? 3 : sp.life < 900 ? 2 : 1), i * cw, j * ch);
      }
    }

    drawFireflies(dt, cx, cy, cActive) {
      const { cw, ch, put, cols, horizon, shore } = this;
      const t = this.t, noise = this.noise;
      if (this.rain > 0.55) return;              // they hide from the rain
      const k = dt / 16;
      const lo = horizon + 2, hi = shore - 2;
      const cursorIn = cActive && cy > horizon * ch && cy < shore * ch;
      const zb = 0;
      for (let f = 0; f < this.fireflies.length; f++) {
        const fl = this.fireflies[f];
        fl.x += noise(fl.seed, t * 0.35, 20) * 0.05 * k;
        fl.y += noise(fl.seed + 50, t * 0.35, 21) * 0.03 * k;
        if (cursorIn) {
          fl.x += (cx / cw - fl.x) * 0.0015 * k;
          fl.y += (cy / ch - fl.y) * 0.0015 * k;
        }
        if (fl.x < 0) fl.x += cols; else if (fl.x >= cols) fl.x -= cols;
        if (fl.y < lo) fl.y = lo; else if (fl.y > hi) fl.y = hi;
        const pulse = (Math.sin(t * 1.9 + fl.phase) + 1) * 0.5;
        if (pulse < 0.42) continue;
        const i = Math.round(fl.x), j = Math.round(fl.y);
        if (this.zoneK(i * cw + cw * 0.5, j * ch + ch * 0.5, zb) > 0.5) continue;
        put(pulse > 0.8 ? G['*'] : G['.'], OFF.fly + (pulse > 0.8 ? 2 : pulse > 0.6 ? 1 : 0), i * cw, j * ch);
      }
    }

    drawWater(cx, cy, cActive) {
      const { cols, rows, cw, ch, horizon, shore, noise, put, dpr, dGlyph, dColor } = this;
      const t = this.t, rain = this.rain, frame = this.frame;
      const depthRows = Math.max(1, rows - shore);
      const moonI = this.moon.i;
      const glitterAmp = 0.5 * (1 - rain * 0.85);
      const wO = OFF.water, sdO = OFF.sand, PL = palette.length;
      const gW = G['~'], gD = G['-'], gU = G['_'], gP = G['.'];
      const R = config.cursorRadius * dpr, R2 = R * R;
      const ripples = this.ripples, nr = ripples.length;
      const rs = config.rippleSpeed * dpr, rb = config.rippleBand * dpr;
      const zb = Math.sin(t * 0.6) * 3 * dpr;
      const hasZone = !!this.zone;
      const shoreAt = this.shoreAt;
      const shimmer = frame >> 4;

      for (let j = shore - 3; j < rows; j++) {
        if (j < 0) continue;
        const y = j * ch, yc = y + ch * 0.5;
        const d = j - shore;
        const jit = Math.round(noise(j * 0.33, t * 0.28, 9) * 1.7);
        // Mirror: the shoreline shows the castle base; deeper rows climb the
        // towers and reach the moon, as if the meadow weren't in between.
        const srcRow = horizon - 1 - d;
        for (let i = 0; i < cols; i++) {
          const sa = shoreAt[i];
          if (j < sa) continue;
          const x = i * cw, xc = x + cw * 0.5;
          if (j === sa) {
            const hs = hash(i, j, 4);
            if (hs < 0.25) continue;
            put(hs < 0.6 ? gU : gP, sdO + (hs > 0.85 ? 1 : 0), x, y);
            continue;
          }
          const dd = j - sa;
          let v = noise(i * 0.045 + t * 0.3, j * 0.3, t * 0.1) * 0.5 + 0.5;
          const gx = (i - moonI) / 7;
          v += Math.exp(-gx * gx) * glitterAmp * (0.6 + 0.4 * noise(i * 0.4, t * 1.5, 12));
          let jx = jit;
          for (let r = 0; r < nr; r++) {
            const rp = ripples[r];
            const dx = xc - rp.x, dy = (yc - rp.y) * 1.6;   // rings foreshorten on the water
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ring = Math.abs(dist - rp.t * rs);
            if (ring < rb) {
              const k = (1 - ring / rb) * rp.alpha;
              v += k * 0.9;
              jx += Math.round(k * 3 * Math.sin(dist * 0.1));
            }
          }
          if (cActive) {
            const dx = xc - cx, dy = (yc - cy) * 1.6;
            const d2 = dx * dx + dy * dy;
            if (d2 < R2) { const k = 1 - Math.sqrt(d2) / R; v += k * k * 0.5; }
          }
          if (hasZone) {
            const kf = this.zoneK(xc, yc, zb);
            if (kf > 0) {
              if (hash(i, j, 3) < kf * kf * 1.15) continue;
              v *= 1 - kf * 0.6;
            }
          }
          if (srcRow >= 0 && v < 0.62) {
            const si = i + jx;
            if (si >= 0 && si < cols) {
              const idx = srcRow * cols + si;
              const g = dGlyph[idx];
              if (g && hash(i, j, 5 + shimmer) > 0.2 + (dd / depthRows) * 0.6) {
                put(g - 1, dColor[idx] + PL, x, y);
                continue;
              }
            }
          }
          let k = v > 0.68 ? 5 : v > 0.56 ? 4 : v > 0.46 ? 3 : v > 0.36 ? 2 : v > 0.28 ? 1 : -1;
          if (k < 0) continue;
          k -= Math.floor((dd / depthRows) * 2.2);
          if (k < 0) continue;
          const g = v > 0.56 ? gW : v > 0.42 ? gD : v > 0.34 ? gU : gP;
          put(g, wO + k, x, y);
        }
      }
    }

    drawRain(dt) {
      const { cols, rows, cw, ch, horizon, put } = this;
      const rain = this.rain, windBias = this.windBias;
      const drops = this.drops;
      const hasZone = !!this.zone;
      const active = Math.floor(drops.length * rain);
      const slant = windBias * 0.9;              // columns per row
      const g = slant > 0.25 ? G['/'] : slant < -0.25 ? G['\\'] : G['|'];
      const respawn = (d) => {
        d.y0 = -2 - Math.random() * 10;
        d.y = d.y0;
        d.x0 = Math.random() * (cols + Math.abs(slant) * rows) - (slant > 0 ? slant * rows : 0);
        d.land = horizon + Math.random() * (rows - horizon);
        d.speed = 28 + Math.random() * 14;
        d.len = 2 + (Math.random() < 0.5 ? 1 : 0);
      };
      for (let k = 0; k < drops.length; k++) {
        const d = drops[k];
        if (!d.on) {
          if (k >= active) continue;
          d.on = true;
          respawn(d);
          d.y = d.y0 + Math.random() * rows;     // scatter through the sky on fade-in
        }
        d.y += d.speed * dt * 0.001;
        const x = d.x0 + (d.y - d.y0) * slant;
        if (d.y >= d.land) {
          const li = Math.round(x);
          if (li >= 0 && li < cols) this.splashes.push({ i: li, j: Math.round(d.land), t: 0 });
          if (k >= active) { d.on = false; continue; }
          respawn(d);
          continue;
        }
        for (let q = 0; q < d.len; q++) {
          const yy = Math.round(d.y) - q, xx = Math.round(x - q * slant);
          if (yy < 0 || yy >= d.land || xx < 0 || xx >= cols) continue;
          if (hasZone && this.zoneK(xx * cw + cw * 0.5, yy * ch + ch * 0.5, 0) > 0.45) continue;
          put(g, OFF.rain + (q === 0 ? 2 : 1), xx * cw, yy * ch);
        }
      }
      // Splashes: a drop lands, a ring opens, it's gone.
      for (let s = this.splashes.length - 1; s >= 0; s--) {
        const sp = this.splashes[s];
        sp.t += dt;
        if (sp.t > 420) { this.splashes.splice(s, 1); continue; }
        const inWater = sp.j > this.shoreAt[sp.i];
        const x = sp.i * cw, y = sp.j * ch;
        if (hasZone && this.zoneK(x + cw * 0.5, y + ch * 0.5, 0) > 0.45) continue;
        if (sp.t < 110) put(G['o'], OFF.rain + 2, x, y);
        else if (sp.t < 300) {
          if (!inWater) put(G['o'], OFF.rain + 1, x, y);
          if (sp.i > 0) put(G['('], OFF.rain + 2, x - cw, y);
          if (sp.i < cols - 1) put(G[')'], OFF.rain + 2, x + cw, y);
        } else {
          if (sp.i > 0) put(G['('], OFF.rain + 0, x - cw, y);
          if (sp.i < cols - 1) put(G[')'], OFF.rain + 0, x + cw, y);
        }
      }
      // Lightning in a downpour.
      if (rain > 0.78 && this.flash === 0 && Math.random() < dt * 0.00022) this.flash = 3;
      if (this.flash > 0) {
        this.ctx.fillStyle = `rgba(190,205,235,${this.flash === 3 ? 0.2 : this.flash === 2 ? 0.07 : 0.12})`;
        this.ctx.fillRect(0, 0, this.W, this.H);
        this.flash--;
      }
    }
  }

  class Input {
    constructor() {
      this.cursor = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, lastT: 0 };
      this.listeners = { ripple: [] };
      this.dragging = false;
      this.pointerDownAt = 0;
      this.pointerDownPos = { x: 0, y: 0 };

      // Page coordinates throughout: the canvas sits at the document origin,
      // and on iOS the document is parked a runway's worth of scroll down.
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
        this.dragging = false;
        // Lifted finger: no hover on touch, so the grass springs back.
        this.cursor.active = false;
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
  }

  window.__themes.landscape = {
    start(content) {
      const canvas = document.createElement('canvas');
      canvas.className = 'bg-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);

      const scene = new Landscape(canvas);
      const input = new Input();
      input.on('ripple', (p) => scene.addRipple(p.x, p.y));

      function measureZone() {
        const r = content.getBoundingClientRect();
        scene.setZone(
          r.left + window.scrollX + r.width / 2,
          r.top + window.scrollY + r.height / 2,
          r.width / 2 + 26,
          r.height / 2 + 18
        );
      }
      if (IS_IOS) {
        const park = () => window.scrollTo(0, IOS_RUNWAY);
        park();
        document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
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

      const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

      let resizeTimer = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          scene.resize();
          measureZone();
          if (still) scene.render(0, input.cursor, true);
        }, 120);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);

      if (still) {
        // One quiet frame: a clear night, no rain, nothing moving.
        scene.t = 30;
        scene.render(0, input.cursor, true);
        return;
      }

      let lastT = performance.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) lastT = performance.now();
      });
      function loop(now) {
        const dt = Math.min(40, now - lastT);
        lastT = now;
        scene.render(dt, input.cursor, false);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    },
  };
})();
