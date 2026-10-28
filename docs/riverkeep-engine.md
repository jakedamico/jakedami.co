# The glyph engine: how a scene draws

Written Oct 28 2026, after the first scene (riverkeep) was moved onto the
engine. Read this before starting a second scene; it is the contract a
scene keeps so it inherits the speed and the smoothness for free.

The engine is `portfolio/themes/glyphs-gl.js`. A scene is a class like
`RiverKeep` in `portfolio/themes/riverkeep.js`; the pieces a second scene
shares with it (the colour table, `buildAtlas`, the helpers below, the
crane) should move into a common module when that scene arrives, not
before.

## What the engine is

Everything on screen is a quad: a glyph cut from a pre-coloured atlas
canvas, a flat background rectangle, a baked image, or a soft radial halo.
The engine batches them into instanced WebGL draws, one record of 16
floats per quad, a handful of draw calls a frame. The pixels are the same
as the 2D canvas path's: the same atlases uploaded as textures, sampled
nearest-neighbour at the same device-pixel positions. Without WebGL or
instancing (or with `?gl=0`) the scene draws the same frame through a 2D
context, one call at a time; that path is the reference, not a second
design.

## What a scene must do

- **Draw only through the scene helpers**: `glyph` / `sheetGlyph` (a cell of
  an atlas), `rect` (background colour, optional alpha), `image` (a baked
  canvas), `halo` (a radial gradient), `disc` (a solid background disc),
  `shift` / `unshift` (a vertical offset for everything drawn in between).
  Each routes to the engine when it is on, else to the 2D context. Never
  touch `this.ctx` directly in a per-frame path: under the engine it is
  null outside a bake, so a stray use throws in testing rather than
  silently drawing nowhere.
- **Atlases**: `buildAtlas(font, cw, ch, palettes, weight, chars, glow)`
  makes a sheet of every glyph in every palette at every brightness level
  (and a warm-tinted twin). A sheet is a canvas; the engine makes its
  texture on first use and remembers it on the canvas. Keep sheets under
  4096 px on a side. Zero a canvas (`canvas.width = 0`) to hand its texture
  back; never let an old sheet linger.
- **Device pixels**: glyph positions snap to whole device pixels in `blit`;
  anything else the scene positions should do the same (`Math.round(x *
  dpr) / dpr`) so the engine and 2D paths stay identical.
- **Bakes**: a static glowing layer (the Milky Way haze, the moon) is drawn
  once into an offscreen 2D canvas with `shadowBlur`, by swapping
  `this.ctx` to that canvas's context around the glyph calls, then drawn
  per frame with `image()`. Rebuild on resize only.
- **Still content** is recorded, not redrawn: `gl.record()`, draw it once,
  `gl.endRecord()` gives a clip; `gl.play(clip, ox, oy)` draws it each
  frame from the GPU with an offset. Re-record only when its inputs change
  (riverkeep keys the static world on the moonlight). Record with the
  shift at zero and play with the shift.
- **Warm up offscreen**: anything heavy that will be needed later (atlas
  textures, the static clip, a layer, the scene's first draw and first
  update) is done while nothing moves (`warm()`), so no first frame pays
  for it. The scene's first draw of a page load runs about four times
  slower while the browser compiles it.

## Camera moves: layers

A camera move is a page scroll, not a redraw: the content is drawn into
offscreen layers at its own rate and the layers slide at the display's.

- `gl.layer(name, w, h)` makes a named offscreen target; `gl.target(layer,
  bg)` sends the following quads into it (cleared to `bg` if given);
  `gl.target(null)` returns to the screen; `gl.draw(layer, x, y)` slides it.
  Layers are remade when their size changes and freed with the thing they
  belong to.
- **While a move runs, the loop draws every display frame**; otherwise the
  scene draws at 30 frames a second. A frame does at most one redraw job.
- **Redraw a layer only where the screen can show it** before its next
  redraw (`this.cull`, a band in page pixels with a margin of 64 px, which
  covers two frames of the fastest crane), and **only while it is in
  view**.
- **Alternate layers on alternate frames** so each refreshes at 30 Hz on a
  60 Hz display. When one layer is off screen the other may take both
  frames: then it is drawn in two halves into a back buffer, swapped in
  when both are in. The halves are a stateful sequence, never keyed to
  frame parity (keyed to parity, a pair could begin with the second half
  drawn over a stale buffer).
- **Clocks run only while their content can be seen.** The scene's clock
  pauses during the hold and while a crane has the scene off screen; the
  sky's clock runs with the intro. A clock that runs unseen makes its
  content leap ahead at the next visible redraw.
- **The resting state draws through its layer too** (the hold draws the
  sky into the sky layer, the scene at rest into the scene layer), so a
  move starts with every layer current and nothing to do on its first
  frame.

## Budgets

- A phone is about six times slower than headless Chrome at 1x, and
  slower again on a low battery. Profile at 4x and 8x CPU throttling
  (`Emulation.setCPUThrottlingRate`), and read the real numbers off the
  phone with `?stats=1`: display rate, frames dropped in the last crane,
  worst gap, redraw jobs.
- A redraw job must fit a 60 Hz frame with room for the slide and the
  browser: aim under 10 ms on the phone, which is about 3 ms at 4x.
- The engine's per-glyph cost is ~0.1 us at 4x; a frame's cost is the
  scene's logic (sampling water, sampling a globe, laying out figures), not
  the drawing. Cache what does not change (figure marks while the figure
  is still, flower parts per viewport, per-cell constants), and spread what
  must change (half the water cells per redraw during a move, interleaved).

## Proving a change

- **Pixel parity**: a frozen frame through the engine must match the 2D
  path. Freeze the state (`paused`, fixed `time` and `intro.clock`), render
  once in each mode, diff the screenshots; differences should be a few
  pixels (the hold) or only things that genuinely differ between two page
  loads (the wandering figures).
- **Continuity**: track the scene time baked into the layer on screen,
  frame by frame, through a round trip; no step beyond a couple of frames.
- **Behaviour**: the intro (new visit, reload, reduced motion, taps during
  the hold, links gated until arrival, replay), the gestures, the crane as
  navigation (auto-descent, chevrons, keys, wheel).

These scripts live outside the repo for now (the Oct 26-28 scratch
folder: `prof4.js`, `bench2.js`, `phases.js`, `same.js`, `continuity2.js`,
`checks.js`, `nav.js`, `gestures.js`); fold the useful ones into a tools
folder at the repo root when the second scene starts.
