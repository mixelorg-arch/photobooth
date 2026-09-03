/* PHOTOBOOTH.exe — browser build.
 *
 * A working port of the iPad app for testing on a Mac: same flow, same
 * layouts, same composition maths, same look. The parts that cannot exist in
 * a browser are the parts that talk to hardware directly — printing goes
 * through the macOS print dialog instead of AirPrint, and there is no
 * Bluetooth thermal path.
 *
 * Deliberately dependency-free and three files, so it runs off any static
 * server. Camera access needs a secure context: localhost is one, file:// is
 * not — serve it, do not double-click it.
 */
'use strict';

/* ==================================================================== *
 * Pixel icons — the grids are copied verbatim from PixelIcons.swift so
 * the two builds cannot drift apart.
 * ==================================================================== */
const ICONS = {
 eyeball:["................",".....KKKKKK.....","...KK......KK...","..K..........K..",".K....KKKK....K.","K....KWWWWK....K","K...KWWAAWWK...K","K...KWAAAAWK...K","K...KWWAAWWK...K","K....KWWWWK....K",".K....KKKK....K.","..K..........K..","...KK......KK...",".....KKKKKK.....","................"],
 floppy:["................",".KKKKKKKKKKKKKK.",".KWWWWKKKKWWWWK.",".KWKKWKAAKWKKWK.",".KWKKWKAAKWKKWK.",".KWKKWKAAKWKKWK.",".KWWWWKKKKWWWWK.",".KAAAAAAAAAAAAK.",".KAAAAAAAAAAAAK.",".KKWWWWWWWWWWKK.",".KKWKKKKKKKKWKK.",".KKWKKKKKKKKWKK.",".KKWWWWWWWWWWKK.",".KKKKKKKKKKKKKK.","................"],
 cd:[".....KKKKKK.....","...KKWWWWWWKK...","..KWWAAAAAAWWK..",".KWAAAAAAAAAAWK.",".KWAAAAKKAAAAWK.","KWAAAAKWWKAAAAWK","KWAAAKWWWWKAAAWK","KWAAAKWWWWKAAAWK","KWAAAAKWWKAAAAWK","KWAAAAAKKAAAAAWK",".KWAAAAAAAAAAWK.",".KWWAAAAAAAAWWK.","..KKWWWWWWWWKK..","....KKKKKKKK....","................"],
 hourglass:["................",".KKKKKKKKKKKKKK.",".KWWWWWWWWWWWWK.","..KAAAAAAAAAAK..","...KAAAAAAAAK...","....KAAAAAAK....",".....KAAAAK.....","......KAAK......",".....KWAAWK.....","....KWWAAWWK....","...KWAAAAAAWK...","..KWAAAAAAAAWK..",".KWAAAAAAAAAAWK.",".KKKKKKKKKKKKKK.","................"],
 folder:["................","..KKKKK.........",".KYYYYYKKKKKKK..",".KYYYYYYYYYYYK..",".KYYYYYYYYYYYK..",".KYWWWWWWWWWYK..",".KYWYYYYYYYWYK..",".KYWYYYYYYYWYK..",".KYWYYYYYYYWYK..",".KYWWWWWWWWWYK..",".KYYYYYYYYYYYK..",".KKKKKKKKKKKKK..","................"],
 camera:["................","......KKKK......","....KKWWWWKK....",".KKKKKKKKKKKKKK.",".KWWWKKKKKKWRWK.",".KWKKWWWWWWKKWK.",".KWKWWAAAAWWKWK.",".KWKWAAAAAAWKWK.",".KWKWAAAAAAWKWK.",".KWKWWAAAAWWKWK.",".KWKKWWWWWWKKWK.",".KWWWKKKKKKWWWK.",".KKKKKKKKKKKKKK.","................"],
 printer:["................","...KKKKKKKKKK...","...KWWWWWWWWK...","...KWKKKKKKWK...","...KWWWWWWWWK...",".KKKKKKKKKKKKKK.",".KGGGGGGGGGGGAK.",".KGGGGGGGGGGGGK.",".KKKKKKKKKKKKKK.","...KWWWWWWWWK...","...KWAAAAAAWK...","...KWWWWWWWWK...","...KKKKKKKKKK...","................"],
 warning:["................",".......KK.......","......KRRK......","......KRRK......",".....KRRRRK.....",".....KRWWRK.....","....KRRWWRRK....","....KRRWWRRK....","...KRRRWWRRRK...","...KRRRWWRRRK...","..KRRRRRRRRRRK..","..KRRRRWWRRRRK..",".KRRRRRWWRRRRRK.",".KKKKKKKKKKKKKK.","................"],
 info:["................",".....KKKKKK.....","...KKAAAAAAKK...","..KAAAAWWAAAAK..",".KAAAAAWWAAAAAK.",".KAAAAAAAAAAAAK.","KAAAAAWWWAAAAAAK","KAAAAAAWWAAAAAAK","KAAAAAAWWAAAAAAK",".KAAAAAWWAAAAAK.",".KAAAAWWWWAAAAK.","..KAAAAAAAAAAK..","...KKAAAAAAKK...",".....KKKKKK.....","................"],
 star:["................",".......KK.......","......KAAK......","......KAAK......","...KKKKAAKKKK...","...KAAAAAAAAK...","....KAAAAAAK....",".....KAAAAK.....","....KAAAAAAK....","....KAAKKAAK....","...KAAK..KAAK...","...KKK....KKK...","................"],
 check:["................","..............K.",".............KAK","............KAAK","...........KAAK.","..K.......KAAK..",".KAK.....KAAK...",".KAAK...KAAK....","..KAAK.KAAK.....","...KAAKAAK......","....KAAAAK......",".....KAAK.......","......KK........","................"],
 gear:["................","....K.KKKK.K....","....KKAAAAKK....","..KKKAAAAAAKKK..","..KAAAAKKAAAAK..","KKAAAAKWWKAAAAKK","KAAAAAKWWKAAAAAK","KAAAAAKWWKAAAAAK","KKAAAAKWWKAAAAKK","..KAAAAKKAAAAK..","..KKKAAAAAAKKK..","....KKAAAAKK....","....K.KKKK.K....","................"],
};
const LEGEND = {'.':null, K:'#1A1A1A', W:'#FFFFFF', G:'#A6A6A6', D:'#404040',
                R:'#EB1123', Y:'#F5C542', B:'#A9A2CE', S:'#E8B48A'};

function iconCanvas(name, size, accent){
  const grid = ICONS[name] || ICONS.info;
  const rows = grid.length, cols = Math.max(...grid.map(r => r.length));
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1) * 2;
  c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
  c.style.width = size + 'px'; c.style.height = size + 'px';
  const g = c.getContext('2d');
  const cell = Math.min(c.width / cols, c.height / rows);
  const ox = (c.width - cell * cols) / 2, oy = (c.height - cell * rows) / 2;
  grid.forEach((line, r) => [...line].forEach((ch, x) => {
    const fill = ch === 'A' ? accent : LEGEND[ch];
    if (!fill) return;
    g.fillStyle = fill;
    // +0.5 closes the hairline seams between cells at fractional scales.
    g.fillRect(ox + x * cell, oy + r * cell, cell + 0.5, cell + 0.5);
  }));
  return c;
}

function paintIcons(root){
  (root || document).querySelectorAll('.ic[data-icon]').forEach(el => {
    if (el.dataset.painted) return;
    el.dataset.painted = '1';
    el.appendChild(iconCanvas(el.dataset.icon,
                              +(el.dataset.size || 22),
                              el.dataset.accent || '#111111'));
  });
}

/* ==================================================================== *
 * A 5x7 bitmap font, drawn to canvas.
 *
 * The panel look lives or dies on real bitmap type, and there is no pixel
 * face on a stock Mac. So the font is built rather than hunted for — the
 * same decision as the pixel icons above, and it ports to the Swift build
 * unchanged. Uppercase only, which is all this UI ever sets.
 * ==================================================================== */
const GLYPHS = {
 'A':['.###.','#...#','#...#','#####','#...#','#...#','#...#'],
 'B':['####.','#...#','#...#','####.','#...#','#...#','####.'],
 'C':['.###.','#...#','#....','#....','#....','#...#','.###.'],
 'D':['####.','#...#','#...#','#...#','#...#','#...#','####.'],
 'E':['#####','#....','#....','####.','#....','#....','#####'],
 'F':['#####','#....','#....','####.','#....','#....','#....'],
 'G':['.###.','#...#','#....','#.###','#...#','#...#','.###.'],
 'H':['#...#','#...#','#...#','#####','#...#','#...#','#...#'],
 'I':['#####','..#..','..#..','..#..','..#..','..#..','#####'],
 'J':['..###','...#.','...#.','...#.','...#.','#..#.','.##..'],
 'K':['#...#','#..#.','#.#..','##...','#.#..','#..#.','#...#'],
 'L':['#....','#....','#....','#....','#....','#....','#####'],
 'M':['#...#','##.##','#.#.#','#...#','#...#','#...#','#...#'],
 'N':['#...#','##..#','#.#.#','#..##','#...#','#...#','#...#'],
 'O':['.###.','#...#','#...#','#...#','#...#','#...#','.###.'],
 'P':['####.','#...#','#...#','####.','#....','#....','#....'],
 'Q':['.###.','#...#','#...#','#...#','#.#.#','#..#.','.##.#'],
 'R':['####.','#...#','#...#','####.','#.#..','#..#.','#...#'],
 'S':['.####','#....','#....','.###.','....#','....#','####.'],
 'T':['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
 'U':['#...#','#...#','#...#','#...#','#...#','#...#','.###.'],
 'V':['#...#','#...#','#...#','#...#','#...#','.#.#.','..#..'],
 'W':['#...#','#...#','#...#','#...#','#.#.#','##.##','#...#'],
 'X':['#...#','#...#','.#.#.','..#..','.#.#.','#...#','#...#'],
 'Y':['#...#','#...#','.#.#.','..#..','..#..','..#..','..#..'],
 'Z':['#####','....#','...#.','..#..','.#...','#....','#####'],
 '0':['.###.','#...#','#..##','#.#.#','##..#','#...#','.###.'],
 '1':['..#..','.##..','..#..','..#..','..#..','..#..','.###.'],
 '2':['.###.','#...#','....#','...#.','..#..','.#...','#####'],
 '3':['####.','....#','....#','.###.','....#','....#','####.'],
 '4':['...#.','..##.','.#.#.','#..#.','#####','...#.','...#.'],
 '5':['#####','#....','####.','....#','....#','#...#','.###.'],
 '6':['..##.','.#...','#....','####.','#...#','#...#','.###.'],
 '7':['#####','....#','....#','...#.','..#..','..#..','..#..'],
 '8':['.###.','#...#','#...#','.###.','#...#','#...#','.###.'],
 '9':['.###.','#...#','#...#','.####','....#','...#.','.##..'],
 ' ':['.....','.....','.....','.....','.....','.....','.....'],
 ':':['.....','..#..','..#..','.....','..#..','..#..','.....'],
 '.':['.....','.....','.....','.....','.....','..#..','..#..'],
 ',':['.....','.....','.....','.....','..#..','..#..','.#...'],
 '%':['##..#','##.#.','..#..','.#...','#..##','...##','.....'],
 '!':['..#..','..#..','..#..','..#..','..#..','.....','..#..'],
 '?':['.###.','#...#','....#','..##.','..#..','.....','..#..'],
 '-':['.....','.....','.....','#####','.....','.....','.....'],
 '+':['.....','..#..','..#..','#####','..#..','..#..','.....'],
 '_':['.....','.....','.....','.....','.....','.....','#####'],
 '/':['....#','....#','...#.','..#..','.#...','#....','#....'],
 '&':['.##..','#..#.','#.#..','.#...','#.#.#','#..#.','.##.#'],
 "'":['..#..','..#..','.....','.....','.....','.....','.....'],
 '(':['...#.','..#..','.#...','.#...','.#...','..#..','...#.'],
 ')':['.#...','..#..','...#.','...#.','...#.','..#..','.#...'],
 '>':['#....','.#...','..#..','...#.','..#..','.#...','#....'],
 '<':['....#','...#.','..#..','.#...','..#..','...#.','....#'],
 '*':['.....','#.#.#','.###.','#####','.###.','#.#.#','.....'],
 '=':['.....','.....','#####','.....','#####','.....','.....'],
 '@':['.###.','#...#','#.##.','#.#.#','#.###','#....','.###.'],
 'x':['.....','#...#','.#.#.','..#..','.#.#.','#...#','.....'],
};
const GLYPH_W = 5, GLYPH_H = 7;

/* One canvas per string. `cell` is the size of a single font pixel, so the
 * cap height is 7 * cell — that is the only size control there is, which is
 * exactly how a bitmap face should behave. */
function pixelTextCanvas(text, cell, colour){
  const chars = [...String(text).toUpperCase()];
  const gap = Math.max(1, Math.round(cell * 0.8));
  const w = chars.length ? chars.length * (GLYPH_W * cell + gap) - gap : cell;
  const h = GLYPH_H * cell;

  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  c.style.width = w + 'px'; c.style.height = h + 'px';

  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = colour || '#111111';
  chars.forEach((ch, i) => {
    const rows = GLYPHS[ch] || GLYPHS['?'];
    const ox = i * (GLYPH_W * cell + gap);
    rows.forEach((line, y) => [...line].forEach((p, x) => {
      if (p === '#') g.fillRect(ox + x * cell, y * cell, cell, cell);
    }));
  });
  return c;
}

/* Replaces the text of a .px element with its bitmap rendering. The source
 * string is kept in the dataset so the element can be re-set later. */
function setPixel(node, text, cell){
  if (text !== undefined) node.dataset.text = text;
  const source = node.dataset.text !== undefined ? node.dataset.text : node.textContent;
  node.dataset.text = source;
  node.textContent = '';
  node.appendChild(pixelTextCanvas(source, cell || +(node.dataset.cell || 4)));
}

function paintPixelText(root){
  (root || document).querySelectorAll('.px').forEach(node => {
    if (node.dataset.text !== undefined && node.firstElementChild) return;
    setPixel(node);
  });
}

/* ==================================================================== *
 * Media and layouts — ported from LayoutTemplate.swift.
 * ==================================================================== */
const MEDIA = {
  'postcard-4x6': {id:'postcard-4x6', name:'4x6 Postcard (SELPHY)',
                   shortName:'4X6 SELPHY',   w:4,     h:6,     dpi:300},
  'postcard-6x4': {id:'postcard-6x4', name:'6x4 Postcard (landscape)',
                   shortName:'6X4 LANDSCAPE', w:6,    h:4,     dpi:300},
  'a6':           {id:'a6',           name:'A6 (105 x 148 mm)',
                   shortName:'A6',           w:4.134, h:5.827, dpi:300},
  'letter':       {id:'letter',       name:'US Letter (plain paper test)',
                   shortName:'US LETTER',    w:8.5,   h:11,    dpi:200},
};
const mediaPixels = m => ({w: Math.round(m.w * m.dpi), h: Math.round(m.h * m.dpi)});

/* Six layouts, from standard photobooth practice.
 *
 * A layout is pure data. `slots` are unit rects inside the content area, and
 * each carries `src` — the index of the photograph that goes in it. That one
 * field is what makes duplicate strips possible: two slots pointing at the
 * same shot. `shots` is therefore the number of *distinct* sources, not the
 * number of slots.
 *
 * `accent` is the layout's signature colour. It fills the tile when chosen
 * and tints its caption when not, so the six choices are told apart by
 * colour before they are read.
 */
/* Six layouts, dressed like a printed page.
 *
 * A layout is pure data. `slots` are unit rects inside the content area and
 * each carries `src` — the index of the photograph that goes in it, which is
 * what makes duplicate strips possible. `decor` is the editorial layer: hair
 * rules and text runs in unit space over the whole sheet, with `y` as a
 * baseline so type sits on a rule the way it does in print.
 *
 * Tokens in `text`: {event} {caption} {date} {word} {n} {shots} {sub}.
 * {word} is the oversized display word — it is deliberately *not* fitted, so
 * a long one runs off the edge. That overrun is the look, not a bug.
 */
const LAYOUTS = [
  // Full bleed photograph over a deep white foot carrying the display word.
  { id:'one-full', name:'1 SHOT', subtitle:'FULL BLEED', accent:'#9BA3A3',
    slots:[{x:0,y:0,w:1,h:1,src:0}], fit:'fill', mono:true,
    margin:0, gutter:0, radius:0, keyline:0, background:'#FFFFFF',
    footer:0.22, footerColumns:1, cellAspect:null,
    decor:[
      {t:'text', text:'{n}.', x:.955, y:.788, size:.052, weight:800, tracking:-.02, align:'right'},
      {t:'rule', x:.05, y:.805, w:.90, weight:.0022},
      {t:'text', text:'{word}', x:.045, y:.905, size:.175, weight:800, tracking:-.045},
      {t:'text', text:'{caption}', x:.045, y:.948, size:.026, tracking:.22, case:'upper', colour:'dim'},
      {t:'text', text:'{date}', x:.955, y:.948, size:.026, tracking:.12, align:'right', colour:'dim'},
    ] },

  // Polaroid: white margin, deep foot, name and index on one line.
  { id:'one-polaroid', name:'1 SHOT', subtitle:'POLAROID', accent:'#A8BEB2',
    slots:[{x:0,y:0,w:1,h:1,src:0}], fit:'fill', mono:true,
    margin:0.075, gutter:0, radius:0, keyline:0, background:'#FFFFFF',
    footer:0.19, footerColumns:1, cellAspect:null,
    decor:[
      {t:'rule', x:.085, y:.845, w:.83, weight:.002},
      {t:'text', text:'{event}', x:.08, y:.905, size:.072, weight:800, tracking:-.02, fit:.62},
      {t:'text', text:'{n}.',    x:.92, y:.905, size:.072, weight:800, tracking:-.02, align:'right'},
      {t:'text', text:'{caption}', x:.08, y:.948, size:.024, tracking:.2, case:'upper', colour:'dim'},
      {t:'text', text:'{date}',  x:.92, y:.948, size:.024, tracking:.12, align:'right', colour:'dim'},
    ] },

  // Two landscape frames over a foot with the display word.
  { id:'two-stack', name:'2 SHOTS', subtitle:'STACKED', accent:'#A9A2CE',
    slots:[{x:0,y:0,w:1,h:0.5,src:0},{x:0,y:0.5,w:1,h:0.5,src:1}], fit:'fill', mono:true,
    margin:0.06, gutter:0.028, radius:0, keyline:0, background:'#FFFFFF',
    footer:0.175, footerColumns:1, cellAspect:3/2,
    decor:[
      {t:'text', text:'{n}.', x:.95, y:.831, size:.042, weight:800, tracking:-.02, align:'right'},
      {t:'rule', x:.055, y:.845, w:.89, weight:.0022},
      {t:'text', text:'{word}', x:.05, y:.928, size:.130, weight:800, tracking:-.04},
      {t:'text', text:'{caption}', x:.95, y:.965, size:.024, tracking:.2, case:'upper',
       align:'right', colour:'dim'},
      {t:'text', text:'{date}', x:.05, y:.965, size:.024, tracking:.12, colour:'dim'},
    ] },

  // Four portrait frames, two by two.
  { id:'four-grid', name:'4 SHOTS', subtitle:'GRID', accent:'#C97F7F',
    slots:[{x:0,y:0,w:.5,h:.5,src:0},{x:.5,y:0,w:.5,h:.5,src:1},
           {x:0,y:.5,w:.5,h:.5,src:2},{x:.5,y:.5,w:.5,h:.5,src:3}], fit:'fill', mono:true,
    margin:0.055, gutter:0.026, radius:0, keyline:0, background:'#FFFFFF',
    footer:0.175, footerColumns:1, cellAspect:2/3,
    decor:[
      {t:'rule', x:.05, y:.840, w:.90, weight:.0022},
      {t:'text', text:'{event}', x:.048, y:.918, size:.092, weight:800, tracking:-.03, fit:.60},
      {t:'text', text:'{n}.',    x:.952, y:.918, size:.092, weight:800, tracking:-.03, align:'right'},
      {t:'text', text:'{caption}', x:.048, y:.960, size:.024, tracking:.2, case:'upper', colour:'dim'},
      {t:'text', text:'{date}',  x:.952, y:.960, size:.024, tracking:.12, align:'right', colour:'dim'},
    ] },

  // The classic: two identical 2x6 strips on one 4x6, cut down the middle.
  // Hairline frames instead of a black rail — the reference is white paper.
  { id:'four-strip-duo', name:'4 SHOTS', subtitle:'DOUBLE STRIP', accent:'#A9A2CE',
    slots:[{x:0,   y:0,   w:.5,h:.25,src:0},{x:0.5,y:0,   w:.5,h:.25,src:0},
           {x:0,   y:.25, w:.5,h:.25,src:1},{x:0.5,y:.25, w:.5,h:.25,src:1},
           {x:0,   y:.5,  w:.5,h:.25,src:2},{x:0.5,y:.5,  w:.5,h:.25,src:2},
           {x:0,   y:.75, w:.5,h:.25,src:3},{x:0.5,y:.75, w:.5,h:.25,src:3}],
    fit:'fill', mono:true,
    margin:0.05, gutter:0.026, radius:0, keyline:0.0022, keylineColour:'#111111',
    background:'#FFFFFF',
    footer:0.135, footerColumns:2, cellAspect:3/2,
    decor:[
      {t:'rule', x:.10, y:.878, w:.80, weight:.004},
      {t:'text', text:'{event}', x:.10, y:.926, size:.058, weight:800, tracking:.02,
       case:'upper', fit:.80},
      {t:'text', text:'{date}',  x:.10, y:.962, size:.030, tracking:.16, colour:'dim'},
      {t:'text', text:'{n}.',    x:.90, y:.962, size:.030, weight:700, tracking:.1,
       align:'right', colour:'dim'},
    ] },

  // Contact sheet: six landscape frames, 2 x 3.
  { id:'six-grid', name:'6 SHOTS', subtitle:'CONTACT SHEET', accent:'#9BA3A3',
    slots:[{x:0,y:0,      w:.5,h:1/3,src:0},{x:.5,y:0,      w:.5,h:1/3,src:1},
           {x:0,y:1/3,    w:.5,h:1/3,src:2},{x:.5,y:1/3,    w:.5,h:1/3,src:3},
           {x:0,y:2/3,    w:.5,h:1/3,src:4},{x:.5,y:2/3,    w:.5,h:1/3,src:5}],
    fit:'fill', mono:true,
    margin:0.055, gutter:0.022, radius:0, keyline:0, background:'#FFFFFF',
    footer:0.155, footerColumns:1, cellAspect:3/2,
    decor:[
      {t:'text', text:'{n}.', x:.952, y:.848, size:.038, weight:800, tracking:-.02, align:'right'},
      {t:'rule', x:.05, y:.862, w:.90, weight:.0022},
      {t:'text', text:'{word}', x:.048, y:.942, size:.115, weight:800, tracking:-.04},
      {t:'text', text:'{caption}', x:.048, y:.976, size:.022, tracking:.2, case:'upper', colour:'dim'},
      {t:'text', text:'{date}', x:.952, y:.976, size:.022, tracking:.14, align:'right', colour:'dim'},
    ] },
];

// Distinct photographs a layout needs. Derived, never hand-written: a slot
// list and a shot count that disagree is a bug waiting to happen.
LAYOUTS.forEach(l => {
  l.shots = new Set(l.slots.map(s => s.src)).size;
});

const layoutById = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

/* ==================================================================== *
 * The renderer — a direct port of PhotoLayoutRenderer.swift. The preview
 * on screen and the sheet that reaches the printer are the same canvas,
 * so a tile can never disagree with the paper.
 * ==================================================================== */
function renderSheet(photos, tpl, media, branding, scale, opts){
  const px = mediaPixels(media);
  const W = Math.round(px.w * (scale || 1)), H = Math.round(px.h * (scale || 1));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = tpl.background;
  g.fillRect(0, 0, W, H);

  const short = Math.min(W, H), long = Math.max(W, H);
  const margin = tpl.margin * short;
  const footer = tpl.footer * long;

  // Content is the sheet inside the margin, with the footer strip taken off
  // the bottom.
  const content = {
    x: margin, y: margin,
    w: W - margin * 2,
    h: H - margin - Math.max(margin, footer),
  };

  drawSlots(g, content, photos, tpl, short, opts || {});

  // The editorial layer: rules and type, placed against the paper edge like
  // a magazine rather than inside the photo grid. A duplicate-strip sheet
  // draws it once per strip, because each half is cut off and leaves on its
  // own.
  const columns = Math.max(1, tpl.footerColumns || 1);
  for (let i = 0; i < columns; i++) {
    drawDecor(g, {x: (W / columns) * i, y: 0, w: W / columns, h: H},
              tpl, branding);
  }
  return c;
}

function drawSlots(g, content, photos, tpl, short, opts){
  const gutter = tpl.gutter * short;
  const radius = tpl.radius * short;
  const keyline = (tpl.keyline || 0) * short;

  tpl.slots.forEach((unit, i) => {
    // Which photograph this slot shows. Two slots may share one source —
    // that is exactly how a double strip works.
    const src = unit.src === undefined ? i : unit.src;
    let r = {
      x: content.x + unit.x * content.w,
      y: content.y + unit.y * content.h,
      w: unit.w * content.w,
      h: unit.h * content.h,
    };
    // The gutter is paid for out of each slot, halved on interior edges so
    // the outer margin stays exactly tpl.margin.
    if (unit.w < 1) { r.x += gutter / 2; r.w -= gutter; }
    if (unit.h < 1) { r.y += gutter / 2; r.h -= gutter; }
    if (tpl.cellAspect) r = fitted(tpl.cellAspect, r);
    if (r.w < 1 || r.h < 1) return;

    g.save();
    g.beginPath();
    if (radius > 0 && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, radius);
    else g.rect(r.x, r.y, r.w, r.h);
    g.clip();

    const photo = photos[src];
    if (photo) {
      // The reference is entirely monochrome, and the type only reads
      // against a grey photograph. Per layout, overridable in Admin.
      const mono = opts.mono !== undefined ? opts.mono : tpl.mono;
      if (mono) g.filter = 'grayscale(1) contrast(1.06)';
      drawCovering(g, photo, r, tpl.fit);
      g.filter = 'none';
    } else {
      // Empty well — a frame still to come. Numbered only where a preview
      // asks for it; a number must never be able to reach paper.
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(r.x, r.y, r.w, r.h);
      if (opts.numberEmptySlots) {
        g.fillStyle = isDark(tpl.background) ? 'rgba(255,255,255,0.35)'
                                             : 'rgba(0,0,0,0.28)';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '900 ' + Math.round(Math.min(r.w, r.h) * 0.42) +
                 'px ui-monospace, Menlo, monospace';
        g.fillText(String(src + 1), r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    g.restore();

    // Keyline last, so it sits over the photograph's edge rather than under.
    if (keyline > 0) {
      g.save();
      g.strokeStyle = tpl.keylineColour || '#FFFFFF';
      g.lineWidth = keyline;
      g.beginPath();
      if (radius > 0 && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, radius);
      else g.rect(r.x, r.y, r.w, r.h);
      g.stroke();
      g.restore();
    }
  });
}

/* Largest rect of the given width:height ratio, centred in bounds. */
function fitted(aspect, b){
  let w = b.w, h = w / aspect;
  if (h > b.h) { h = b.h; w = h * aspect; }
  return {x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h};
}

function drawCovering(g, src, r, fit){
  const sw = src.width || src.videoWidth, sh = src.height || src.videoHeight;
  if (!sw || !sh) return;
  const scale = fit === 'fit' ? Math.min(r.w / sw, r.h / sh)
                              : Math.max(r.w / sw, r.h / sh);
  const dw = sw * scale, dh = sh * scale;
  g.drawImage(src, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
}

const brandingHasContent = b =>
  !!(b && ((b.event || '').trim() || (b.caption || '').trim() || b.date));

/* ------------------------------------------------------------------ *
 * The editorial layer.
 *
 * Decoration is data, exactly like the slots: a list of rules and text runs
 * in unit space over the sheet (or over one strip). That keeps the magazine
 * dressing out of the renderer — a new treatment is a value in the layout,
 * not a branch in here.
 *
 * `y` is a text baseline, not a box top, so type sits *on* a rule the way it
 * does on a printed page.
 * ------------------------------------------------------------------ */
const INK = '#111111';

function resolveToken(text, branding, tpl){
  return String(text)
    .replace(/\{event\}/g,   (branding.event   || '').trim())
    .replace(/\{caption\}/g, (branding.caption || '').trim())
    .replace(/\{date\}/g,    branding.date ? dateStamp() : '')
    .replace(/\{n\}/g,       String(branding.sequence || 1).padStart(3, '0'))
    // No subtitle fallback: an unconfigured booth prints nothing here
    // rather than the layout's own name on a guest's souvenir.
    .replace(/\{word\}/g,    ((branding.word || branding.event) || '').trim())
    .replace(/\{shots\}/g,   String(tpl.shots))
    .replace(/\{sub\}/g,     tpl.subtitle)
    .trim();
}

function drawDecor(g, region, tpl, branding){
  const items = tpl.decor || [];
  const W = region.w, H = region.h;

  for (const item of items) {
    if (item.t === 'rule') {
      g.fillStyle = item.colour === 'paper' ? '#FFFFFF' : INK;
      g.globalAlpha = item.opacity === undefined ? 1 : item.opacity;
      g.fillRect(region.x + item.x * W, region.y + item.y * H,
                 item.w * W, Math.max(1, (item.weight || 0.0018) * W));
      g.globalAlpha = 1;
      continue;
    }

    const text = resolveToken(item.text, branding, tpl);
    if (!text) continue;
    drawRun(g, item.case === 'upper' ? text.toUpperCase() : text, {
      x: region.x + item.x * W,
      y: region.y + item.y * H,
      size: item.size * W,
      tracking: (item.tracking || 0) * item.size * W,
      weight: item.weight || 400,
      align: item.align || 'left',
      colour: item.colour === 'paper' ? '#FFFFFF'
            : item.colour === 'dim' ? 'rgba(17,17,17,0.45)' : INK,
      // Without a limit the display word runs off the edge on purpose —
      // that is the look. With one it shrinks to fit instead.
      maxWidth: item.fit ? item.fit * W : null,
    });
  }
}

/* One text run, drawn character by character so letter-spacing is identical
 * in every browser and matches the Swift build's `.kern`. `ctx.letterSpacing`
 * would be shorter but is not old enough to rely on. */
function drawRun(g, text, o){
  const chars = [...text];
  const face = ' "Helvetica Neue", Helvetica, Arial, sans-serif';
  const font = s => (o.weight >= 800 ? '800 ' : o.weight >= 700 ? '700 ' : '400 ') + s + 'px' + face;

  const measure = s => {
    g.font = font(s);
    let w = 0;
    for (const ch of chars) w += g.measureText(ch).width;
    return w + (o.tracking * (s / o.size)) * Math.max(0, chars.length - 1);
  };

  let size = o.size;
  if (o.maxWidth) {
    while (size > 4 && measure(size) > o.maxWidth) size -= Math.max(1, size * 0.04);
  }
  const total = measure(size);
  const tracking = o.tracking * (size / o.size);

  let x = o.x;
  if (o.align === 'right')  x = o.x - total;
  if (o.align === 'centre') x = o.x - total / 2;

  g.font = font(size);
  g.fillStyle = o.colour;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (const ch of chars) {
    g.fillText(ch, x, o.y);
    x += g.measureText(ch).width + tracking;
  }
}

function isDark(hex){
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 0.5;
}

function dateStamp(d){
  const t = d || new Date(), p = n => String(n).padStart(2, '0');
  return p(t.getDate()) + '.' + p(t.getMonth() + 1) + '.' + t.getFullYear();
}

/* ==================================================================== *
 * Settings — the same shape as AppSettings.swift, in localStorage.
 * Saved values are merged over the defaults rather than replacing them,
 * so adding a field never wipes what the operator had set.
 * ==================================================================== */
const DEFAULTS = {
  cameraId: '',            // '' = whichever camera the browser gives us
  mirrorPreview: true,
  countdownSeconds: 3,
  betweenShotsSeconds: 1.5,
  defaultCopies: 1,
  maxCopies: 10,
  mediaID: 'postcard-4x6',
  guestLayoutIDs: ['one-full', 'one-polaroid', 'two-stack',
                   'four-grid', 'four-strip-duo', 'six-grid'],
  eventName: '',
  printCaption: '',
  printDate: true,
  /// The oversized display word. Falls back to the event name.
  printWord: '',
  /// Running sheet number, printed as "003.". Increments on every print.
  sheetCounter: 1,
  /// Photographs are monochrome to match the print design. MONO or COLOUR.
  photoTone: 'mono',
  idleReturnSeconds: 90,
  thankYouSeconds: 6,
  adminPasscode: '1234',
};
const STORE_KEY = 'photobooth.settings.v1';

let settings = loadSettings();
function loadSettings(){
  let merged;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    merged = Object.assign({}, DEFAULTS, saved);
  } catch { merged = Object.assign({}, DEFAULTS); }

  // A saved layout list can name layouts that no longer exist — the first
  // six-layout build renamed 'four-full' to 'four-grid'. Drop what is gone,
  // and if anything was dropped fall back to the full default list rather
  // than leaving the operator with one tile and no way to guess why.
  const known = new Set(LAYOUTS.map(l => l.id));
  const kept = (merged.guestLayoutIDs || []).filter(id => known.has(id));
  merged.guestLayoutIDs = kept.length === (merged.guestLayoutIDs || []).length && kept.length
    ? kept
    : DEFAULTS.guestLayoutIDs.slice();

  return merged;
}
function saveSettings(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
}
const currentMedia = () => MEDIA[settings.mediaID] || MEDIA['postcard-4x6'];
const guestLayouts = () => {
  const found = settings.guestLayoutIDs
    .map(id => LAYOUTS.find(l => l.id === id))
    .filter(Boolean);
  return found.length ? found : LAYOUTS;
};
const branding = () => ({
  event: settings.eventName,
  caption: settings.printCaption,
  date: settings.printDate,
  word: settings.printWord,
  // The "003." on the sheet. A real running count across the event, which is
  // what makes it read as a print run rather than decoration.
  sequence: settings.sheetCounter,
});

/* ==================================================================== *
 * Camera
 * ==================================================================== */
const video = document.getElementById('video');
const camMsg = document.getElementById('cam-msg');
let stream = null;

async function startCamera(){
  if (stream) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamError('This browser will not give a page the camera.\n\n' +
                 'Camera access needs a secure context — open the booth over ' +
                 'http://localhost, not as a file:// document.');
    return false;
  }
  const constraints = {
    audio: false,
    video: settings.cameraId
      ? {deviceId: {exact: settings.cameraId}, width: {ideal: 1920}, height: {ideal: 1080}}
      : {facingMode: 'user', width: {ideal: 1920}, height: {ideal: 1080}},
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // A saved camera that has been unplugged must not dead-end the booth.
    if (settings.cameraId) {
      settings.cameraId = ''; saveSettings();
      try { stream = await navigator.mediaDevices.getUserMedia({audio:false, video:true}); }
      catch (e2) { showCamError(cameraMessage(e2)); return false; }
    } else {
      showCamError(cameraMessage(err));
      return false;
    }
  }
  video.srcObject = stream;
  camMsg.hidden = true;
  try { await video.play(); } catch {}
  return true;
}

function cameraMessage(err){
  const name = err && err.name;
  if (name === 'NotAllowedError')
    return 'Camera access was refused.\n\nAllow it for this site in Safari ›\n' +
           'Settings for This Website, or in Chrome\'s address-bar camera icon,\nthen press START again.';
  if (name === 'NotFoundError') return 'No camera was found on this Mac.';
  if (name === 'NotReadableError')
    return 'The camera is busy.\n\nAnother app (Zoom, Photo Booth, another tab)\nhas it open — quit that first.';
  return 'The camera could not be opened.\n\n' + (err && err.message ? err.message : '');
}

function showCamError(text){
  camMsg.textContent = text;
  camMsg.hidden = false;
}

function stopCamera(){
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
  stream = null;
  video.srcObject = null;
}

/* Grabs the current frame at the camera's own resolution.
 * Never mirrored — a mirrored print reverses every logo in the room, even
 * though the preview is mirrored so people can pose. */
function grabFrame(){
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(video, 0, 0, w, h);
  return c;
}

/* ==================================================================== *
 * Session — the flow machine from SessionState.swift.
 * ==================================================================== */
const session = {
  step: 'attract',
  /* Fixed length: one entry per *distinct* shot the layout needs, null until
     it has been taken. An array that grows as photos arrive cannot express
     "frame 3 is being redone", which is the whole point of per-frame retake. */
  photos: [],
  /* Slot indices the guest has marked for a retake, on the review screen. */
  marks: new Set(),
  layout: LAYOUTS[0],
  copies: settings.defaultCopies,
  sheet: null,
  captureToken: 0,
  idleTimer: null,
  thankYouTimer: null,
};

const el = sel => document.querySelector(sel);

/* A stage too narrow to put two panes side by side — a phone held upright.
 * Mirrors `Panel.Size.compact` in the Swift build, same 700px line. */
function compactStage(){ return window.innerWidth < 700; }
const screens = {};
document.querySelectorAll('.screen').forEach(s => screens[s.dataset.screen] = s);

const TASK_LABELS = {
  attract:  ['PHOTOBOOTH', 'READY'],
  layout:   ['LAYOUT',     'STEP 1/4'],
  capture:  ['CAPTURE',    'STEP 1/4'],
  review:   ['REVIEW',     'STEP 2/4'],
  copies:   ['COPIES',     'STEP 3/4'],
  confirm:  ['PRINT',      'STEP 4/4'],
  printing: ['SPOOLER',    'BUSY'],
  thankyou: ['PHOTOBOOTH', 'DONE'],
  failed:   ['PHOTOBOOTH', 'ERROR'],
  admin:    ['CONTROL',    'OPERATOR'],
};

function updateShotCount(){
  const label = retaking
    ? 'RETAKING ' + Math.max(1, shotIndex)
    : (session.layout.shots > 1
        ? 'SHOT ' + Math.max(1, shotIndex) + ' OF ' + session.layout.shots
        : 'SINGLE SHOT');
  setPixel(el('#cap-count'), label, 3);
}

function go(step){
  session.step = step;
  Object.entries(screens).forEach(([name, node]) => node.hidden = (name !== step));
  const [left, right] = TASK_LABELS[step] || ['PHOTOBOOTH', ''];
  setPixel(el('#task-left'), left, 3);
  setPixel(el('#task-right'), right, 3);
  // The back arrow is the ✕ of this language: present only inside a session.
  el('#hdr-back').hidden = (step === 'attract');
  if (step === 'capture') updateShotCount();
  restartIdle();
}

function restartIdle(){
  clearTimeout(session.idleTimer);
  // The attract screen is the resting state; it does not time out, and the
  // operator console must not reset under someone who is typing in it.
  if (session.step === 'attract' || session.step === 'admin') return;
  if (!settings.idleReturnSeconds) return;
  session.idleTimer = setTimeout(() => {
    if (session.step !== 'attract' && session.step !== 'admin') abandon();
  }, settings.idleReturnSeconds * 1000);
}

function begin(){
  keepAwake();
  session.photos = [];
  session.marks.clear();
  session.sheet = null;
  session.copies = settings.defaultCopies;
  buildLayoutTiles();
  go('layout');
  // Warm the camera one screen early so the countdown never starts against
  // a black preview.
  startCamera();
}

function chooseLayout(tpl){
  session.layout = tpl;
  session.photos = new Array(tpl.shots).fill(null);
  session.marks.clear();
  session.sheet = null;
  go('capture');
  runCaptureSequence();
}

function abandon(){
  session.captureToken++;
  clearTimeout(session.idleTimer);
  clearTimeout(session.thankYouTimer);
  session.photos = [];
  session.marks.clear();
  session.sheet = null;
  session.copies = settings.defaultCopies;
  stopCamera();
  go('attract');
}

/// Re-shoot the marked frames, or the whole set when nothing is marked.
///
/// Only the marked slots are cleared: everything else stays exactly as it
/// was, so a guest redoing one bad frame does not lose the three good ones.
function retake(){
  const targets = session.marks.size
    ? [...session.marks].sort((a, b) => a - b)
    : session.photos.map((_, i) => i);

  targets.forEach(i => { session.photos[i] = null; });
  session.marks.clear();
  session.sheet = null;
  go('capture');
  runCaptureSequence(targets);
}

/* ==================================================================== *
 * Capture sequence
 * ==================================================================== */
let shotIndex = 0;
let retaking = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/// Shoots the given slots in order. Defaults to the whole set.
///
/// `shotIndex` is the *slot* being filled, not a running count, so a retake
/// of frame 3 says "RETAKE 3" and lands back in frame 3.
async function runCaptureSequence(targets){
  const token = ++session.captureToken;
  const slots = (targets && targets.length)
    ? targets
    : session.photos.map((_, i) => i);
  const isRetake = slots.length < session.photos.length;

  // Set before awaiting the camera: `go('capture')` has already painted the
  // header, and a frame of "SHOT 1 OF 4" above a retake of frame 2 is worse
  // than a frame of nothing.
  retaking = isRetake;
  shotIndex = slots[0] + 1;
  updateShotCount();

  const ok = await startCamera();
  applyGuide();
  buildShotStrip();
  if (!ok) return;                     // the camera message is already up

  for (let i = 0; i < slots.length; i++) {
    if (token !== session.captureToken) return;
    shotIndex = slots[i] + 1;
    retaking = isRetake;
    buildShotStrip();
    updateShotCount();

    await countdown(token);
    if (token !== session.captureToken) return;

    fireFlash();
    const frame = grabFrame();
    if (frame) session.photos[slots[i]] = frame;
    buildShotStrip();

    if (i < slots.length - 1) await sleep(settings.betweenShotsSeconds * 1000);
  }

  if (token !== session.captureToken) return;
  shotIndex = 0;
  retaking = false;
  compose();
  showReview();
}

async function countdown(token){
  const osd = el('#countdown-osd');
  const total = settings.countdownSeconds;
  setPixel(el('#cd-shot'), retaking
    ? 'RETAKING ' + shotIndex
    : (session.layout.shots > 1
        ? 'SHOT ' + shotIndex + ' OF ' + session.layout.shots : 'ONE SHOT'), 2);
  osd.hidden = false;

  // Deliberately small: the numeral sits in the corner of the preview so the
  // guest keeps sight of their own face for the whole count.
  const cell = compactStage() ? 6 : 8;

  for (let n = total; n >= 1; n--) {
    if (token !== session.captureToken) { osd.hidden = true; return; }
    setPixel(el('#cd-number'), String(n), cell);
    setBars('#cd-bars', n / total, 16);
    await sleep(1000);
  }
  osd.hidden = true;
}

function fireFlash(){
  const f = el('#flash');
  f.classList.remove('fire');
  void f.offsetWidth;                  // restart the animation
  f.classList.add('fire');
}

function setBars(sel, fraction, blocks, tint){
  const host = el(sel);
  // Bars take the chosen layout's colour, so the accent the guest picked on
  // screen 1 follows them through the countdown and the print.
  host.style.setProperty('--bar', tint || session.layout.accent);
  const n = blocks || 24;
  if (host.childElementCount !== n) {
    host.innerHTML = Array.from({length: n}, () => '<i></i>').join('');
  }
  const filled = Math.round(n * Math.max(0, Math.min(1, fraction)));
  [...host.children].forEach((b, i) => b.classList.toggle('on', i < filled));
}

function applyGuide(){
  const guide = el('#guide');
  const aspect = session.layout.cellAspect;
  if (!aspect) { guide.hidden = true; return; }
  guide.hidden = false;
  guide.style.aspectRatio = aspect;
}

function buildShotStrip(){
  const host = el('#shotstrip');
  host.innerHTML = '';
  for (let i = 0; i < session.layout.shots; i++) {
    const b = document.createElement('i');
    if (i + 1 === shotIndex) b.className = 'live';
    else if (session.photos[i]) b.className = 'done';
    b.style.setProperty('--cell', session.layout.accent);
    host.appendChild(b);
  }
}

function compose(){
  session.sheet = renderSheet(session.photos, session.layout,
                              currentMedia(), branding(), 1,
                              {mono: settings.photoTone !== 'colour'});
}

/* ==================================================================== *
 * Screens
 * ==================================================================== */
function buildLayoutTiles(){
  const host = el('#layout-tiles');
  host.innerHTML = '';
  guestLayouts().forEach(tpl => {
    const tile = document.createElement('button');
    tile.className = 'tile';
    // The layout's signature colour. Fills the tile when chosen, tints the
    // caption rule when not — six choices are told apart by colour before
    // anyone reads them.
    tile.style.setProperty('--accent', tpl.accent);

    const pv = document.createElement('div');
    pv.className = 'pv';
    pv.appendChild(renderSheet([], tpl, currentMedia(), branding(), 0.24,
                               {numberEmptySlots: true,
                                mono: settings.photoTone !== 'colour'}));

    const cap = document.createElement('div');
    cap.className = 'cap';
    const name = document.createElement('span'); name.className = 'px';
    const dash = document.createElement('span'); dash.className = 'lead';
    const sub  = document.createElement('span'); sub.className = 'px';
    cap.append(name, dash, sub);

    tile.append(pv, cap);
    setPixel(name, tpl.name, 4);
    setPixel(sub, tpl.subtitle, 3);

    tile.addEventListener('click', () => {
      host.querySelectorAll('.tile').forEach(t => t.classList.remove('sel'));
      tile.classList.add('sel');
      setTimeout(() => chooseLayout(tpl), 120);
    });
    host.appendChild(tile);
  });
}

function showReview(){
  const host = el('#review-sheet');
  host.innerHTML = '';
  host.appendChild(session.sheet);

  setPixel(el('#review-caption'),
           session.layout.shots === 1 ? '1 SHOT' : session.layout.shots + ' SHOTS', 3);

  const thumbs = el('#review-thumbs');
  thumbs.innerHTML = '';
  session.photos.forEach((photo, index) => {
    const cell = document.createElement('button');
    cell.className = 't';
    cell.dataset.slot = index;

    const t = document.createElement('canvas');
    t.className = 'shot'; t.width = 256; t.height = 256;
    if (photo) drawCovering(t.getContext('2d'), photo, {x:0, y:0, w:256, h:256}, 'fill');

    const n = document.createElement('span'); n.className = 'px';
    const mark = document.createElement('span'); mark.className = 'mark';

    cell.append(t, mark, n);
    thumbs.appendChild(cell);
    setPixel(n, String(index + 1), 3);

    // Tap a frame to mark it for a retake. Tapping again unmarks it, so a
    // mis-tap costs nothing — which matters when the control is a
    // photograph of your own face.
    cell.addEventListener('click', () => {
      if (session.marks.has(index)) session.marks.delete(index);
      else session.marks.add(index);
      cell.classList.toggle('marked', session.marks.has(index));
      updateRetakeButton();
      restartIdle();
    });
  });

  updateRetakeButton();
  go('review');
}

/// The one button says what it will actually do. With nothing marked it
/// re-shoots everything; with frames marked it re-shoots only those.
function updateRetakeButton(){
  const count = session.marks.size;
  setPixel(el('[data-act="retake"] .px'),
           count === 0 ? 'RETAKE ALL'
                       : (count === 1 ? 'REDO 1 SHOT' : 'REDO ' + count + ' SHOTS'), 4);
  setPixel(el('#review-hint'),
           count === 0 ? 'TAP A PHOTO TO REDO JUST THAT ONE' : 'TAP AGAIN TO UNMARK', 3);
}

function showCopies(){
  updateCopies();
  el('[data-screen="copies"] .mod').style.setProperty('--accent', session.layout.accent);
  go('copies');
}

function updateCopies(){
  setPixel(el('#copies-count'), String(session.copies), 14);
  setPixel(el('#copies-word'), session.copies === 1 ? '1 PRINT' : session.copies + ' PRINTS', 3);
  el('#copies-warn').hidden = session.copies < settings.maxCopies;
  el('[data-act="copies-down"]').disabled = session.copies <= 1;
  el('[data-act="copies-up"]').disabled = session.copies >= settings.maxCopies;
}

function showConfirm(){
  compose();
  const host = el('#confirm-sheet');
  host.innerHTML = '';
  host.appendChild(session.sheet);

  const media = currentMedia();
  const px = mediaPixels(media);
  // A phone stage has room for the essentials only. Sheet size and printer
  // are operator detail; layout, paper and copies are what a guest is being
  // asked to confirm.
  const rows = compactStage()
    ? [['LAYOUT', session.layout.name + ' / ' + session.layout.subtitle],
       ['PAPER',  media.shortName],
       ['COPIES', session.copies === 1 ? '1 PRINT' : session.copies + ' PRINTS']]
    : [['LAYOUT',  session.layout.name + ' / ' + session.layout.subtitle],
       ['PAPER',   media.shortName],
       ['SHEET',   px.w + 'x' + px.h + ' / ' + media.dpi + ' DPI'],
       ['COPIES',  session.copies === 1 ? '1 PRINT' : session.copies + ' PRINTS'],
       ['PRINTER', 'MACOS DIALOG']];
  const spec = el('#confirm-spec');
  spec.innerHTML = '';
  rows.forEach(([key, value]) => {
    const r = document.createElement('div'); r.className = 'r';
    const k = document.createElement('span'); k.className = 'k px';
    const lead = document.createElement('span'); lead.className = 'lead';
    const v = document.createElement('span'); v.className = 'v px';
    r.append(k, lead, v);
    spec.appendChild(r);
    setPixel(k, key, 3);
    setPixel(v, value, 3);
  });

  setPixel(el('#print-btn').querySelector('.px'),
           session.copies === 1 ? 'PRINT' : 'PRINT ' + session.copies, 5);
  go('confirm');
}

/* ==================================================================== *
 * Printing
 *
 * The booth prints silently: press PRINT and paper comes out. No dialog.
 *
 * There is no web API for that — `window.print()` always raises the system
 * dialog, deliberately, and no page can suppress it. The one real way is to
 * launch Chrome with `--kiosk-printing`, which makes every `print()` go
 * straight to the default printer with no window at all. `kiosk-chrome.sh`
 * does exactly that; see the README.
 *
 * Run without that flag (Safari, or plain Chrome) and the dialog appears —
 * fine for testing, wrong for an event. `PRINT MODE` in the operator console
 * says which one you are in, so nobody discovers it mid-party.
 *
 * The page box is set to the media size either way, so the sheet is at true
 * size whether the dialog appears or not. Copies are N identical pages
 * rather than a copy count, the same way the iPad build sends N
 * printingItems: it is the only way to be sure the count survives whatever
 * the printer defaults to.
 * ==================================================================== */

/* True when Chrome is in kiosk-printing mode, so `print()` will not raise a
 * window. Chrome exposes no flag to read, so this is inferred: kiosk printing
 * is only ever used with `--kiosk`, which puts the window in fullscreen with
 * no browser chrome. It can be wrong, so it only ever changes wording — never
 * behaviour. */
function silentPrintingLikely(){
  const chrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);
  const chromeless = window.outerHeight - window.innerHeight < 10;
  return chrome && chromeless;
}
function submitPrint(){
  if (!session.sheet) { fail('Nothing to print — the layout came back empty.'); return; }
  go('printing');
  setPixel(el('#print-title'),
           session.copies === 1 ? 'PRINTING YOUR PHOTO' : 'PRINTING ' + session.copies + ' COPIES', 5);
  el('#print-status').textContent = 'Building the sheet…';
  setBars('#print-bars', 0.15);

  const media = currentMedia();
  const dataURL = session.sheet.toDataURL('image/jpeg', 0.95);

  setTimeout(() => {
    el('#print-status').textContent = silentPrintingLikely()
      ? 'Sending to the printer…'
      : 'Opening the print dialog…';
    setBars('#print-bars', 0.6);
    try {
      openPrintDialog(dataURL, media, session.copies, () => {
        setBars('#print-bars', 1);
        finishPrinting();
      });
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }, 350);
}

let printFrame = null;
function openPrintDialog(dataURL, media, copies, done){
  // A hidden iframe rather than window.open: no popup blocker, and the job
  // cannot be orphaned in a background tab.
  if (printFrame) printFrame.remove();
  printFrame = document.createElement('iframe');
  printFrame.setAttribute('aria-hidden', 'true');
  printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(printFrame);

  const pages = Array.from({length: Math.max(1, copies)},
                           () => '<img src="' + dataURL + '">').join('');
  const doc = printFrame.contentDocument;
  doc.open();
  doc.write(
    '<!doctype html><meta charset="utf-8"><title>Photobooth print</title><style>' +
    '@page{size:' + media.w + 'in ' + media.h + 'in;margin:0}' +
    'html,body{margin:0;padding:0;background:#fff}' +
    'img{display:block;width:' + media.w + 'in;height:' + media.h + 'in;' +
    'object-fit:cover;page-break-after:always;break-after:page}' +
    'img:last-child{page-break-after:auto;break-after:auto}' +
    '</style>' + pages);
  doc.close();

  // Every page has to be decoded before print() or the dialog previews blanks.
  const imgs = [...doc.images];
  let pending = imgs.length;
  const ready = () => {
    if (--pending > 0) return;
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
    done();
  };
  if (!imgs.length) { done(); return; }
  imgs.forEach(img => {
    if (img.complete) ready();
    else { img.onload = ready; img.onerror = ready; }
  });
}

function finishPrinting(){
  // The sheet number advances only when a job has actually been sent, so a
  // guest who backs out does not burn a number.
  settings.sheetCounter = (settings.sheetCounter || 1) + 1;
  saveSettings();

  setPixel(el('#ty-message'),
           session.copies === 1 ? 'PRINT COMPLETE' : session.copies + ' PRINTS ON THE WAY', 5);
  go('thankyou');
  clearTimeout(session.thankYouTimer);
  session.thankYouTimer = setTimeout(() => {
    if (session.step === 'thankyou') abandon();
  }, settings.thankYouSeconds * 1000);
}

function fail(message){
  el('#fail-detail').textContent = message;
  go('failed');
}

function savePNG(){
  if (!session.sheet) return;
  session.sheet.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'photobooth-' + session.layout.id + '-' + Date.now() + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

/* ==================================================================== *
 * Admin console
 * ==================================================================== */
let adminUnlocked = false;

async function openAdmin(){
  go('admin');
  if (!adminUnlocked) { renderPasscode(); return; }
  await renderAdmin();
}

function renderPasscode(){
  const body = el('#admin-body');
  body.innerHTML =
    '<div class="sec"><h4><span class="ic" data-icon="gear" data-size="26"></span>' +
    '<span class="px" data-cell="4">PASSWORD REQUIRED</span></h4>' +
    '<div class="note"><span class="swatch info-c"></span>' +
    '<span>Operator console. Enter the passcode.</span></div>' +
    '<input class="afield" id="pass" type="password" inputmode="numeric" autocomplete="off" ' +
    'placeholder="passcode" style="max-width:320px;flex:0 0 320px">' +
    '<div class="row gap14"><button class="btn solid" id="pass-ok" style="width:200px">' +
    '<span class="px" data-cell="4">OK</span></button>' +
    '<button class="btn tint-salmon" data-act="abandon" style="width:200px">' +
    '<span class="px" data-cell="4">CANCEL</span></button></div>' +
    '<div class="note" id="pass-msg"></div></div>';
  paintIcons(body); paintPixelText(body);

  const input = el('#pass');
  input.focus();
  const attempt = () => {
    if (input.value === settings.adminPasscode) { adminUnlocked = true; renderAdmin(); }
    else { el('#pass-msg').textContent = 'That code is not right.'; input.value = ''; }
  };
  el('#pass-ok').addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
}

async function renderAdmin(){
  const body = el('#admin-body');
  const cams = await listCameras();
  const parts = [];

  parts.push(section('CAMERA', 'camera', [
    row('DEVICE', seg('cameraId',
      [['', 'DEFAULT']].concat(cams.map(c => [c.deviceId, c.label])), settings.cameraId)),
    row('MIRROR PREVIEW', seg('mirrorPreview', [[true, 'ON'], [false, 'OFF']], settings.mirrorPreview)),
    row('COUNTDOWN', num('countdownSeconds', 1, 10, 1, 's')),
    row('SHOT GAP', num('betweenShotsSeconds', 0.5, 6, 0.5, 's')),
    note('info', 'The preview is mirrored so people can pose. The saved photo never is — a mirrored print reverses every logo in the room.'),
  ]));

  const silent = silentPrintingLikely();
  parts.push(section('PRINT', 'printer', [
    row('PAPER', seg('mediaID', Object.values(MEDIA).map(m => [m.id, m.name]), settings.mediaID)),
    row('MAX COPIES', num('maxCopies', 1, 20, 1, '')),
    row('PRINT MODE',
        '<div class="seg"><button class="' + (silent ? 'on' : '') + '">SILENT</button>' +
        '<button class="' + (silent ? '' : 'on') + '">DIALOG</button></div>'),
    note(silent ? 'info' : 'warn', silent
      ? 'Silent: pressing PRINT sends the sheet straight to the default printer, no window. Make the SELPHY the default printer and set its paper to borderless 4x6 — Chrome uses those defaults and asks nothing.'
      : 'A print dialog will appear. To print silently, quit Chrome and run ./kiosk-chrome.sh — it relaunches Chrome with --kiosk-printing, which is the only way a browser can print without a window. Safari cannot do it at all.'),
  ]));

  parts.push(section('PRINT DESIGN', 'star', [
    row('EVENT', field('eventName', 'e.g. Ana & Miguel')),
    row('DISPLAY WORD', field('printWord', 'e.g. SATIROLOGIA')),
    row('CAPTION', field('printCaption', 'e.g. @mixelbooth')),
    row('PRINT DATE', seg('printDate', [[true, 'ON'], [false, 'OFF']], settings.printDate)),
    row('PHOTO TONE', seg('photoTone', [['mono', 'MONO'], ['colour', 'COLOUR']], settings.photoTone)),
    row('SHEET NO.', num('sheetCounter', 1, 999, 1, '')),
    note('info', 'DISPLAY WORD is the oversized word on the sheet — a long one runs off the edge on purpose. Leave it empty to use the event name. SHEET NO. prints as "003." and counts up with every print.'),
  ]));

  parts.push(section('KIOSK', 'hourglass', [
    row('IDLE RESET', num('idleReturnSeconds', 15, 600, 15, 's')),
    row('THANK YOU HOLD', num('thankYouSeconds', 2, 30, 1, 's')),
    row('PASSCODE', field('adminPasscode', '1234')),
    note('warn', 'Photos live in this tab only and are dropped when the session ends. Nothing is uploaded and nothing is written to disk.'),
  ]));

  parts.push('<div class="row gap14"><span class="grow"></span>' +
             '<button class="btn solid" data-act="abandon" style="width:250px">' +
             '<span class="px" data-cell="4">CLOSE</span></button></div>');

  body.innerHTML = parts.join('');
  paintIcons(body); paintPixelText(body);
  wireAdmin(body);
}

const section = (title, icon, rows) =>
  '<div class="sec"><h4><span class="ic" data-icon="' + icon + '" data-size="26"></span>' +
  '<span class="px" data-cell="4">' + title + '</span></h4>' + rows.join('') + '</div>';

const row = (label, control) =>
  '<div class="arow"><label>' + label + '</label>' + control + '</div>';

const seg = (key, options, current) =>
  '<div class="seg">' + options.map(([value, label]) =>
    '<button data-set="' + key + '" data-value="' + String(value) + '"' +
    (String(value) === String(current) ? ' class="on"' : '') + '>' +
    escapeHTML(label) + '</button>').join('') + '</div>';

const num = (key, min, max, step, suffix) =>
  '<div class="num"><button data-bump="' + key + '" data-by="' + (-step) +
  '" data-min="' + min + '" data-max="' + max + '">−</button>' +
  '<div class="v" data-view="' + key + '">' + settings[key] + suffix + '</div>' +
  '<button data-bump="' + key + '" data-by="' + step +
  '" data-min="' + min + '" data-max="' + max + '">+</button>' +
  '<input type="hidden" data-suffix="' + key + '" value="' + suffix + '"></div>';

const field = (key, placeholder) =>
  '<input class="afield" data-field="' + key + '" placeholder="' + escapeHTML(placeholder) +
  '" value="' + escapeHTML(settings[key] || '') + '">';

const note = (kind, text) =>
  '<div class="note"><span class="swatch ' + (kind === 'warn' ? 'warn-c' : 'info-c') + '"></span>' +
  '<span>' + escapeHTML(text) + '</span></div>';

function escapeHTML(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function wireAdmin(root){
  root.querySelectorAll('[data-set]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.set;
      let value = btn.dataset.value;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      settings[key] = value;
      saveSettings();
      root.querySelectorAll('[data-set="' + key + '"]').forEach(b =>
        b.classList.toggle('on', b === btn));
      afterSettingChange(key);
    });
  });

  root.querySelectorAll('[data-bump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.bump;
      const by = +btn.dataset.by, min = +btn.dataset.min, max = +btn.dataset.max;
      const next = Math.min(max, Math.max(min, +(settings[key] + by).toFixed(2)));
      settings[key] = next;
      saveSettings();
      const suffix = root.querySelector('[data-suffix="' + key + '"]').value;
      root.querySelector('[data-view="' + key + '"]').textContent = next + suffix;
      afterSettingChange(key);
    });
  });

  root.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      settings[input.dataset.field] = input.value;
      saveSettings();
      afterSettingChange(input.dataset.field);
    });
  });
}

function afterSettingChange(key){
  if (key === 'mirrorPreview') applyMirror();
  if (key === 'cameraId') stopCamera();
  if (key === 'maxCopies') session.copies = Math.min(session.copies, settings.maxCopies);
  // Anything that changes how a sheet looks re-renders the tiles, so the
  // operator sees the paper change as they type.
  if (key === 'mediaID') applySheetAspect();
  if (['mediaID', 'photoTone', 'eventName', 'printWord', 'printCaption',
       'printDate', 'sheetCounter'].includes(key)) buildLayoutTiles();
}

async function listCameras(){
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Before permission is granted the browser hands back placeholder
    // entries with an empty deviceId — which would collide with the
    // DEFAULT option and light up two segments at once.
    return devices.filter(d => d.kind === 'videoinput' && d.deviceId)
                  .map((d, i) => ({deviceId: d.deviceId, label: d.label || ('CAMERA ' + (i + 1))}));
  } catch { return []; }
}

function applyMirror(){
  video.classList.toggle('mirror', !!settings.mirrorPreview);
}

/// Publishes the chosen paper's shape as a CSS variable, so every well that
/// shows a sheet takes the sheet's aspect rather than letterboxing it.
function applySheetAspect(){
  const px = mediaPixels(currentMedia());
  document.querySelector('.app').style.setProperty('--sheet-aspect', px.w + ' / ' + px.h);
}

/* ==================================================================== *
 * Wiring
 * ==================================================================== */
const ACTIONS = {
  start: begin,
  abandon: abandon,
  retake: retake,
  keep: showCopies,
  'to-review': showReview,
  'to-copies': showCopies,
  'to-confirm': showConfirm,
  'copies-up': () => { session.copies = Math.min(settings.maxCopies, session.copies + 1); updateCopies(); },
  'copies-down': () => { session.copies = Math.max(1, session.copies - 1); updateCopies(); },
  print: submitPrint,
  'save-png': savePNG,
};

document.addEventListener('click', e => {
  const target = e.target.closest('[data-act]');
  restartIdle();
  if (!target) return;
  const act = target.dataset.act;
  if (act === 'admin-corner') { countCornerTap(); return; }
  const fn = ACTIONS[act];
  if (fn) fn();
});

// The attract screen is tappable anywhere, not just on the button.
screens.attract.addEventListener('click', e => {
  if (e.target.closest('[data-act]')) return;
  begin();
});

// Hidden operator door: three clicks in the top-left corner. Not a
// long-press — someone resting a finger on a kiosk should never find it.
let cornerTaps = 0, cornerTimer = null;
function countCornerTap(){
  cornerTaps++;
  clearTimeout(cornerTimer);
  if (cornerTaps >= 3) { cornerTaps = 0; openAdmin(); return; }
  cornerTimer = setTimeout(() => cornerTaps = 0, 2000);
}

document.addEventListener('keydown', e => {
  restartIdle();
  if (e.key === 'Escape') { abandon(); return; }
  if (e.key === ' ' && session.step === 'attract') { e.preventDefault(); begin(); }
  // Shift+A opens the console from anywhere, for testing without hunting the
  // corner. The passcode still applies.
  if (e.key === 'A' && e.shiftKey) openAdmin();
});

['mousemove', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, restartIdle, {passive: true}));

function tickClock(){
  const d = new Date();
  setPixel(el('#task-clock'),
           String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), 3);
}

/* ==================================================================== *
 * Home-screen app
 * ==================================================================== */

/// True when launched from the Home Screen rather than a browser tab.
function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

/// Offline cache. A venue's wifi is not something to depend on, and the whole
/// app is four files — once it has been opened on the device it keeps working
/// with no network at all.
function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  // file:// has no service worker and does not need one.
  if (location.protocol === 'file:') return;

  // Not on localhost. The worker serves cache-first, so during development
  // it hands back the last build and every edit looks like it did nothing —
  // which has already cost an hour of chasing a fix that was working all
  // along. Add ?sw=1 to test the offline path deliberately.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const forced = new URLSearchParams(location.search).has('sw');
  if (local && !forced) {
    // Clear anything an earlier visit left behind, or it keeps serving.
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
    return;
  }

  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/// Tell people how to get the full-screen version, but only when they are not
/// already in it.
function showInstallHintIfNeeded(){
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so the touch-point check is the only way
  // to tell an iPad from a desktop. The Safari check keeps the hint off
  // Chrome and Firefox, where the Share > Add to Home Screen wording is wrong.
  const appleTouch = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Android/.test(ua);
  el('#install-hint').hidden = !(appleTouch && safari && !isStandalone());
}

/// A booth must not dim mid-countdown. The lock is dropped when the app goes
/// to the background and taken again when it comes back, which is what the
/// API requires — it is released for you on hide.
let wakeLock = null;
async function keepAwake(){
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

/* ==================================================================== *
 * Boot
 * ==================================================================== */
registerServiceWorker();
paintIcons();
paintPixelText();
showInstallHintIfNeeded();
applySheetAspect();
applyMirror();
updateCopies();
buildLayoutTiles();
tickClock();
setInterval(tickClock, 20000);
go('attract');

// Exposed for poking at the renderer from the console during testing.
window.booth = {session, settings, LAYOUTS, MEDIA, renderSheet, compose,
                pixelTextCanvas, setPixel, compactStage, isStandalone};
