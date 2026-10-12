// River Keep: an original, oblique-view world drawn entirely with ASCII.
// A small CPU depth buffer gives architecture, terrain and glyph actors the
// same projection and occlusion. Geometry is sampled into character cells;
// it is never painted as a solid silhouette underneath the characters.
// Static world sampling is cached. Weather, lighting, water and living
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
  const PONY_HEAD = {scale:.88,firstColumn:5,rows:3,pivotColumn:6,pivotRow:3};
  const SPRITES = {
    camper:[' o ','/|_','/ >'],
    friend:[' o ',' /|','< \\'],
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
    rain: [117, 151, 168], fly: [219, 231, 139], cloth: [160, 178, 187],
    deer: [170, 135, 91], ember: [255, 206, 103], moss: [98, 129, 86],
    shrub: [89, 139, 78], bark: [176, 111, 60],
    canvas: [184, 161, 122], earth: [140, 112, 77],
  };
  const MATERIAL_NAMES = ['sky', 'grass', 'water', 'stone', 'tree', 'wood', 'path', 'rock', 'roof', 'dark', 'warm', 'shrub', 'bark', 'canvas', 'earth'];
  const PALETTE_NAMES = Object.keys(COLORS);
  const PAL = Object.fromEntries(PALETTE_NAMES.map((n, i) => [n, i]));
  const LEVELS = 16;
  const MOON_LIGHT = { x: .72, y: .92, z: .48 };
  // One scene scale and one pixel coordinate system. Viewports reveal a
  // crop around its center; scene objects never move or shrink to fit.
  const VIEW = { width:1200, height:900, originX:560, originY:441, scale:6.75 };
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
  const riverWidth = z => 4.6 + smooth(-10, 65, z) * 12 + 3.6*Math.exp(-Math.pow((z+1)/11,2));
  const riverDistance = (x, z) => Math.abs(x - riverX(z)) - riverWidth(z);
  function height(x, z) {
    const land = .8 + fbm(x * .055, z * .05) * 1.7;
    const island = Math.hypot((x + 19) / 21, (z + 23) / 17);
    const plateau = (1 - smooth(.71, 1.13, island)) * 4.0;
    const bank = smooth(-.7, 2.9, riverDistance(x, z));
    return mix(-.75, land + plateau, bank);
  }
  function pathDistance(x, z) {
    // Gate path turns toward the bridge; the eastern path winds to camp.
    const gate = Math.hypot((x + 18) * .75, Math.max(0, -13 - z), Math.max(0, z + 1));
    const west = Math.hypot(Math.max(0, -18 - x), Math.max(0, x - 4), (z + 1) * 1.2);
    const trailX = 27 + Math.sin((z - 2) * .085) * 6;
    const east = Math.hypot(x - trailX, Math.max(0, -2 - z)) * .8;
    return Math.min(gate, west, east);
  }

  class RiverKeep {
    constructor(canvas, content) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.content = content;
      this.time = 0;
      this.weather = 'auto';
      this.detail = 'fine';
      this.camera = { x:0, y:0 };
      this.paused = false;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.rain = 0;
      this.cloud = .15;
      this.flash = 0;
      this.meteors = [];
      this.ripples = [];
      this.sparks = [];
      this.splashes = [];
      this.nextMeteor = 7;
      this.nextLightning = 5;
      this.cursor = { x: -999, y: -999, active: false };
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
      this.fire = { x:riverX(30)+riverWidth(30)+7.0, z:30 };
      this.fire.y = height(this.fire.x, this.fire.z);
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
      // A narrow walking bridge: three open stone arches, a modest path
      // and light timber handrails without projecting corner platforms.
      const bridgeStart=this.polygons.length;
      const bx=riverX(-1),bz=-1,deck=7.2,half=1.35,start=bx-13.5,end=bx+13.5;
      this.bridge={x:bx,z:bz,deck,half,start,end,piers:[bx-4.5,bx+4.5]};
      const archSpring=1.0,archRadius=3.55,rise=4.45,ring=.90;
      for (const z of [bz-half,bz+half]) {
        for (let arch = 0; arch < 3; arch++) {
          const cx=start+4.5+arch*9,face=z>bz?1.05:.42;
          for (let i = 0; i < 20; i++) {
            const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
            const inside=t=>[cx+Math.cos(t)*archRadius,archSpring+Math.sin(t)*rise,z];
            const outside=t=>[cx+Math.cos(t)*(archRadius+ring),archSpring+Math.sin(t)*(rise+ring),z];
            const ia=inside(a),ib=inside(b),oa=outside(a),ob=outside(b);
            this.addPoly([oa,ob,[ob[0],deck,z],[oa[0],deck,z]],MAT.stone,face*.61,0,{part:'bridgeWall'});
            this.addPoly([ia,ib,ob,oa],MAT.stone,face*(i%2?1.08:1.17),0,{part:'archRing',x:cx,base:archSpring,r:archRadius,rise});
          }
          this.box(cx,archSpring+rise-.03,z+(z>bz?.05:-.05),.64,.76,.25,MAT.stone);
        }
      }
      for(let arch=0;arch<3;arch++) {
        const cx=start+4.5+arch*9;
        for(let i=0;i<20;i++) {
          const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
          const x1=cx+Math.cos(a)*archRadius,x2=cx+Math.cos(b)*archRadius,y1=archSpring+Math.sin(a)*rise,y2=archSpring+Math.sin(b)*rise;
          this.addPoly([[x1,y1,bz+half],[x2,y2,bz+half],[x2,y2,bz-half],[x1,y1,bz-half]],MAT.stone,.19+.08*Math.sin(a),0,{part:'vault'});
        }
      }
      for(let i=0;i<=3;i++) {
        const x=start+i*9;
        this.box(x,-.65,bz,1.85,deck+.65,half*2,MAT.stone,{part:'bridgePier'});
        this.box(x,-.30,bz,2.25,.45,half*2+.3,MAT.rock);
        if(i===1||i===2) {
          const tip=bz+half+1.05;
          this.addPoly([[x-.9,-.2,bz+half],[x,-.2,tip],[x,1.25,tip],[x-.9,1.25,bz+half]],MAT.rock,.51);
          this.addPoly([[x,-.2,tip],[x+.9,-.2,bz+half],[x+.9,1.25,bz+half],[x,1.25,tip]],MAT.rock,.84);
          this.addPoly([[x-.9,1.25,bz+half],[x,1.25,tip],[x+.9,1.25,bz+half]],MAT.rock,1.0);
        }
      }
      this.box(bx,deck,bz,27.1,.25,half*2,MAT.path,{part:'bridgeDeck'});
      for(const z of [bz-half,bz+half]) {
        this.box(bx,deck+1.24,z,27.0,.16,.17,MAT.wood,{part:'bridgeHandrail'});
        for(let x=start+.35;x<end;x+=4.4)this.box(x,deck+.25,z,.15,1.1,.15,MAT.wood);
      }
      for(const [x,side] of [[start,-1],[end,1]]) {
        const bank=x+side*4.5,bankY=height(bank,bz);
        this.addPoly([[x,deck+.25,bz-half+.18],[bank,bankY+.12,bz-.75],[bank,bankY+.12,bz+.75],[x,deck+.25,bz+half-.18]],MAT.path,.60);
        this.box(x,1.6,bz,2.05,deck-1.6,half*2);
      }
      for (const x of [start+3,end-3]) {
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
        if(pathDistance(x,z)<2.4||this.campDistance(x,z)<1.20||riverDistance(x,z)<1.5)continue;
        this.shrubs.push({x,z,y:height(x,z),r:1.1+hash(i,262)*1.7,h:.8+hash(i,263)*1.1,seed:i+600});
      }
      for(const tree of this.trees) {
        if(tree.z<-25||tree.seed%4!==0||this.campDistance(tree.x+1,tree.z+.5)<1.20)continue;
        this.shrubs.push({x:tree.x+1.0,z:tree.z+.5,y:height(tree.x+1,tree.z+.5),r:1.1,h:.85,seed:tree.seed+900});
      }
      this.makeCamp();
      this.wildlife={
        dog:{x:this.fire.x+11,z:this.fire.z+5.5},
        pony:{x:-27,z:18},rabbit:{x:-13,z:39},
      };
      for(const animal of Object.values(this.wildlife))animal.y=height(animal.x,animal.z)+.12;
      for (let i = 0; i < 17; i++) {
        const z = 5 + hash(i, 48) * 53, side = i % 2 ? 1 : -1;
        const x = riverX(z) + side * (riverWidth(z) + .4 + hash(i, 50) * 2.5);
        this.box(x, Math.max(0, height(x, z)) - .2, z, .7 + hash(i, 52), .45 + hash(i, 53), .8 + hash(i, 54), MAT.rock);
      }
    }

    campDistance(x,z) {
      return Math.hypot((x-this.fire.x-2)/8.3,(z-this.fire.z+.4)/6.8);
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
      this.gridY=Math.floor(((VIEW.height-this.H)/2+this.camera.y)/this.ch);
      this.view={x:this.gridX*this.cw,y:this.gridY*this.ch};
      const yaw = .52, pitch = .58;
      this.projection = { cy:Math.cos(yaw),sy:Math.sin(yaw),cp:Math.cos(pitch),sp:Math.sin(pitch),scale:VIEW.scale,originX:VIEW.originX-this.view.x,origin:VIEW.originY-this.view.y };
      this.makeAtlas();
      this.sampleWorld();
      this.staticCanvas = document.createElement('canvas');
      this.staticCanvas.width = this.canvas.width; this.staticCanvas.height = this.canvas.height;
      this.staticContext = this.staticCanvas.getContext('2d', {alpha:true});
      this.staticContext.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.staticContext.imageSmoothingEnabled = false;
      this.staticKey = '';
      this.measureZone();
      this.canvas.dataset.grid = `${this.cols}x${this.rows} cell=${this.cw.toFixed(2)}x${this.ch.toFixed(2)} dpr=${this.dpr}`;
      this.canvas.dataset.detail = this.detail;
      this.canvas.dataset.view = `crop=${this.view.x},${this.view.y} scale=${VIEW.scale} font=${this.font}`;
    }
    makeAtlas() {
      const world=this.buildAtlas(this.font,this.cw,this.ch,PALETTE_NAMES);
      this.atlas=world.canvas;this.aw=world.aw;this.ah=world.ah;
      // Actors get a small, separate glyph sheet. Their font and spacing
      // stay fixed across viewports and terrain-detail settings.
      this.actorAtlas=this.buildAtlas(ACTOR.font,ACTOR.cw,ACTOR.ch,['deer','cream'],true);
      this.camperAtlas=this.buildAtlas(CAMPER.font,CAMPER.cw,CAMPER.ch,['cloth','cream']);
      this.ponyHeadAtlas=this.buildAtlas(ACTOR.font*PONY_HEAD.scale,ACTOR.cw*PONY_HEAD.scale,ACTOR.ch*PONY_HEAD.scale,['deer','cream'],true);
    }
    buildAtlas(font,cw,ch,names,actor=false) {
      const d = this.dpr;
      const aw=Math.ceil(cw*d),ah=Math.ceil(ch*d);
      const cv = document.createElement('canvas');
      cv.width = aw * GLYPHS.length;
      cv.height = ah * names.length * LEVELS * 2;
      const c = cv.getContext('2d');
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let warmth = 0; warmth < 2; warmth++) for (let p = 0; p < names.length; p++) for (let l = 0; l < LEVELS; l++) {
        c.font = `${actor?600:['stone','rock','star','moon','fire','ember'].includes(names[p])?700:400} ${font * d}px ${FONT}`;
        const rgb = COLORS[names[p]], b = .17 + l / (LEVELS - 1) * 1.03;
        const row = (warmth * names.length + p) * LEVELS + l;
        const tint = warmth ? [1.32, .99, .57] : [1, 1, 1];
        c.fillStyle = `rgb(${rgb.map((v, k) => Math.round(clamp(v * b * tint[k], 0, 255))).join(',')})`;
        for (let g = 1; g < GLYPHS.length; g++) c.fillText(GLYPHS[g],g*aw+aw/2,row*ah+ah*.5);
      }
      return {canvas:cv,aw,ah,cw,ch,names,palette:Object.fromEntries(names.map((name,i)=>[name,i]))};
    }
    glyph(g, palette, brightness, x, y, warm = false, alpha = 1, sheet=null) {
      if(sheet) {this.sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet);return;}
      if (!g || alpha < .015 || brightness < .025) return;
      const l = Math.round(clamp(brightness*1.18+.025) * (LEVELS - 1));
      const p=typeof palette==='string'?PAL[palette]:palette;
      const row=(p+(warm?PALETTE_NAMES.length:0))*LEVELS+l;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(this.atlas,g*this.aw,row*this.ah,this.aw,this.ah,Math.round((x-this.cw/2)*this.dpr)/this.dpr,Math.round((y-this.ch/2)*this.dpr)/this.dpr,this.cw,this.ch);
    }
    sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet) {
      if(!g||alpha<.015||brightness<.025)return;
      const l=Math.round(clamp(brightness*1.18+.025)*(LEVELS-1));
      const p=sheet.palette[typeof palette==='string'?palette:PALETTE_NAMES[palette]];
      const row=(p+(warm?sheet.names.length:0))*LEVELS+l;
      this.ctx.globalAlpha=alpha;
      this.ctx.drawImage(sheet.canvas,g*sheet.aw,row*sheet.ah,sheet.aw,sheet.ah,Math.round((x-sheet.cw/2)*this.dpr)/this.dpr,Math.round((y-sheet.ch/2)*this.dpr)/this.dpr,sheet.cw,sheet.ch);
    }
    measureZone() {
      const r = this.content.getBoundingClientRect();
      this.zone = { x: r.left + scrollX + r.width / 2, y: r.top + scrollY + r.height / 2, w: r.width / 2 + 7, h: r.height / 2 + 5 };
      this.staticKey = '';
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
      this.waterGrain=new Float32Array(n);this.waterPhase=new Float32Array(n);this.waterPhaseB=new Float32Array(n);
      this.waterCross=new Float32Array(n);this.waterDirection=new Uint8Array(n);
      this.waterEddy=new Float32Array(n);this.waterEddyAngle=new Float32Array(n);this.waterEddyRadius=new Float32Array(n);
      this.waterEddySpin=new Int8Array(n);this.waterEddyDirection=new Uint8Array(n);
      this.waterPierDistance=new Float32Array(n).fill(1e3);this.waterPierRipple=new Float32Array(n);this.waterPierDirection=new Uint8Array(n);
      this.waterSpeed=new Float32Array(n);this.waterBank=new Float32Array(n);this.waterWake=new Float32Array(n);this.waterShadow=new Float32Array(n).fill(1);
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
        this.dynamic[k] = m===MAT.grass || m===MAT.water || m===MAT.warm || best>.05 ? 1 : 0;
      }
      for(const flower of this.flowers)flower.warm=this.light[flower.k];
      this.stars = [];
      for(let gy=Math.floor(this.view.y/40);gy<=Math.ceil((this.view.y+this.H)/40);gy++) for(let gx=Math.floor(this.view.x/48);gx<=Math.ceil((this.view.x+this.W)/48);gx++) {
        const x=gx*48+hash(gx,gy,101)*48-this.view.x,y=gy*40+hash(gx,gy,102)*40-this.view.y;
        if(x<0||x>=this.W||y<0||y>=this.H)continue;
        const k = Math.floor(y / this.ch) * this.cols + Math.floor(x / this.cw);
        if(this.material[k]===MAT.sky)this.stars.push({x,y,b:.35+hash(gx,gy,103)*.6,phase:hash(gx,gy,104)*TAU,g:hash(gx,gy,105)>.96?GI['+']:GI['.']});
      }
      this.moon={x:800-this.view.x,y:110-this.view.y,r:23};
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
        if(surface?.part==='archRing') {
          const angle=Math.atan2((wy-surface.base)/surface.rise,(wx-surface.x)/surface.r);
          const tx=-surface.r*Math.sin(angle),ty=surface.rise*Math.cos(angle);
          const sx=this.projection.cy*tx,sy=this.projection.sp*this.projection.sy*tx-this.projection.cp*ty;
          const slope=Math.abs(sx)<.001?100:sy/sx;
          glyph=Math.abs(slope)>1.5?'|':Math.abs(slope)<.35?'=':slope>0?'\\':'/';
          shade*=1.08;
        } else if(surface?.part==='vault')glyph=seed>.8?'-':':';
        else if(surface?.part==='bridgeDeck') {glyph=seed>.78?':':'.';shade*=.94;}
        else if(surface?.part==='bridgeHandrail') {glyph='-';shade*=1.20;}
        else if(surface?.part==='campLog')glyph=ny?'-':seed>.75?':':'=';
        else if(surface?.part==='tentCanvas')glyph=seed>.77?':':seed>.44?'/':'.';
        else if(surface?.part==='tentFront')glyph=seed>.82?'/':seed>.55?':':'.';
        else if(surface?.part==='bedroll')glyph=seed>.60?'=':'~';
        else if(surface?.part==='bridgePier') {glyph=joint?':':mortar?'-':'#';shade*=1.26;}
        else if(surface?.part==='bridgeWall')glyph=mortar?'-':joint?':':'=';
        if(m===MAT.stone&&surface?.kind==='round') {
          glyph=surface.part==='inside'?':':edge?'|':mortar?'-':joint?':':diffuse>.72?(seed<.18?'%':'#'):diffuse>.32?(seed<.22?'+':'='):'=';
        }
        shade*=(.95+seed*.06)*(mortar?.82:1)*(wy<6.5&&m===MAT.stone&&!surface?.bridge ? .80 : 1);
        if(m===MAT.stone) shade*=this.castleShadow(wx+nx*.09,wy+ny*.09+.03,wz+nz*.09,surface);
        this.material[k] = m; this.shade[k] = shade; this.glyphs[k] = GI[glyph]; this.wx[k] = wx; this.wy[k] = wy; this.wz[k] = wz; this.tags[k] = poly.tag; this.curved[k]=surface?.kind==='round'?1:0; this.shadow[k]=1;
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

    zoneAlpha(x,y) {
      if (this.content.hidden) return 1;
      const z = this.zone, dx = Math.max(0,Math.abs(x-z.x)-z.w), dy = Math.max(0,Math.abs(y-z.y)-z.h);
      return .14 + smooth(0,75,Math.hypot(dx,dy))*.86;
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
      this.glyph(GI[char],palette,b,p.x+offsetX,p.y+offsetY,false,alpha*this.zoneAlpha(p.x,p.y));
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
    sprite(lines, x,y,z, palette='cloth', brightness=.85, bob=0, options=null) {
      const p = this.project(x,y,z), width = Math.max(...lines.map(l => l.length));
      const sheet=options?.camper?this.camperAtlas:options?.actor?this.actorAtlas:null,cw=sheet?sheet.cw:this.cw,ch=sheet?sheet.ch:this.ch;
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
          this.ctx.globalAlpha=this.zoneAlpha(cell.x,cell.y);
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
        if (this.visible(cell,options?.opaque)) this.glyph(GI[char],color,b,cell.x,cell.y,warm,this.zoneAlpha(cell.x,cell.y),cell.sheet);
      }
    }
    weatherAt(t) {
      if (this.weather !== 'auto') return { rain: this.weather === 'storm' ? 1 : this.weather === 'rain' ? .56 : 0, cloud: this.weather === 'storm' ? .95 : this.weather === 'rain' ? .68 : .12 };
      // A readable clear opening, then long gradual fronts. No random initial storm.
      const front = smooth(28,60,t%190)*(1-smooth(113,166,t%190));
      const wave = .62+.38*Math.sin(t*.018-1);
      return { rain: front * (.30 + wave * .65), cloud: .16+front*.78 };
    }
    update(dt) {
      const t = this.time += dt;
      const weather = this.weatherAt(t);
      this.rain = mix(this.rain, weather.rain, 1-Math.exp(-dt*.65));
      this.cloud = mix(this.cloud, weather.cloud, 1-Math.exp(-dt*.35));
      this.wind = .3 + Math.sin(t*.21)*.23 + this.rain*.65;
      this.flicker = .82+Math.sin(t*9.1)*.09+Math.sin(t*17.7)*.06;
      this.moonlight = .95-this.cloud*.40;
      this.flash = Math.max(0,this.flash-dt*3.8);
      if (t > this.nextLightning && this.rain > .8) { this.flash = 1; this.nextLightning = t+9+hash(Math.floor(t),48)*18; }
      if (t >= this.nextMeteor) {
        this.nextMeteor = t+18+hash(Math.floor(t),49)*29;
        if(this.cloud<.52)this.meteors.push({x:VIEW.width*(.18+hash(Math.floor(t),50)*.5),y:VIEW.height*(.04+hash(Math.floor(t),51)*.10),age:0,life:1.15});
      }
      for (const meteor of this.meteors) meteor.age += dt;
      this.meteors = this.meteors.filter(m=>m.age<m.life);
      for (const r of this.ripples) r.age += dt;
      this.ripples = this.ripples.filter(r=>r.age<3.8);
      for (const s of this.sparks) s.age += dt;
      this.sparks = this.sparks.filter(s=>s.age<s.life);
      if (hash(Math.floor(t*60),97) < dt*8 && this.sparks.length<25) this.sparks.push({ age:0,life:1.5+hash(Math.floor(t*60),98)*1.7,dx:(hash(Math.floor(t*60),99)-.5)*1.6 });
      this.canvas.dataset.weather = `${this.weather} rain=${this.rain.toFixed(2)} cloud=${this.cloud.toFixed(2)}`;
    }
    drawSky() {
      const t=this.time;
      for (const star of this.stars) {
        const cloud=smooth(.43,.73,noise((star.x+this.view.x)/VIEW.width*5+t*.017,(star.y+this.view.y)/VIEW.height*9,132))*this.cloud;
        const b = (star.b*.85+.20)*(.88+Math.sin(t*.7+star.phase)*.12)*(1-cloud*.90)*(1-this.cloud*.45);
        this.glyph(star.g,'star',b,star.x,star.y,false,this.zoneAlpha(star.x,star.y));
      }
      const moon=this.moon, r=moon.r;
      for (let j=-Math.ceil(r/this.ch);j<=Math.ceil(r/this.ch);j++) for(let i=-Math.ceil(r/this.cw);i<=Math.ceil(r/this.cw);i++) {
        const dx=i*this.cw,dy=j*this.ch,rr=Math.hypot(dx,dy)/r;
        if(rr>1) continue;
        const crater=noise(i*.8+7,j*.8+9,144), lit=clamp(.95-rr*.25+(crater-.5)*.45);
        const glyph=rr>.83?'.:o'[Math.floor(hash(i,j,148)*3)]:'@O%o*'[Math.floor(crater*4.99)];
        this.glyph(GI[glyph],'moon',lit*(1-this.cloud*.62),moon.x+dx,moon.y+dy);
      }
      // Wispy, sparse character clouds rather than opaque gray rectangles.
      if(this.cloud>.18) for(let j=0;j<Math.min(this.rows,Math.ceil((VIEW.height*.31-this.view.y)/this.ch));j++) for(let i=((this.gridX%2)+2)%2;i<this.cols;i+=2) {
        const k=j*this.cols+i;
        if(this.material[k]!==MAT.sky) continue;
        const n=noise((i+this.gridX)*.022+t*.018,(j+this.gridY)*.11,160),edge=smooth(.62,.82,n)*this.cloud;
        if(edge<.07||this.seed[k]>.65) continue;
        this.glyph(GI[this.seed[k]>.4?'-':'.'],'sky',.28+edge*.25,(i+.5)*this.cw,(j+.5)*this.ch,false,.6);
      }
      for(const m of this.meteors) {
        const head=m.age/m.life,x=m.x+head*VIEW.width*.16-this.view.x,y=m.y+head*VIEW.height*.07-this.view.y;
        for(let i=0;i<18;i++) {
          const sx=x-i*this.cw*1.1,sy=y-i*this.ch*.25;
          const k=Math.floor(sy/this.ch)*this.cols+Math.floor(sx/this.cw);
          if(sx<0||sy<0||sx>=this.W||sy>=this.H||this.material[k]!==MAT.sky) continue;
          this.glyph(GI[i===0?'*':i<3?'+':'.'],'star',1-i/20,sx,sy,false,Math.sin(head*Math.PI)*(1-i/19));
        }
      }
    }
    drawWorld(staticPass=false) {
      const t=this.time,cw=this.cw,ch=this.ch;
      const lighting=this.moonlight+this.flash*.75;
      const windTick=Math.floor(t*5);
      const lightFlickers=this.lights.map(l=>.83+Math.sin(t*8+l.phase)*.10+Math.sin(t*13+l.phase)*.06);
      for(let j=0;j<this.rows;j++) for(let i=0;i<this.cols;i++) {
        const k=j*this.cols+i,m=this.material[k];
        if(m===MAT.sky || (staticPass ? this.dynamic[k] : !this.dynamic[k])) continue;
        const x=(i+.5)*cw,y=(j+.5)*ch,seed=this.seed[k];
        let g=this.glyphs[k],p=PAL[MATERIAL_NAMES[m]],b=this.shade[k]*lighting*this.shadow[k];
        const warm=this.light[k]*lightFlickers[this.lightIndex[k]];
        if(m===MAT.grass) {
          const gust=Math.sin(this.wx[k]*.35+this.wz[k]*.18-t*1.5)+Math.sin(this.wx[k]*.09-t*.6)*.7;
          let bend=gust*this.wind;
          if(this.cursor.active) {
            const distance=Math.hypot((x-this.cursor.x)*.75,y-this.cursor.y);
            if(distance<70) bend+=(x-this.cursor.x)/35*(1-distance/70)*2;
          }
          for(const ripple of this.ripples) {
            const dist=Math.hypot(this.wx[k]-ripple.x,this.wz[k]-ripple.z);
            if(Math.abs(dist-ripple.age*11)<2) bend+=Math.sin(dist-ripple.age*11)*Math.exp(-ripple.age)*1.7;
          }
          g=GI[seed<.21?"',`"[(Math.floor(seed*12)+windTick%2)%3]:bend>.28?'/':bend<-.28?'\\':'|'];
          b+=gust*.023+warm*.43;
        } else if(m===MAT.water) {
          const surface=this.waterSample(k,t,lighting,warm);
          g=surface.g;p=surface.p;b=surface.b;
        } else if(m===MAT.warm) {
          b=.74+Math.sin(t*1.3+this.tags[k])*.10;
        } else { b+=warm*.34; }
        if(m===MAT.stone) b*=1.12;
        if(m===MAT.rock) b*=1.10;
        // Atmospheric depth keeps the forest distant, foreground textured.
        b*=1-smooth(18,80,-this.wz[k])*.32;
        this.glyph(g,p,b,x,y,m===MAT.water?false:warm>.15,this.zoneAlpha(x,y));
      }
    }
    waterSample(k,t,lighting,warm=0,out=this.waterOut) {
      const x=this.wx[k],z=this.wz[k],grain=this.waterGrain[k],phase=this.waterPhase[k],phaseB=this.waterPhaseB[k],seed=this.seed[k];
      const cross=this.waterCross[k],travel=z-t*this.waterSpeed[k]*5;
      const bend=noise(cross*2.5,travel*.04,314)-.5;
      const ribbon=noise(cross*9.4+bend*2.1,travel*.11,315);
      const breakup=noise(cross*5.5-2,travel*.27,316);
      const flow=smooth(.57,.82,ribbon)*smooth(.26,.70,breakup)*(1-this.waterBank[k]*.60);
      const pulse=.5+.5*Math.sin(phase*.53+t*.37);
      const crest=Math.sin(phase+z*.43-t*.71)*.62+Math.sin(phaseB+x*.37+t*.23)*(.25+this.rain*.18);
      let g=seed>.75&&grain>.36?GI['.']:0,p=PAL.water,b=.12+grain*.07,ring=0;
      // Warped noise gives irregular widths, gaps and lengths, rather than
      // equally spaced lanes. Advect it along the river's curved channel.
      if(flow>.10) {g=flow<.19?GI[',']:this.waterDirection[k];b=.24+flow*.34;}
      if(seed>.965&&crest>.55&&grain>.35) {g=GI['~'];b=.24+crest*.12;}
      // Localized circular disturbances drift a little with the river.
      for(const ripple of this.ripples) {
        const rz=ripple.z+ripple.age*.8,rx=ripple.x+riverX(rz)-riverX(ripple.z);
        const delta=Math.hypot(x-rx,z-rz)-ripple.age*9;
        if(Math.abs(delta)<1.3)ring+=Math.cos(delta*2.6)*(1-Math.abs(delta)/1.3)*Math.exp(-ripple.age*.85);
      }
      const beamX=riverX(z)+riverWidth(z)*.18+Math.sin(phase+t*.17)*.35,beamWidth=1.9+smooth(-10,90,z)*2.0;
      const moon=clamp(1-Math.abs(x-beamX)/beamWidth)*(1-this.cloud*.82);
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
      if(this.flash>.2&&seed>.7&&!g)g=GI['.'];
      out.g=g;out.p=p;out.b=b*this.waterShadow[k]*lighting*(1-this.rain*.14)+this.flash*.35;
      return out;
    }
    drawStatic() {
      const key=Math.round((this.moonlight+this.flash*.75)*18)+'/'+this.content.hidden;
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
      this.glyph(GI['>'],'pink',.68,pole.x+this.cw*(1+Math.sin(t*2)*.18),pole.y-this.ch,false,this.zoneAlpha(pole.x,pole.y));
      for(let i=0;i<9;i++) {
        const age=(t*.35+i/9)%1;
        this.worldGlyph(age<.5?':':'.','sky',.36,this.chimney[0]+age*3*this.wind,this.chimney[1]+age*5,this.chimney[2],1-age);
      }
      const f=this.fire,p=this.project(f.x,f.y,f.z);
      this.sprite([' . . ','(x=x)'],f.x,f.y+.05,f.z,'rock',.6);
      for(let j=0;j<4;j++) for(let i=-1;i<=1;i++) {
        const flick=Math.sin(t*11+j*3+i*2),h=3+flick*.6-Math.abs(i);
        if(j>h) continue;
        this.glyph(GI[j>2?"'":j>1?'^':'*'],j<2?'fire':'ember',.9,p.x+i*this.cw*.8+Math.sin(t*7+j)*1.7,p.y-j*this.ch,false,this.zoneAlpha(p.x,p.y));
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
      // Each figure has its own dry ground anchor, including its feet.
      const camper=camp.camper,friend=camp.friend;
      this.sprite(SPRITES.camper,camper.x,camper.y,camper.z,'cloth',.91,0,{camper:true});
      this.sprite(SPRITES.friend,friend.x,friend.y,friend.z,'cream',.80,0,{camper:true});
      const dog=this.wildlife.dog,pony=this.wildlife.pony;
      this.sprite(SPRITES.dog,dog.x,dog.y,dog.z,'deer',.76,0,{actor:true,eyePalette:'cream',fireSide:-1,opaque:true});
      const ponyX=pony.x+Math.sin(t*.075)*2;
      this.sprite(Math.sin(t*.65)>.70?SPRITES.ponyStep:SPRITES.pony,ponyX,height(ponyX,pony.z)+.12,pony.z,'deer',.78,0,{actor:true,opaque:true,mask:SPRITES.ponyMask,ponyHead:true});
      // Tiny mushrooms and a rabbit along the quieter western flower bank.
      for(let i=0;i<9;i++) {
        const x=-20-hash(i,171)*11,z=24+hash(i,172)*35;
        this.worldGlyph('o','cream',.61,x,height(x,z)+.35,z);
        this.worldGlyph('|','wood',.37,x,height(x,z)+.12,z);
      }
      const rabbit=this.wildlife.rabbit;
      const rabbitX=rabbit.x+Math.sin(t*.09)*.6;
      this.sprite(SPRITES.rabbit,rabbitX,height(rabbitX,rabbit.z)+.12,rabbit.z,'cream',.68,0,{actor:true,eyePalette:'deer',opaque:true});
      for(let i=0;i<28;i++) {
        let x=-31+hash(i,181)*81+Math.sin(t*.31+i*2)*2;
        let z=9+hash(i,182)*49+Math.sin(t*.23+i)*2;
        if(this.cursor.active&&this.cursor.ground) {
          const target=this.cursor.ground,distance=Math.hypot(x-target.x,z-target.z);
          if(distance<17) {const attraction=(1-distance/17)*.14;x+=(target.x-x)*attraction;z+=(target.z-z)*attraction;}
        }
        if(riverDistance(x,z)<2) continue;
        const y=height(x,z)+.8+Math.sin(t*.47+i)*.6;
        const blink=Math.pow(Math.max(0,Math.sin(t*1.15+i*1.83)),3)*(1-this.rain)*.9;
        this.worldGlyph(i%4?'.':'*','fly',.95,x,y,z,blink);
      }
    }
    drawRain() {
      if(this.rain<.025) return;
      const t=this.time,count=Math.floor(760*this.rain);
      if(this.flash>.4) {
        const origin=VIEW.width*(.69+hash(Math.floor(this.nextLightning),221)*.18)-this.view.x;
        for(let i=0;i<13;i++) {
          const x=origin+Math.sin(i*1.9+this.nextLightning)*this.cw*2,y=VIEW.height*.018+i*this.ch*.74-this.view.y;
          const k=Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw);
          if(x>=0&&x<this.W&&y>=0&&y<this.H&&this.material[k]===MAT.sky)this.glyph(GI[i%3?'|':'/'],'star',.98,x,y,false,this.flash);
        }
      }
      for(let ty=Math.floor(this.view.y/VIEW.height);ty<=Math.floor((this.view.y+this.H)/VIEW.height);ty++) for(let tx=Math.floor(this.view.x/VIEW.width);tx<=Math.floor((this.view.x+this.W)/VIEW.width);tx++) for(let i=0;i<count;i++) {
        const salt=Math.imul(tx,31)^Math.imul(ty,47),speed=240+hash(i,salt,202)*220;
        const localY=(hash(i,salt,203)*VIEW.height+t*speed)%VIEW.height;
        const y=ty*VIEW.height+localY-this.view.y;
        const x=tx*VIEW.width+(hash(i,salt,204)*VIEW.width+t*(35+this.wind*65)+localY*.09)%VIEW.width-this.view.x;
        if(x<0||x>=this.W||y<0||y>=this.H)continue;
        const b=.26+hash(i,salt,205)*.30;
        this.glyph(GI[this.wind>.6?'/':'|'],'rain',b,x,y,false,.36*this.zoneAlpha(x,y));
        if(i%4===0) this.glyph(GI['.'],'rain',b*.7,x-this.cw*.25,y-this.ch,false,.22);
      }
      // Deterministic splash lifetimes: small rings on water, ticks on ground.
      const tick=Math.floor(t*9);
      for(let gy=Math.floor(this.view.y/48);gy<=Math.ceil((this.view.y+this.H)/48);gy++) for(let gx=Math.floor(this.view.x/64);gx<=Math.ceil((this.view.x+this.W)/64);gx++) {
        if(hash(gx,gy,tick+212)>this.rain*.26)continue;
        const x=gx*64+hash(gx,gy,tick+213)*64-this.view.x,y=gy*48+hash(gx,gy,tick+214)*48-this.view.y;
        if(x<0||x>=this.W||y<0||y>=this.H)continue;
        const k=Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw);
        if(this.material[k]!==MAT.water&&this.material[k]!==MAT.grass&&this.material[k]!==MAT.path) continue;
        const age=(t*9)%1;
        this.glyph(GI[this.material[k]===MAT.water?(age>.45?'~':'o'):"'"],'rain',.65,x,y,false,(1-age)*.5*this.zoneAlpha(x,y));
      }
    }
    render(dt=0) {
      const started=performance.now();
      if(!this.paused&&!this.reduced) this.update(dt);
      else if(!this.flicker) { this.flicker=.88;this.wind=.32;this.moonlight=.89; }
      const c=this.ctx;
      c.globalAlpha=1;c.fillStyle=BG;c.fillRect(0,0,this.W,this.H);
      this.drawSky();this.drawStatic();this.drawWorld();this.drawMeadow();this.drawRain();
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
      this.resizeObserver.disconnect();
      this.canvas.remove();
      if(this.tools) this.tools.remove();
    }
  }

  function createStudio(scene) {
    const style=document.createElement('style');
    style.textContent=`
      .river-tools { position:fixed;z-index:3;bottom:max(18px,env(safe-area-inset-bottom));right:20px;display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100vw - 20px);gap:6px;align-items:center; }
      .river-tools button { font:11px ${FONT};color:#b8c7c2;background:#0b1520e8;border:1px solid #2a3a43;border-radius:4px;padding:8px 10px;cursor:pointer; }
      .river-tools button:hover,.river-tools button:focus-visible { color:#f0eddc;border-color:#809b9e;outline:0; }
      :root[data-theme="riverkeep"] nav a:focus-visible { outline:1px solid #b8c7c2;outline-offset:5px; }
      @media(max-width:600px) { .river-tools { right:10px;bottom:12px;gap:4px; }.river-tools button {font-size:10px;padding:7px 8px;} }
      @media(prefers-reduced-motion:reduce) { :root[data-theme="riverkeep"] #typed::after { animation:none; } }
    `;
    document.head.appendChild(style);
    if(new URLSearchParams(location.search).get('studio')!=='1') return;
    const tools=document.createElement('aside');tools.className='river-tools';tools.setAttribute('aria-label','Landscape preview');
    const weather=document.createElement('button'),detail=document.createElement('button'),pause=document.createElement('button'),text=document.createElement('button');
    weather.textContent='Weather: Auto';detail.textContent='Detail: Fine';pause.textContent='Pause';text.textContent='Hide text';
    const modes=['auto','clear','rain','storm'];
    weather.addEventListener('click',()=>{
      scene.weather=modes[(modes.indexOf(scene.weather)+1)%modes.length];
      weather.textContent='Weather: '+scene.weather[0].toUpperCase()+scene.weather.slice(1);
      if(scene.reduced||scene.paused) { const w=scene.weatherAt(scene.time);scene.rain=w.rain;scene.cloud=w.cloud;scene.moonlight=.95-w.cloud*.40;scene.render(); }
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
    text.setAttribute('aria-pressed','false');
    text.addEventListener('click',()=>{scene.content.hidden=!scene.content.hidden;text.textContent=scene.content.hidden?'Show text':'Hide text';text.setAttribute('aria-pressed',String(scene.content.hidden));scene.render();});
    tools.append(weather,detail,pause,text);document.body.appendChild(tools);scene.tools=tools;
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
      scene.resizeObserver=new ResizeObserver(()=>{scene.measureZone();if(scene.reduced) scene.render();});scene.resizeObserver.observe(content);
      if(document.fonts) document.fonts.ready.then(()=>{scene.measureZone();if(scene.reduced)scene.render();});
      if(CSS.supports('-webkit-touch-callout','none')) {
        const park=()=>{window.scrollTo(0,80);scene.measureZone();};park();
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
