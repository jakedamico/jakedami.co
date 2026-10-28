// glyphs-gl.js: the glyph engine behind the riverkeep theme.
//
// Everything the scene draws is a quad: a glyph cut from one of its
// pre-coloured atlas canvases, a flat background-coloured rectangle, a
// baked layer (the Milky Way haze, the sky above the scene) or a soft
// radial halo. Through a 2D context each is its own drawImage or
// fillRect, and on a phone those calls were the frame: at 4x CPU
// throttling (Oct 26 2026) the orrery took 26 ms of a 30 ms budget and
// the scene 13 ms, and with the calls stubbed out 3 ms and 5 ms. This
// engine gathers them into one vertex buffer and draws a batch per atlas,
// a handful of draw calls a frame, with the pixels unchanged: the same
// atlases are uploaded as textures and sampled nearest-neighbour at the
// same device-pixel positions the 2D path snapped to.
//
// The scene uses it through a few calls. begin() clears the frame;
// glyph(), turned(), rect(), image() and halo() queue quads; end() draws
// whatever is still queued. record() and endRecord() capture a run of
// quads (the static world) into its own buffer, and play() draws that
// buffer again later, shifted if asked, without rebuilding it. layer()
// makes an offscreen target the size of a slice of the page; target()
// draws into it and draw() slides it across the screen, so a camera move
// can redraw its layers at the scene's own rate and move them at the
// display's. Textures are made from canvases on first use and dropped
// once a canvas has been zeroed. If WebGL is missing or the context is
// lost, the scene draws the same frame through its 2D path instead.
(function () {
  'use strict';
  const VERT = `
attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aColor; attribute vec4 aAux;
uniform vec2 uScale; uniform vec2 uOffset;
varying vec2 vUV; varying vec4 vColor; varying vec4 vAux;
void main() {
  vec2 p = aPos + uOffset;
  gl_Position = vec4(p.x * uScale.x - 1.0, 1.0 - p.y * uScale.y, 0.0, 1.0);
  vUV = aUV; vColor = aColor; vAux = aAux;
}`;
  // aAux.x is the kind: 0 a textured quad tinted by its colour, 1 a flat
  // premultiplied colour, 2 a radial halo whose alpha runs from aAux.y at
  // the centre to aAux.z at radius aAux.w and to nothing at the edge, as
  // the 2D path's three-stop gradient did. Texture coordinates need the
  // full precision for a 2000-pixel atlas.
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
  // A vertex: x y u v r g b a kind p1 p2 p3. Four to a quad, and the index
  // buffer holds that many quads, so a batch flushes when it is full.
  const FLOATS = 12, STRIDE = FLOATS * 4, MAX_QUADS = 16000;

  class GlyphGL {
    constructor(canvas) {
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL unavailable');
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (this.maxTexture < 4096) throw new Error('textures too small');
      this.gl = gl; this.canvas = canvas; this.lost = false; this.onrestore = null;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; }, false);
      canvas.addEventListener('webglcontextrestored', () => { this.setup(); this.lost = false; if (this.onrestore) this.onrestore(); }, false);
      this.setup();
    }
    setup() {
      const gl = this.gl;
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
      this.attribs = [['aPos', 2, 0], ['aUV', 2, 8], ['aColor', 4, 16], ['aAux', 4, 32]].map(([name, size, off]) => ({ loc: gl.getAttribLocation(prog, name), size, off }));
      for (const a of this.attribs) gl.enableVertexAttribArray(a.loc);
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, MAX_QUADS * 4 * STRIDE, gl.DYNAMIC_DRAW);
      this.point(this.vbo);
      const idx = new Uint16Array(MAX_QUADS * 6);
      for (let q = 0; q < MAX_QUADS; q++) { const v = q * 4, i = q * 6; idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
      this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      // Premultiplied source-over, the same compositing as the 2D context.
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      this.data = new Float32Array(MAX_QUADS * 4 * FLOATS);
      this.quads = 0; this.tex = null; this.textures = new Map(); this.layers = new Map(); this.rec = null; this.calls = 0;
      // Untextured quads still sample something; a white pixel is harmless.
      this.blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    point(vbo) {
      const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      for (const a of this.attribs) gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, STRIDE, a.off);
    }
    // The texture for a canvas, made on first use and again if the canvas
    // was resized. Nearest sampling matches the 2D path's imageSmoothing
    // off.
    texture(canvas) {
      let t = this.textures.get(canvas);
      if (t && t.w === canvas.width && t.h === canvas.height) return t;
      const gl = this.gl;
      if (t) gl.deleteTexture(t.tex);
      t = { tex: gl.createTexture(), w: canvas.width, h: canvas.height };
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.textures.set(canvas, t);
      return t;
    }
    begin(width, height, bg) {
      if (this.lost) return false;
      const gl = this.gl;
      for (const [canvas, t] of this.textures) if (!canvas.width) { gl.deleteTexture(t.tex); this.textures.delete(canvas); }
      this.width = width; this.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(this.uScale, 2 / width, 2 / height); gl.uniform2f(this.uOffset, 0, 0);
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      this.quads = 0; this.tex = null; this.calls = 0;
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
    // Where the quads go from here on: a layer, cleared to `bg` if given,
    // or the screen again when `layer` is null. A layer's own texture is
    // unbound first, so drawing into it never samples it.
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
    // A layer drawn at a device-pixel offset. Its texture's rows run bottom
    // up, so the quad samples it the other way round.
    draw(layer, x, y) {
      this.setTexture(layer);
      this.quad(x, y, x + layer.w, y, x + layer.w, y + layer.h, x, y + layer.h, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0);
    }
    setTexture(t) {
      if (this.rec) { if (t !== this.rec.tex) { this.closeSegment(); this.rec.tex = t; } return; }
      if (t !== this.tex) { this.flush(); this.tex = t; }
    }
    flush() {
      if (!this.quads) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.tex ? this.tex.tex : this.blank);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.quads * 4 * FLOATS));
      gl.drawElements(gl.TRIANGLES, this.quads * 6, gl.UNSIGNED_SHORT, 0);
      this.calls++; this.quads = 0;
    }
    // One quad: its corners in device pixels, clockwise from the top left,
    // the texture coordinates of the top-left and bottom-right corners, a
    // colour and the aux block.
    quad(x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, r, g, b, a, kind, p1, p2, p3) {
      let d, o;
      if (this.rec) { const rec = this.rec; if (rec.quads === rec.cap) this.growRec(); d = rec.data; o = rec.quads++ * 4 * FLOATS; }
      else { if (this.quads === MAX_QUADS) this.flush(); d = this.data; o = this.quads++ * 4 * FLOATS; }
      d[o] = x0; d[o + 1] = y0; d[o + 2] = u0; d[o + 3] = v0; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = kind; d[o + 9] = p1; d[o + 10] = p2; d[o + 11] = p3; o += FLOATS;
      d[o] = x1; d[o + 1] = y1; d[o + 2] = u1; d[o + 3] = v0; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = kind; d[o + 9] = p1; d[o + 10] = p2; d[o + 11] = p3; o += FLOATS;
      d[o] = x2; d[o + 1] = y2; d[o + 2] = u1; d[o + 3] = v1; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = kind; d[o + 9] = p1; d[o + 10] = p2; d[o + 11] = p3; o += FLOATS;
      d[o] = x3; d[o + 1] = y3; d[o + 2] = u0; d[o + 3] = v1; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = kind; d[o + 9] = p1; d[o + 10] = p2; d[o + 11] = p3;
    }
    // A cell of an atlas drawn upright at a device-pixel position, or
    // turned about a centre.
    glyph(canvas, sx, sy, sw, sh, dx, dy, dw, dh, alpha) {
      const t = this.texture(canvas); this.setTexture(t);
      this.quad(dx, dy, dx + dw, dy, dx + dw, dy + dh, dx, dy + dh, sx / t.w, sy / t.h, (sx + sw) / t.w, (sy + sh) / t.h, alpha, alpha, alpha, alpha, 0, 0, 0, 0);
    }
    turned(canvas, sx, sy, sw, sh, cx, cy, dw, dh, turn, alpha) {
      const t = this.texture(canvas); this.setTexture(t);
      const c = Math.cos(turn), s = Math.sin(turn), hx = dw / 2, hy = dh / 2;
      this.quad(cx - hx * c + hy * s, cy - hx * s - hy * c, cx + hx * c + hy * s, cy + hx * s - hy * c, cx + hx * c - hy * s, cy + hx * s + hy * c, cx - hx * c - hy * s, cy - hx * s + hy * c,
        sx / t.w, sy / t.h, (sx + sw) / t.w, (sy + sh) / t.h, alpha, alpha, alpha, alpha, 0, 0, 0, 0);
    }
    rect(x, y, w, h, r, g, b, a) { this.quad(x, y, x + w, y, x + w, y + h, x, y + h, 0, 0, 0, 0, r * a, g * a, b * a, a, 1, 0, 0, 0); }
    image(canvas, x, y, w, h) {
      const t = this.texture(canvas); this.setTexture(t);
      this.quad(x, y, x + w, y, x + w, y + h, x, y + h, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0);
    }
    halo(cx, cy, r, cr, cg, cb, a, mid, stop) {
      this.quad(cx - r, cy - r, cx + r, cy - r, cx + r, cy + r, cx - r, cy + r, -1, -1, 1, 1, cr, cg, cb, 1, 2, a, mid, stop);
    }
    // Recording keeps the quads and their texture runs aside instead of
    // drawing them; the result is a clip that play() draws in one go.
    record() { this.rec = { data: new Float32Array(4096 * 4 * FLOATS), cap: 4096, quads: 0, segments: [], tex: null, start: 0 }; }
    growRec() { const rec = this.rec, bigger = new Float32Array(rec.cap * 2 * 4 * FLOATS); bigger.set(rec.data); rec.data = bigger; rec.cap *= 2; }
    closeSegment() { const rec = this.rec; if (rec.quads > rec.start) rec.segments.push({ tex: rec.tex, start: rec.start, count: rec.quads - rec.start }); rec.start = rec.quads; }
    endRecord() {
      const gl = this.gl, rec = this.rec; this.closeSegment(); this.rec = null;
      // The index buffer covers MAX_QUADS, so a long clip is cut into
      // chunks with a vertex buffer each.
      const clip = { chunks: [] };
      for (let from = 0; from < rec.quads; from += MAX_QUADS) {
        const count = Math.min(MAX_QUADS, rec.quads - from), vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, rec.data.subarray(from * 4 * FLOATS, (from + count) * 4 * FLOATS), gl.STATIC_DRAW);
        const segments = [];
        for (const s of rec.segments) {
          const a = Math.max(s.start, from), b = Math.min(s.start + s.count, from + count);
          if (b > a) segments.push({ tex: s.tex, start: a - from, count: b - a });
        }
        clip.chunks.push({ vbo, segments });
      }
      this.point(this.vbo);
      return clip;
    }
    play(clip, ox, oy) {
      if (!clip) return;
      const gl = this.gl; this.flush();
      gl.uniform2f(this.uOffset, ox, oy);
      for (const chunk of clip.chunks) {
        this.point(chunk.vbo);
        for (const s of chunk.segments) { gl.bindTexture(gl.TEXTURE_2D, s.tex ? s.tex.tex : this.blank); gl.drawElements(gl.TRIANGLES, s.count * 6, gl.UNSIGNED_SHORT, s.start * 12); this.calls++; }
      }
      gl.uniform2f(this.uOffset, 0, 0);
      this.point(this.vbo);
    }
    free(clip) { if (clip) for (const chunk of clip.chunks) this.gl.deleteBuffer(chunk.vbo); }
    dispose() {
      const gl = this.gl;
      for (const [, t] of this.textures) gl.deleteTexture(t.tex);
      this.textures.clear();
      this.freeLayers();
      gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); gl.deleteTexture(this.blank); gl.deleteProgram(this.prog);
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    }
  }
  window.GlyphGL = GlyphGL;
})();
