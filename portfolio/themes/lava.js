// ── Lava theme — a real 3D lava lamp, colored like the thermal shirt ───────
// Same approach as trusktr's "Lume 3D HTML: Lava Lamp" pen (and the classic
// three.js marchingcubes demo it adapts): the blobs are one MarchingCubes
// isosurface over a shared metaball field, so near-passes neck, merge, and
// split like actual wax.
//
// Color is thermal and height-keyed: wax is born yellow-hot at the bottom
// (near the heater light) and cools through orange → magenta → purple → navy
// as it climbs. Ball colors are re-fed to the field every frame, so blobs
// recolor as they rise and the whole scene reads as one consistent gradient.
// The material is mostly self-lit (vertex color into the emissive term) with
// soft matte shading on top — no hard glare.
//
// The text sits on a small glass tile the wax physically cannot cross: a row
// of negative metaballs sized to the tile carves the field, so blobs press
// up against the glass and flow around it.
//
// ES module — needs http(s), not file:// (boot falls back to plain paper).
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const config = {
  blobs: 14, blobsMobile: 9,
  resolution: 84, resolutionMobile: 56, // field voxels per axis
  mobileBreakpoint: 720,
  subtract: 12, isolation: 20,          // lower isolation = fatter, gooier blobs
  strengthMin: 0.45, strengthMax: 0.95, // per-blob size spread (relative)
  speed: 1,                             // global time scale; periods below are seconds
  riseMin: 55, riseMax: 110,            // rise+fall cycle; heavier blobs get the slow end
  loiter: 1.7,                          // tanh shaping — dwell at the top/bottom turnarounds
  yAmp: [0.28, 0.38],                   // vertical travel in field units (volume is 0..1)
  xWanderAmp: [0.04, 0.1], xWanderPeriod: [40, 80],
  zAmp: [0.08, 0.16], zWanderPeriod: [50, 90],
  // Height-keyed thermal ramp (t = 0 bottom … 1 top), sampled per frame.
  ramp: [
    [0.00, '#f7d84b'], // yellow — hottest, at the heater
    [0.18, '#f5a623'], // amber
    [0.38, '#ef5a3a'], // orange
    [0.58, '#c62a7e'], // magenta
    [0.78, '#6b2d86'], // purple
    [1.00, '#3b2d6e'], // navy — coolest, at the top
  ],
  rampJitter: 0.07,                     // per-blob temperature offset, for variety
  paper: '#f2efe9',
  // Self-glow: vertex color added to the emissive term. This carries the
  // color; lights only sculpt the form. Higher = flatter + brighter.
  glow: 0.42,
  // The glass tile behind the text. Void strength/reach auto-fit to the
  // measured text rect; the multipliers tune standoff distance and firmness.
  textBox: { pad: 26, depth: 3, voidFit: 2.0, voidStrength: 1.25 },
  // Pointer = a cold draft that disperses the wax. Repulsion scales with
  // pointer speed and drags a short fading wake along the swipe path; hold
  // still and the lava heals back around you.
  wake: { strength: 1.1, speedRef: 1.2, easeIn: 6, easeOut: 1.6, trailMs: 500, trailEvery: 60, trailMax: 4 },
  // Tap/click = a blob swells out of nothing and sinks away, colored by the
  // temperature at that height.
  pulseSlots: 3,
  pulse: { strength: 0.9, dur: 2.6 },
  // Camera leans a touch with the pointer — cheap, honest parallax.
  sway: { x: 2.2, y: 1.6, ease: 2.5 },
  camera: { fov: 40, dist: 30 },
  // Volume half-extents as fractions of the visible frustum at z=0.
  volume: { x: 0.55, y: 0.62, z: 0.35 },
  // Matte wax: no clearcoat, high roughness, faint environment — the glare
  // lives and dies here. Glow does the color work.
  material: { roughness: 0.55, clearcoat: 0, envMapIntensity: 0.18 },
  glass: { roughness: 0.14, transmission: 0.95, thickness: 1.2, ior: 1.45, envMapIntensity: 0.5 },
  keyLight: { color: '#fffaf0', intensity: 1.1 },
  underLight: { color: '#ff6a1e', intensity: 300 }, // the heater, physical-decay units
  ambient: { color: '#fff4e4', intensity: 1.0 },
  dprMax: 1.75,
};

const rand = (a, b) => a + Math.random() * (b - a);
const randIn = (r) => rand(r[0], r[1]);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const TWO_PI = Math.PI * 2;

function makeBlobs(count) {
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const sMul = rand(config.strengthMin, config.strengthMax);
    // Mass matters: heavier blobs ride the slow end of the rise range.
    const heft = (sMul - config.strengthMin) / (config.strengthMax - config.strengthMin);
    blobs.push({
      sMul,
      color: new THREE.Color(),
      jitter: rand(-config.rampJitter, config.rampJitter),
      bx: 0.12 + 0.76 * ((i + 0.5) / count) + rand(-0.35, 0.35) / count,
      yAmp: randIn(config.yAmp),
      risePeriod: (config.riseMin + heft * (config.riseMax - config.riseMin)) * rand(0.92, 1.08),
      risePhase: rand(0, 1),
      wxAmp: randIn(config.xWanderAmp),
      wxPeriod: randIn(config.xWanderPeriod),
      wxPhase: rand(0, 1),
      zAmp: randIn(config.zAmp),
      wzPeriod: randIn(config.zWanderPeriod),
      wzPhase: rand(0, 1),
    });
  }
  return blobs;
}

export function start(content) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    console.error('lava: WebGL unavailable', e);
    return; // paper + text stand alone
  }
  // Neutral (Khronos PBR) preserves hue/saturation; ACES washed the palette out.
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const isMobile = window.innerWidth < config.mobileBreakpoint;
  const numBlobs = isMobile ? config.blobsMobile : config.blobs;
  const resolution = isMobile ? config.resolutionMobile : config.resolution;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.paper);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 1, 300);
  camera.position.z = config.camera.dist;

  // Soft studio reflections without shipping any texture files.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(config.ambient.color, config.ambient.intensity));
  const key = new THREE.DirectionalLight(config.keyLight.color, config.keyLight.intensity);
  key.position.set(-14, 18, 18); // upper left, same as the 2D themes' light
  scene.add(key);
  const heater = new THREE.PointLight(config.underLight.color, config.underLight.intensity);
  scene.add(heater); // positioned below the volume in resize()

  // Opaque on purpose: the wax must render into the transmission buffer so
  // the glass tile actually shows blobs sliding behind it.
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0,
    ...config.material,
  });
  // Self-glow: feed the vertex color into the emissive term so the wax reads
  // as lit from within — saturated everywhere, shaded on top.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance += vColor.rgb * ${config.glow.toFixed(3)};
      #endif`
    );
  };

  const effect = new MarchingCubes(resolution, material, false, true, 160000);
  effect.isolation = config.isolation;
  scene.add(effect);

  // The glass tile the text sits on. Sized from the measured text rect.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, ...config.glass })
  );
  scene.add(glass);

  const blobs = makeBlobs(numBlobs);
  const strengthBase = 1.2 / ((Math.sqrt(numBlobs) - 1) / 4 + 1);

  // ── thermal ramp ──
  const rampStops = config.ramp.map(([t, hex]) => [t, new THREE.Color(hex)]);
  function rampColor(t, out) {
    t = clamp01(t);
    for (let i = 1; i < rampStops.length; i++) {
      if (t <= rampStops[i][0]) {
        const [t0, c0] = rampStops[i - 1];
        const [t1, c1] = rampStops[i];
        return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
      }
    }
    return out.copy(rampStops[rampStops.length - 1][1]);
  }
  // Field y → ramp t. Blobs live in roughly y 0.12..0.88 (three.js y-up).
  const heightT = (fy) => clamp01((fy - 0.12) / 0.76);
  const pulseColor = new THREE.Color();

  // ── viewport-fitting ──
  let visW = 1, visH = 1;
  const voidBalls = []; // {x, y, s} — the carve that makes room for the glass
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.dprMax));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    visH = 2 * config.camera.dist * Math.tan((config.camera.fov / 2) * Math.PI / 180);
    visW = visH * camera.aspect;
    effect.scale.set(visW * config.volume.x, visH * config.volume.y, visH * config.volume.z);
    heater.position.set(0, -visH * 0.75, 6);
  }

  function measure() {
    const r = content.getBoundingClientRect();
    const perPx = visH / window.innerHeight;
    const bw = (r.width + config.textBox.pad * 2) * perPx;
    const bh = (r.height + config.textBox.pad * 2) * perPx;
    glass.scale.set(bw, bh, config.textBox.depth);
    glass.position.set(0, 0, 0); // text is centered; so is the tile

    // Carve: a row of negative balls whose reach ends just past the glass
    // edge, so wax presses against the tile instead of avoiding the region.
    voidBalls.length = 0;
    const fieldHW = (bw / 2) / (2 * effect.scale.x);
    const fieldHH = (bh / 2) / (2 * effect.scale.y);
    const reach = fieldHH * config.textBox.voidFit;
    const s = config.subtract * reach * reach * config.textBox.voidStrength;
    const n = Math.min(5, Math.max(3, Math.round(fieldHW / reach * 2)));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      voidBalls.push({ x: 0.5 + t * Math.max(0, fieldHW - reach * 0.4), y: 0.5, s: -s });
    }
  }

  // ── input ──
  // The wake: repulsion follows the pointer, scaled by how fast it moves.
  const wake = { x: 0.5, y: 0.5, w: 0, target: 0, lastMove: -1e9, px: 0, py: 0, pt: 0, speed: 0 };
  const trail = []; // recent pointer samples, each a fading repulsor
  const sway = { x: 0, y: 0, tx: 0, ty: 0 };
  const pulses = [];

  // Pointer px → metaball field coords (volume spans [-scale, scale] at z≈0).
  function toField(clientX, clientY) {
    const ndcX = (clientX / window.innerWidth) * 2 - 1;
    const ndcY = 1 - (clientY / window.innerHeight) * 2;
    return {
      x: Math.min(0.96, Math.max(0.04, (ndcX * visW / 2) / (2 * effect.scale.x) + 0.5)),
      y: Math.min(0.96, Math.max(0.04, (ndcY * visH / 2) / (2 * effect.scale.y) + 0.5)),
    };
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    window.addEventListener('pointermove', (e) => {
      const now = performance.now();
      const dt = Math.max(8, now - (wake.pt || now));
      const v = Math.hypot(e.clientX - wake.px, e.clientY - wake.py) / dt; // px/ms
      wake.speed = wake.speed * 0.6 + v * 0.4;
      wake.px = e.clientX; wake.py = e.clientY; wake.pt = now;
      wake.lastMove = now;
      wake.target = clamp01(wake.speed / config.wake.speedRef);
      const f = toField(e.clientX, e.clientY);
      wake.x = f.x; wake.y = f.y;
      const last = trail[trail.length - 1];
      if (!last || now - last.t > config.wake.trailEvery) {
        trail.push({ x: f.x, y: f.y, t: now });
        if (trail.length > config.wake.trailMax) trail.shift();
      }
      sway.tx = (e.clientX / window.innerWidth) * 2 - 1;
      sway.ty = 1 - (e.clientY / window.innerHeight) * 2;
    });
    let downT = 0, downX = 0, downY = 0;
    window.addEventListener('pointerdown', (e) => {
      downT = performance.now(); downX = e.clientX; downY = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      const drift = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (performance.now() - downT < 300 && drift < 9) {
        pulses.push({ ...toField(e.clientX, e.clientY), born: performance.now() });
        if (pulses.length > config.pulseSlots) pulses.shift();
      }
    });
  }

  // ── the field ──
  const loiterNorm = Math.tanh(config.loiter);
  function updateField(t, now) {
    effect.reset();

    for (const v of voidBalls) {
      effect.addBall(v.x, v.y, 0.5, v.s, config.subtract);
    }

    for (const b of blobs) {
      // Buoyancy: a tanh-shaped sine loiters at the extremes — blobs dwell
      // at the bottom, rise, dwell at the top, sink.
      const shaped = Math.tanh(Math.sin(TWO_PI * (t / b.risePeriod + b.risePhase)) * config.loiter) / loiterNorm;
      const y = 0.5 + b.yAmp * shaped;
      const x = b.bx + Math.sin(TWO_PI * (t / b.wxPeriod + b.wxPhase)) * b.wxAmp;
      const z = 0.5 + Math.sin(TWO_PI * (t / b.wzPeriod + b.wzPhase)) * b.zAmp;
      rampColor(heightT(y) + b.jitter, b.color);
      effect.addBall(x, y, z, strengthBase * b.sMul, config.subtract, b.color);
    }

    // The wake: a moving cold draft. Fast swipes carve a trench through the
    // wax along the pointer path; the trench heals as the samples fade.
    if (wake.w > 0.02) {
      effect.addBall(wake.x, wake.y, 0.5, -strengthBase * config.wake.strength * wake.w, config.subtract);
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const age = (now - trail[i].t) / config.wake.trailMs;
      if (age >= 1) { trail.splice(i, 1); continue; }
      const s = strengthBase * config.wake.strength * wake.w * 0.55 * (1 - age);
      if (s > 0.01) effect.addBall(trail[i].x, trail[i].y, 0.5, -s, config.subtract);
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const age = (now - pulses[i].born) / 1000 / config.pulse.dur;
      if (age >= 1) { pulses.splice(i, 1); continue; }
      const s = strengthBase * config.pulse.strength * Math.sin(Math.PI * age);
      rampColor(heightT(pulses[i].y), pulseColor);
      effect.addBall(pulses[i].x, pulses[i].y, 0.5, s, config.subtract, pulseColor);
    }

    effect.update();
  }

  function render(now, dt) {
    const t = (now / 1000) * config.speed;

    const active = now - wake.lastMove < 120;
    if (!active) wake.target = 0;
    const rate = wake.target > wake.w ? config.wake.easeIn : config.wake.easeOut;
    wake.w += (wake.target - wake.w) * (1 - Math.exp(-dt * rate));

    const k = 1 - Math.exp(-dt * config.sway.ease);
    sway.x += (sway.tx - sway.x) * k;
    sway.y += (sway.ty - sway.y) * k;
    camera.position.x = sway.x * config.sway.x;
    camera.position.y = sway.y * config.sway.y;
    camera.lookAt(0, 0, 0);

    updateField(t, now);
    renderer.render(scene, camera);
  }

  // ── lifecycle ──
  resize();
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); measure(); if (reduced) render(45000, 0.016); }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  if (reduced) {
    render(45000, 0.016); // one still frame of the lamp
    return;
  }

  let lastNow = performance.now();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastNow = performance.now();
  });

  function loop(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    render(now, dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
