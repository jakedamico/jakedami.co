// ── Landscape 3D (shelved) — the three.js take on the landscape theme ──────
// Kept selectable as ?theme=landscape3d; the grid-drawn landscape.js is the
// live one.
// ── Landscape theme — a night meadow, rendered in 3D and drawn in ASCII ────
// A real scene — castle, treeline, pond, moon, campfire — seen from a raised,
// angled camera, the way an isometric-ish game shows its world. It is rendered
// two ways at once, which is what gives ASCII-filtered renders their look:
//
//   Solid geometry (ground, castle, trees, water, moon, stars) is rendered by
//   three.js into a tiny buffer, one texel per character cell, with each
//   material tagging its texels (stone, foliage, water…). A full-screen shader
//   then turns every cell into one glyph: the material picks the glyph set,
//   the lit brightness picks how dense a glyph, the texel's color tints it.
//   Walls come out as grid-aligned glyph texture, shaded by real lights.
//
//   Everything thin or alive — grass blades, flowers, rain, fireflies, sparks,
//   flames — is a glyph sprite standing in the same 3D space: a small quad
//   textured with one character, lit per blade, leaning with the wind, scaled
//   by perspective, depth-tested against the solid scene so the castle hides
//   what's behind it. Those don't sit on the grid; near ones are big, far ones
//   are specks.
//
// Weather rolls through on a slow noise clock: rain slants with the wind and
// splashes where it lands, clouds veil the moon and stars, lightning flashes
// in a downpour, fireflies hide until it passes. The pond mirrors the castle
// and moon through its waves. Hover parts the grass; a tap sends a gust ring
// through the meadow and a ripple across the water.
//
// ES module — needs http(s), not file:// (boot falls back to plain text).
import * as THREE from 'three';

const config = {
  fontPx: 12, mobileFontPx: 9, mobileBreakpoint: 720,
  bg: '#05070c',
  dprMax: 2,
  // Eye 20 up, 30 back, looking down ~27°: the castle sits in the upper third,
  // a band of sky shows above the treeline, the pond runs off the bottom.
  camera: { pos: [0, 20, 30], target: [0, 0, -10], fov: 45, fovPortrait: 62 },
  world: { zFar: -62, zNear: 40 },        // the ground slab; beyond it is sky
  castle: { z: -20 },                     // base line of the walls (front faces toward +z)
  pond: { x: 0, z: 12, rx: 18, rz: 6 },
  fire: { screenX: 0.22, screenY: 0.68 }, // placed by unprojecting this screen spot
  moonScreen: { x: 0.8, y: 0.09, r: 2.3 },// screen fraction, radius in rows
  grass: { density: 1.6, max: 40000, farBias: 1.4, height: 0.85 },
  flowers: 0.012,                         // share of blades that are flowers
  rain: { max: 900 },
  fireflies: 22, sparks: 40, flames: 10,
  wind: { base: 0.35 },
  moon: { color: '#c3cfe8', intensity: 6.0, dir: [0.55, 1, 0.35] },
  ambient: { color: '#2a3550', intensity: 1.2 },
  fireLight: { color: '#ff9a3a', intensity: 160 },
  torchLight: { color: '#ffb05a', intensity: 45 },
  font: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// ── glyph sets for the solid pass, dark → bright; a material's ID picks one ──
const SETS = [
  ' .+*',           // 0 sky (stars)
  ' .,:',           // 1 ground
  ' .:-=+%&#@$8',   // 2 stone
  ' .,;%&#@MW8',    // 3 foliage
  ' ._-~=',         // 4 water
  " .'^*#",         // 5 warm emissive (windows, torches)
  ' .oO@',          // 6 moon
  ' .:|#',          // 7 wood
];
const GAIN = [1.0, 1.2, 1.6, 1.3, 1.45, 1.1, 1.0, 1.3];
const ID = { sky: 0, ground: 0.1, stone: 0.2, foliage: 0.3, water: 0.4, warm: 0.5, moon: 0.6, wood: 0.7 };
// sprite glyphs (index = position in this string)
const SPRITE_GLYPHS = "|/\\',`*o.^\"_-()";
const SG = {};
for (let i = 0; i < SPRITE_GLYPHS.length; i++) SG[SPRITE_GLYPHS[i]] = i;

// 3D simplex noise (Stefan Gustavson's algorithm, compact port) — drives
// the weather clock and light flicker on the CPU.
function createNoise3D(random = Math.random) {
  const F3 = 1 / 3, G3 = 1 / 6;
  const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (random() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
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
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else { const g = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else { const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else { const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else { const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const rand = (a, b) => a + Math.random() * (b - a);

// A strip of glyphs rendered white-on-black; shaders read the red channel.
function makeGlyphAtlas(glyphs, cw, ch, fontPx) {
  const cv = document.createElement('canvas');
  cv.width = glyphs.length * cw;
  cv.height = ch;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff';
  c.font = `${fontPx}px ${config.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  for (let i = 0; i < glyphs.length; i++) c.fillText(glyphs[i], i * cw + cw * 0.5, ch * 0.5 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Tag a built-in material's output alpha with its glyph-set ID. The solid
// pass writes alpha straight to the buffer (no blending), so the ASCII pass
// can read the material back per cell.
function tagged(material, id) {
  material.blending = THREE.NoBlending;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>\n  gl_FragColor.a = ${id.toFixed(3)};`
    );
  };
  // three caches programs by the hook's source text, which is identical for
  // every id — without this, all tagged materials would share one program
  // (and one id).
  material.customProgramCacheKey = () => 'ascii-id-' + id;
  return material;
}

// ── the ASCII pass ──
const ASCII_VERT = `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ASCII_FRAG = `
precision highp float;
in vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tGlyphs;
uniform vec2 uGrid;       // cols, rows
uniform vec2 uCell;       // cell size in device px
uniform float uGlyphN;    // glyphs in the atlas
uniform int uSetOff[8];
uniform int uSetLen[8];
uniform float uGain[8];
uniform vec4 uZone;       // cx, cy (gl coords, device px), hw, hh
uniform float uZoneFade;
uniform vec3 uBg;
uniform vec3 uMoon;       // cx, cy (gl px), radius px
uniform float uTime;
uniform float uRain;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 cuv = (cell + 0.5) / uGrid;
  vec4 s = texture(tScene, cuv);
  s.rgb = pow(max(s.rgb, 0.0), vec3(1.0 / 2.2));   // the scene renders linear
  int set = int(s.a * 10.0 + 0.5);
  if (set == 0) {
    // sky: the moon and stars live here, in screen space, veiled by rain
    vec2 cc = (cell + 0.5) * uCell;
    vec2 md = (cc - uMoon.xy) / uMoon.z;
    md.y *= uCell.y / uCell.x * 0.5;
    float mdl = length(md);
    if (mdl < 1.0) {
      set = 6;
      float edge = smoothstep(1.0, 0.72, mdl);
      s.rgb = vec3(0.93, 0.9, 0.78) * (0.55 + 0.45 * edge) * (1.0 - uRain * 0.75);
    } else {
      float hs = hash(cell + 3.0);
      if (hs < 0.03) {
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + hash(cell + 5.0) * 1.6) + hash(cell + 9.0) * 6.28);
        s.rgb = vec3(0.85, 0.88, 0.95) * (0.5 + 0.6 * (hs / 0.03)) * tw * (1.0 - uRain * 0.9);
      }
    }
  }
  float L = dot(s.rgb, vec3(0.3, 0.59, 0.11));
  // a little per-cell grain so flat lit surfaces still read as texture
  L *= 0.82 + 0.36 * hash(cell);
  // the words sit in a thinned pocket
  vec2 zd = max(vec2(0.0), abs(gl_FragCoord.xy - uZone.xy) - uZone.zw);
  float zdist = length(zd);
  float kf = zdist < uZoneFade ? 1.0 - zdist / uZoneFade : 0.0;
  if (hash(cell + 7.0) < kf * kf * 1.15) L = 0.0;
  L *= 1.0 - kf * 0.6;
  float g = clamp(L * uGain[set], 0.0, 0.999);
  int n = uSetLen[set];
  int k = int(g * float(n));
  if (k <= 0) { fragColor = vec4(uBg, 1.0); return; }
  int gi = uSetOff[set] + k;
  vec2 inCell = fract(gl_FragCoord.xy / uCell);
  vec2 guv = vec2((float(gi) + inCell.x) / uGlyphN, inCell.y);
  float a = texture(tGlyphs, guv).r;
  // hue from the render, brightness carried mostly by glyph density
  float mx = max(max(s.r, s.g), max(s.b, 0.18));
  vec3 col = (s.rgb / mx) * (0.42 + 0.58 * clamp(g * 1.3, 0.0, 1.0));
  fragColor = vec4(mix(uBg, col, a), 1.0);
}`;

// ── the sprite pass: every blade, flower, drop, firefly, spark and flame ──
const SPRITE_VERT = `
in vec3 aPos;
in vec4 aRand;
in float aKind;
out vec2 vUv;
out vec3 vCol;
out float vA;
uniform float uTime;
uniform float uWind;      // wind bias (signed)
uniform float uRain;
uniform vec4 uCursor;     // x, z, radius, strength
uniform vec4 uBursts[3];  // x, z, t0, unused
uniform vec3 uCamRight;
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec3 uAmbient;
uniform vec4 uLights[3];  // xyz, intensity
uniform vec3 uLightCol[3];
uniform vec3 uFire;
uniform vec4 uShadow;     // cx, cz, rx, rz
uniform vec4 uZone;
uniform float uZoneFade;
uniform vec2 uRes;
uniform float uGlyphN;
uniform float uBladeH;
uniform vec3 uFog;
float hash1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float kind = aKind;
  vec3 base = aPos;
  float w = 0.0, h = 0.0, lean = 0.0, alpha = 1.0, yoff = 0.0;
  int glyph = 0;
  vec3 col = vec3(0.0);
  bool lit = false;
  if (kind < 0.5 || (kind > 0.5 && kind < 1.5)) {
    // grass and flowers share the wind
    float wind = sin(base.x * 0.12 + uTime * 1.1 + aRand.x * 6.28) * 0.5
               + sin(base.z * 0.2 - uTime * 0.8 + aRand.y * 3.0) * 0.35;
    float gust = pow(max(0.0, sin(base.x * 0.06 - uTime * 1.3 + sin(base.z * 0.1 + uTime * 0.2) * 1.6)), 3.0);
    lean = wind * 1.1 + gust * 0.7 + uWind;
    vec2 d = base.xz - uCursor.xy;
    float dl = length(d);
    float ck = clamp(1.0 - dl / uCursor.z, 0.0, 1.0);
    lean += sign(d.x) * ck * ck * 1.6 * uCursor.w;
    for (int i = 0; i < 3; i++) {
      vec4 b = uBursts[i];
      float age = uTime - b.z;
      if (age < 0.0 || age > 2.4) continue;
      vec2 dd = base.xz - b.xy;
      float dist = length(dd);
      float ring = abs(dist - age * 9.0);
      float k = (1.0 - smoothstep(0.0, 2.6, ring)) * exp(-age * 1.3);
      lean += sign(dd.x) * k * 1.8;
    }
    lit = true;
    if (kind < 0.5) {
      float isShort = step(aRand.z, 0.3);
      h = mix(uBladeH, uBladeH * 0.45, isShort) * (0.7 + 0.6 * aRand.w);
      w = h * 0.48;
      float al = abs(lean);
      if (isShort > 0.5) glyph = al < 0.3 ? ${SG["'"]} : (lean > 0.0 ? ${SG[',']} : ${SG['`']});
      else glyph = al < 0.25 ? ${SG['|']} : (lean > 0.0 ? ${SG['/']} : ${SG['\\']});
      col = mix(vec3(0.14, 0.36, 0.16), vec3(0.46, 0.78, 0.38), 0.2 + 0.7 * aRand.x);
      col *= mix(0.75, 1.0, isShort);
      // tips catch the moon, and blades leaning into it
      col *= 0.8 + 0.25 * clamp(lean, 0.0, 1.0) + gust * 0.5;
    } else {
      h = uBladeH * 0.45;
      w = h * 1.0;
      yoff = uBladeH * 0.6;
      glyph = aRand.z < 0.7 ? ${SG['*']} : ${SG['o']};
      float fc = aRand.w * 5.0;
      col = fc < 1.0 ? vec3(0.95, 0.95, 0.95) : fc < 2.0 ? vec3(0.96, 0.91, 0.64) : fc < 3.0 ? vec3(0.91, 0.63, 0.75)
          : fc < 4.0 ? vec3(0.73, 0.65, 0.90) : vec3(0.91, 0.42, 0.42);
      col *= 0.8 + 0.3 * sin(uTime * 1.1 + aRand.x * 6.28);
    }
  } else if (kind < 2.5) {
    // rain: a drop falls from above the eye to its spot, then splashes
    if (aRand.w > uRain) alpha = 0.0;
    float period = 1.1 + aRand.z * 0.5;
    float p = fract(uTime / period + aRand.y);
    if (p < 0.86) {
      float yy = 24.0 * (1.0 - p / 0.86);
      base = aPos + vec3(uWind * yy * 0.35, yy, 0.0);
      h = 1.0; w = 0.2;
      glyph = uWind > 0.3 ? ${SG['/']} : (uWind < -0.3 ? ${SG['\\']} : ${SG['|']});
      lean = 0.0;
      col = vec3(0.3, 0.34, 0.42) * (0.5 + 0.4 * aRand.x);
    } else {
      float sp = (p - 0.86) / 0.14;
      base = aPos + vec3(uWind * 0.0, 0.05, 0.0);
      h = 0.55; w = 0.6;
      glyph = sp < 0.45 ? ${SG['o']} : ${SG['.']};
      col = vec3(0.45, 0.5, 0.6) * (1.0 - sp * 0.7);
    }
  } else if (kind < 3.5) {
    // fireflies: wander above the grass, pulse, hide in the rain
    float r = aRand.x * 6.28;
    base = aPos + vec3(sin(uTime * 0.31 + r) * 4.0 + cos(uTime * 0.17 + r * 2.0) * 2.5,
                       0.9 + sin(uTime * 0.5 + r * 3.0) * 0.45,
                       cos(uTime * 0.27 + r * 1.3) * 3.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 1.9 + r * 4.0);
    if (pulse < 0.4 || uRain > 0.6) alpha = 0.0;
    h = 0.55; w = 0.6;
    glyph = pulse > 0.8 ? ${SG['*']} : ${SG['.']};
    col = vec3(0.86, 0.95, 0.5) * (0.5 + 0.6 * pulse);
  } else if (kind < 4.5) {
    // sparks: lift off the fire, drift with the wind, cool and fade
    float life = fract(uTime / 1.4 + aRand.y);
    if (aRand.w > 0.55) alpha = 0.0;
    base = uFire + vec3((aRand.x - 0.5) * 0.9 + uWind * life * 2.5 + sin(uTime * 3.0 + aRand.z * 9.0) * 0.3 * life,
                        0.6 + life * 4.0, (aRand.z - 0.5) * 0.6);
    h = 0.4; w = 0.4;
    glyph = ${SG['.']};
    col = mix(vec3(1.0, 0.8, 0.35), vec3(0.5, 0.12, 0.03), life) * (1.0 - life * 0.6);
  } else if (kind < 5.5) {
    // flames: a flickering cone of glyphs over the logs
    float hh = aRand.x;
    float fl = hash1(floor(uTime * 9.0) + aRand.y * 100.0);
    if (fl > 1.0 - hh * 0.75) alpha = 0.0;
    base = uFire + vec3((aRand.y - 0.5) * (1.6 - hh * 1.2) + uWind * hh * 0.6, 0.25 + hh * 1.9, (aRand.z - 0.5) * 0.5);
    h = 0.75 - hh * 0.25; w = h;
    float gl = hash1(floor(uTime * 7.0) + aRand.z * 50.0);
    glyph = gl < 0.4 ? ${SG['*']} : gl < 0.7 ? ${SG['^']} : gl < 0.85 ? ${SG["'"]} : ${SG['"']};
    col = mix(vec3(1.0, 0.94, 0.62), vec3(0.95, 0.42, 0.1), hh) * (0.85 + 0.3 * fl);
  } else {
    // logs
    base = uFire + vec3((aRand.x - 0.5) * 2.2, 0.12, (aRand.y - 0.5) * 0.4);
    h = 0.5; w = 0.7;
    glyph = ${SG['_']};
    col = vec3(0.36, 0.25, 0.15);
  }
  if (lit) {
    vec3 L = uAmbient + uMoonCol * (0.35 + 0.65 * clamp(0.5 + lean * 0.4, 0.0, 1.0));
    for (int i = 0; i < 3; i++) {
      vec3 dl = uLights[i].xyz - base;
      float d2 = dot(dl, dl);
      L += uLightCol[i] * uLights[i].w / (1.0 + d2 * 0.22);
    }
    vec2 sd = (base.xz - uShadow.xy) / uShadow.zw;
    L *= 1.0 - 0.5 * (1.0 - smoothstep(0.75, 1.15, length(sd)));
    col *= L;
    float fog = smoothstep(-14.0, -36.0, base.z);
    col = mix(col, uFog, fog * 0.8);
  }
  // the quad: stands up, leans along the camera's right vector
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 p = base + uCamRight * (position.x * w + lean * h * 0.35 * position.y) + up * (position.y * h + yoff);
  // thinned around the words (screen space)
  vec4 clipB = projectionMatrix * viewMatrix * vec4(base + up * (yoff + h * 0.5), 1.0);
  vec2 scr = (clipB.xy / clipB.w * 0.5 + 0.5) * uRes;
  vec2 zd = max(vec2(0.0), abs(scr - uZone.xy) - uZone.zw);
  float zdist = length(zd);
  float kf = zdist < uZoneFade ? 1.0 - zdist / uZoneFade : 0.0;
  if (kind < 1.5 && aRand.y < pow(kf, 2.2) * 1.1) alpha = 0.0;
  if (kind >= 1.5 && kf > 0.45) alpha = 0.0;
  col *= 1.0 - kf * 0.55;
  if (alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = vec2((float(glyph) + uv.x) / uGlyphN, uv.y);
  vCol = col;
  vA = alpha;
}`;
const SPRITE_FRAG = `
precision highp float;
in vec2 vUv;
in vec3 vCol;
in float vA;
uniform sampler2D tGlyphs;
uniform sampler2D tDepth;
uniform vec2 uRes;
out vec4 fragColor;
void main() {
  if (vA <= 0.0) discard;
  float a = texture(tGlyphs, vUv).r;
  if (a < 0.45) discard;
  // hidden by the solid scene? (its depth is one texel per cell)
  float sd = texture(tDepth, gl_FragCoord.xy / uRes).r;
  if (gl_FragCoord.z > sd + 0.0004) discard;
  fragColor = vec4(vCol, 1.0);
}`;

// ── the pond ──
const WATER_VERT = `
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FRAG = `
precision highp float;
in vec3 vWorld;
uniform float uTime;
uniform vec4 uPond;        // cx, cz, rx, rz
uniform sampler2D tReflect;
uniform mat4 uReflectVP;
uniform vec3 uMoonDir;
uniform vec4 uRipples[3];  // x, z, t0, unused
uniform float uRain;
out vec4 fragColor;
void main() {
  vec2 q = (vWorld.xz - uPond.xy) / uPond.zw;
  float edge = 1.0 + 0.14 * sin(vWorld.x * 0.7 + 1.3) + 0.1 * sin(vWorld.z * 1.1 + vWorld.x * 0.4);
  if (dot(q, q) > edge) discard;
  float t = uTime;
  // waves: a few crossed sines, nudged by rain
  float wv = sin(vWorld.x * 0.9 + t * 1.3) * 0.5 + sin(vWorld.z * 1.4 - t * 1.0 + vWorld.x * 0.3) * 0.35
           + sin((vWorld.x + vWorld.z) * 0.5 + t * 0.7) * 0.3;
  wv += uRain * 0.35 * sin(vWorld.x * 3.1 + vWorld.z * 2.7 + t * 6.0);
  // moonlight glitter: a lane of sparkle under the moon (it hangs to the right)
  float lane = exp(-pow((vWorld.x - 13.0) / 5.5, 2.0));
  wv += lane * (0.45 + 0.55 * sin(vWorld.z * 2.3 + t * 2.2 + sin(vWorld.x * 1.7 + t))) * 1.3 * (1.0 - uRain * 0.8);
  for (int i = 0; i < 3; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 3.0) continue;
    float d = length(vWorld.xz - r.xy);
    float ring = abs(d - age * 5.5);
    wv += (1.0 - smoothstep(0.0, 1.2, ring)) * exp(-age * 1.1) * 2.2;
  }
  vec4 rp = uReflectVP * vec4(vWorld, 1.0);
  vec2 ruv = rp.xy / rp.w * 0.5 + 0.5;
  ruv += vec2(wv * 0.012, wv * 0.02);
  vec4 refl = texture(tReflect, clamp(ruv, 0.001, 0.999));
  float rl = dot(refl.rgb, vec3(0.3, 0.59, 0.11));
  vec3 deep = vec3(0.045, 0.09, 0.16);
  vec3 col = deep + vec3(0.06, 0.12, 0.2) * max(0.0, wv) * 0.9;
  float crest = smoothstep(0.55, 1.3, wv);
  col += vec3(0.1, 0.18, 0.28) * crest;
  // the mirror: carries the reflected material's glyph set so the castle
  // reads as castle in the water, broken up by the crests
  float showRefl = (1.0 - crest) * step(0.06, rl);
  col = mix(col, refl.rgb * 0.55 + col * 0.3, showRefl * 0.85);
  float id = mix(0.4, refl.a, showRefl * step(0.5, refl.a * 10.0));
  fragColor = vec4(col, id);
}`;

export function start(content) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    console.error('landscape: WebGL unavailable', e);
    return;
  }
  renderer.autoClear = false;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const noise = createNoise3D();
  const BG = new THREE.Color(config.bg);
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── scene ──
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 42, 120);
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 1, 220);
  camera.position.set(...config.camera.pos);
  const target = new THREE.Vector3(...config.camera.target);
  camera.lookAt(target);
  const LAYER_SOLID = 0, LAYER_SPRITE = 1;

  const ambient = new THREE.AmbientLight(new THREE.Color(config.ambient.color), config.ambient.intensity);
  scene.add(ambient);
  const moonDir = new THREE.Vector3(...config.moon.dir).normalize();
  const moonLight = new THREE.DirectionalLight(new THREE.Color(config.moon.color), config.moon.intensity);
  moonLight.position.copy(moonDir).multiplyScalar(60);
  scene.add(moonLight);

  // ground: a slab; past its far edge there is only sky
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, config.world.zNear - config.world.zFar),
    tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#15200f') }), ID.ground)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = (config.world.zNear + config.world.zFar) / 2;
  scene.add(ground);

  // ── castle ──
  const stone = tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#7a8698') }), ID.stone);
  const stoneDark = tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#4a5466') }), ID.stone);
  const warm = tagged(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc250') }), ID.warm);
  const dark = tagged(new THREE.MeshBasicMaterial({ color: new THREE.Color('#000000') }), ID.stone);
  const castle = new THREE.Group();
  const cz = config.castle.z;
  const box = (w, h, d, x, y, z, mat = stone) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    castle.add(m);
    return m;
  };
  const cyl = (r, h, x, y, z, mat = stone) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 14), mat);
    m.position.set(x, y, z);
    castle.add(m);
    return m;
  };
  const crenBox = (x, y, z, s = 1) => box(s, s, s, x, y, z);
  // keep
  const keepW = 11, keepH = 11.5, keepD = 9;
  box(keepW, keepH, keepD, 0, keepH / 2, cz - keepD / 2 + 1);
  for (let x = -keepW / 2 + 0.5; x <= keepW / 2; x += 2) { crenBox(x, keepH + 0.5, cz + 1 - 0.5); crenBox(x, keepH + 0.5, cz + 1 - keepD + 0.5); }
  for (let z = cz + 1 - keepD + 2.5; z < cz + 1 - 1; z += 2) { crenBox(-keepW / 2 + 0.5, keepH + 0.5, z); crenBox(keepW / 2 - 0.5, keepH + 0.5, z); }
  // towers
  const towerX = 10.5, towerR = 2.7, towerH = 9.5;
  for (const sx of [-1, 1]) {
    cyl(towerR, towerH, sx * towerX, towerH / 2, cz - 0.5);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      crenBox(sx * towerX + Math.cos(ang) * (towerR - 0.3), towerH + 0.45, cz - 0.5 + Math.sin(ang) * (towerR - 0.3), 0.9);
    }
    // curtain wall between tower and keep
    const inner = keepW / 2, outer = towerX - towerR + 0.3;
    const wallW = outer - inner;
    const wallH = 6;
    box(wallW, wallH, 1.6, sx * (inner + wallW / 2), wallH / 2, cz + 0.4);
    for (let x = inner + 0.6; x < outer; x += 1.7) crenBox(sx * x, wallH + 0.4, cz + 0.4, 0.8);
    // outer walls past the towers, one crumbled
    const o0 = towerX + towerR - 0.3;
    const segH = sx < 0 ? 4.5 : 3.2;
    box(5, segH, 1.4, sx * (o0 + 2.5), segH / 2, cz + 0.2);
    for (let x = o0 + 0.5; x < o0 + 5; x += 1.6) crenBox(sx * x, segH + 0.35, cz + 0.2, 0.7);
    box(3.2, sx < 0 ? 2.6 : 3.8, 1.4, sx * (o0 + 7.3), (sx < 0 ? 2.6 : 3.8) / 2, cz + 0.2, stoneDark);
  }
  // gate: a dark opening in the keep face, torches either side
  box(3.2, 4.6, 0.6, 0, 2.3, cz + 1 + 0.15, dark);
  box(5, 0.6, 0.7, 0, 4.9, cz + 1 + 0.1, stoneDark);
  const torchPos = [[-2.4, 3.6, cz + 1.6], [2.4, 3.6, cz + 1.6]];
  const torchLights = torchPos.map(([x, y, z]) => {
    box(0.45, 0.6, 0.45, x, y, z - 0.3, warm);
    const l = new THREE.PointLight(new THREE.Color(config.torchLight.color), config.torchLight.intensity, 0, 2);
    l.position.set(x, y + 0.3, z + 0.6);
    scene.add(l);
    return l;
  });
  // windows: lit ones warm, the rest dark slots
  const winMat = (lit) => (lit ? warm : stoneDark);
  const windows = [
    [-2.6, 9.5, 1], [2.6, 9.5, 0], [0, 7, 1], [-2.6, 4.5, 0], [2.6, 7.5, 1],
    [-towerX, 7.5, 1], [towerX, 7.5, 0], [-towerX, 4.5, 0], [towerX, 4, 1],
  ];
  const windowLights = [];
  for (const [x, y, lit] of windows) {
    const z = Math.abs(x) > 5 ? cz - 0.5 + towerR - 0.1 : cz + 1 + 0.1;
    box(0.9, 1.3, 0.4, x, y, z, winMat(lit));
  }
  // flag on the keep
  box(0.18, 3.2, 0.18, 0, keepH + 1.6, cz + 1 - keepD / 2, stoneDark);
  const flag = box(1.4, 0.8, 0.1, 0.75, keepH + 2.7, cz + 1 - keepD / 2,
    tagged(new THREE.MeshBasicMaterial({ color: new THREE.Color('#9a2634') }), ID.warm));
  scene.add(castle);

  // ── treeline ──
  const foliage = tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#1e4442') }), ID.foliage);
  const foliage2 = tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#274a3e') }), ID.foliage);
  const wood = tagged(new THREE.MeshLambertMaterial({ color: new THREE.Color('#5a4630') }), ID.wood);
  const trees = new THREE.Group();
  const tree = (x, z, r, h) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), Math.random() < 0.5 ? foliage : foliage2);
    cone.position.set(x, h / 2 + 1.2, z);
    cone.rotation.y = Math.random() * 6.28;
    trees.add(cone);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 6), wood);
    trunk.position.set(x, 0.8, z);
    trees.add(trunk);
  };
  // the treeline: three staggered rows behind the castle with gaps between
  // crowns so they read as trees, kept low enough that the sky shows over
  // them; clumps down both sides
  for (let x = -84; x <= 84; x += 7) {
    tree(x + rand(-1.5, 1.5), cz - 10 + rand(-2, 2), rand(2.4, 3.4), rand(4.5, 6.5));
    tree(x + 3.5 + rand(-1.5, 1.5), cz - 18 + rand(-3, 3), rand(3, 4.2), rand(6, 8.5));
    tree(x + 1.5 + rand(-2, 2), cz - 27 + rand(-3, 3), rand(3.5, 5), rand(7, 10));
  }
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) tree(sx * rand(36, 56), rand(cz - 6, 10), rand(2.5, 4), rand(5, 8));
  }
  scene.add(trees);

  // ── pond ──
  const pond = config.pond;
  const rtReflect = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  rtReflect.texture.colorSpace = THREE.NoColorSpace;
  rtReflect.texture.minFilter = THREE.LinearFilter;
  const waterUniforms = {
    uTime: { value: 0 },
    uPond: { value: new THREE.Vector4(pond.x, pond.z, pond.rx, pond.rz) },
    tReflect: { value: rtReflect.texture },
    uReflectVP: { value: new THREE.Matrix4() },
    uMoonDir: { value: moonDir },
    uRipples: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
    uRain: { value: 0 },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(pond.rx * 2.3, pond.rz * 2.3),
    new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: waterUniforms, blending: THREE.NoBlending })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(pond.x, 0.04, pond.z);
  scene.add(water);
  const mirrorCam = camera.clone();

  // ── campfire ──
  const fireLight = new THREE.PointLight(new THREE.Color(config.fireLight.color), config.fireLight.intensity, 0, 2);
  scene.add(fireLight);
  const firePos = new THREE.Vector3(-12, 0, 4);

  // ── render targets + passes ──
  const rtScene = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  rtScene.texture.colorSpace = THREE.NoColorSpace;   // linear; the ASCII pass encodes
  rtScene.texture.minFilter = THREE.NearestFilter;
  rtScene.texture.magFilter = THREE.NearestFilter;
  rtScene.depthTexture = new THREE.DepthTexture(4, 4);

  const setOff = [], setLen = [];
  let allGlyphs = '';
  for (const s of SETS) { setOff.push(allGlyphs.length); setLen.push(s.length); allGlyphs += s; }
  const asciiUniforms = {
    tScene: { value: rtScene.texture },
    tGlyphs: { value: null },
    uGrid: { value: new THREE.Vector2(1, 1) },
    uCell: { value: new THREE.Vector2(8, 16) },
    uGlyphN: { value: allGlyphs.length },
    uSetOff: { value: setOff },
    uSetLen: { value: setLen },
    uGain: { value: GAIN },
    uZone: { value: new THREE.Vector4(-9999, -9999, 0, 0) },
    uZoneFade: { value: 90 },
    uBg: { value: BG },
    uMoon: { value: new THREE.Vector3(0, 0, 10) },
    uTime: { value: 0 },
    uRain: { value: 0 },
  };
  const asciiScene = new THREE.Scene();
  const asciiCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const asciiQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: ASCII_VERT, fragmentShader: ASCII_FRAG, uniforms: asciiUniforms, depthTest: false, depthWrite: false })
  );
  asciiScene.add(asciiQuad);

  // ── sprites ──
  const spriteUniforms = {
    uTime: { value: 0 },
    uWind: { value: 0 },
    uRain: { value: 0 },
    uCursor: { value: new THREE.Vector4(0, 0, 6, 0) },
    uBursts: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uMoonDir: { value: moonDir },
    // sprite lighting works in display space: these are multipliers, not
    // physical lights, so they are set raw (no sRGB → linear conversion)
    uMoonCol: { value: new THREE.Color().setRGB(0.62, 0.68, 0.82) },
    uAmbient: { value: new THREE.Color().setRGB(0.34, 0.4, 0.55) },
    uLights: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uLightCol: { value: [new THREE.Color().setRGB(1.0, 0.6, 0.22), new THREE.Color().setRGB(1.0, 0.69, 0.35), new THREE.Color().setRGB(1.0, 0.69, 0.35)] },
    uFire: { value: firePos },
    uShadow: { value: new THREE.Vector4(0, cz + 3.2, 24, 3.6) },
    uZone: { value: asciiUniforms.uZone.value },
    uZoneFade: { value: 90 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGlyphN: { value: SPRITE_GLYPHS.length },
    uBladeH: { value: config.grass.height },
    uFog: { value: new THREE.Color().setRGB(0.05, 0.07, 0.1) },
    tGlyphs: { value: null },
    tDepth: { value: rtScene.depthTexture },
  };
  const spriteMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: spriteUniforms,
    blending: THREE.NoBlending, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
  });
  let spriteMesh = null;

  // Blades are placed by sampling the screen (biased toward the top, where
  // the distance needs filling) and dropping each sample onto the ground.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  function groundAt(sx, sy) {
    ndc.set(sx * 2 - 1, 1 - sy * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
  }
  const inPond = (x, z) => {
    const q1 = (x - pond.x) / pond.rx, q2 = (z - pond.z) / pond.rz;
    return q1 * q1 + q2 * q2 < 1.3;
  };
  const inCastle = (x, z) => Math.abs(x) < 22 && z > cz - 9.5 && z < cz + 1.6;
  const inWorld = (z) => z > config.world.zFar + 1 && z < config.world.zNear;

  function buildSprites(cols, rows) {
    if (spriteMesh) { scene.remove(spriteMesh); spriteMesh.geometry.dispose(); }
    const isMobile = window.innerWidth < config.mobileBreakpoint;
    // phones have fewer cells but show more ground per cell, so pack denser
    const nGrass = Math.min(config.grass.max, Math.round(cols * rows * config.grass.density * (isMobile ? 1.5 : 1)));
    const nFlower = Math.round(nGrass * config.flowers);
    const nRain = isMobile ? Math.round(config.rain.max * 0.5) : config.rain.max;
    const nFly = isMobile ? Math.round(config.fireflies * 0.6) : config.fireflies;
    const nSpark = config.sparks, nFlame = config.flames, nLog = 3;
    const N = nGrass + nFlower + nRain + nFly + nSpark + nFlame + nLog;
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N * 4), kind = new Float32Array(N);
    let k = 0;
    const put = (x, y, z, kd) => {
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      rnd[k * 4] = Math.random(); rnd[k * 4 + 1] = Math.random(); rnd[k * 4 + 2] = Math.random(); rnd[k * 4 + 3] = Math.random();
      kind[k] = kd;
      k++;
    };
    let placed = 0, tries = 0;
    while (placed < nGrass + nFlower && tries < (nGrass + nFlower) * 4) {
      tries++;
      const sx = -0.04 + Math.random() * 1.08;
      const sy = Math.pow(Math.random(), config.grass.farBias) * 1.04 - 0.02;
      const g = groundAt(sx, sy);
      if (!g || !inWorld(g.z) || inPond(g.x, g.z) || inCastle(g.x, g.z)) continue;
      put(g.x, 0, g.z, placed < nGrass ? 0 : 1);
      placed++;
    }
    while (placed < nGrass + nFlower) { put(0, -50, 0, 0); placed++; }
    for (let i = 0; i < nRain; i++) {
      const g = groundAt(-0.1 + Math.random() * 1.2, 0.05 + Math.random() * 1.1);
      if (g && inWorld(g.z)) put(g.x, 0, g.z, 2); else put(0, -50, 0, 2);
    }
    for (let i = 0; i < nFly; i++) {
      const g = groundAt(0.05 + Math.random() * 0.9, 0.3 + Math.random() * 0.6);
      put(g ? g.x : 0, 0, g ? g.z : 0, 3);
    }
    for (let i = 0; i < nSpark; i++) put(0, 0, 0, 4);
    for (let i = 0; i < nFlame; i++) put(0, 0, 0, 5);
    for (let i = 0; i < nLog; i++) { put(0, 0, 0, 6); rnd[(k - 1) * 4] = (i + 0.5) / nLog; rnd[(k - 1) * 4 + 1] = 0.5; }

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.instanceCount = N;
    spriteMesh = new THREE.Mesh(geo, spriteMat);
    spriteMesh.frustumCulled = false;
    spriteMesh.layers.set(LAYER_SPRITE);
    scene.add(spriteMesh);
    return N;
  }

  // ── sizing ──
  let cols = 1, rows = 1, cw = 8, ch = 16, W = 1, H = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, config.dprMax);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    W = Math.floor(w * dpr); H = Math.floor(h * dpr);
    const isMobile = w < config.mobileBreakpoint;
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? config.camera.fovPortrait : config.camera.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();          // the raycasts below need it current
    // cell size from the font
    const fontD = Math.round((isMobile ? config.mobileFontPx : config.fontPx) * dpr);
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `${fontD}px ${config.font}`;
    cw = Math.max(4, Math.round(probe.measureText('M').width));
    ch = Math.max(6, Math.round(fontD * 1.12));
    cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
    rtScene.setSize(cols, rows);
    rtScene.depthTexture.image.width = cols; rtScene.depthTexture.image.height = rows;
    rtReflect.setSize(cols, rows);
    if (asciiUniforms.tGlyphs.value) asciiUniforms.tGlyphs.value.dispose();
    asciiUniforms.tGlyphs.value = makeGlyphAtlas(allGlyphs, cw, ch, fontD);
    asciiUniforms.uGrid.value.set(cols, rows);
    asciiUniforms.uCell.value.set(cw, ch);
    if (spriteUniforms.tGlyphs.value) spriteUniforms.tGlyphs.value.dispose();
    spriteUniforms.tGlyphs.value = makeGlyphAtlas(SPRITE_GLYPHS, cw * 2, ch * 2, fontD * 2);
    spriteUniforms.uRes.value.set(W, H);
    spriteUniforms.tDepth.value = rtScene.depthTexture;
    asciiUniforms.uZoneFade.value = 60 * dpr;
    spriteUniforms.uZoneFade.value = (isMobile ? 64 : 84) * dpr;
    asciiUniforms.uMoon.value.set(W * config.moonScreen.x, H * (1 - config.moonScreen.y), config.moonScreen.r * ch);
    // campfire: a fixed spot on the screen, dropped onto the ground
    const g = groundAt(config.fire.screenX, config.fire.screenY);
    if (g) firePos.set(g.x, 0, g.z);
    fireLight.position.set(firePos.x, 1.2, firePos.z);
    spriteUniforms.uLights.value[0].set(firePos.x, 0.8, firePos.z, 1);
    spriteUniforms.uLights.value[1].set(torchPos[0][0], torchPos[0][1], torchPos[0][2] + 0.6, 0.35);
    spriteUniforms.uLights.value[2].set(torchPos[1][0], torchPos[1][1], torchPos[1][2] + 0.6, 0.35);
    const n = buildSprites(cols, rows);
    canvas.dataset.grid = `${cols}x${rows} cell=${cw}x${ch} dpr=${dpr} sprites=${n}`;
  }

  function measure() {
    const r = content.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, config.dprMax);
    const cx = (r.left + r.width / 2) * dpr;
    const cyTop = (r.top + r.height / 2) * dpr;
    // gl_FragCoord is y-up
    asciiUniforms.uZone.value.set(cx, H - cyTop, (r.width / 2 + 14) * dpr, (r.height / 2 + 8) * dpr);
  }

  // ── input: hover parts the grass, a tap rings out ──
  const cursor = { x: 0, z: 0, k: 0, lastMove: -1e9 };
  let burstI = 0, rippleI = 0;
  function toGround(clientX, clientY) {
    return groundAt(clientX / window.innerWidth, clientY / window.innerHeight);
  }
  if (!reduced) {
    window.addEventListener('pointermove', (e) => {
      const g = toGround(e.clientX, e.clientY);
      if (!g) return;
      cursor.x = g.x; cursor.z = g.z; cursor.lastMove = performance.now();
    });
    let downT = 0, downX = 0, downY = 0;
    window.addEventListener('pointerdown', (e) => { downT = performance.now(); downX = e.clientX; downY = e.clientY; });
    window.addEventListener('pointerup', (e) => {
      const drift = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (performance.now() - downT > 300 || drift > 9) return;
      const g = toGround(e.clientX, e.clientY);
      if (!g) return;
      const t = spriteUniforms.uTime.value;
      spriteUniforms.uBursts.value[burstI % 3].set(g.x, g.z, t, 0);
      burstI++;
      if (inPond(g.x, g.z)) {
        waterUniforms.uRipples.value[rippleI % 3].set(g.x, g.z, t, 0);
        rippleI++;
      }
    });
  }

  // ── per-frame ──
  const camRight = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  let flash = 0;
  function render(now, dt) {
    const t = now / 1000;
    spriteUniforms.uTime.value = t;
    waterUniforms.uTime.value = t;

    // weather clock
    const wn = noise(t * 0.016, 0, 4) * 0.5 + 0.5;
    const rain = reduced ? 0 : smooth(0.5, 0.7, wn);
    const wind = noise(t * 0.045, 2, 5) * config.wind.base + rain * 0.4;
    spriteUniforms.uRain.value = rain;
    waterUniforms.uRain.value = rain;
    asciiUniforms.uRain.value = rain;
    asciiUniforms.uTime.value = t;
    spriteUniforms.uWind.value = wind;
    // clouds dim the moonlight (the moon and stars themselves veil in the ASCII pass)
    moonLight.intensity = config.moon.intensity * (1 - rain * 0.7);
    // flicker
    const flick = 0.75 + 0.25 * (noise(t * 3.1, 0, 2) * 0.5 + 0.5);
    fireLight.intensity = config.fireLight.intensity * flick;
    spriteUniforms.uLights.value[0].w = 1.0 * flick;
    torchLights[0].intensity = config.torchLight.intensity * (0.8 + 0.2 * (noise(t * 4, 1, 3) * 0.5 + 0.5));
    torchLights[1].intensity = config.torchLight.intensity * (0.8 + 0.2 * (noise(t * 4, 7, 3) * 0.5 + 0.5));
    flag.rotation.y = wind > 0 ? 0 : Math.PI;
    flag.position.x = wind > 0 ? 0.75 : -0.75;
    // lightning
    if (rain > 0.78 && flash === 0 && Math.random() < dt * 0.22) flash = 3;
    if (flash > 0) {
      ambient.intensity = config.ambient.intensity * (flash === 3 ? 7 : flash === 2 ? 2.5 : 4);
      flash--;
    } else ambient.intensity = config.ambient.intensity;
    // cursor
    const active = now - cursor.lastMove < 150;
    const cu = spriteUniforms.uCursor.value;
    cu.x = cursor.x; cu.y = cursor.z; cu.z = 6.5;
    cu.w += ((active ? 1 : 0) - cu.w) * (1 - Math.exp(-dt * 6));

    camera.getWorldDirection(tmpV);
    camRight.crossVectors(tmpV, camera.up).normalize();
    spriteUniforms.uCamRight.value.copy(camRight);

    // 1. the pond's mirror: the solid scene from under the water
    mirrorCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
    mirrorCam.up.set(0, -1, 0);
    mirrorCam.lookAt(target.x, -target.y, target.z);
    mirrorCam.aspect = camera.aspect; mirrorCam.fov = camera.fov; mirrorCam.updateProjectionMatrix();
    mirrorCam.updateMatrixWorld();
    waterUniforms.uReflectVP.value.multiplyMatrices(mirrorCam.projectionMatrix, mirrorCam.matrixWorldInverse);
    water.visible = false;
    camera.layers.set(LAYER_SOLID); mirrorCam.layers.set(LAYER_SOLID);
    renderer.setRenderTarget(rtReflect);
    renderer.setClearColor(BG, 0);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    water.visible = true;
    // 2. the solid scene, one texel per cell, materials tagged in alpha
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    // 3. glyphs
    renderer.setRenderTarget(null);
    renderer.setClearColor(BG, 1);
    renderer.clear();
    renderer.render(asciiScene, asciiCam);
    // 4. sprites, depth-tested against the solid scene
    camera.layers.set(LAYER_SPRITE);
    renderer.render(scene, camera);
    camera.layers.set(LAYER_SOLID);
  }

  // Debug handle: read scene-buffer texels from devtools / test scripts.
  window.__landscape = { renderer, rtScene, camera, scene, get grid() { return { cols, rows, cw, ch }; } };

  // ── lifecycle ──
  resize();
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); measure(); if (reduced) render(30000, 0.016); }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  if (reduced) {
    render(30000, 0.016); // one still, clear night
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
