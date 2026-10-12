// River Keep: an original, oblique-view world drawn entirely with ASCII.
// A small CPU depth buffer gives architecture, terrain and glyph actors the
// same projection and occlusion. Geometry is sampled into character cells;
// it is never painted as a solid silhouette underneath the characters.
// Static world sampling is cached. Sky, lighting, water and living
// details animate on that cache, using a pre-colored character atlas.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const BG = '#080f18';
  const ACTOR = {font:7.5,cw:4.75,ch:7.5};
  const CAMPER = {font:9.5,cw:5.9,ch:10};
  const Folk = window.__folk;
  const PONY_HEAD = {scale:.88,firstColumn:5,rows:3,pivotColumn:6,pivotRow:3};
  const CAMERA = {yaw:.52,pitch:.58};
  // Signpost lettering gets its own larger glyph sheets so the links stay
  // legible on a phone. Boards are listed top to bottom; y is each board's
  // lower edge above the post's foot, len and h its size in world units.
  const SIGN = {font:16,cw:9.9,ch:16};
  const SIGN_TITLE = {font:12,cw:7.4,ch:12};
  const SIGN_GLYPHS = ' abcdefghijklmnopqrstuvwxyz._';
  const SIGN_BOARDS = [
    {text:'building stuff',title:true,len:17.8,h:5.7,y:18.3},
    {text:'linkedin',len:16.7,h:6.7,y:10.9},
    {text:'instagram',len:16.7,h:6.7,y:3.5},
  ];
  // Firefly lettering (?links=fireflies; the signpost is the default): the
  // same lines float over the meadow, each letter one glowing firefly.
  // Glyph cells are padded so the glow fits around each letter. Rows are
  // screen offsets above the anchor on the ground.
  const FLY_TEXT = {font:12,cw:7.4,ch:12,pad:14};
  const FLY_TITLE = {font:9.5,cw:5.8,ch:10,pad:12};
  const FLY_ROWS = [-68,-40,-12];
  const SPRITES = {
    dog:[' /\\   ','(o)__ ',' /##\\~',' | |  '],
    // Redrawn compact pony inspired by https://ascii.co.uk/art/horse.
    // Closed outlines keep the muzzle readable as the head scales down.
    pony:['      /\\     ','     / o \\_  ',' ____/ ____) ','~\\##\\__/     ','  \\___/      ','  || ||      ','  /| |\\      '],
    ponyStep:['      /\\     ','     / o \\_  ',' ____/ ____) ','~\\##\\__/     ','  \\___/      ','  /| |\\      ','  |/ \\|      '],
    ponyMask:['      xx     ','     xxxxxx  ',' xxxxxxxxxxx ','xxxxxxxx     ','  xxxxx      ','  xx xx      ','  xx xx      '],
    rabbit:[' || ',' (o)','(__)'],
  };
  const GLYPHS = " .,:;'`-_=~|/\\+*oO08%&#@MWY^v<>[](){}!x";
  const GI = Object.fromEntries([...GLYPHS].map((c, i) => [c, i]));
  const MAT = { sky: 0, grass: 1, water: 2, stone: 3, tree: 4, wood: 5, path: 6, rock: 7, roof: 8, dark: 9, warm: 10, shrub: 11, bark: 12, canvas: 13, earth: 14 };
  const COLORS = {
    sky: [56, 78, 99], grass: [97, 146, 86], water: [69, 111, 133],
    stone: [193, 209, 217], tree: [61, 115, 94], wood: [119, 102, 74],
    path: [125, 125, 101], rock: [92, 120, 128], roof: [112, 149, 166],
    dark: [24, 34, 44], warm: [255, 177, 76], star: [193, 213, 215],
    moon: [227, 234, 207], fire: [255, 150, 53], pink: [214, 154, 173],
    cream: [233, 219, 152], lilac: [173, 163, 208], blue: [119, 179, 200],
    fly: [219, 231, 139], cloth: [160, 178, 187],
    deer: [170, 135, 91], ember: [255, 206, 103], moss: [98, 129, 86],
    shrub: [89, 139, 78], bark: [176, 111, 60],
    canvas: [184, 161, 122], earth: [140, 112, 77],
  };
  const MATERIAL_NAMES = ['sky', 'grass', 'water', 'stone', 'tree', 'wood', 'path', 'rock', 'roof', 'dark', 'warm', 'shrub', 'bark', 'canvas', 'earth'];
  const PALETTE_NAMES = Object.keys(COLORS);
  const PAL = Object.fromEntries(PALETTE_NAMES.map((n, i) => [n, i]));
  const LEVELS = 16;
  const MOON_LIGHT = { x: .72, y: .92, z: .48 };
  // Seconds per water flow-map cycle; see waterSample.
  const FLOW_PERIOD = 8;
  // One scene scale and one pixel coordinate system. Viewports reveal a
  // crop around its center; scene objects never move or shrink to fit.
  const VIEW = { width:1200, height:900, originX:560, originY:441, scale:6.75 };
  // Sky layouts in scene pixels. On desktop the Milky Way rises from the
  // eastern horizon and arcs up over the castle, with the moon clear of it in
  // the upper right. Portrait phones see only the castle's left side to just
  // past the camp, so there the band climbs from the hill beside the camp to
  // above the castle's left side, and the moon hangs over the camp.
  const skyBand = (x, y, dx, dy) => { const a = Math.atan2(dy, dx); return { x, y, cos:Math.cos(a), sin:Math.sin(a), core:44, width:115 }; };
  const SKY_LAYOUTS = {
    desktop: { band:skyBand(400, -40, 900, 500), moon:{ x:1090, y:72, r:24 } },
    mobile: { band:skyBand(420, -91, 340, 290), moon:{ x:690, y:30, r:24 } },
  };
  const fract = x => x - Math.floor(x);
  function hash(x, z, salt = 0) {
    let v = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt + 17, 1274126177);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, z, salt = 0) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
    return mix(mix(hash(ix, iz, salt), hash(ix + 1, iz, salt), u), mix(hash(ix, iz + 1, salt), hash(ix + 1, iz + 1, salt), u), v);
  }
  function fbm(x, z) { return noise(x, z, 2) * .62 + noise(x * 2.1, z * 2.1, 6) * .26 + noise(x * 4.3, z * 4.3, 9) * .12; }
  const riverX = z => 8 + 10 * Math.sin((z + 14) * .037) + z * .045;
  // The river stays slim in the foreground, leaving phones meadow to see.
  const riverWidth = z => 4.2 + smooth(-10, 65, z) * 5.5 + 2.4*Math.exp(-Math.pow((z+1)/11,2));
  const riverDistance = (x, z) => Math.abs(x - riverX(z)) - riverWidth(z);
  function height(x, z) {
    const land = .8 + fbm(x * .055, z * .05) * 1.7;
    const island = Math.hypot((x + 19) / 21, (z + 23) / 17);
    const plateau = (1 - smooth(.71, 1.13, island)) * 4.0;
    const bank = smooth(-.7, 2.9, riverDistance(x, z));
    return mix(-.75, land + plateau, bank);
  }
  // The eastern trail's centre line, winding from the camp to the bridge.
  const trailX = z => 27 + Math.sin((z - 2) * .085) * 6;
  function pathDistance(x, z) {
    // Gate path turns toward the bridge; the eastern path winds to camp.
    const gate = Math.hypot((x + 18) * .75, Math.max(0, -13 - z), Math.max(0, z + 1));
    const west = Math.hypot(Math.max(0, -18 - x), Math.max(0, x), (z + 1) * 1.2);
    const east = Math.hypot(x - trailX(z), Math.max(0, -2 - z)) * .8;
    return Math.min(gate, west, east);
  }

  class RiverKeep {
    constructor(canvas, content) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.content = content;
      this.time = 0;
      this.detail = 'fine';
      this.camera = { x:0, y:0 };
      this.paused = false;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.moonlight = .9;
      this.meteors = [];
      this.ripples = [];
      this.sparks = [];
      this.nextMeteor = 4;
      this.satellite = null;
      this.nextSatellite = 15;
      this.sky = 'new';
      this.bandOut = {};
      this.cursor = { x: -999, y: -999, active: false };
      this.signHover = -1;
      this.reader = null;
      this.linkStyle = new URLSearchParams(location.search).get('links')==='fireflies' ? 'fireflies' : 'sign';
      this.lights = [];
      this.polygons = [];
      this.trees = [];
      this.shrubs = [];
      this.windows = [];
      this.waterOut = { g:0,p:0,b:0 };
      this.makeWorld();
      this.resize();
    }

    project(x, y, z) {
      const q = this.projection;
      return {
        x: q.originX + (q.cy * x - q.sy * z) * q.scale,
        y: q.origin + (q.sp * (q.sy * x + q.cy * z) - q.cp * y) * q.scale,
        d: q.cp * (q.sy * x + q.cy * z) + q.sp * y,
      };
    }
    groundAt(px, py) {
      const q = this.projection;
      const u = (px - q.originX) / q.scale;
      const v = (py - q.origin) / q.scale;
      let y = 0, x = 0, z = 0;
      for (let i = 0; i < 9; i++) {
        const a = (v + q.cp * y) / q.sp;
        x = q.cy * u + q.sy * a;
        z = -q.sy * u + q.cy * a;
        y = Math.max(0, height(x, z));
      }
      return { x, y, z, d: q.cp * (q.sy * x + q.cy * z) + q.sp * y };
    }
    addPoly(points, material, shade = 1, tag = 0, surface = null) { this.polygons.push({ points, material, shade, tag, surface }); }
    box(x, y, z, w, h, d, material = MAT.stone, surface = null) {
      const a = x - w / 2, b = x + w / 2, c = z - d / 2, e = z + d / 2, t = y + h;
      this.addPoly([[a,y,e],[b,y,e],[b,t,e],[a,t,e]], material, .51, 0, {normal:[0,0,1],...surface});
      this.addPoly([[b,y,c],[b,y,e],[b,t,e],[b,t,c]], material, .86, 0, {normal:[1,0,0],...surface});
      this.addPoly([[a,y,c],[a,y,e],[a,t,e],[a,t,c]], material, .20, 0, {normal:[-1,0,0],...surface});
      this.addPoly([[a,t,c],[b,t,c],[b,t,e],[a,t,e]], material, 1.03, 0, {normal:[0,1,0],...surface});
    }
    cylinder(x, y, z, r, h, material = MAT.stone, segments = 40, part = 'shaft') {
      const top = [];
      for (let i = 0; i < segments; i++) {
        const a = i * TAU / segments, b = (i + 1) * TAU / segments;
        const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
        const bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
        this.addPoly([[ax,y,az],[bx,y,bz],[bx,y+h,bz],[ax,y+h,az]], material, 1, 0, {kind:'round',x,z,r,base:y,height:h,part});
        top.push([ax,y+h,az]);
      }
      if(part!=='shaft'&&part!=='cornice') this.addPoly(top, material, 1.05, 0, {normal:[0,1,0],part:'top'});
    }
    towerCrown(x,y,z,outer,inner) {
      // Open annular lip: its elliptical top is real geometry. A low floor
      // and dark inner wall keep the opening visibly recessed from the rim.
      const floor=[];
      for(let i=0;i<40;i++) {
        const a=i*TAU/40,b=(i+1)*TAU/40;
        const p=(angle,r,yy)=>[x+Math.cos(angle)*r,yy,z+Math.sin(angle)*r];
        this.addPoly([p(a,outer,y-.68),p(b,outer,y-.68),p(b,outer,y),p(a,outer,y)],MAT.stone,1,0,{kind:'round',x,z,r:outer,base:y-.68,height:.68,part:'rim'});
        this.addPoly([p(a,outer,y),p(b,outer,y),p(b,inner,y),p(a,inner,y)],MAT.stone,1.10,0,{normal:[0,1,0],part:'top'});
        this.addPoly([p(a,inner,y-1.65),p(a,inner,y),p(b,inner,y),p(b,inner,y-1.65)],MAT.stone,.18,0,{kind:'round',x,z,r:inner,base:y-1.65,height:1.65,part:'inside'});
        floor.push(p(a,inner,y-1.65));
      }
      this.addPoly(floor,MAT.dark,.15,0,{normal:[0,1,0],part:'inside'});
    }
    tower(x, z, r, h, base = 5) {
      this.castleVolumes.push({kind:'round',x,z,r:r*1.02,base,top:base+h});
      this.cylinder(x, base, z, r * 1.14, .75,MAT.stone,40,'foot');
      this.cylinder(x, base + .75, z, r, h - 1.60);
      for(const yy of [base+2.65,base+h*.57]) this.cylinder(x,yy,z,r*1.035,.20,MAT.stone,40,'belt');
      this.cylinder(x,base+h-1.10,z,r*1.30,.30,MAT.stone,40,'cornice');
      this.towerCrown(x,base+h,z,r*1.30,r*.82);
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10;
        this.box(x + Math.cos(a) * r, base + h, z + Math.sin(a) * r, 1.0, 1.25, 1.0);
      }
      for (let y = base + 3; y < base + h - 1.8; y += 3.6) {
        for (const a of [.7, 1.45, 2.35]) {
          const wx = x + Math.cos(a) * (r + .035), wz = z + Math.sin(a) * (r + .035);
          this.window(wx, y, wz, .53, 1.15, a, hash(Math.round(x), Math.round(y), Math.round(a * 10)) > .28);
        }
      }
    }
    window(x, y, z, w, h, angle = Math.PI / 2, lit = true) {
      const dx = -Math.sin(angle) * w / 2, dz = Math.cos(angle) * w / 2;
      const points = [[x-dx,y,z-dz],[x+dx,y,z+dz],[x+dx,y+h*.77,z+dz],[x,y+h,z],[x-dx,y+h*.77,z-dz]];
      const tag = this.windows.length + 1;
      this.windows.push({ x, y: y + h / 2, z, lit, phase: tag * 1.7 });
      this.addPoly(points, lit ? MAT.warm : MAT.dark, lit ? .85 : .7, tag);
    }
    wall(x, z, w, h, d, base = 5) {
      this.box(x, base, z, w, h, d);
      this.box(x, base + h - .6, z, w + .15, .5, d + .4);
      for (let a = -w / 2 + .55; a < w / 2; a += 1.75) this.box(x + a, base + h, z, .88, .85, d);
    }
    makeWorld() {
      this.polygons.length = 0; this.trees.length = 0;
      this.shrubs.length = 0;
      this.windows.length = 0; this.lights.length = 0;
      this.castleVolumes = [
        {kind:'box',min:[-25.5,4.9,-30],max:[-12.5,16.3,-20]},
        {kind:'box',min:[-28.5,5,-16.325],max:[-9.5,11.2,-14.875]},
        {kind:'box',min:[-29.7,5,-30],max:[-28.3,11,-19]},
        {kind:'box',min:[-8.4,5,-29],max:[-7,12,-17]},
      ];
      // The camp keeps its place in the frame; the slimmer river leaves it
      // a wider strip of meadow down to the bank.
      this.fire = { x:riverX(30)+18.2, z:30 };
      this.fire.y = height(this.fire.x, this.fire.z);
      // The page's signpost (DOM boards) stands in the meadow west of the
      // bend: inside a phone's crop, clear of the bridge and the camp.
      this.sign = { x:1.92, z:43.9 };
      this.sign.y = height(this.sign.x, this.sign.z);
      // Asymmetric keep: tall rear watchtower, open parapets and a low gatehouse.
      this.box(-19, 4.9, -25, 13, 11.4, 10);
      this.wall(-19, -19.8, 13.3, 11.7, .8, 4.9);
      this.wall(-19, -30.2, 13.3, 11.7, .8, 4.9);
      this.box(-25.4, 16.3, -25, .8, .65, 10);
      this.box(-12.6, 16.3, -25, .8, .65, 10);
      this.box(-19, 16.1, -25, 11.5, .25, 8.3, MAT.dark);
      this.tower(-29, -19, 3.1, 13.4);
      this.tower(-7.7, -17, 3.7, 15.7);
      this.tower(-27, -31, 2.8, 17.0);
      // The rear-right tower anchors the far corner. Its lower crown sits
      // apart from the roof ridge and the taller foreground tower.
      this.tower(-8, -31, 2.75, 14.8);
      this.wall(-19, -15.6, 19, 6.2, 1.45);
      this.box(-29, 5, -24.5, 1.4, 6, 11);
      this.box(-7.7, 5, -23, 1.4, 7, 12);
      for (const x of [-22.6, -18.8, -15.1]) {
        this.window(x, 12.8, -19.35, .86, 1.6, Math.PI / 2, x !== -18.8);
        this.window(x, 8.9, -19.35, .7, 1.4);
      }
      // Gate opening, bevel and individual voussoirs around its arched head.
      const gx = -18.7, gz = -14.83, gy = 4.95, radius = 1.6, spring = 2.9;
      const gate = [[gx-radius,gy,gz],[gx+radius,gy,gz],[gx+radius,gy+spring,gz]];
      for (let i = 0; i <= 12; i++) { const a = i * Math.PI / 12; gate.push([gx + Math.cos(a) * radius, gy + spring + Math.sin(a) * radius, gz]); }
      this.addPoly(gate, MAT.dark, .12);
      for (let i = 0; i < 11; i++) {
        const a = i * Math.PI / 11, b = (i + 1) * Math.PI / 11;
        this.addPoly([[gx+Math.cos(a)*1.65,gy+spring+Math.sin(a)*1.65,gz+.04], [gx+Math.cos(b)*1.65,gy+spring+Math.sin(b)*1.65,gz+.04], [gx+Math.cos(b)*2.2,gy+spring+Math.sin(b)*2.2,gz+.04], [gx+Math.cos(a)*2.2,gy+spring+Math.sin(a)*2.2,gz+.04]], MAT.stone, .92);
      }
      this.box(gx - 1.94, gy, gz, .6, spring, .18);
      this.box(gx + 1.94, gy, gz, .6, spring, .18);
      for (let x = gx - 1.1; x < gx + 1.4; x += .55) this.box(x, gy, gz + .03, .09, 3.8, .05, MAT.wood);
      for (const x of [gx - 2.9, gx + 2.9]) {
        this.box(x, gy + 2, gz + .3, .22, .6, .2, MAT.wood);
        this.lights.push({ x, y: gy + 2.9, z: gz + .7, r: 5.3, power: .8, phase: x });
      }
      // Rear slate gable and a narrow chimney peek over the curtain wall.
      this.box(-19, 16.4, -27, 6, 2.5, 4, MAT.stone);
      this.addPoly([[-22.5,18.9,-29.5],[-15.5,18.9,-29.5],[-19,22,-29.5]], MAT.roof, .45);
      this.addPoly([[-22.5,18.9,-24.5],[-15.5,18.9,-24.5],[-19,22,-24.5]], MAT.stone, .58,0,{normal:[0,0,1]});
      this.addPoly([[-22.5,18.9,-24.5],[-19,22,-24.5],[-19,22,-29.5],[-22.5,18.9,-29.5]], MAT.roof, .44);
      this.addPoly([[-19,22,-24.5],[-15.5,18.9,-24.5],[-15.5,18.9,-29.5],[-19,22,-29.5]], MAT.roof, 1.04);
      this.box(-19,21.9,-27,.28,.25,5.5,MAT.roof);
      this.box(-15.5,18.72,-27,.25,.18,5.5,MAT.dark);
      this.window(-19,19.1,-24.46,.65,1.15,Math.PI/2,true);
      this.box(-17.2, 19, -27.6, .7, 3.8, .7);
      // Increase the castle itself, preserving a shared world for later
      // camera panning. All normals, lights and occluders follow the geometry.
      const enlarge=p=>[-19+(p[0]+19)*1.20,5+(p[1]-5)*1.10,-23+(p[2]+23)*1.20];
      for(const poly of this.polygons) {
        poly.points=poly.points.map(enlarge);
        if(poly.surface?.kind==='round') {
          const surface=poly.surface,center=enlarge([surface.x,surface.base,surface.z]);
          surface.x=center[0];surface.base=center[1];surface.z=center[2];surface.r*=1.20;surface.height*=1.10;
        }
      }
      for(const volume of this.castleVolumes) {
        if(volume.kind==='round') {const p=enlarge([volume.x,volume.base,volume.z]);volume.x=p[0];volume.base=p[1];volume.z=p[2];volume.r*=1.20;volume.top=5+(volume.top-5)*1.10;}
        else {volume.min=enlarge(volume.min);volume.max=enlarge(volume.max);}
      }
      for(const detail of [...this.windows,...this.lights]) {const p=enlarge([detail.x,detail.y,detail.z]);detail.x=p[0];detail.y=p[1];detail.z=p[2];if(detail.r)detail.r*=1.20;}
      this.flag=enlarge([-27,23.4,-31]);
      this.chimney=enlarge([-17.2,22.8,-27.6]);
      // A short footbridge: a level deck on two stone posts standing in the
      // water, reached from each bank by a railed walking ramp.
      const bridgeStart=this.polygons.length;
      const bx=riverX(-1),bz=-1,deck=5.4,half=1.35,span=7.6,run=6.4,start=bx-span,end=bx+span;
      const foot=side=>{const x=bx+side*(span+run);return [x,height(x,bz)+.12];};
      // Handrails are drawn as strokes (drawBridgeRails); thin geometry
      // falls between the character cells at this distance.
      this.bridge={x:bx,z:bz,deck,half,start,end,piers:[bx-3.1,bx+3.1],rail:[foot(-1),[start,deck+.25],[end,deck+.25],foot(1)]};
      for(const x of this.bridge.piers) {
        this.box(x,-.65,bz,1.6,deck-.15,half*2-.2,MAT.stone,{part:'bridgePier'});
        this.box(x,-.30,bz,2.1,.45,half*2+.3,MAT.rock);
        // A cutwater parts the current on the downstream face.
        const tip=bz+half+.85;
        this.addPoly([[x-.62,-.2,bz+half],[x,-.2,tip],[x,1.0,tip],[x-.62,1.0,bz+half]],MAT.rock,.51);
        this.addPoly([[x,-.2,tip],[x+.62,-.2,bz+half],[x+.62,1.0,bz+half],[x,1.0,tip]],MAT.rock,.84);
        this.addPoly([[x-.62,1.0,bz+half],[x,1.0,tip],[x+.62,1.0,bz+half]],MAT.rock,1.0);
      }
      this.box(bx,deck-.8,bz,span*2,.8,half*2,MAT.wood,{part:'bridgeBeam'});
      this.box(bx,deck,bz,span*2+.1,.25,half*2,MAT.path,{part:'bridgeDeck'});
      for(const side of [-1,1]) {
        const top=bx+side*span,[low,lowY]=foot(side);
        const base=Math.min(height(top,bz),deck)-.4;
        this.addPoly([[top,deck+.25,bz-half],[low,lowY,bz-half],[low,lowY,bz+half],[top,deck+.25,bz+half]],MAT.path,.66,0,{part:'bridgeDeck'});
        this.addPoly([[top,deck+.25,bz+half],[low,lowY,bz+half],[low,lowY-.5,bz+half],[top,base,bz+half]],MAT.stone,.62,0,{part:'bridgeWall'});
        this.addPoly([[top,deck+.25,bz-half],[top,deck+.25,bz+half],[top,base,bz+half],[top,base,bz-half]],MAT.stone,.45,0,{part:'bridgeWall'});
      }
      for (const x of [start+1,end-1]) {
        this.box(x,deck+.25,bz+half,.16,1.35,.16,MAT.wood);
        this.box(x,deck+1.60,bz+half,.44,.48,.40,MAT.warm);
        this.box(x,deck+2.08,bz+half,.54,.10,.50,MAT.roof);
        this.lights.push({x,y:deck+1.8,z:bz+half,r:10.5,power:.70,phase:x});
      }
      for(let i=bridgeStart;i<this.polygons.length;i++)this.polygons[i].surface={...this.polygons[i].surface,bridge:true};

      // Trees are irregular layered crowns, rather than identical cones.
      for (let i = 0; i < 155; i++) {
        const x = -91 + hash(i, 3) * 183, z = -55 + hash(i, 5) * 18;
        if (riverDistance(x, z) < 3 || (x > -36 && x < -3 && z > -40)) continue;
        const r=2.0+hash(i,9)*3.1;
        this.trees.push({ x, z, y: height(x, z), h: Math.max(r*2.15,4+hash(i,7)*6), r, seed: i });
      }
      for (let i = 0; i < 45; i++) {
        const z = -28 + hash(i, 19) * 85;
        const x = i % 2 ? riverX(z) + riverWidth(z) + 18 + hash(i, 20) * 26 : -43 - hash(i, 21) * 22;
        const r=2.8+hash(i,25)*2.6;
        this.trees.push({ x, z, y: height(x, z), h: Math.max(r*2.65,7+hash(i,24)*7), r, seed: i + 160 });
      }
      for(const [x,z,h,r,seed] of [[-27,12,11,3.25,400],[-25,39,12,3.8,401],[riverX(46)+riverWidth(46)+10,46,12,3.7,402],[riverX(5)+riverWidth(5)+11,5,11,3.2,403]]) {
        this.trees.push({x,z,y:height(x,z),h,r,seed});
      }
      this.trees=this.trees.filter(tree=>{
        const ahead=tree.z-this.fire.z;
        const sightline=this.fire.x+2+Math.tan(.52)*ahead;
        const screensCamp=ahead>0&&ahead<23&&Math.abs(tree.x-sightline)<6+tree.r;
        return this.campDistance(tree.x,tree.z)>1.45&&!screensCamp;
      });
      // Low clusters follow the banks and woodland edges. Leave open ground
      // around the camp and paths, and keep the castle's silhouette clear.
      for(let i=0;i<46;i++) {
        const z=-6+hash(i,260)*113,side=i%2?1:-1;
        const x=riverX(z)+side*(riverWidth(z)+2.8+hash(i,261)*8);
        if(pathDistance(x,z)<2.4||this.campDistance(x,z)<1.20||riverDistance(x,z)<1.5||Math.hypot(x-this.sign.x,z-this.sign.z)<5)continue;
        this.shrubs.push({x,z,y:height(x,z),r:1.1+hash(i,262)*1.7,h:.8+hash(i,263)*1.1,seed:i+600});
      }
      for(const tree of this.trees) {
        if(tree.z<-25||tree.seed%4!==0||this.campDistance(tree.x+1,tree.z+.5)<1.20)continue;
        this.shrubs.push({x:tree.x+1.0,z:tree.z+.5,y:height(tree.x+1,tree.z+.5),r:1.1,h:.85,seed:tree.seed+900});
      }
      this.makeCamp();
      if(this.linkStyle==='sign') this.makeSign(); else this.makeFlyWords();
      this.wildlife={
        dog:{x:this.fire.x+11,z:this.fire.z+5.5},
        pony:{x:-27,z:18},rabbit:{x:-22,z:52},
      };
      for(const animal of Object.values(this.wildlife))animal.y=height(animal.x,animal.z)+.12;
      for (let i = 0; i < 17; i++) {
        const z = 5 + hash(i, 48) * 53, side = i % 2 ? 1 : -1;
        const x = riverX(z) + side * (riverWidth(z) + .4 + hash(i, 50) * 2.5);
        this.box(x, Math.max(0, height(x, z)) - .2, z, .7 + hash(i, 52), .45 + hash(i, 53), .8 + hash(i, 54), MAT.rock);
      }
      // Two campers keep to the fire; walkers wander the meadows on both banks.
      const camp=this.camp,f=this.fire,facing=p=>Math.atan2(f.z-p.z,f.x-p.x);
      // A small ring on the water where a bobber lands or a fish bites.
      const splash=(x,z)=>{this.ripples.push({x,z,age:0,speed:2.6});if(this.ripples.length>5)this.ripples.shift();};
      this.world={height,walkable:(x,z)=>this.walkable(x,z),splash};
      // Someone fishing from the east bank upstream of the bridge.
      const fz=-20,edge=riverX(fz)+riverWidth(fz),bob={x:edge-2.4,z:fz-.5};
      this.folk=[
        Folk.create({...camp.camper,heading:facing(camp.camper),seed:3,palette:'cloth',brightness:.91,clips:['warm','warm2','warm','rest']},this.world),
        Folk.create({...camp.friend,heading:facing(camp.friend),seed:8,palette:'cream',brightness:.80,clips:['warm2','rest','warm']},this.world),
        ...[[45,48,9,'canvas'],[34,13,6,'lilac'],[-12,46,8,'cloth']].map(([x,z,r,palette],i)=>
          Folk.create({x,z,heading:i*2.1,seed:20+i,palette,brightness:.78,speed:1.3+i*.12,home:{x,z,r}},this.world)),
        Folk.create({x:edge+1.4,z:fz,heading:Math.atan2(bob.z-fz,bob.x-edge-1.4),seed:31,palette:'cream',brightness:.80,rod:bob},this.world),
      ];
      if(this.linkStyle==='sign') this.makeReader();
      this.makeTrip();
    }

    campDistance(x,z) {
      return Math.hypot((x-this.fire.x-2)/8.3,(z-this.fire.z+.4)/6.8);
    }
    // Open ground a walker may cross: dry, gentle, and clear of the keep,
    // trees, shrubs, the camp, the signpost and the animals. The sign's
    // reader may come closer to the bank and the post (see makeReader).
    walkable(x,z,bank=3.2,post=3) {
      if(riverDistance(x,z)<bank||this.campDistance(x,z)<1.15||Math.hypot(x-this.sign.x,z-this.sign.z)<post)return false;
      if(x>-40&&x<0&&z<-10)return false;
      if(Math.hypot(height(x+.8,z)-height(x-.8,z),height(x,z+.8)-height(x,z-.8))>1.1)return false;
      for(const tree of this.trees)if(Math.abs(tree.x-x)<tree.r+1&&Math.hypot(tree.x-x,tree.z-z)<tree.r*.7+.6)return false;
      for(const shrub of this.shrubs)if(Math.hypot(shrub.x-x,shrub.z-z)<shrub.r+.5)return false;
      for(const animal of Object.values(this.wildlife))if(Math.hypot(animal.x-x,animal.z-z)<3)return false;
      return true;
    }
    makeCamp() {
      const f=this.fire,anchor=(dx,dz,lift=0)=>({x:f.x+dx,y:height(f.x+dx,f.z+dz)+lift,z:f.z+dz});
      const tent=anchor(5.3,-5.0),woodpile=anchor(4.9,2.0),pack=anchor(7.4,-1.5);
      this.camp={tent,woodpile,pack,camper:anchor(-2.7,2.0,.12),friend:anchor(3.7,1.8,.12)};
      this.lights.push({...f,y:f.y+.8,r:13.0,power:1.55,phase:3});
      // Benches follow the ground rather than inheriting the fire's height.
      for(const [dx,dz,w,d] of [[-2.9,.8,2.8,.75],[3.9,.7,2.8,.75]]) {
        const log=anchor(dx,dz);
        this.box(log.x,log.y,log.z,w,.85,d,MAT.wood,{part:'campLog'});
      }
      // A pitched canvas tent, open doorway and a little sleeping roll.
      const {x,y,z}=tent,front=z+2.1,back=z-2.1,peak=y+3.6;
      this.addPoly([[x-2.65,y,front],[x,peak,front],[x,peak,back],[x-2.65,y,back]],MAT.canvas,.65,0,{part:'tentCanvas'});
      this.addPoly([[x,peak,front],[x+2.65,y,front],[x+2.65,y,back],[x,peak,back]],MAT.canvas,.98,0,{part:'tentCanvas'});
      this.addPoly([[x-2.65,y,front+.025],[x+2.65,y,front+.025],[x,peak,front+.025]],MAT.canvas,.76,0,{part:'tentFront'});
      this.addPoly([[x-1.05,y+.03,front+.065],[x+1.05,y+.03,front+.065],[x,y+2.55,front+.065]],MAT.dark,.20);
      this.box(x,peak-.15,z,.16,.18,4.6,MAT.wood,{part:'campLog'});
      this.box(x+.8,y+.03,z+.65,1.25,.22,1.8,MAT.canvas,{part:'bedroll'});
      this.box(woodpile.x,woodpile.y,woodpile.z,2.4,.35,1.3,MAT.wood,{part:'campLog'});
      this.box(woodpile.x-.25,woodpile.y+.35,woodpile.z,1.85,.35,1.0,MAT.wood,{part:'campLog'});
      for(let i=0;i<9;i++) {
        const angle=i*TAU/9,rock=anchor(Math.cos(angle)*1.45,Math.sin(angle)*1.10);
        this.box(rock.x,rock.y+.02,rock.z,.55,.30,.48,MAT.rock);
      }
    }

    makeSign() {
      // Boards turn to face the camera (along = screen right, out = toward
      // the viewer), so their lettering runs level across the screen. They
      // are nailed across the front of one post, extending east from it.
      const s=this.sign,along=[Math.cos(CAMERA.yaw),0,-Math.sin(CAMERA.yaw)],out=[Math.sin(CAMERA.yaw),0,Math.cos(CAMERA.yaw)];
      const top=s.y+SIGN_BOARDS[0].y+SIGN_BOARDS[0].h+.5;
      this.box(s.x,s.y-.3,s.z,.85,top-s.y+.3,.85,MAT.bark,{part:'signPost'});
      s.boards=SIGN_BOARDS.map((spec,index)=>{
        const offset=spec.len/2-.6,thick=.35;
        const cx=s.x+along[0]*offset+out[0]*.45,cz=s.z+along[2]*offset+out[2]*.45,cy=s.y+spec.y+spec.h/2;
        const font=spec.title?SIGN_TITLE:SIGN;
        const board={...spec,index,x:cx,y:cy,z:cz,along,out,thick,band:font.ch*.68/(VIEW.scale*Math.cos(CAMERA.pitch)),textHalf:spec.text.length*font.cw/2/VIEW.scale};
        const corner=(u,v,w)=>[cx+along[0]*u+out[0]*w,cy+v,cz+along[2]*u+out[2]*w];
        const L=spec.len/2,H=spec.h/2,T=thick/2;
        const surface={part:'signBoard',board};
        this.addPoly([corner(-L,-H,T),corner(L,-H,T),corner(L,H,T),corner(-L,H,T)],MAT.wood,.92,0,{normal:out,...surface});
        this.addPoly([corner(-L,H,-T),corner(L,H,-T),corner(L,H,T),corner(-L,H,T)],MAT.wood,1.05,0,{normal:[0,1,0],...surface,top:true});
        this.addPoly([corner(L,-H,-T),corner(L,-H,T),corner(L,H,T),corner(L,H,-T)],MAT.wood,.55,0,{normal:along,...surface,end:true});
        return board;
      });
      // A small lantern caps the post and lights the boards beneath it.
      this.box(s.x,top,s.z,.75,.8,.75,MAT.warm);
      s.lantern={x:s.x,y:top+.4,z:s.z};
      this.box(s.x,top+.8,s.z,.95,.14,.95,MAT.roof);
      this.lights.push({x:s.x+along[0]*3,y:top-2,z:s.z+along[2]*3+1.5,r:12,power:.78,phase:5});
    }

    makeReader() {
      // The walker who lives nearest the signpost strolls over now and then,
      // stands in front of it with their back to us and reads the boards.
      const s=this.sign,board=s.boards[1],walkers=this.folk.filter(fig=>fig.home);
      const fig=walkers.sort((a,b)=>Math.hypot(a.home.x-s.x,a.home.z-s.z)-Math.hypot(b.home.x-s.x,b.home.z-s.z))[0];
      if(!fig) return;
      // Ordinary walkers keep well clear of the post and the bank, which
      // leaves no open ground near the boards. On this errand the reader may
      // step onto the dry bank and up to the post, standing just in front of
      // it so a phone's narrow crop still shows them.
      const world={height,walkable:(x,z)=>this.walkable(x,z,1.4,1.2)};
      const want={x:s.x+board.out[0]*2.1,z:s.z+board.out[2]*2.1};
      let spot=null;
      for(let r=0;r<=3&&!spot;r+=.25) for(let a=0;a<TAU&&!spot;a+=.3) {
        const x=want.x+Math.cos(a)*r,z=want.z+Math.sin(a)*r;
        if(world.walkable(x,z)) spot={x,z};
      }
      if(spot) this.reader={fig,world,spot,face:Math.atan2(board.z-spot.z,board.x-spot.x),state:'away',wait:4,timer:0};
    }
    stepReader(dt) {
      const r=this.reader,fig=r.fig;
      if(r.state==='away') {
        // Set out only from a standstill, along a clear straight line.
        r.wait-=dt;
        if(r.wait>0||fig.state!=='idle')return;
        const length=Math.hypot(r.spot.x-fig.x,r.spot.z-fig.z);
        let clear=true;
        for(let s=.5;s<length&&clear;s+=.5)clear=r.world.walkable(mix(fig.x,r.spot.x,s/length),mix(fig.z,r.spot.z,s/length));
        if(clear) {fig.target={...r.spot};fig.state='walk';r.state='going';}
        else r.wait=3;
      } else if(r.state==='going') {
        if(fig.state!=='idle')return;
        if(Math.hypot(fig.x-r.spot.x,fig.z-r.spot.z)<.6) {r.state='reading';r.timer=7+fig.random()*5;fig.timer=Infinity;}
        else {r.state='away';r.wait=8;}
      } else {
        // Turn to the boards, read a while, then wander home.
        const turn=r.face-fig.heading,delta=Math.atan2(Math.sin(turn),Math.cos(turn));
        fig.heading+=clamp(delta,-1.8*dt,1.8*dt);
        r.timer-=dt;
        if(r.timer<=0) {r.state='away';r.wait=30+fig.random()*25;fig.timer=0;}
      }
    }
    makeTrip() {
      // The lilac walker by the eastern trail goes up to the castle now and
      // then: down the trail, over the bridge and in at the gate. They stay
      // inside about a minute, walk the same way home and linger a while.
      const fig=this.folk.find(f=>f.home&&f.palette==='lilac');
      if(!fig) return;
      const b=this.bridge,[[westFoot],,,[eastFoot]]=b.rail;
      const out=[...[9,5,1].map(z=>({x:trailX(z),z})),{x:eastFoot,z:b.z},{x:b.end,z:b.z},{x:b.start,z:b.z},{x:westFoot,z:b.z},
        {x:-18,z:-1},{x:-18.3,z:-7},{x:-18.64,z:-12.9}];
      const world={height:(x,z)=>this.walkHeight(x,z),walkable:()=>true};
      this.trip={fig,out,world,rest:{x:fig.x,z:fig.z},state:'home',timer:5};
    }
    stepTrip(dt) {
      const trip=this.trip,fig=trip.fig;
      trip.timer-=dt;
      if(trip.state==='home') {
        // The route takes over from any stroll in progress.
        if(trip.timer<=0) {fig.route=trip.out.map(p=>({...p}));trip.state='out';}
      } else if(trip.state==='out') {
        if(!fig.route.length) {fig.route=null;fig.hidden=true;fig.speed=0;trip.state='inside';trip.timer=55+Math.random()*15;}
      } else if(trip.state==='inside') {
        if(trip.timer<=0) {
          fig.hidden=false;fig.heading=Math.PI/2;
          fig.route=[...trip.out.slice(0,-1).reverse(),trip.rest].map(p=>({...p}));trip.state='back';
        }
      } else if(!fig.route.length) {
        fig.route=null;fig.state='idle';fig.timer=2;trip.state='home';trip.timer=150+Math.random()*90;
      }
    }
    // Where feet land: on the bridge's ramps and deck, else the ground.
    walkHeight(x,z) {
      const {z:bz,half,rail}=this.bridge;
      if(Math.abs(z-bz)<half&&x>rail[0][0]&&x<rail[3][0]) {
        for(let i=1;i<rail.length;i++) if(x<=rail[i][0]) return mix(rail[i-1][1],rail[i][1],(x-rail[i-1][0])/(rail[i][0]-rail[i-1][0]))-.12;
      }
      return height(x,z);
    }
    makeFlyWords() {
      // Fireflies gather over the meadow west of the bend and hold the shape
      // of the page's words. Each letter's firefly starts low in the grass
      // nearby, drifts up when the page opens, then hovers with its own glow.
      const a={x:5.3,z:31.62};a.y=height(a.x,a.z);
      this.flyWords={anchor:a,lines:SIGN_BOARDS.map((spec,index)=>{
        const font=spec.title?FLY_TITLE:FLY_TEXT,n=spec.text.length;
        return {text:spec.text,title:!!spec.title,index,font,dy:FLY_ROWS[index],letters:[...spec.text].map((ch,i)=>{
          const s=index*31+i;
          let x=a.x+(hash(s,401)-.5)*26;const z=a.z+(hash(s,402)-.5)*18;
          if(riverDistance(x,z)<1.5)x=riverX(z)-riverWidth(z)-3;
          return {ch,ox:(i-(n-1)/2)*font.cw,from:{x,y:height(x,z)+.8,z},delay:.4+hash(s,403)*1.6,travel:1.8+hash(s,404)*1.3,phase:hash(s,405)*TAU};
        })};
      })};
      // A faint glow on the grass beneath the words.
      this.lights.push({x:a.x,y:a.y+2,z:a.z,r:10,power:.24,phase:9});
    }

    castleShadow(x,y,z,surface=null) {
      // Ray tests against the actual enlarged tower and wall volumes. These
      // run only while baking the scene, and shade both masonry and terrain.
      if(x < -49 || x > 7 || z < -49 || z > 5 || y > 28) return 1;
      const L=MOON_LIGHT;
      let blocked=0;
      for(const jitter of [-.045,0,.045]) {
        const lx=L.x+jitter,lz=L.z-jitter,ly=L.y;
        for(const volume of this.castleVolumes) {
          let enter,exit;
          if(volume.kind==='round') {
            if(surface?.kind==='round'&&Math.abs(surface.x-volume.x)<.01&&Math.abs(surface.z-volume.z)<.01)continue;
            const dx=x-volume.x,dz=z-volume.z,a=lx*lx+lz*lz,b=2*(dx*lx+dz*lz),c=dx*dx+dz*dz-volume.r*volume.r;
            const discriminant=b*b-4*a*c;
            if(discriminant<=0)continue;
            const root=Math.sqrt(discriminant);
            enter=Math.max(.18,(-b-root)/(2*a),(volume.base-y)/ly);
            exit=Math.min((-b+root)/(2*a),(volume.top-y)/ly);
          } else {
            enter=Math.max(.18,(volume.min[0]-x)/lx,(volume.min[1]-y)/ly,(volume.min[2]-z)/lz);
            exit=Math.min((volume.max[0]-x)/lx,(volume.max[1]-y)/ly,(volume.max[2]-z)/lz);
          }
          if(exit>enter) {blocked++;break;}
        }
      }
      return 1-blocked/3*.68;
    }

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.W = innerWidth;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;height:100lvh;width:0;visibility:hidden;';
      document.body.appendChild(probe);
      const ios = CSS.supports('-webkit-touch-callout', 'none');
      this.H = Math.max(innerHeight, probe.offsetHeight, ios ? screen.height : 0) + (ios ? 80 : 0);
      probe.remove();
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // Detail changes the sampling grid, never the world's camera scale.
      // A finer grid therefore adds geometry samples without shrinking it.
      this.font = this.detail==='fine' ? 6.5 : 8;
      this.cw = this.detail==='fine' ? 4 : 5;
      this.ch = this.detail==='fine' ? 7 : 9;
      this.ctx.imageSmoothingEnabled = false;
      this.cols = Math.ceil(this.W / this.cw);
      this.rows = Math.ceil(this.H / this.ch);
      this.n = this.cols * this.rows;
      this.gridX=Math.floor(((VIEW.width-this.W)/2+this.camera.x)/this.cw);
      // Portrait phones crop the scene's middle; nudge it down a little so
      // the sky above the castle has some room.
      const mobile=this.W<700&&this.H>this.W*1.3,lift=mobile?35:0;
      this.skyLayout=SKY_LAYOUTS[mobile?'mobile':'desktop'];
      this.gridY=Math.floor(((VIEW.height-this.H)/2+this.camera.y-lift)/this.ch);
      this.view={x:this.gridX*this.cw,y:this.gridY*this.ch};
      const yaw = CAMERA.yaw, pitch = CAMERA.pitch;
      this.projection = { cy:Math.cos(yaw),sy:Math.sin(yaw),cp:Math.cos(pitch),sp:Math.sin(pitch),scale:VIEW.scale,originX:VIEW.originX-this.view.x,origin:VIEW.originY-this.view.y };
      this.makeAtlas();
      this.sampleWorld();
      this.buildSky();
      // iOS keeps a replaced canvas's backing store until GC; zeroing it
      // hands the memory back now, so repeated resizes cannot pile up.
      if(this.staticCanvas) this.staticCanvas.width=this.staticCanvas.height=0;
      this.staticCanvas = document.createElement('canvas');
      this.staticCanvas.width = this.canvas.width; this.staticCanvas.height = this.canvas.height;
      this.staticContext = this.staticCanvas.getContext('2d', {alpha:true});
      this.staticContext.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.staticContext.imageSmoothingEnabled = false;
      this.staticKey = '';
      this.placeSign();
      this.canvas.dataset.grid = `${this.cols}x${this.rows} cell=${this.cw.toFixed(2)}x${this.ch.toFixed(2)} dpr=${this.dpr}`;
      this.canvas.dataset.detail = this.detail;
      this.canvas.dataset.view = `crop=${this.view.x},${this.view.y} scale=${VIEW.scale} font=${this.font}`;
    }
    makeAtlas() {
      for(const old of [this.atlas,this.actorAtlas,this.folkAtlas,this.ponyHeadAtlas,this.signAtlas,this.signTitleAtlas,this.flyAtlas,this.flyTitleAtlas]) if(old) old.canvas.width=old.canvas.height=0;
      this.atlas=this.buildAtlas(this.font,this.cw,this.ch,PALETTE_NAMES);
      // Actors get a small, separate glyph sheet. Their font and spacing
      // stay fixed across viewports and terrain-detail settings.
      this.actorAtlas=this.buildAtlas(ACTOR.font,ACTOR.cw,ACTOR.ch,['deer','cream'],600);
      // Stick figures need only strokes and heads. Their font follows the
      // projection scale, so a zoomed scene keeps the figures' proportions.
      const folk=CAMPER.font*this.projection.scale/VIEW.scale,k=folk/CAMPER.font;
      this.folkAtlas=this.buildAtlas(folk,CAMPER.cw*k,CAMPER.ch*k,['cloth','cream','canvas','lilac','dark'],0,Folk.glyphs);
      this.folkMetrics=Folk.measure(`400 ${folk}px ${FONT}`);
      this.ponyHeadAtlas=this.buildAtlas(ACTOR.font*PONY_HEAD.scale,ACTOR.cw*PONY_HEAD.scale,ACTOR.ch*PONY_HEAD.scale,['deer','cream'],600);
      // Link lettering: lowercase only, heavier than the scene's glyphs.
      // Firefly letters bake their glow into a padded cell.
      if(this.linkStyle==='sign') {
        this.signAtlas=this.buildAtlas(SIGN.font,SIGN.cw,SIGN.ch,['cream','ember'],700,SIGN_GLYPHS);
        this.signTitleAtlas=this.buildAtlas(SIGN_TITLE.font,SIGN_TITLE.cw,SIGN_TITLE.ch,['canvas'],700,SIGN_GLYPHS);
      } else {
        this.flyAtlas=this.buildAtlas(FLY_TEXT.font,FLY_TEXT.cw+FLY_TEXT.pad,FLY_TEXT.ch+FLY_TEXT.pad,['fly'],700,SIGN_GLYPHS,5);
        this.flyTitleAtlas=this.buildAtlas(FLY_TITLE.font,FLY_TITLE.cw+FLY_TITLE.pad,FLY_TITLE.ch+FLY_TITLE.pad,['fly'],700,SIGN_GLYPHS,4);
      }
    }
    buildAtlas(font,cw,ch,names,weight=0,chars=GLYPHS,glow=0) {
      const d = this.dpr;
      const aw=Math.ceil(cw*d),ah=Math.ceil(ch*d);
      // Color rows wrap into side-by-side bands so no edge passes 2048px.
      // One tall strip (12k+px) exceeds iOS Safari's canvas texture limit
      // and crashed the page there.
      const rows=names.length*LEVELS*2,span=aw*chars.length;
      const perBand=Math.max(1,Math.floor(2048/ah)),bands=Math.ceil(rows/perBand);
      const cv = document.createElement('canvas');
      cv.width = span * bands;
      cv.height = ah * Math.min(rows,perBand);
      const c = cv.getContext('2d');
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let warmth = 0; warmth < 2; warmth++) for (let p = 0; p < names.length; p++) for (let l = 0; l < LEVELS; l++) {
        c.font = `${weight||(['stone','rock','star','moon','fire','ember'].includes(names[p])?700:400)} ${font * d}px ${FONT}`;
        const rgb = COLORS[names[p]], b = .17 + l / (LEVELS - 1) * 1.03;
        const row = (warmth * names.length + p) * LEVELS + l;
        const ox=Math.floor(row/perBand)*span,oy=row%perBand*ah;
        const tint = warmth ? [1.32, .99, .57] : [1, 1, 1];
        c.fillStyle = `rgb(${rgb.map((v, k) => Math.round(clamp(v * b * tint[k], 0, 255))).join(',')})`;
        if (glow) { c.shadowColor = c.fillStyle; c.shadowBlur = glow * d; }
        for (let g = 1; g < chars.length; g++) c.fillText(chars[g],ox+g*aw+aw/2,oy+ah*.5);
      }
      return {canvas:cv,aw,ah,cw,ch,span,perBand,names,index:Object.fromEntries([...chars].map((c,i)=>[c,i])),palette:Object.fromEntries(names.map((name,i)=>[name,i]))};
    }
    blit(sheet,g,row,x,y,cw,ch) {
      const sx=Math.floor(row/sheet.perBand)*sheet.span+g*sheet.aw,sy=row%sheet.perBand*sheet.ah;
      this.ctx.drawImage(sheet.canvas,sx,sy,sheet.aw,sheet.ah,Math.round((x-cw/2)*this.dpr)/this.dpr,Math.round((y-ch/2)*this.dpr)/this.dpr,cw,ch);
    }
    glyph(g, palette, brightness, x, y, warm = false, alpha = 1, sheet=null) {
      if(sheet) {this.sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet);return;}
      if (!g || alpha < .015 || brightness < .025) return;
      const l = Math.round(clamp(brightness*1.18+.025) * (LEVELS - 1));
      const p=typeof palette==='string'?PAL[palette]:palette;
      const row=(p+(warm?PALETTE_NAMES.length:0))*LEVELS+l;
      this.ctx.globalAlpha = alpha;
      this.blit(this.atlas,g,row,x,y,this.cw,this.ch);
    }
    sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet) {
      if(!g||alpha<.015||brightness<.025)return;
      const l=Math.round(clamp(brightness*1.18+.025)*(LEVELS-1));
      const p=sheet.palette[typeof palette==='string'?palette:PALETTE_NAMES[palette]];
      const row=(p+(warm?sheet.names.length:0))*LEVELS+l;
      this.ctx.globalAlpha=alpha;
      this.blit(sheet,g,row,x,y,sheet.cw,sheet.ch);
    }
    placeSign() {
      // The links are invisible hit areas laid over their projected boards
      // or firefly words. Canvas pixels are page pixels (the canvas sits at
      // the page origin). Each is padded toward a comfortable touch target;
      // neighbours split the gap between them instead of overlapping.
      const links=[...this.content.querySelectorAll('[data-board]')].map(link=>{
        const index=+link.dataset.board;
        let xs,ys;
        if(this.linkStyle==='sign') {
          const b=this.sign.boards[index],L=b.len/2,H=b.h/2,T=b.thick/2;
          const corners=[[-L,-H],[L,-H],[L,H],[-L,H]].map(([u,v])=>this.project(b.x+b.along[0]*u+b.out[0]*T,b.y+v,b.z+b.along[2]*u+b.out[2]*T));
          xs=corners.map(p=>p.x);ys=corners.map(p=>p.y);
        } else {
          const w=this.flyWords,line=w.lines[index],a=this.project(w.anchor.x,w.anchor.y,w.anchor.z),half=line.text.length*line.font.cw/2;
          xs=[a.x-half,a.x+half];ys=[a.y+line.dy-line.font.ch/2,a.y+line.dy+line.font.ch/2+5];
        }
        return {link,x0:Math.min(...xs)-4,x1:Math.max(...xs)+4,y0:Math.min(...ys)-8,y1:Math.max(...ys)+8,top:Math.min(...ys),bottom:Math.max(...ys)};
      }).sort((a,b)=>a.top-b.top);
      for(let i=1;i<links.length;i++) {
        const above=links[i-1],below=links[i];
        if(above.y1>below.y0) above.y1=below.y0=(above.bottom+below.top)/2;
      }
      for(const r of links) Object.assign(r.link.style,{left:r.x0+'px',top:r.y0+'px',width:r.x1-r.x0+'px',height:r.y1-r.y0+'px'});
    }
    drawFlyWords() {
      const w=this.flyWords,t=this.time,a=this.project(w.anchor.x,w.anchor.y,w.anchor.z);
      for(const line of w.lines) {
        const sheet=line.title?this.flyTitleAtlas:this.flyAtlas,n=line.letters.length;
        const hover=line.index===this.signHover;
        // The same idle glint as the boards: a swell of light walks across
        // each link in turn, a cue that the words can be tapped.
        const sweep=this.reduced?-99:fract(t/6.5+line.index*.5)*(n+22)-8;
        let formed=1;
        for(let i=0;i<n;i++) {
          const letter=line.letters[i];
          if(letter.ch===' ')continue;
          const x=a.x+letter.ox,y=a.y+line.dy+Math.sin(t*1.3+letter.phase)*.8;
          // Arrival: a lone firefly rises from the grass on a lazy curve and
          // kindles into its letter as it settles.
          const arrive=this.reduced?1:clamp((t-letter.delay)/letter.travel);
          formed=Math.min(formed,arrive);
          if(arrive<1) {
            const from=this.project(letter.from.x,letter.from.y,letter.from.z),e=smooth(0,1,arrive),arc=Math.sin(arrive*Math.PI);
            const fx=mix(from.x,x,e)+arc*Math.sin(letter.phase)*22,fy=mix(from.y,y,e)-arc*14;
            this.glyph(GI[arrive<.6?'.':'*'],'fly',.95,fx,fy,false,smooth(0,.12,arrive)*(1-smooth(.8,1,arrive)));
          }
          const show=smooth(.72,1,arrive);
          if(show<.02)continue;
          // Each letter keeps its own firefly pulse, with a rare deeper dip.
          const dip=Math.pow(Math.max(0,Math.sin(t*.29+letter.phase*7)),60)*.35;
          const pulse=(.08*Math.sin(t*2.3+letter.phase*4)-dip)*(this.reduced?0:1);
          const glint=Math.exp(-Math.pow(i-sweep,2)/3)*.28;
          const b=line.title?.62+pulse*.6:hover?1.08:.9+pulse+glint;
          this.glyph(sheet.index[letter.ch],'fly',b,x,y,hover,show,sheet);
        }
        if(line.title) continue;
        // A dotted underline of tiny fireflies marks each word as a link.
        const half=n*line.font.cw/2,uy=a.y+line.dy+line.font.ch/2+3;
        for(let x=-half+2,j=0;x<=half-1;x+=4,j++) {
          const twinkle=.5+.5*Math.sin(t*2.7+j*1.9+line.index*3);
          this.glyph(GI['.'],'fly',hover?1:.75+twinkle*.25,a.x+x,uy,hover,formed*(hover?.95:.35+twinkle*.35));
        }
        // Hovered or focused: a few loose fireflies circle the word.
        if(hover) for(let k=0;k<3;k++) {
          const angle=t*1.6+k*TAU/3;
          this.glyph(GI['*'],'fly',1,a.x+Math.cos(angle)*(half+8),a.y+line.dy+Math.sin(angle)*11,false,.6+.4*Math.sin(t*5+k));
        }
      }
    }
    drawSign() {
      const t=this.time,q=this.projection,s=this.sign,mid=s.boards[1];
      // A few fireflies keep the signpost company: three circle the lantern,
      // the rest drift loosely around the boards, just in front of them.
      for(let i=0;i<8;i++) {
        let x,y,z,b;
        if(i<3) {
          const a=t*(.9+i*.25)+i*2.1;
          x=s.lantern.x+Math.cos(a)*1.3;z=s.lantern.z+Math.sin(a)*1.3;y=s.lantern.y+.3+Math.sin(a*1.7)*.5;
          b=.55+.4*Math.pow(.5+.5*Math.sin(t*2.2+i*2.6),2);
        } else {
          const u=Math.sin(t*(.13+hash(i,421)*.1)+i*1.9)*(mid.len*.62),v=Math.cos(t*(.11+hash(i,422)*.08)+i*2.7)*9.5;
          x=mid.x+mid.along[0]*u+mid.out[0]*1.6;z=mid.z+mid.along[2]*u+mid.out[2]*1.6;y=mid.y+v;
          b=Math.pow(Math.max(0,Math.sin(t*1.15+i*1.83)),3)*.9;
        }
        this.worldGlyph(i%3?'.':'*','fly',.95,x,y,z,b);
      }
      for(const board of this.sign.boards) {
        const sheet=board.title?this.signTitleAtlas:this.signAtlas,text=board.text,n=text.length;
        const hover=board.index===this.signHover;
        // An idle glint walks across each link board in turn, hinting that
        // the boards can be tapped where there is no hover.
        const sweep=this.reduced?-99:fract(t/6.5+board.index*.5)*(n+22)-8;
        for(let i=0;i<n;i++) {
          if(text[i]===' ')continue;
          const u=(i-(n-1)/2)*sheet.cw/q.scale,w=board.thick/2+.05;
          const p=this.project(board.x+board.along[0]*u+board.out[0]*w,board.y,board.z+board.along[2]*u+board.out[2]*w);
          if(!this.visible(p))continue;
          if(board.title) {this.glyph(sheet.index[text[i]],'canvas',.80,p.x,p.y,true,1,sheet);continue;}
          const glint=Math.exp(-Math.pow(i-sweep,2)/3);
          this.glyph(sheet.index[text[i]],hover?'ember':'cream',hover?1:.86+glint*.30,p.x,p.y,hover,1,sheet);
          this.glyph(sheet.index._,'ember',hover?.95:.52+glint*.30,p.x,p.y+1,false,1,sheet);
        }
      }
    }

    sampleWorld() {
      const n = this.n;
      this.material = new Uint8Array(n);
      this.shade = new Float32Array(n);
      this.depth = new Float32Array(n).fill(-1e5);
      this.wx = new Float32Array(n); this.wy = new Float32Array(n); this.wz = new Float32Array(n);
      this.seed = new Float32Array(n); this.glyphs = new Uint8Array(n);
      this.tags = new Uint16Array(n);
      this.curved = new Uint8Array(n);
      this.shadow = new Float32Array(n).fill(1);
      this.light = new Float32Array(n); this.lightIndex = new Uint8Array(n);
      this.dynamic = new Uint8Array(n);
      this.signCell = new Int8Array(n).fill(-1);
      this.waterGrain=new Float32Array(n);this.waterPhase=new Float32Array(n);this.waterPhaseB=new Float32Array(n);
      this.waterCross=new Float32Array(n);this.waterDirection=new Uint8Array(n);
      this.waterEddy=new Float32Array(n);this.waterEddyAngle=new Float32Array(n);this.waterEddyRadius=new Float32Array(n);
      this.waterEddySpin=new Int8Array(n);this.waterEddyDirection=new Uint8Array(n);
      this.waterPierDistance=new Float32Array(n).fill(1e3);this.waterPierRipple=new Float32Array(n);this.waterPierDirection=new Uint8Array(n);
      this.waterSpeed=new Float32Array(n);this.waterBank=new Float32Array(n);this.waterWake=new Float32Array(n);this.waterShadow=new Float32Array(n).fill(1);
      this.grassBlade=new Uint8Array(n);this.grassRest=new Float32Array(n);this.trample=this.trampleActive=null;
      this.flowers = []; this.reeds = []; this.grassIndices = [];
      for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i, px = (i + .5) * this.cw, py = (j + .5) * this.ch;
        const p = this.groundAt(px, py);
        const seed = hash(i+this.gridX, j+this.gridY, 72);
        this.seed[k] = seed;
        if (p.z < -58 + Math.sin(p.x * .05) * 5) continue;
        this.depth[k] = p.d; this.wx[k] = p.x; this.wy[k] = p.y; this.wz[k] = p.z;
        const bankDistance=riverDistance(p.x,p.z),water=bankDistance<0,wetBank=!water&&bankDistance<1.1&&p.y<3;
        const isPath = pathDistance(p.x, p.z) < 1.3;
        const slope = Math.hypot(height(p.x+.8,p.z)-height(p.x-.8,p.z),height(p.x,p.z+.8)-height(p.x,p.z-.8));
        const clearing=!water&&bankDistance>1.2&&this.campDistance(p.x,p.z)<.96+noise(p.x*.25,p.z*.25,320)*.10;
        const m=water?MAT.water:wetBank||slope>1.65?MAT.rock:clearing?MAT.earth:isPath?MAT.path:MAT.grass;
        this.material[k] = m;
        this.shade[k] = (m === MAT.grass ? .48 : m === MAT.rock ? .56 : .37) + fbm(p.x * .23, p.z * .19) * .25 + seed * .12;
        this.glyphs[k] = GI[m === MAT.water ? '~' : m === MAT.path ? (seed < .5 ? '.' : ':') : m === MAT.rock ? ':%#='[Math.floor(seed*4)] : "',|/\\`"[Math.floor(seed*6)]];
        if(wetBank) {this.shade[k]=.31+seed*.18;this.glyphs[k]=GI[seed>.83?':':seed>.50?',':'.'];}
        if(m===MAT.earth) {this.shade[k]=.59+noise(p.x*.33,p.z*.29,321)*.18;this.glyphs[k]=GI[seed>.86?':':seed>.55?',':'.'];}
        if(m===MAT.grass) this.sowGrass(k,p.x,p.z,seed);
        if (!water) {
          this.shadow[k]=this.castleShadow(p.x,p.y+.08,p.z);
        }
      }
      for (const poly of this.polygons) this.rasterPoly(poly);
      for (const tree of this.trees) this.rasterTree(tree);
      for (const shrub of this.shrubs) this.rasterShrub(shrub);
      for (let k = 0; k < n; k++) {
        const m = this.material[k];
        if(m===MAT.water) {
          const x=this.wx[k],z=this.wz[k],cross=(x-riverX(z))/riverWidth(z),bridge=this.bridge;
          this.waterGrain[k]=noise(x*.22,z*.14,311);
          this.waterPhase[k]=noise(x*.10,z*.13,312)*TAU;
          this.waterPhaseB[k]=noise(x*.23,z*.19,313)*TAU;
          this.waterSpeed[k]=.20+.34*(1-cross*cross)+this.waterGrain[k]*.08;
          this.waterCross[k]=cross;
          const tangent=.37*Math.cos((z+14)*.037)+.045;
          this.waterDirection[k]=this.currentGlyph(tangent+(this.waterGrain[k]-.5)*.35,1);
          this.waterBank[k]=clamp(1+riverDistance(x,z)/1.4);
          const dz=z-(bridge.z+bridge.half+1.1);
          for(let pierIndex=0;pierIndex<bridge.piers.length;pierIndex++) {
            const pier=bridge.piers[pierIndex],px=x-pier,pz=z-(bridge.z+bridge.half+1.05),distance=Math.hypot(px,pz*.85);
            if(distance<this.waterPierDistance[k]) {
              this.waterPierDistance[k]=distance;this.waterPierRipple[k]=Math.exp(-distance*.55);
              this.waterPierDirection[k]=this.currentGlyph(-pz,px);
            }
            if(dz>0&&dz<23) {
              const center=pier+riverX(z)-riverX(bridge.z)+Math.sin(dz*.48+pierIndex*2.4)*.35;
              const spread=.40+dz*(pierIndex?.16:.11),width=.38+dz*.035;
              const wake=Math.exp(-Math.pow((Math.abs(x-center)-spread)/width,2))*Math.exp(-dz/10);
              this.waterWake[k]=Math.max(this.waterWake[k],wake);
            }
            // Small, unequal vortices sit beside the downstream noses.
            // Cache their local polar coordinates; only the arcs rotate.
            for(const side of [-1,1]) {
              const ez=bridge.z+bridge.half+3.3+(side<0?1.1:0)+pierIndex*.65;
              const ex=pier+side*1.55+riverX(ez)-riverX(bridge.z);
              const dx=x-ex,dzE=z-ez,rx=2.3+side*.20,rz=3.1+pierIndex*.25;
              const radius=Math.hypot(dx/rx,dzE/rz);
              const eddy=(1-smooth(.65,1.55,radius))*smooth(.08,.38,radius)*(.65+this.waterGrain[k]*.35);
              if(eddy>this.waterEddy[k]) {
                this.waterEddy[k]=eddy;this.waterEddyAngle[k]=Math.atan2(dzE/rz,dx/rx);this.waterEddyRadius[k]=radius;
                this.waterEddySpin[k]=side;this.waterEddyDirection[k]=this.currentGlyph(-dzE*side,dx*side+.65);
              }
            }
          }
          const sx=bridge.deck*MOON_LIGHT.x/MOON_LIGHT.y,sz=bridge.deck*MOON_LIGHT.z/MOON_LIGHT.y;
          const dx=Math.max(0,Math.abs(x-(bridge.x-sx))-(bridge.end-bridge.start)/2),shadowZ=Math.max(0,Math.abs(z-(bridge.z-sz))-bridge.half);
          this.waterShadow[k]=1-(1-smooth(0,2.0,Math.hypot(dx,shadowZ)))*.22;
        }
        if (m === MAT.grass) {
          this.grassIndices.push(k);
          const x = this.wx[k], z = this.wz[k];
          const gx=k%this.cols+this.gridX,gy=Math.floor(k/this.cols)+this.gridY;
          const patch = noise(x * .15, z * .15, 91);
          if (this.seed[k] < .070 && patch > .39 && z > -13 && pathDistance(x,z) > 2 && riverDistance(x,z) > 2) {
            const palette = ['cream','pink','lilac','blue'][Math.floor(noise(x*.11,z*.11,37)*3.99)];
            const ornate=z>14&&hash(gx,gy,94)<.16;
            this.flowers.push({ k,x,y:this.wy[k],z,palette,head:hash(gx,gy,42)>.35?'*':'+',phase:hash(gx,gy,93)*TAU,ornate,h:ornate?1.3+hash(gx,gy,95)*.85:.55,species:Math.floor(hash(gx,gy,96)*4),warm:0 });
          }
          if (riverDistance(x, z) < 2.5 && z > -18 && this.seed[k] < .095) this.reeds.push({ k, x, y: this.wy[k], z, h: .6 + hash(gx,gy,88) * .9 });
        }
        let best = 0, index = 0;
        for (let l = 0; l < this.lights.length; l++) {
          const light = this.lights[l];
          const distance = Math.hypot(this.wx[k] - light.x, this.wz[k] - light.z, (this.wy[k] - light.y) * 1.1);
          const value = Math.pow(clamp(1 - distance / light.r), 2) * light.power;
          if (value > best) { best = value; index = l; }
        }
        this.light[k] = best; this.lightIndex[k] = index;
        this.dynamic[k] = m===MAT.water || m===MAT.warm || best>.05 || this.signCell[k]>=0 ? 1 : 0;
      }
      for(const flower of this.flowers)flower.warm=this.light[flower.k];
    }
    // Every grass cell holds a blade, laid over by one still gust so the
    // meadow keeps its sweeping texture. It holds still until something moves
    // through it (see trampleGrass). Short tufts never lean.
    sowGrass(k,x,z,seed) {
      if(seed<.21) {this.glyphs[k]=GI["',`"[Math.floor(seed*12)%3]];return;}
      const rest=(Math.sin(x*.35+z*.18)+Math.sin(x*.09)*.7)*.3;
      this.grassBlade[k]=1;this.grassRest[k]=rest;
      this.glyphs[k]=this.bladeGlyph(rest);
    }
    bladeGlyph(bend) { return GI[bend>.28?'/':bend<-.28?'\\':'|']; }
    milkyWay(vx,vy,out=this.bandOut) {
      // s runs along the band, u across it. The band's centre wanders, its
      // light clumps into star clouds, and a dark dust lane splits the core.
      const m=this.skyLayout.band,dx=vx-m.x,dy=vy-m.y;
      const s=dx*m.cos+dy*m.sin,u=-dx*m.sin+dy*m.cos-(noise(s*.004,0,401)-.5)*60;
      const clump=smooth(.25,.85,noise(s*.02,u*.035,402)*.55+noise(s*.05,u*.08,403)*.3+noise(s*.11,u*.16,408)*.15);
      const lane=Math.exp(-Math.pow((u-10-(noise(s*.007,3,404)-.5)*36)/(10+noise(s*.02,5,405)*14),2))*smooth(.32,.68,noise(s*.013,u*.02,406));
      const core=Math.exp(-Math.pow(u/m.core,2)),halo=Math.exp(-Math.pow(u/m.width,2));
      const dust=smooth(.55,.75,noise(s*.03,u*.05,407))*core*.6;
      out.s=s;
      out.core=core*(.3+clump*1.1)*(1-lane*.85)*(1-dust);
      out.light=(core*.6+halo*.4)*(.2+clump*1.3)*(1-lane*.8)*(1-dust);
      return out;
    }
    buildSky() {
      const cols=this.cols,rows=this.rows,cw=this.cw,ch=this.ch,sky=k=>this.material[k]===MAT.sky;
      // Keep the moon on screen, then raise it until its disc and a little
      // margin sit entirely in open sky.
      const moon=this.skyLayout.moon,r=moon.r;
      let mx=Math.min(moon.x-this.view.x,this.W-r-26),my=Math.max(moon.y-this.view.y,r+16);
      const clear=(x,y)=>{
        for(let j=Math.floor((y-r-8)/ch);j<=Math.floor((y+r+8)/ch);j++) for(let i=Math.floor((x-r-6)/cw);i<=Math.floor((x+r+6)/cw);i++)
          if(i>=0&&j>=0&&i<cols&&j<rows&&!sky(j*cols+i)) return false;
        return true;
      };
      while(!clear(mx,my)&&my>r+12) my-=ch;
      this.moon={x:mx,y:my,r};
      // Shooting stars and satellites use a larger, bold sheet so a brief
      // streak still reads at a glance.
      if(this.meteorAtlas) this.meteorAtlas.canvas.width=this.meteorAtlas.canvas.height=0;
      this.meteorAtlas=this.buildAtlas(9,5.5,9,['star','cream','ember'],700,' .+*@-/\\');
      // The Milky Way's unresolved light is drawn as faint characters, never
      // painted: dots thicken toward the core and the dust lanes are gaps.
      // A sparse ring of dots haloes the moon. All of it is static, so it is
      // baked once per resize with a soft glow round each character.
      this.skyRows=0;
      for(let k=0;k<cols*rows;k++) if(sky(k)) this.skyRows=Math.floor(k/cols)+1;
      if(this.hazeCanvas) this.hazeCanvas.width=this.hazeCanvas.height=0;
      const canvas=this.hazeCanvas=document.createElement('canvas');
      canvas.width=Math.round(this.W*this.dpr);canvas.height=Math.max(1,Math.round(this.skyRows*ch*this.dpr));
      const c=canvas.getContext('2d'),main=this.ctx;
      c.setTransform(this.dpr,0,0,this.dpr,0,0);c.imageSmoothingEnabled=false;
      this.ctx=c;
      c.shadowColor='rgba(160,150,220,.6)';c.shadowBlur=3*this.dpr;
      for(let j=0;j<this.skyRows;j++) for(let i=0;i<cols;i++) {
        const k=j*cols+i,sx=(i+.5)*cw,sy=(j+.5)*ch,d=Math.hypot(sx-mx,sy-my);
        if(!sky(k)||d<r+4) continue;
        const gi=i+this.gridX,gj=j+this.gridY,pick=hash(gi,gj,420),tint=hash(gi,gj,421);
        if(d<r+34) {
          if(pick<Math.pow(1-(d-r-4)/30,2)*.45) this.glyph(GI['.'],'moon',.15,sx,sy);
          continue;
        }
        const band=this.milkyWay(sx+this.view.x,sy+this.view.y),light=band.light;
        if(light<.06||pick>smooth(.04,.85,light)*.95) continue;
        const g=light>.7&&tint>.5?':':light>.4&&tint>.55?"'":tint>.85?'`':'.';
        const p=band.core>.45&&tint<.35?'cream':light<.3&&tint>.6?'blue':'lilac';
        this.glyph(GI[g],p,.16+light*.32+band.core*.14,sx,sy);
      }
      c.shadowColor='rgba(227,234,207,.55)';c.shadowBlur=6*this.dpr;
      this.drawMoon();
      this.ctx=main;
      // Stars are scattered on a scene-pixel grid so they hold still across
      // viewports. The Milky Way packs in many more, mostly faint and lilac.
      this.stars=[];
      const step=9;
      for(let gy=Math.floor(this.view.y/step);gy<=Math.ceil((this.view.y+this.H)/step);gy++) for(let gx=Math.floor(this.view.x/step);gx<=Math.ceil((this.view.x+this.W)/step);gx++) {
        const vx=gx*step+hash(gx,gy,101)*step,vy=gy*step+hash(gx,gy,102)*step,x=vx-this.view.x,y=vy-this.view.y;
        if(x<0||x>=this.W||y<0||y>=this.H||Math.hypot(x-mx,y-my)<r+6||!sky(Math.floor(y/ch)*cols+Math.floor(x/cw))) continue;
        const band=this.milkyWay(vx,vy),pick=hash(gx,gy,103);
        if(pick>.032+band.light*.6+band.core*.35) continue;
        const inBand=pick>.032,mag=hash(gx,gy,104),tint=hash(gx,gy,105);
        const b=inBand?.16+Math.pow(mag,3)*.6+band.core*.15:.25+Math.pow(mag,2.2)*.8;
        const g=b>.85?'*':b>.62?'+':inBand&&hash(gx,gy,106)>.8?"'":'.';
        const p=inBand?(tint<.45?'lilac':tint<.55?'cream':'star'):(tint<.1?'blue':tint<.17?'cream':'star');
        this.stars.push({x,y,b,g:GI[g],p:PAL[p],phase:hash(gx,gy,107)*TAU,rate:.6+hash(gx,gy,108)*2.2,scint:hash(gx,gy,109)>.94,s:band.s,glow:band.light,band:inBand});
      }
    }
    rasterPoly(poly) {
      const points = poly.points.map(p => ({ ...this.project(p[0],p[1],p[2]), wx: p[0], wy: p[1], wz: p[2] }));
      for (let n = 1; n < points.length - 1; n++) this.triangle(points[0], points[n], points[n + 1], poly);
    }
    currentGlyph(vx,vz) {
      const q=this.projection,sx=q.cy*vx-q.sy*vz,sy=q.sp*(q.sy*vx+q.cy*vz);
      const slope=Math.abs(sx)<.001?100:sy/sx;
      return GI[Math.abs(slope)>2.1?'|':Math.abs(slope)<.42?'-':slope>0?'\\':'/'];
    }
    triangle(a, b, c, poly) {
      const depths=this.depth;
      const cw = this.cw, ch = this.ch;
      const x0 = Math.max(0, Math.floor(Math.min(a.x,b.x,c.x)/cw)), x1 = Math.min(this.cols-1, Math.ceil(Math.max(a.x,b.x,c.x)/cw));
      const y0 = Math.max(0, Math.floor(Math.min(a.y,b.y,c.y)/ch)), y1 = Math.min(this.rows-1, Math.ceil(Math.max(a.y,b.y,c.y)/ch));
      const den = (b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
      if (Math.abs(den) < .001) return;
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const x = (i+.5)*cw, y = (j+.5)*ch;
        const u = ((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den;
        const v = ((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den, w = 1-u-v;
        if (u < -.001 || v < -.001 || w < -.001) continue;
        const depth = u*a.d+v*b.d+w*c.d, k = j*this.cols+i;
        if (depth < depths[k] - .025) continue;
        depths[k] = depth;
        const seed = this.seed[k], m = poly.material;
        // Preserve exact coordinates on flat faces. Barycentric roundoff
        // at a mortar boundary must not change shading between crops.
        const wy=a.wy===b.wy&&a.wy===c.wy?a.wy:u*a.wy+v*b.wy+w*c.wy;
        const wx=a.wx===b.wx&&a.wx===c.wx?a.wx:u*a.wx+v*b.wx+w*c.wx;
        const wz=a.wz===b.wz&&a.wz===c.wz?a.wz:u*a.wz+v*b.wz+w*c.wz;
        const surface=poly.surface;
        let shade=poly.shade,nx=surface?.normal?.[0]||0,ny=surface?.normal?.[1]||0,nz=surface?.normal?.[2]||0;
        let masonry=wx+wz*.65,diffuse=0,edge=false;
        if(surface?.kind==='round') {
          const dx=wx-surface.x,dz=wz-surface.z,normalLength=Math.hypot(dx,dz);
          nx=dx/normalLength;nz=dz/normalLength;
          diffuse=clamp((nx*MOON_LIGHT.x+nz*MOON_LIGHT.z)/Math.hypot(MOON_LIGHT.x,MOON_LIGHT.z));
          // A continuous radial normal gives a broad silver highlight which
          // rolls into a dark limb. Face texture stays subordinate to volume.
          shade=.20+.90*Math.pow(diffuse,1.80);
          masonry=Math.atan2(dz,dx)*surface.r;
          edge=nx*this.projection.sy+nz*this.projection.cy<.26;
          if(surface.part==='shaft') {
            const belowRim=surface.base+surface.height-wy;
            shade*=mix(.49,1,smooth(0,.9,belowRim));
            shade*=mix(.72,1,smooth(0,.8,wy-surface.base));
          } else if(surface.part==='inside') shade=.11+.11*(1-diffuse);
          else if(surface.part==='cornice') shade*=.63;
          else if(surface.part==='belt') shade*=.88;
        }
        const course=Math.floor(wy*1.25),mortar=fract(wy*1.25)<.10;
        const joint=fract(masonry*.9+(course%2)*.5)<.08;
        let glyph=m===MAT.dark?(seed<.6?'.':':'):m===MAT.warm?'*':m===MAT.roof?(seed<.5?'/':'='):m===MAT.wood?'|':mortar?'-':joint?':':seed<.12?'%':seed<.30?'#':seed<.44?'+':'=';
        if(m===MAT.bark)glyph=seed>.96?'o':seed>.82?':':seed>.45?'|':'#';
        if(surface?.part==='bridgeDeck') {glyph=seed>.78?':':'.';shade*=.94;}
        else if(surface?.part==='bridgeBeam')glyph=seed>.8?'-':'=';
        else if(surface?.part==='campLog')glyph=ny?'-':seed>.75?':':'=';
        else if(surface?.part==='tentCanvas')glyph=seed>.77?':':seed>.44?'/':'.';
        else if(surface?.part==='tentFront')glyph=seed>.82?'/':seed>.55?':':'.';
        else if(surface?.part==='bedroll')glyph=seed>.60?'=':'~';
        else if(surface?.part==='bridgePier') {glyph=joint?':':mortar?'-':'#';shade*=1.26;}
        else if(surface?.part==='bridgeWall')glyph=mortar?'-':joint?':':'=';
        else if(surface?.part==='signPost') {glyph=nx||nz?(seed>.8?'#':'|'):'=';shade*=1.25;}
        else if(surface?.part==='signBoard') {
          // Grain rows frame an open band; the lettering is drawn into it.
          const board=surface.board,u=(wx-board.x)*board.along[0]+(wz-board.z)*board.along[2],v=wy-board.y;
          glyph=surface.top?(seed>.7?'=':'-'):surface.end||Math.abs(u)>board.len/2-.45?'|':Math.abs(v)<board.band?' ':seed>.9?'#':seed>.45?'=':seed>.15?'-':':';
          shade*=1.45;
        }
        if(m===MAT.stone&&surface?.kind==='round') {
          glyph=surface.part==='inside'?':':edge?'|':mortar?'-':joint?':':diffuse>.72?(seed<.18?'%':'#'):diffuse>.32?(seed<.22?'+':'='):'=';
        }
        shade*=(.95+seed*.06)*(mortar?.82:1)*(wy<6.5&&m===MAT.stone&&!surface?.bridge ? .80 : 1);
        if(m===MAT.stone) shade*=this.castleShadow(wx+nx*.09,wy+ny*.09+.03,wz+nz*.09,surface);
        this.material[k] = m; this.shade[k] = shade; this.glyphs[k] = GI[glyph]; this.wx[k] = wx; this.wy[k] = wy; this.wz[k] = wz; this.tags[k] = poly.tag; this.curved[k]=surface?.kind==='round'?1:0; this.shadow[k]=1;
        this.signCell[k]=surface?.part==='signBoard'?surface.board.index:-1;
      }
    }
    rasterBarkSegment(a,b,wa,wb,shade) {
      const q=this.projection,du=(b[0]-a[0])*q.cy-(b[2]-a[2])*q.sy,dv=b[1]-a[1],length=Math.hypot(du,dv)||1;
      const right=-dv/length,up=du/length;
      const edge=(p,w,side)=>[p[0]+q.cy*right*w*side,p[1]+up*w*side,p[2]-q.sy*right*w*side];
      this.rasterPoly({points:[edge(a,wa,1),edge(b,wb,1),b,a],material:MAT.bark,shade:shade*.78,tag:0});
      this.rasterPoly({points:[a,b,edge(b,wb,-1),edge(a,wa,-1)],material:MAT.bark,shade,tag:0});
    }
    rasterTree(tree) {
      const lean=(hash(tree.seed,271)-.5)*.75,width=.25+tree.r*.075;
      const foot=[tree.x,tree.y,tree.z],fork=[tree.x+lean*.5,tree.y+tree.h*.46,tree.z],tip=[tree.x+lean,tree.y+tree.h*.81,tree.z];
      const shade=tree.z<-47?.47:.91;
      this.rasterBarkSegment(foot,fork,width,width*.67,shade);
      this.rasterBarkSegment(fork,tip,width*.67,width*.35,shade);
      for(const side of [-1,1]) {
        this.rasterBarkSegment(fork,[tree.x+side*tree.r*.68,tree.y+tree.h*(side<0?.71:.77),tree.z+side*.35],.23,.12,shade*.87);
        const rx=tree.x+side*.85,rz=tree.z+.55;
        this.rasterBarkSegment([tree.x,tree.y+.20,tree.z],[rx,height(rx,rz)+.06,rz],width*.52,.10,shade*.7);
      }
      // Raised, uneven crowns leave a readable trunk and the lower forks.
      for(let layer=0;layer<4;layer++) {
        const r=tree.r*(1-layer*.18);
        this.rasterFoliage({x:tree.x+Math.sin(tree.seed*9+layer)*r*.16,y:tree.y+tree.h*(.62+layer*.12),z:tree.z,r,aspect:.63,depthScale:.68,shade:.33,seed:tree.seed+layer*37,far:tree.z<-47?.65:1},MAT.tree);
      }
    }
    rasterShrub(shrub) {
      for(let lobe=0;lobe<3;lobe++) {
        const side=lobe-1,r=shrub.r*(lobe===1?.78:.59);
        this.rasterFoliage({x:shrub.x+side*shrub.r*.56,y:shrub.y+shrub.h*(lobe===1?.92:.56),z:shrub.z+Math.sin(shrub.seed+lobe)*.32,r,aspect:.49,depthScale:.43,shade:.42,seed:shrub.seed+lobe*29,far:1},MAT.shrub);
      }
    }
    rasterFoliage(lobe,material) {
        const p=this.project(lobe.x,lobe.y,lobe.z),r=lobe.r;
        const rx=r*this.projection.scale,ry=r*this.projection.scale*lobe.aspect;
        const i0 = Math.max(0, Math.floor((p.x-rx)/this.cw)), i1 = Math.min(this.cols-1,Math.ceil((p.x+rx)/this.cw));
        const j0 = Math.max(0, Math.floor((p.y-ry)/this.ch)), j1 = Math.min(this.rows-1,Math.ceil((p.y+ry)/this.ch));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k=j*this.cols+i,dx=((i+.5)*this.cw-p.x)/rx,dy=((j+.5)*this.ch-p.y)/ry;
          const rr=dx*dx+dy*dy,seed=hash(i+this.gridX,j+this.gridY,lobe.seed+300);
          if(rr>.86+seed*.18||(rr>.59&&seed<.14))continue;
          const front=Math.sqrt(Math.max(0,1-rr*.85))*r*lobe.depthScale,d=p.d+front;
          const depths = this.depth;
          if (d < depths[k]) continue;
          depths[k] = d;
          const shade=(lobe.shade+Math.max(0,dx*.22-dy*.30)+seed*.10)*lobe.far;
          const glyphSet=material===MAT.shrub?'&%#o*+':'&%#*:+.';
          const g=GI[glyphSet[Math.floor(seed*glyphSet.length)]];
          const q=this.projection,v=dy*r*lobe.aspect,u=dx*r;
          this.material[k]=material;this.shade[k]=shade;this.glyphs[k]=g;
          this.wx[k]=lobe.x+u*q.cy+v*q.sp*q.sy+front*q.cp*q.sy;
          this.wy[k]=lobe.y-v*q.cp+front*q.sp;
          this.wz[k]=lobe.z-u*q.sy+v*q.sp*q.cy+front*q.cp*q.cy;
          this.curved[k]=0;this.shadow[k]=1;
        }
    }

    visible(p,coverTerrain=false) {
      const i = Math.floor(p.x / this.cw), j = Math.floor(p.y / this.ch);
      if(i<0||i>=this.cols||j<0||j>=this.rows)return false;
      const k=j*this.cols+i,m=this.material[k];
      // Grass belongs behind animal silhouettes. Solid world objects still
      // use their real depth, so trunks and masonry can hide an animal.
      return coverTerrain&&(m===MAT.grass||m===MAT.earth||m===MAT.path)||p.d>=this.depth[k]-.7;
    }
    worldGlyph(char, palette, b, x,y,z, alpha=1, offsetX=0, offsetY=0) {
      const p = this.project(x,y,z);
      if (!this.visible(p)) return;
      this.glyph(GI[char],palette,b,p.x+offsetX,p.y+offsetY,false,alpha);
    }
    worldStroke(a,b,palette,brightness) {
      const q=this.projection,vx=b[0]-a[0],vy=b[1]-a[1],vz=b[2]-a[2];
      const dx=(q.cy*vx-q.sy*vz)*q.scale,dy=(q.sp*(q.sy*vx+q.cy*vz)-q.cp*vy)*q.scale;
      const slope=Math.abs(dx)<.001?100:dy/dx;
      const char=Math.abs(slope)>1.8?'|':Math.abs(slope)<.32?'-':slope>0?'\\':'/';
      const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx)/this.cw,Math.abs(dy)/this.ch)));
      for(let i=0;i<=steps;i++) {
        const t=i/steps;
        this.worldGlyph(char,palette,brightness,mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t));
      }
    }
    drawBridgeRails() {
      // Timber rails run up each ramp and along the deck, with posts at
      // every bend and a few between. The far rail sits a little dimmer.
      const {z,half,rail}=this.bridge,lift=1.25;
      for(const [rz,b] of [[z-half,.56],[z+half,.74]]) {
        for(let i=1;i<rail.length;i++) {
          const [x0,y0]=rail[i-1],[x1,y1]=rail[i];
          this.worldStroke([x0,y0+lift,rz],[x1,y1+lift,rz],'wood',b);
          const posts=Math.max(1,Math.round(Math.abs(x1-x0)/3.2));
          for(let p=i===1?0:1;p<=posts;p++) {
            const x=mix(x0,x1,p/posts),y=mix(y0,y1,p/posts);
            this.worldStroke([x,y,rz],[x,y+lift-.25,rz],'wood',b*.9);
          }
        }
      }
    }
    sprite(lines, x,y,z, palette='cloth', brightness=.85, bob=0, options=null) {
      const p = this.project(x,y,z), width = Math.max(...lines.map(l => l.length));
      const sheet=options?.actor?this.actorAtlas:null,cw=sheet?sheet.cw:this.cw,ch=sheet?sheet.ch:this.ch;
      const cell={x:0,y:0,d:0,cw,ch,sheet};
      const place=(i,j)=>{
        let dx=(i-(width-1)/2)*cw,dy=-(lines.length-1-j)*ch;
        const head=options?.ponyHead&&j<PONY_HEAD.rows&&i>=PONY_HEAD.firstColumn;
        if(head) {
          const px=(PONY_HEAD.pivotColumn-(width-1)/2)*cw,py=-(lines.length-1-PONY_HEAD.pivotRow)*ch;
          dx=px+(dx-px)*PONY_HEAD.scale;dy=py+(dy-py)*PONY_HEAD.scale;
        }
        const part=head?this.ponyHeadAtlas:sheet;
        cell.x=p.x+dx;cell.y=p.y+dy+bob;cell.d=p.d-(dy+bob)/(this.projection.scale*this.projection.cp)*this.projection.sp;
        cell.cw=part?part.cw:cw;cell.ch=part?part.ch:ch;cell.sheet=part;
        return cell;
      };
      if(options?.opaque) {
        // A silhouette mask can also clear interior spaces in outlined
        // heads and bodies. Paint all mattes before the letters so adjacent
        // cells cannot erase each other. Vegetation returns next frame.
        this.ctx.fillStyle=BG;
        for(let j=0;j<lines.length;j++)for(let i=0;i<lines[j].length;i++) {
          const mask=options.mask?.[j]||lines[j];
          if(!mask[i]||mask[i]===' ')continue;
          const cell=place(i,j);
          if(!this.visible(cell,true))continue;
          this.ctx.globalAlpha=1;
          this.ctx.fillRect(Math.round((cell.x-cell.cw/2-1)*this.dpr)/this.dpr,Math.round((cell.y-cell.ch/2-1)*this.dpr)/this.dpr,cell.cw+2,cell.ch+2);
        }
      }
      for (let j = 0; j < lines.length; j++) for (let i = 0; i < lines[j].length; i++) {
        const char = lines[j][i];
        if (char === ' ') continue;
        const cell=place(i,j);
        let color=palette,b=brightness,warm=false;
        if(options?.eyePalette&&char==='o')color=options.eyePalette;
        if(options?.fireSide) {
          const heat=clamp(.50+options.fireSide*(i-(width-1)/2)/Math.max(1,width-1));
          b*=.88+heat*.12;b+=heat*.05;warm=heat>.63;
        }
        if (this.visible(cell,options?.opaque)) this.glyph(GI[char],color,b,cell.x,cell.y,warm,1,cell.sheet);
      }
    }
    drawFigure(fig) {
      // The dark keyline goes down before the strokes, so grass never runs
      // into a limb and limbs never cut limbs.
      const sheet=this.folkAtlas,f=this.fire,project=this.folkProject||(this.folkProject=(x,y,z)=>this.project(x,y,z));
      const marks=Folk.marks(fig,project,this.folkMetrics,this.folkMarks||(this.folkMarks=[])),reach=Math.hypot(fig.x-f.x,fig.z-f.z);
      for(const m of marks) if(m.t!=='line'&&this.visible(m,true)) for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) this.sheetGlyph(sheet.index[m.c],'dark',.3,m.x+ox,m.y+oy,false,1,sheet);
      for(const m of marks) {
        if(!this.visible(m,true))continue;
        // Whatever reaches out past the body toward the fire catches its light.
        const heat=clamp((reach-Math.hypot(m.wx-f.x,m.wz-f.z)+.1)/.7)*clamp(1.6-reach/5)*this.flicker;
        if(m.t==='body')this.sheetGlyph(sheet.index[m.c],fig.palette,fig.brightness+heat*.16,m.x,m.y,heat>.36,1,sheet);
        else this.sheetGlyph(sheet.index[m.c],m.t==='rod'?'canvas':m.t==='line'?'cloth':'cream',m.t==='rod'?.66:m.t==='line'?.40:.95,m.x,m.y,false,1,sheet);
      }
    }
    update(dt) {
      const t = this.time += dt;
      this.wind = .3 + Math.sin(t*.21)*.23;
      this.flicker = .82+Math.sin(t*9.1)*.09+Math.sin(t*17.7)*.06;
      if(this.reader) this.stepReader(dt);
      // The reader keeps the looser ground rules until back on open ground.
      const reader=this.reader,errand=reader&&(reader.state!=='away'||!this.walkable(reader.fig.x,reader.fig.z));
      if(this.trip) this.stepTrip(dt);
      const trip=this.trip,away=trip&&trip.state!=='home';
      for(const fig of this.folk) if(!fig.hidden) Folk.step(fig,dt,errand&&fig===reader.fig?reader.world:away&&fig===trip.fig?trip.world:this.world);
      this.trampleGrass(dt);
      if (t >= this.nextMeteor) { this.nextMeteor = t+6+Math.random()*6; this.spawnMeteor(); }
      for (const meteor of this.meteors) meteor.age += dt;
      this.meteors = this.meteors.filter(m=>m.age<m.life);
      if (this.satellite) { this.satellite.age += dt; if (this.satellite.age >= this.satellite.life) { this.satellite = null; this.nextSatellite = t+40+Math.random()*40; } }
      else if (t >= this.nextSatellite) {
        // A slow pass across the upper sky; some catch the sun and flare once.
        const top=Math.min(this.H,innerHeight),y0=top*(.06+Math.random()*.22),east=Math.random()<.5;
        this.satellite = { x0:east?this.W+10:-10, x1:east?-10:this.W+10, y0, y1:y0+top*(Math.random()-.3)*.18, age:0, life:22+Math.random()*10, flare:Math.random()<.45?.3+Math.random()*.4:-1 };
      }
      for (const r of this.ripples) r.age += dt;
      this.ripples = this.ripples.filter(r=>r.age<3.8);
      for (const s of this.sparks) s.age += dt;
      this.sparks = this.sparks.filter(s=>s.age<s.life);
      if (hash(Math.floor(t*60),97) < dt*8 && this.sparks.length<25) this.sparks.push({ age:0,life:1.5+hash(Math.floor(t*60),98)*1.7,dx:(hash(Math.floor(t*60),99)-.5)*1.6 });
    }
    // Where the pony and rabbit have grazed to by time t.
    wander(t=this.time) {
      const {pony,rabbit}=this.wildlife;
      return {ponyX:pony.x+Math.sin(t*.075)*2,rabbitX:rabbit.x+Math.sin(t*.09)*.6};
    }
    trampleGrass(dt) {
      // Each bent cell is a damped spring: it eases back upright behind
      // whatever passed and swings a little past before it settles.
      if(!this.trample) {
        this.trample=new Float32Array(this.n);this.trampleV=new Float32Array(this.n);
        this.trampleOn=new Uint8Array(this.n);this.trampleActive=[];this.movers=null;
      }
      const bend=this.trample,vel=this.trampleV,active=this.trampleActive,h=Math.min(dt,.05),w=7,zeta=.35;
      let kept=0;
      for(const k of active) {
        vel[k]+=(-w*w*bend[k]-2*zeta*w*vel[k])*h;bend[k]+=vel[k]*h;
        if(Math.abs(bend[k])<.02&&Math.abs(vel[k])<.1) {bend[k]=vel[k]=0;this.trampleOn[k]=0;}
        else active[kept++]=k;
      }
      active.length=kept;
      // Walkers, the grazing animals and the cursor push the blades aside,
      // but only while they move.
      const {pony,rabbit}=this.wildlife,{ponyX,rabbitX}=this.wander(),ground=this.cursor.active&&this.cursor.ground;
      const movers=[...this.folk.map(fig=>[fig.x,fig.z,3]),[ponyX,pony.z,4.2],[rabbitX,rabbit.z,1.6]];
      if(ground) movers.push([ground.x,ground.z,3.6]);
      const last=this.movers;
      this.movers=movers;
      if(last&&dt>0) movers.forEach(([x,z,r],i)=>{
        if(last[i]&&Math.hypot(x-last[i][0],z-last[i][1])/dt>.03) this.pushGrass(x,z,r);
      });
      // A tap on the meadow sends a ring outward through the grass.
      for(const ripple of this.ripples) if(!ripple.speed&&ripple.age<1.4) {
        const radius=ripple.age*11,strength=Math.exp(-ripple.age*1.2),cx=this.project(ripple.x,height(ripple.x,ripple.z),ripple.z).x;
        for(const k of this.grassIndices) {
          const off=Math.abs(Math.hypot(this.wx[k]-ripple.x,this.wz[k]-ripple.z)-radius);
          if(off<1.2) this.bendGrass(k,((k%this.cols+.5)*this.cw<cx?-1:1)*strength*(1-off/1.2));
        }
      }
      // Now and then a gust rolls across the meadow, laying the blades over
      // as it passes. They spring back up in its wake on their own.
      this.nextGust??=this.time+5;
      if(!this.gust&&this.time>=this.nextGust&&this.grassIndices.length) this.spawnGust();
      const gust=this.gust;
      if(gust) {
        gust.age+=dt;
        if(gust.age>=gust.life) {this.gust=null;this.nextGust=this.time+8+Math.random()*12;}
        else this.pushGust(gust);
      }
    }
    spawnGust() {
      // Aim it at a random patch of grass and start it just off screen.
      const k=this.grassIndices[Math.floor(Math.random()*this.grassIndices.length)];
      const dir=Math.random()<.5?1:-1,rx=Math.max(90,this.W*(.10+Math.random()*.10)),ry=rx*(.25+Math.random()*.15);
      const speed=Math.max(140,this.W*(.14+Math.random()*.08));
      this.gust={dir,rx,ry,speed,y:(Math.floor(k/this.cols)+.5)*this.ch,x0:dir>0?-rx:this.W+rx,age:0,life:(this.W+rx*2)/speed,
        strength:.8+Math.random()*.5,seed:Math.random()*100};
    }
    pushGust(gust) {
      const cw=this.cw,ch=this.ch,a=gust.age,swell=Math.sin(Math.PI*a/gust.life);
      const cx=gust.x0+gust.dir*gust.speed*a,cy=gust.y+Math.sin(a*.9+gust.seed)*gust.ry*.5;
      const i0=Math.max(0,Math.floor((cx-gust.rx)/cw)),i1=Math.min(this.cols-1,Math.floor((cx+gust.rx)/cw));
      const j0=Math.max(0,Math.floor((cy-gust.ry)/ch)),j1=Math.min(this.rows-1,Math.floor((cy+gust.ry)/ch));
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) {
        const k=j*this.cols+i;
        if(this.material[k]!==MAT.grass) continue;
        const x=(i+.5)*cw,y=(j+.5)*ch,e=((x-cx)/gust.rx)**2+((y-cy)/gust.ry)**2;
        if(e>=1) continue;
        // Ragged, streaky fingers rather than a smooth oval.
        const streak=noise(x*.025-a*gust.dir*1.5,y*.09,611+gust.seed);
        const push=(1-e)*gust.strength*(.6+swell*.4)*smooth(.25,.7,streak)*1.6;
        if(push>.05) this.bendGrass(k,gust.dir*Math.min(1,push));
      }
    }
    pushGrass(x,z,r) {
      const q=this.projection,c=this.project(x,height(x,z),z),cw=this.cw,ch=this.ch;
      const ci=Math.floor(c.x/cw),cj=Math.floor(c.y/ch),ri=Math.ceil(r*q.scale/cw)+1,rj=Math.ceil(r*q.scale/ch)+1;
      for(let j=Math.max(0,cj-rj);j<=Math.min(this.rows-1,cj+rj);j++) for(let i=Math.max(0,ci-ri);i<=Math.min(this.cols-1,ci+ri);i++) {
        const k=j*this.cols+i;
        if(this.material[k]!==MAT.grass) continue;
        const reach=1-Math.hypot(this.wx[k]-x,this.wz[k]-z)/r;
        if(reach>0) this.bendGrass(k,((i+.5)*cw<c.x?-1:1)*Math.min(1,reach*1.8));
      }
    }
    bendGrass(k,push) {
      if(Math.abs(push)<=Math.abs(this.trample[k])) return;
      this.trample[k]=push;this.trampleV[k]=0;
      if(!this.trampleOn[k]) {this.trampleOn[k]=1;this.trampleActive.push(k);}
    }
    spawnMeteor() {
      // Start somewhere in the visible upper sky and streak down and across,
      // away from the nearer side. One in six is a slow, bright fireball.
      const top=Math.min(this.H,innerHeight)*.5;
      for(let tries=0;tries<16;tries++) {
        const x=this.W*(.08+Math.random()*.84),y=8+top*Math.random();
        if(this.material[Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw)]!==MAT.sky) continue;
        const fireball=Math.random()<.16,side=x<this.W/2?1:-1,angle=.25+Math.random()*.45;
        this.meteors.push({x,y,dx:Math.cos(angle)*side,dy:Math.sin(angle),speed:fireball?240:420+Math.random()*260,age:0,
          life:fireball?1.9:.55+Math.random()*.5,length:fireball?30:9+Math.floor(Math.random()*12),fireball});
        return;
      }
    }
    skyGlyph(g,p,b,x,y,alpha=1) {
      const k=Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw),sheet=this.meteorAtlas;
      if(x>=0&&y>=0&&x<this.W&&y<this.H&&this.material[k]===MAT.sky) this.glyph(sheet.index[g],p,b,x,y,false,alpha,sheet);
    }
    drawMoon() {
      const moon=this.moon, r=moon.r;
      for (let j=-Math.ceil(r/this.ch);j<=Math.ceil(r/this.ch);j++) for(let i=-Math.ceil(r/this.cw);i<=Math.ceil(r/this.cw);i++) {
        const dx=i*this.cw,dy=j*this.ch,rr=Math.hypot(dx,dy)/r;
        if(rr>1) continue;
        const crater=noise(i*.8+7,j*.8+9,144), lit=clamp(.95-rr*.25+(crater-.5)*.45);
        const glyph=rr>.83?'.:o'[Math.floor(hash(i,j,148)*3)]:'@O%o*'[Math.floor(crater*4.99)];
        this.glyph(GI[glyph],'moon',lit,moon.x+dx,moon.y+dy);
      }
    }
    drawSky() {
      const t=this.time,plain=this.sky==='plain';
      for (const star of this.stars) {
        if(plain&&star.band) continue;
        const twinkle=star.scint?.55+Math.pow(.5+.5*Math.sin(t*star.rate*2.6+star.phase),3)*.75:.8+Math.sin(t*star.rate+star.phase)*.2;
        // A slow swell of light travels up the Milky Way.
        const shimmer=plain?1:1+star.glow*.45*Math.sin(star.s*.016-t*.55);
        this.glyph(star.g,star.p,star.b*twinkle*shimmer,star.x,star.y);
      }
      // The new sky bakes the moon into its glowing layer.
      if(plain) this.drawMoon();
      for(const m of this.meteors) {
        const life=m.age/m.life,travel=m.speed*m.age,fade=smooth(0,.1,life)*(1-smooth(.62,1,life));
        const x=m.x+m.dx*travel,y=m.y+m.dy*travel,spacing=4.5;
        const streak=m.dy>.6?(m.dx>0?'\\':'/'):'-';
        for(let i=0;i<m.length&&i*spacing<=travel;i++) {
          const sx=x-m.dx*i*spacing,sy=y-m.dy*i*spacing,tail=1-i/m.length;
          const g=i===0?(m.fireball?'@':'*'):i<3?(m.fireball?'*':'+'):i<m.length*.6?streak:'.';
          const p=m.fireball?(i<4?'cream':i<14?'ember':'star'):'star';
          this.skyGlyph(g,p,.55+tail*.65,sx,sy,fade*Math.sqrt(tail));
          // The fireball's head burns with a small halo of sparks.
          if(m.fireball&&i===0) for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) this.skyGlyph('+','cream',.75,sx+ox*this.cw,sy+oy*this.ch*.7,fade*.55);
          // Fireballs shed flickering sparks along their wake.
          if(m.fireball&&i>3&&hash(i,Math.floor(t*24),77)>.72) this.skyGlyph('.','ember',.8,sx+(hash(i,Math.floor(t*24),78)-.5)*this.cw*3,sy+(hash(i,Math.floor(t*24),79)-.5)*this.ch*2,fade*tail);
        }
      }
      const sat=this.satellite;
      if(sat&&!plain) {
        const p=sat.age/sat.life,flare=sat.flare<0?0:Math.exp(-Math.pow((p-sat.flare)/.012,2));
        const fade=smooth(0,.05,p)*(1-smooth(.95,1,p));
        this.skyGlyph(flare>.5?'*':flare>.2?'+':'.','star',.62+flare*.5,mix(sat.x0,sat.x1,p),mix(sat.y0,sat.y1,p),fade);
      }
    }
    drawWorld(staticPass=false) {
      const t=this.time,cw=this.cw,ch=this.ch;
      const lighting=this.moonlight;
      const trample=staticPass?null:this.trample;
      const lightFlickers=this.lights.map(l=>.83+Math.sin(t*8+l.phase)*.10+Math.sin(t*13+l.phase)*.06);
      for(let j=0;j<this.rows;j++) for(let i=0;i<this.cols;i++) {
        const k=j*this.cols+i,m=this.material[k];
        if(m===MAT.sky || (staticPass ? this.dynamic[k] : !this.dynamic[k])) continue;
        const x=(i+.5)*cw,y=(j+.5)*ch;
        let g=this.glyphs[k],p=PAL[MATERIAL_NAMES[m]],b=this.shade[k]*lighting*this.shadow[k];
        const warm=this.light[k]*lightFlickers[this.lightIndex[k]];
        if(m===MAT.grass) {
          // Only lamplit grass is drawn here; the rest is baked (drawTrampled).
          const bend=trample?trample[k]:0;
          g=this.grassGlyph(k,bend);
          b+=warm*.43+Math.abs(bend)*.20;
        } else if(m===MAT.water) {
          const surface=this.waterSample(k,t,lighting,warm);
          g=surface.g;p=surface.p;b=surface.b;
        } else if(m===MAT.warm) {
          b=.74+Math.sin(t*1.3+this.tags[k])*.10;
        } else { b+=warm*.34; }
        // A hovered or focused link board brightens under its lantern.
        const lit=this.signCell[k]>0&&this.signCell[k]===this.signHover;
        if(lit) b+=.24;
        if(m===MAT.stone) b*=1.12;
        if(m===MAT.rock) b*=1.10;
        // Atmospheric depth keeps the forest distant, foreground textured.
        b*=1-smooth(18,80,-this.wz[k])*.32;
        this.glyph(g,p,b,x,y,m===MAT.water?false:warm>.15||lit);
      }
      if(!staticPass) this.drawTrampled();
    }
    // A blade leans away from whatever brushed it; a tuft only shows a firm push.
    grassGlyph(k,bend) {
      if(this.grassBlade[k]) return this.bladeGlyph(this.grassRest[k]+bend);
      return Math.abs(bend)>.45?GI[bend>0?'/':'\\']:this.glyphs[k];
    }
    drawTrampled() {
      // Unlit grass is baked into the static layer. A cell something has bent
      // is cleared back to the background and redrawn bent.
      const active=this.trampleActive;
      if(!active) return;
      const c=this.ctx,cw=this.cw,ch=this.ch,d=this.dpr,lighting=this.moonlight;
      for(const k of active) {
        if(this.dynamic[k]) continue;
        const bend=this.trample[k],g=this.grassGlyph(k,bend);
        if(g===this.glyphs[k]) continue;
        const i=k%this.cols,j=(k-i)/this.cols,left=Math.round(i*cw*d)/d,top=Math.round(j*ch*d)/d;
        c.globalAlpha=1;c.fillStyle=BG;
        c.fillRect(left,top,Math.round((i+1)*cw*d)/d-left,Math.round((j+1)*ch*d)/d-top);
        const b=(this.shade[k]*lighting*this.shadow[k]+Math.abs(bend)*.20)*(1-smooth(18,80,-this.wz[k])*.32);
        this.glyph(g,PAL.grass,b,(i+.5)*cw,(j+.5)*ch);
      }
    }
    waterSample(k,t,lighting,warm=0,out=this.waterOut) {
      const x=this.wx[k],z=this.wz[k],grain=this.waterGrain[k],phase=this.waterPhase[k],phaseB=this.waterPhaseB[k],seed=this.seed[k];
      const cross=this.waterCross[k],run=this.waterSpeed[k]*6*FLOW_PERIOD;
      // Two staggered layers each carry the current a bounded distance, then
      // fade out and restart elsewhere while the other is fully visible.
      // Advecting by t*speed alone sheared the lanes into specks as the page
      // stayed open, since neighbouring cells drift at different speeds.
      let ribbon=0,breakup=0,weight=0;
      for(let layer=0;layer<2;layer++) {
        const cycle=t/FLOW_PERIOD+layer*.5,age=fract(cycle),w=1-Math.abs(age*2-1);
        const travel=z-(age-.5)*run+Math.floor(cycle)*41.3+layer*17.9;
        const bend=noise(cross*2.5,travel*.04,314)-.5;
        ribbon+=w*(noise(cross*9.4+bend*2.1,travel*.11,315)-.5);
        breakup+=w*(noise(cross*5.5-2,travel*.27,316)-.5);
        weight+=w*w;
      }
      // Renormalize so the blend keeps one layer's contrast and lane density.
      weight=Math.sqrt(weight);ribbon=.5+ribbon/weight;breakup=.5+breakup/weight;
      const flow=smooth(.57,.82,ribbon)*smooth(.26,.70,breakup)*(1-this.waterBank[k]*.60);
      const pulse=.5+.5*Math.sin(phase*.53+t*.37);
      const crest=Math.sin(phase+z*.43-t*.71)*.62+Math.sin(phaseB+x*.37+t*.23)*.25;
      let g=seed>.75&&grain>.36?GI['.']:0,p=PAL.water,b=.12+grain*.07,ring=0;
      // Warped noise gives irregular widths, gaps and lengths, rather than
      // equally spaced lanes. Advect it along the river's curved channel.
      if(flow>.10) {g=flow<.19?GI[',']:this.waterDirection[k];b=.24+flow*.34;}
      if(seed>.965&&crest>.55&&grain>.35) {g=GI['~'];b=.24+crest*.12;}
      // Localized circular disturbances drift a little with the river.
      for(const ripple of this.ripples) {
        const rz=ripple.z+ripple.age*.8,rx=ripple.x+riverX(rz)-riverX(ripple.z);
        const delta=Math.hypot(x-rx,z-rz)-ripple.age*(ripple.speed||9);
        if(Math.abs(delta)<1.3)ring+=Math.cos(delta*2.6)*(1-Math.abs(delta)/1.3)*Math.exp(-ripple.age*.85);
      }
      const beamX=riverX(z)+riverWidth(z)*.18+Math.sin(phase+t*.17)*.35,beamWidth=1.9+smooth(-10,90,z)*2.0;
      const moon=clamp(1-Math.abs(x-beamX)/beamWidth);
      if(moon>.1&&crest>.46&&seed>.47) {p=PAL.moon;g=GI[seed>.72?'=':'-'];b=.21+moon*(.22+Math.pow(Math.max(0,crest),2)*.22);}
      const wake=this.waterWake[k];
      if(wake>.18&&breakup>.42) {p=PAL.water;g=breakup>.65?this.waterDirection[k]:GI[','];b=.29+wake*.25;}
      const eddy=this.waterEddy[k],eddyPhase=this.waterEddyAngle[k]*2+this.waterEddyRadius[k]*5.1-t*this.waterEddySpin[k]*1.1+phase*.16;
      if(eddy>.12&&Math.sin(eddyPhase)>.72&&breakup>.22) {p=PAL.water;g=this.waterEddyDirection[k];b=.30+eddy*.26;}
      const pierRipple=this.waterPierRipple[k],pierWave=.5+.5*Math.sin(this.waterPierDistance[k]*2.45-t*1.8+phase*.11);
      if(pierRipple>.12&&pierWave>.93&&seed>.25) {p=PAL.water;g=this.waterPierDirection[k];b=.28+pierRipple*.28;}
      if(this.waterBank[k]>.38&&seed>.72&&pulse>.53) {p=PAL.water;g=GI['.'];b=.24+this.waterBank[k]*.12;}
      if(Math.abs(ring)>.16) {p=PAL.water;g=GI[ring>.35?'o':'~'];b=.34+Math.abs(ring)*.37;}
      if(warm>.035&&g&&crest>-.08) {p=PAL.fire;b+=warm*(.16+pulse*.16);}
      out.g=g;out.p=p;out.b=b*this.waterShadow[k]*lighting;
      return out;
    }
    drawStatic() {
      const key=String(Math.round(this.moonlight*18));
      if(this.staticKey!==key) {
        const main=this.ctx;
        this.ctx=this.staticContext;
        this.ctx.clearRect(0,0,this.W,this.H);
        this.drawWorld(true);
        this.ctx=main;
        this.staticKey=key;
      }
      this.ctx.globalAlpha=1;
      this.ctx.drawImage(this.staticCanvas,0,0,this.W,this.H);
    }
    drawFlower(f) {
      const sway=Math.sin(this.time*1.1+f.phase)*this.wind*(f.ornate?.32:.22);
      const lit=.63*this.moonlight+.14+f.warm*this.flicker*.30;
      if(!f.ornate) {
        this.worldGlyph('|','grass',.54,f.x+sway,f.y+.20,f.z);
        this.worldGlyph(f.head,f.palette,lit,f.x+sway,f.y+f.h,f.z);
        return;
      }
      const q=this.projection;
      const paint=(char,palette,b,side,y)=>this.worldGlyph(char,palette,b,f.x+sway+q.cy*side,f.y+y,f.z-q.sy*side);
      paint('|','moss',lit*.72,0,f.h*.28);
      paint(sway>0?'/':'\\','moss',lit*.77,sway*.18,f.h*.62);
      paint('/','grass',lit*.82,-.38,f.h*.38);
      paint('\\','grass',lit*.91,.38,f.h*.45);
      if(f.species===0) {
        // Daisy: a warm center, pale side petals and a small upper petal.
        paint('o','cream',lit,-.65,f.h);
        paint('o','cream',lit,.65,f.h);
        paint("'",'cream',lit,0,f.h+.50);
        paint('*','ember',lit*.81,0,f.h);
      } else if(f.species===1) {
        // Bell flowers hang from alternate sides of a taller curved stem.
        paint('|','moss',lit*.74,0,f.h);
        paint('v','lilac',lit,-.55,f.h*.79);
        paint('v','lilac',lit,.53,f.h+.20);
        paint("'",'lilac',lit*.92,.25,f.h+.72);
      } else if(f.species===2) {
        paint('o','pink',lit,-.48,f.h-.13);
        paint('o','pink',lit,.48,f.h+.10);
        paint('*','pink',lit*.96,0,f.h+.54);
        paint('v','moss',lit*.88,.20,f.h*.40);
      } else {
        paint('+','blue',lit,-.58,f.h);
        paint('+','blue',lit,.58,f.h);
        paint('*','blue',lit*.96,0,f.h+.48);
        paint('o','cream',lit*.87,0,f.h);
      }
    }
    drawMeadow() {
      const t=this.time;
      for(let l=0;l<this.lights.length-1;l++) {
        const light=this.lights[l];
        if(l>1) continue; // Bridge lanterns are lit geometry; gate torches flicker.
        this.worldGlyph('^','ember',.93,light.x,light.y+.1+Math.sin(t*13+l)*.12,light.z);
        this.worldGlyph('*','fire',.91,light.x,light.y-.25,light.z);
      }
      for(const f of this.flowers)this.drawFlower(f);
      for(const r of this.reeds) {
        const lean=Math.sin(t*.9+r.x)*this.wind*.35;
        this.worldGlyph('|','moss',.52,r.x,r.y+r.h*.35,r.z);
        this.worldGlyph(lean>.0?'/':'\\','moss',.65,r.x+lean,r.y+r.h*.75,r.z);
        this.worldGlyph("'",'wood',.52,r.x+lean*1.3,r.y+r.h,r.z);
      }
      // Flag attached to the tall rear tower, smoke from the keep chimney.
      const pole=this.project(...this.flag);
      for(let i=0;i<4;i++) this.worldGlyph('|','stone',.64,this.flag[0],this.flag[1]-1.32+i*.72,this.flag[2]);
      this.glyph(GI['>'],'pink',.68,pole.x+this.cw*(1+Math.sin(t*2)*.18),pole.y-this.ch);
      for(let i=0;i<9;i++) {
        const age=(t*.35+i/9)%1;
        this.worldGlyph(age<.5?':':'.','sky',.36,this.chimney[0]+age*3*this.wind,this.chimney[1]+age*5,this.chimney[2],1-age);
      }
      const f=this.fire,p=this.project(f.x,f.y,f.z);
      this.sprite([' . . ','(x=x)'],f.x,f.y+.05,f.z,'rock',.6);
      for(let j=0;j<4;j++) for(let i=-1;i<=1;i++) {
        const flick=Math.sin(t*11+j*3+i*2),h=3+flick*.6-Math.abs(i);
        if(j>h) continue;
        this.glyph(GI[j>2?"'":j>1?'^':'*'],j<2?'fire':'ember',.9,p.x+i*this.cw*.8+Math.sin(t*7+j)*1.7,p.y-j*this.ch);
      }
      for(const spark of this.sparks) {
        const a=spark.age/spark.life;
        this.worldGlyph(a>.5?'.':"'",'ember',.9,f.x+spark.dx+this.wind*a*2,f.y+.8+a*4,f.z,1-a);
      }
      for(let i=0;i<11;i++) {
        const age=(t*.16+i/11)%1;
        this.worldGlyph(age<.4?':':'.','sky',.47,f.x+age*4*this.wind+Math.sin(age*9)*.35,f.y+1.4+age*8,f.z,Math.sin(age*Math.PI)*.55);
      }
      const camp=this.camp;
      const tent=camp.tent,front=tent.z+2.16,peak=tent.y+3.6;
      this.worldStroke([tent.x-2.65,tent.y,front],[tent.x,peak,front],'canvas',.87);
      this.worldStroke([tent.x,peak,front],[tent.x+2.65,tent.y,front],'canvas',.96);
      this.worldStroke([tent.x,peak,front],[tent.x,peak,tent.z-2.1],'canvas',.83);
      this.sprite(['(__)','(==)'],camp.woodpile.x,camp.woodpile.y+.55,camp.woodpile.z,'bark',.77);
      this.sprite([' __','[##]','|__|'],camp.pack.x,camp.pack.y+.12,camp.pack.z,'cloth',.68);
      for(const side of [-1,1]) {
        const tx=camp.tent.x+side*3.45,tz=camp.tent.z+2.7,ty=height(tx,tz);
        this.worldStroke([tent.x+side*2.25,tent.y+.9,tent.z+2.14],[tx,ty+.10,tz],'wood',.63);
        this.worldGlyph('x', 'wood',.68,tx,ty+.08,tz);
      }
      this.drawBridgeRails();
      // Tiny mushrooms along the quieter western flower bank.
      for(let i=0;i<9;i++) {
        const x=-20-hash(i,171)*11,z=24+hash(i,172)*35;
        this.worldGlyph('o','cream',.61,x,height(x,z)+.35,z);
        this.worldGlyph('|','wood',.37,x,height(x,z)+.12,z);
      }
      // Animals and people share one far-to-near pass, so whoever stands
      // nearer covers the other; an animal's matte never erases a person.
      const {dog,pony,rabbit}=this.wildlife,{ponyX,rabbitX}=this.wander(t);
      const actors=[
        {x:dog.x,y:dog.y,z:dog.z,draw:()=>this.sprite(SPRITES.dog,dog.x,dog.y,dog.z,'deer',.76,0,{actor:true,eyePalette:'cream',fireSide:-1,opaque:true})},
        {x:ponyX,y:height(ponyX,pony.z)+.12,z:pony.z,draw:a=>this.sprite(Math.sin(t*.65)>.70?SPRITES.ponyStep:SPRITES.pony,a.x,a.y,a.z,'deer',.78,0,{actor:true,opaque:true,mask:SPRITES.ponyMask,ponyHead:true})},
        {x:rabbitX,y:height(rabbitX,rabbit.z)+.12,z:rabbit.z,draw:a=>this.sprite(SPRITES.rabbit,a.x,a.y,a.z,'cream',.68,0,{actor:true,eyePalette:'deer',opaque:true})},
        ...this.folk.filter(fig=>!fig.hidden).map(fig=>({x:fig.x,y:fig.y,z:fig.z,draw:()=>this.drawFigure(fig)})),
      ];
      for(const a of actors)a.d=this.project(a.x,a.y,a.z).d;
      actors.sort((a,b)=>a.d-b.d);
      for(const a of actors)a.draw(a);
      for(let i=0;i<28;i++) {
        let x=-31+hash(i,181)*81+Math.sin(t*.31+i*2)*2;
        let z=9+hash(i,182)*49+Math.sin(t*.23+i)*2;
        if(this.cursor.active&&this.cursor.ground) {
          const target=this.cursor.ground,distance=Math.hypot(x-target.x,z-target.z);
          if(distance<17) {const attraction=(1-distance/17)*.14;x+=(target.x-x)*attraction;z+=(target.z-z)*attraction;}
        }
        if(riverDistance(x,z)<2) continue;
        const y=height(x,z)+.8+Math.sin(t*.47+i)*.6;
        const blink=Math.pow(Math.max(0,Math.sin(t*1.15+i*1.83)),3)*.9;
        this.worldGlyph(i%4?'.':'*','fly',.95,x,y,z,blink);
      }
    }
    render(dt=0) {
      const started=performance.now();
      if(!this.paused&&!this.reduced) this.update(dt);
      else if(!this.flicker) { this.flicker=.88;this.wind=.32; }
      const c=this.ctx;
      c.globalAlpha=1;c.fillStyle=BG;c.fillRect(0,0,this.W,this.H);
      if(this.sky!=='plain'&&this.skyRows) c.drawImage(this.hazeCanvas,0,0,this.hazeCanvas.width/this.dpr,this.hazeCanvas.height/this.dpr);
      this.drawSky();this.drawStatic();this.drawWorld();this.drawMeadow();
      if(this.linkStyle==='sign') this.drawSign(); else this.drawFlyWords();
      c.globalAlpha=1;
      this.canvas.dataset.renderMs=(performance.now()-started).toFixed(1);
      this.canvas.dataset.ripples=String(this.ripples.length);
      this.canvas.dataset.meteors=String(this.meteors.length);
    }
    tap(px,py) {
      const p=this.groundAt(px,py);
      this.ripples.push({x:p.x,z:p.z,age:0});
      if(this.ripples.length>5) this.ripples.shift();
    }
    dispose() {
      cancelAnimationFrame(this.raf);
      this.abort.abort();
      this.canvas.remove();
      if(this.hazeCanvas) this.hazeCanvas.width=this.hazeCanvas.height=0;
      if(this.meteorAtlas) this.meteorAtlas.canvas.width=this.meteorAtlas.canvas.height=0;
      if(this.tools) this.tools.remove();
    }
  }

  function createStudio(scene) {
    const style=document.createElement('style');
    style.textContent=`
      .river-tools { position:fixed;z-index:3;bottom:max(18px,env(safe-area-inset-bottom));right:20px;display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100vw - 20px);gap:6px;align-items:center; }
      .river-tools button { font:11px ${FONT};color:#b8c7c2;background:#0b1520e8;border:1px solid #2a3a43;border-radius:4px;padding:8px 10px;cursor:pointer; }
      .river-tools button:hover,.river-tools button:focus-visible { color:#f0eddc;border-color:#809b9e;outline:0; }
      @media(max-width:600px) { .river-tools { right:10px;bottom:12px;gap:4px; }.river-tools button {font-size:10px;padding:7px 8px;} }
    `;
    document.head.appendChild(style);
    if(new URLSearchParams(location.search).get('studio')!=='1') return;
    const tools=document.createElement('aside');tools.className='river-tools';tools.setAttribute('aria-label','Landscape preview');
    const sky=document.createElement('button'),detail=document.createElement('button'),pause=document.createElement('button');
    sky.textContent='Sky: New';detail.textContent='Detail: Fine';pause.textContent='Pause';
    sky.addEventListener('click',()=>{
      scene.sky=scene.sky==='new'?'plain':'new';
      sky.textContent='Sky: '+(scene.sky==='new'?'New':'Plain');
      scene.render();
    });
    detail.setAttribute('aria-pressed','true');
    detail.addEventListener('click',()=>{
      scene.detail=scene.detail==='fine'?'standard':'fine';
      detail.textContent='Detail: '+(scene.detail==='fine'?'Fine':'Standard');
      detail.setAttribute('aria-pressed',String(scene.detail==='fine'));
      scene.resize();scene.render();
    });
    pause.setAttribute('aria-pressed','false');
    if(scene.reduced) { pause.disabled=true;pause.textContent='Still'; }
    pause.addEventListener('click',()=>{ scene.paused=!scene.paused;pause.textContent=scene.paused?'Resume':'Pause';pause.setAttribute('aria-pressed',String(scene.paused)); });
    tools.append(sky,detail,pause);document.body.appendChild(tools);scene.tools=tools;
  }

  window.__themes=window.__themes||{};
  window.__themes.riverkeep={
    start(content) {
      const canvas=document.createElement('canvas');canvas.className='bg-canvas';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
      const scene=new RiverKeep(canvas,content);scene.abort=new AbortController();
      const signal=scene.abort.signal;
      createStudio(scene);
      let resizeTimer;
      const resize=()=>{ clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{scene.resize();scene.render();},140); };
      window.addEventListener('resize',resize,{signal});
      window.addEventListener('orientationchange',resize,{signal});
      // Hovering, pressing or focusing a link lights its board.
      for(const link of content.querySelectorAll('[data-board]')) {
        const set=value=>{scene.signHover=value;if(scene.reduced||scene.paused)scene.render();};
        const board=+link.dataset.board;
        link.addEventListener('pointerenter',()=>set(board),{signal});
        link.addEventListener('pointerleave',()=>set(-1),{signal});
        link.addEventListener('focus',()=>set(board),{signal});
        link.addEventListener('blur',()=>set(-1),{signal});
      }
      if(CSS.supports('-webkit-touch-callout','none')) {
        const park=()=>window.scrollTo(0,80);park();
        document.addEventListener('touchmove',e=>{if(!e.target.closest('.river-tools'))e.preventDefault();},{passive:false,signal});
        window.addEventListener('load',park,{signal});
        window.addEventListener('scroll',()=>{if(Math.abs(scrollY-80)>1)park();},{passive:true,signal});
      }
      let down=null;
      if(!scene.reduced) {
        window.addEventListener('pointermove',e=>{scene.cursor={x:e.pageX,y:e.pageY,active:true,ground:scene.groundAt(e.pageX,e.pageY)};},{passive:true,signal});
        window.addEventListener('pointerout',e=>{if(!e.relatedTarget)scene.cursor.active=false;},{signal});
        window.addEventListener('pointerdown',e=>{if(!e.target.closest('a,button'))down={x:e.pageX,y:e.pageY,t:performance.now()};},{signal});
        window.addEventListener('pointerup',e=>{if(down&&performance.now()-down.t<350&&Math.hypot(e.pageX-down.x,e.pageY-down.y)<10)scene.tap(e.pageX,e.pageY);down=null;},{signal});
        window.addEventListener('pointercancel',()=>{down=null;scene.cursor.active=false;},{signal});
      }
      let last=performance.now(),lastFrame=0;
      const loop=now=>{
        if(!document.hidden&&!scene.paused&&now-lastFrame>32) {const dt=Math.min(.08,(now-last)/1000);last=now;lastFrame=now;scene.render(dt);}
        scene.raf=requestAnimationFrame(loop);
      };
      document.addEventListener('visibilitychange',()=>{last=performance.now();},{signal});
      scene.render();
      if(!scene.reduced)scene.raf=requestAnimationFrame(loop);
      window.__riverkeep=scene;
      return scene;
    },
  };
})();
