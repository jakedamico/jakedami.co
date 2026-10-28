// glyphs-gl.js: the glyph engine behind the riverkeep theme.
//
// Everything the scene draws is a quad: a glyph cut from one of its
// pre-coloured atlas canvases, a flat background-coloured rectangle, a
// baked layer (the Milky Way haze, the sky above the scene) or a soft
// radial halo. Through a 2D context each is its own drawImage or
// fillRect, and on a phone those calls were the frame: at 4x CPU
// throttling (Oct 26 2026) the orrery took 26 ms of a 30 ms budget and
// the scene 13 ms, and with the calls stubbed out 3 ms and 5 ms. This
// engine gathers them into one buffer and draws a batch per atlas, a
// handful of draw calls a frame, with the pixels unchanged: the same
// atlases are uploaded as textures and sampled nearest-neighbour at the
// same device-pixel positions the 2D path snapped to.
//
// Each quad is one instance of 16 floats (centre, size, texture
// rectangle, colour, kind and parameters); the vertex shader unfolds the
// four corners, turned if asked. Four vertices of 12 floats each cost
// four times the writes and a 20-argument call per glyph, 0.28 us against
// 0.02 at 4x throttling (Oct 27 2026), a fifth of a frame's work.
//
// The scene uses it through a few calls. begin() clears the frame;
// glyph(), turned(), rect(), image() and halo() queue instances; end()
// draws whatever is still queued. record() and endRecord() capture a run
// of instances (the static world) into its own buffer, and play() draws
// that buffer again later, shifted if asked, without rebuilding it.
// layer() makes an offscreen target the size of a slice of the page;
// target() draws into it and draw() slides it across the screen, so a
// camera move can redraw its layers at the scene's own rate and move them
// at the display's. Textures are made from canvases on first use and
// dropped once a canvas has been zeroed. If WebGL or instancing is
// missing, or the context is lost for good, the scene draws the same
// frame through its 2D path instead. What a scene must do to use it, and
// how a camera move is built from layers, is in docs/riverkeep-engine.md.
(function () {
  'use strict';
  // aRect is centre x, y and width, height in device pixels; aUV the
  // texture rectangle (or -1..1 for a halo); aAux.x the kind: 0 a textured
  // quad tinted by its colour, turned by aAux.y about its centre; 1 a flat
  // premultiplied colour; 2 a radial halo whose alpha runs from aAux.y at
  // the centre to aAux.z at radius aAux.w and to nothing at the edge, as
  // the 2D path's three-stop gradient did.
  const VERT = `
attribute vec2 aCorner;
attribute vec4 aRect; attribute vec4 aUV; attribute vec4 aColor; attribute vec4 aAux;
uniform vec2 uScale; uniform vec2 uOffset;
varying vec2 vUV; varying vec4 vColor; varying vec4 vAux;
void main() {
  vec2 local = (aCorner - 0.5) * aRect.zw;
  float turn = aAux.x < 0.5 ? aAux.y : 0.0;
  float c = cos(turn), s = sin(turn);
  vec2 p = aRect.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c) + uOffset;
  gl_Position = vec4(p.x * uScale.x - 1.0, 1.0 - p.y * uScale.y, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, aCorner); vColor = aColor; vAux = aAux;
}`;
  // Texture coordinates need the full precision for a 2000-pixel atlas.
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
varying vec2 vUV; varying vec4 vColor; varying vec4 vAux;
void main() {
  if (vAux.x < 0.5) { gl_FragColor = texture2D(uTex, vUV) * vColor; }
  else if (vAux.x < 1.5) { gl_FragColor = vColor; }
  else {
    float d = length(vUV), stop = vAux.w;
    float a = d < stop ? mix(vAux.y, vAux.z, d / stop) : mix(vAux.z, 0.0, (d - stop) / (1.0 - stop));
    if (d > 1.0) a = 0.0;
    gl_FragColor = vec4(vColor.rgb * a, a);
  }
}`;
  // An instance: cx cy w h u0 v0 u1 v1 r g b a kind p1 p2 p3. A batch
  // flushes when it is full.
  const FLOATS = 16, STRIDE = FLOATS * 4, MAX = 16000;

  class GlyphGL {
    constructor(canvas) {
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL unavailable');
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (this.maxTexture < 4096) throw new Error('textures too small');
      this.gl = gl; this.canvas = canvas; this.lost = false; this.onrestore = null; this.gen = 0;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; }, false);
      canvas.addEventListener('webglcontextrestored', () => { this.setup(); this.lost = false; if (this.onrestore) this.onrestore(); }, false);
      this.setup();
    }
    setup() {
      const gl = this.gl, ext = this.ext = gl.getExtension('ANGLE_instanced_arrays');
      if (!ext) throw new Error('instancing unavailable');
      this.gen++;
      const compile = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = this.prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      this.uScale = gl.getUniformLocation(prog, 'uScale'); this.uOffset = gl.getUniformLocation(prog, 'uOffset');
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      // The four corners, shared by every instance, in strip order.
      const corner = gl.getAttribLocation(prog, 'aCorner');
      this.corners = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.corners); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(corner); gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0); ext.vertexAttribDivisorANGLE(corner, 0);
      this.attribs = [['aRect', 0], ['aUV', 16], ['aColor', 32], ['aAux', 48]].map(([name, off]) => ({ loc: gl.getAttribLocation(prog, name), off }));
      for (const a of this.attribs) { gl.enableVertexAttribArray(a.loc); ext.vertexAttribDivisorANGLE(a.loc, 1); }
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, MAX * STRIDE, gl.DYNAMIC_DRAW);
      this.point(this.vbo);
      // Premultiplied source-over, the same compositing as the 2D context.
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this.data = new Float32Array(MAX * FLOATS);
      this.count = 0; this.tex = null; this.textures = new Map(); this.layers = new Map(); this.rec = null; this.calls = 0;
      // Untextured quads still sample something; a white pixel is harmless.
      this.blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    // The instance attributes read from `vbo`, from instance `base` on.
    point(vbo, base = 0) {
      const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      for (const a of this.attribs) gl.vertexAttribPointer(a.loc, 4, gl.FLOAT, false, STRIDE, base * STRIDE + a.off);
    }
    // The texture for a canvas, made on first use and again if the canvas
    // was resized; remembered on the canvas itself, so a glyph costs no
    // lookup. Nearest sampling matches the 2D path's imageSmoothing off.
    texture(canvas) {
      let t = canvas.__tex;
      if (t && t.gen === this.gen && t.w === canvas.width && t.h === canvas.height) return t;
      const gl = this.gl;
      t = this.textures.get(canvas);
      if (t && t.w === canvas.width && t.h === canvas.height) { canvas.__tex = t; return t; }
      if (t) gl.deleteTexture(t.tex);
      t = { tex: gl.createTexture(), w: canvas.width, h: canvas.height, gen: this.gen };
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.textures.set(canvas, t); canvas.__tex = t;
      return t;
    }
    begin(width, height, bg) {
      if (this.lost) return false;
      const gl = this.gl;
      for (const [canvas, t] of this.textures) if (!canvas.width) { gl.deleteTexture(t.tex); this.textures.delete(canvas); canvas.__tex = null; }
      this.width = width; this.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(this.uScale, 2 / width, 2 / height); gl.uniform2f(this.uOffset, 0, 0);
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      this.count = 0; this.tex = null; this.calls = 0;
      return true;
    }
    end() { this.flush(); }
    // An offscreen layer: a texture of the given size with a framebuffer
    // to draw into it, kept by name and remade when the size changes.
    // Null if the GPU cannot make it, in which case the caller draws
    // straight to the screen.
    layer(name, width, height) {
      const gl = this.gl;
      let l = this.layers.get(name);
      if (l && l.w === width && l.h === height) return l;
      if (l) this.freeLayer(name);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      // Cleared once now, so the GPU allocates it here rather than on the
      // first frame that draws into it.
      if (ok) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.blank);
      if (!ok) { gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); return null; }
      l = { fbo, tex, w: width, h: height };
      this.layers.set(name, l);
      return l;
    }
    freeLayer(name) {
      const l = this.layers.get(name);
      if (!l) return;
      this.gl.deleteFramebuffer(l.fbo); this.gl.deleteTexture(l.tex); this.layers.delete(name);
    }
    freeLayers() { for (const name of [...this.layers.keys()]) this.freeLayer(name); }
    // Where the instances go from here on: a layer, cleared to `bg` if
    // given, or the screen again when `layer` is null. A layer's own
    // texture is unbound first, so drawing into it never samples it.
    target(layer, bg) {
      const gl = this.gl;
      this.flush();
      gl.bindTexture(gl.TEXTURE_2D, this.blank);
      if (layer) { gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo); gl.viewport(0, 0, layer.w, layer.h); gl.uniform2f(this.uScale, 2 / layer.w, 2 / layer.h); }
      else {
        const w = this.width || this.canvas.width, h = this.height || this.canvas.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.uniform2f(this.uScale, 2 / w, 2 / h);
      }
      if (bg) { gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      this.tex = null;
    }
    setTexture(t) {
      if (this.rec) { if (t !== this.rec.tex) { this.closeSegment(); this.rec.tex = t; } return; }
      if (t !== this.tex) { this.flush(); this.tex = t; }
    }
    flush() {
      if (!this.count) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.tex ? this.tex.tex : this.blank);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * FLOATS));
      this.ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, this.count);
      this.calls++; this.count = 0;
    }
    // One instance.
    inst(cx, cy, w, h, u0, v0, u1, v1, r, g, b, a, kind, p1, p2, p3) {
      let d, o;
      if (this.rec) { const rec = this.rec; if (rec.count === rec.cap) this.growRec(); d = rec.data; o = rec.count++ * FLOATS; }
      else { if (this.count === MAX) this.flush(); d = this.data; o = this.count++ * FLOATS; }
      d[o] = cx; d[o + 1] = cy; d[o + 2] = w; d[o + 3] = h; d[o + 4] = u0; d[o + 5] = v0; d[o + 6] = u1; d[o + 7] = v1;
      d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a; d[o + 12] = kind; d[o + 13] = p1; d[o + 14] = p2; d[o + 15] = p3;
    }
    // A cell of an atlas drawn upright at a device-pixel position, or
    // turned about a centre.
    glyph(canvas, sx, sy, sw, sh, dx, dy, dw, dh, alpha) {
      const t = this.texture(canvas);
      if (t !== this.tex || this.rec) this.setTexture(t);
      this.inst(dx + dw * .5, dy + dh * .5, dw, dh, sx / t.w, sy / t.h, (sx + sw) / t.w, (sy + sh) / t.h, alpha, alpha, alpha, alpha, 0, 0, 0, 0);
    }
    turned(canvas, sx, sy, sw, sh, cx, cy, dw, dh, turn, alpha) {
      const t = this.texture(canvas);
      if (t !== this.tex || this.rec) this.setTexture(t);
      this.inst(cx, cy, dw, dh, sx / t.w, sy / t.h, (sx + sw) / t.w, (sy + sh) / t.h, alpha, alpha, alpha, alpha, 0, turn, 0, 0);
    }
    rect(x, y, w, h, r, g, b, a) { this.inst(x + w * .5, y + h * .5, w, h, 0, 0, 0, 0, r * a, g * a, b * a, a, 1, 0, 0, 0); }
    image(canvas, x, y, w, h) {
      const t = this.texture(canvas); this.setTexture(t);
      this.inst(x + w * .5, y + h * .5, w, h, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0);
    }
    // A layer drawn at a device-pixel offset. Its texture's rows run bottom
    // up, so it is sampled the other way round.
    draw(layer, x, y) {
      this.setTexture(layer);
      this.inst(x + layer.w * .5, y + layer.h * .5, layer.w, layer.h, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0);
    }
    halo(cx, cy, r, cr, cg, cb, a, mid, stop) { this.inst(cx, cy, r * 2, r * 2, -1, -1, 1, 1, cr, cg, cb, 1, 2, a, mid, stop); }
    // Recording keeps the instances and their texture runs aside instead
    // of drawing them; the result is a clip that play() draws in one go.
    record() { this.rec = { data: new Float32Array(4096 * FLOATS), cap: 4096, count: 0, segments: [], tex: null, start: 0 }; }
    growRec() { const rec = this.rec, bigger = new Float32Array(rec.cap * 2 * FLOATS); bigger.set(rec.data); rec.data = bigger; rec.cap *= 2; }
    closeSegment() { const rec = this.rec; if (rec.count > rec.start) rec.segments.push({ tex: rec.tex, start: rec.start, count: rec.count - rec.start }); rec.start = rec.count; }
    endRecord() {
      const gl = this.gl, rec = this.rec; this.closeSegment(); this.rec = null;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, rec.data.subarray(0, rec.count * FLOATS), gl.STATIC_DRAW);
      this.point(this.vbo);
      return { vbo, segments: rec.segments };
    }
    play(clip, ox, oy) {
      if (!clip) return;
      const gl = this.gl; this.flush();
      gl.uniform2f(this.uOffset, ox, oy);
      for (const s of clip.segments) {
        this.point(clip.vbo, s.start);
        gl.bindTexture(gl.TEXTURE_2D, s.tex ? s.tex.tex : this.blank);
        this.ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, s.count); this.calls++;
      }
      gl.uniform2f(this.uOffset, 0, 0);
      this.point(this.vbo);
    }
    free(clip) { if (clip) this.gl.deleteBuffer(clip.vbo); }
    dispose() {
      const gl = this.gl;
      for (const [canvas, t] of this.textures) { gl.deleteTexture(t.tex); canvas.__tex = null; }
      this.textures.clear();
      this.freeLayers();
      gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.corners); gl.deleteTexture(this.blank); gl.deleteProgram(this.prog);
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    }
  }
  window.GlyphGL = GlyphGL;
})();
