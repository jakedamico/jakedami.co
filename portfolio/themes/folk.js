// Folk: stick figures for River Keep. Each figure is a small skeleton posed
// in world units. Its bones are drawn as ASCII strokes (| / \ -), chosen by
// each bone's projected direction and spaced by the font's measured ink, so
// limbs meet at their joints in any pose. Bodies, walking and wandering live
// here; the scene supplies ground and walkability, projects the marks and
// draws them with its own glyph sheets.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const wrap = a => a - TAU * Math.floor((a + Math.PI) / TAU);

  // Bone lengths in world units. At the scene's scale a figure stands about
  // 4.3 units (24px) from feet to the centre of its head.
  const RIG = { thigh:.95, shin:.95, torso:1.55, head:.85, shoulder:.22, upper:.8, lower:.75 };
  // Angles are radians from hanging straight down; positive swings toward
  // the figure's heading. Lower bones (aL, bL, aS, bS) are relative to their
  // parent. Splay spreads the paired limbs sideways.
  const KEYS = ['lean','aU','aL','bU','bL','aT','aS','bT','bS','armSplay','legSplay'];
  const POSES = {
    rest:  { lean:0,   aU:.10, aL:.10, bU:-.10, bL:.10, aT:.08, aS:0,   bT:-.08, bS:0,   armSplay:.42, legSplay:.32 },
    // One hand held out to the fire, the other at the side.
    warm:  { lean:.05, aU:.75, aL:.85, bU:-.30, bL:.15, aT:.30, aS:-.05,bT:-.28, bS:-.12,armSplay:.18, legSplay:.38 },
    // Both hands out.
    warm2: { lean:.08, aU:.80, aL:.75, bU:.65,  bL:.85, aT:.28, aS:-.04,bT:-.26, bS:-.10,armSplay:.12, legSplay:.38 },
    // Both hands on a rod held out over the water.
    fish:  { lean:.06, aU:.62, aL:.55, bU:.45,  bL:.80, aT:.26, aS:-.06,bT:-.22, bS:-.10,armSplay:.10, legSplay:.36 },
  };
  const WALK = { stride:.42, knee:.70, arm:.45, cycle:2.6 };
  const LIMBS = [['hip','neck'],['shoulder','elbowA','handA'],['shoulder','elbowB','handB'],['hip','kneeA','footA'],['hip','kneeB','footB']];
  // A fishing rod rides in hand A; its line runs from the tip to the bobber.
  const ROD = { length:3.0, lift:.75, limbs:[Object.assign(['handA','rodTip'], { tone:'rod' }), Object.assign(['rodTip','bob'], { tone:'line' })] };
  const STROKES = ['-','/','|','\\'];

  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function blend(a, b, t, out = {}) {
    for (const k of KEYS) out[k] = mix(a[k], b[k], t);
    return out;
  }

  // Measures each stroke glyph's ink, the same way the scene's sheets draw
  // it (centred, middle baseline), so strokes can be placed by their ink
  // rather than their cell. `ox, oy` is the ink centre's offset from the
  // draw point; `len` and `angle` describe the stroke itself.
  function measure(font) {
    const k = 4, size = parseFloat(font.match(/([\d.]+)px/)[1]);
    const w = Math.ceil(size * k * 2), h = w;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.font = font.replace(/([\d.]+)px/, (_, n) => n * k + 'px');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    const out = {};
    for (const ch of [...STROKES, 'o', '.']) {
      c.clearRect(0, 0, w, h);
      c.fillText(ch, w / 2, h / 2);
      const px = c.getImageData(0, 0, w, h).data;
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] < 110) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) { x0 = x1 = w / 2; y0 = y1 = h / 2; }
      const vx = ch === '|' ? 0 : (x1 - x0 + 1) / k, vy = ch === '-' ? 0 : (y1 - y0 + 1) / k;
      out[ch] = {
        ox: ((x0 + x1 + 1) / 2 - w / 2) / k, oy: ((y0 + y1 + 1) / 2 - h / 2) / k,
        len: Math.hypot(vx, vy),
        angle: ch === '-' ? 0 : ch === '|' ? Math.PI / 2 : ch === '/' ? Math.atan2(vy, vx) : Math.PI - Math.atan2(vy, vx),
      };
    }
    cv.width = cv.height = 0;
    return out;
  }

  // spec: {x, z, y?, heading, seed, palette, brightness, home?: {x, z, r},
  // clips?: [pose names], rod?: {x, z}}. With a home the figure wanders;
  // without one it stays put and drifts between its clips. A rod's x, z is
  // where its bobber sits on the water.
  function create(spec, world) {
    const random = rng(spec.seed || 1);
    const fig = {
      x: spec.x, z: spec.z, y: spec.y ?? world.height(spec.x, spec.z), lift: spec.lift ?? .12,
      heading: spec.heading || 0, speed: 0, maxSpeed: spec.speed || 1.4, phase: random() * TAU,
      home: spec.home || null, palette: spec.palette || 'cloth', brightness: spec.brightness || .85,
      clips: spec.clips || ['rest'], clip: 0, next: 0, fade: 1, hold: 0,
      state: 'idle', timer: 1 + random() * 4, target: null,
      pose: {}, random, chars: [],
      rod: spec.rod ? { x: spec.rod.x, z: spec.rod.z, state: 'wait', timer: 4 + random() * 8, clock: 0, lift: ROD.lift, out: 1, dip: 0 } : null,
    };
    if (fig.rod) fig.clips = ['fish'];
    fig.hold = 3 + random() * 6;
    blend(POSES[fig.clips[0]], POSES[fig.clips[0]], 0, fig.pose);
    if (fig.home) {
      // Start on open ground: the nearest walkable point to the home.
      for (let r = 0; r <= fig.home.r && !world.walkable(fig.x, fig.z); r += .5) {
        for (let a = 0; a < TAU; a += .4) {
          const x = fig.home.x + Math.cos(a) * r, z = fig.home.z + Math.sin(a) * r;
          if (world.walkable(x, z)) { fig.x = x; fig.z = z; break; }
        }
      }
      fig.y = world.height(fig.x, fig.z) + fig.lift;
    }
    return fig;
  }

  function step(fig, dt, world) {
    const random = fig.random;
    if (fig.route) {
      follow(fig, dt, world);
    } else if (fig.home) {
      if (fig.state === 'idle') {
        fig.timer -= dt;
        if (fig.timer <= 0) {
          fig.target = pick(fig, world);
          if (fig.target) fig.state = 'walk'; else fig.timer = 1 + random() * 2;
        }
        fig.speed = Math.max(0, fig.speed - 3 * dt);
      } else {
        const tx = fig.target.x - fig.x, tz = fig.target.z - fig.z, dist = Math.hypot(tx, tz);
        const turn = wrap(Math.atan2(tz, tx) - fig.heading);
        fig.heading = wrap(fig.heading + clamp(turn, -2.6 * dt, 2.6 * dt));
        // Turn mostly on the spot, and ease into each stop.
        const want = dist < .25 ? 0 : fig.maxSpeed * (Math.abs(turn) > 1 ? .25 : 1) * clamp(dist / 1.4, .3, 1);
        fig.speed += clamp(want - fig.speed, -3 * dt, 1.6 * dt);
        const nx = fig.x + Math.cos(fig.heading) * fig.speed * dt, nz = fig.z + Math.sin(fig.heading) * fig.speed * dt;
        const open = world.walkable(nx, nz);
        if (open) { fig.x = nx; fig.z = nz; }
        if (dist < .25 || !open) { fig.state = 'idle'; fig.timer = 2 + random() * 6; }
      }
      fig.y = world.height(fig.x, fig.z) + fig.lift;
      fig.phase = (fig.phase + fig.speed * dt / WALK.cycle * TAU) % TAU;
    } else if (fig.rod) {
      fish(fig, dt, world);
    } else if (fig.clips.length > 1) {
      fig.hold -= dt;
      if (fig.fade < 1) fig.fade = Math.min(1, fig.fade + dt / .9);
      else if (fig.hold <= 0) {
        fig.clip = fig.next;
        do fig.next = Math.floor(random() * fig.clips.length); while (fig.next === fig.clip);
        fig.fade = 0; fig.hold = 4 + random() * 7;
      }
    }
    pose(fig);
  }

  // Wait for a bite; then either it slips away, or reel in and cast again.
  // `out` is how far the bobber is from the rod tip (0 hanging, 1 on the
  // water); `lift` is the rod's angle above level.
  function fish(fig, dt, world) {
    const rod = fig.rod, random = fig.random;
    rod.clock += dt; rod.timer -= dt;
    const t = rod.clock, done = rod.timer <= 0;
    if (rod.state === 'wait') {
      rod.lift = ROD.lift + Math.sin(t * 1.1) * .03; rod.dip = Math.sin(t * 2.1) * .04;
      if (done) { rod.state = 'bite'; rod.timer = 1.5; world.splash?.(rod.x, rod.z); }
    } else if (rod.state === 'bite') {
      const tug = Math.abs(Math.sin(t * 9));
      rod.lift = ROD.lift - tug * .10; rod.dip = -tug * .28;
      if (done) {
        if (random() < .4) { rod.state = 'wait'; rod.timer = 6 + random() * 10; }
        else { rod.state = 'reel'; rod.timer = 1.6; }
      }
    } else if (rod.state === 'reel') {
      const k = ease(1 - rod.timer / 1.6);
      rod.lift = mix(ROD.lift, ROD.lift + .65, k); rod.out = 1 - k; rod.dip = 0;
      if (done) { rod.state = 'cast'; rod.timer = 1.5; }
    } else {
      // Swing back over the shoulder, whip forward, let the bobber fly.
      const k = 1 - rod.timer / 1.5;
      rod.lift = k < .4 ? mix(ROD.lift + .65, 1.75, ease(k / .4)) : mix(1.75, ROD.lift, ease(clamp((k - .4) / .3)));
      rod.out = ease(clamp((k - .55) / .45));
      if (done) { rod.state = 'wait'; rod.timer = 7 + random() * 12; rod.out = 1; world.splash?.(rod.x, rod.z); }
    }
  }

  // Walk a set route of {x, z} points at an even pace, turning smoothly at
  // each bend. The caller empties fig.route to stop and clears it to resume
  // wandering; world.height decides where the feet land (ramps, decks).
  function follow(fig, dt, world) {
    const route = fig.route;
    fig.speed += clamp((route.length ? fig.maxSpeed : 0) - fig.speed, -3 * dt, 1.6 * dt);
    let move = route.length ? fig.speed * dt : 0;
    while (move > 0 && route.length) {
      const p = route[0], dx = p.x - fig.x, dz = p.z - fig.z, d = Math.hypot(dx, dz);
      if (d <= move) { fig.x = p.x; fig.z = p.z; move -= d; route.shift(); continue; }
      fig.x += dx / d * move; fig.z += dz / d * move; move = 0;
    }
    if (route.length) {
      const turn = wrap(Math.atan2(route[0].z - fig.z, route[0].x - fig.x) - fig.heading);
      fig.heading = wrap(fig.heading + clamp(turn, -3 * dt, 3 * dt));
    }
    fig.y = world.height(fig.x, fig.z) + fig.lift;
    fig.phase = (fig.phase + fig.speed * dt / WALK.cycle * TAU) % TAU;
  }

  // A wander target inside the home circle, reachable in a straight line.
  function pick(fig, world) {
    const random = fig.random, home = fig.home;
    for (let tries = 0; tries < 10; tries++) {
      const a = random() * TAU, r = Math.sqrt(random()) * home.r;
      const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
      const length = Math.hypot(x - fig.x, z - fig.z);
      if (length < 2.5) continue;
      let clear = true;
      for (let s = .5; s <= length && clear; s += .5) clear = world.walkable(mix(fig.x, x, s / length), mix(fig.z, z, s / length));
      if (clear && world.walkable(x, z)) return { x, z };
    }
    return null;
  }

  function pose(fig) {
    const p = fig.pose;
    if (fig.home) blend(POSES.rest, POSES.rest, 0, p);
    else blend(POSES[fig.clips[fig.clip]], POSES[fig.clips[fig.next]], ease(fig.fade), p);
    // Arms follow the rod as it lifts and swings.
    if (fig.rod) { const raise = (fig.rod.lift - ROD.lift) * .7; p.aU += raise; p.bU += raise; }
    const w = clamp(fig.speed / Math.max(.01, fig.maxSpeed * .6));
    if (w > 0) {
      const s = Math.sin(fig.phase), c = Math.cos(fig.phase);
      p.aT = mix(p.aT, WALK.stride * s, w);
      p.bT = mix(p.bT, -WALK.stride * s, w);
      p.aS = mix(p.aS, -WALK.knee * Math.max(0, c), w);
      p.bS = mix(p.bS, -WALK.knee * Math.max(0, -c), w);
      p.aU = mix(p.aU, -WALK.arm * s, w);
      p.bU = mix(p.bU, WALK.arm * s, w);
      p.aL = mix(p.aL, .30, w); p.bL = mix(p.bL, .30, w);
      p.lean = mix(p.lean, .07, w);
      p.legSplay = mix(p.legSplay, .16, w);
      p.armSplay = mix(p.armSplay, .22, w);
    }
  }

  // Forward kinematics: the stance leg (the longer vertical reach) sets the
  // hip's height, so the swing foot lifts and the body bobs as it walks.
  function joints(fig) {
    const p = fig.pose, fx = Math.cos(fig.heading), fz = Math.sin(fig.heading), sx = -fz, sz = fx;
    const dir = (a, b) => [fx * Math.sin(a) * Math.cos(b) + sx * Math.sin(b), -Math.cos(a) * Math.cos(b), fz * Math.sin(a) * Math.cos(b) + sz * Math.sin(b)];
    const add = (o, d, l) => [o[0] + d[0] * l, o[1] + d[1] * l, o[2] + d[2] * l];
    const reach = (t, s, b) => (RIG.thigh * Math.cos(t) + RIG.shin * Math.cos(t + s)) * Math.cos(b);
    const hip = [fig.x, fig.y + Math.max(reach(p.aT, p.aS, p.legSplay), reach(p.bT, p.bS, p.legSplay)), fig.z];
    const up = [fx * Math.sin(p.lean), Math.cos(p.lean), fz * Math.sin(p.lean)];
    const neck = add(hip, up, RIG.torso), head = add(neck, [0, 1, 0], RIG.head * .55), shoulder = add(neck, up, -RIG.shoulder);
    head[0] += up[0] * RIG.head * .45; head[1] += up[1] * RIG.head * .45; head[2] += up[2] * RIG.head * .45;
    const kneeA = add(hip, dir(p.aT, p.legSplay), RIG.thigh), kneeB = add(hip, dir(p.bT, -p.legSplay), RIG.thigh);
    const elbowA = add(shoulder, dir(p.aU, p.armSplay), RIG.upper), elbowB = add(shoulder, dir(p.bU, -p.armSplay), RIG.upper);
    const out = {
      hip, neck, head, shoulder, kneeA, kneeB, elbowA, elbowB,
      footA: add(kneeA, dir(p.aT + p.aS, p.legSplay), RIG.shin), footB: add(kneeB, dir(p.bT + p.bS, -p.legSplay), RIG.shin),
      handA: add(elbowA, dir(p.aU + p.aL, p.armSplay), RIG.lower), handB: add(elbowB, dir(p.bU + p.bL, -p.armSplay), RIG.lower),
    };
    const rod = fig.rod;
    if (rod) {
      const tip = add(out.handA, [fx * Math.cos(rod.lift), Math.sin(rod.lift), fz * Math.cos(rod.lift)], ROD.length);
      // Between hanging under the tip and floating on the water, the
      // bobber flies a low arc.
      const k = rod.out;
      out.rodTip = tip;
      out.bob = [mix(tip[0], rod.x, k), mix(tip[1] - .7, rod.dip, k) + Math.sin(k * Math.PI) * 1.4, mix(tip[2], rod.z, k)];
    }
    return out;
  }

  // The glyphs that draw a figure: {c, t, x, y, d, wx, wy, wz}, where x, y is
  // the draw point that lands the glyph's ink on the bone and t its tone:
  // body, rod, line or bob. Consecutive bones
  // that want the same stroke merge into one run before spacing, so a
  // straight limb reads as one line rather than a dotted one.
  function marks(fig, project, metrics, out = []) {
    out.length = 0;
    const j = joints(fig), screen = {};
    for (const name in j) screen[name] = project(j[name][0], j[name][1], j[name][2]);
    let id = 0;
    for (const limb of fig.rod ? [...LIMBS, ...ROD.limbs] : LIMBS) {
      const tone = limb.tone || 'body';
      const runs = [];
      for (let i = 0; i < limb.length - 1; i++, id++) {
        const a = screen[limb[i]], b = screen[limb[i + 1]];
        const angle = (Math.atan2(a.y - b.y, b.x - a.x) + Math.PI) % Math.PI;
        let best = null, cost = 9;
        for (const ch of STROKES) {
          const gap = Math.abs(angle - metrics[ch].angle), off = Math.min(gap, Math.PI - gap) - (fig.chars[id] === ch ? .13 : 0);
          if (off < cost) { cost = off; best = ch; }
        }
        fig.chars[id] = best;
        const last = runs[runs.length - 1];
        if (last && last.c === best) last.to = i + 1;
        else runs.push({ c: best, from: i, to: i + 1 });
      }
      for (const run of runs) {
        const m = metrics[run.c], a = screen[limb[run.from]], b = screen[limb[run.to]];
        const wa = j[limb[run.from]], wb = j[limb[run.to]];
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / m.len));
        for (let k = 0; k < n; k++) {
          const t = (k + .5) / n, x = mix(a.x, b.x, t) - m.ox, y = mix(a.y, b.y, t) - m.oy;
          // The same stroke a pixel or two from another reads as one thick
          // smudge, not two limbs. Keep the first.
          if (out.some(o => o.c === run.c && o.t === tone && Math.abs(o.x - x) < 2.6 && Math.abs(o.y - y) < m.len * .6)) continue;
          out.push({ c: run.c, t: tone, x, y, d: mix(a.d, b.d, t), wx: mix(wa[0], wb[0], t), wy: mix(wa[1], wb[1], t), wz: mix(wa[2], wb[2], t) });
        }
      }
    }
    const h = screen.head, m = metrics.o;
    out.push({ c: 'o', t: 'body', x: h.x - m.ox, y: h.y - m.oy, d: h.d, wx: j.head[0], wy: j.head[1], wz: j.head[2] });
    if (fig.rod) {
      const b = screen.bob, dot = metrics['.'];
      out.push({ c: '.', t: 'bob', x: b.x - dot.ox, y: b.y - dot.oy, d: b.d, wx: j.bob[0], wy: j.bob[1], wz: j.bob[2] });
    }
    return out;
  }

  window.__folk = { RIG, POSES, measure, create, step, marks, glyphs: ' -/|\\o.' };
})();
