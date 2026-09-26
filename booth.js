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
  /* The other two SELPHY CP1500 papers, at Canon's own figures — L size and
   * the credit-card size. Both need their own paper and ribbon kit; the card
   * one also needs the separate PCC-CP400 cassette. */
  'selphy-l':     {id:'selphy-l',     name:'L size 89 x 119 mm (SELPHY)',
                   shortName:'L SELPHY',     w:89/25.4,  h:119/25.4, dpi:300},
  'selphy-card':  {id:'selphy-card',  name:'Card 54 x 86 mm (SELPHY)',
                   shortName:'CARD SELPHY',  w:54/25.4,  h:86/25.4,  dpi:300},
  /* 58mm roll: 48mm printable, 384 dots — the pocket-printer width. */
  'thermal-58':   {id:'thermal-58',   name:'58mm Thermal Roll (receipt)',
                   shortName:'58MM ROLL',    w:384/203, h:0,   dpi:203, flow:true, paperW:58},
  /* An 80mm thermal roll. 72mm of that is printable on every common head,
   * and at 203dpi that is 576 dots — the width nearly every ESC/POS printer
   * expects. Height is not a paper size at all: a receipt is as long as its
   * content, so `flow` tells the renderer to measure instead of fit. */
  'thermal-80':   {id:'thermal-80',   name:'80mm Thermal Roll (receipt)',
                   shortName:'80MM ROLL',    w:576/203, h:0,   dpi:203, flow:true, paperW:80},
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

/* ------------------------------------------------------------------ *
 * Receipt layouts — 80mm thermal.
 *
 * A till roll is not a sheet, so these are a *flow* of blocks read top to
 * bottom rather than slots on a page. The head is shared between all three
 * so the wordmark, the shot order and the foot can only ever be changed in
 * one place; the layouts differ solely in how the photographs sit.
 *
 * Extra tokens here: {longdate} {total} {link} {para} {footer}.
 * ------------------------------------------------------------------ */
const RECEIPT_HEAD = [
  {t:'gap', h:.055},
  // The wordmark: the event set heavy, the display word beneath it in script.
  {t:'runs', lines:[[{text:'{event}', size:.150, weight:800, face:'sans',
                      tracking:-.025, case:'upper', fit:.86}]]},
  {t:'runs', tight:.038, lines:[[{text:'{word}', size:.135, face:'script',
                                  italic:true, fit:.76}]]},
  {t:'gap', h:.040},
  {t:'runs', lines:[[{text:'SHOT ORDER', size:.038, tracking:.30}]]},
  {t:'gap', h:.014},
  {t:'runs', lines:[[{text:'{longdate}', size:.030, tracking:.10, colour:'dim'}]]},
  {t:'gap', h:.032},
  {t:'rule', weight:.0045, dash:.014, gap:.011},
  {t:'gap', h:.022},
  // One row per frame, timed from the first shutter — a real running order,
  // not decoration.
  {t:'tracks', size:.033, leading:1.9},
  {t:'gap', h:.012},
  {t:'rule', weight:.0045, dash:.014, gap:.011},
  {t:'gap', h:.020},
  {t:'row', left:'TOTAL', right:'{total}', size:.033},
  {t:'gap', h:.022},
  {t:'rule', weight:.0045, dash:.014, gap:.011},
  {t:'gap', h:.055},
];
const RECEIPT_FOOT = [
  {t:'gap', h:.060},
  {t:'para', text:'{para}', size:.030, leading:1.75, indent:.055},
  {t:'gap', h:.055},
  {t:'runs', lines:[[{text:'ALL RIGHTS RESERVED', size:.028, face:'serif',
                      italic:true, tracking:.06}]]},
  {t:'gap', h:.038},
  // Skipped whole when no link is set — a QR that goes nowhere is worse
  // than no QR at all.
  {t:'qr', size:.36},
  {t:'gap', h:.045},
  {t:'rule', weight:.0045, dash:.014, gap:.011},
  {t:'gap', h:.030},
  {t:'runs', lines:[[{text:'{footer}', size:.031, tracking:.22, case:'upper'}]]},
  {t:'gap', h:.075},
];
const receiptSlots = n => Array.from({length: n}, (_, i) => ({x:0, y:0, w:1, h:1, src:i}));

LAYOUTS.push(
  { id:'receipt-1', name:'1 SHOT', subtitle:'RECEIPT', accent:'#9BA3A3',
    receipt:true, slots:receiptSlots(1), mono:true, cellAspect:4/5,
    pad:.085, background:'#FFFFFF',
    flow:[...RECEIPT_HEAD,
          {t:'photos', cols:1, aspect:4/5},
          ...RECEIPT_FOOT] },

  { id:'receipt-2', name:'2 SHOTS', subtitle:'RECEIPT', accent:'#A9A2CE',
    receipt:true, slots:receiptSlots(2), mono:true, cellAspect:1,
    pad:.085, background:'#FFFFFF',
    flow:[...RECEIPT_HEAD,
          {t:'photos', cols:1, aspect:1, gap:.022},
          ...RECEIPT_FOOT] },

  { id:'receipt-4', name:'4 SHOTS', subtitle:'RECEIPT', accent:'#C97F7F',
    receipt:true, slots:receiptSlots(4), mono:true, cellAspect:1,
    pad:.085, background:'#FFFFFF',
    flow:[...RECEIPT_HEAD,
          {t:'photos', cols:2, aspect:1, gap:.020},
          ...RECEIPT_FOOT] },
);

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
  // Three engines behind one entry point: a layout from the editor places
  // its elements where they were put; a roll flows; a sheet fits. Nothing
  // that asks for a sheet needs to know which it got.
  if (tpl.kind === 'canvas') return renderCanvas(photos, tpl, media, branding, scale, opts || {});
  if (media.flow) return renderReceipt(photos, tpl, media, branding, scale, opts || {});

  const px = mediaPixels(media);
  const W = Math.round(px.w * (scale || 1)), H = Math.round(px.h * (scale || 1));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = tpl.background;
  g.fillRect(0, 0, W, H);

  const short = Math.min(W, H);
  drawSlots(g, slotRects(tpl, W, H), photos, tpl, short, opts || {});

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

/* Where every photograph lands on a W x H sheet, in pixels. Pulled out of
 * drawSlots so the layout editor can turn a built-in layout into editable
 * boxes with exactly the geometry it prints with, rather than a second
 * approximation of it. */
function slotRects(tpl, W, H){
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
  const gutter = tpl.gutter * short;

  return tpl.slots.map((unit, i) => {
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
    return {r, src};
  });
}

function drawSlots(g, rects, photos, tpl, short, opts){
  const radius = tpl.radius * short;
  const keyline = (tpl.keyline || 0) * short;

  rects.forEach(({r, src}) => {
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
    // Receipt tokens. Harmless on a sheet, which simply never asks for them.
    .replace(/\{longdate\}/g, longDate())
    .replace(/\{total\}/g,   branding.total  || '')
    .replace(/\{link\}/g,    (branding.link   || '').trim())
    .replace(/\{para\}/g,    (branding.para   || '').trim())
    .replace(/\{footer\}/g,  (branding.footer || '').trim())
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

/* The four faces the two output languages use. The sheet is a magazine and
 * sets in the grotesque; the receipt is a till roll and sets in Courier,
 * with a script for the wordmark and an italic serif for the small print.
 * All four ship with macOS and iOS, so nothing has to be downloaded — a
 * font that fails to load would silently reflow a guest's souvenir. */
const FACE = {
  sans:   '"Helvetica Neue", Helvetica, Arial, sans-serif',
  mono:   '"Courier New", Courier, ui-monospace, Menlo, monospace',
  script: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive',
  serif:  'Georgia, "Times New Roman", Times, serif',
};

const runFont = (o, size) =>
  (o.italic ? 'italic ' : '') +
  (o.weight >= 800 ? '800 ' : o.weight >= 700 ? '700 ' : '400 ') +
  size + 'px ' + (o.face || FACE.sans);

/* Width of a run, and the size it shrank to if it was given a limit. Shared
 * with the receipt's flow, which has to know how tall a block is before
 * anything is drawn. */
function runMetrics(g, chars, o){
  const measure = s => {
    g.font = runFont(o, s);
    let w = 0;
    for (const ch of chars) w += g.measureText(ch).width;
    return w + (o.tracking * (s / o.size)) * Math.max(0, chars.length - 1);
  };
  let size = o.size;
  if (o.maxWidth) {
    while (size > 4 && measure(size) > o.maxWidth) size -= Math.max(1, size * 0.04);
  }
  return {size, width: measure(size), tracking: o.tracking * (size / o.size)};
}

/* One text run, drawn character by character so letter-spacing is identical
 * in every browser and matches the Swift build's `.kern`. `ctx.letterSpacing`
 * would be shorter but is not old enough to rely on. Returns the width drawn,
 * which is how the justified paragraph steps from word to word. */
function drawRun(g, text, o){
  const chars = [...text];
  const {size, width, tracking} = runMetrics(g, chars, o);

  let x = o.x;
  if (o.align === 'right')  x = o.x - width;
  if (o.align === 'centre') x = o.x - width / 2;

  g.font = runFont(o, size);
  g.fillStyle = o.colour;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (const ch of chars) {
    g.fillText(ch, x, o.y);
    x += g.measureText(ch).width + tracking;
  }
  return width;
}
/* ==================================================================== *
 * The receipt renderer — 80mm thermal roll.
 *
 * A till roll has no page. Its height is whatever the content adds up to,
 * so this is a *flow* of blocks rather than the sheet renderer's absolute
 * placement: every block measures itself, the heights sum to the canvas,
 * and the same list then draws into it. Measure and draw share one switch
 * so the two passes cannot drift apart.
 *
 * Every size is a fraction of the roll's printable width, exactly like the
 * sheet's decor, so a layout stays correct if the head's dpi ever changes.
 * ==================================================================== */
const scratchCtx = document.createElement('canvas').getContext('2d');

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY',
                'AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
function longDate(d){
  const t = d || new Date();
  return MONTHS[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear();
}
const mmss = s => {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/* Text options for one receipt segment, in device pixels. */
const segOpts = (s, W) => ({
  size: s.size * W,
  tracking: (s.tracking || 0) * s.size * W,
  weight: s.weight || 400,
  italic: !!s.italic,
  face: FACE[s.face || 'mono'],
  colour: s.colour === 'dim' ? 'rgba(17,17,17,0.55)' : INK,
  maxWidth: s.fit ? s.fit * W : null,
});

/* Lay the flow out and return where every block lands. Nothing is drawn, so
 * this is also how the confirm screen and the sheet wells learn how long the
 * receipt will be before there is a canvas. */
function receiptPlan(tpl, brand, W, opts){
  const g = scratchCtx;
  const pad = (tpl.pad || 0.08) * W;
  const cw = W - pad * 2;
  const items = [];
  let y = 0;

  for (const b of (tpl.flow || [])) {
    const measured = receiptMeasure(b, tpl, brand, W, cw, g);
    if (measured === null) continue;          // this block has nothing to say
    if (b.tight) y -= b.tight * W;
    items.push({b, y, h: measured.h, lines: measured.lines});
    y += measured.h;
  }
  return {width: W, height: Math.max(1, Math.round(y)), items, pad, cw};
}

function receiptMeasure(b, tpl, brand, W, cw, g){
  switch (b.t) {
    case 'gap':  return {h: b.h * W};
    case 'rule': return {h: Math.max(1, (b.weight || 0.004) * W)};

    case 'runs': {
      const lines = (b.lines || []).map(line => {
        const segs = line
          .map(s => Object.assign({}, s, {text: receiptText(s.text, brand, tpl)}))
          .filter(s => s.text)
          .map(s => Object.assign(s, {text: s.case === 'upper' ? s.text.toUpperCase() : s.text}));
        if (!segs.length) return null;
        const space = (b.space === undefined ? 0.22 : b.space);
        let width = 0;
        segs.forEach((s, i) => {
          const o = segOpts(s, W);
          const m = runMetrics(g, [...s.text], o);
          s._o = o; s._size = m.size; s._w = m.width;
          width += m.width + (i ? space * o.size : 0);
        });
        const cap = Math.max(...segs.map(s => s._size));
        return {segs, width, cap, h: cap * (b.leading || 1.12), space};
      }).filter(Boolean);
      if (!lines.length) return null;
      return {h: lines.reduce((s, l) => s + l.h, 0), lines};
    }

    case 'row':
      if (!receiptText(b.right, brand, tpl)) return null;
      return {h: b.size * W * (b.leading || 1.7)};

    case 'tracks': {
      const rows = brand.tracks || [];
      if (!rows.length) return null;
      return {h: rows.length * b.size * W * (b.leading || 1.85)};
    }

    case 'photos': {
      const cols = b.cols || 1, rows = Math.ceil(tpl.shots / cols);
      const gap = (b.gap || 0) * W;
      const cellW = (cw - gap * (cols - 1)) / cols;
      return {h: rows * (cellW / (b.aspect || 1)) + gap * (rows - 1)};
    }

    case 'para': {
      const text = receiptText(b.text, brand, tpl);
      if (!text) return null;
      const lines = wrapParagraph(g, text, b, W, cw);
      return {h: lines.length * b.size * W * (b.leading || 1.7), lines};
    }

    case 'qr':
      if (!receiptText(b.text || '{link}', brand, tpl)) return null;
      return {h: b.size * W};
  }
  return null;
}

/* Greedy word wrap, with the first line indented like the reference. */
function wrapParagraph(g, text, b, W, cw){
  const o = segOpts(b, W);
  const indent = (b.indent || 0) * W;
  const width = words => runMetrics(g, [...words.join(' ')], o).width;
  const lines = [];
  let cur = [], limit = cw - indent;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur.length && width(cur.concat(word)) > limit) {
      lines.push({words: cur, indent: lines.length === 0 ? indent : 0});
      cur = [word]; limit = cw;
    } else cur.push(word);
  }
  if (cur.length) lines.push({words: cur, indent: lines.length === 0 ? indent : 0, last: true});
  if (lines.length) lines[lines.length - 1].last = true;
  return lines;
}

/* A justified paragraph, already wrapped. Every line but the last is set to
 * the full measure by opening the word spaces, like the reference receipt.
 * Shared by the receipt and by the layout editor's paragraph element. */
function drawParagraph(g, lines, b, W, left, top, cw, colour){
  const o = segOpts(b, W);
  if (colour) o.colour = colour;
  const step = b.size * W * (b.leading || 1.7);
  const justify = b.justify !== false;
  lines.forEach((line, i) => {
    const baseline = top + i * step + o.size * 0.80;
    const x0 = left + line.indent;
    const room = cw - line.indent;
    const natural = runMetrics(g, [...line.words.join(' ')], o).width;
    const extra = (justify && !line.last && line.words.length > 1)
      ? (room - natural) / (line.words.length - 1) : 0;
    const space = runMetrics(g, [' '], o).width;
    let x = x0;
    for (const word of line.words) {
      x += drawRun(g, word, Object.assign({}, o, {x, y: baseline, align: 'left'}))
         + space + extra;
    }
  });
}

function receiptText(text, brand, tpl){
  return text === undefined ? '' : resolveToken(text, brand, tpl);
}

function renderReceipt(photos, tpl, media, brand, scale, opts){
  const W = Math.round(Math.round(media.w * media.dpi) * (scale || 1));
  const plan = receiptPlan(tpl, brand, W, opts);
  const c = document.createElement('canvas');
  c.width = plan.width; c.height = plan.height;
  const g = c.getContext('2d');
  g.fillStyle = tpl.background || '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  drawReceipt(g, plan, tpl, brand, photos, W, opts);
  return c;
}

function drawReceipt(g, plan, tpl, brand, photos, W, opts){
  const pad = plan.pad, cw = plan.cw;

  for (const item of plan.items) {
    const b = item.b, y = item.y;
    switch (b.t) {

      case 'rule': {
        const weight = Math.max(1, (b.weight || 0.004) * W);
        g.fillStyle = INK;
        if (b.dash) {
          const seg = b.dash * W, gap = (b.gap === undefined ? b.dash * 0.8 : b.gap) * W;
          for (let x = pad; x < pad + cw - 0.5; x += seg + gap)
            g.fillRect(x, y, Math.min(seg, pad + cw - x), weight);
        } else {
          g.fillRect(pad, y, cw, weight);
        }
        break;
      }

      case 'runs': {
        let ly = y;
        for (const line of item.lines) {
          const baseline = ly + line.cap * 0.80;
          let x = b.align === 'right'  ? pad + cw - line.width
                : b.align === 'left'   ? pad
                : pad + (cw - line.width) / 2;
          for (const s of line.segs) {
            drawRun(g, s.text, Object.assign({}, s._o, {x, y: baseline, align: 'left'}));
            x += s._w + line.space * s._o.size;
          }
          ly += line.h;
        }
        break;
      }

      case 'row': {
        const o = segOpts(b, W);
        const baseline = y + o.size * 0.80;
        const left = receiptText(b.left, brand, tpl).toUpperCase();
        const right = receiptText(b.right, brand, tpl);
        if (left)  drawRun(g, left,  Object.assign({}, o, {x: pad, y: baseline, align: 'left'}));
        if (right) drawRun(g, right, Object.assign({}, o, {x: pad + cw, y: baseline, align: 'right'}));
        break;
      }

      case 'tracks': {
        const o = segOpts(b, W);
        const step = b.size * W * (b.leading || 1.85);
        (brand.tracks || []).forEach((track, i) => {
          const baseline = y + i * step + o.size * 0.80;
          drawRun(g, track.label.toUpperCase(),
                  Object.assign({}, o, {x: pad, y: baseline, align: 'left',
                                        maxWidth: cw * 0.72}));
          drawRun(g, track.time,
                  Object.assign({}, o, {x: pad + cw, y: baseline, align: 'right', maxWidth: null}));
        });
        break;
      }

      case 'photos': {
        const cols = b.cols || 1, n = tpl.shots;
        const gap = (b.gap || 0) * W;
        const cellW = (cw - gap * (cols - 1)) / cols;
        const cellH = cellW / (b.aspect || 1);
        const mono = opts.mono !== undefined ? opts.mono : tpl.mono;
        for (let i = 0; i < n; i++) {
          const r = {x: pad + (i % cols) * (cellW + gap),
                     y: y + Math.floor(i / cols) * (cellH + gap),
                     w: cellW, h: cellH};
          g.save();
          g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
          const photo = photos && photos[i];
          if (photo) {
            // Thermal paper is one bit deep. Grey is the honest preview of
            // what the head will dither, and colour would be a lie.
            if (mono) g.filter = 'grayscale(1) contrast(1.08)';
            drawCovering(g, photo, r, 'fill');
            g.filter = 'none';
          } else {
            g.fillStyle = 'rgba(0,0,0,0.10)';
            g.fillRect(r.x, r.y, r.w, r.h);
            if (opts.numberEmptySlots) {
              g.fillStyle = 'rgba(0,0,0,0.28)';
              g.textAlign = 'center'; g.textBaseline = 'middle';
              g.font = '900 ' + Math.round(Math.min(r.w, r.h) * 0.42) +
                       'px ui-monospace, Menlo, monospace';
              g.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
            }
          }
          g.restore();
        }
        break;
      }

      case 'para':
        drawParagraph(g, item.lines, b, W, pad, y, cw);
        break;

      case 'qr': {
        const link = receiptText(b.text || '{link}', brand, tpl);
        const box = b.size * W;
        try {
          QR.draw(g, link, {x: pad + (cw - box) / 2, y, size: box}, INK);
        } catch (err) {
          // A link too long for version 10 must not take the print with it.
          console.warn('QR skipped:', err.message);
        }
        break;
      }
    }
  }
}


/* ==================================================================== *
 * Canvas layouts — the ones the layout editor makes.
 *
 * The built-in layouts are two engines: a sheet (slots inside margins, plus
 * an editorial layer) and a receipt (a flow of blocks). The editor needs
 * something anyone can reason about by looking at it, so its layouts are a
 * third, simpler thing: a list of elements, each placed where it was put.
 *
 * Every coordinate is a fraction of the page — x and w of its width, y and h
 * of its height — so one design prints correctly on any paper of the same
 * shape and sensibly on one that is not. Type sizes, like the sheet's decor,
 * are fractions of the width. A text element's `y` is its baseline.
 *
 * On a roll there is no page height, so a canvas layout carries its own
 * `length` in millimetres. That is what lets a designed receipt sit on the
 * same 58 or 80 mm paper as the built-in ones.
 * ==================================================================== */
const ELEMENT_TYPES = ['photo', 'text', 'para', 'line', 'box', 'qr', 'shots'];

function canvasPixels(tpl, media){
  const w = Math.round(media.w * media.dpi);
  const h = media.flow
    ? Math.max(1, Math.round((tpl.length || 150) / 25.4 * media.dpi))
    : Math.round(media.h * media.dpi);
  return {w, h};
}

const colourOf = c =>
  !c || c === 'ink' ? INK
  : c === 'dim' ? 'rgba(17,17,17,0.55)'
  : c === 'paper' ? '#FFFFFF'
  : c;

function renderCanvas(photos, tpl, media, brand, scale, opts){
  const px = canvasPixels(tpl, media);
  const W = Math.max(1, Math.round(px.w * (scale || 1)));
  const H = Math.max(1, Math.round(px.h * (scale || 1)));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = tpl.background || '#FFFFFF';
  g.fillRect(0, 0, W, H);

  const mono = opts.mono !== undefined ? opts.mono : tpl.mono;
  (tpl.elements || []).forEach((el, i) => {
    const box = drawElement(g, el, W, H, photos, tpl, brand, mono, opts);
    // The editor hit-tests against where things were actually drawn, not
    // where the numbers say, so a shrunk-to-fit title is grabbed by its ink.
    if (opts.boxes) opts.boxes[i] = box;
  });
  return c;
}

function drawElement(g, el, W, H, photos, tpl, brand, mono, opts){
  const editing = !!opts.editing;
  switch (el.t) {

    case 'photo': {
      const r = {x: el.x * W, y: el.y * H, w: el.w * W, h: el.h * H};
      if (r.w < 1 || r.h < 1) return r;
      const radius = (el.radius || 0) * W;
      const path = () => {
        g.beginPath();
        if (radius > 0 && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, radius);
        else g.rect(r.x, r.y, r.w, r.h);
      };
      g.save(); path(); g.clip();
      const photo = photos && photos[el.src | 0];
      if (photo) {
        if (mono) g.filter = 'grayscale(1) contrast(1.06)';
        drawCovering(g, photo, r, el.fit || 'fill');
        g.filter = 'none';
      } else {
        g.fillStyle = 'rgba(0,0,0,0.10)';
        g.fillRect(r.x, r.y, r.w, r.h);
        if (opts.numberEmptySlots) {
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = '900 ' + Math.round(Math.min(r.w, r.h) * 0.42) +
                   'px ui-monospace, Menlo, monospace';
          g.fillText(String((el.src | 0) + 1), r.x + r.w / 2, r.y + r.h / 2);
        }
      }
      g.restore();
      if (el.keyline > 0) {
        g.save(); path();
        g.strokeStyle = colourOf(el.keylineColour);
        g.lineWidth = Math.max(1, el.keyline * W);
        g.stroke(); g.restore();
      }
      return r;
    }

    case 'box': {
      const r = {x: el.x * W, y: el.y * H, w: el.w * W, h: el.h * H};
      g.fillStyle = colourOf(el.colour);
      const radius = (el.radius || 0) * W;
      g.beginPath();
      if (radius > 0 && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, radius);
      else g.rect(r.x, r.y, r.w, r.h);
      g.fill();
      return r;
    }

    case 'line': {
      const weight = Math.max(1, (el.weight || 0.003) * W);
      const x0 = el.x * W, y0 = el.y * H, len = el.w * W;
      g.fillStyle = colourOf(el.colour);
      if (el.dash > 0) {
        const seg = el.dash * W;
        const gap = (el.gap > 0 ? el.gap : el.dash * 0.8) * W;
        for (let x = x0; x < x0 + len - 0.5; x += seg + gap)
          g.fillRect(x, y0, Math.min(seg, x0 + len - x), weight);
      } else {
        g.fillRect(x0, y0, len, weight);
      }
      return {x: x0, y: y0, w: len, h: weight};
    }

    case 'text': {
      let text = resolveToken(el.text || '', brand, tpl);
      let colour = colourOf(el.colour);
      // An empty token is invisible on paper, which is right — and in the
      // editor it would be an element you could never find again. Show the
      // template itself there, faintly.
      if (!text && editing) { text = el.text || 'TEXT'; colour = 'rgba(17,17,17,0.25)'; }
      if (!text) return null;
      if (el.case === 'upper') text = text.toUpperCase();
      const o = {
        size: el.size * W,
        tracking: (el.tracking || 0) * el.size * W,
        weight: el.weight || 400,
        italic: !!el.italic,
        face: FACE[el.face || 'sans'],
        colour,
        maxWidth: el.fit ? el.fit * W : null,
      };
      const m = runMetrics(g, [...text], o);
      const x = el.x * W, y = el.y * H;
      drawRun(g, text, Object.assign({}, o, {x, y, align: el.align || 'left'}));
      const left = el.align === 'right' ? x - m.width
                 : el.align === 'centre' ? x - m.width / 2 : x;
      return {x: left, y: y - m.size * 0.80, w: m.width, h: m.size};
    }

    case 'para': {
      let text = resolveToken(el.text || '', brand, tpl);
      let colour = colourOf(el.colour);
      if (!text && editing) { text = el.text || 'Paragraph'; colour = 'rgba(17,17,17,0.25)'; }
      const left = el.x * W, top = el.y * H, cw = el.w * W;
      if (!text) return {x: left, y: top, w: cw, h: el.size * W};
      const b = {size: el.size, face: el.face || 'mono', weight: el.weight || 400,
                 italic: !!el.italic, tracking: el.tracking || 0,
                 leading: el.leading || 1.7, indent: el.indent || 0,
                 justify: el.justify !== false};
      const lines = wrapParagraph(g, text, b, W, cw);
      drawParagraph(g, lines, b, W, left, top, cw, colour);
      return {x: left, y: top, w: cw,
              h: Math.max(1, lines.length) * el.size * W * b.leading};
    }

    case 'qr': {
      const side = el.size * W;
      const r = {x: el.x * W, y: el.y * H, w: side, h: side};
      const link = resolveToken(el.text || '{link}', brand, tpl);
      if (link) {
        try { QR.draw(g, link, {x: r.x, y: r.y, size: side}, colourOf(el.colour)); }
        catch (e) { console.warn('QR skipped:', e.message); }
      } else if (editing) {
        // No link set yet: a placeholder, so the operator can see where the
        // code will go and grab it. Nothing prints until a link exists.
        g.save();
        g.strokeStyle = 'rgba(17,17,17,0.35)'; g.lineWidth = Math.max(1, side * 0.02);
        g.setLineDash([side * 0.06, side * 0.05]);
        g.strokeRect(r.x, r.y, side, side);
        g.fillStyle = 'rgba(17,17,17,0.35)';
        g.font = '700 ' + Math.round(side * 0.16) + 'px ui-monospace, Menlo, monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('QR', r.x + side / 2, r.y + side / 2);
        g.restore();
      }
      return r;
    }

    case 'shots': {
      const rows = brand.tracks || [];
      const size = el.size * W, step = size * (el.leading || 1.9);
      const left = el.x * W, top = el.y * H, cw = el.w * W;
      const o = {size, tracking: (el.tracking || 0) * size, weight: el.weight || 400,
                 italic: false, face: FACE[el.face || 'mono'], colour: colourOf(el.colour),
                 maxWidth: null};
      rows.forEach((track, i) => {
        const baseline = top + i * step + size * 0.80;
        drawRun(g, track.label.toUpperCase(),
                Object.assign({}, o, {x: left, y: baseline, align: 'left', maxWidth: cw * 0.72}));
        drawRun(g, track.time, Object.assign({}, o, {x: left + cw, y: baseline, align: 'right'}));
      });
      return {x: left, y: top, w: cw, h: Math.max(1, rows.length) * step};
    }
  }
  return null;
}

/* The photographs a canvas layout takes, in the shape the rest of the booth
 * expects: `slots` carrying a `src`, so the shot count, the shot strip and
 * per-frame retake all work unchanged. */
function registerCanvasLayout(tpl){
  const photos = (tpl.elements || []).filter(e => e.t === 'photo');
  tpl.kind = 'canvas';
  tpl.slots = photos.map(e => ({x: e.x, y: e.y, w: e.w, h: e.h, src: e.src | 0}));
  tpl.shots = new Set(tpl.slots.map(s => s.src)).size;
  // The capture guide takes the first photograph's true shape, so people
  // frame themselves for the box they will actually print in.
  const media = MEDIA[tpl.mediaID];
  const first = photos[0];
  if (media && first) {
    const px = canvasPixels(tpl, media);
    tpl.cellAspect = (first.w * px.w) / Math.max(1, first.h * px.h);
  } else {
    tpl.cellAspect = null;
  }
  tpl.fit = 'fill';
  return tpl;
}

/* ------------------------------------------------------------------ *
 * Built-in layout -> editable elements.
 *
 * So the operator can start from a design that already works instead of a
 * blank page. It uses the geometry the layout actually prints with — the
 * sheet's real slot rectangles, the receipt's measured flow — so a layout
 * converted and printed unchanged comes out as it did before.
 * ------------------------------------------------------------------ */
function layoutToCanvas(tpl, media, brand){
  const base = {
    name: tpl.name, subtitle: tpl.subtitle || 'CUSTOM', accent: tpl.accent || '#A9A2CE',
    mediaID: media.id, background: tpl.background || '#FFFFFF',
    mono: tpl.mono !== false, elements: [],
  };
  if (tpl.kind === 'canvas') {
    return Object.assign(base, {length: tpl.length, mono: !!tpl.mono,
      elements: JSON.parse(JSON.stringify(tpl.elements || []))});
  }
  return media.flow ? receiptToCanvas(tpl, media, brand, base)
                    : sheetToCanvas(tpl, media, base);
}

function sheetToCanvas(tpl, media, out){
  const px = mediaPixels(media);
  const W = px.w, H = px.h, short = Math.min(W, H);

  for (const {r, src} of slotRects(tpl, W, H)) {
    if (r.w < 1 || r.h < 1) continue;
    out.elements.push({t: 'photo', x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H,
      src, fit: tpl.fit || 'fill',
      radius: (tpl.radius || 0) * short / W,
      keyline: (tpl.keyline || 0) * short / W,
      keylineColour: tpl.keylineColour || '#FFFFFF'});
  }

  // A duplicate-strip sheet draws its dressing once per strip; the editor has
  // no notion of columns, so each copy becomes its own elements.
  const columns = Math.max(1, tpl.footerColumns || 1);
  for (let c = 0; c < columns; c++) {
    const rx = (W / columns) * c, rw = W / columns, k = rw / W;
    for (const item of tpl.decor || []) {
      if (item.t === 'rule') {
        out.elements.push({t: 'line', x: (rx + item.x * rw) / W, y: item.y,
          w: item.w * k, weight: (item.weight || 0.0018) * k,
          colour: item.colour === 'paper' ? 'paper' : 'ink'});
      } else {
        out.elements.push({t: 'text', text: item.text,
          x: (rx + item.x * rw) / W, y: item.y, size: item.size * k,
          tracking: item.tracking || 0, weight: item.weight || 400,
          align: item.align || 'left', case: item.case, face: 'sans',
          colour: item.colour === 'paper' ? 'paper'
                : item.colour === 'dim' ? 'rgba(17,17,17,0.45)' : 'ink',
          fit: item.fit ? item.fit * k : null});
      }
    }
  }
  return out;
}

function receiptToCanvas(tpl, media, brand, out){
  const W = Math.round(media.w * media.dpi);
  const plan = receiptPlan(tpl, brand, W, {});
  const H = plan.height, pad = plan.pad, cw = plan.cw;

  for (const item of plan.items) {
    const b = item.b, y = item.y;
    switch (b.t) {
      case 'rule':
        out.elements.push({t: 'line', x: pad / W, y: y / H, w: cw / W,
          weight: b.weight || 0.004, dash: b.dash || 0, gap: b.gap || 0});
        break;

      case 'runs': {
        let ly = y;
        item.lines.forEach((line, li) => {
          const baseline = (ly + line.cap * 0.80) / H;
          const source = b.lines[li] || [];
          if (line.segs.length === 1) {
            const seg = source[0] || line.segs[0];
            out.elements.push({t: 'text', text: seg.text, x: (pad + cw / 2) / W, y: baseline,
              size: seg.size, tracking: seg.tracking || 0, weight: seg.weight || 400,
              face: seg.face || 'mono', italic: !!seg.italic, case: seg.case,
              colour: seg.colour === 'dim' ? 'dim' : 'ink', fit: seg.fit || null,
              align: 'centre'});
          } else {
            let x = pad + (cw - line.width) / 2;
            line.segs.forEach((s, si) => {
              const seg = source[si] || s;
              out.elements.push({t: 'text', text: seg.text, x: x / W, y: baseline,
                size: seg.size, tracking: seg.tracking || 0, weight: seg.weight || 400,
                face: seg.face || 'mono', italic: !!seg.italic, case: seg.case,
                colour: seg.colour === 'dim' ? 'dim' : 'ink', align: 'left'});
              x += s._w + line.space * s._o.size;
            });
          }
          ly += line.h;
        });
        break;
      }

      case 'row': {
        const baseline = (y + b.size * W * 0.80) / H;
        out.elements.push({t: 'text', text: b.left, x: pad / W, y: baseline, size: b.size,
          face: 'mono', case: 'upper', align: 'left'});
        out.elements.push({t: 'text', text: b.right, x: (pad + cw) / W, y: baseline,
          size: b.size, face: 'mono', align: 'right'});
        break;
      }

      case 'tracks':
        out.elements.push({t: 'shots', x: pad / W, y: y / H, w: cw / W,
          size: b.size, leading: b.leading || 1.85, face: 'mono'});
        break;

      case 'photos': {
        const cols = b.cols || 1, gap = (b.gap || 0) * W;
        const cellW = (cw - gap * (cols - 1)) / cols, cellH = cellW / (b.aspect || 1);
        for (let i = 0; i < tpl.shots; i++) {
          out.elements.push({t: 'photo',
            x: (pad + (i % cols) * (cellW + gap)) / W,
            y: (y + Math.floor(i / cols) * (cellH + gap)) / H,
            w: cellW / W, h: cellH / H, src: i, fit: 'fill'});
        }
        break;
      }

      case 'para':
        out.elements.push({t: 'para', text: b.text, x: pad / W, y: y / H, w: cw / W,
          size: b.size, leading: b.leading || 1.7, indent: b.indent || 0,
          face: b.face || 'mono'});
        break;

      case 'qr': {
        const side = b.size * W;
        out.elements.push({t: 'qr', text: b.text || '{link}',
          x: (pad + (cw - side) / 2) / W, y: y / H, size: b.size});
        break;
      }
    }
  }
  // Hundredths of a millimetre: at 203 dpi a tenth is 0.8 of a dot, enough to
  // round the page a pixel short and shift everything on it.
  out.length = Math.round(H / media.dpi * 25.4 * 100) / 100;
  return out;
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
 * The Android shell, when there is one.
 *
 * `BoothNative` is injected by the tablet app and is simply absent in a
 * browser, so every use of it is guarded and this file stays the one build
 * that runs everywhere. The shell exists because a WebView cannot print and
 * a browser cannot reach a Bluetooth printer — nothing else about the booth
 * changes.
 * ==================================================================== */
const NATIVE = (typeof window !== 'undefined' && window.BoothNative) || null;

/* iPadOS is the one browser platform that hands a web page a USB camera, so
 * the advice when a camera will not appear is different there than on a
 * laptop. iPadOS 13+ reports itself as a Macintosh, so the user-agent alone
 * cannot tell an iPad from a Mac — a touch screen is what separates them. */
const IPADOS = (() => {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
})();

/* Whether to hold the camera open between guests instead of releasing it.
 *
 * No web page anywhere can grant itself the camera — that is a browser
 * boundary, not a gap to code around. What can be controlled is how often the
 * booth *asks*. iOS does not persist the decision for a Home Screen web app:
 * it is thrown away when the app closes, and asked for again the next time
 * anything calls getUserMedia. Releasing the camera at the end of a session
 * therefore puts a permission prompt in front of every single guest.
 *
 * Taking the camera once and never letting go is the documented way round it,
 * and the only one. So on iPadOS the stream is held for the whole life of the
 * launch: one prompt when the booth starts, then nothing. The operator
 * changing camera is the only thing that drops it.
 *
 * Nowhere else does this: a WebView and a desktop browser both remember the
 * grant, so holding a lens open between guests would cost a live camera and
 * buy nothing. */
const HOLD_CAMERA = IPADOS;

/* ==================================================================== *
 * Settings — the same shape as AppSettings.swift, in localStorage.
 * Saved values are merged over the defaults rather than replacing them,
 * so adding a field never wipes what the operator had set.
 * ==================================================================== */
const DEFAULTS = {
  /// 'auto' prefers a plugged-in USB camera and falls back to the built-in
  /// one; 'builtin' pins the tablet's own lens; anything else is a deviceId.
  cameraId: 'auto',
  mirrorPreview: true,
  countdownSeconds: 3,
  betweenShotsSeconds: 1.5,
  defaultCopies: 1,
  maxCopies: 10,
  mediaID: 'postcard-4x6',
  guestLayoutIDs: ['one-full', 'one-polaroid', 'two-stack',
                   'four-grid', 'four-strip-duo', 'six-grid',
                   'receipt-1', 'receipt-2', 'receipt-4'],
  eventName: '',
  printCaption: '',
  printDate: true,
  /// The oversized display word. Falls back to the event name.
  printWord: '',
  /// Running sheet number, printed as "003.". Increments on every print.
  sheetCounter: 1,
  /// Photographs are monochrome to match the print design. MONO or COLOUR.
  photoTone: 'mono',
  /* --- the receipt, on 80mm thermal --- */
  /// Names for the shot-order rows, comma separated. Falls back to FRAME 01.
  printTracks: '',
  /// The justified paragraph above the QR.
  printPara: 'Printed the moment it happened, on the paper it happened on. ' +
             'No filter, no second take, no cloud. Some things are worth ' +
             'holding rather than scrolling.',
  /// The line under the last rule.
  printFooter: 'THE ART OF THE MOMENT',
  /// What the QR points at. Empty prints no code at all.
  printLink: '',
  /* --- the tablet's printer --- */
  /// DIALOG raises the system print sheet; THERMAL goes straight out over
  /// Bluetooth with no window at all. Android only.
  printMode: 'dialog',
  /// Hide the print options from the guest: no copy count, no spec table,
  /// no SAVE PNG. Press PRINT and paper comes out. The operator's settings
  /// decide the copies.
  quickPrint: true,
  /// Imaging width of the thermal head. 576 = 80mm, 384 = 58mm.
  thermalWidthDots: 576,
  /* --- the layout editor --- */
  /// Paper sizes the operator added, in the same shape as MEDIA.
  customMedia: [],
  /// Layouts made in the editor: {id, name, subtitle, accent, mediaID,
  /// length, background, mono, elements}.
  customLayouts: [],
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

  // The editor's papers and layouts have to be registered before the offered
  // list is checked, or every custom layout would look unknown and be dropped.
  registerCustom(merged);

  // A saved list can name layouts that no longer exist — the first
  // six-layout build renamed 'four-full' to 'four-grid', and a custom layout
  // can be deleted. Drop only what is gone. An empty list for a paper falls
  // back to everything that paper can hold, in guestLayouts, so there is no
  // need to reset the whole list here and lose the operator's choices.
  const known = new Set(LAYOUTS.map(l => l.id));
  const kept = (merged.guestLayoutIDs || []).filter(id => known.has(id));
  merged.guestLayoutIDs = kept.length ? kept : DEFAULTS.guestLayoutIDs.slice();

  return merged;
}

/* Puts the editor's papers into MEDIA and its layouts into LAYOUTS, next to
 * the built-in ones, so every other part of the booth treats them the same.
 * Safe to call again after an edit: old copies of custom layouts go first. */
function registerCustom(source){
  for (const id of Object.keys(MEDIA)) if (MEDIA[id].custom) delete MEDIA[id];
  for (const m of source.customMedia || []) {
    if (!m || !m.id || !(m.w > 0) || !(m.dpi > 0)) continue;
    MEDIA[m.id] = Object.assign({}, m, {custom: true, h: m.flow ? 0 : m.h});
  }
  for (let i = LAYOUTS.length - 1; i >= 0; i--) if (LAYOUTS[i].custom) LAYOUTS.splice(i, 1);
  for (const l of source.customLayouts || []) {
    if (!l || !l.id || !Array.isArray(l.elements)) continue;
    LAYOUTS.push(registerCanvasLayout(
      Object.assign({custom: true}, JSON.parse(JSON.stringify(l)))));
  }
}
function saveSettings(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
}
const currentMedia = () => MEDIA[settings.mediaID] || MEDIA['postcard-4x6'];

/* Layouts are offered by what the paper can hold. A receipt on 4x6 card and
 * a double strip on a till roll are both nonsense, so the paper chosen in
 * Admin decides which half of the list a guest ever sees — one switch turns
 * the whole booth into a receipt printer. */
/* Whether a layout belongs on this paper. A built-in one knows only whether
 * it is a sheet or a receipt; a layout from the editor was designed against
 * one particular paper and is only offered on that one. */
const fitsPaper = (tpl, media) =>
  tpl.kind === 'canvas' ? tpl.mediaID === media.id : !!tpl.receipt === !!media.flow;

const guestLayouts = () => {
  const media = currentMedia();
  const pool = LAYOUTS.filter(l => fitsPaper(l, media));
  const found = settings.guestLayoutIDs
    .map(id => pool.find(l => l.id === id))
    .filter(Boolean);
  return found.length ? found : pool;
};
/* The layout a preview should measure against. `session.layout` is whatever
 * the last guest picked, which after a paper change can belong to the other
 * kind of output entirely. */
const activeLayout = () =>
  fitsPaper(session.layout, currentMedia()) ? session.layout : guestLayouts()[0];

/* The shot-order rows. One per frame, timed from the first shutter, so the
 * receipt lists what actually happened rather than invented durations. A
 * frame with no timestamp yet reads "--:--" — a preview must never put a
 * made-up number where a real one will go. */
function receiptTracks(tpl){
  const names = (settings.printTracks || '').split(/\s*[,;\n]\s*/).filter(Boolean);
  const times = session.times || [];
  const taken = times.filter(Boolean);
  const first = taken.length ? Math.min(...taken) : null;
  const rows = [];
  for (let i = 0; i < tpl.shots; i++) {
    rows.push({
      label: names[i] || ('FRAME ' + String(i + 1).padStart(2, '0')),
      time: (first && times[i]) ? mmss((times[i] - first) / 1000) : '--:--',
    });
  }
  return rows;
}
function sessionTotal(){
  const taken = (session.times || []).filter(Boolean);
  if (taken.length < 2) return taken.length ? mmss(0) : '--:--';
  return mmss((Math.max(...taken) - Math.min(...taken)) / 1000);
}

const branding = (tpl) => ({
  event: settings.eventName,
  caption: settings.printCaption,
  date: settings.printDate,
  word: settings.printWord,
  // The "003." on the sheet. A real running count across the event, which is
  // what makes it read as a print run rather than decoration.
  sequence: settings.sheetCounter,
  // Receipt copy. The rows need the layout, because the number of them is
  // the number of frames it takes.
  para: settings.printPara,
  footer: settings.printFooter,
  link: settings.printLink,
  tracks: tpl ? receiptTracks(tpl) : [],
  total: sessionTotal(),
});

/* How big the paper is for a given layout. Fixed media answer from their own
 * dimensions; a roll only knows once the flow has been measured. */
function sheetPixels(tpl, media){
  if (tpl.kind === 'canvas') return canvasPixels(tpl, media);
  if (!media.flow) return mediaPixels(media);
  const w = Math.round(media.w * media.dpi);
  return {w, h: receiptPlan(tpl, branding(tpl), w, {}).height};
}

/* ==================================================================== *
 * Camera
 * ==================================================================== */
const video = document.getElementById('video');
const uvcImage = document.getElementById('uvc');
const camMsg = document.getElementById('cam-msg');
let stream = null;

/* The camera the booth drives itself.
 *
 * Some tablets will not hand a plugged-in USB camera to any app — the
 * external-camera support Android leaves optional. On those the shell talks
 * to the camera over the USB bus directly and serves the frames back as an
 * MJPEG stream from the app's own origin, so this is a picture in an <img>
 * rather than a MediaStream in a <video>. Everything downstream — the
 * countdown, the capture, the sheet — works the same either way, because
 * `grabFrame` is the only thing that ever reads the pixels.
 */
const uvc = {running: false, width: 0, height: 0};

function readUvcStatus(){
  if (!NATIVE || !NATIVE.uvcStatus) return {running: false, width: 0, height: 0, message: ''};
  let raw = '';
  try { raw = NATIVE.uvcStatus() || ''; } catch { return {running:false, width:0, height:0, message:''}; }
  const [state, size, message] = raw.split('\t');
  const [w, h] = (size || '0x0').split('x').map(Number);
  return {running: state === 'RUNNING', width: w || 0, height: h || 0, message: message || ''};
}

/// Points the <img> at the live stream, or takes it down again.
function showUvc(on){
  uvc.running = on;
  if (on) {
    // A fresh query string each time, or the browser reuses the finished
    // stream from the last session and the picture never starts.
    let path = '/__camera/stream.mjpg';
    try { if (NATIVE.uvcStreamPath) path = NATIVE.uvcStreamPath(); } catch {}
    uvcImage.src = path + '?t=' + Date.now();
    uvcImage.hidden = false;
    video.hidden = true;
    camMsg.hidden = true;
  } else {
    uvcImage.removeAttribute('src');
    uvcImage.hidden = true;
    video.hidden = false;
  }
  applyMirror();
}

/// Called by the shell when the operator starts or stops the camera.
function uvcChanged(){
  const state = readUvcStatus();
  uvc.width = state.width; uvc.height = state.height;
  showUvc(state.running);
  if (session.step === 'admin') renderAdmin();
}

/* A plugged-in camera wins.
 *
 * Someone who has connected a camera to the booth meant it, so an external
 * lens beats the tablet's own every time. A USB camera reports itself with
 * a name rather than a facing direction, which is the only signal the web
 * platform gives — there is no "is this external" flag — so the label is
 * what we match on.
 *
 * The Kodak Charmera is a UVC device: plugged into USB-C **with no microSD
 * card in it** it comes up as a webcam and the tablet hands it over like any
 * other camera. With a card in, it mounts as a drive instead and no app can
 * take a preview from it. That is a setting on the camera, not something the
 * booth can work around — take the card out and it just works.
 */
const EXTERNAL_CAMERA = /charmera|kodak|uvc|usb|external|webcam|capture|hdmi/i;
/* Android names its own lenses "camera2 0, facing back" and iPadOS says
 * "Front Camera". A built-in lens that happens to mention USB in its name —
 * some tablets do — must not be mistaken for the one someone plugged in, so
 * a stated facing direction disqualifies it. */
const BUILT_IN_CAMERA = /facing (front|back)|\b(front|back|rear|desk view)\b|built-?in/i;

/// Takes a camera from `listCameras`, not a bare label: a camera whose name
/// the browser has not revealed yet gets a placeholder, and a placeholder is
/// no evidence either way.
function isExternalCamera(cam){
  if (!cam || !cam.named) return false;
  const label = cam.label || '';
  if (BUILT_IN_CAMERA.test(label)) return false;
  /* iPadOS names its own lenses Front Camera, Back Camera and Desk View
   * Camera, and nothing else — so on an iPad whatever is left over is
   * something plugged in. That catches USB cameras whose product name says
   * nothing about being a webcam, which the keyword list below cannot. */
  if (IPADOS) return true;
  return EXTERNAL_CAMERA.test(label);
}

/// The constraint to open with, given what is plugged in right now.
async function resolveCamera(){
  const want = settings.cameraId || 'auto';
  const cams = await listCameras();

  if (want !== 'auto' && want !== 'builtin') {
    const pinned = cams.find(c => c.deviceId === want);
    // A pinned camera that has been unplugged falls through to auto rather
    // than dead-ending the booth mid-event.
    if (pinned) return {deviceId: {exact: pinned.deviceId}};
  }
  if (want === 'builtin') return {facingMode: 'user'};

  const external = cams.find(c => isExternalCamera(c));
  return external ? {deviceId: {exact: external.deviceId}} : {facingMode: 'user'};
}

/// The device the open stream is actually on, for Admin and for the upgrade
/// check below.
function activeCameraId(){
  const track = stream && stream.getVideoTracks()[0];
  if (!track || !track.getSettings) return '';
  return track.getSettings().deviceId || '';
}

/// The size and rate of the picture actually arriving, for Admin. A label can
/// lie about which camera is open — a resolution cannot. The Charmera is a
/// VGA-class webcam, so 640x480 on a tablet whose own lens does 1080p is the
/// plainest confirmation that the right camera is in use.
/// True when the booth is holding a live camera, which on iOS also means the
/// one permission prompt of this launch has been answered.
function cameraHeld(){
  if (uvc.running) return true;
  return !!(stream && stream.getVideoTracks().some(t => t.readyState === 'live'));
}

/* Take the camera again if it has been dropped underneath us.
 *
 * iOS ends the tracks of a web app that has been in the background, and an
 * ended track is not an error — it is a black preview and a countdown that
 * photographs nothing. Since the stream object survives, the only reliable
 * test is the track's own readyState. Returns whether it had to act.
 */
async function recoverCameraIfDropped(){
  if (cameraHeld()) return false;
  stopCamera();
  try { await startCamera(); } catch {}
  return true;
}

function cameraHoldState(){
  if (!HOLD_CAMERA) return cameraHeld() ? 'OPEN' : 'NOT OPEN';
  return cameraHeld() ? 'HELD FOR THIS LAUNCH' : 'NOT GRANTED YET';
}

/* What to say about camera permission on iOS, where it is the thing most
 * likely to go wrong in front of a queue and the thing least fixable in code.
 */
function permissionNote(){
  const held = cameraHeld();
  const home = isStandalone();
  if (!held) {
    return 'The booth does not have the camera yet. Press LOOK AGAIN and ' +
           'allow it. No web page can grant itself a camera — iOS asks, and ' +
           'only the person holding the iPad can answer.' +
           (home ? ' Do it now, before the queue starts.' : '');
  }
  if (home) {
    return 'The camera is held for as long as this app stays open, so no guest ' +
           'will be asked. iOS throws the answer away when the app is closed, ' +
           'and gives no way to remember it, so expect exactly one prompt each ' +
           'time the booth is launched — answer it yourself at setup and it ' +
           'will not come back. Do not close the app between guests. To be rid ' +
           'of the prompt entirely, open the booth in Safari instead of from ' +
           'the Home Screen and set Settings › Safari › Camera to Allow; that ' +
           'setting is remembered, at the cost of the address bar.';
  }
  return 'The camera is held for as long as this tab stays open, so no guest ' +
         'will be asked. Set Settings › Safari › Camera to Allow to have the ' +
         'answer remembered across launches.';
}

function feedDescription(){
  if (uvc.running) {
    const w = uvcImage.naturalWidth || uvc.width, h = uvcImage.naturalHeight || uvc.height;
    return w && h ? w + 'x' + h + ' USB' : 'USB, NO FRAME YET';
  }
  if (!stream) return 'NOT OPEN';
  const track = stream.getVideoTracks()[0];
  if (!track) return 'NO VIDEO TRACK';
  const set = track.getSettings ? track.getSettings() : {};
  const w = set.width || video.videoWidth, h = set.height || video.videoHeight;
  if (!w || !h) return 'OPEN, NO FRAME YET';
  return w + 'x' + h + (set.frameRate ? ' ' + Math.round(set.frameRate) + 'fps' : '');
}

/* `enumerateDevices` hands back blank labels until the page holds a camera
 * grant, so the very first open of a fresh install cannot tell a USB camera
 * from the built-in one and lands on the built-in. Once a stream exists the
 * labels are real — so look again, and switch if the camera someone plugged
 * in was there all along. Runs only on AUTO; a pinned choice is obeyed. */
async function upgradeToExternalCamera(){
  if ((settings.cameraId || 'auto') !== 'auto') return;
  const cams = await listCameras();
  const external = cams.find(c => isExternalCamera(c));
  if (!external || external.deviceId === activeCameraId()) return;
  try {
    const better = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {deviceId: {exact: external.deviceId},
              width: {ideal: 1920}, height: {ideal: 1080}},
    });
    stopCamera();
    stream = better;
    video.srcObject = stream;
    try { await video.play(); } catch {}
  } catch {
    // The built-in one is already running and working. Keep it.
  }
}

async function startCamera(){
  // A camera the booth drives itself is already open and needs nothing from
  // getUserMedia, which cannot see it in the first place.
  if (NATIVE) {
    const state = readUvcStatus();
    if (state.running) {
      uvc.width = state.width; uvc.height = state.height;
      showUvc(true);
      return true;
    }
    if (uvc.running) showUvc(false);
  }
  if (stream) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamError('This browser will not give a page the camera.\n\n' +
                 'Camera access needs a secure context — open the booth over ' +
                 'http://localhost, not as a file:// document.');
    return false;
  }
  const wanted = await resolveCamera();
  const constraints = {
    audio: false,
    video: Object.assign({width: {ideal: 1920}, height: {ideal: 1080}}, wanted),
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // A chosen camera that has been unplugged must not dead-end the booth.
    if (constraints.video.deviceId) {
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
  await upgradeToExternalCamera();
  return true;
}

function cameraMessage(err){
  const name = err && err.name;
  if (name === 'NotAllowedError')
    return 'Camera access was refused.\n\nAllow it for this site in Safari ›\n' +
           'Settings for This Website, or in Chrome\'s address-bar camera icon,\nthen press START again.';
  if (name === 'NotFoundError')
    return 'No camera was found.\n\nIf a USB camera is plugged in, check it is\n' +
           'switched on. A Kodak Charmera only appears as a camera\n' +
           'when there is no memory card in it — with a card it\n' +
           'mounts as a drive instead.';
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

/* Plug a camera in and look for it again, from Admin.
 *
 * This exists because of two things Safari does. It hands back blank labels,
 * and on iPadOS will not list a USB camera at all, until the page holds a
 * camera grant — so the first look of a fresh install always lands on the
 * built-in lens. And it does not reliably fire `devicechange` when something
 * is plugged into the USB-C port, so the listener below never runs. Opening a
 * stream (which asks for the grant if it does not have one), then listing
 * again, then reopening on whatever AUTO now prefers, is the whole fix.
 */
async function rescanCameras(){
  // No camera yet: take one. Asking is also what makes Safari reveal device
  // names at all, and on iPadOS list a USB camera at all, so this is the step
  // that turns an empty SEEN row into a useful one.
  if (!stream) { await startCamera(); renderAdmin(); return; }

  // A page already holding a camera already holds the grant, and on iOS
  // letting go to look again would buy a second prompt for nothing. Look
  // while still holding.
  const want = settings.cameraId || 'auto';
  if (want === 'auto') {
    // Opens the better camera before dropping the current one, so the grant
    // is never released in between.
    await upgradeToExternalCamera();
  } else {
    const cams = await listCameras();
    const pinned = cams.find(c => c.deviceId === want);
    if (pinned && pinned.deviceId !== activeCameraId()) {
      stopCamera();
      await startCamera();
    }
  }
  renderAdmin();
}

/* Someone plugs the camera in while the booth is sitting on the attract
 * screen — which is exactly when they would — so drop the open stream and
 * let the next session pick again. Never mid-session: yanking the camera
 * out from under a countdown is worse than finishing on the built-in one. */
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (HOLD_CAMERA) return;   // dropping it here would cost a fresh prompt
    if (session.step === 'attract' || session.step === 'admin') stopCamera();
  });
}

/* Grabs the current frame at the camera's own resolution.
 * Never mirrored — a mirrored print reverses every logo in the room, even
 * though the preview is mirrored so people can pose. */
function grabFrame(){
  // One place reads the pixels, so nothing downstream has to know which
  // kind of camera produced them.
  const source = uvc.running ? uvcImage : video;
  const w = uvc.running ? (uvcImage.naturalWidth || uvc.width)
                        : video.videoWidth;
  const h = uvc.running ? (uvcImage.naturalHeight || uvc.height)
                        : video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  try { c.getContext('2d').drawImage(source, 0, 0, w, h); }
  catch { return null; }
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
  /* When each frame was taken, parallel to `photos`. The receipt's shot
     order is timed from these, so they are session data, not decoration. */
  times: [],
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
  editor:   ['EDITOR',     'OPERATOR'],
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
  if (session.step === 'attract' || session.step === 'admin' || session.step === 'editor') return;
  if (!settings.idleReturnSeconds) return;
  session.idleTimer = setTimeout(() => {
    if (session.step !== 'attract' && session.step !== 'admin' &&
        session.step !== 'editor') abandon();
  }, settings.idleReturnSeconds * 1000);
}

function begin(){
  keepAwake();
  session.photos = [];
  session.times = [];
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
  session.times = new Array(tpl.shots).fill(null);
  session.marks.clear();
  applySheetAspect();
  session.sheet = null;
  go('capture');
  runCaptureSequence();
}

function abandon(){
  // Back, Esc and the header arrow all land here. In the layout editor they
  // mean "back to the console", and unsaved work must not vanish on a stray
  // tap — the editor decides.
  if (session.step === 'editor' && typeof editorBack === 'function') { editorBack(); return; }
  session.captureToken++;
  clearTimeout(session.idleTimer);
  clearTimeout(session.thankYouTimer);
  session.photos = [];
  session.times = [];
  session.marks.clear();
  session.sheet = null;
  session.copies = settings.defaultCopies;
  // Holding the camera is what keeps the permission prompt off the next
  // guest's face. See HOLD_CAMERA.
  if (!HOLD_CAMERA) stopCamera();
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
    if (frame) {
      session.photos[slots[i]] = frame;
      session.times[slots[i]] = Date.now();
    }
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
                              currentMedia(), branding(session.layout), 1,
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
    // Each tile takes its own layout's shape. Two designed receipts on the
    // same roll can be different lengths, and one shared aspect would
    // letterbox all but one of them.
    const shape = sheetPixels(tpl, currentMedia());
    tile.style.setProperty('--sheet-aspect', shape.w + ' / ' + shape.h);
    pv.appendChild(renderSheet([], tpl, currentMedia(), branding(tpl), 0.24,
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

/* Where the paper is actually coming from. The confirm screen is the last
 * thing an operator checks before an event, so it must not claim a route the
 * booth is not taking. */
function printerLabel(){
  if (!NATIVE) return 'MACOS DIALOG';
  return settings.printMode === 'thermal' ? 'BLUETOOTH THERMAL' : 'ANDROID DIALOG';
}

function showConfirm(){
  // Nobody was asked for a copy count, so it is the operator's default.
  if (settings.quickPrint) session.copies = Math.min(settings.defaultCopies, settings.maxCopies);
  compose();
  const host = el('#confirm-sheet');
  host.innerHTML = '';
  host.appendChild(session.sheet);

  const media = currentMedia();
  const px = sheetPixels(session.layout, media);
  // A roll is not a sheet, and saying so beside "80MM ROLL" is the whole
  // point of the spec block.
  setPixel(el('#confirm-well-title'), media.flow ? 'ROLL' : 'SHEET', 4);
  // A phone stage has room for the essentials only. Sheet size and printer
  // are operator detail; layout, paper and copies are what a guest is being
  // asked to confirm.
  // With the options hidden there is nothing here for a guest to decide, so
  // the whole spec block goes: they are looking at the print itself.
  screens.confirm.classList.toggle('quick', settings.quickPrint);
  el('#confirm-spec-mod').hidden = settings.quickPrint;
  el('[data-act="save-png"]').hidden = settings.quickPrint;
  // BACK stays: a guest must always be able to go back and retake.

  const rows = settings.quickPrint ? []
    : compactStage()
    ? [['LAYOUT', session.layout.name + ' / ' + session.layout.subtitle],
       ['PAPER',  media.shortName],
       ['COPIES', session.copies === 1 ? '1 PRINT' : session.copies + ' PRINTS']]
    : [['LAYOUT',  session.layout.name + ' / ' + session.layout.subtitle],
       ['PAPER',   media.shortName],
       [media.flow ? 'ROLL' : 'SHEET',
        px.w + 'x' + px.h + ' / ' + media.dpi + ' DPI'],
       ['COPIES',  session.copies === 1 ? '1 PRINT' : session.copies + ' PRINTS'],
       ['PRINTER', printerLabel()]];
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
  // On the tablet this is not a guess: the Bluetooth path has no dialog by
  // construction, and the system print sheet always has one.
  if (NATIVE) return settings.printMode === 'thermal';
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
  // A receipt is line art and a QR code: JPEG ringing around a finder pattern
  // is exactly what stops a phone reading it. Photographs keep the JPEG.
  const dataURL = media.flow ? session.sheet.toDataURL('image/png')
                             : session.sheet.toDataURL('image/jpeg', 0.95);

  setTimeout(() => {
    el('#print-status').textContent = silentPrintingLikely()
      ? 'Sending to the printer…'
      : 'Opening the print dialog…';
    setBars('#print-bars', 0.6);
    try {
      if (NATIVE) { nativePrint(dataURL, media); return; }
      openPrintDialog(dataURL, media, session.copies, () => {
        setBars('#print-bars', 1);
        finishPrinting();
      });
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }, 350);
}

/* The tablet's two routes out.
 *
 * Bluetooth is the silent one and the reason the Android build exists: the
 * sheet is dithered and sent as ESC/POS raster with no window, which is what
 * a kiosk needs and what no browser can do. The system dialog is the fallback
 * for an AirPrint/Mopria printer such as the SELPHY.
 *
 * Only the Bluetooth path reports back — `nativePrintResult` below. The
 * system dialog is the guest handing over to Android, and there is no useful
 * answer to wait for. */
/* The page a sheet goes out on. A roll's page is the paper's *full* width —
 * 80 mm for a 72 mm image, 58 mm for a 48 mm one — with the image centred on
 * the part the head reaches, and as long as the image is. Used to be a fixed
 * 80 mm, which would have printed a 58 mm roll on an 80 mm page. */
const rollPaperMM = media => media.paperW || Math.round(media.w * 25.4 + 8);

function printPaperMils(media, sheet){
  if (media.flow) {
    return {w: Math.round(rollPaperMM(media) / 25.4 * 1000),
            h: Math.round(sheet.height / media.dpi * 1000)};
  }
  return {w: Math.round(media.w * 1000), h: Math.round(media.h * 1000)};
}

function nativePrint(dataURL, media){
  const px = session.sheet;
  if (settings.printMode === 'thermal') {
    NATIVE.thermalPrint(dataURL, session.copies,
                        Math.max(64, settings.thermalWidthDots | 0));
    return;                                  // finishes in nativePrintResult
  }
  // Media sizes are in mils — thousandths of an inch. A roll has no page
  // height, so its length is whatever the receipt came out.
  const page = printPaperMils(media, px);
  NATIVE.printSheet(dataURL, session.copies, page.w, page.h,
                    'Photobooth ' + media.shortName);
  setBars('#print-bars', 1);
  finishPrinting();
}

/// Called by the Android shell when a Bluetooth job has finished or failed.
function nativePrintResult(ok, message){
  // A test print from the layout editor is not a guest's print: it must not
  // advance the sheet counter or walk anyone to the thank-you screen.
  if (typeof editorPrintResult === 'function' && editorPrintResult(ok, message)) return;
  if (!ok) { fail(message || 'The printer did not answer.'); return; }
  setBars('#print-bars', 1);
  finishPrinting();
}

/* The @page and image rules for one sheet, shared by both routes below.
 *
 * A roll has no page height — `auto` lets the driver feed exactly as far as
 * the receipt is long — and the image is centred on the part of the paper the
 * head reaches: 72 mm on 80, 48 mm on 58. */
function printPageCSS(media){
  const inkMM = media.w * 25.4, paperMM = rollPaperMM(media);
  return media.flow
    ? '@page{size:' + paperMM + 'mm auto;margin:0}' +
      'img{display:block;width:' + inkMM.toFixed(2) + 'mm;height:auto;' +
      'margin:0 ' + ((paperMM - inkMM) / 2).toFixed(2) + 'mm;' +
      'page-break-after:always;break-after:page}'
    : '@page{size:' + media.w + 'in ' + media.h + 'in;margin:0}' +
      'img{display:block;width:' + media.w + 'in;height:' + media.h + 'in;' +
      'object-fit:cover;page-break-after:always;break-after:page}';
}

let printFrame = null;
function openPrintDialog(dataURL, media, copies, done){
  // iOS and iPadOS ignore `print()` called on an iframe, so the sheet has to
  // be printed from the page itself there. See printFromDocument.
  if (IPADOS) { printFromDocument(dataURL, media, copies, done); return; }
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
  const page = printPageCSS(media);
  doc.write(
    '<!doctype html><meta charset="utf-8"><title>Photobooth print</title><style>' +
    'html,body{margin:0;padding:0;background:#fff}' + page +
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

/* Printing on iPadOS.
 *
 * Safari on iPhone and iPad does nothing at all when `print()` is called on an
 * iframe — the AirPrint sheet only comes up for the top-level window. So the
 * sheet is put into the page itself, inside a block that is hidden on screen
 * and is the only thing visible on paper, and the page is printed.
 *
 * The block is left in the DOM afterwards rather than cleaned up on a timer.
 * `print()` on iOS returns before the AirPrint sheet has finished with the
 * document, so removing the images is a race that loses by printing blanks;
 * the next print replaces them instead. Hidden and inert, they cost nothing.
 */
let printout = null;
function printFromDocument(dataURL, media, copies, done){
  if (!printout) {
    printout = document.createElement('div');
    printout.id = 'printout';
    printout.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printout);
  }
  let style = el('#print-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'print-css';
    document.head.appendChild(style);
  }
  // `#printout` is display:none on screen, and on paper it is the only thing
  // that is not. Guarding on the id rather than a class means nothing the app
  // adds to the body later can leak into a print.
  style.textContent =
    '#printout{display:none}' +
    '@media print{' +
      'html,body{margin:0;padding:0;background:#fff}' +
      'body>*{display:none!important}' +
      '#printout{display:block!important}' +
      printPageCSS(media).replace(/\bimg\{/, '#printout img{') +
      '#printout img:last-child{page-break-after:auto;break-after:auto}' +
    '}';

  printout.innerHTML = Array.from({length: Math.max(1, copies)},
                                  () => '<img src="' + dataURL + '">').join('');

  // Every page has to be decoded before print() or the preview shows blanks.
  const imgs = [...printout.querySelectorAll('img')];
  let pending = imgs.length;
  const ready = () => {
    if (--pending > 0) return;
    window.print();
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
  const name = 'photobooth-' + session.layout.id + '-' + Date.now() + '.png';
  // A WebView takes a blob download nowhere at all — the tap would look like
  // it worked and nothing would ever appear. The shell writes it to the
  // tablet's Pictures instead.
  if (NATIVE) { NATIVE.savePNG(session.sheet.toDataURL('image/png'), name); return; }
  session.sheet.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
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
    // A flex-basis here would be read as a *height*: this field's parent is
    // a column, not a row, and the box grew to 320px tall on a tablet.
    'placeholder="passcode" style="width:320px;max-width:100%">' +
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

  // What AUTO would pick right now, so the operator can see the booth has
  // actually found the camera they plugged in.
  const external = cams.find(c => isExternalCamera(c));
  const inUse = cams.find(c => c.deviceId === activeCameraId());
  const camRows = [
    row('DEVICE', seg('cameraId',
      [['auto', 'AUTO (USB FIRST)'], ['builtin', 'BUILT-IN']]
        .concat(cams.map(c => [c.deviceId, c.label])), settings.cameraId || 'auto')),
    row('IN USE', '<div class="seg"><button class="on">' +
        escapeHTML((inUse && inUse.label) || (stream ? 'BUILT-IN' : 'NOT OPEN')) +
        '</button></div>'),
    // What the camera is actually sending. A Charmera is a VGA-class webcam,
    // so a 640x480 feed is the proof it is the one in use and not the lens
    // built into the tablet, whatever the label says.
    row('FEED', '<div class="seg"><button class="on">' +
        escapeHTML(feedDescription()) + '</button></div>'),
  ];

  if (NATIVE) {
    // The bus itself, unfiltered. When a camera will not show up this is the
    // one line worth reading out to someone.
    camRows.push(row('USB PORT', '<div class="seg"><button class="on">' +
        escapeHTML(usbDevices().map(d => d.name + ' / ' + d.kind).join('  ·  ') || 'EMPTY') +
        '</button></div>'));
    // And what Android's own camera system makes of it. A video device on the
    // bus with no EXTERNAL here is a tablet that will never share the camera.
    camRows.push(row('ANDROID SEES', '<div class="seg"><button class="on">' +
        escapeHTML(systemCameras() || 'NONE') + '</button></div>'));
  } else {
    // Every camera the page can see, labelled exactly as the browser labels
    // it. The heuristic that picks the external one matches on these strings,
    // so when AUTO guesses wrong this row is the thing to read out.
    camRows.push(row('SEEN', '<div class="seg"><button class="on">' +
        escapeHTML(cams.map(c => c.label).join('  ·  ') || 'NONE') +
        '</button></div>'));
    // Safari withholds labels, and on iPadOS will not list a USB camera at
    // all, until the page holds a camera grant — and it does not reliably
    // fire devicechange when one is plugged in. So: a button.
    camRows.push(row('USB CAMERA', '<div class="seg">' +
        '<button data-act="camera-rescan">LOOK AGAIN</button></div>'));
    // Whether the one prompt iOS allows has been answered yet. HELD is the
    // state a booth should be left in before the doors open.
    camRows.push(row('ACCESS', '<div class="seg"><button class="on">' +
        escapeHTML(cameraHoldState()) + '</button></div>'));
  }

  camRows.push(
    row('MIRROR PREVIEW', seg('mirrorPreview', [[true, 'ON'], [false, 'OFF']], settings.mirrorPreview)),
    row('COUNTDOWN', num('countdownSeconds', 1, 10, 1, 's')),
    row('SHOT GAP', num('betweenShotsSeconds', 0.5, 6, 0.5, 's')),
    note(external ? 'info' : 'warn', external
      ? 'AUTO is using the plugged-in camera: ' + external.label + '. Unplug it and the booth falls back to the built-in lens on the next session.'
      : usbCameraNote(cams)),
    note('info', 'The preview is mirrored so people can pose. The saved photo never is — a mirrored print reverses every logo in the room.'));
  if (HOLD_CAMERA) camRows.splice(camRows.length - 1, 0, note(
    cameraHeld() ? 'info' : 'warn', permissionNote()));
  parts.push(section('CAMERA', 'camera', camRows));

  const silent = silentPrintingLikely();
  const printRows = [
    row('PAPER', seg('mediaID', Object.values(MEDIA).map(m => [m.id, m.name]), settings.mediaID)),
    row('MAX COPIES', num('maxCopies', 1, 20, 1, '')),
    row('COPIES PER PRINT', num('defaultCopies', 1, 20, 1, '')),
    row('PRINT OPTIONS', seg('quickPrint',
      [[true, 'HIDDEN'], [false, 'SHOWN']], settings.quickPrint)),
    note(settings.quickPrint ? 'info' : 'warn', settings.quickPrint
      ? 'Hidden: the guest sees their print and one PRINT button. No copy count, no spec, no save. COPIES PER PRINT above is what comes out.'
      : 'Shown: the guest picks a copy count and sees the sheet spec before printing.'),
  ];
  if (NATIVE) {
    // On the tablet the mode is a real choice, not an inference.
    printRows.push(row('PRINT MODE', seg('printMode',
      [['dialog', 'SYSTEM DIALOG'], ['thermal', 'BLUETOOTH']], settings.printMode)));
    printRows.push(note(silent ? 'info' : 'warn', silent
      ? 'Silent. Pressing PRINT dithers the sheet and sends it straight out over Bluetooth — no window, nothing for a guest to tap. Pick the printer below.'
      : 'The Android print sheet will appear. It finds an AirPrint printer such as the SELPHY over Mopria. For a booth with nobody minding it, switch to BLUETOOTH.'));
  } else {
    printRows.push(row('PRINT MODE',
        '<div class="seg"><button class="' + (silent ? 'on' : '') + '">SILENT</button>' +
        '<button class="' + (silent ? '' : 'on') + '">DIALOG</button></div>'));
    printRows.push(note(silent ? 'info' : 'warn', silent
      ? 'Silent: pressing PRINT sends the sheet straight to the default printer, no window. Make the SELPHY the default printer and set its paper to borderless 4x6 — Chrome uses those defaults and asks nothing.'
      : 'A print dialog will appear. To print silently, quit Chrome and run ./kiosk-chrome.sh — it relaunches Chrome with --kiosk-printing, which is the only way a browser can print without a window. Safari cannot do it at all.'));
  }
  parts.push(section('PRINT', 'printer', printRows));

  parts.push(section('LAYOUT EDITOR', 'star', [
    row('YOUR LAYOUTS', '<div class="seg"><button class="on">' +
      (settings.customLayouts || []).length + ' MADE</button></div>'),
    row('', '<button class="btn solid" data-act="editor-open" style="min-width:260px">' +
      '<span class="px" data-cell="4">OPEN EDITOR</span></button>'),
    note('info', 'Design your own print for any paper: SELPHY postcard, L or card, a thermal roll, or a size you enter. Start from a built-in layout or a blank page, place photos, text, lines, boxes and a QR code, and test-print before offering it to guests.'),
  ]));
  if (NATIVE) parts.push(usbCameraSection());
  if (NATIVE) parts.push(thermalSection());

  parts.push(section('PRINT DESIGN', 'star', [
    row('EVENT', field('eventName', 'e.g. Ana & Miguel')),
    row('DISPLAY WORD', field('printWord', 'e.g. SATIROLOGIA')),
    row('CAPTION', field('printCaption', 'e.g. @mixelbooth')),
    row('PRINT DATE', seg('printDate', [[true, 'ON'], [false, 'OFF']], settings.printDate)),
    row('PHOTO TONE', seg('photoTone', [['mono', 'MONO'], ['colour', 'COLOUR']], settings.photoTone)),
    row('SHEET NO.', num('sheetCounter', 1, 999, 1, '')),
    note('info', 'DISPLAY WORD is the oversized word on the sheet — a long one runs off the edge on purpose, and on a receipt it is the script line under the event name. Leave it empty to use the event name. SHEET NO. prints as "003." and counts up with every print.'),
  ]));

  parts.push(section('RECEIPT', 'printer', [
    row('SHOT NAMES', field('printTracks', 'comma separated, e.g. ARRIVAL, THE TOAST')),
    row('PARAGRAPH', field('printPara', 'the small print above the QR')),
    row('FOOTER', field('printFooter', 'e.g. THE ART OF THE MOMENT')),
    row('QR LINK', field('printLink', 'https://… — empty prints no code')),
    note(currentMedia().flow ? 'info' : 'warn', currentMedia().flow
      ? 'Receipt mode is on. Guests choose between the 1, 2 and 4 shot rolls; the shot order is timed from the first shutter, so those minutes are real. Leave SHOT NAMES empty for FRAME 01, FRAME 02.'
      : 'These only appear on 80mm thermal. Set PAPER above to "80mm Thermal Roll" to put the booth into receipt mode.'),
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

/* Driving a USB camera the tablet refuses to share.
 *
 * This is the fallback for a tablet whose Android does not offer external
 * cameras to apps at all. The booth talks to the camera over the USB bus
 * itself. It is deliberately a button rather than automatic: opening a USB
 * device raises a system permission dialog, which must never appear in
 * front of a guest.
 */
function usbCameraSection(){
  const state = readUvcStatus();
  let report = '';
  try { report = (NATIVE.uvcReport && NATIVE.uvcReport()) || ''; } catch {}

  const rows = [];
  rows.push(row('CAMERA SAYS', '<div class="seg"><button class="on">' +
    escapeHTML(report || 'NOTHING PLUGGED IN') + '</button></div>'));
  rows.push(row('DIRECT DRIVE',
    '<div class="seg">' +
    '<button data-act="uvc-start" class="' + (state.running ? 'on' : '') + '">START</button>' +
    '<button data-act="uvc-stop" class="' + (state.running ? '' : 'on') + '">STOP</button>' +
    '</div>'));
  // Proves the picture path end to end without a camera: if the pattern
  // shows and a test shot lands on the sheet, everything except the camera
  // itself is working.
  rows.push(row('TEST PATTERN',
    '<div class="seg"><button data-act="uvc-test">RUN 1 MINUTE</button></div>'));
  if (state.message) {
    rows.push(row('RESULT', '<div class="seg"><button class="on">' +
      escapeHTML(state.message) + '</button></div>'));
  }

  const isochronous = /ISOCHRONOUS/i.test(report);
  rows.push(note(state.running ? 'info' : (isochronous ? 'warn' : 'info'),
    state.running
      ? 'The booth is driving the camera itself. It stays on between sessions; press STOP to hand it back.'
      : isochronous
        ? 'This camera streams over an isochronous endpoint. Android\'s USB API cannot read those from an app at all, so the booth cannot drive it this way — the limit is Android\'s, and no app on this tablet gets past it. A camera with a bulk endpoint, or a tablet that shares external cameras, would both work.'
        : 'Use this only when ANDROID SEES above has no EXTERNAL entry — that is a tablet refusing to share the camera. START asks for USB permission once, then the booth reads the camera directly. CAMERA SAYS above is read straight off the camera\'s own descriptors.'));
  return section('USB CAMERA', 'camera', rows);
}

/* The tablet's Bluetooth printer. Devices come from the OS's paired list —
 * pairing itself happens in Android Settings, because a booth should not be
 * scanning for radios in front of a guest. */
function thermalSection(){
  let devices = [];
  try {
    devices = (NATIVE.thermalDevices() || '').split('\n')
      .filter(Boolean)
      .map(line => line.split('\t'))
      .map(([mac, name]) => [mac, (name || mac).toUpperCase()]);
  } catch {}

  let current = '';
  try { current = (NATIVE.selectedThermalDevice() || '').split('\t')[0]; } catch {}

  const rows = [];
  if (devices.length) {
    rows.push(row('PRINTER', seg('thermalDevice', devices, current)));
  } else {
    rows.push(row('PRINTER',
      '<div class="seg"><button class="on">NONE PAIRED</button></div>'));
  }
  rows.push(row('HEAD WIDTH', seg('thermalWidthDots',
    [[576, '80MM / 576'], [384, '58MM / 384']], settings.thermalWidthDots)));
  rows.push(note(devices.length ? 'info' : 'warn', devices.length
    ? 'Paired Bluetooth devices. Pick the receipt printer, set HEAD WIDTH to match it, and set PAPER above to the 80mm roll. The sheet is dithered to 1 bit here, so what you see on the confirm screen is what burns.'
    : 'No paired Bluetooth devices. Pair the printer in Android Settings › Connected devices first, then come back — the booth never scans for radios in front of a guest.'));
  return section('BLUETOOTH PRINTER', 'printer', rows);
}

/* What is actually on the USB port, as the operator console reads it. */
function usbDevices(){
  let raw = '';
  try { raw = NATIVE ? (NATIVE.usbCameras() || '') : ''; } catch {}
  return raw.split('\n').filter(Boolean).map(line => {
    const [name, kind] = line.split('\t');
    return {name: name || 'USB DEVICE', kind: kind || 'OTHER'};
  });
}

/// Cameras Android itself lists, as "0 BACK · 1 FRONT · 2 EXTERNAL".
function systemCameras(){
  let raw = '';
  try { raw = NATIVE && NATIVE.systemCameras ? (NATIVE.systemCameras() || '') : ''; } catch {}
  return raw.split('\n').filter(Boolean)
            .map(l => l.split('\t').join(' ')).join('  ·  ');
}

/* What to tell the operator when AUTO found no external camera.
 *
 * Three different things look identical from the web page — nothing plugged
 * in, plugged in as a *drive*, or plugged in as a camera the tablet will not
 * share — and they need completely different fixes. The shell can see the
 * USB bus, so say which one it is instead of a shrug. */
function usbCameraNote(cams){
  if (!NATIVE) {
    cams = cams || [];
    // iPadOS is the one browser platform that will hand a page a USB camera,
    // so it gets the advice that can actually lead somewhere. Everything else
    // gets the short version.
    if (!IPADOS) {
      return 'No USB camera detected — AUTO is using the built-in lens. Plug a ' +
             'camera in and press LOOK AGAIN.';
    }
    if (!cams.length) {
      return 'This page has no camera yet, so it cannot see what is plugged in. ' +
             'Press LOOK AGAIN and allow the camera when Safari asks.';
    }
    return 'iPadOS shares USB cameras with web pages, but only ' + cams.length +
           ' camera' + (cams.length === 1 ? ' is' : 's are') + ' showing and ' +
           'none of them looks external. Three things to check, in this order. ' +
           'Take the memory card out of the Charmera — with a card in it is a ' +
           'drive, not a camera, and nothing can preview from it. Use a ' +
           'USB-C-to-USB-C cable: the one in the box is USB-C-to-USB-A and will ' +
           'not reach an iPad without an adapter. Then press LOOK AGAIN — ' +
           'Safari does not always notice a camera being plugged in. If it ' +
           'still will not appear, open FaceTime and see whether that finds it: ' +
           'if FaceTime cannot either, it is the camera or the cable, not the booth.';
  }
  const devices = usbDevices();
  if (!devices.length) {
    return 'Nothing is plugged into the USB port. Check the cable actually ' +
           'carries data and goes the right way round — a Kodak Charmera ships ' +
           'with a USB-C-to-USB-A cable, which needs a USB-A-to-USB-C adapter ' +
           'before it will reach a tablet. Then check the camera is switched on.';
  }
  const storage = devices.find(d => d.kind === 'STORAGE');
  if (storage) {
    return storage.name + ' is plugged in, but as a DRIVE rather than a camera, ' +
           'so there is no picture to preview. Take the memory card out of it — ' +
           'a Kodak Charmera only becomes a camera with no card inside — then ' +
           'unplug and plug it back in.';
  }
  const video = devices.find(d => d.kind === 'VIDEO');
  if (video) {
    const external = /EXTERNAL/.test(systemCameras());
    return video.name + ' is plugged in as a camera. ' + (external
      ? 'Android lists it as an EXTERNAL camera, so the tablet does share it — ' +
        'but the browser engine the booth draws in is not passing it through. ' +
        'That is fixable in the app.'
      : 'Android does not list it as a camera at all, so no app on this tablet ' +
        'can preview from it through the normal camera system. That is the ' +
        'tablet, not the booth.');
  }
  return devices.map(d => d.name).join(', ') + ' is plugged in, but not as a ' +
         'camera or a drive. If this is the Charmera, take its memory card out ' +
         'and reconnect it.';
}

const section = (title, icon, rows) =>
  '<div class="sec"><h4><span class="ic" data-icon="' + icon + '" data-size="26"></span>' +
  '<span class="px" data-cell="4">' + title + '</span></h4>' + rows.join('') + '</div>';

const row = (label, control) =>
  '<div class="arow"><label>' + label + '</label>' + control + '</div>';

/* More than a handful of choices becomes a grid rather than one long row: the
 * paper list grew past what fits across a portrait tablet, and every paper
 * the operator adds would have pushed more of it off the edge. */
const seg = (key, options, current) =>
  '<div class="seg' + (options.length > 4 ? ' wrap' : '') + '">' + options.map(([value, label]) =>
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
      else if (key === 'thermalWidthDots') value = parseInt(value, 10) || 576;
      if (key === 'thermalDevice') {
        // Which printer is paired is the OS's business, not the booth's.
        try { NATIVE.selectThermalDevice(String(value)); } catch {}
      } else {
        settings[key] = value;
        saveSettings();
      }
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
  if (key === 'cameraId') {
    // Reopen at once rather than waiting for the next guest: whatever asking
    // costs — a permission prompt on iOS — is owed by the operator standing
    // at the console, not by the person who taps START next.
    stopCamera();
    startCamera().then(renderAdmin);
  }
  if (key === 'quickPrint') saveSettings();
  if (key === 'maxCopies') session.copies = Math.min(session.copies, settings.maxCopies);
  // Anything that changes how a sheet looks re-renders the tiles, so the
  // operator sees the paper change as they type.
  if (key === 'quickPrint') renderAdmin();
  if (key === 'mediaID' || key === 'printMode') {
    applySheetAspect(); updateAttractCount(); renderAdmin();
  }
  if (['mediaID', 'photoTone', 'eventName', 'printWord', 'printCaption',
       'printDate', 'sheetCounter', 'printTracks', 'printPara',
       'printFooter', 'printLink'].includes(key)) buildLayoutTiles();
}

async function listCameras(){
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Before permission is granted the browser hands back placeholder
    // entries with an empty deviceId — which would collide with the
    // DEFAULT option and light up two segments at once.
    return devices.filter(d => d.kind === 'videoinput' && d.deviceId)
                  .map((d, i) => ({deviceId: d.deviceId,
                                   label: d.label || ('CAMERA ' + (i + 1)),
                                   // Safari hands back nameless entries until
                                   // the page holds a camera grant.
                                   named: !!d.label}));
  } catch { return []; }
}

function applyMirror(){
  video.classList.toggle('mirror', !!settings.mirrorPreview);
  uvcImage.classList.toggle('mirror', !!settings.mirrorPreview);
}

/// Publishes the chosen paper's shape as a CSS variable, so every well that
/// shows a sheet takes the sheet's aspect rather than letterboxing it.
/// The attract screen's layout count. Hard-coded it was a lie the moment the
/// paper decided how many layouts a guest is offered — a roll shows three.
function updateAttractCount(){
  const n = guestLayouts().length;
  setPixel(el('#attract-layouts'), n === 1 ? '1 LAYOUT' : n + ' LAYOUTS', 3);
}

function applySheetAspect(){
  const media = currentMedia();
  const px = sheetPixels(activeLayout(), media);
  const app = document.querySelector('.app');
  app.style.setProperty('--sheet-aspect', px.w + ' / ' + px.h);
  // A receipt is three times as tall as it is wide. The tile grid has to
  // give it room or every layout collapses into an identical sliver.
  app.classList.toggle('rollmedia', !!media.flow);
}

/* ==================================================================== *
 * Wiring
 * ==================================================================== */
const ACTIONS = {
  start: begin,
  abandon: abandon,
  retake: retake,
  keep: () => settings.quickPrint ? showConfirm() : showCopies(),
  'to-review': showReview,
  'to-copies': showCopies,
  // LOOKS GOOD skips the copy count when the options are hidden, and BACK
  // from the confirm screen has to skip it in the other direction too.
  'confirm-back': () => settings.quickPrint ? showReview() : showCopies(),
  'to-confirm': showConfirm,
  'uvc-start': () => { try { NATIVE.uvcStart(); } catch {} },
  'uvc-stop':  () => { try { NATIVE.uvcStop(); } catch {} uvcChanged(); },
  'uvc-test':  () => { try { NATIVE.uvcTestPattern(); } catch {} },
  'copies-up': () => { session.copies = Math.min(settings.maxCopies, session.copies + 1); updateCopies(); },
  'copies-down': () => { session.copies = Math.max(1, session.copies - 1); updateCopies(); },
  print: submitPrint,
  'save-png': savePNG,
  'camera-rescan': rescanCameras,
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
  // Keys typed into a field are text, not shortcuts. Without this, typing a
  // capital A into the event name — "ANA & MIGUEL" — reopened the console
  // mid-word and threw the cursor out of the field.
  const t = e.target;
  const typing = t && (t.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === 'Escape') { if (typing) t.blur(); abandon(); return; }
  if (typing) return;
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
  // Inside the tablet app every asset already lives in the APK and is served
  // by the shell. A cache-first worker on top of that could only ever serve
  // a stale build.
  if (NATIVE) return;
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
// Inside the tablet shell there is no DevTools to attach, so the stage the
// booth actually got goes to logcat once at boot. It is the first thing to
// check when a venue says "it looks like a phone".
if (NATIVE) {
  console.log('booth stage ' + window.innerWidth + 'x' + window.innerHeight +
              ' dpr=' + window.devicePixelRatio +
              ' compact=' + (window.innerWidth < 700));
}

registerServiceWorker();
paintIcons();
paintPixelText();
showInstallHintIfNeeded();
applySheetAspect();
updateAttractCount();
applyMirror();
updateCopies();
buildLayoutTiles();
tickClock();
setInterval(tickClock, 20000);
go('attract');

/* Take the camera at launch on iPadOS.
 *
 * iOS insists on one permission prompt per launch of a Home Screen web app
 * and there is no way to be rid of it. There is a way to choose who sees it:
 * asking now means it lands on whoever is setting the booth up, seconds after
 * they tap the icon, instead of on the first guest in the queue while the
 * layout screen sits there waiting.
 *
 * Failure is ignored on purpose. The attract screen shows no preview, so
 * there is nothing to report to nobody; if the grant is refused or the ask is
 * suppressed, the first session asks again as it always did.
 */
if (HOLD_CAMERA) {
  startCamera().catch(() => {});
  // A booth that has been backgrounded — a notification, a Guided Access
  // fumble — comes back with its tracks ended. Take the camera again on the
  // way in rather than letting the next guest find a black preview.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverCameraIfDropped();
  });
}

// Exposed for poking at the renderer from the console during testing.
window.booth = {session, settings, LAYOUTS, MEDIA, renderSheet, compose,
                layoutToCanvas, registerCustom, registerCanvasLayout, renderCanvas,
                canvasPixels, sheetPixels, fitsPaper,
                pixelTextCanvas, setPixel, compactStage, isStandalone,
                // Camera and print plumbing, exported so a test can reach it:
                // the iPad route through these cannot be exercised by hand
                // from this machine.
                IPADOS, HOLD_CAMERA, isExternalCamera, listCameras,
                feedDescription, cameraHeld, cameraHoldState, permissionNote,
                recoverCameraIfDropped,
                printPageCSS, printFromDocument, rescanCameras,
                // The Android shell calls these two: the back key abandons a
                // session rather than leaving the app, and a Bluetooth job
                // reports its outcome when it lands.
                abandon, nativePrintResult,
                // The shell calls this when the operator starts or stops a
                // directly-driven USB camera.
                uvcChanged};
