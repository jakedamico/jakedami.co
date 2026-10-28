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
  const BG_RGB = [1, 3, 5].map(i => parseInt(BG.slice(i, i + 2), 16) / 255);
  const ACTOR = {font:7.5,cw:4.75,ch:7.5};
  const CAMPER = {font:9.5,cw:5.9,ch:10};
  const FISH = {font:9.5,cw:5.8,ch:9.5};
  // Palette and brightness for the props a figure carries, by mark tone.
  const FOLK_PROPS = {rod:['canvas',.66],line:['cloth',.40],bob:['cream',.95],scope:['cream',1],tripod:['canvas',.55],lens:['moon',1]};
  const Folk = window.__folk;
  const PONY_HEAD = {scale:.88,firstColumn:5,rows:3,pivotColumn:6,pivotRow:3};
  // A tapped dog spins on the spot: `hops` bounds over `spin` seconds, `lift`
  // pixels high, turning about in the air on each, then a wag for `wag`
  // seconds. It stays put because shrubs and the camp hem it in; anywhere
  // it could run, it would vanish behind them.
  const DOG_SPIN = {hops:4,spin:1.6,lift:4,wag:1.4};
  // A meteor shower now and then: the first `first` seconds after the page
  // opens, later ones `gap` seconds apart. Each lasts `life` seconds,
  // building to `peak` meteors a second and easing off; onlookers watch
  // until `watch` seconds in.
  const SHOWER = {life:26,peak:3,watch:20,first:[25,40],gap:[240,420]};
  const CAMERA = {yaw:.52,pitch:.58};
  // The opening: the page lands on a glowing orrery high above the scene
  // and waits `hold` seconds, or until a tap, then the camera cranes
  // straight down through the stars to the keep. After that the two are
  // pages: a chevron at the top of the scene cranes back up, one at the
  // bottom of the orrery comes down, and nothing moves on its own.
  // `travel` is the drop in screen heights, `cue` the seconds before the
  // prompt shows, and `pitch` tilts the orbits.
  const INTRO = {descend:3.2, hold:10, travel:1.15, fade:.9, cue:2.5, pitch:.92};
  // The chevrons' own glyph sheet, and how far from one a tap still counts.
  const NAV = {font:22, cw:14, ch:22, reach:40};
  // The orrery draws on its own finer glyph sheet, padded for a baked glow.
  // It draws no orbit rings and cannot be turned by hand: both read as a
  // diagram rather than a sky, so the view is fixed and the planets alone
  // trace their paths.
  // The cells are fine enough that a phone-sized planet is a shaded globe
  // of many characters rather than a few.
  const ORB = {font:4.4, cw:2.65, ch:4.4, pad:4, glow:2};
  const ORB_GLYPHS = " .,:;'-=~+*o%#&@|/\\";
  const ORB_PALETTES = ['fire','ember','cream','gold','stone','rock','blue','grass','earth','rust','canvas','deer','cloth','cyan','indigo','lilac','moon'];
  const SPACE_COLORS = {rust:[214,104,66], indigo:[98,128,222], gold:[236,200,118], cyan:[150,208,214]};
  // Orbits are compressed (not to scale) so Neptune's fits a phone with
  // margin; `a` and `r` are fractions of its radius, periods are seconds.
  // Each orbit leans a little (`tilt`) about its own node line. A planet's
  // `moons` circle it in its orbital plane, in the same units; a `ring` is
  // a band from `inner` to `outer` planet radii, leaning `tilt` and turned
  // `turn`: Saturn's full and gapped, Uranus's `plain` and `dim`. The comet
  // rides an ellipse of eccentricity `e`, closest to the sun `peri`
  // seconds after the page opens.
  const ORRERY = {
    sun:{r:.15},
    planets:[
      {name:'mercury',a:.23,r:.034,period:3.8,palette:'stone',spin:.3,tilt:.07,node:1.1,start:.3},
      {name:'venus',a:.33,r:.055,period:6.4,palette:'cream',air:'cream',spin:-.15,tilt:.04,node:2.6,start:2.4},
      {name:'earth',a:.42,r:.06,period:9.2,palette:'blue',air:'blue',spin:.6,tilt:0,node:0,start:4.4,moons:[{a:.1,r:.014,period:1.4}]},
      {name:'mars',a:.51,r:.046,period:13.8,palette:'rust',spin:.6,tilt:.05,node:4.1,start:1.2},
      {name:'jupiter',a:.73,r:.12,period:27,palette:'canvas',air:'canvas',spin:.9,tilt:.03,node:.6,start:5.3,
        moons:[{a:.16,r:.013,period:1.6,start:.4,palette:'gold'},{a:.2,r:.012,period:2.6,start:2.9,palette:'cream'},{a:.245,r:.017,period:4.2,start:4.6},{a:.29,r:.015,period:7.5,start:1.5,palette:'rock'}]},
      {name:'saturn',a:.86,r:.1,period:40,palette:'gold',air:'gold',spin:.8,tilt:.06,node:3.3,start:.9,ring:{inner:1.35,outer:2.05,tilt:-.25,turn:.35},
        moons:[{a:.275,r:.016,period:4.2,start:2.2,palette:'canvas'}]},
      {name:'uranus',a:.94,r:.075,period:58,palette:'cyan',air:'cyan',spin:.5,tilt:.08,node:5.2,start:3.6,ring:{inner:1.65,outer:1.85,tilt:1.45,turn:.3,plain:true,dim:.4,palette:'cloth'}},
      {name:'neptune',a:1,r:.072,period:80,palette:'indigo',air:'indigo',spin:.5,tilt:.05,node:2.0,start:5.8},
    ],
    belt:{inner:.585,outer:.65,count:140,period:19},
    comet:{a:1.5,e:.8,period:30,tilt:.4,node:.3,peri:5},
  };
  // Each planet's face: for a point on its globe (`lat` is the normal's
  // upward part, so ±1 at the poles; `lon` turns with the planet) a
  // palette, a tone, and on Earth a palette for the lights of its night
  // side. Mercury is cratered, Venus a bright cloud ball with faint
  // swirls, Earth has continents, ice caps and drifting clouds, Mars dark
  // plains and polar caps, Jupiter belts and the red spot, Saturn softer
  // bands, Uranus a plain pale globe, Neptune a dark storm and wisps.
  const SKINS = {
    mercury:(lat,lon)=>[noise(lon*5,lat*5,722)>.72?'rock':'stone',.6+.4*noise(lon*2.4,lat*3,721)],
    venus:(lat,lon)=>{const s=noise(lon*1.6+lat*.8,lat*2.6,723);return [s>.58?'gold':'cream',.86+.14*s];},
    earth:(lat,lon,t)=>{
      const land=noise(Math.cos(lon)*1.7+2,lat*2.6+Math.sin(lon)*1.7,713)*.7+noise(Math.cos(lon)*4+5,lat*6+Math.sin(lon)*4,715)*.3>.52;
      const ice=Math.abs(lat)>.82,cloud=noise(lon*1.3+t*.18,lat*3.2,716)>.64;
      return [cloud||ice?'moon':land?'grass':'blue',cloud||ice?1.05:land?.95:1,land&&!cloud&&hash(Math.round(lon*9),Math.round(lat*9),717)>.72?'ember':null];
    },
    mars:(lat,lon)=>[Math.abs(lat)>.8?'moon':noise(lon*2.2,lat*3,718)>.6?'earth':'rust',.9+.1*noise(lon*5,lat*5,719)],
    jupiter:(lat,lon)=>{
      const band=Math.sin(lat*11+.8),i=Math.floor((lat+1)*5.5),spot=Math.abs(lat+.24)<.12&&Math.abs(((lon%TAU)+TAU)%TAU-2.2)<.34;
      return [spot?'rust':Math.abs(lat)<.14?'cream':i%2?'canvas':'deer',(.84+.16*Math.abs(band))*(.9+.1*noise(lon*4,lat*12,724))];
    },
    saturn:(lat)=>[Math.floor((lat+1)*4.5)%2?'gold':'canvas',.9+.1*Math.abs(Math.sin(lat*9))],
    uranus:(lat)=>['cyan',.92+.08*Math.sin(lat*7)],
    neptune:(lat,lon)=>{
      const storm=Math.abs(lat-.2)<.14&&Math.abs(((lon%TAU)+TAU)%TAU-1.5)<.36,wisp=Math.abs(lat+.35)<.06&&noise(lon*4,0,725)>.62;
      return [wisp?'moon':'indigo',storm?.55:1];
    },
  };
  // Signpost lettering gets its own larger glyph sheets so the links stay
  // legible on a phone. Boards are listed top to bottom; y is each board's
  // lower edge above the post's foot, len and h its size in world units.
  const SIGN = {font:16,cw:9.9,ch:16};
  const SIGN_TITLE = {font:12,cw:7.4,ch:12};
  const SIGN_GLYPHS = ' abcdefghijklmnopqrstuvwxyz._';
  const SIGN_BOARDS = [
    {text:'building stuff',title:true,len:17.8,h:5.2,y:20.75},
    {text:'linkedin',len:16.7,h:5.2,y:15.0},
    {text:'github',len:16.7,h:5.2,y:9.25},
    {text:'instagram',len:16.7,h:5.2,y:3.5},
  ];
  // Firefly lettering (?links=fireflies; the signpost is the default): the
  // same lines float over the meadow, each letter one glowing firefly.
  // Glyph cells are padded so the glow fits around each letter. Rows are
  // screen offsets above the anchor on the ground.
  const FLY_TEXT = {font:12,cw:7.4,ch:12,pad:14};
  const FLY_TITLE = {font:9.5,cw:5.8,ch:10,pad:12};
  const FLY_ROWS = [-96,-68,-40,-12];
  const SPRITES = {
    dog:[' /\\   ','(o)__ ',' /##\\~',' | |  '],
    // Mirrored, for when it runs the other way.
    dogRight:['   /\\ ',' __(o)','~/##\\ ','  | | '],
    // A ridge tent seen three-quarters: the front, with a lantern in its
    // doorway, on the left and the roof running back to the right.
    tent:['   ______','  /\\     \\',' /*.\\     \\','/_/\\_\\_____\\'],
    tentMask:['   ______','  xxxxxxxx',' xxxxxxxxxx','xxxxxxxxxxxx'],
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
    stone: [193, 209, 217], tree: [70, 132, 124], wood: [119, 102, 74],
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
  // A point on an orrery orbit: a circle of radius a, leaning `tilt` about
  // the node line at `node`, in a world where y is up.
  function orbit(p, angle) {
    const ca=Math.cos(angle),sa=Math.sin(angle),cn=Math.cos(p.node),sn=Math.sin(p.node),ci=Math.cos(p.tilt),si=Math.sin(p.tilt);
    return [p.a*(ca*cn-sa*sn*ci), p.a*sa*si, p.a*(ca*sn+sa*cn*ci)];
  }
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
      // The glyph engine (themes/glyphs-gl.js) batches every glyph of a
      // frame into a few WebGL draw calls; without WebGL, or with ?gl=0,
      // the same drawing goes through a 2D context one call at a time.
      // `ctx` is the 2D context being drawn to: the canvas's own without
      // the engine, a bake's offscreen one while a layer is baked, and
      // null otherwise, which is when the engine draws.
      this.gl=null;this.ctx=null;this.shiftY=0;this.staticClip=null;
      // While a crane layer is redrawn, only the band of it the screen can
      // show before its next redraw is drawn: `cull` is that band ({top,
      // bottom} in page pixels); null means draw everything. On a touch
      // device (a phone, several times slower than a desktop) the water
      // is sampled on every other redraw of a crane (`waterHalf`).
      this.cull=null;this.waterPart=-1;this.craneFrame=0;this.groundPass=0;this.groundHalf=0;
      this.touch=matchMedia('(pointer:coarse)').matches;this.waterHalf=this.touch&&new URLSearchParams(location.search).get('water')!=='full';
      // The scene's layer has a back buffer for when a crane redraws it in
      // two halves (see render).
      this.groundFront='ground';this.groundBack='ground2';
      if(window.GlyphGL&&new URLSearchParams(location.search).get('gl')!=='0') {
        try {this.gl=new GlyphGL(canvas);} catch(e) {
          // A canvas that has handed out a WebGL context cannot give a 2D
          // one; the fallback starts on a fresh canvas.
          const fresh=canvas.cloneNode();canvas.replaceWith(fresh);this.canvas=canvas=fresh;
        }
        if(this.gl) this.gl.onrestore=()=>{this.staticKey='';this.staticClip=null;};
      }
      if(!this.gl) this.ctx=canvas.getContext('2d', { alpha: true });
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
      this.shower = null;
      this.nextShower = SHOWER.first[0]+Math.random()*(SHOWER.first[1]-SHOWER.first[0]);
      this.fish = [];
      this.drops = [];
      this.nextLeap = 5;
      // Animals' reactions to a tap, while they run.
      this.dogSpin = null;
      this.ponyFuss = null;
      this.rabbitHop = null;
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
      // The opening plays on each new visit; a reload in the same tab goes
      // straight to the scene. ?intro=1 forces it and ?intro=0 skips it.
      // Session storage can throw on iOS, so it is only ever tried.
      const wants=new URLSearchParams(location.search).get('intro');
      let seen=false;
      try {seen=sessionStorage.getItem('riverkeep-intro')==='1';sessionStorage.setItem('riverkeep-intro','1');} catch(e) {}
      if(wants!=='0'&&(wants==='1'||!seen)) this.startIntro();
      else setTimeout(()=>this.prepareSky(),1200);
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
      for(const [x,z,h,r,seed] of [[-27,12,11,3.25,400],[-25,39,12,3.8,401],[riverX(46)+riverWidth(46)+10,46,12,3.7,402],[riverX(5)+riverWidth(5)+13.7,1,11,3.2,403]]) {
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
      // Any that would crowd the bridge's deck or ramps step back behind it.
      const bridge=this.bridge,[[bridgeWest],,,[bridgeEast]]=bridge.rail;
      for(let i=0;i<46;i++) {
        const side=i%2?1:-1,r=1.1+hash(i,262)*1.7;
        let z=-6+hash(i,260)*113;
        const x=riverX(z)+side*(riverWidth(z)+2.8+hash(i,261)*8);
        if(x>bridgeWest-r&&x<bridgeEast+r&&Math.abs(z-bridge.z)<bridge.half+r+2)z=bridge.z-bridge.half-r-4.5;
        if(pathDistance(x,z)<2.4||this.campDistance(x,z)<1.20||riverDistance(x,z)<1.5||Math.hypot(x-this.sign.x,z-this.sign.z)<5)continue;
        this.shrubs.push({x,z,y:height(x,z),r,h:.8+hash(i,263)*1.1,seed:i+600});
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
      this.wildlife.rabbit.home=this.wildlife.rabbit.x;
      this.dogNow={hop:0,stride:false,wag:false,right:false};
      for (let i = 0; i < 17; i++) {
        const z = 5 + hash(i, 48) * 53, side = i % 2 ? 1 : -1;
        const x = riverX(z) + side * (riverWidth(z) + .4 + hash(i, 50) * 2.5);
        this.box(x, Math.max(0, height(x, z)) - .2, z, .7 + hash(i, 52), .45 + hash(i, 53), .8 + hash(i, 54), MAT.rock);
      }
      // Two campers keep to the fire; walkers wander the meadows on both banks.
      const camp=this.camp,f=this.fire,facing=p=>Math.atan2(f.z-p.z,f.x-p.x);
      // A small ring on the water where a bobber lands or a fish bites.
      const splash=(x,z)=>{this.ripples.push({x,z,age:0,speed:2.6});if(this.ripples.length>5)this.ripples.shift();};
      this.world={height,walkable:(x,z)=>this.walkable(x,z),splash,leap:(x,z)=>this.leap(x,z),release:(...a)=>this.release(...a)};
      // Someone fishing from the east bank upstream of the bridge.
      const fz=-20,edge=riverX(fz)+riverWidth(fz),bob={x:edge-2.4,z:fz-.5};
      this.bobber=bob;
      this.folk=[
        Folk.create({...camp.camper,heading:facing(camp.camper),seed:3,palette:'cloth',brightness:.91,clips:['warm','warm2','warm','rest']},this.world),
        Folk.create({...camp.friend,heading:Math.atan2(camp.toast.z-camp.friend.z,camp.toast.x-camp.friend.x),seed:8,palette:'cream',brightness:.80,toast:camp.toast},this.world),
        ...[[45,48,9,'canvas'],[34,13,6,'lilac'],[-12,46,8,'cloth']].map(([x,z,r,palette],i)=>
          Folk.create({x,z,heading:i*2.1,seed:20+i,palette,brightness:.78,speed:1.3+i*.12,home:{x,z,r}},this.world)),
        Folk.create({x:edge+1.4,z:fz,heading:Math.atan2(bob.z-fz,bob.x-edge-1.4),seed:31,palette:'cream',brightness:.80,rod:bob},this.world),
      ];
      this.makeStargazer();
      if(this.linkStyle==='sign') this.makeReader();
      this.makeTrip();
    }
    makeStargazer() {
      // Someone out in the open meadow across from the keep, at a telescope
      // aimed up toward screen right. They stand behind its eyepiece.
      const along=[Math.cos(CAMERA.yaw),0,-Math.sin(CAMERA.yaw)],right=Math.atan2(along[2],along[0]);
      const x=21.8,z=-15.1,sx=x+along[0]*2.4,sz=z+along[2]*2.4;
      this.stargazer=Folk.create({x,y:height(x,z)+.12,z,heading:right,seed:42,palette:'cloth',brightness:.88,clips:['scope','scope','gaze'],
        scope:{x:sx,y:height(sx,sz),z:sz,heading:right}},this.world);
      this.folk.push(this.stargazer);
    }

    campDistance(x,z) {
      return Math.hypot((x-this.fire.x-3.6)/10.2,(z-this.fire.z+1.1)/7.2);
    }
    // The camp's bare ground is smaller than the camp itself, so meadow
    // grass carries on behind the tent.
    clearingDistance(x,z) {
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
      // `side` places by screen axes: `a` units to the right, `o` toward the
      // viewer. The friend toasts low over the coals at the fire's right
      // edge, clear of the flames, standing back far enough for the stick.
      // The gear sits further right, out of the friend's way.
      const side=(a,o,lift)=>anchor(Math.cos(CAMERA.yaw)*a+Math.sin(CAMERA.yaw)*o,-Math.sin(CAMERA.yaw)*a+Math.cos(CAMERA.yaw)*o,lift);
      const tent=side(10,-1.6),woodpile=side(9.6,4.4),pack=side(12.6,3.0);
      this.camp={tent,woodpile,pack,camper:anchor(-2.7,2.0,.12),friend:side(4.8,3.6,.12),toast:{...side(1.9,.3),y:f.y+1.0}};
      this.lights.push({...f,y:f.y+.8,r:13.0,power:1.55,phase:3});
      // Benches follow the ground rather than inheriting the fire's height.
      for(const [dx,dz,w,d] of [[-2.9,.8,2.8,.75],[3.9,.7,2.8,.75]]) {
        const log=anchor(dx,dz);
        this.box(log.x,log.y,log.z,w,.85,d,MAT.wood,{part:'campLog'});
      }
      // The tent is drawn as a sprite (SPRITES.tent). Past the firelight,
      // the lantern inside it lights the ground around.
      this.lights.push({x:tent.x,y:tent.y+1.4,z:tent.z,r:8.5,power:1.15,phase:7});
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
        if(r.wait>0||fig.state!=='idle'||fig.cued)return;
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
        // Turn to the boards, read a while, then wander home. A wave to
        // the viewer turns them away for a moment.
        const turn=r.face-fig.heading,delta=Math.atan2(Math.sin(turn),Math.cos(turn));
        if(fig.face==null) fig.heading+=clamp(delta,-1.8*dt,1.8*dt);
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
        if(trip.timer<=0&&!fig.cued) {fig.route=trip.out.map(p=>({...p}));trip.state='out';}
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
      // The engine's baked layers are textures, so on a huge display the
      // density drops to keep the canvas within what the GPU can hold.
      this.dpr = Math.min(devicePixelRatio || 1, 2, this.gl ? this.gl.maxTexture / (Math.max(innerWidth, innerHeight * 1.2)) : Infinity);
      this.W = innerWidth;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;height:100lvh;width:0;visibility:hidden;';
      document.body.appendChild(probe);
      const ios = CSS.supports('-webkit-touch-callout', 'none');
      this.H = Math.max(innerHeight, probe.offsetHeight, ios ? screen.height : 0) + (ios ? 80 : 0);
      // On iOS the first 80px of the canvas are the parked runway behind
      // the status bar; the visible page starts below them.
      this.topInset = ios ? 80 : 0;
      probe.remove();
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      if(this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // Detail changes the sampling grid, never the world's camera scale.
      // A finer grid therefore adds geometry samples without shrinking it.
      this.font = this.detail==='fine' ? 6.5 : 8;
      this.cw = this.detail==='fine' ? 4 : 5;
      this.ch = this.detail==='fine' ? 7 : 9;
      if(this.ctx) this.ctx.imageSmoothingEnabled = false;
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
      // Anything laid out in screen space is redone when this changes.
      this.viewKey=(this.viewKey||0)+1;
      this.makeAtlas();
      this.sampleWorld();
      this.buildSky();
      const hadSky=!!this.space;
      this.freeSky();
      if(this.intro||hadSky) this.prepareSky();
      // iOS keeps a replaced canvas's backing store until GC; zeroing it
      // hands the memory back now, so repeated resizes cannot pile up.
      if(this.staticCanvas) this.staticCanvas.width=this.staticCanvas.height=0;
      if(this.gl) {this.gl.free(this.staticClip);this.staticClip=null;}
      else {
        this.staticCanvas = document.createElement('canvas');
        this.staticCanvas.width = this.canvas.width; this.staticCanvas.height = this.canvas.height;
        this.staticContext = this.staticCanvas.getContext('2d', {alpha:true});
        this.staticContext.setTransform(this.dpr,0,0,this.dpr,0,0);
        this.staticContext.imageSmoothingEnabled = false;
      }
      this.staticKey = '';
      this.placeSign();
      this.warm();
      this.canvas.dataset.engine = this.gl ? 'webgl' : '2d';
      this.canvas.dataset.grid = `${this.cols}x${this.rows} cell=${this.cw.toFixed(2)}x${this.ch.toFixed(2)} dpr=${this.dpr}`;
      this.canvas.dataset.detail = this.detail;
      this.canvas.dataset.view = `crop=${this.view.x},${this.view.y} scale=${VIEW.scale} font=${this.font}`;
    }
    // The engine makes a texture of a canvas the first time it draws it,
    // and the main atlas is a big one; uploading them all while nothing
    // moves keeps that off the first frame of the scene (a 55 ms spike on
    // the first frame of the descent, Oct 26 2026).
    warm() {
      if(!this.gl) return;
      for(const sheet of [this.atlas,this.actorAtlas,this.fishAtlas,this.folkAtlas,this.ponyHeadAtlas,this.signAtlas,this.signTitleAtlas,this.flyAtlas,this.flyTitleAtlas,this.navAtlas,this.moonAtlas,this.meteorAtlas,this.orbAtlas]) if(sheet) this.gl.texture(sheet.canvas);
      for(const canvas of [this.hazeCanvas,this.space&&this.space.haze]) if(canvas&&canvas.width) this.gl.texture(canvas);
      // The static world's batch is recorded here too, off the first frame
      // that shows the scene, and the crane's two layers are made with the
      // sky, off the crane's first frame (40 ms there at 4x throttling).
      if(this.stillCells) this.recordStatic();
      if(this.space) {
        const gl=this.gl,W=this.canvas.width,H=this.canvas.height,T=Math.round(this.space.travel*this.dpr);
        const sky=gl.layer('sky',W,T),ground=sky&&gl.layer(this.groundBack,W,H)&&gl.layer(this.groundFront,W,H);
        // Both are drawn once now, unseen, so a crane finds them current
        // (and the scene's first draw of the page load, which ran four
        // times slower while the browser compiled it, happens here).
        if(ground&&!this.ctx) {
          // The scene's step is run once too, for the same reason; with
          // no time passing it changes nothing.
          if(this.time===0) this.update(0);
          gl.target(sky,BG_RGB);this.drawSpace(this.intro?this.intro.clock:0);
          gl.target(ground,BG_RGB);this.drawScene();
          gl.target(null);
        }
      }
    }
    // The engine keeps the static world as a recorded batch, drawn again
    // from the GPU each frame and recorded again only when the moonlight
    // has moved. It is recorded unshifted and played with the crane's shift.
    recordStatic() {
      const key=String(Math.round(this.moonlight*18));
      if(this.staticKey===key&&this.staticClip) return;
      const shift=this.shiftY;this.shiftY=0;
      this.gl.free(this.staticClip);
      this.gl.record();this.drawWorld(true);this.staticClip=this.gl.endRecord();
      this.shiftY=shift;this.staticKey=key;
    }
    makeAtlas() {
      for(const old of [this.atlas,this.actorAtlas,this.fishAtlas,this.folkAtlas,this.ponyHeadAtlas,this.signAtlas,this.signTitleAtlas,this.flyAtlas,this.flyTitleAtlas,this.navAtlas,this.moonAtlas]) if(old) old.canvas.width=old.canvas.height=0;
      this.atlas=this.buildAtlas(this.font,this.cw,this.ch,PALETTE_NAMES);
      this.navAtlas=this.buildAtlas(NAV.font,NAV.cw,NAV.ch,['canvas'],700,' ^v');
      // The moon shares the orrery's fine cells and glow.
      this.moonAtlas=this.buildAtlas(ORB.font,ORB.cw+ORB.pad,ORB.ch+ORB.pad,['moon','stone'],700,ORB_GLYPHS,ORB.glow);
      // Actors get a small, separate glyph sheet. Their font and spacing
      // stay fixed across viewports and terrain-detail settings.
      this.actorAtlas=this.buildAtlas(ACTOR.font,ACTOR.cw,ACTOR.ch,['deer','cream'],600);
      this.fishAtlas=this.buildAtlas(FISH.font,FISH.cw,FISH.ch,['moon','blue'],700,' <>');
      // Stick figures need only strokes and heads. Their font follows the
      // projection scale, so a zoomed scene keeps the figures' proportions.
      const folk=CAMPER.font*this.projection.scale/VIEW.scale,k=folk/CAMPER.font;
      this.folkAtlas=this.buildAtlas(folk,CAMPER.cw*k,CAMPER.ch*k,['cloth','cream','canvas','lilac','dark','moon','ember','fire','deer'],0,Folk.glyphs);
      this.folkMetrics=Folk.measure(`400 ${folk}px ${FONT}`);      this.ponyHeadAtlas=this.buildAtlas(ACTOR.font*PONY_HEAD.scale,ACTOR.cw*PONY_HEAD.scale,ACTOR.ch*PONY_HEAD.scale,['deer','cream'],600);
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
        const rgb = COLORS[names[p]]||SPACE_COLORS[names[p]], b = .17 + l / (LEVELS - 1) * 1.03;
        const row = (warmth * names.length + p) * LEVELS + l;
        const ox=Math.floor(row/perBand)*span,oy=row%perBand*ah;
        const tint = warmth ? [1.32, .99, .57] : [1, 1, 1];
        c.fillStyle = `rgb(${rgb.map((v, k) => Math.round(clamp(v * b * tint[k], 0, 255))).join(',')})`;
        if (glow) { c.shadowColor = c.fillStyle; c.shadowBlur = glow * d; }
        for (let g = 1; g < chars.length; g++) c.fillText(chars[g],ox+g*aw+aw/2,oy+ah*.5);
      }
      return {canvas:cv,aw,ah,cw,ch,span,perBand,names,index:Object.fromEntries([...chars].map((c,i)=>[c,i])),palette:Object.fromEntries(names.map((name,i)=>[name,i]))};
    }
    blit(sheet,g,row,x,y,cw,ch,turn=0,alpha=1) {
      const sx=Math.floor(row/sheet.perBand)*sheet.span+g*sheet.aw,sy=row%sheet.perBand*sheet.ah,d=this.dpr;
      if(this.gl&&!this.ctx) {
        // The engine takes device pixels: an upright glyph snaps to whole
        // ones as the 2D path does, a turned one spins about its centre.
        if(!turn) this.gl.glyph(sheet.canvas,sx,sy,sheet.aw,sheet.ah,Math.round((x-cw/2)*d),Math.round((y-ch/2)*d)+Math.round(this.shiftY*d),cw*d,ch*d,alpha);
        else this.gl.turned(sheet.canvas,sx,sy,sheet.aw,sheet.ah,x*d,(y+this.shiftY)*d,cw*d,ch*d,turn,alpha);
        return;
      }
      const c=this.ctx;
      c.globalAlpha=alpha;
      if(!turn) {c.drawImage(sheet.canvas,sx,sy,sheet.aw,sheet.ah,Math.round((x-cw/2)*d)/d,Math.round((y-ch/2)*d)/d,cw,ch);return;}
      // A turned glyph rotates about its cell's centre.
      c.save();c.translate(x,y);c.rotate(turn);
      c.drawImage(sheet.canvas,sx,sy,sheet.aw,sheet.ah,-cw/2,-ch/2,cw,ch);
      c.restore();
    }
    glyph(g, palette, brightness, x, y, warm = false, alpha = 1, sheet=null) {
      if(sheet) {this.sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet);return;}
      if (!g || alpha < .015 || brightness < .025) return;
      const l = Math.round(clamp(brightness*1.18+.025) * (LEVELS - 1));
      const p=typeof palette==='string'?PAL[palette]:palette;
      const row=(p+(warm?PALETTE_NAMES.length:0))*LEVELS+l;
      this.blit(this.atlas,g,row,x,y,this.cw,this.ch,0,alpha);
    }
    sheetGlyph(g,palette,brightness,x,y,warm,alpha,sheet,turn=0) {
      if(!g||alpha<.015||brightness<.025)return;
      const l=Math.round(clamp(brightness*1.18+.025)*(LEVELS-1));
      const p=sheet.palette[typeof palette==='string'?palette:PALETTE_NAMES[palette]];
      const row=(p+(warm?sheet.names.length:0))*LEVELS+l;
      this.blit(sheet,g,row,x,y,sheet.cw,sheet.ch,turn,alpha);
    }
    // Everything that is not a glyph goes through these, so the engine and
    // the 2D context draw the same frame: a background-coloured rectangle,
    // a baked layer, a soft radial halo (`rgb` is a colour triple), and the
    // crane's vertical shift of everything drawn until unshift().
    rect(x,y,w,h,alpha=1) {
      if(this.gl&&!this.ctx) {const d=this.dpr;this.gl.rect(x*d,(y+this.shiftY)*d,w*d,h*d,BG_RGB[0],BG_RGB[1],BG_RGB[2],alpha);return;}
      const c=this.ctx;c.globalAlpha=alpha;c.fillStyle=BG;c.fillRect(x,y,w,h);
    }
    image(canvas,x,y,w,h) {
      if(this.gl&&!this.ctx) {const d=this.dpr;this.gl.image(canvas,x*d,(y+this.shiftY)*d,w*d,h*d);return;}
      this.ctx.globalAlpha=1;this.ctx.drawImage(canvas,x,y,w,h);
    }
    halo(x,y,r,rgb,a,mid,stop) {
      if(this.gl&&!this.ctx) {const d=this.dpr;this.gl.halo(x*d,(y+this.shiftY)*d,r*d,rgb[0]/255,rgb[1]/255,rgb[2]/255,a,mid,stop);return;}
      const c=this.ctx,g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(stop,`rgba(${rgb},${mid})`);g.addColorStop(1,`rgba(${rgb},0)`);
      c.globalAlpha=1;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    }
    // A solid disc of the background: a body's silhouette, painted under
    // its glyphs so nothing shows between them. Plain background, not a
    // tint of the body's colour: tinted, the globes read as flat blobs and
    // the glyphs were lost (Jake, Oct 28 2026); the gaps should stay dark.
    disc(x,y,r) { this.halo(x,y,r,[BG_RGB[0]*255,BG_RGB[1]*255,BG_RGB[2]*255],1,1,.93); }
    shift(dy) {this.shiftY=dy;if(this.ctx) {this.ctx.save();this.ctx.translate(0,dy);}}
    unshift() {this.shiftY=0;if(this.ctx) this.ctx.restore();}
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
      const t=this.time,q=this.projection,s=this.sign,mid=s.boards[s.boards.length>>1];
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
      this.fade = new Float32Array(n);
      // The water's last sampled glyph, palette and brightness per cell,
      // and the per-cell constants of its sampling.
      this.waterG = new Uint8Array(n); this.waterP = new Uint8Array(n); this.waterB = new Float32Array(n);
      this.waterBeam = new Float32Array(n); this.waterBeamW = new Float32Array(n); this.waterRun = new Float32Array(n);
      this.signCell = new Int8Array(n).fill(-1);
      this.waterGrain=new Float32Array(n);this.waterPhase=new Float32Array(n);this.waterPhaseB=new Float32Array(n);
      this.waterCross=new Float32Array(n);this.waterDirection=new Uint8Array(n);
      this.waterEddy=new Float32Array(n);this.waterEddyAngle=new Float32Array(n);this.waterEddyRadius=new Float32Array(n);
      this.waterEddySpin=new Int8Array(n);this.waterEddyDirection=new Uint8Array(n);
      this.waterPierDistance=new Float32Array(n).fill(1e3);this.waterPierRipple=new Float32Array(n);this.waterPierDirection=new Uint8Array(n);
      this.waterSpeed=new Float32Array(n);this.waterBank=new Float32Array(n);this.waterWake=new Float32Array(n);this.waterShadow=new Float32Array(n).fill(1);
      this.grassBlade=new Uint8Array(n);this.grassRest=new Float32Array(n);this.trample=this.trampleActive=null;
      this.flowers = []; this.reeds = []; this.grassIndices = []; this.waterIndices = [];
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
        const clearing=!water&&bankDistance>1.2&&this.clearingDistance(p.x,p.z)<.96+noise(p.x*.25,p.z*.25,320)*.10;
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
          this.waterIndices.push(k);
          this.waterGrain[k]=noise(x*.22,z*.14,311);
          this.waterPhase[k]=noise(x*.10,z*.13,312)*TAU;
          this.waterPhaseB[k]=noise(x*.23,z*.19,313)*TAU;
          this.waterSpeed[k]=.20+.34*(1-cross*cross)+this.waterGrain[k]*.08;
          this.waterCross[k]=cross;
          const tangent=.37*Math.cos((z+14)*.037)+.045;
          this.waterDirection[k]=this.currentGlyph(tangent+(this.waterGrain[k]-.5)*.35,1);
          this.waterBank[k]=clamp(1+riverDistance(x,z)/1.4);
          this.waterBeam[k]=riverX(z)+riverWidth(z)*.18;this.waterBeamW[k]=1.9+smooth(-10,90,z)*2.0;this.waterRun[k]=this.waterSpeed[k]*6*FLOW_PERIOD;
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
        // Atmospheric depth keeps the forest distant, foreground textured.
        this.fade[k] = 1-smooth(18,80,-this.wz[k])*.32;
      }
      // The cells each pass draws, listed once: a frame then walks the
      // ~1,500 animated cells rather than the whole grid of ~50,000.
      const live=[],still=[];
      for(let k=0;k<this.n;k++) {if(this.material[k]===MAT.sky) continue;(this.dynamic[k]?live:still).push(k);}
      this.liveCells=Int32Array.from(live);this.stillCells=Int32Array.from(still);
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
      this.meteorAtlas=this.buildAtlas(9,5.5,9,['star','cream','ember'],700,' .+*@-/\\|');
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
        const rate=.6+hash(gx,gy,108)*2.2;
        this.stars.push({x,y,b,g:GI[g],p:PAL[p],phase:hash(gx,gy,107)*TAU,rate,rate26:rate*2.6,scint:hash(gx,gy,109)>.94,s16:band.s*.016,glow45:band.light*.45,band:inBand});
      }
    }

    // The opening sequence. The sky carries on above the scene as one
    // column: the orrery hangs in it, and on a tap the camera cranes down
    // the column to settle on the scene at exactly its usual framing.
    // The opening starts at the orrery and comes down by itself; a visit
    // from the scene's chevron starts at the scene, cranes up, and then
    // waits for the visitor.
    startIntro(from='sky') {
      if(this.reduced) return;
      this.endIntro();
      const up=from==='scene';
      this.intro={phase:up?'ascend':'hold',auto:!up,t:0,clock:0,dt:0,scroll:0,shift:0,timeAtStart:this.time};
      this.prepareSky();
      // The signpost's links wait for the camera to arrive.
      for(const link of this.content.querySelectorAll('[data-board]')) link.style.visibility='hidden';
    }
    advanceIntro() {
      const intro=this.intro;
      if(intro&&intro.phase==='hold') {intro.phase='descend';intro.t=0;}
    }
    ascend() {
      if(!this.intro) this.startIntro('scene');
    }
    endIntro() {
      const intro=this.intro;
      if(!intro) return;
      this.intro=null;
      // The orrery and the sky above stay built for the next visit by
      // chevron, so it starts without a stall (150 ms on the tap when they
      // were rebuilt each time, Oct 27 2026); a resize rebuilds them. The
      // sky's layer is drawn again at the start of its clock, which is
      // where that visit will find it (see render).
      for(const link of this.content.querySelectorAll('[data-board]')) link.style.visibility='';
      if(this.gl&&!this.ctx&&this.space) {
        const gl=this.gl;
        gl.target(gl.layer('sky',this.canvas.width,Math.round(this.space.travel*this.dpr)),BG_RGB);this.drawSpace(0);gl.target(null);
      }
      // The first meteor shower counts from the scene's arrival.
      this.nextShower+=this.time-intro.timeAtStart;
    }
    // Builds the orrery and the sky above the scene unless they are built.
    // Opened without the opening, the page builds them a moment later so
    // the first visit by chevron is ready too.
    prepareSky() {
      if(this.reduced||this.disposed||this.space) return;
      this.makeOrrery();
      this.buildSpace();
      this.warm();
    }
    // Hands the sky's canvases, and the crane's layers, back now rather
    // than at GC (see resize).
    freeSky() {
      if(this.space&&this.space.haze) this.space.haze.width=this.space.haze.height=0;
      if(this.orbAtlas) {this.orbAtlas.canvas.width=this.orbAtlas.canvas.height=0;this.orbAtlas=null;}
      if(this.gl) this.gl.freeLayers();
      this.space=null;this.orrery=null;
    }
    stepIntro(dt) {
      const intro=this.intro;
      intro.t+=dt;intro.clock+=dt;intro.dt=dt;
      // k is how far down the camera is: 0 at the orrery, 1 at the scene.
      let k=0;
      if(intro.phase!=='hold') {const u=clamp(intro.t/INTRO.descend),e=u*u*u*(u*(u*6-15)+10);k=intro.phase==='descend'?e:1-e;}
      // The scene shifts down by whole device pixels so its glyphs stay crisp.
      const travel=this.space.travel;
      intro.shift=Math.round((1-k)*travel*this.dpr)/this.dpr;
      intro.scroll=travel-intro.shift;
      if(intro.phase==='descend'&&intro.t>=INTRO.descend) this.endIntro();
      else if(intro.phase==='ascend'&&intro.t>=INTRO.descend) {intro.phase='hold';intro.t=0;}
      else if(intro.phase==='hold'&&intro.auto&&intro.t>=INTRO.hold) this.advanceIntro();
    }
    buildSpace() {
      // The sky above the scene, for the crane down. It follows the same
      // rules on the same scene-pixel grid, carried on upward, so the
      // descent reads as one sky with no seam at the scene's top edge. The
      // drop is a whole number of cell rows (a multiple of four, so it is
      // also whole device pixels at common zoom levels). Above the seam,
      // and only there, the Milky Way is sheared sideways so that it passes
      // behind the sun rather than leaving at the top left: on a wide
      // screen it arcs through, on a phone it swings round and runs
      // straight up through the sun, filling the tall sky above and below
      // the system. The shear starts flat at the seam, so the join is
      // invisible; on a phone its slope grows to cancel the band's own
      // heading by the sun's height and holds there.
      const space=this.space={haze:null,stars:[],travel:0},o=this.orrery,cols=this.cols,cw=this.cw,ch=this.ch;
      const rows=Math.ceil(this.H*INTRO.travel/ch/4)*4,travel=rows*ch,top=this.view.y;
      space.travel=travel;
      const m=this.skyLayout.band,vy0=o.cy-travel+top,rise=top-vy0,k=m.cos/m.sin,sunX=o.cx+this.view.x;
      let shear=()=>0;
      if(o.portrait&&rise>200) {
        const c=sunX-(m.x+(top-m.y)*k)+k*rise/2;
        shear=r=>{const u=r/rise;return k*rise*(u<1?u*u*u*(1-u/2):u-.5)+c*smooth(0,1,u);};
      } else if(rise>200) {
        const bend=(sunX-(m.x+(vy0-m.y)*k))/(rise*rise);
        shear=r=>bend*r*r;
      }
      // The band also thins out close behind the sun, so the inner planets
      // stay legible against it; it is well clear of the seam.
      const band=(vx,vy)=>{
        const b=this.milkyWay(vx-shear(Math.max(0,top-vy)),vy);
        const clear=.3+.7*smooth(.25,.7,Math.hypot((vx-this.view.x-o.cx)/o.R,(vy-vy0)/(o.R*o.P.sp)));
        b.light*=clear;b.core*=clear;
        return b;
      };
      const canvas=space.haze=document.createElement('canvas');
      canvas.width=Math.round(this.W*this.dpr);canvas.height=Math.round(travel*this.dpr);
      const c=canvas.getContext('2d'),main=this.ctx;
      c.setTransform(this.dpr,0,0,this.dpr,0,0);c.imageSmoothingEnabled=false;
      this.ctx=c;
      c.shadowColor='rgba(160,150,220,.6)';c.shadowBlur=3*this.dpr;
      for(let j=0;j<rows;j++) for(let i=0;i<cols;i++) {
        const sx=(i+.5)*cw,sy=(j+.5)*ch,gi=i+this.gridX,gj=j-rows+this.gridY;
        const pick=hash(gi,gj,420),tint=hash(gi,gj,421);
        const b=band(sx+this.view.x,sy-travel+top),light=b.light;
        if(light<.06||pick>smooth(.04,.85,light)*.95) continue;
        const g=light>.7&&tint>.5?':':light>.4&&tint>.55?"'":tint>.85?'`':'.';
        const p=b.core>.45&&tint<.35?'cream':light<.3&&tint>.6?'blue':'lilac';
        this.glyph(GI[g],p,.16+light*.32+b.core*.14,sx,sy);
      }
      this.ctx=main;
      const step=9,from=top-travel;
      for(let gy=Math.floor(from/step);gy<=Math.ceil(top/step);gy++) for(let gx=Math.floor(this.view.x/step);gx<=Math.ceil((this.view.x+this.W)/step);gx++) {
        const vx=gx*step+hash(gx,gy,101)*step,vy=gy*step+hash(gx,gy,102)*step,x=vx-this.view.x,y=vy-from;
        if(x<0||x>=this.W||y<0||y>=travel) continue;
        const b=band(vx,vy),pick=hash(gx,gy,103);
        if(pick>.032+b.light*.6+b.core*.35) continue;
        const inBand=pick>.032,mag=hash(gx,gy,104),tint=hash(gx,gy,105);
        const bright=inBand?.16+Math.pow(mag,3)*.6+b.core*.15:.25+Math.pow(mag,2.2)*.8;
        const g=bright>.85?'*':bright>.62?'+':inBand&&hash(gx,gy,106)>.8?"'":'.';
        const p=inBand?(tint<.45?'lilac':tint<.55?'cream':'star'):(tint<.1?'blue':tint<.17?'cream':'star');
        const rate=.6+hash(gx,gy,108)*2.2;
        space.stars.push({x,y,b:bright,g:GI[g],p:PAL[p],phase:hash(gx,gy,107)*TAU,rate,rate26:rate*2.6,scint:hash(gx,gy,109)>.94,s16:b.s*.016,glow45:b.light*.45});
      }
    }
    makeOrrery() {
      // The orrery sits in the middle of the visible page (below the parked
      // runway on iOS). A wide screen fits Neptune's orbit; a phone is
      // sized by its height instead, so the system fills the screen and the
      // outer planets swing off the sides and back, rather than a small
      // chart in a strip across the middle. Everything in it goes through
      // one small depth-tested cell grid, so the sun hides the far side of
      // the orbits, planets pass behind and in front of it, and Saturn's
      // ring wraps its globe. The grid reaches past Neptune for the comet's
      // tail, and stops at the screen's edges.
      const ios=CSS.supports('-webkit-touch-callout','none'),top=ios?80:0,visible=this.H-top,portrait=this.W<visible;
      const R=portrait?Math.min(visible*.4,340):Math.min(this.W*.44,visible*.4,340),pitch=INTRO.pitch;
      const P={cy:1,sy:0,cp:Math.cos(pitch),sp:Math.sin(pitch)};
      const cx=this.W/2,cy=top+visible*.44,hx=R*1.3,hy=R*(P.sp*1.3+.16);
      const x0=Math.max(cx-hx,-ORB.cw),y0=Math.max(cy-hy,-ORB.ch);
      const cols=Math.ceil((Math.min(cx+hx,this.W+ORB.cw)-x0)/ORB.cw),rows=Math.ceil((Math.min(cy+hy,this.H+ORB.ch)-y0)/ORB.ch),n=cols*rows;
      if(this.orbAtlas) this.orbAtlas.canvas.width=this.orbAtlas.canvas.height=0;
      this.orbAtlas=this.buildAtlas(ORB.font,ORB.cw+ORB.pad,ORB.ch+ORB.pad,ORB_PALETTES,700,ORB_GLYPHS,ORB.glow);
      // Asteroids keep Kepler's rule of thumb: the farther out, the slower.
      const belt=[],{inner,outer,count,period}=ORRERY.belt;
      for(let i=0;i<count;i++) {
        const a=mix(inner,outer,hash(i,901));
        belt.push({a,angle:hash(i,902)*TAU,rate:TAU/(period*Math.pow(a/inner,1.5)),y:(hash(i,903)-.5)*.03,b:.16+hash(i,904)*.3,g:hash(i,905)>.75?',':'.'});
      }
      const cue=matchMedia('(pointer:fine)').matches?'click to come down':'tap to come down';
      this.orrery={R,P,cx,cy,x0,y0,portrait,cueY:Math.min(cy+R*P.sp+72,top+visible-138),cols,rows,n,depth:new Float32Array(n),glyph:new Uint8Array(n),pal:new Uint8Array(n),bright:new Float32Array(n),turn:new Float32Array(n),touched:new Int32Array(n),count:0,belt,cue};
    }
    orbGlyph(g,p,b,x,y,turn=0) {
      if(b<.025) return;
      const sheet=this.orbAtlas,l=Math.round(clamp(b*1.18+.025)*(LEVELS-1));
      this.blit(sheet,g,p*LEVELS+l,x,y,sheet.cw,sheet.ch,turn,1);
    }
    drawSpace(t,low=-Infinity,high=Infinity) {
      // The column above the scene at time t, in its own coordinates (the
      // caller shifts it by the crane's scroll): baked haze, the twinkling
      // stars, then the orrery, drawn between `low` and `high`.
      const space=this.space;
      this.image(space.haze,0,0,this.W,space.travel);
      for(const star of space.stars) {
        if(star.y<low||star.y>high) continue;
        let twinkle;
        if(star.scint) {const w=.5+.5*Math.sin(t*star.rate26+star.phase);twinkle=.55+w*w*w*.75;}
        else twinkle=.8+Math.sin(t*star.rate+star.phase)*.2;
        const shimmer=1+star.glow45*Math.sin(star.s16-t*.55);
        this.glyph(star.g,star.p,star.b*twinkle*shimmer,star.x,star.y);
      }
      const o=this.orrery;
      if(o.y0+o.rows*ORB.ch>low&&o.y0<high) this.drawOrrery(t);
    }
    // While the orrery waits: the prompt on the opening visit, and the
    // chevron that comes down on every visit. Drawn on the screen, not in
    // the sky's layer, so the layer is ready for the crane as it is.
    drawHoldCue() {
      const intro=this.intro,t=intro.clock;
      if(intro.auto&&t>INTRO.cue) this.drawCue(t);
      this.drawNav('down',intro.auto?smooth(INTRO.cue,INTRO.cue+1.2,t):smooth(0,.6,intro.t),t);
    }
    // The crane's chevrons: one at the top of the scene goes up to the
    // solar system, one at the bottom of the solar system comes down. They
    // pulse like the prompt and sit where a thumb reaches, clear of the
    // phone's status bar above and the browser's controls below.
    navAt(kind) {
      const top=this.topInset,visible=this.H-top;
      return {x:this.W/2,y:kind==='up'?top+30:top+visible-108};
    }
    drawNav(kind,fade,t) {
      const sheet=this.navAtlas;
      if(!sheet||fade<=0) return;
      const {x,y}=this.navAt(kind);
      this.glyph(sheet.index[kind==='up'?'^':'v'],'canvas',.5+.22*Math.sin(t*2.2),x,y,false,fade,sheet);
    }
    // Which chevron a tap at px, py lands on, if any.
    navHit(px,py) {
      if(this.reduced) return null;
      const kind=this.intro?(this.intro.phase==='hold'?'down':null):'up';
      if(!kind) return null;
      const {x,y}=this.navAt(kind);
      return Math.abs(px-x)<NAV.reach&&Math.abs(py-y)<NAV.reach?kind:null;
    }
    drawCue(t) {
      // A quiet prompt under the orrery, in the signpost's lettering, once
      // the page has had a moment to itself.
      const sheet=this.signTitleAtlas||this.flyTitleAtlas,pal=this.signTitleAtlas?'canvas':'fly';
      if(!sheet) return;
      const o=this.orrery,text=o.cue,fade=smooth(INTRO.cue,INTRO.cue+1.2,t),b=.5+.22*Math.sin(t*2.2);
      const x0=o.cx-(text.length-1)/2*sheet.cw;
      for(let i=0;i<text.length;i++) if(text[i]!==' ') this.glyph(sheet.index[text[i]],pal,b,x0+i*sheet.cw,o.cueY,false,fade,sheet);
    }
    // The orrery: the sun and the belt, then the planets and the comet, all
    // put into one depth-tested cell grid, then the grid is drawn. The
    // halos go straight to the canvas as each body reaches them, always
    // under the glyphs, which come last.
    drawOrrery(t) {
      const o=this.orrery,R=o.R,P=o.P,sheet=this.orbAtlas,G=sheet.index,PI=sheet.palette;
      o.depth.fill(-1e9);o.glyph.fill(0);o.count=0;
      const proj=(x,y,z)=>({x:o.cx+(P.cy*x-P.sy*z)*R,y:o.cy+(P.sp*(P.sy*x+P.cy*z)-P.cp*y)*R,d:P.cp*(P.sy*x+P.cy*z)+P.sp*y});
      // The hot loops (belt, rings, tails, every globe cell) go through
      // scratch results rather than a fresh object or array each time.
      const S1={x:0,y:0,d:0},S2={x:0,y:0,d:0},projTo=(x,y,z,s)=>{s.x=o.cx+(P.cy*x-P.sy*z)*R;s.y=o.cy+(P.sp*(P.sy*x+P.cy*z)-P.cp*y)*R;s.d=P.cp*(P.sy*x+P.cy*z)+P.sp*y;return s;};
      // A world direction in screen terms (right, down, toward the viewer),
      // and a screen-space normal back to the world.
      const toScreen=([x,y,z])=>[P.cy*x-P.sy*z,P.sp*(P.sy*x+P.cy*z)-P.cp*y,P.cp*(P.sy*x+P.cy*z)+P.sp*y];
      const T3=[0,0,0],toScreenTo=(x,y,z)=>{T3[0]=P.cy*x-P.sy*z;T3[1]=P.sp*(P.sy*x+P.cy*z)-P.cp*y;T3[2]=P.cp*(P.sy*x+P.cy*z)+P.sp*y;return T3;};
      const W3=[0,0,0],toWorld=(x,y,z)=>{W3[0]=x*P.cy+y*P.sp*P.sy+z*P.cp*P.sy;W3[1]=-y*P.cp+z*P.sp;W3[2]=-x*P.sy+y*P.sp*P.cy+z*P.cp*P.cy;return W3;};
      const cell=[0,0,0],fill=(g,p,b)=>{cell[0]=g;cell[1]=p;cell[2]=b;return cell;};
      // A cell is listed the first time anything lands in it, so drawing
      // the grid walks the few thousand cells used, not all of it.
      const put=(x,y,d,g,p,b,turn=0)=>{
        const i=Math.floor((x-o.x0)/ORB.cw),j=Math.floor((y-o.y0)/ORB.ch);
        if(i<0||j<0||i>=o.cols||j>=o.rows) return;
        const k=j*o.cols+i;
        if(d<o.depth[k]) return;
        if(!o.glyph[k]) o.touched[o.count++]=k;
        o.depth[k]=d;o.glyph[k]=g;o.pal[k]=p;o.bright[k]=b;o.turn[k]=turn;
      };
      // Soft bloom under a body, painted before any glyph.
      const halo=(x,y,r,rgb,a,mid,stop)=>this.halo(x,y,r,rgb,a,mid,stop);
      const rgbOf=name=>COLORS[name]||SPACE_COLORS[name];
      // A globe sampled into cells with its screen-space normal. A body
      // smaller than a cell still shows as its centre cell.
      const sphere=(s,r,shade)=>{
        const rp=r*R;
        const i0=Math.max(0,Math.floor((s.x-rp-o.x0)/ORB.cw)),i1=Math.min(o.cols-1,Math.floor((s.x+rp-o.x0)/ORB.cw));
        const j0=Math.max(0,Math.floor((s.y-rp-o.y0)/ORB.ch)),j1=Math.min(o.rows-1,Math.floor((s.y+rp-o.y0)/ORB.ch));
        let hit=false;
        for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) {
          const px=o.x0+(i+.5)*ORB.cw,py=o.y0+(j+.5)*ORB.ch,dx=(px-s.x)/rp,dy=(py-s.y)/rp,rr=dx*dx+dy*dy;
          if(rr>1) continue;
          const nz=Math.sqrt(1-rr),cell=shade(dx,dy,nz,rr);
          if(cell) {put(px,py,s.d+nz*r,cell[0],cell[1],cell[2]);hit=true;}
        }
        if(!hit) {const cell=shade(0,0,1,0);if(cell) put(s.x,s.y,s.d+r,cell[0],cell[1],cell[2]);}
      };
      const rs=ORRERY.sun.r,rsp=rs*R,sun=proj(0,0,0);
      // Each globe's silhouette goes down first, under all the glow: a disc
      // of the background hides the stars and haze behind it, and the
      // sun's halo and its own then lie over it, so the glow still shows
      // between its glyphs. (A disc painted after the halos punched a dark
      // hole in the glow under every planet, Oct 28 2026.) A globe hidden
      // behind the sun gets none.
      for(const p of ORRERY.planets) {
        const pos=orbit(p,p.start+TAU*t/p.period),s=projTo(pos[0],pos[1],pos[2],S1),rp=p.r*R;
        if(!(s.d<sun.d&&Math.hypot(s.x-sun.x,s.y-sun.y)<rsp+rp)) this.disc(s.x,s.y,rp+1);
        if(p.moons) for(const m of p.moons) {
          const ma=(m.start||0)+t*TAU/m.period,ms=projTo(pos[0]+m.a*Math.cos(ma),pos[1],pos[2]+m.a*Math.sin(ma),S2);
          if(!(ms.d<s.d&&Math.hypot(ms.x-s.x,ms.y-s.y)<rp+m.r*R)) this.disc(ms.x,ms.y,m.r*R+1);
        }
      }
      // Faint sunlight across the whole plane ties the system together.
      halo(sun.x,sun.y,R*1.15,[255,190,110],.08,.03,.5);
      for(const a of o.belt) {const ang=a.angle+t*a.rate,s=projTo(a.a*Math.cos(ang),a.y,a.a*Math.sin(ang),S1);put(s.x,s.y,s.d,G[a.g],PI.stone,a.b);}
      // The sun: a breathing bloom, a granulated disc that cools from cream
      // to orange at the limb, short spikes all round and a few long
      // streamers that drift and waver, all at the sun's own depth, so a
      // planet behind it is lost in the glare and one in front crosses it
      // as a dark disc.
      const breath=.92+.08*Math.sin(t*2.3)+.04*Math.sin(t*5.1);
      halo(sun.x,sun.y,rsp*3.6,[255,165,60],.40*breath,.09,.38);
      halo(sun.x,sun.y,rsp*1.6,[255,226,160],.55,.16,.5);
      sphere(sun,rs,(dx,dy,nz,rr)=>{
        const grain=noise(dx*2.6+t*.35,dy*2.6+t*.2,711);
        // Smaller glyphs round the limb keep the disc from squaring off.
        if(rr>.8) return fill(G[grain>.5?'o':'*'],PI.fire,(.6+grain*.2)*(.7+.3*nz));
        return fill(G[grain>.6?'@':grain>.42?'%':grain>.25?'#':'&'],PI[rr<.3?'cream':rr<.75?'ember':'fire'],(.8+grain*.2)*(.7+.3*nz));
      });
      for(let i=0;i<36;i++) {
        const a=i/36*TAU+Math.sin(t*.7+i)*.03,flick=noise(i*.9,t*1.4,712),len=rsp*(.2+.8*Math.pow(flick,1.4));
        for(let s=rsp+2.5;s<rsp+len;s+=ORB.ch*.7) {
          const k=(s-rsp)/len;
          put(sun.x+Math.cos(a)*s,sun.y+Math.sin(a)*s,0,G[k<.2?'*':k<.5?'+':k<.75?"'":'.'],PI[k<.35?'fire':'ember'],(1-k*.8)*(.6+.4*flick));
        }
      }
      for(let i=0;i<7;i++) {
        const a=i/7*TAU+Math.sin(t*.13+i*1.7)*.35,wave=noise(i*1.3,t*.5,714),len=rsp*(1.1+1.3*wave);
        for(let s=rsp*1.15;s<rsp*1.15+len;s+=ORB.ch*.75) {
          const k=(s-rsp*1.15)/len;
          put(sun.x+Math.cos(a)*s,sun.y+Math.sin(a)*s,0,G[k<.3?"'":'.'],PI[k<.5?'ember':'fire'],(1-k)*(1-k)*.7);
        }
      }
      // Planets are globes lit by the sun as a point light, with a lit
      // side, a dark side and a terminator; the sunward limb catches the
      // light, and a thin atmosphere (`air`) rims those that have one.
      // Each wears its own face from SKINS, turning with it, and Saturn
      // its ring, shadowed where the globe blocks the sun.
      for(const p of ORRERY.planets) {
        const pos=orbit(p,p.start+TAU*t/p.period),s=proj(pos[0],pos[1],pos[2]),len=Math.hypot(pos[0],pos[1],pos[2]);
        const L=[-pos[0]/len,-pos[1]/len,-pos[2]/len],Ls=toScreen(L),skin=SKINS[p.name],rp=p.r*R;
        halo(s.x,s.y,rp+9,rgbOf(p.palette),.30,.04,.45);
        sphere(s,p.r,(dx,dy,nz,rr)=>{
          const lam=dx*Ls[0]+dy*Ls[1]+nz*Ls[2],lit=Math.max(0,lam);
          const w=toWorld(dx,dy,nz),[pal,tone,night]=skin(w[1],Math.atan2(w[0],w[2])+t*p.spin,t);
          if(lam<=0) return night?fill(G['.'],PI[night],.5):fill(G[lam>-.3?':':'.'],PI[pal],.14);
          if(p.air&&rr>.8&&lit>.08) return fill(G[lit>.4?':':"'"],PI[p.air],.3+lit*.6);
          const rim=rr>.55&&lam>.25?.18:0,b=(.17+.83*Math.pow(lit,.75))*tone+rim;
          return fill(G[b>.72?'@':b>.48?'%':b>.28?'o':b>.12?':':'.'],PI[pal],b);
        });
        if(p.ring) {
          const rg=p.ring,ri=rg.inner*p.r,ro=rg.outer*p.r,ct=Math.cos(rg.tilt),st=Math.sin(rg.tilt),cu=Math.cos(rg.turn),su=Math.sin(rg.turn);
          const u=[cu,0,-su],v=[su*ct,st,cu*ct],nrm=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
          const face=Math.abs(nrm[0]*L[0]+nrm[1]*L[1]+nrm[2]*L[2]);
          // Sampled a little under the cell pitch along and across, so
          // every cell the ring crosses gets a sample without many spares.
          const steps=Math.ceil(TAU*ro*R/2.5),radial=Math.max(2,Math.ceil((ro-ri)*R/3));
          for(let i=0;i<steps;i++) {
            const a=i/steps*TAU,ca=Math.cos(a),sa=Math.sin(a);
            // The ring's dashes turn to lie along its edge on screen, so
            // it reads as a smooth ellipse rather than hatching.
            const tn=toScreenTo(-sa*u[0]+ca*v[0],-sa*u[1]+ca*v[1],-sa*u[2]+ca*v[2]),turn=Math.atan2(tn[1],tn[0]);
            const ux=ca*u[0]+sa*v[0],uy=ca*u[1]+sa*v[1],uz=ca*u[2]+sa*v[2];
            for(let j=0;j<=radial;j++) {
              const f=j/radial,q=mix(ri,ro,f),rx=q*ux,ry=q*uy,rz=q*uz;
              const along=rx*L[0]+ry*L[1]+rz*L[2];
              const shadow=along<0&&Math.hypot(rx-along*L[0],ry-along*L[1],rz-along*L[2])<p.r;
              const w=projTo(pos[0]+rx,pos[1]+ry,pos[2]+rz,S1);
              // Saturn's: a faint inner ring, the bright main ring, an empty
              // gap, then a dimmer outer ring. A plain ring is one thin band.
              let g,dense;
              if(rg.plain) {g='-';dense=rg.dim;}
              else {if(f>=.58&&f<.68) continue;const inner=f<.12;dense=inner?.35:f<.58?1:.6;g=inner?'.':f<.58?'=':'-';}
              put(w.x,w.y,w.d,G[g],PI[rg.palette||'cream'],(.42+.55*face)*dense*(shadow?.3:1),g==='.'?0:turn);
            }
          }
        }
        // Moons are small lit globes that pass behind and in front of
        // their planet; the depth grid sorts them.
        if(p.moons) for(const m of p.moons) {
          const ma=(m.start||0)+t*TAU/m.period,ms=proj(pos[0]+m.a*Math.cos(ma),pos[1],pos[2]+m.a*Math.sin(ma)),pal=PI[m.palette||'stone'];
          sphere(ms,m.r,(dx,dy,nz)=>{const lam=dx*Ls[0]+dy*Ls[1]+nz*Ls[2];return fill(G[lam>.4?'o':'.'],pal,.12+.75*Math.max(0,lam));});
        }
      }
      // A comet on a long, leaning ellipse falls in past the sun now and
      // then. Near it two tails stream away from the sun: a straight blue
      // ion tail, and a dust tail that lags along the orbit.
      const cm=ORRERY.comet;
      if(cm) {
        const cn=Math.cos(cm.node),sn=Math.sin(cm.node),ci=Math.cos(cm.tilt),si=Math.sin(cm.tilt);
        const at=time=>{
          const M=TAU*(time-cm.peri)/cm.period;
          let E=M;
          for(let i=0;i<6;i++) E-=(E-cm.e*Math.sin(E)-M)/(1-cm.e*Math.cos(E));
          const px=cm.a*(Math.cos(E)-cm.e),pz=cm.a*Math.sqrt(1-cm.e*cm.e)*Math.sin(E);
          return [px*cn-pz*sn*ci,pz*si,px*sn+pz*cn*ci];
        };
        const pos=at(t),next=at(t+.05),dist=Math.hypot(pos[0],pos[1],pos[2]),away=pos.map(v=>v/dist);
        const vel=next.map((v,i)=>v-pos[i]),speed=Math.hypot(vel[0],vel[1],vel[2])||1,back=vel.map(v=>-v/speed);
        const glow=clamp(.06/(dist*dist)),head=proj(pos[0],pos[1],pos[2]),reach=clamp(glow*1.2,0,.6);
        halo(head.x,head.y,6+glow*20,[200,225,255],.15+glow*.4,0,.5);
        put(head.x,head.y,head.d+.01,G[glow>.15?'*':'+'],PI.moon,.6+glow*.4);
        for(const [dir,length,pal] of [[away,reach,'blue'],[away.map((v,i)=>v*.8+back[i]*.5),reach*.6,'cream']]) {
          const n=Math.hypot(dir[0],dir[1],dir[2]),step=ORB.ch*.5/R;
          for(let s=step;s<length;s+=step) {
            const k=s/length,w=projTo(pos[0]+dir[0]/n*s,pos[1]+dir[1]/n*s,pos[2]+dir[2]/n*s,S1);
            put(w.x,w.y,w.d,G[k<.4?':':k<.7?"'":'.'],PI[pal],Math.pow(1-k,.8)*(.55+.45*glow));
          }
        }
      }
      for(let c=0;c<o.count;c++) {
        const k=o.touched[c],i=k%o.cols,j=(k-i)/o.cols;
        this.orbGlyph(o.glyph[k],o.pal[k],o.bright[k],o.x0+(i+.5)*ORB.cw,o.y0+(j+.5)*ORB.ch,o.turn[k]);
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
          // Moonlight from the upper right gives a lit shoulder and rim. The
          // shaded side stays dense but dim: sparse characters there would
          // line up down a tall tree's stacked layers into one blank strip.
          const lit=clamp(.5+dx*.38-dy*.50),rim=rr>.55&&dy<.15&&dx>-.6?.14:0;
          const shade=(lobe.shade-.06+lit*.42+rim+seed*.06)*lobe.far;
          const glyphSet=material===MAT.shrub?(lit>.55?'&%o':'*+:'):(lit>.62?'@&%':lit>.38?'%#*':'#*%+');
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
        // A '_' in the mask clears only the cell's lower half, so whatever
        // stands behind a top edge still shows above it.
        const d=this.dpr;
        for(let j=0;j<lines.length;j++)for(let i=0;i<lines[j].length;i++) {
          const mask=options.mask?.[j]||lines[j];
          if(!mask[i]||mask[i]===' ')continue;
          const cell=place(i,j),low=mask[i]==='_'?cell.ch/2:0;
          if(!this.visible(cell,true))continue;
          this.rect(Math.round((cell.x-cell.cw/2-1)*d)/d,Math.round((cell.y-cell.ch/2-1+low)*d)/d,cell.cw+2,cell.ch+2-low);
        }
      }
      for (let j = 0; j < lines.length; j++) for (let i = 0; i < lines[j].length; i++) {
        const char = lines[j][i];
        if (char === ' ') continue;
        const cell=place(i,j);
        let color=palette,b=brightness,warm=false;
        if(options?.eyePalette&&char==='o')color=options.eyePalette;
        if(options?.charPalette?.[char])color=options.charPalette[char];
        if(options?.fireSide) {
          const heat=clamp(.50+options.fireSide*(i-(width-1)/2)/Math.max(1,width-1));
          b*=.88+heat*.12;b+=heat*.05;warm=heat>.63;
        }
        if (this.visible(cell,options?.opaque)) this.glyph(GI[char],color,b,cell.x,cell.y,warm,1,cell.sheet);
      }
    }
    // A figure's marks are kept from frame to frame while nothing that
    // shapes them has changed (its place, heading, pose, cue or props):
    // laying them out is most of a figure's cost, and most figures stand
    // still most of the time.
    figureMarks(fig,project) {
      const c=fig.cued,r=fig.rod,s=fig.toast,sc=fig.scope;
      const key=`${fig.x},${fig.y},${fig.z},${fig.heading},${fig.face},${fig.speed},${fig.phase},${fig.fade},${fig.clip},${fig.next},${c?c.name+c.k+','+c.clock:''},${r?r.lift+','+r.out+','+r.x+','+r.z:''},${s?s.raise+','+s.has+','+s.len:''},${sc?sc.heading:''},${this.viewKey}`;
      if(fig.marksKey===key) return fig.marks;
      fig.marksKey=key;
      return fig.marks=Folk.marks(fig,project,this.folkMetrics,fig.marks||[]);
    }
    drawFigure(fig) {
      // The dark keyline goes down before the strokes, so grass never runs
      // into a limb and limbs never cut limbs.
      const sheet=this.folkAtlas,f=this.fire,project=this.folkProject||(this.folkProject=(x,y,z)=>this.project(x,y,z));
      const marks=this.figureMarks(fig,project),reach=Math.hypot(fig.x-f.x,fig.z-f.z);
      for(const m of marks) if(m.t!=='line'&&this.visible(m,true)) for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) this.sheetGlyph(sheet.index[m.c],'dark',.3,m.x+ox,m.y+oy,false,1,sheet,m.r);
      for(const m of marks) {
        if(!this.visible(m,true))continue;
        // Whatever reaches out past the body toward the fire catches its light.
        const heat=clamp((reach-Math.hypot(m.wx-f.x,m.wz-f.z)+.1)/.7)*clamp(1.6-reach/5)*this.flicker;
        if(m.t==='body')this.sheetGlyph(sheet.index[m.c],fig.palette,fig.brightness+heat*.16,m.x,m.y,heat>.36,1,sheet,m.r);
        else if(m.t==='mallow') {
          // White, then golden, then brown. Alight, a flame up to three
          // glyphs tall stands off it; once out, it is a charred lump.
          const s=fig.toast;
          if(s.flame>0) {
            this.sheetGlyph(sheet.index.o,'fire',.92*this.flicker,m.x,m.y,true,1,sheet);
            const rows=s.flame*3;
            for(let k=1;k<=3&&k<rows+1;k++)
              this.glyph(GI[k<3?'^':"'"],k<2?'fire':'ember',.95*this.flicker,m.x+Math.sin(this.time*13+k*2)*1.4*k,m.y-this.ch*.7*k,false,clamp(rows-k+1));
          } else this.sheetGlyph(sheet.index.o,s.done<.3?'moon':s.done<.65?'cream':s.done<1?'ember':'deer',s.done<1?.9:.58,m.x,m.y,false,1,sheet);
        }
        else if(m.t==='bob'&&fig.rod.fish) this.drawHooked(m);
        else {const [palette,b]=FOLK_PROPS[m.t];this.sheetGlyph(sheet.index[m.c],palette,b,m.x,m.y,false,1,sheet,m.r);}
      }
      if(fig.toast) this.drawMishap(fig.toast,marks);
    }
    drawFire(t) {
      // A dark keyline goes down first, so the flames stand off the
      // firelit ground around them.
      const f=this.fire,p=this.project(f.x,f.y,f.z),flames=[];
      this.sprite([' . . ','(x=x)'],f.x,f.y+.05,f.z,'rock',.6);
      for(let j=0;j<4;j++) for(let i=-1;i<=1;i++) {
        const flick=Math.sin(t*11+j*3+i*2),h=3+flick*.6-Math.abs(i);
        if(j>h) continue;
        flames.push({g:GI[j>2?"'":j>1?'^':'*'],palette:j<2?'fire':'ember',x:p.x+i*this.cw*.8+Math.sin(t*7+j)*1.7,y:p.y-j*this.ch});
      }
      for(const fl of flames) for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) this.glyph(fl.g,'dark',.3,fl.x+ox,fl.y+oy);
      for(const fl of flames) this.glyph(fl.g,fl.palette,.9,fl.x,fl.y);
    }
    drawSnort(a,age) {
      // Two puffs from the pony's muzzle, drifting off ahead of it.
      const p=this.project(a.x,a.y,a.z);
      for(let i=0;i<2;i++) {
        const k=clamp((age-.25-i*.2)/.8);
        if(k>0&&k<1) this.glyph(GI['~'],'stone',.7,p.x+21+k*12,p.y-29-k*5,false,Math.sin(k*Math.PI)*.8);
      }
    }
    drawMishap(s,marks) {
      // The marshmallow catching fire: puffs blow it out, and smoke curls
      // off what's left.
      const head=marks.find(m=>m.c==='o'&&m.t==='body'),mallow=marks.find(m=>m.t==='mallow');
      if(!head||!mallow) return;
      if(s.state==='blow') for(let i=0;i<2;i++) {
        const k=(s.age*2.4+i/2)%1;
        this.glyph(GI['~'],'stone',.75,mix(head.x,mallow.x,.15+k*.75),mix(head.y,mallow.y,.15+k*.75),false,Math.sin(k*Math.PI)*.85);
      }
      if(s.smoke>0) for(let i=0;i<5;i++) {
        const age=(this.time*.6+i/5)%1;
        this.worldGlyph(age<.35?'~':age<.7?':':'.','stone',.68,mallow.wx+Math.sin(age*6+i*2)*.35+age*this.wind,mallow.wy+.5+age*3.6,mallow.wz,Math.min(1,s.smoke*1.5)*Math.sin(age*Math.PI));
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
      this.stepAnimals(dt);
      this.trampleGrass(dt);
      if (t >= this.nextMeteor) { this.nextMeteor = t+6+Math.random()*6; this.spawnMeteor(); }
      if (!this.shower && t >= this.nextShower) this.startShower();
      if (this.shower) this.stepShower(dt);
      for (const meteor of this.meteors) meteor.age += dt;
      this.meteors = this.meteors.filter(m=>m.age<m.life);
      if (this.satellite) { this.satellite.age += dt; if (this.satellite.age >= this.satellite.life) { this.satellite = null; this.nextSatellite = t+40+Math.random()*40; } }
      else if (t >= this.nextSatellite) {
        // A slow pass across the upper sky; some catch the sun and flare once.
        const top=Math.min(this.H,innerHeight),y0=top*(.06+Math.random()*.22),east=Math.random()<.5;
        this.satellite = { x0:east?this.W+10:-10, x1:east?-10:this.W+10, y0, y1:y0+top*(Math.random()-.3)*.18, age:0, life:22+Math.random()*10, flare:Math.random()<.45?.3+Math.random()*.4:-1 };
      }
      // Now and then a fish leaps clear of the river; once in a while a
      // second one follows close behind.
      if (t >= this.nextLeap) {
        this.nextLeap = t+7+Math.random()*9;
        const first=this.spawnFish();
        if (first && Math.random()<.15) this.follow = { at:t+.35+Math.random()*.4, x:first.x+(Math.random()-.5)*3, z:first.z+(Math.random()-.5)*4 };
      }
      if (this.follow && t >= this.follow.at) { this.leap(this.follow.x,this.follow.z); this.follow = null; }
      for (const f of this.fish) {
        f.age += dt;
        if (!f.landed && f.age >= f.life) { f.landed = true; const [x,y,z]=this.leapPoint(f,1); this.world.splash(x,z); this.spray(x,y,z,f.dx,f.dz); }
      }
      this.fish = this.fish.filter(f=>f.age<f.life*1.35);
      for (const d of this.drops) { d.age += dt; d.vy -= 10*dt; d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt; }
      this.drops = this.drops.filter(d=>d.y>0);
      for (const r of this.ripples) r.age += dt;
      this.ripples = this.ripples.filter(r=>r.age<3.8);
      for (const s of this.sparks) s.age += dt;
      this.sparks = this.sparks.filter(s=>s.age<s.life);
      if (hash(Math.floor(t*60),97) < dt*8 && this.sparks.length<25) this.sparks.push({ age:0,life:1.5+hash(Math.floor(t*60),98)*1.7,dx:(hash(Math.floor(t*60),99)-.5)*1.6 });
    }
    // Where the pony and rabbit have grazed to by time t, and how high the
    // rabbit is off the ground if it is hopping away.
    wander(t=this.time) {
      const {pony,rabbit}=this.wildlife,hop=this.rabbitHop;
      let along=0,rabbitBob=0;
      if(hop) {
        const n=Math.min(3,hop.age/1.2*3),i=Math.min(2,Math.floor(n)),f=n-i;
        along=(i+smooth(0,1,f))/3*hop.dir*2.2;rabbitBob=-Math.sin(f*Math.PI)*5;
      }
      return {ponyX:pony.x+Math.sin(t*.075)*2,rabbitX:rabbit.x+Math.sin(t*.09)*.6+along,rabbitBob};
    }
    // The animals' reactions to a tap, each running its course. The dog
    // spins on the spot, then wags. The pony stamps and snorts; the rabbit
    // hops a little way off, three hops, and grazes on from there.
    stepAnimals(dt) {
      if(this.ponyFuss&&(this.ponyFuss.age+=dt)>1.5) this.ponyFuss=null;
      const hop=this.rabbitHop;
      if(hop&&(hop.age+=dt)>=1.2) { this.wildlife.rabbit.x+=hop.dir*2.2; this.rabbitHop=null; }
      const now=this.dogNow,spin=this.dogSpin;
      now.hop=0;now.stride=false;now.wag=false;now.right=false;
      if(!spin) return;
      spin.age+=dt;
      if(spin.age<DOG_SPIN.spin) {
        // It turns at the top of each bound, legs out while airborne, and an
        // even number of turns lands it facing the way it started.
        const n=spin.age/DOG_SPIN.spin*DOG_SPIN.hops,f=n%1;
        now.hop=-Math.sin(f*Math.PI)*DOG_SPIN.lift;now.stride=f>.15&&f<.85;now.right=Math.floor(n+.5)%2===1;
      } else if(spin.age<DOG_SPIN.spin+DOG_SPIN.wag) now.wag=true;
      else this.dogSpin=null;
    }
    dogSprite() {
      const n=this.dogNow,lines=[...(n.right?SPRITES.dogRight:SPRITES.dog)];
      // Legs reach out fore and aft mid-bound; a wagging tail flicks up.
      if(n.stride) lines[3]=n.right?'  / \\ ':' / \\  ';
      if(n.wag&&Math.sin(this.time*40)>0) lines[2]=n.right?'\\/##\\ ':' /##\\/';
      return lines;
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
    // A fish leaps from (x, z) toward the middle of the river. It crosses
    // the current rather than running with it, since a leap along the river
    // reads as a plain up-and-down bob from this camera. Returns the fish,
    // or null when there is no water to land in.
    leap(x,z) {
      if(this.fish.length>=2||riverDistance(x,z)>-.5) return null;
      const across=x-riverX(z),side=Math.abs(across)<riverWidth(z)*.3?(Math.random()<.5?1:-1):-Math.sign(across);
      // Lean a little upstream; the current runs toward +z.
      const slope=.37*Math.cos((z+14)*.037)+.045,n=Math.hypot(1,slope),tilt=.15+Math.random()*.35;
      const dx=(side*Math.cos(tilt)-slope*Math.sin(tilt))/n,dz=(-side*slope*Math.cos(tilt)-Math.sin(tilt))/n;
      const reach=.85+Math.random()*.25,len=[4.8,4,3.2].map(l=>l*reach).find(l=>riverDistance(x+dx*l,z+dz*l)<-.7);
      if(!len) return null;
      const y=Math.max(0,height(x,z)),fish={x,y,z,y1:y,dx,dz,len,h:2.8+Math.random()*1.2,age:0,life:.9+Math.random()*.25,landed:false};
      this.fish.push(fish);
      this.world.splash(x,z);
      this.spray(x,y,z,-dx,-dz);
      return fish;
    }
    // The angler's catch, swung off the hook at (x, y, z) to splash down
    // at (tx, tz).
    release(x,y,z,tx,tz) {
      const len=Math.hypot(tx-x,tz-z)||1;
      this.fish.push({x,y,z,y1:Math.max(0,height(tx,tz)),dx:(tx-x)/len,dz:(tz-z)/len,len,h:1.2,age:0,life:.75,landed:false,toss:true});
    }
    spawnFish() {
      // Somewhere on the river in the visible part of the page, clear of
      // the bridge and the angler's bobber, with room above for the arc. On
      // iOS the canvas runs on under Safari's floating bottom bar and the
      // home indicator, so the bottom of the viewport is off limits there.
      const view=window.visualViewport,page=view?view.pageTop:scrollY,tall=view?Math.min(innerHeight,view.height):innerHeight;
      const covered=CSS.supports('-webkit-touch-callout','none')?170:tall*.08;
      const bob=this.bobber,water=this.waterIndices,top=page+Math.max(60,tall*.08),bottom=page+tall-covered;
      for(let tries=0;tries<30&&water.length;tries++) {
        const k=water[Math.floor(Math.random()*water.length)],y=(Math.floor(k/this.cols)+.5)*this.ch,x0=(k%this.cols+.5)*this.cw;
        if(y<top||y>bottom||x0<this.W*.06||x0>this.W*.94) continue;
        const x=this.wx[k],z=this.wz[k];
        if(riverDistance(x,z)>-1.2||Math.abs(z-this.bridge.z)<4.5||Math.hypot(x-bob.x,z-bob.z)<6) continue;
        const fish=this.leap(x,z);
        if(fish) return fish;
      }
      return null;
    }
    leapPoint(f,s) {
      return [f.x+f.dx*f.len*s,mix(f.y,f.y1,s)+f.h*4*s*(1-s),f.z+f.dz*f.len*s];
    }
    spray(x,y,z,dx,dz) {
      // A few drops thrown up where the fish breaks the surface, kicked
      // back the way it came from.
      for(let i=0;i<4;i++) {
        const a=Math.random()*TAU,r=.4+Math.random();
        this.drops.push({x,y:y+.05,z,vx:Math.cos(a)*r+dx*.9,vy:3.5+Math.random()*2,vz:Math.sin(a)*r+dz*.9,age:0});
      }
    }
    drawFish(f) {
      // A ><> that stays nearly level: chevrons turned much past 30 degrees
      // read as L and 7, so the body only tilts partway into the arc. Parts
      // still short of the arc are underwater, so the fish comes out nose
      // first and goes back in the same way. A tossed fish starts in the air.
      const sheet=this.fishAtlas,s=f.age/f.life,gap=sheet.cw*.85;
      const head=this.project(...this.leapPoint(f,s)),back=this.project(...this.leapPoint(f,s-.03));
      const dx=head.x-back.x,dy=head.y-back.y,step=.03*gap/Math.max(.001,Math.hypot(dx,dy));
      const face=dx<0?-1:1,tilt=clamp(Math.atan2(dy,Math.abs(dx)),-.5,.5),ux=face*Math.cos(tilt),uy=Math.sin(tilt);
      const chars=face>0?'><>':'<><',glint=Math.exp(-Math.pow((s-.5)/.2,2)),parts=[];
      for(let i=0;i<3;i++) {
        const u=s-i*step;
        if(u<0&&!f.toss||u>1) continue;
        const p={x:head.x-ux*gap*i,y:head.y-uy*gap*i,d:head.d};
        if(this.visible(p)) parts.push({p,g:sheet.index[chars[2-i]],palette:i===2?'blue':'moon'});
      }
      // Clear the water glyphs behind the body first, so it reads cleanly.
      const m=sheet.cw*.9;
      for(const {p} of parts) this.rect(p.x-m/2,p.y-m/2,m,m);
      for(const {p,g,palette} of parts) this.sheetGlyph(g,palette,.74+glint*.26,p.x,p.y,false,1,sheet,face*tilt);
    }
    drawHooked(m) {
      // A fish on the line hangs nose up from the hook and thrashes, its
      // tail swinging wider than its head.
      const sheet=this.fishAtlas,gap=sheet.cw*.85,wag=Math.sin(this.time*15),hook=this.project(m.wx,m.wy,m.wz),parts=[];
      let x=hook.x,y=hook.y-gap*.4;
      for(let i=0;i<3;i++) {
        const a=wag*.3*i;
        x+=Math.sin(a)*gap;y+=Math.cos(a)*gap;
        const p={x,y,d:hook.d};
        if(this.visible(p,true)) parts.push({p,g:sheet.index['><>'[2-i]],palette:i===2?'blue':'moon',turn:-Math.PI/2-a});
      }
      const size=sheet.cw*.9;
      for(const {p} of parts) this.rect(p.x-size/2,p.y-size/2,size,size);
      for(const {p,g,palette,turn} of parts) this.sheetGlyph(g,palette,.9,p.x,p.y,false,1,sheet,turn);
    }
    isSky(x,y) {
      return x>=0&&y>=0&&x<this.W&&y<this.H&&this.material[Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw)]===MAT.sky;
    }
    spawnMeteor(at=null) {
      // Start somewhere in the visible upper sky, or where the sky was
      // tapped, and streak down and across, away from the nearer side. One
      // in six is a slow, bright fireball.
      const top=Math.min(this.H,innerHeight)*.5;
      for(let tries=0;tries<16;tries++) {
        const x=at?at.x:this.W*(.08+Math.random()*.84),y=at?at.y:8+top*Math.random();
        if(!this.isSky(x,y)) { if(at) return; continue; }
        const fireball=Math.random()<.16,speed=fireball?240:420+Math.random()*260,life=fireball?1.9:.55+Math.random()*.5;
        let side=x<this.W/2?1:-1,angle=.25+Math.random()*.45;
        // A tap may land just above the treeline, so a tapped meteor takes
        // whichever heading keeps it in open sky longest.
        if(at) [side,angle]=this.openHeading(x,y,side,angle,speed*life);
        this.meteors.push({x,y,dx:Math.cos(angle)*side,dy:Math.sin(angle),speed,age:0,life,length:fireball?30:9+Math.floor(Math.random()*12),fireball});
        // The stargazer looks up from the eyepiece to point it out, ahead or
        // back over a shoulder.
        const fig=this.stargazer,seen=this.project(fig.x,fig.y,fig.z);
        Folk.cue(fig,x>seen.x?'point':'pointBack',fireball?3.2:2.2,.35);
        return;
      }
    }
    startShower() {
      if(this.shower) return;
      // A shower's meteors all fly out from one point in the sky, its
      // radiant: high in the visible sky, and well clear of the moon, or
      // the moon seems to be throwing them. With no such sky, it sits just
      // above the screen and they all fall.
      let radiant={x:this.W*.4,y:-20};
      for(let tries=0;tries<40;tries++) {
        const x=this.W*(.2+Math.random()*.6),y=10+Math.random()*30;
        if(this.isSky(x,y)&&Math.hypot(x-this.moon.x,y-this.moon.y)>this.moon.r+50) { radiant={x,y}; break; }
      }
      // The stargazer straightens up to point it out. Anyone not busy stops
      // to look up, one after another as they notice.
      const fig=this.stargazer,seen=this.project(fig.x,fig.y,fig.z);
      Folk.cue(fig,radiant.x>seen.x?'point':'pointBack',SHOWER.watch-1.2,1.2);
      const onlookers=this.folk.filter(f=>f!==fig&&!f.rod&&!f.toast);
      this.shower={age:0,radiant,notice:onlookers.map(f=>({fig:f,at:1.5+Math.random()*3.5}))};
    }
    stepShower(dt) {
      const s=this.shower;
      s.age+=dt;
      if(s.age>=SHOWER.life) {
        this.shower=null;
        this.nextShower=this.time+SHOWER.gap[0]+Math.random()*(SHOWER.gap[1]-SHOWER.gap[0]);
        return;
      }
      for(const n of s.notice) {
        if(n.done||s.age<n.at) continue;
        n.done=true;
        // Not someone already on their way to the castle, or inside it.
        if(n.fig.route||n.fig.hidden) continue;
        Folk.halt(n.fig,SHOWER.watch-s.age+1.5);
        Folk.cue(n.fig,'lookUp',SHOWER.watch-s.age);
      }
      const k=s.age/SHOWER.life,rate=SHOWER.peak*smooth(0,.25,k)*(1-smooth(.7,1,k));
      if(Math.random()<rate*dt) this.spawnShowerMeteor(s.radiant);
    }
    spawnShowerMeteor(r) {
      // Anywhere in the visible sky, flying straight out from the radiant.
      // Near it they are short and slow, coming nearly head-on; far out,
      // long. A few are fireballs.
      const top=Math.min(this.H,innerHeight)*.5;
      for(let tries=0;tries<12;tries++) {
        const x=Math.random()*this.W,y=Math.random()*top,dx=x-r.x,dy=y-r.y,d=Math.hypot(dx,dy);
        if(d<12||!this.isSky(x,y)) continue;
        const far=clamp(d/160,.3,1),fireball=Math.random()<.06;
        this.meteors.push({x,y,dx:dx/d,dy:dy/d,speed:(fireball?240:380+Math.random()*260)*far,age:0,life:fireball?1.6:.45+Math.random()*.4,
          length:2+Math.round((fireball?24:6+Math.random()*10)*far),fireball});
        return;
      }
    }
    openHeading(x,y,side,angle,reach) {
      // Falling steeply reads best, so keep the given heading if it makes a
      // fair streak; failing that, try flatter ones on the same side, then
      // the other. If none does, take whichever lasts longest.
      const enough=Math.min(reach*.5,140);
      let best=[side,angle],most=this.skyRun(x,y,side,angle,reach);
      if(most>=enough) return best;
      for(const s of [side,-side]) for(const base of [.5,.3,.12]) {
        const a=base*(.85+Math.random()*.3),run=this.skyRun(x,y,s,a,reach);
        if(run>=enough) return [s,a];
        if(run>most) { most=run; best=[s,a]; }
      }
      return best;
    }
    // How far a meteor's head travels in view, before it drops behind the
    // land or off the side of the screen.
    skyRun(x,y,side,angle,reach) {
      const dx=Math.cos(angle)*side,dy=Math.sin(angle);
      for(let d=0;d<reach;d+=this.cw) if(!this.isSky(x+dx*d,y+dy*d)) return d;
      return reach;
    }
    skyGlyph(g,p,b,x,y,alpha=1) {
      const k=Math.floor(y/this.ch)*this.cols+Math.floor(x/this.cw),sheet=this.meteorAtlas;
      if(x>=0&&y>=0&&x<this.W&&y<this.H&&this.material[k]===MAT.sky) this.glyph(sheet.index[g],p,b,x,y,false,alpha,sheet);
    }
    // The moon, drawn as the planets are: a globe on the fine orrery
    // cells, lit from the upper right (a waxing gibbous) with its dark
    // plains a shade greyer, a disc of the background under it so nothing
    // shows between its glyphs, and a soft glow over that. It was a flat
    // scatter of characters on the scene's coarse cells, which sat oddly
    // beside the shaded planets (Jake, Oct 28 2026). Baked into the sky's
    // glowing layer with the rest, so it costs nothing per frame.
    drawMoon() {
      const moon=this.moon,r=moon.r,sheet=this.moonAtlas,G=sheet.index,cw=ORB.cw,ch=ORB.ch;
      const lx=.52,ly=-.38,lz=.77,ln=Math.hypot(lx,ly,lz);
      // The bake's shadow would ring the disc and the glow; it is for the
      // glyphs only.
      const c=this.ctx,blur=c?c.shadowBlur:0;
      if(c) c.shadowBlur=0;
      this.disc(moon.x,moon.y,r+1);
      this.halo(moon.x,moon.y,r*2.1,[227,234,207],.16,.05,.5);
      if(c) c.shadowBlur=blur;
      for(let j=-Math.ceil(r/ch);j<=Math.ceil(r/ch);j++) for(let i=-Math.ceil(r/cw);i<=Math.ceil(r/cw);i++) {
        const dx=i*cw/r,dy=j*ch/r,rr=dx*dx+dy*dy;
        if(rr>1) continue;
        const nz=Math.sqrt(1-rr),lam=(dx*lx+dy*ly+nz*lz)/ln,lit=Math.max(0,lam);
        const mare=noise(dx*2.2+7,dy*2.2+9,144)>.56,pal=mare?'stone':'moon';
        let g,b;
        if(lam<=0) {g=lam>-.3?':':'.';b=.14;}
        else {b=(.2+.8*Math.pow(lit,.75))*(mare?.72:1)+(rr>.55&&lam>.25?.12:0);g=b>.72?'@':b>.48?'%':b>.28?'o':b>.12?':':'.';}
        this.glyph(G[g],pal,b,moon.x+i*cw,moon.y+j*ch,false,1,sheet);
      }
    }
    drawSky() {
      const t=this.time,plain=this.sky==='plain',cull=this.cull;
      for (const star of this.stars) {
        if(plain&&star.band||cull&&(star.y<cull.top||star.y>cull.bottom)) continue;
        let twinkle;
        if(star.scint) {const w=.5+.5*Math.sin(t*star.rate26+star.phase);twinkle=.55+w*w*w*.75;}
        else twinkle=.8+Math.sin(t*star.rate+star.phase)*.2;
        // A slow swell of light travels up the Milky Way.
        const shimmer=plain?1:1+star.glow45*Math.sin(star.s16-t*.55);
        this.glyph(star.g,star.p,star.b*twinkle*shimmer,star.x,star.y);
      }
      // The new sky bakes the moon into its glowing layer.
      if(plain) this.drawMoon();
      for(const m of this.meteors) {
        const life=m.age/m.life,travel=m.speed*m.age,fade=smooth(0,.1,life)*(1-smooth(.62,1,life));
        const x=m.x+m.dx*travel,y=m.y+m.dy*travel,spacing=4.5;
        // The stroke nearest the meteor's slant. A shower's meteors fly
        // every way, up included.
        const slant=Math.atan2(Math.abs(m.dy),Math.abs(m.dx));
        const streak=slant<Math.PI/8?'-':slant>Math.PI*3/8?'|':m.dx*m.dy>0?'\\':'/';
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
      const cells=staticPass?this.stillCells:this.liveCells,cols=this.cols,cull=this.cull,part=this.waterPart;
      for(let c=0;c<cells.length;c++) {
        const k=cells[c],m=this.material[k],i=k%cols,j=(k-i)/cols;
        const x=(i+.5)*cw,y=(j+.5)*ch;
        if(cull&&(y<cull.top||y>cull.bottom)) continue;
        let g=this.glyphs[k],p=PAL[MATERIAL_NAMES[m]],b=this.shade[k]*lighting*this.shadow[k];
        const warm=this.light[k]*lightFlickers[this.lightIndex[k]];
        if(m===MAT.grass) {
          // Only lamplit grass is drawn here; the rest is baked (drawTrampled).
          const bend=trample?trample[k]:0;
          g=this.grassGlyph(k,bend);
          b+=warm*.43+Math.abs(bend)*.20;
        } else if(m===MAT.water) {
          // During a crane on a phone, half the water cells are sampled on
          // each redraw, every other cell, and the rest keep their last
          // sample, so a redraw costs half and the river still moves on
          // every one.
          if(part>=0&&(c&1)!==part) {g=this.waterG[k];p=this.waterP[k];b=this.waterB[k];}
          else {const surface=this.waterSample(k,t,lighting,warm);g=this.waterG[k]=surface.g;p=this.waterP[k]=surface.p;b=this.waterB[k]=surface.b;}
        } else if(m===MAT.warm) {
          b=.74+Math.sin(t*1.3+this.tags[k])*.10;
        } else { b+=warm*.34; }
        // A hovered or focused link board brightens under its lantern.
        const lit=this.signCell[k]>0&&this.signCell[k]===this.signHover;
        if(lit) b+=.24;
        if(m===MAT.stone) b*=1.12;
        if(m===MAT.rock) b*=1.10;
        b*=this.fade[k];
        this.glyph(g,p,b,x,y,m===MAT.water?false:warm>.15||lit);
      }
      if(!staticPass) this.drawTrampled();
    }
    // A blade leans away from whatever brushed it; a tuft only shows a firm push.
    grassGlyph(k,bend) {
      if(this.grassBlade[k]) return this.bladeGlyph(this.grassRest[k]+bend);
      const g=this.glyphs[k];
      return Math.abs(bend)>.45&&g?GI[bend>0?'/':'\\']:g;
    }
    drawTrampled() {
      // Unlit grass is baked into the static layer. A cell something has bent
      // is cleared back to the background and redrawn bent.
      const active=this.trampleActive;
      if(!active) return;
      const cw=this.cw,ch=this.ch,d=this.dpr,lighting=this.moonlight;
      for(const k of active) {
        if(this.dynamic[k]) continue;
        const bend=this.trample[k],g=this.grassGlyph(k,bend);
        if(g===this.glyphs[k]) continue;
        const i=k%this.cols,j=(k-i)/this.cols,left=Math.round(i*cw*d)/d,top=Math.round(j*ch*d)/d;
        this.rect(left,top,Math.round((i+1)*cw*d)/d-left,Math.round((j+1)*ch*d)/d-top);
        const b=(this.shade[k]*lighting*this.shadow[k]+Math.abs(bend)*.20)*this.fade[k];
        this.glyph(g,PAL.grass,b,(i+.5)*cw,(j+.5)*ch);
      }
    }
    waterSample(k,t,lighting,warm=0,out=this.waterOut) {
      const x=this.wx[k],z=this.wz[k],grain=this.waterGrain[k],phase=this.waterPhase[k],phaseB=this.waterPhaseB[k],seed=this.seed[k];
      const cross=this.waterCross[k],run=this.waterRun[k];
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
      const beamX=this.waterBeam[k]+Math.sin(phase+t*.17)*.35,beamWidth=this.waterBeamW[k];
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
      if(this.gl&&!this.ctx) {
        this.recordStatic();
        this.gl.play(this.staticClip,0,Math.round(this.shiftY*this.dpr));
        return;
      }
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
    // A flower's glyphs are laid out once per viewport (it never moves;
    // only the sway shifts it): each a screen point with a factor on the
    // flower's light (negative: a fixed brightness), `side` across the
    // stem and `bend` leaning with the sway. A side offset is a pure shift
    // along the camera's right, side*scale on screen.
    flowerParts(f) {
      if(f.parts&&f.view===this.viewKey) return f.parts;
      const parts=f.parts=[],s=this.projection.scale;
      const part=(char,palette,k,side,y,bend=0)=>{const p=this.project(f.x,f.y+y,f.z);parts.push({g:GI[char],alt:bend?GI['\\']:0,palette,k,x:p.x+side*s,y:p.y,d:p.d,bend});};
      if(!f.ornate) {part('|','grass',-.54,0,.20);part(f.head,f.palette,1,0,f.h);}
      else {
        part('|','moss',.72,0,f.h*.28);
        part('/','moss',.77,0,f.h*.62,.18);
        part('/','grass',.82,-.38,f.h*.38);
        part('\\','grass',.91,.38,f.h*.45);
        if(f.species===0) {
          // Daisy: a warm center, pale side petals and a small upper petal.
          part('o','cream',1,-.65,f.h);part('o','cream',1,.65,f.h);part("'",'cream',1,0,f.h+.50);part('*','ember',.81,0,f.h);
        } else if(f.species===1) {
          // Bell flowers hang from alternate sides of a taller curved stem.
          part('|','moss',.74,0,f.h);part('v','lilac',1,-.55,f.h*.79);part('v','lilac',1,.53,f.h+.20);part("'",'lilac',.92,.25,f.h+.72);
        } else if(f.species===2) {
          part('o','pink',1,-.48,f.h-.13);part('o','pink',1,.48,f.h+.10);part('*','pink',.96,0,f.h+.54);part('v','moss',.88,.20,f.h*.40);
        } else {
          part('+','blue',1,-.58,f.h);part('+','blue',1,.58,f.h);part('*','blue',.96,0,f.h+.48);part('o','cream',.87,0,f.h);
        }
      }
      f.view=this.viewKey;
      return parts;
    }
    drawFlower(f) {
      const sway=Math.sin(this.time*1.1+f.phase)*this.wind*(f.ornate?.32:.22);
      const lit=.63*this.moonlight+.14+f.warm*this.flicker*.30;
      // The sway is a shift along the world's x: on screen that is a slant.
      const q=this.projection,dx=sway*q.cy*q.scale,dy=sway*q.sp*q.sy*q.scale,dd=sway*q.cp*q.sy,at=this.flowerAt||(this.flowerAt={x:0,y:0,d:0}),cull=this.cull;
      for(const p of this.flowerParts(f)) {
        at.x=p.x+dx+p.bend*sway*q.scale;at.y=p.y+dy;at.d=p.d+dd;
        if(cull&&(at.y<cull.top||at.y>cull.bottom)||!this.visible(at)) continue;
        this.glyph(p.alt&&sway<=0?p.alt:p.g,p.palette,p.k<0?-p.k:lit*p.k,at.x,at.y);
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
      const f=this.fire;
      this.drawFire(t);
      for(const spark of this.sparks) {
        const a=spark.age/spark.life;
        this.worldGlyph(a>.5?'.':"'",'ember',.9,f.x+spark.dx+this.wind*a*2,f.y+.8+a*4,f.z,1-a);
      }
      const camp=this.camp;
      this.sprite(SPRITES.tent,camp.tent.x,camp.tent.y+.1,camp.tent.z,'canvas',.9,0,{opaque:true,mask:SPRITES.tentMask,charPalette:{'*':'ember','.':'ember'}});
      this.sprite(['(__)','(==)'],camp.woodpile.x,camp.woodpile.y+.55,camp.woodpile.z,'bark',.77);
      this.sprite([' __','[##]','|__|'],camp.pack.x,camp.pack.y+.12,camp.pack.z,'cloth',.68);
      this.drawBridgeRails();
      // Tiny mushrooms along the quieter western flower bank.
      const shrooms=this.mushrooms||(this.mushrooms=Array.from({length:9},(_,i)=>{const x=-20-hash(i,171)*11,z=24+hash(i,172)*35;return {x,z,y:height(x,z)};}));
      for(const m of shrooms) {
        this.worldGlyph('o','cream',.61,m.x,m.y+.35,m.z);
        this.worldGlyph('|','wood',.37,m.x,m.y+.12,m.z);
      }
      // Animals and people share one far-to-near pass, so whoever stands
      // nearer covers the other; an animal's matte never erases a person.
      const {dog,pony,rabbit}=this.wildlife,{ponyX,rabbitX,rabbitBob}=this.wander(t),fuss=this.ponyFuss;
      const actors=[
        {x:dog.x,y:dog.y,z:dog.z,draw:a=>this.sprite(this.dogSprite(),a.x,a.y,a.z,'deer',.76,this.dogNow.hop,{actor:true,eyePalette:'cream',fireSide:-1,opaque:true})},
        {x:ponyX,y:height(ponyX,pony.z)+.12,z:pony.z,draw:a=>{
          // A fussing pony stamps in place.
          const step=fuss?Math.sin(fuss.age*22)>0:Math.sin(t*.65)>.70;
          this.sprite(step?SPRITES.ponyStep:SPRITES.pony,a.x,a.y,a.z,'deer',.78,0,{actor:true,opaque:true,mask:SPRITES.ponyMask,ponyHead:true});
          if(fuss) this.drawSnort(a,fuss.age);
        }},
        {x:rabbitX,y:height(rabbitX,rabbit.z)+.12,z:rabbit.z,draw:a=>this.sprite(SPRITES.rabbit,a.x,a.y,a.z,'cream',.68,rabbitBob,{actor:true,eyePalette:'deer',opaque:true})},
        ...this.folk.filter(fig=>!fig.hidden).map(fig=>({x:fig.x,y:fig.y,z:fig.z,draw:()=>this.drawFigure(fig)})),
        ...this.fish.map(f=>{const [x,y,z]=this.leapPoint(f,Math.min(1,f.age/f.life));return {x,y,z,draw:()=>this.drawFish(f)};}),
      ];
      for(const a of actors)a.d=this.project(a.x,a.y,a.z).d;
      actors.sort((a,b)=>a.d-b.d);
      for(const a of actors)a.draw(a);
      for(const d of this.drops) this.worldGlyph(d.vy>0?"'":'.','moon',.62,d.x,d.y,d.z,Math.min(1,d.y*2.5));
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
      let intro=this.intro;
      if(intro) {this.stepIntro(dt);intro=this.intro;}
      // The scene's clock runs only while the scene can be seen: not during
      // the hold, and not while a crane has it off the screen (within the
      // band its layer is redrawn in, see below). Otherwise it moved on
      // unseen and leapt ahead when its layer was next drawn: the water and
      // the fire jumped a second as the keep came in (Oct 28 2026).
      const seen=!intro||(intro.phase!=='hold'&&intro.shift<this.H+64);
      if(!this.paused&&!this.reduced&&seen) this.update(dt);
      else if(!this.flicker) { this.flicker=.88;this.wind=.32; }
      if(this.gl&&!this.ctx) {if(!this.gl.begin(this.canvas.width,this.canvas.height,BG_RGB)) return;}
      else this.rect(0,0,this.W,this.H);
      if(intro) {
        // The crane: the sky above scrolls past, and the finished scene is
        // drawn shifted down beneath it. Off screen during the hold, the
        // scene is not drawn at all.
        // The sky above and the scene are two layers, slid past each other
        // at the display's full rate while the crane moves and each redrawn
        // on alternate frames (30 times a second on a 60 Hz display), only
        // within the band the screen can show before its next redraw, and
        // only while it is in view. Both keep animating through the move
        // (Oct 27 2026: Jake wanted them alive; still layers were smooth
        // but dead, and redrawing both every frame overran a phone's
        // frame). The hold draws the sky into its layer each frame, the
        // resting scene its own, so a crane finds both current.
        const gl=this.gl&&!this.ctx?this.gl:null,d=this.dpr,W=this.canvas.width,H=this.canvas.height,T=Math.round(this.space.travel*d),ch=this.ch;
        const sky=gl&&gl.layer('sky',W,T),ground=sky&&gl.layer(this.groundFront,W,H),back=ground&&gl.layer(this.groundBack,W,H);
        if(back&&intro.phase==='hold') {
          this.craneFrame=0;this.groundHalf=0;
          gl.target(sky,BG_RGB);this.drawSpace(intro.clock,-ch,this.H+ch);gl.target(null);
          gl.draw(sky,0,0);
          this.drawHoldCue();
        } else if(back) {
          // While the sky is in view the two share the frames; once it has
          // gone, the scene has both frames of each pair, half a redraw
          // each into its back buffer, shown when both halves are in: its
          // peak halves and its rate does not. The halves are a sequence
          // (`groundHalf`), never a matter of frame parity: keyed to
          // parity, a pair could begin with the second half drawn over a
          // stale back buffer and show two frames of old water (Oct 28).
          const M=64,frame=++this.craneFrame,skyIn=intro.scroll<this.space.travel,groundIn=intro.shift<this.H+M;
          if(skyIn&&(frame&1)) {
            this.cull={top:intro.scroll-M,bottom:intro.scroll+this.H+M};
            gl.target(sky,BG_RGB);this.drawSpace(intro.clock,this.cull.top,this.cull.bottom);gl.target(null);
          } else if(groundIn) {
            this.cull={top:-M,bottom:this.H-intro.shift+M};
            if(skyIn) {
              this.waterPart=this.waterHalf?++this.groundPass&1:-1;this.groundHalf=0;
              gl.target(ground,BG_RGB);this.drawScene();gl.target(null);
            } else if(!this.groundHalf) {
              this.waterPart=this.waterHalf?++this.groundPass&1:-1;
              gl.target(back,BG_RGB);this.drawSceneBase();gl.target(null);this.groundHalf=1;
            } else {
              gl.target(back);this.drawSceneLife();gl.target(null);this.groundHalf=0;
              [this.groundFront,this.groundBack]=[this.groundBack,this.groundFront];
            }
          }
          this.cull=null;this.waterPart=-1;
          gl.draw(sky,0,-Math.round(intro.scroll*d));
          if(intro.shift<this.H) gl.draw(gl.layer(this.groundFront,W,H),0,Math.round(intro.shift*d));
        } else {
          this.shift(-intro.scroll);this.drawSpace(intro.clock,intro.scroll-ch,intro.scroll+this.H+ch);if(intro.phase==='hold') this.drawHoldCue();this.unshift();
          if(intro.shift<this.H) {this.shift(intro.shift);this.drawScene();this.unshift();}
        }
        if(intro.auto&&intro.clock<INTRO.fade) this.rect(0,0,this.W,this.H,1-smooth(0,INTRO.fade,intro.clock));
      } else {
        // The scene at rest draws through its layer, so a crane up finds
        // it current.
        const gl=this.gl&&!this.ctx?this.gl:null,ground=gl&&gl.layer(this.groundFront,this.canvas.width,this.canvas.height);
        this.groundHalf=0;
        if(ground) {gl.target(ground,BG_RGB);this.drawScene();gl.target(null);gl.draw(ground,0,0);}
        else this.drawScene();
        if(!this.reduced) this.drawNav('up',1,this.time);
      }
      if(this.gl&&!this.ctx) this.gl.end(); else this.ctx.globalAlpha=1;
      this.canvas.dataset.renderMs=(performance.now()-started).toFixed(1);
      this.canvas.dataset.drawCalls=this.gl?String(this.gl.calls):'';
      this.canvas.dataset.ripples=String(this.ripples.length);
      this.canvas.dataset.fish=String(this.fish.length);
      this.canvas.dataset.meteors=String(this.meteors.length);
    }
    // The scene in two halves, so a crane can draw them on separate frames:
    // the ground (sky, the still world, the moving cells) and the life on
    // it (meadow, animals, folk, the signpost).
    drawScene() {this.drawSceneBase();this.drawSceneLife();}
    drawSceneBase() {
      if(this.sky!=='plain'&&this.skyRows) this.image(this.hazeCanvas,0,0,this.hazeCanvas.width/this.dpr,this.hazeCanvas.height/this.dpr);
      this.drawSky();this.drawStatic();this.drawWorld();
    }
    drawSceneLife() {
      this.drawMeadow();
      if(this.linkStyle==='sign') this.drawSign(); else this.drawFlyWords();
    }
    // Whoever a tap at px, py lands on, if anyone: the nearest figure or
    // animal under the finger. Each gets an oval around its body (w, h, its
    // centre `up` from the feet), roomy enough for a fingertip.
    actorAt(px,py) {
      const {dog,pony,rabbit}=this.wildlife,{ponyX,rabbitX}=this.wander();
      const near=[
        ...this.folk.filter(fig=>!fig.hidden).map(fig=>({fig,x:fig.x,y:fig.y,z:fig.z,up:12,w:16,h:22})),
        {kind:'dog',x:dog.x,y:dog.y,z:dog.z,up:11,w:20,h:18},
        {kind:'pony',x:ponyX,y:height(ponyX,pony.z)+.12,z:pony.z,up:24,w:30,h:30},
        {kind:'rabbit',x:rabbitX,y:height(rabbitX,rabbit.z)+.12,z:rabbit.z,up:8,w:16,h:16},
      ];
      let best=null,closest=1;
      for(const a of near) {
        const p=this.project(a.x,a.y,a.z),d=Math.hypot((px-p.x)/a.w,(py-p.y+a.up)/a.h);
        if(d<closest) { closest=d; best=a; }
      }
      return best;
    }
    react(a) {
      // The heading that faces the viewer, and the screen's left-right axis
      // on the ground, which a wave is drawn across.
      const fig=a.fig,viewer=Math.atan2(Math.cos(CAMERA.yaw),Math.sin(CAMERA.yaw)),across=[Math.cos(CAMERA.yaw),-Math.sin(CAMERA.yaw)];
      if(a.kind==='dog') this.dogSpin??={age:0};
      else if(a.kind==='pony') this.ponyFuss??={age:0};
      else if(a.kind==='rabbit') {
        const r=this.wildlife.rabbit,off=r.x-r.home;
        this.rabbitHop??={age:0,dir:Math.abs(off)>1?-Math.sign(off):Math.random()<.5?-1:1};
      }
      // The stargazer points out a shooting star.
      else if(fig===this.stargazer) this.spawnMeteor();
      // Busy hands stay busy: the roaster and the angler wave the other one
      // without turning from their work. If the angler was waiting on a
      // bite, one comes just as they look away.
      else if(fig.toast) Folk.greet(fig,across,null,'b');
      else if(fig.rod) { if(Folk.greet(fig,across,null,'b')&&fig.rod.state==='wait') fig.rod.timer=Math.min(fig.rod.timer,2.8); }
      // Everyone else turns to the viewer and waves.
      else Folk.greet(fig,across,viewer);
    }
    tap(px,py) {
      // During the opening a tap only hurries the camera down.
      if(this.intro) {this.advanceIntro();return;}
      // A tap on someone gets a reaction; on the sky, a shooting star from
      // under the finger; on the land, a ring outward through the grass.
      const actor=this.actorAt(px,py);
      if(actor) { this.react(actor); return; }
      if(this.isSky(px,py)) { if(this.meteors.length<8) this.spawnMeteor({x:px,y:py}); return; }
      const p=this.groundAt(px,py);
      this.ripples.push({x:p.x,z:p.z,age:0});
      if(this.ripples.length>5) this.ripples.shift();
    }
    dispose() {
      cancelAnimationFrame(this.raf);
      this.abort.abort();
      this.disposed=true;
      if(this.gl) {this.gl.free(this.staticClip);this.gl.dispose();}
      this.canvas.remove();
      if(this.hazeCanvas) this.hazeCanvas.width=this.hazeCanvas.height=0;
      if(this.meteorAtlas) this.meteorAtlas.canvas.width=this.meteorAtlas.canvas.height=0;
      this.endIntro();
      this.freeSky();
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
    const sky=document.createElement('button'),detail=document.createElement('button'),pause=document.createElement('button'),shower=document.createElement('button'),replay=document.createElement('button');
    sky.textContent='Sky: New';detail.textContent='Detail: Fine';pause.textContent='Pause';shower.textContent='Meteor shower';replay.textContent='Replay intro';
    shower.addEventListener('click',()=>scene.startShower());
    replay.addEventListener('click',()=>{scene.startIntro();scene.render();});
    if(scene.reduced) replay.disabled=true;
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
    tools.append(replay,shower,sky,detail,pause);document.body.appendChild(tools);scene.tools=tools;
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
        // Safari still reads two quick taps as a zoom despite touch-action,
        // and the parked page jolts. Cancelling the second tap's touchend
        // stops that; scene taps run on pointer events, so they still land.
        let lastTouch=-1e9;
        document.addEventListener('touchend',e=>{
          if(e.timeStamp-lastTouch<400&&!e.target.closest('a,button'))e.preventDefault();
          lastTouch=e.timeStamp;
        },{passive:false,signal});
        window.addEventListener('load',park,{signal});
        window.addEventListener('scroll',()=>{if(Math.abs(scrollY-80)>1)park();},{passive:true,signal});
      }
      let down=null;
      if(!scene.reduced) {
        window.addEventListener('pointermove',e=>{
          if(scene.intro) {
            scene.cursor.active=false;
            if(e.pointerType==='mouse') document.body.style.cursor='';
            return;
          }
          scene.cursor={x:e.pageX,y:e.pageY,active:true,ground:scene.groundAt(e.pageX,e.pageY)};
          // A mouse shows who, and what, can be clicked.
          if(e.pointerType==='mouse') document.body.style.cursor=scene.navHit(e.pageX,e.pageY)||scene.actorAt(e.pageX,e.pageY)?'pointer':'';
        },{passive:true,signal});
        window.addEventListener('pointerout',e=>{if(!e.relatedTarget)scene.cursor.active=false;},{signal});
        window.addEventListener('pointerdown',e=>{
          if(down||e.target.closest('a,button')) return;
          down={x:e.pageX,y:e.pageY,t:performance.now(),id:e.pointerId};
        },{signal});
        // At the orrery a tap, a swipe up, a scroll down or a key brings
        // the camera down; in the scene the top chevron, a scroll up or
        // the up arrow key takes it back up.
        window.addEventListener('pointerup',e=>{
          if(!down||e.pointerId!==down.id) return;
          const tap=performance.now()-down.t<350&&Math.hypot(e.pageX-down.x,e.pageY-down.y)<10;
          if(scene.intro) {if(tap||down.y-e.pageY>40) scene.advanceIntro();}
          else if(tap) {if(scene.navHit(e.pageX,e.pageY)) scene.ascend(); else scene.tap(e.pageX,e.pageY);}
          down=null;
        },{signal});
        window.addEventListener('wheel',e=>{if(scene.intro&&e.deltaY>0)scene.advanceIntro();else if(!scene.intro&&e.deltaY<-20)scene.ascend();},{passive:true,signal});
        window.addEventListener('pointercancel',()=>{down=null;scene.cursor.active=false;},{signal});
        window.addEventListener('keydown',e=>{
          if(scene.intro&&(e.key==='Enter'||e.key===' '||e.key==='Escape'||e.key==='ArrowDown'))scene.advanceIntro();
          else if(!scene.intro&&e.key==='ArrowUp')scene.ascend();
        },{signal});
      }
      let last=performance.now(),lastFrame=0;
      // ?stats=1 shows what the display does: its rate, and the last crane's
      // frames, drops (a gap over 1.5 display intervals), worst gap and
      // heaviest frame. For tuning on a phone, where nothing else can look.
      const stats=new URLSearchParams(location.search).get('stats')==='1'?document.createElement('div'):null;
      let stamp=last,gaps=[],crane=null,statsAt=0,craneText='';
      if(stats) {
        // Absolute, below the parked runway: iOS Safari clips fixed boxes.
        stats.style.cssText=`position:absolute;z-index:4;top:calc(var(--runway,0px) + 12px);left:8px;font:11px/1.4 ${FONT};color:#b8c7c2;background:#0b1520c0;padding:6px 8px;border-radius:4px;white-space:pre;pointer-events:none`;
        document.body.appendChild(stats);
      }
      const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1]||0;};
      // The scene runs at 30 frames a second; the crane is a camera move,
      // so while it runs every frame the display offers is drawn.
      const loop=now=>{
        const moving=scene.intro&&scene.intro.phase!=='hold';
        if(!document.hidden&&!scene.paused&&(moving||now-lastFrame>32)) {const dt=Math.min(.08,(now-last)/1000);last=now;lastFrame=now;scene.render(dt);}
        if(stats) {
          const gap=now-stamp;stamp=now;gaps.push(gap);if(gaps.length>240) gaps.shift();
          if(moving) {if(!crane) crane={gaps:[],ms:[]};crane.gaps.push(gap);crane.ms.push(+scene.canvas.dataset.renderMs||0);}
          else if(crane) {
            const interval=median(gaps),dropped=crane.gaps.filter(g=>g>interval*1.5).length,jobs=crane.ms.filter(m=>m>1.5);
            craneText=`last crane: ${crane.gaps.length} frames, ${dropped} dropped, worst gap ${Math.max(...crane.gaps).toFixed(0)} ms\nredraw jobs: ${jobs.length}, median ${median(jobs).toFixed(1)} ms, heaviest ${Math.max(...crane.ms).toFixed(1)} ms`;
            crane=null;
          }
          if(now-statsAt>500) {statsAt=now;stats.textContent=`display ~${Math.round(1000/(median(gaps)||16.7))} Hz, ${scene.canvas.dataset.engine}\n${craneText||'crane: not yet'}`;}
        }
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
