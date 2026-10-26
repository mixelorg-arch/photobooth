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

/* The digital copy of the session being shot.
 *
 * Top of the file, and not on `session`, because `branding()` reads it and
 * runs from places that execute while the file is still being evaluated.
 *
 * `code` is minted when a session starts rather than when it uploads: the
 * QR has to be printed minutes before the pictures it points at finish
 * going up. `sent` exists because Cloudinary's unsigned upload silently
 * refuses to overwrite an existing public_id — uploading a second time
 * would keep the take the guest rejected, and report success.
 */
const share = {code: null, count: 0, sent: false, baked: false};

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
 snapbox:["................","..KKKKKKKKKKKK..",".K............K.",".K...KKK..KK..K.",".K..K...K.KK..K.",".K.K.....K....K.",".K.K.....K....K.",".K.K.....K....K.",".K..K...K.....K.",".K...KKK......K.",".K............K.",".K............K.","..KKKKKKKKKKKK..","................","................"],
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

/* ==================================================================== *
 * UI type
 *
 * `.px` elements used to be 5x7 bitmap glyphs drawn into a canvas. They are
 * set in a real rounded face now — the kit this app is drawn from is soft
 * and round, and a pixel grid is the opposite of that.
 *
 * `pixelTextCanvas` and the GLYPHS table above are kept and still work; the
 * printed sheets never used them (those set their own faces on the sheet
 * canvas), so nothing on paper changes by a hair.
 *
 * The win is not only the look. A canvas carried its size as an *inline*
 * style, which no stylesheet rule could outrank — a trap that cost a title
 * bar and a pair of tabs in earlier passes. Text carries its colour in
 * `color` and its size in one place, so both are finally sayable.
 *
 * `cell` is kept as the unit every caller already speaks: one cell was a
 * bitmap pixel, seven of them a cap height. 5.6px a cell lands the common
 * sizes where they were.
 * ==================================================================== */
function uiScale(){
  const w = window.innerWidth;
  return w < 560 ? 0.72 : w < 760 ? 0.86 : 1;
}

function setPixel(node, text, cell){
  if (text !== undefined) node.dataset.text = text;
  const source = node.dataset.text !== undefined ? node.dataset.text : node.textContent;
  node.dataset.text = source;
  const c = cell || +(node.dataset.cell || 4);
  if (cell) node.dataset.cell = c;
  node.textContent = source;
  node.style.fontSize = Math.max(10, Math.round(c * 5.6 * uiScale())) + 'px';
}

function paintPixelText(root){
  (root || document).querySelectorAll('.px').forEach(node => {
    if (node.dataset.text !== undefined && node.textContent) return;
    setPixel(node);
  });
}

/* Every label, re-set for the width now available. One pass, because the
 * size lives in one expression. */
function refitType(){
  document.querySelectorAll('.px').forEach(node => setPixel(node));
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
                   shortName:'58MM ROLL',    w:384/203, h:0,   dpi:203, flow:true, paperW:58,
                   thermal:true},
  /* An 80mm thermal roll. 72mm of that is printable on every common head,
   * and at 203dpi that is 576 dots — the width nearly every ESC/POS printer
   * expects. Height is not a paper size at all: a receipt is as long as its
   * content, so `flow` tells the renderer to measure instead of fit. */
  'thermal-80':   {id:'thermal-80',   name:'80mm Thermal Roll (receipt)',
                   shortName:'80MM ROLL',    w:576/203, h:0,   dpi:203, flow:true, paperW:80,
                   thermal:true},
  /* A 100mm roll, which is what a 4-inch label printer is.
   *
   * This exists because of what scaling does to a dither. The 80mm roll
   * renders 576 dots wide; sent to a 4-inch head it has to be enlarged, and
   * enlarging a one-bit image resamples it back into grey — measured, 2
   * levels become 256 — which the driver then thresholds all over again. The
   * careful dithering is undone and photographs come back as solid blobs.
   *
   * Rendering at the paper's own width means the dots the booth chose are the
   * dots that burn, one for one, with nothing in between to undo them. 799
   * dots is 100mm at 203dpi, matching the 100 x 150 label below exactly. */
  'thermal-100':  {id:'thermal-100',  name:'100mm Thermal Roll (receipt)',
                   shortName:'100MM ROLL',   w:799/203, h:0,   dpi:203, flow:true, paperW:100,
                   thermal:true},
  /* Waybill stickers, for a 4-inch thermal label printer such as the VOZY U9.
   *
   * A label is a page, not a roll. The printer feeds to the gap between
   * stickers and stops, so unlike the receipt rolls above these are fixed
   * sheets and get the ordinary sheet layouts. 203 dpi is the head's own
   * resolution, so the render lands on the paper at 1:1.
   *
   * Two sizes, because "A6" is sold loosely. The stickers bundled with these
   * printers are usually 100 x 150 mm; true A6 is 105 x 148 mm. Measure one
   * and pick the match — a 5 mm error shows as a crooked edge on every print.
   * Any other size can be added under LAYOUT EDITOR.
   *
   * 100 x 150 is 799 dots and fits a 4-inch head (832 dots of 104 mm) with
   * room to spare. True A6 is 839, a hair wider than the head can reach, so
   * that last 0.9 mm is scaled away by the driver. It is not visible, but it
   * is why 100 x 150 is the better of the two if the stock is a choice. */
  'label-100x150':{id:'label-100x150',name:'100 x 150 mm Label (waybill sticker)',
                   shortName:'100X150 LABEL', w:100/25.4, h:150/25.4, dpi:203, thermal:true},
  'label-a6':     {id:'label-a6',     name:'A6 Label 105 x 148 mm (sticker)',
                   shortName:'A6 LABEL',      w:105/25.4, h:148/25.4, dpi:203, thermal:true},
  /* A small landscape sticker — the size barcode and price labels come on,
   * and the cheapest roll a booth can run.
   *
   * 50 x 40 mm is 399 x 319 dots at 203 dpi, which is less than a fifth of
   * the area of the waybill label and changes what can go on it. There is
   * room for one photograph and a few lines of type; a four-shot grid on this
   * paper prints four thumbnails nobody can make out. The template below is
   * built for that constraint rather than scaled down from a bigger one. */
  'label-50x40':  {id:'label-50x40',  name:'50 x 40 mm Label (small sticker)',
                   shortName:'50X40 LABEL',   w:50/25.4,  h:40/25.4,  dpi:203, thermal:true},
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
  /* SMALL STICKER — built for the 50 x 40 mm label and nothing else.
   *
   * Laid out against the dot grid rather than the page fraction, because at
   * 399 x 319 dots the difference matters: a rule at 0.006 of the width is
   * two dots, and a caption at 0.04 is sixteen. Everything here was chosen at
   * that size and then written back as fractions.
   *
   * One photograph, portrait, taking the left half — a face is what a booth
   * sticker is for, and a face wants height. The right column carries the
   * type in a stack so the eye reads down it rather than hunting across a
   * strip 21 mm wide.
   *
   * `kind: 'canvas'` so it is already in the editor's own format: opening it
   * gives an editable starting point with no conversion, and its geometry is
   * exactly what prints. */
  /* STICKER PACK — four 50 x 40 mm labels, one photograph each.
   *
   * Not four photographs on one label. At this size a four-up grid gives 9 mm
   * cells, which is nobody's face; measured against the other papers, 50 x 40
   * is the one size where the grid layouts stop being worth printing. So the
   * session still takes four shots and the printer feeds four separate
   * stickers — a pack, which is also a better object than a strip: four
   * things to give away rather than one to keep.
   *
   * `pack: 4` is what makes a layout print once per photograph. The layout
   * itself holds a single photo element reading src 0, and the renderer hands
   * it a different picture each time round.
   *
   * Every number is a whole dot on a 400 x 320 sheet, written back as a
   * fraction. A rule at y = 0.840 lands on 268.8, straddles two rows, and the
   * dither splits the ink — so it prints as a line of dots while the same
   * rule at 269.0 prints solid. At this size the grid is coarse enough to
   * see. */
  { id:'sticker-pack', name:'4 STICKERS', subtitle:'PACK OF FOUR', accent:'#A9A2CE',
    kind:'canvas', mediaID:'label-50x40', background:'#FFFFFF', mono:true,
    pack:4,
    elements:[
      // Event name, and the rule it sits on.               y = 34, 44
      {t:'text', text:'{event}', x:0.05, y:0.10625, size:0.0550, weight:800,
       tracking:0.06, case:'upper'},
      {t:'line', x:0.05, y:0.13750, w:0.90, weight:0.0075},

      // The photograph: 170 x 200 dots, about 21 x 25 mm.
      {t:'photo', src:0, x:0.05, y:0.17500, w:0.425, h:0.625, fit:'fill'},

      // The right-hand stack, read downwards.        x = 205
      {t:'text', text:'{word}', x:0.5125, y:0.33125, size:0.0875, weight:800,
       tracking:-0.03},
      {t:'text', text:'{caption}', x:0.5125, y:0.41875, size:0.0425, weight:400,
       tracking:0.14, case:'upper', colour:'dim'},
      {t:'line', x:0.5125, y:0.46875, w:0.4375, weight:0.0050, dash:0.0125},
      {t:'text', text:'{date}', x:0.5125, y:0.55938, size:0.0450, weight:700,
       tracking:0.06, case:'upper'},
      // Which of the four this is. The pack is the point, so each sticker
      // says where it sits in it.
      {t:'text', text:'{i}/{of}', x:0.95, y:0.75625, size:0.1050, weight:800,
       tracking:-0.03, align:'right'},

      // Foot.                                        y = 269, 298
      {t:'line', x:0.05, y:0.84063, w:0.90, weight:0.0075},
      {t:'text', text:'{footer}', x:0.05, y:0.93125, size:0.0400, weight:400,
       tracking:0.12, case:'upper', colour:'dim'},
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

/* Distinct photographs a layout needs. Derived, never hand-written: a slot
 * list and a shot count that disagree is a bug waiting to happen.
 *
 * A built-in written in the editor's own canvas format has elements rather
 * than slots, so it goes through the same registration an editor-made layout
 * does — which derives the slots, the shot count and the capture guide's
 * aspect from the photo elements themselves. */
LAYOUTS.forEach(l => {
  if (l.kind === 'canvas') { registerCanvasLayout(l); return; }
  l.shots = new Set(l.slots.map(s => s.src)).size;
});

const layoutById = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

/* ==================================================================== *
 * The renderer — a direct port of PhotoLayoutRenderer.swift. The preview
 * on screen and the sheet that reaches the printer are the same canvas,
 * so a tile can never disagree with the paper.
 * ==================================================================== */
/* Resampling quality for every photograph drawn into a sheet.
 *
 * This is the upscale end of the thermal pipeline. A booth photograph is
 * almost never the size of the slot it lands in: a 1920-wide capture is
 * reduced into a 780-wide slot on a label, and a Kodak Charmera, which is
 * VGA-class, is genuinely *enlarged* to fill the same slot. The browser's
 * default resampling is a single bilinear step, which blurs on the way down
 * and goes soft and blocky on the way up — and a dither turns softness into
 * mush, because there is no grey left to carry a soft edge.
 *
 * `high` costs nothing here and is the difference between a face that
 * survives one bit and one that does not. Set on the context, so every
 * drawImage in every renderer inherits it.
 */
function smoothing(g){
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  return g;
}

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
  const g = smoothing(c.getContext('2d'));

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
    // Which sticker of the pack, and how many there are. 1 and 1 on
    // anything that is not a pack, so the tokens are harmless elsewhere.
    .replace(/\{i\}/g,       String(branding.index || 1))
    .replace(/\{of\}/g,      String(branding.packSize || 1))
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
  const g = smoothing(c.getContext('2d'));
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
  const g = smoothing(c.getContext('2d'));
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
  /* A pack holds one photo element and prints once per photograph, so its
   * shot count comes from the pack size rather than from the distinct slots
   * — otherwise a four-sticker pack would shoot once and print the same face
   * four times. */
  tpl.shots = tpl.pack > 1 ? tpl.pack : new Set(tpl.slots.map(s => s.src)).size;
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
    // `pack` travels with the layout. Without it, opening the four-sticker
    // pack in the editor quietly turned it into a one-shot layout, and
    // saving would have written that back.
    return Object.assign(base, {length: tpl.length, mono: !!tpl.mono,
      pack: tpl.pack > 1 ? tpl.pack : undefined,
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
/* The built-in layouts that existed before `layoutsSeen` was recorded.
 *
 * A booth updated from an older build has no record of what it has been
 * offered, and "add every built-in that is missing" would march back in and
 * unhide each layout the operator had deliberately turned off. Seeding the
 * record with this list instead means such a booth is offered only what is
 * genuinely newer than it. Never add to this: it is a description of the
 * past, not a list of what ships. */
const LAYOUTS_BEFORE_SEEN = ['one-full', 'one-polaroid', 'two-stack',
                             'four-grid', 'four-strip-duo', 'six-grid',
                             'receipt-1', 'receipt-2', 'receipt-4'];

const DEFAULTS = {
  /// 'auto' prefers a plugged-in USB camera and falls back to the built-in
  /// one; 'builtin' pins the tablet's own lens; anything else is a deviceId.
  cameraId: 'auto',
  mirrorPreview: true,
  /* --- exposure --- */
  /// Stretch each captured frame so the subject fills the tonal range. A
  /// booth guest is nearly always darker than the room behind them.
  autoExposure: true,
  /// Where the middle of the frame should land, 0-255. Higher prints lighter.
  exposureTarget: 165,
  /// How much of the correction to apply. 0 disables it.
  exposureStrength: 1,
  /* --- the screen as a flash --- */
  /// Fill the panel with white for the moment of capture. The only light a
  /// tablet booth has, and on a dark stage it is worth real stops on a face.
  flashEnabled: true,
  /// How long the white is held before the frame is read, in milliseconds.
  /// A camera needs a few frames at 30fps to meter against new light; too
  /// short and the photograph is taken before the exposure has moved.
  flashHoldMs: 140,
  /// How white. Below 1 it is gentler on the eye and gives less light.
  flashLevel: 1,
  countdownSeconds: 3,
  betweenShotsSeconds: 1.5,
  defaultCopies: 1,
  maxCopies: 10,
  mediaID: 'postcard-4x6',
  guestLayoutIDs: ['one-full', 'one-polaroid', 'two-stack',
                   'four-grid', 'four-strip-duo', 'six-grid',
                   'receipt-1', 'receipt-2', 'receipt-4',
                   'sticker-pack'],
  /// Built-in layouts these settings have already been offered. A layout
  /// added in a later build is put in front of guests once, and a layout the
  /// operator then hides stays hidden — which is why this is a record of what
  /// has been seen rather than a straight comparison with the built-in list.
  layoutsSeen: [],
  eventName: '',
  printCaption: '',
  printDate: true,
  /// The oversized display word. Falls back to the event name.
  printWord: '',
  /// Running sheet number, printed as "003.". Increments on every print.
  sheetCounter: 1,
  /// Photographs are monochrome to match the print design. MONO or COLOUR.
  photoTone: 'mono',
  /// MAX asks the open camera for its largest mode rather than taking the
  /// browser's default, which can be VGA on a camera that offers 4K. HD
  /// stays at 1920x1080, which is lighter on a tablet.
  captureSize: 'max',
  /// How long to let a just-opened camera meter before trusting a frame from
  /// it. The countdown normally covers this; a retake does not.
  cameraSettleMs: 700,
  /// Freeze exposure and white balance after that settle, so every shot in a
  /// strip matches. Only possible where the camera and browser both support
  /// it — see cameraLockNote, which never claims a lock the booth does not
  /// actually hold.
  lockCamera: true,

  /* --- preparing a photograph for a one-bit head ---
   *
   * Every one of these is a calibration value, not a taste value: they exist
   * because a thermal head and a screen disagree, and the right number
   * depends on the printer, the paper and the room. The defaults are a
   * starting point for a portrait on 80mm paper; the calibration sheet in
   * Admin prints six variants so an operator can settle them in one go
   * rather than one print at a time.
   *
   * They are saved, so a device that has already been calibrated keeps its
   * own numbers and is not moved by a change of default here.
   */
  /// How the sheet is reduced to the only two things a thermal head can
  /// print. 'atkinson' throws a quarter of the error away so faces cannot
  /// snowball into solid black — the default, and the best of these on a
  /// portrait; 'adaptive' follows the local average; 'floyd' diffuses all of
  /// the error and is the most tonally accurate on an evenly lit frame;
  /// 'ordered' is a fixed screen, coarser but even on flat tone;
  /// 'threshold' is a hard cut, for line art only; 'none' hands 8-bit grey
  /// to the driver and lets it decide, which is what the booth used to do.
  thermalDither: 'atkinson',
  /// Midtone contrast before dithering. Thermal prints compress the ends of
  /// the scale, so a photograph that looks right on screen goes muddy.
  /// Mild by default, because GAMMA below does the midtone work with less
  /// clipping at the ends.
  thermalContrast: 1.10,
  /// Lightness before dithering. Heat spreads into the paper around each dot,
  /// so a print comes out darker than the pixels say.
  thermalBrightness: 15,
  /// Midtone curve before dithering. Above 1 lifts the midtones and leaves
  /// pure black and pure white where they are, which is what the dot spread
  /// of a thermal head actually needs — unlike brightness, which moves the
  /// ends too, or contrast, which clips them.
  thermalGamma: 1.10,
  /// 3x3 median before the tone work, mixed back by this much. Off by
  /// default: a clean frame loses eyelashes and hair texture to it. Worth
  /// 0.3 or so in a dim venue, where sensor grain would otherwise become a
  /// field of burned dots.
  thermalDenoise: 0,
  /// Unsharp masking after the photograph has been resized to printer dots
  /// and before dithering. Error diffusion smears fine edges; a little
  /// sharpening puts them back. 0 turns it off.
  thermalSharpen: 0.8,
  /// Radius of that sharpening, in printed dots. About one dot at 203dpi is
  /// 0.7-1.0; wider than that and the halo is visible as a grey ring.
  thermalSharpenRadius: 0.8,
  /// Lifts whatever sits in local shadow — which at a booth is a face, since
  /// a face is the thing lit from one side and standing in front of a
  /// brighter room. Not face detection: see liftShadows.
  thermalFaceLift: 0.45,
  /// The cut level for the 'threshold' dither only. Ignored by every other
  /// mode, which decide each dot against their own moving threshold.
  thermalThreshold: 128,
  /// Swap black for white on the way out. A wiring fix, not a look: a few
  /// printers read a set bit as "do not burn" and come out as a negative.
  thermalInvert: false,
  /// Tallest sheet to send, in printed dots. 0 for no limit. A roll has no
  /// page length, so a long receipt is legal — but a sheet taller than the
  /// printer's own buffer is not, and some printers answer that by
  /// truncating silently. A sheet over this is scaled down to fit, before
  /// dithering, and the operator is told.
  thermalMaxHeightDots: 0,
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
  /// Bluetooth and USB drives a printer plugged into the tablet directly,
  /// both with no window at all. Android only.
  printMode: 'dialog',
  /// The unprinted strip between die-cut labels, which the printer's sensor
  /// uses to find the start of the next one. 0 for a continuous roll.
  labelGapMM: 2,
  /// When a test print was last sent, and on what paper. A browser cannot
  /// ask the operating system which printer is connected, so this is the
  /// only record the booth can keep that the printer was ever reached.
  printerTestedAt: 0,
  printerTestedOn: '',
  /* --- layout sync --- */
  /// The shared secret that identifies one operator's set of layouts. Long
  /// and random, generated on the device; see SYNC below for why it is a
  /// code rather than an account.
  syncCode: '',
  /// Sync without being asked — on launch, and whenever a layout is saved.
  syncAuto: true,
  /// The server clock at the last successful pull, so the next one only asks
  /// for what changed.
  syncSince: '',
  syncLastAt: 0,
  syncLastNote: '',
  /// Layouts deleted here that the other devices have not been told about
  /// yet. Without these a delete would never travel: the next pull would
  /// find the layout still on the server and put it straight back.
  syncTombstones: [],
  /// How many photographs the calibration sheet prints, each with the same
  /// six variants. One is usually enough; more is for comparing a face
  /// against a group shot, which fail differently on one bit.
  calibrationSamples: 1,
  /// Hide the print options from the guest: no copy count, no spec table,
  /// no SAVE PNG. Press PRINT and paper comes out. The operator's settings
  /// decide the copies.
  quickPrint: true,
  /// Imaging width of the thermal head, in dots. 576 = 80mm and 384 = 58mm
  /// at 203dpi, 832 = 104mm on a 4-inch label printer — but these are
  /// conventions, not a rule: an 80mm printer with a 640-dot head exists and
  /// a 576-dot sheet on one prints narrow with a white margin. It is a
  /// number to be set from the printer's own specification, which is why it
  /// can be typed as well as picked.
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
  /* --- the digital copy --- */
  /// Upload each printed session and show the guest a QR that leads to it.
  /// OFF is absolute: with this clear, no photograph ever leaves the device,
  /// which is the state the booth shipped in and the one to go back to if a
  /// venue asks.
  shareOn: true,
  /// Cloudinary cloud name, and an *unsigned* upload preset on it. Unsigned
  /// is the whole security model: it can upload and nothing else — it cannot
  /// list, read or delete what is already there.
  shareCloud: 'wdhofaeh',
  sharePreset: 'photobooth',
  /// The page a scanned code opens. Deployed alongside the booth itself.
  shareBase: 'https://mixelorg-arch.github.io/photobooth/s/',
  /// How long DONE holds when there is a code on it. Six seconds is enough
  /// to read "PRINT COMPLETE" and nowhere near enough to get a phone out.
  shareHoldSeconds: 25,
  /// Set by TEST UPLOAD, so an operator can see at a glance whether this
  /// booth has ever managed to reach the account.
  shareTestedAt: 0,
  shareLastNote: '',
};
const STORE_KEY = 'photobooth.settings.v1';

let settings = loadSettings();
function loadSettings(){
  let merged, saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
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

  /* A layout that ships in a later build has to reach booths already
   * installed, and exactly once — put it in front of guests the first time
   * these settings meet it, and never again, so hiding it sticks. */
  const seen = new Set(Array.isArray(saved.layoutsSeen) ? saved.layoutsSeen
                                                        : LAYOUTS_BEFORE_SEEN);
  LAYOUTS.filter(l => !l.custom).forEach(l => {
    if (seen.has(l.id)) return;
    seen.add(l.id);
    if (!merged.guestLayoutIDs.includes(l.id)) merged.guestLayoutIDs.push(l.id);
  });
  merged.layoutsSeen = [...seen];

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
/* Whether a layout belongs on this paper.
 *
 * A canvas layout was drawn for one paper and means nothing on another. A
 * receipt flows and only suits a roll. Everything else is written in
 * fractions and will scale to anything — which is the problem, because
 * "scales" and "is worth printing" are different questions.
 *
 * Measured, smallest photo side in mm:
 *
 *              one-full  two-stack  four-grid  six-grid  strip-duo
 *   4x6          101.6      57.0       38.3      28.7       28.7
 *   100x150      100.0      56.1       37.7      28.2       28.3
 *   card 54x86    54.0      31.7       21.7      15.2       15.3
 *   50x40         29.0      13.3        9.0       9.1        6.8
 *
 * A face 7 mm across is not a photograph of anyone, and dithering to one bit
 * takes what little is left. The floor is 12 mm: under the tightest pairing
 * this booth already ships — the 15.2 mm six-grid on a SELPHY card, which is
 * fine — so nothing that worked before changes, and over the point where a
 * small sticker starts offering layouts that waste the paper. */
const MIN_PHOTO_MM = 12;

const fitsPaper = (tpl, media) => {
  if (tpl.kind === 'canvas') return tpl.mediaID === media.id;
  if (!!tpl.receipt !== !!media.flow) return false;
  if (media.flow) return true;              // a roll is as long as it needs
  const px = mediaPixels(media);
  if (!px.w || !px.h) return true;
  const mmx = (media.w * 25.4) / px.w, mmy = (media.h * 25.4) / px.h;
  return slotRects(tpl, px.w, px.h).every(s =>
    Math.min(s.r.w * mmx, s.r.h * mmy) >= MIN_PHOTO_MM);
};

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


/* ==================================================================== *
 * The digital copy
 *
 * A printed sticker is the souvenir and a QR is how it survives being
 * lost. The booth mints a code when a session starts, prints it, and
 * uploads afterwards — see cloud.js for why that order is the safe one.
 *
 * Nothing here ever blocks the print queue. A venue's wifi is allowed to
 * make the *code* fail; it is not allowed to make the *paper* late.
 * ==================================================================== */

/* Null whenever the digital copy is off, unconfigured, or there is no
 * session to upload — which is the single thing every caller tests. */
function shareConfig(){
  if (!settings.shareOn || !window.Cloud) return null;
  if (!settings.shareCloud || !settings.sharePreset) return null;
  if (!share.code) return null;
  return {cloud: settings.shareCloud, preset: settings.sharePreset, code: share.code};
}

/* What the guest scans. */
function shareLink(){
  const cfg = shareConfig();
  return cfg ? Cloud.linkFor(settings.shareBase, cfg.code, share.count) : '';
}

/* The same link, but only when it is fit to commit to paper.
 *
 * A screen can say "this did not upload". A sticker cannot: it leaves with
 * the guest carrying a code that leads nowhere, and they find out at home.
 * So the printed one is dropped the moment the network is known bad. */
function sharePrintLink(){
  return (shareConfig() && Cloud.live()) ? shareLink() : '';
}

/* One small upload at the start of a session, so `Cloud.live()` has real
 * evidence by the time a QR is committed to paper rather than a guess.
 * Quiet: the guest is choosing a layout and there is nothing to tell them. */
function shareProbe(){
  const cfg = shareConfig();
  if (!cfg) return;
  Cloud.probe(cfg).catch(err => console.warn('share probe failed:', err.message));
}

/* The print, re-rendered for a phone.
 *
 * Not the sheet that was printed: that one is a one-bit dither, which is
 * what makes a thermal print readable on paper and unreadable on a screen.
 * The layout's own monochrome is kept — that is design, not a limitation of
 * the head. */
function sharePrintCanvas(){
  const media = currentMedia(), tpl = session.layout;
  const opts = {mono: settings.photoTone !== 'colour' ? true : undefined};
  const brand = branding(tpl);
  const wide = (session.sheet && session.sheet.width) || 600;
  // A 50x40mm label is 400 dots across. Printed that is 203dpi; on a phone
  // it is a thumbnail, so it is rendered again several times larger.
  const scale = Math.max(1, Math.min(4, Math.round(1400 / wide)));
  try {
    return tpl.pack > 1
      ? contactSheet(renderPack(session.photos, tpl, media, brand, scale, opts), media)
      : renderSheet(session.photos, tpl, media, brand, scale, opts);
  } catch (err) {
    console.warn('no digital print:', err.message);
    return null;
  }
}

/* Queue the whole session. Called once, at print time — not at capture.
 *
 * A retake replaces a photograph in a slot that has already been shot, and
 * an unsigned upload cannot overwrite what it has already put at that name.
 * Uploading as the shots land would therefore publish the rejected take and
 * report success. Waiting until PRINT is what makes the names final. */
function shareUpload(){
  const cfg = shareConfig();
  if (!cfg || share.sent) return;
  share.sent = true;
  session.photos.forEach((photo, i) => { if (photo) Cloud.push(cfg, String(i + 1), photo); });
  const print = sharePrintCanvas();
  if (print) Cloud.push(cfg, 'print', print);
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
  // This session's own code wins over the fixed link: a guest scanning a
  // souvenir wants their photographs, not the booth's website.
  link: sharePrintLink() || settings.printLink,
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
/* The same picture, on the attract screen. A second <video> holding the same
 * MediaStream rather than a second camera: a device that will only hand out
 * one stream at a time — which is most of them — would otherwise leave this
 * panel black the moment the capture screen took the camera. */
const attractVideo = document.getElementById('attract-video');
const attractUvc = document.getElementById('attract-uvc');
const attractFallback = document.getElementById('attract-fallback');

/* Point every preview at the stream in hand, and show or hide the stand-in
 * copy depending on whether there is a picture to show. One place does this
 * so a new preview surface cannot be forgotten in one of the four paths that
 * open a camera. */
/* The tape overlay's readouts.
 *
 * Two of the three are real: the clock is the wall clock, and the timecode
 * counts from the moment the current session began — so a guest who glances
 * at it while posing sees a number that means something. The third, the
 * medium, is the event name, because that is what this particular tape is of.
 *
 * Both camera wells carry a copy of the overlay, so everything here writes to
 * every matching element rather than to an id.
 */
const VF_DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
let vfStarted = 0;

function vfWrite(selector, text){
  document.querySelectorAll('.vf ' + selector).forEach(n => { n.textContent = text; });
}

function tickViewfinder(){
  const now = new Date();
  const p2 = n => String(n).padStart(2, '0');

  vfWrite('.vf-clock', p2(now.getHours()) + ':' + p2(now.getMinutes()));
  vfWrite('.vf-date', p2(now.getDate()) + '.' + p2(now.getMonth() + 1) + '.' +
                      now.getFullYear() + ' ' + VF_DAYS[now.getDay()]);

  // Counts the session, not the clock: it resets when a guest starts.
  const secs = Math.max(0, Math.floor((Date.now() - (vfStarted || Date.now())) / 1000));
  vfWrite('.vf-tc', p2(Math.floor(secs / 3600)) + ':' +
                    p2(Math.floor(secs / 60) % 60) + ':' + p2(secs % 60));

  vfWrite('.vf-name', (settings.eventName || 'SNAPBOX').toUpperCase().slice(0, 16));

  // The menu bar clock, where a Mac has always kept it.
  const bar = el('#hdr-clock');
  if (bar) bar.textContent = p2(now.getHours()) + ':' + p2(now.getMinutes());

  // The terminal's own date stamp, bottom right, in the reference's format.
  const stamp = el('#ftr-date');
  if (stamp) stamp.textContent = (now.getMonth() + 1) + '/' + now.getDate() + '/' +
                                 now.getFullYear() + '  ' + p2(now.getHours()) + ':' +
                                 p2(now.getMinutes());

  /* Tape remaining. A real deck counted down from what was left on the
   * cassette; this counts down from the idle reset, so the number on screen
   * is the one thing in the overlay that is actually true — it is how long
   * this session has before the booth lets the next guest in. */
  const idle = settings.idleReturnSeconds || 0;
  const used = Math.max(0, Math.floor((Date.now() - (vfStarted || Date.now())) / 1000));
  const left = session.step === 'attract' || !idle ? 219 : Math.max(0, Math.ceil((idle - used) / 6));
  vfWrite('.vf-left', left + 'min');
}

/// REC while the shutter sequence is running, PLAY the rest of the time.
function setViewfinderRecording(on){
  document.querySelectorAll('.vf').forEach(n => n.classList.toggle('rec', !!on));
  vfWrite('.vf-state em', on ? 'REC' : 'PLAY');
}


/* ==================================================================== *
 * The subject bracket
 *
 * track.js finds a face in the picture; this puts the brackets on it.
 *
 * The one piece of real work here is the mapping. The preview is
 * `object-fit: cover`, so what is on screen is a centre crop of the camera's
 * frame — a 4:3 camera in a 16:9 well has a fifth of its height off the top
 * and bottom. The tracker answers in frame coordinates. Positioning the
 * overlay from those directly puts the box near the face and never on it,
 * which looks like a bug in the tracker and is not.
 * ==================================================================== */
const TRACK_SCREENS = {
  attract: {well: '#attract-well', box: '#attract-track',
            src: () => uvc.running ? attractUvc : attractVideo},
  capture: {well: '#viewport',     box: '#vf-track',
            src: () => uvc.running ? uvcImage : video},
};
let trackedScreen = null, trackRAF = 0;

/* Where a cover-fitted picture actually lands inside its box. */
function coverRect(srcW, srcH, W, H){
  const k = Math.max(W / srcW, H / srcH);
  const w = srcW * k, h = srcH * k;
  return {x: (W - w) / 2, y: (H - h) / 2, w, h};
}

function paintTracker(){
  trackRAF = requestAnimationFrame(paintTracker);
  const spec = TRACK_SCREENS[session.step];
  if (!spec) return;
  const box = el(spec.box), well = el(spec.well), src = spec.src();
  if (!box || !well || !src) return;

  const st = Tracker.read();
  if (!st.found) { box.classList.remove('on'); return; }

  const sw = src.videoWidth || src.naturalWidth || 0;
  const sh = src.videoHeight || src.naturalHeight || 0;
  const W = well.clientWidth, H = well.clientHeight;
  if (!sw || !sh || !W || !H) return;

  const r = coverRect(sw, sh, W, H);
  // A little air around the blob: skin stops at the hairline and the chin,
  // and a bracket drawn exactly there looks like it has missed.
  const pad = 0.12;
  const x = r.x + (st.x - st.w * pad) * r.w;
  const y = r.y + (st.y - st.h * pad * 1.6) * r.h;
  const w = st.w * (1 + pad * 2) * r.w;
  const h = st.h * (1 + pad * 2.4) * r.h;

  box.style.left   = Math.round(x) + 'px';
  box.style.top    = Math.round(y) + 'px';
  box.style.width  = Math.round(w) + 'px';
  box.style.height = Math.round(h) + 'px';
  box.classList.add('on');
  // Locked is a claim about the picture, so it is made from the measurement
  // rather than from the fact that a box is being drawn.
  const lock = st.conf > 0.72;
  box.classList.toggle('lock', lock);
  const label = box.querySelector('b');
  const want = Tracker.usingNative ? (lock ? 'FACE LOCK' : 'FACE')
                                   : (lock ? 'LOCK' : 'SUBJECT');
  if (label && label.textContent !== want) label.textContent = want;
}

/* Point the tracker at whichever preview is on screen, and let go of it
 * everywhere else — there is no sense reading pixels behind a print
 * dialog. */
function trackScreen(step){
  const spec = TRACK_SCREENS[step];
  if (!spec) {
    if (trackedScreen) { Tracker.stop(); trackedScreen = null; }
    // Stop the paint loop too, not just the tracker. A booth sits on the
    // attract screen for hours; a frame callback that wakes sixty times a
    // second to decide it has nothing to do is a tablet's battery.
    if (trackRAF) { cancelAnimationFrame(trackRAF); trackRAF = 0; }
    document.querySelectorAll('.vf-track').forEach(n => n.classList.remove('on'));
    return;
  }
  if (trackedScreen === step) return;
  trackedScreen = step;
  const src = spec.src();
  // The preview is mirrored, so the box has to be mirrored with it.
  Tracker.watch(src, src && src.classList.contains('mirror'));
  if (!trackRAF) trackRAF = requestAnimationFrame(paintTracker);
}

function attachPreviews(){
  const live = !!(stream && stream.getVideoTracks().some(t => t.readyState === 'live'));
  // Re-point the tracker: the element it was watching may have just been
  // given a different stream, or had the mirror turned on or off.
  trackedScreen = null;
  trackScreen(session.step);
  video.srcObject = stream;
  if (attractVideo) {
    attractVideo.srcObject = stream;
    if (stream) { try { attractVideo.play(); } catch {} }
  }
  if (attractFallback) attractFallback.hidden = live || uvc.running;
  const note = el('#attract-camnote');
  // A booth that says STARTING THE CAMERA for ten minutes is lying. Once
  // there is a stream the panel is hidden anyway; this line is only ever
  // read while something is wrong.
  if (note) setPixel(note, live || uvc.running ? 'CAMERA READY'
                   : cameraRefused ? 'ALLOW THE CAMERA TO USE THE BOOTH'
                   : 'STARTING THE CAMERA', 2);
}

/* Whether the last attempt to open the camera was refused rather than simply
 * not finished. It changes what the stand-in panel should say, and only the
 * error path knows it. */
let cameraRefused = false;
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
    const src = path + '?t=' + Date.now();
    uvcImage.src = src;
    uvcImage.hidden = false;
    video.hidden = true;
    camMsg.hidden = true;
    if (attractUvc) { attractUvc.src = src; attractUvc.hidden = false; }
    if (attractVideo) attractVideo.hidden = true;
    if (attractFallback) attractFallback.hidden = true;
  } else {
    uvcImage.removeAttribute('src');
    uvcImage.hidden = true;
    video.hidden = false;
    if (attractUvc) { attractUvc.removeAttribute('src'); attractUvc.hidden = true; }
    if (attractVideo) attractVideo.hidden = false;
    attachPreviews();
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
    attachPreviews();
    try { await video.play(); } catch {}
    // A different camera is a different sensor: whatever was measured and
    // locked on the built-in one means nothing here.
    await prepareCamera();
  } catch {
    // The built-in one is already running and working. Keep it.
  }
}


/* ==================================================================== *
 * Getting the most out of the camera, before any of it is thrown away
 *
 * A one-bit print has no tonal range to spare, so everything the camera can
 * be persuaded to do better is worth more here than in a colour booth. Three
 * things, in the order they matter:
 *
 *   RESOLUTION. getUserMedia is asked for 1920x1080 as an *ideal*, which a
 *   browser satisfies with the nearest mode it has — and "nearest" can mean
 *   640x480 on a camera that also offers 4K, because the browser is picking a
 *   sensible default rather than the best one. Asking the track what it can
 *   actually do, and then asking for that, is the difference.
 *
 *   SETTLE. A webcam that has just opened is in the middle of metering. The
 *   first second of frames is a visible ramp of exposure and white balance,
 *   and a frame grabbed from the middle of it is mis-exposed in a way nothing
 *   downstream can fix. The countdown already covers this in the normal
 *   flow — it is three seconds — but a retake can come back to a camera that
 *   has just been reopened, so it is made explicit rather than assumed.
 *
 *   LOCK. Once it has settled, freezing exposure and white balance keeps
 *   every shot in a strip matching, instead of the camera re-metering between
 *   frames because someone leaned out of shot. This is the one that is
 *   genuinely not available everywhere: the constraints are optional in the
 *   spec, most browsers outside Chrome do not implement them, and most USB
 *   webcams do not expose manual modes at all. So the booth asks, reads back
 *   what it actually got, and says so in Admin. It never claims a lock it
 *   does not hold.
 * ==================================================================== */

/// What the open camera can do, and what the booth actually got. Read by
/// Admin, which must not tell an operator a lock is on when it is not.
const cameraState = {
  width: 0, height: 0,
  settling: false,
  supports: {exposure: false, whiteBalance: false, focus: false, resolution: false},
  locked: {exposure: false, whiteBalance: false, focus: false},
  note: '',
};

const sleepMs = ms => new Promise(r => setTimeout(r, ms));

/// Ask the open track for its biggest mode and take it.
async function maximiseCapture(track){
  const got = track.getSettings ? track.getSettings() : {};
  cameraState.width = got.width || 0;
  cameraState.height = got.height || 0;
  if (settings.captureSize !== 'max') return;
  if (!track.getCapabilities) {
    // Safari and Firefox do not implement getCapabilities on a video track.
    // Nothing is broken; the booth simply cannot know there is more to ask
    // for, and says that rather than implying it tried.
    cameraState.note = 'This browser will not say what the camera can do, so ' +
      'the booth asked for 1920x1080 and took what it was given.';
    return;
  }
  let cap;
  try { cap = track.getCapabilities(); } catch { return; }
  const maxW = cap.width && cap.width.max, maxH = cap.height && cap.height.max;
  if (!maxW || !maxH) return;
  cameraState.supports.resolution = true;
  if (maxW <= (got.width || 0)) return;        // already at the top
  try {
    await track.applyConstraints({width: {ideal: maxW}, height: {ideal: maxH}});
    const now = track.getSettings();
    cameraState.width = now.width || cameraState.width;
    cameraState.height = now.height || cameraState.height;
  } catch {
    // An over-constrained camera keeps the mode it had, which is a working
    // camera at a smaller size — not an error worth showing a guest.
  }
}

/* Settle, then lock what can be locked.
 *
 * The order is not arbitrary. Focus is asked for first and given its own
 * moment, because a lens still hunting makes the exposure reading meaningless.
 * Then the settle wait. Then exposure and white balance are frozen at
 * whatever the camera decided during that wait — freezing them before it has
 * decided would lock in the wrong answer, which is worse than not locking at
 * all.
 */
async function settleAndLock(track){
  cameraState.settling = true;
  cameraState.locked = {exposure: false, whiteBalance: false, focus: false};
  try {
    const cap = track.getCapabilities ? track.getCapabilities() : {};
    const has = (k, v) => Array.isArray(cap[k]) && cap[k].indexOf(v) >= 0;
    cameraState.supports.exposure = has('exposureMode', 'manual');
    cameraState.supports.whiteBalance = has('whiteBalanceMode', 'manual');
    cameraState.supports.focus = has('focusMode', 'continuous') || has('focusMode', 'single-shot');

    if (settings.lockCamera && cameraState.supports.focus) {
      const mode = has('focusMode', 'continuous') ? 'continuous' : 'single-shot';
      try { await track.applyConstraints({focusMode: mode}); } catch {}
      await sleepMs(250);
    }

    await sleepMs(Math.max(0, settings.cameraSettleMs | 0));

    if (settings.lockCamera) {
      for (const [key, flag] of [['exposureMode', 'exposure'],
                                 ['whiteBalanceMode', 'whiteBalance']]) {
        if (!cameraState.supports[flag]) continue;
        try {
          await track.applyConstraints({[key]: 'manual'});
          // Read it back. applyConstraints resolving is not the same as the
          // camera having done it, and a lock the booth only believes in is
          // worth nothing to the operator reading the panel.
          const now = track.getSettings ? track.getSettings() : {};
          cameraState.locked[flag] = now[key] === 'manual';
        } catch { cameraState.locked[flag] = false; }
      }
      if (cameraState.supports.focus) {
        const now = track.getSettings ? track.getSettings() : {};
        cameraState.locked.focus = now.focusMode === 'continuous' ||
                                   now.focusMode === 'single-shot';
      }
    }
  } finally {
    cameraState.settling = false;
  }
}

/// Everything above, for whichever track is open. Safe to call again.
async function prepareCamera(){
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  cameraState.note = '';
  await maximiseCapture(track);
  await settleAndLock(track);
}

/// Hold until the camera has stopped adjusting. The countdown normally
/// covers this; a retake onto a just-reopened camera does not.
async function cameraReady(){
  for (let i = 0; i < 40 && cameraState.settling; i++) await sleepMs(50);
}

/// One line for Admin, saying only what is true of this camera in this
/// browser. The honest answer is often "this browser will not say".
function cameraLockNote(){
  if (!stream) return 'No camera is open, so nothing has been measured yet.';
  const s = cameraState.supports, l = cameraState.locked;
  if (!s.exposure && !s.whiteBalance && !s.focus) {
    return 'This camera and browser offer no manual exposure, white balance ' +
           'or focus control, so the booth cannot lock any of them — it waits ' +
           (settings.cameraSettleMs | 0) + 'ms after opening the camera for ' +
           'its own metering to settle, and that is all it can do. Most USB ' +
           'webcams are like this, and so is every browser except Chrome. ' +
           'AUTO EXPOSURE above is the booth correcting the frame itself ' +
           'afterwards, which does not depend on the camera at all.';
  }
  const held = [l.exposure && 'exposure', l.whiteBalance && 'white balance',
                l.focus && 'focus'].filter(Boolean);
  const offered = [s.exposure && 'exposure', s.whiteBalance && 'white balance',
                   s.focus && 'focus'].filter(Boolean);
  if (!held.length) {
    return 'This camera offers ' + offered.join(' and ') + ' control, but the ' +
           'booth asked and did not get it. Shots in one strip may differ in ' +
           'brightness if the lighting changes between them.';
  }
  return 'Locked after opening: ' + held.join(', ') + '. Every shot in a strip ' +
         'is then exposed the same way, instead of the camera re-metering ' +
         'because someone leaned out of frame.' +
         (held.length < offered.length
            ? ' Offered but not held: ' +
              offered.filter(o => held.indexOf(o) < 0).join(', ') + '.'
            : '');
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
  attachPreviews();
  camMsg.hidden = true;
  try { await video.play(); } catch {}
  await upgradeToExternalCamera();
  // Not awaited: the settle is three quarters of a second and the START
  // button has already been pressed. The capture flow waits on it instead,
  // by which time the countdown has usually covered it entirely.
  prepareCamera();
  return true;
}

function cameraMessage(err){
  const name = err && err.name;
  cameraRefused = name === 'NotAllowedError';
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
  attachPreviews();
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
/* Normalise a captured frame's exposure.
 *
 * This is the single biggest thing standing between a booth photograph and a
 * legible thermal print, and it is a problem of *metering*, not of printing.
 * A guest stands in front of the camera with the room behind them. The room
 * is brighter than they are — a window, a doorway, a lit wall — and the
 * camera meters for the whole frame, so it exposes for the room and the
 * person goes down into the bottom of the scale. On a colour print that reads
 * as "a bit dark". On a one-bit head, everything below the threshold burns
 * solid and the face is a silhouette with holes where the glasses caught the
 * light.
 *
 * No amount of dithering recovers it, because by then the tones are already
 * squeezed into the bottom few values. It has to be fixed while the frame is
 * still 8-bit, which is here.
 *
 * The fix is a percentile stretch, weighted toward the middle of the frame.
 * Centre weighting is what makes it work at a booth: the person is in the
 * middle, the thing blowing the meter is at the edges, so counting the middle
 * more heavily finds the range the *subject* occupies rather than the range
 * the room occupies. That range is then stretched to fill the scale, and the
 * midpoint pushed toward a target so faces land where a thermal head can
 * still show them.
 *
 * Percentiles rather than min and max, because a single specular highlight —
 * a ring light, a phone screen, spectacles — would otherwise set the white
 * point and undo the whole thing.
 */
function normaliseExposure(c, opts){
  opts = opts || {};
  const strength = opts.strength !== undefined ? opts.strength : settings.exposureStrength;
  const target = opts.target !== undefined ? opts.target : settings.exposureTarget;
  if (strength <= 0) return c;

  const W = c.width, H = c.height;
  if (!W || !H) return c;
  const g = c.getContext('2d');
  let img;
  try { img = g.getImageData(0, 0, W, H); } catch { return c; }
  const d = img.data;

  /* Two histograms, because they answer different questions.
   *
   * The whole frame gives the black and white points — the range the stretch
   * has to work with. The middle of the frame gives the *subject*, and that
   * is the harder one: a centre average is no good, because at a booth the
   * middle of the frame is still mostly room. Taking a low percentile of the
   * centre instead picks out the darker population in the middle, which is
   * the person standing in front of the room. That is the level worth
   * driving to a target; everything else follows from it.
   */
  const hist = new Float64Array(256);
  const centre = new Float64Array(256);
  const cx = W / 2, cy = H * 0.45, rx = W * 0.34, ry = H * 0.44;
  let total = 0, centreTotal = 0;
  for (let y = 0; y < H; y += 2) {
    const ny = (y - cy) / ry;
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const l = (LUMA_R * d[i] + LUMA_G * d[i + 1] + LUMA_B * d[i + 2]) | 0;
      hist[l]++; total++;
      const nx = (x - cx) / rx;
      if (nx * nx + ny * ny < 1) { centre[l]++; centreTotal++; }
    }
  }
  if (!total) return c;

  const pct = (h, n, p) => {
    let acc = 0; const want = n * p;
    for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= want) return v; }
    return 255;
  };
  const lo = pct(hist, total, 0.01), hi = pct(hist, total, 0.99);

  // A frame with almost no range is a lens cap or a blank wall; stretching it
  // would only amplify sensor noise into dot mush.
  if (hi - lo < 12) return c;

  // Never stretch harder than this, or grain becomes the subject.
  const gain = Math.min(3.2, 255 / (hi - lo));

  // The darker third of the middle: the guest, not the room behind them.
  const subject = centreTotal ? pct(centre, centreTotal, 0.30) : pct(hist, total, 0.30);
  const subjectAfterGain = (subject - lo) * gain;

  /* Move that to where a face should sit, but only most of the way, and
   * within limits. A full correction every time would render a deliberately
   * dim room and a bright one as the same grey, and a booth that flattens the
   * look of the venue is not doing anyone a favour. The clamp stops a frame
   * that is nearly all subject — someone leaning into the lens — from being
   * hauled across the scale. */
  let shift = (target - subjectAfterGain) * 0.8;
  if (shift > 120) shift = 120; else if (shift < -90) shift = -90;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], bb = d[i + 2];
    const l = LUMA_R * r + LUMA_G * gg + LUMA_B * bb;
    if (l <= 0) {
      // Pure black has no ratio to scale by; lift it directly or it stays a
      // hole in an otherwise corrected frame.
      const v = Math.max(0, Math.min(255, (0 - lo) * gain + shift)) * strength;
      d[i] = d[i + 1] = d[i + 2] = v;
      continue;
    }
    let nl = (l - lo) * gain + shift;
    if (nl < 0) nl = 0; else if (nl > 255) nl = 255;
    nl = l + (nl - l) * strength;
    // Channels scale together, so the correction is exposure and not a
    // colour cast. Mono output does not care; a SELPHY print does.
    const f = nl / l;
    let v;
    v = r * f;  d[i]     = v > 255 ? 255 : v;
    v = gg * f; d[i + 1] = v > 255 ? 255 : v;
    v = bb * f; d[i + 2] = v > 255 ? 255 : v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

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
  // Corrected here, at capture, rather than at print: this is the last point
  // where the frame is still continuous tone, and a dither cannot recover
  // what a bad exposure has already thrown away.
  return settings.autoExposure ? normaliseExposure(c) : c;
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
  /* When the layout is a pack, every sheet in it; null otherwise. The
     printer takes these one at a time, which is what a label printer does
     anyway — it feeds to the gap and stops. */
  pack: null,
  /* What the guest is shown. The same canvas as `sheet` for an ordinary
     layout, and the whole pack laid out together for a pack. */
  proof: null,
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

/* Kept under its old name because the boot sequence and the export list
 * call it. Everything it used to do by hand — shrinking the wordmark, then
 * the start screen's tabs, each with its own breakpoint — is one scale
 * factor now, applied to every label at once. */
function fitMenuBar(){ refitType(); }
window.addEventListener('resize', refitType);
const screens = {};
document.querySelectorAll('.screen').forEach(s => screens[s.dataset.screen] = s);

const TASK_LABELS = {
  attract:  ['SNAPBOX', 'READY'],
  layout:   ['LAYOUT',     'STEP 1/4'],
  capture:  ['CAPTURE',    'STEP 1/4'],
  review:   ['REVIEW',     'STEP 2/4'],
  copies:   ['COPIES',     'STEP 3/4'],
  confirm:  ['PRINT',      'STEP 4/4'],
  printing: ['SPOOLER',    'BUSY'],
  thankyou: ['SNAPBOX', 'DONE'],
  failed:   ['SNAPBOX', 'ERROR'],
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
  const [left, right] = TASK_LABELS[step] || ['SNAPBOX', ''];
  setPixel(el('#task-left'), left, 3);
  setPixel(el('#task-right'), right, 3);
  // The back arrow is the ✕ of this language: present only inside a session.
  el('#hdr-back').hidden = (step === 'attract');
  if (step === 'capture') updateShotCount();
  /* The two screens with a live camera on them give the picture the whole
   * app and float everything else on top of it. */
  document.body.classList.toggle('fullbleed', step === 'attract' || step === 'capture');
  const operator = (step === 'admin' || step === 'editor');
  document.body.classList.toggle('operator', operator);
  applyRotation(operator);
  trackScreen(step);
  // The attract screen is a mirror now, so it needs the camera as much as the
  // capture screen does. Failure is ignored: the stand-in copy is already
  // showing underneath and there is nobody to tell.
  if (step === 'attract') startCamera().catch(() => {});
  restartIdle();
}

/* Which way up the tablet is allowed to be.
 *
 * A booth is landscape: it is on a stand, the camera well is wide, and a
 * guest who tips it has spoiled the shot for whoever is behind them. So the
 * guest screens are locked, as they have always been.
 *
 * The operator's screens are not. Laying out a 4x6 postcard or a 50x40 label
 * means dragging boxes around a portrait sheet, and a portrait sheet inside a
 * landscape window is a sliver down the middle with the panel beside it —
 * which is the whole reason this was asked for.
 *
 * On the tablet the shell does it. In a browser `screen.orientation.lock`
 * needs fullscreen and a promise that is rejected far more often than it is
 * kept, so the failure is swallowed: a browser window is whatever shape its
 * window is, and there is nothing to report to anybody about that.
 */
function applyRotation(free){
  if (NATIVE && typeof NATIVE.setRotation === 'function') {
    try { NATIVE.setRotation(!!free); return; } catch {}
  }
  const o = screen && screen.orientation;
  if (!o) return;
  try {
    if (free) { if (o.unlock) o.unlock(); }
    else if (o.lock) { const p = o.lock('landscape'); if (p && p.catch) p.catch(() => {}); }
  } catch {}
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
  vfStarted = Date.now();
  // A fresh code per session. Minted here, printed at compose, uploaded at
  // print — the order that keeps the network out of the print queue.
  share.code = window.Cloud ? Cloud.newCode() : null;
  share.count = 0;
  share.sent = false;
  share.baked = false;
  if (window.Cloud) { Cloud.begin(); shareProbe(); }
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
  share.count = tpl.shots;
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
  setViewfinderRecording(false);
  clearTimeout(session.idleTimer);
  clearTimeout(session.thankYouTimer);
  session.photos = [];
  session.times = [];
  session.marks.clear();
  session.sheet = null;
  session.copies = settings.defaultCopies;
  /* The camera is no longer released here at all.
   *
   * It used to be, everywhere except iOS, where holding it is what keeps the
   * permission prompt off the next guest's face. Now that the attract screen
   * shows a live mirror there is nothing to release it *to*: dropping the
   * stream would black out the panel a guest is standing in front of, and the
   * next session would have to take it straight back. A booth's camera is on
   * for as long as the booth is. */
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
  setViewfinderRecording(true);

  for (let i = 0; i < slots.length; i++) {
    if (token !== session.captureToken) return;
    shotIndex = slots[i] + 1;
    retaking = isRetake;
    buildShotStrip();
    updateShotCount();

    await countdown(token);
    if (token !== session.captureToken) return;

    // A camera that is still metering hands back a frame from the middle of
    // its own ramp, and no amount of tone work downstream recovers a wrong
    // exposure. The countdown has normally covered this already; a retake
    // onto a just-reopened camera has not.
    await cameraReady();
    if (token !== session.captureToken) return;

    // Light first, expose second, drop the light third. Doing these in any
    // other order is what made the old flash decorative.
    await raiseFlash();
    if (token !== session.captureToken) { dropFlash(); return; }
    const frame = grabFrame();
    dropFlash();
    if (frame) {
      session.photos[slots[i]] = frame;
      session.times[slots[i]] = Date.now();
    }
    buildShotStrip();

    if (i < slots.length - 1) await sleep(settings.betweenShotsSeconds * 1000);
  }

  if (token !== session.captureToken) return;
  setViewfinderRecording(false);
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
        ? 'SHOT ' + shotIndex + ' OF ' + session.layout.shots : 'ONE SHOT'), 3);
  osd.hidden = false;

  /* Big. It used to be deliberately small, to keep the guest's own face in
   * view through the count — but the numeral sits in a pill at the foot of
   * the picture now rather than across it, so there is nothing to protect
   * the face from. A count a guest has to look for is a count they miss, and
   * the shot goes off while they are still reading it. */
  const cell = compactStage() ? 12 : 20;

  for (let n = total; n >= 1; n--) {
    if (token !== session.captureToken) { osd.hidden = true; return; }
    setPixel(el('#cd-number'), String(n), cell);
    setBars('#cd-bars', n / total, 16);
    await sleep(1000);
  }
  osd.hidden = true;
}

/* Light the guest with the screen, and hold it lit while the frame is taken.
 *
 * The old version of this fired on the same line as the capture, which made
 * it a sound effect with no sound: the white had not been composited, let
 * alone reached the guest and come back, by the time the frame was read. It
 * looked like a flash to the person watching the screen and contributed no
 * light whatsoever to the photograph.
 *
 * Two things fix that. The white has to be *painted* before the shutter, so
 * this waits for two animation frames — one to apply the class, one to be
 * sure the compositor has shown it. And a camera does not change exposure on
 * the frame the light arrives: it needs a few frames at 30fps to meter and
 * settle, which is what FLASH HOLD buys. The caller keeps the light up across
 * the capture and drops it afterwards.
 *
 * On a dark stage this is worth real stops on a face. It cannot raise the
 * panel's backlight — no web page can — so brightness on the device should be
 * up for an event.
 */
async function raiseFlash(){
  if (!settings.flashEnabled) return false;
  const f = el('#flash');
  f.style.opacity = String(settings.flashLevel);
  f.classList.add('lit');
  // Two frames: the class is applied on the first, shown on the second.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Then let the sensor meter against the new light.
  if (settings.flashHoldMs > 0) await sleep(settings.flashHoldMs);
  return true;
}

function dropFlash(){
  const f = el('#flash');
  f.classList.remove('lit');           // the transition fades it out
  f.style.opacity = '';
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

/* ==================================================================== *
 * Preparing a sheet for a one-bit head
 *
 * The pipeline itself lives in imaging.js, which is loaded first and shares
 * this scope: `processForPrint` and the primitives it is built from —
 * greyscale, brightness, contrast, gamma, noise reduction, shadow lift,
 * sharpening, and the five dithers — are all declared there, with the
 * reasoning for the order written out at the head of that file.
 *
 * What stays here is the booth's end of it: which settings feed the
 * pipeline, when it runs, and how the result is encoded for the printer.
 * ==================================================================== */

/* Reduce a rendered sheet to what the head can actually burn.
 *
 * Works on the canvas in place and returns it, so a caller can treat it as
 * the same sheet it passed in. A media that is not thermal, or a dither
 * setting of 'none', leaves the pixels untouched.
 */
/* How to encode a rendered sheet for the printer.
 *
 * JPEG is right for a photograph on a colour printer and catastrophic for a
 * dithered one. The dither is a field of single black and white dots, which
 * is the worst case for a cosine transform: every dot rings, the two levels
 * smear into a continuum, and the driver then thresholds that continuum back
 * to one bit — undoing the dithering exactly as a rescale does. Measured on a
 * label sheet: 2 levels became 20 through JPEG at quality 0.95.
 *
 * So the test is not "is it a roll" but "is it one bit", which is any thermal
 * paper. The old rule keyed on `flow` and was right only while receipts were
 * the only thermal media; labels are thermal *sheets* and were being encoded
 * as JPEG.
 */
function sheetDataURL(sheet, media){
  return (media.flow || media.thermal)
    ? sheet.toDataURL('image/png')
    : sheet.toDataURL('image/jpeg', 0.95);
}

/* The booth's settings, as the options `processForPrint` takes.
 *
 * One place, so the live sheet, the calibration preview and the test sheet
 * are all driven by the same numbers. Anything passed in `opts` wins, which
 * is how the calibration sheet prints six variants of one photograph without
 * touching what is saved.
 */
function thermalOptions(opts){
  opts = opts || {};
  const pick = (k, s) => opts[k] !== undefined ? opts[k] : settings[s];
  return {
    dither:        pick('dither', 'thermalDither') || 'atkinson',
    brightness:    pick('brightness', 'thermalBrightness'),
    contrast:      pick('contrast', 'thermalContrast'),
    gamma:         pick('gamma', 'thermalGamma'),
    denoise:       pick('denoise', 'thermalDenoise'),
    faceLift:      pick('faceLift', 'thermalFaceLift'),
    sharpen:       pick('sharpen', 'thermalSharpen'),
    sharpenRadius: pick('sharpenRadius', 'thermalSharpenRadius'),
    threshold:     pick('threshold', 'thermalThreshold'),
    invert:        pick('invert', 'thermalInvert'),
  };
}

/* Reduce a rendered sheet to what the head can actually burn.
 *
 * Works on the canvas in place and returns it, so a caller can treat it as
 * the same sheet it passed in. A media that is not thermal leaves the pixels
 * untouched — and so does a dither of 'none', except that INVERT still
 * applies, because a printer with reversed polarity needs the swap whether
 * or not the booth did the halftoning.
 */
function thermalize(canvas, media, opts){
  if (!media || !media.thermal) return canvas;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return canvas;
  const o = thermalOptions(opts);
  /* OFF means exactly that: the sheet goes out as the renderer drew it and
   * the driver does its own halftoning. Not "run the tone work and skip the
   * dither" — an operator who turns the booth's processing off is comparing
   * it against their driver, and a half-processed sheet answers nothing.
   *
   * INVERT is the one exception, because it is a wiring fact about the
   * printer rather than part of the look, and a reversed-polarity printer
   * needs it whoever did the halftoning. */
  if (o.dither === 'none') return o.invert ? invertCanvas(canvas) : canvas;

  /* The long-receipt guard, and it has to happen here — before the dither,
   * never after. A roll has no page length, so a tall sheet is perfectly
   * legal; a sheet taller than the printer's own raster buffer is not, and
   * the way some printers answer that is to truncate it without saying so.
   * Scaled down to fit rather than cropped, because losing the footer is
   * worse than a slightly narrower print. 0 means no limit, which is the
   * default: most printers manage a two-metre receipt without complaint. */
  const cap = settings.thermalMaxHeightDots | 0;
  if (cap > 0 && H > cap) {
    canvas = resizeForPrinter(canvas, Math.max(16, Math.round(W * cap / H))).canvas;
  }
  return processForPrint(canvas, o);
}

/// Swap black for white across a finished sheet, in place.
function invertCanvas(canvas){
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/* ==================================================================== *
 * Calibration
 *
 * Every number in THERMAL IMAGE is a guess until it has been printed. The
 * printer's dot spread, the paper's sensitivity and the room's light are all
 * unknown to the booth, and they move: a different roll of paper is a
 * different calibration. So rather than describe the settings and hope, this
 * section does two things.
 *
 * It shows the photograph in hand twice, side by side, at the exact pixel
 * size and shape it will print — the frame on the left, the actual dots on
 * the right. That catches everything except the paper itself.
 *
 * And it prints a sheet of six labelled variants of the same photograph, so
 * the paper answers the remaining question in one print instead of six.
 * ==================================================================== */

/* The size of the first photograph on the sheet, in printer dots.
 *
 * Three engines place photographs three different ways, so this asks each in
 * its own terms rather than pretending there is one answer. It matters
 * because the preview has to be at the print's own scale: a dither viewed at
 * any other size is a different picture, and the whole point of the preview
 * is that it is not.
 */
function photoBoxDots(tpl, media){
  const px = sheetPixels(tpl, media);
  if (tpl.kind === 'canvas') {
    // The editor's element key is `t`, not `type` — see ELEMENT_TYPES. Getting
    // that wrong is silent: every canvas layout fell through to the sheet
    // size below, and the preview showed the right dots at the wrong shape.
    const ph = (tpl.elements || []).find(e => e.t === 'photo');
    if (ph) return {w: Math.max(1, Math.round(ph.w * px.w)),
                    h: Math.max(1, Math.round(ph.h * px.h))};
  } else if (media.flow) {
    // A receipt's photograph is the full column width; its height follows
    // from the layout's cell aspect. See receiptPlan for the padding.
    const w = Math.round(px.w - 2 * (tpl.pad || 0.08) * px.w);
    return {w: w, h: Math.max(1, Math.round(w / (tpl.cellAspect || 1)))};
  } else {
    const r = slotRects(tpl, px.w, px.h)[0];
    if (r && r.r && r.r.w) return {w: Math.round(r.r.w), h: Math.round(r.r.h)};
  }
  return {w: px.w, h: px.h};
}

/* A photograph to calibrate against.
 *
 * The one in hand if there is one — an operator standing at the console
 * mid-event has just taken a picture of the actual room under the actual
 * light, which is worth more than any sample. Otherwise the editor's sample
 * faces, which at least have skin, hair and an eye in them. A gradient
 * target would be easier to reason about and useless for the thing being
 * judged, which is whether a face survives.
 */
function calibrationSource(){
  const taken = (session.photos || []).filter(Boolean);
  if (taken.length) return taken[taken.length - 1];
  const samples = typeof edSamplePhotos === 'function' ? edSamplePhotos() : [];
  return samples[0] || null;
}

/* The six variants on the test sheet.
 *
 * Chosen to answer the two questions an operator actually has, in the order
 * they have them: which halftone, and then how much midtone lift. The sixth
 * is the control — a hard threshold is what the printer's own driver would
 * have done — because a comparison with nothing to compare against is not a
 * comparison.
 */
function calibrationVariants(){
  const base = thermalOptions();
  const v = (label, over) => ({label: label, opts: Object.assign({}, base, over)});
  return [
    v('1 ATKINSON',   {dither: 'atkinson'}),
    v('2 DIFFUSION',  {dither: 'floyd'}),
    v('3 ADAPTIVE',   {dither: 'adaptive'}),
    v('4 SCREEN',     {dither: 'ordered'}),
    v('5 GAMMA +0.25', {dither: 'atkinson', gamma: +( (base.gamma || 1) + 0.25 ).toFixed(2)}),
    v('6 THRESHOLD',  {dither: 'threshold', threshold: base.threshold}),
  ];
}

/* Build the calibration sheet.
 *
 * Two passes, and the order of them is the point. Labels and rules are drawn
 * first and thresholded to one bit on their own, because antialiased type is
 * grey and grey is not a thing this printer has. Then the already-dithered
 * cells are pasted in at 1:1 with smoothing off, so nothing touches them
 * afterwards. Dithering the whole sheet at the end would have re-dithered
 * every cell and made the comparison meaningless — which is the same mistake
 * as rescaling a dither, one step later.
 */
function calibrationSheet(samples){
  const media = currentMedia();
  const tpl = activeLayout();
  const source = calibrationSource();
  if (!source) return null;

  const shots = Math.max(1, Math.min(4, samples | 0));
  const photos = (session.photos || []).filter(Boolean);
  const pool = photos.length >= shots ? photos.slice(-shots)
             : (typeof edSamplePhotos === 'function' ? edSamplePhotos() : [source]);

  const W = Math.max(128, settings.thermalWidthDots | 0);
  const box = photoBoxDots(tpl, media);
  const aspect = box.w / box.h;

  const pad = Math.round(W * 0.025);
  const gap = Math.round(W * 0.022);
  const cellW = Math.floor((W - pad * 2 - gap) / 2);
  const cellH = Math.max(1, Math.round(cellW / aspect));
  const labelH = Math.max(18, Math.round(W * 0.042));
  /* The header is three lines of type, so its height is measured from them
   * rather than guessed at a fraction of the width: at 576 dots a guessed
   * 10% put the settings line straight through the first cell's label. */
  const titleH = Math.round(W * 0.055);
  const metaH = Math.round(W * 0.032);
  const headH = Math.round(W * 0.095) + labelH + Math.round(W * 0.035);
  const blockH = headH + 3 * (labelH + cellH + gap);

  const variants = calibrationVariants();
  const sheet = document.createElement('canvas');
  sheet.width = W;
  sheet.height = pad * 2 + blockH * shots;
  const g = sheet.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, sheet.height);

  // Pass one: everything that is type.
  const base = thermalOptions();
  const stamp = new Date().toLocaleString();
  g.fillStyle = '#111111';
  g.textBaseline = 'alphabetic';
  const cells = [];
  for (let s = 0; s < shots; s++) {
    const top = pad + s * blockH;
    g.font = '700 ' + titleH + 'px ui-sans-serif, system-ui, sans-serif';
    g.fillText('SNAPBOX CALIBRATION', pad, top + titleH);
    g.font = metaH + 'px ui-monospace, monospace';
    g.fillText(media.shortName + '  ' + W + ' dots  ' + stamp,
               pad, top + Math.round(W * 0.095));
    // The settings every cell shares, printed on the sheet, because a test
    // print found in a drawer a week later has to say what it was testing.
    g.fillText('B' + base.brightness + ' C' + base.contrast + ' G' + base.gamma +
               ' S' + base.sharpen + '/' + base.sharpenRadius +
               ' L' + base.faceLift + ' N' + base.denoise,
               pad, top + Math.round(W * 0.095) + labelH);
    for (let i = 0; i < 6; i++) {
      const col = i % 2, rowI = Math.floor(i / 2);
      const x = pad + col * (cellW + gap);
      const y = top + headH + labelH + rowI * (labelH + cellH + gap);
      g.font = '700 ' + Math.round(labelH * 0.72) + 'px ui-monospace, monospace';
      g.fillText(variants[i].label, x, y - Math.round(labelH * 0.25));
      g.strokeStyle = '#111111'; g.lineWidth = 2;
      g.strokeRect(x - 1, y - 1, cellW + 2, cellH + 2);
      cells.push({x: x, y: y, variant: variants[i], photo: pool[s % pool.length] || source});
    }
  }
  // One bit for the type, on its own, before any cell is pasted in.
  processForPrint(sheet, {dither: 'threshold', threshold: 170});

  // Pass two: the pictures, each dithered at its own size, pasted untouched.
  g.imageSmoothingEnabled = false;
  for (const cell of cells) {
    const cropped = cropPortrait(cell.photo, aspect, 'face');
    const sized = resizeForPrinter(cropped, cellW).canvas;
    const copy = document.createElement('canvas');
    copy.width = sized.width; copy.height = sized.height;
    const cg = copy.getContext('2d');
    cg.imageSmoothingEnabled = false;
    cg.drawImage(sized, 0, 0);
    processForPrint(copy, cell.variant.opts);
    g.drawImage(copy, cell.x, cell.y);
  }
  return sheet;
}

/* Print it, down whichever route the booth has.
 *
 * Through `printRasterImage` like any other sheet, so a calibration print is
 * subject to the same evidence rule as a guest's: it reports what the
 * printer said, and nothing when the printer said nothing.
 */
function printCalibrationSheet(){
  const sheet = calibrationSheet(settings.calibrationSamples);
  if (!sheet) { toast('No photograph to calibrate with — take one first.'); return; }
  const media = currentMedia();
  settings.printerTestedAt = Date.now();
  settings.printerTestedOn = media.shortName + ' calibration';
  saveSettings();
  printRasterImage(sheet, media, {copies: 1, label: 'SnapBox calibration',
                                  test: true, done: renderAdmin});
}

/* The side-by-side preview, redrawn whenever a setting moves.
 *
 * Cached on the options it was drawn for: the panel re-renders on every
 * keystroke in an unrelated field, and re-running the pipeline over a
 * full-size photograph each time made the whole panel feel broken.
 */
let calCache = {key: '', pair: null};
function calibrationPreview(){
  const source = calibrationSource();
  if (!source) return null;
  const tpl = activeLayout(), media = currentMedia();
  const box = photoBoxDots(tpl, media);
  const o = thermalOptions();
  const key = [source.width, source.height, box.w, box.h,
               o.dither, o.brightness, o.contrast, o.gamma, o.denoise,
               o.faceLift, o.sharpen, o.sharpenRadius, o.threshold, o.invert,
               settings.thermalWidthDots].join(':');
  if (calCache.key === key && calCache.pair) return calCache.pair;
  const pair = generatePrintPreview(source, Object.assign({}, o, {
    widthDots: box.w, aspect: box.w / box.h, cropMode: 'face',
    maxHeight: settings.thermalMaxHeightDots || 0,
  }));
  calCache = {key: key, pair: pair};
  return pair;
}

/// Redraw the pair in place, without rebuilding the panel around it.
function refreshCalibrationPreview(){
  const host = document.querySelector('#cal-pair');
  if (!host) return;
  host.innerHTML = '';
  paintCalibrationPreview(host.parentNode || document);
}

/// Put the two canvases into the panel. Called after the HTML is in the DOM,
/// because a canvas cannot be serialised into a string of markup.
function paintCalibrationPreview(root){
  const host = root.querySelector('#cal-pair');
  if (!host) return;
  const pair = calibrationPreview();
  if (!pair) return;
  [['ORIGINAL', pair.original], ['AS PRINTED', pair.processed]].forEach(([name, canvas]) => {
    const cell = document.createElement('figure');
    cell.className = 'calcell';
    canvas.className = 'calimg';
    cell.appendChild(canvas);
    const cap = document.createElement('figcaption');
    cap.textContent = name;
    cell.appendChild(cap);
    host.appendChild(cell);
  });
}

/* Render a pack: one sheet per photograph, rather than one sheet holding
 * them all.
 *
 * The layout carries a single photo element reading src 0, and each pass
 * hands it a different picture — so the same design prints four times with
 * four faces. `index` and `packSize` reach the sheet through the branding,
 * which is how {i} and {of} end up saying "2/4" on the second sticker.
 */
function renderPack(photos, tpl, media, brand, scale, opts){
  const n = Math.max(1, tpl.pack | 0);
  return Array.from({length: n}, (_, i) =>
    renderSheet([photos[i]], tpl, media,
                Object.assign({}, brand, {index: i + 1, packSize: n}),
                scale, opts));
}

function compose(){
  const media = currentMedia();
  // A thermal head has one ink and two states. COLOUR on thermal paper would
  // show the guest a preview the printer cannot produce, so the paper wins.
  // Dithered here rather than at print time, so the sheet the guest approves
  // on the review and confirm screens is the exact one that burns — down to
  // the dot. A preview that flatters the print is worse than no preview.
  const tpl = session.layout;
  const opts = {mono: media.thermal || settings.photoTone !== 'colour'};
  const brand = branding(tpl);
  // Whether this sheet carries a code, so print time can tell if the
  // network died between drawing it and burning it.
  share.baked = !!sharePrintLink();

  if (tpl.pack > 1) {
    session.pack = renderPack(session.photos, tpl, media, brand, 1, opts)
                     .map(c => thermalize(c, media));
    // The first sticker stands for the pack wherever one sheet is expected;
    // `contactSheet` is what a guest is actually shown, because approving one
    // sticker out of four tells them nothing about the other three.
    session.sheet = session.pack[0];
    session.proof = contactSheet(session.pack, media);
    return;
  }

  session.pack = null;
  session.sheet = thermalize(
    renderSheet(session.photos, tpl, media, brand, 1, opts), media);
  session.proof = session.sheet;
}

/* The pack, laid out as one picture for the review and confirm screens.
 *
 * Only ever shown, never printed: the printer takes the stickers one at a
 * time. Drawn at the sheets' own resolution with a hairline between them, so
 * what a guest approves is the actual dithered output rather than a smooth
 * re-render of it. */
function contactSheet(sheets, media){
  if (!sheets || !sheets.length) return null;
  const cols = sheets.length <= 2 ? 1 : 2;
  const rows = Math.ceil(sheets.length / cols);
  const w = sheets[0].width, h = sheets[0].height;
  const gap = Math.max(2, Math.round(w * 0.02));
  const c = document.createElement('canvas');
  c.width = cols * w + (cols + 1) * gap;
  c.height = rows * h + (rows + 1) * gap;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;          // never resample a dither
  sheets.forEach((sheet, i) => {
    const x = gap + (i % cols) * (w + gap);
    const y = gap + Math.floor(i / cols) * (h + gap);
    g.drawImage(sheet, x, y);
    g.strokeStyle = 'rgba(17,17,17,0.35)';
    g.lineWidth = 1;
    g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  });
  return c;
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
  host.appendChild(session.proof || session.sheet);

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
  host.appendChild(session.proof || session.sheet);

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
  if (NATIVE) return settings.printMode === 'thermal' || settings.printMode === 'usb';
  const chrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);
  const chromeless = window.outerHeight - window.innerHeight < 10;
  return chrome && chromeless;
}
function submitPrint(){
  if (!session.sheet) { fail('Nothing to print — the layout came back empty.'); return; }
  // Two taps on PRINT are one print. The guest is on their way to the
  // thank-you screen a third of a second from now, which is long enough for
  // a second tap to land, and on the thermal route a second job sent
  // mid-raster corrupts the first.
  if (printBusy()) return;
  // The sheet was drawn on the assumption the network was there. If that has
  // since turned out to be false, draw it again without the code: a sticker
  // carrying a QR that leads nowhere is worse than a sticker with none.
  if (share.baked && !sharePrintLink()) compose();
  // Everything goes up now rather than as the shots landed, because a retake
  // has to be able to replace a photograph before its name is taken.
  shareUpload();
  go('printing');
  setPixel(el('#print-title'),
           session.copies === 1 ? 'PRINTING YOUR PHOTO' : 'PRINTING ' + session.copies + ' COPIES', 5);
  el('#print-status').textContent = 'Building the sheet…';
  setBars('#print-bars', 0.15);

  const media = currentMedia();
  /* A thermal sheet is line art, a QR code and a dither: every one of those
   * is ruined by JPEG ringing. Photographs on a colour printer keep the JPEG.
   *
   * A pack is several sheets, so what goes to the printer is a list. One
   * ordinary sheet is a list of one, which keeps every route below on the
   * same path instead of growing a special case. */
  const sheets = session.pack && session.pack.length ? session.pack : [session.sheet];

  setTimeout(() => {
    el('#print-status').textContent = silentPrintingLikely()
      ? 'Sending to the printer…'
      : 'Opening the print dialog…';
    setBars('#print-bars', 0.6);
    try {
      printRasterImage(sheets, media, {
        copies: session.copies,
        label: 'SnapBox ' + media.shortName,
        done: () => { setBars('#print-bars', 1); finishPrinting(); },
      });
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }, 350);
}

/* The page a sheet goes out on.
 *
 * A roll's page is the paper's *full* width — 80 mm for a 72 mm image, 58 mm
 * for a 48 mm one — with the image centred on the part the head reaches, and
 * as long as the image is. Used to be a fixed 80 mm, which would have printed
 * a 58 mm roll on an 80 mm page.
 */
const rollPaperMM = media => media.paperW || Math.round(media.w * 25.4 + 8);

/// Page size in mils — thousandths of an inch — which is what both the
/// Android print framework and the CSS @page rule below want.
function printPaperMils(media, sheet){
  if (media.flow) {
    return {w: Math.round(rollPaperMM(media) / 25.4 * 1000),
            h: Math.round(sheet.height / media.dpi * 1000)};
  }
  return {w: Math.round(media.w * 1000), h: Math.round(media.h * 1000)};
}

/* The one way out.
 *
 * Every print in the booth goes through here: a guest's sheet, a pack of
 * stickers, a test print from the editor, a calibration sheet. Four routes
 * sit behind it and the caller picks none of them — what it passes is a
 * canvas, a media and what to do when the printer has answered.
 *
 *   BLUETOOTH (`thermal`) is the silent one and the reason the Android build
 *   exists: the sheet is already one bit and goes out as ESC/POS raster with
 *   no window, which is what a kiosk needs and what no browser can do.
 *   USB (`usb`) is the same idea for a label printer plugged into the
 *   tablet, in TSPL.
 *   The SYSTEM SHEET (`dialog`) on Android hands over to the OS print
 *   spooler for an AirPrint or Mopria printer such as the SELPHY.
 *   A HIDDEN IFRAME is the browser's only route, and raises the browser's
 *   own print dialog — except under kiosk-chrome.sh, where it does not.
 *
 * EVIDENCE. Only the first two can say whether anything was printed, and
 * those two are the only ones this reports success for. The other two end at
 * a handover: the sheet is in the OS's spooler or the browser's dialog, and
 * what happens after that — a cancelled dialog, a printer with no paper, a
 * queue that is paused — is invisible to a web page. So those routes say
 * "sent", never "printed", and the booth's record of a working printer is
 * the operator pressing TEST PRINT and seeing paper, which is what
 * `printerTestedAt` is.
 *
 * ONE AT A TIME. A thermal job is answered per sheet, so a pack of four
 * stickers is four answers and the caller is told once, when the last one
 * lands. Walking a guest to the thank-you screen after the first of four
 * would leave three stickers still coming out.
 */
let printJob = null;            // a job on a route that will answer
let printHandoffUntil = 0;      // a job on a route that cannot

/// True while a print is in flight. Two taps on PRINT must not become two
/// prints, and on the thermal route a second job sent mid-raster corrupts
/// the first — the printer has no job queue, just a byte stream.
function printBusy(){
  return !!printJob || Date.now() < printHandoffUntil;
}

function printRasterImage(sheets, media, o){
  o = o || {};
  const list = (Array.isArray(sheets) ? sheets : [sheets]).filter(Boolean);
  if (!list.length) return 'empty';
  if (printBusy()) { toast('A print is already on its way.'); return 'busy'; }

  const copies = Math.max(1, o.copies || 1);
  const dataURLs = list.map(sheet => sheetDataURL(sheet, media));
  const done = o.done || (() => {});

  if (NATIVE && (settings.printMode === 'thermal' || settings.printMode === 'usb')) {
    printJob = {test: !!o.test, done: done, pending: list.length * copies};
    const dots = Math.max(64, settings.thermalWidthDots | 0);
    for (let c = 0; c < copies; c++) {
      dataURLs.forEach(u => {
        if (settings.printMode === 'thermal') {
          NATIVE.thermalPrint(u, 1, dots);
        } else {
          /* TSPL describes a label, not a stream, so the printer has to be
           * told how big one is or it does not know where to stop. A roll has
           * no height of its own — the sheet is as long as its content — so
           * the height is measured from the rendered sheet at the head's own
           * resolution. */
          const widthMM = media.flow ? rollPaperMM(media) : media.w * 25.4;
          const px = list[0];
          const heightMM = media.flow
            ? (px && px.height ? px.height / media.dpi * 25.4 : 150)
            : media.h * 25.4;
          NATIVE.usbPrint(u, 1, dots, +widthMM.toFixed(1), +heightMM.toFixed(1),
                          +(settings.labelGapMM || 0));
        }
      });
    }
    return 'pending';                        // finishes in nativePrintResult
  }

  if (NATIVE) {
    // Media sizes are in mils — thousandths of an inch. A roll has no page
    // height, so its length is whatever the sheet came out.
    const page = printPaperMils(media, list[0]);
    dataURLs.forEach(u => NATIVE.printSheet(u, copies, page.w, page.h,
                                            o.label || 'SnapBox ' + media.shortName));
    printHandoffUntil = Date.now() + 1500;
    done();
    return 'sent';
  }

  printHandoffUntil = Date.now() + 1500;
  openPrintDialog(dataURLs, media, copies, done);
  return 'sent';
}

/// Called by the Android shell when a Bluetooth or USB job has finished or
/// failed. The only place in the booth that can honestly say "printed".
function nativePrintResult(ok, message){
  // A test print from the layout editor is not a guest's print: it must not
  // advance the sheet counter or walk anyone to the thank-you screen.
  if (typeof editorPrintResult === 'function' && editorPrintResult(ok, message)) return;
  const job = printJob;
  // One failure fails the whole job: half a set of stickers is worse than a
  // clear error, and the rest are already queued behind it.
  if (!ok) {
    printJob = null;
    if (job && job.test) { toast(message || 'The printer did not answer.'); renderAdmin(); }
    else fail(message || 'The printer did not answer.');
    return;
  }
  if (!job) { setBars('#print-bars', 1); finishPrinting(); return; }
  if (--job.pending > 0) return;
  printJob = null;
  job.done();
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
function openPrintDialog(dataURLs, media, copies, done){
  const list = Array.isArray(dataURLs) ? dataURLs : [dataURLs];
  // iOS and iPadOS ignore `print()` called on an iframe, so the sheet has to
  // be printed from the page itself there. See printFromDocument.
  if (IPADOS) { printFromDocument(list, media, copies, done); return; }
  // A hidden iframe rather than window.open: no popup blocker, and the job
  // cannot be orphaned in a background tab.
  if (printFrame) printFrame.remove();
  printFrame = document.createElement('iframe');
  printFrame.setAttribute('aria-hidden', 'true');
  printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(printFrame);

  const pages = Array.from({length: Math.max(1, copies)},
    () => list.map(u => '<img src="' + u + '">').join('')).join('');
  const doc = printFrame.contentDocument;
  doc.open();
  const page = printPageCSS(media);
  doc.write(
    '<!doctype html><meta charset="utf-8"><title>SnapBox print</title><style>' +
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
function printFromDocument(dataURLs, media, copies, done){
  const list = Array.isArray(dataURLs) ? dataURLs : [dataURLs];
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

  /* Every sheet, every copy. A pack of four printed twice is eight labels,
   * and the order is pack-major so a guest gets whole sets rather than four
   * of sticker one followed by four of sticker two. */
  printout.innerHTML = Array.from({length: Math.max(1, copies)},
    () => list.map(u => '<img src="' + u + '">').join('')).join('');

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

/* Draw the session's code onto the DONE screen. Returns whether there is
 * anything there to scan, because that decides how long the screen holds. */
function showShareCode(){
  const mod = el('#ty-share');
  if (!mod) return false;
  const cfg = shareConfig();
  const link = cfg ? shareLink() : '';
  mod.hidden = true;
  if (!link) return false;

  const c = el('#ty-qr');
  const box = c.width;                      // square, set in the markup
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, box, box);
  try {
    QR.draw(g, link, {x: 0, y: 0, size: box}, INK);
  } catch (err) {
    // A code that cannot be encoded must not be shown as a pattern.
    console.warn('screen QR skipped:', err.message);
    return false;
  }
  setPixel(el('#ty-code'), cfg.code, 5);
  paintShareNote(Cloud.status());
  mod.hidden = false;
  return true;
}

/* What the DONE screen says under the code. The upload is usually still
 * running while the guest is reading it, so this is live rather than a
 * single verdict printed once. */
function paintShareNote(st){
  const node = el('#ty-share-note');
  if (!node || !share.sent) return;
  const total = st.done + st.failed + st.pending;
  if (st.failed && !st.pending) {
    node.textContent = st.done
      ? 'Some of these did not upload — the code will show what did.'
      // Usually the venue's wifi, but it could as easily be a wrong preset,
      // so it says what happened rather than guessing why.
      : 'These did not upload, so this code will not work.';
  } else if (st.pending) {
    node.textContent = 'Uploading ' + Math.min(total, st.done + 1) + ' of ' + total +
                       '… the code works as soon as it finishes.';
  } else if (st.done) {
    node.textContent = 'Ready. Point your phone camera at the code.';
  }
}

function finishPrinting(){
  // The sheet number advances only when a job has actually been sent, so a
  // guest who backs out does not burn a number.
  settings.sheetCounter = (settings.sheetCounter || 1) + 1;
  saveSettings();

  setPixel(el('#ty-message'),
           session.copies === 1 ? 'PRINT COMPLETE' : session.copies + ' PRINTS ON THE WAY', 5);
  const scannable = showShareCode();
  go('thankyou');
  clearTimeout(session.thankYouTimer);
  // Six seconds is enough to read a line of type. Getting a phone out,
  // waking it and framing a code is not a six second job, so a screen with
  // something to scan on it holds for as long as that takes.
  const hold = scannable
    ? Math.max(settings.thankYouSeconds, settings.shareHoldSeconds || 0)
    : settings.thankYouSeconds;
  session.thankYouTimer = setTimeout(() => {
    if (session.step === 'thankyou') abandon();
  }, hold * 1000);
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
    row('CAPTURE SIZE', seg('captureSize', [['max', 'MAXIMUM'], ['hd', 'HD 1080']], settings.captureSize)),
    row('CAMERA LOCK', seg('lockCamera', [[true, 'ON'], [false, 'OFF']], settings.lockCamera)),
    row('SETTLE', num('cameraSettleMs', 0, 2000, 100, 'ms')),
    note('info', cameraLockNote()),
    note('info', 'CAPTURE SIZE MAXIMUM asks the open camera for its largest mode instead of taking the browser\u2019s default, which can be VGA on a camera that also offers 4K. It costs nothing on the preview — the extra pixels are spent on the photograph, where a one-bit print needs every one of them. Drop to HD 1080 if the tablet feels slow.' + (cameraState.width ? ' Open now at ' + cameraState.width + 'x' + cameraState.height + '.' : '')),
    row('AUTO EXPOSURE', seg('autoExposure', [[true, 'ON'], [false, 'OFF']], settings.autoExposure)),
    row('EXPOSURE TARGET', num('exposureTarget', 100, 200, 5, '')),
    row('EXPOSURE AMOUNT', num('exposureStrength', 0, 1, 0.1, '')),
    row('SCREEN FLASH', seg('flashEnabled', [[true, 'ON'], [false, 'OFF']], settings.flashEnabled)),
    row('FLASH HOLD', num('flashHoldMs', 0, 500, 20, 'ms')),
    row('FLASH LEVEL', num('flashLevel', 0.2, 1, 0.1, '')),
    row('COUNTDOWN', num('countdownSeconds', 1, 10, 1, 's')),
    row('SHOT GAP', num('betweenShotsSeconds', 0.5, 6, 0.5, 's')),
    note(settings.autoExposure ? 'info' : 'warn', settings.autoExposure
      ? 'A guest stands in front of the room, and the room is brighter than they are, so the camera exposes for the room and puts the person at the bottom of the scale. On a thermal head everything down there burns solid and a face becomes a silhouette. This finds the darker part of the middle of the frame — the guest, not the wall behind them — and lifts it to EXPOSURE TARGET. Raise the target if faces still print dark; lower it if they look washed out. EXPOSURE AMOUNT softens the whole correction.'
      : 'Off: frames are printed as the camera metered them. In a backlit room that means faces at the bottom of the scale, which on thermal paper burns solid black. Nothing downstream can put the tone back.'),
    note(settings.flashEnabled ? 'info' : 'warn', settings.flashEnabled
      ? 'The whole panel turns white for the moment of the shutter, which is the only light a tablet booth has. FLASH HOLD is how long it stays lit before the frame is read — a camera needs a few frames to meter against new light, so at 0 the photograph is taken before the exposure has moved and the flash does nothing. Raise it if faces still come out dark; lower it if the pause feels long. Turn the device\u2019s screen brightness up: no web page can raise the backlight itself.'
      : 'Off: the shutter is silent and dark. On a lit stage that is right; in a dim room faces will be underexposed and there is nothing downstream that can put the light back.'),
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
    ...(IPADOS ? [note('warn',
      'On an iPad, PRINT is never the last tap. iOS raises its own print sheet ' +
      'and nothing can suppress it, so a guest still has to choose the printer ' +
      'the first time and press Print every time. iOS remembers the printer, so ' +
      'it is one tap after the first. A booth nobody is minding wants the Mac.')]
      : []),
  ];
  if (NATIVE) {
    // On the tablet the mode is a real choice, not an inference.
    printRows.push(row('PRINT MODE', seg('printMode',
      [['dialog', 'SYSTEM DIALOG'], ['thermal', 'BLUETOOTH'], ['usb', 'USB']],
      settings.printMode)));
    if (settings.printMode === 'usb') {
      printRows.push(row('LABEL GAP', num('labelGapMM', 0, 6, 0.5, 'mm')));
      printRows.push(row('USB PRINTER', '<div class="seg"><button class="on">' +
        escapeHTML(usbPrinterNames() || 'NONE FOUND') + '</button></div>'));
    }
    printRows.push(note(silent ? 'info' : 'warn',
      settings.printMode === 'usb'
      ? 'Silent, over the cable. Android itself will not print to a USB printer, so the booth drives it directly: the sheet is dithered here and sent as TSPL to the printer\u2019s own endpoint, with no window and nothing for a guest to tap. TSPL is the label-printer language — a VOZY U9 speaks it and will not take the ESC/POS that BLUETOOTH sends. Android asks for USB permission once per printer; grant it before the doors open. LABEL GAP is the unprinted strip between die-cut stickers, 0 for a continuous roll.'
      : silent
      ? 'Silent. Pressing PRINT dithers the sheet and sends it straight out over Bluetooth — no window, nothing for a guest to tap. Pick the printer below. This sends ESC/POS, which receipt printers understand and label printers such as the VOZY U9 do not; for one of those use USB.'
      : 'The Android print sheet will appear. It finds an AirPrint printer such as the SELPHY over Mopria. For a booth with nobody minding it, switch to BLUETOOTH for a receipt printer or USB for a label printer on the cable.'));
  } else {
    printRows.push(row('PRINT MODE',
        '<div class="seg"><button class="' + (silent ? 'on' : '') + '">SILENT</button>' +
        '<button class="' + (silent ? '' : 'on') + '">DIALOG</button></div>'));
    printRows.push(note(silent ? 'info' : 'warn', silent
      ? 'Silent: pressing PRINT sends the sheet straight to the default printer, no window. Set that printer\u2019s paper to match PAPER above — Chrome uses the driver\u2019s defaults and asks nothing. kiosk-chrome.sh -p <name> picks the printer and reports what it will use.'
      : IPADOS
      ? 'The iOS print sheet will appear on every print and cannot be suppressed \u2014 not by this booth, not by any app. Printing with no tap at all means running the booth on a computer instead.'
      : 'A print dialog will appear. To print silently, quit Chrome and run ./kiosk-chrome.sh — it relaunches Chrome with --kiosk-printing, which is the only way a browser can print without a window. Safari cannot do it at all.'));
  }
  // A sticker printer reached from a browser is a different problem from one
  // reached over Bluetooth, and the answer is not the same.
  if (currentMedia().thermal && !currentMedia().flow && !NATIVE) {
    printRows.push(note('info', labelRouteNote()));
  }
  parts.push(section('PRINT', 'printer', printRows));

  if (!NATIVE) parts.push(printerSection());

  parts.push(syncSection());
  parts.push(shareSection());

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
    note(currentMedia().thermal ? 'warn' : 'info', currentMedia().thermal
      ? 'PHOTO TONE is ignored on thermal paper: the head has one ink and two states, so every photo is printed monochrome whatever this says. The preview shows what will actually burn.'
      : 'PHOTO TONE picks whether photographs print in colour or monochrome.'),
    note('info', 'DISPLAY WORD is the oversized word on the sheet — a long one runs off the edge on purpose, and on a receipt it is the script line under the event name. Leave it empty to use the event name. SHEET NO. prints as "003." and counts up with every print.'),
  ]));

  if (currentMedia().thermal) {
    parts.push(thermalImageSection());
    parts.push(calibrationSection());
  }

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
    note('warn', settings.shareOn
      ? 'Photos live in this tab only and are dropped when the session ends — nothing is written to disk. They are uploaded, because DIGITAL COPY is on; turn it off there and nothing leaves the device at all.'
      : 'Photos live in this tab only and are dropped when the session ends. Nothing is uploaded and nothing is written to disk.'),
  ]));

  parts.push('<div class="row gap14"><span class="grow"></span>' +
             '<button class="btn solid" data-act="abandon" style="width:250px">' +
             '<span class="px" data-cell="4">CLOSE</span></button></div>');

  body.innerHTML = parts.join('');
  paintIcons(body); paintPixelText(body);
  wireAdmin(body);
  // A canvas cannot be written into a string of markup, so the side-by-side
  // preview is appended after the panel exists.
  paintCalibrationPreview(body);
}

/* THERMAL IMAGE — the pipeline, as controls.
 *
 * Ordered the way an operator works: look at the preview, pick a halftone,
 * then move the three tone controls, then the two sharpening ones. The notes
 * under each group say what the control does to the print rather than what it
 * does to the pixels, because the thing being judged is paper.
 */
function thermalImageSection(){
  const mode = settings.thermalDither || 'atkinson';
  const media = currentMedia();
  const rows = [];

  rows.push('<div class="calpair" id="cal-pair"></div>');
  rows.push(note(calibrationSource() ? 'info' : 'warn', calibrationSource()
    ? 'The photograph in hand, at the exact size and shape it prints: the frame on the left, the dots that will burn on the right. Both halves are at the print\u2019s own scale and are not resized to fit — a dither looks fine at every size except its own, which is the one that matters.'
    : 'Take a photograph and come back: the preview needs a real frame. Sample faces are used until then.'));

  rows.push(row('DITHER', seg('thermalDither',
    [['atkinson', 'ATKINSON'], ['adaptive', 'ADAPTIVE'], ['floyd', 'DIFFUSION'],
     ['ordered', 'SCREEN'], ['threshold', 'HARD'], ['none', 'OFF']], mode)));
  rows.push(note(mode === 'none' || mode === 'threshold' ? 'warn' : 'info',
    mode === 'none'
      ? 'OFF sends the printer 8-bit grey and lets its driver decide which dots to burn. Most drivers simply threshold — every tone above a level goes white, everything below goes black — and a face becomes two flat shapes. This is what the booth did before; keep it only if your printer dithers better than this does.'
      : mode === 'threshold'
      ? 'HARD is a single cut level, and on a face it is the wrong answer: the features fall on whichever side of the level they happen to sit and no amount of brightness puts them back. It is here for line art — a logo, a barcode, a scanned signature — and as the control on the calibration sheet, where a thresholded face next to a dithered one shows what the dithering is buying.'
      : mode === 'ordered'
      ? 'SCREEN uses a fixed 4x4 pattern. Coarser than the diffusions on a face, but it never smears, so large flat areas stay even. Worth trying if you see worm-like streaks on plain backgrounds.'
      : mode === 'floyd'
      ? 'DIFFUSION judges every dot against the same mid-grey and pushes all of the error into its neighbours. The most tonally accurate of these on an evenly lit frame — and the one that fails worst on a dark one, because a region sitting well below mid-grey has every dot fall the same way and goes solid.'
      : mode === 'adaptive'
      ? 'ADAPTIVE is DIFFUSION with the threshold following the local average, so a feature inside a shadow is judged against that shadow rather than against mid-grey. Costs a little fine detail and a little more ink.'
      : 'ATKINSON throws a quarter of the error away instead of passing all of it on, so a dark region cannot snowball into solid black and a bright one cannot wash out. Flatter midtones, and faces that keep their features at both ends of the scale — which is why it is the default here. Thermal paper darkens as heat spreads around each dot, so a diffusion that refuses to accumulate error is closer to what the paper actually does.'));

  if (mode === 'threshold') {
    rows.push(row('CUT LEVEL', num('thermalThreshold', 32, 224, 8, '')));
  }

  rows.push(row('BRIGHTNESS', num('thermalBrightness', -40, 60, 5, '')));
  rows.push(row('CONTRAST', num('thermalContrast', 0.6, 2.5, 0.05, '')));
  rows.push(row('GAMMA', num('thermalGamma', 0.5, 2.0, 0.05, '')));
  rows.push(note('info', 'Three different controls, and which one to reach for depends on what is wrong. GAMMA is the one to try first: it is a curve, so it lifts the midtones — where a thermal print always fails, because heat spreads around every dot and darkens them — and leaves pure black and pure white exactly where they are. BRIGHTNESS adds a constant and moves the ends too, so pushed hard it flattens them. CONTRAST pulls the ends apart and clips both. Faces filling in: raise GAMMA. Whole print grey and flat: raise CONTRAST. Whole print too dark: raise BRIGHTNESS.'));

  rows.push(row('FACE LIFT', num('thermalFaceLift', 0, 1, 0.05, '')));
  rows.push(row('NOISE', num('thermalDenoise', 0, 1, 0.1, '')));
  rows.push(note('info', 'FACE LIFT raises whatever sits in local shadow — at a booth that is usually a face, lit from one side in front of a brighter room. It is not face detection: no browser here offers one, and carrying a model would cost megabytes in an app whose point is working offline. It reads the local average instead, which lightens shadowed cheeks and eye sockets without flattening the rest of the sheet. Measured, its effect is modest; set it to 0 if shadows look washed out. NOISE is a 3x3 median before the tone work, and is off for a reason: on a clean frame it costs eyelashes and hair texture. Raise it to about 0.3 only in a dim venue, where the camera has pushed its gain up and the dither is turning sensor grain into burned dots.'));

  rows.push(row('SHARPEN', num('thermalSharpen', 0, 2, 0.1, '')));
  rows.push(row('RADIUS', num('thermalSharpenRadius', 0.3, 2, 0.1, 'px')));
  rows.push(note('info', 'Sharpening runs after the photograph has been resized to printer dots and before the dither, so it builds edges the head can actually place. RADIUS is in printed dots: about one dot at 203dpi is 0.7 to 1.0, and wider than that shows as a grey ring around every edge. Set SHARPEN to 0 if text or eyelashes start to look gritty.'));

  rows.push(row('INVERT', seg('thermalInvert', [[false, 'OFF'], [true, 'ON']], settings.thermalInvert)));
  rows.push(note(settings.thermalInvert ? 'warn' : 'info', settings.thermalInvert
    ? 'INVERT is on: every dot is swapped on the way out. This is only ever right for a printer that reads a set bit as \u201cdo not burn\u201d and otherwise prints a negative. If prints are coming out as photographic negatives, this is the fix; if they are not, turn it off.'
    : 'INVERT swaps black for white on the way out. A wiring fix, not a look — turn it on only if the printer produces a negative.'));

  rows.push(note('info', 'The whole path a photograph takes: crop, noise, resize to printer dots, greyscale, brightness, contrast, gamma, lift local shadow, sharpen, dither. Nothing is resized or re-dithered after that, on any route. The review and confirm screens show the dithered sheet, so what a guest approves is exactly what burns, dot for dot.'));

  if (media.flow) {
    rows.push(row('MAX LENGTH', num('thermalMaxHeightDots', 0, 6000, 400, ' dots')));
    rows.push(note('info', 'The tallest sheet to send, in printer dots — 0 for no limit, which is the default. A roll has no page length so a long receipt is legal, but a sheet taller than the printer\u2019s own raster buffer is not, and some printers answer that by truncating it without saying so. A sheet over this is scaled down to fit before the dither, never after.'));
  }
  return section('THERMAL IMAGE', 'star', rows);
}

/* The head width, and the test sheet.
 *
 * Separate from THERMAL IMAGE because it is a fact about the printer rather
 * than a judgement about the picture, and because it is the one setting here
 * that is wrong silently: a sheet wider than the head is clipped or shrunk
 * by the printer with no error anywhere.
 */
function calibrationSection(){
  const media = currentMedia();
  const rows = [];
  const presets = [[832, '104MM / 832'], [576, '80MM / 576'],
                   [384, '58MM / 384'], [203, '25MM / 203']];
  rows.push(row('HEAD WIDTH', seg('thermalWidthDots', presets, settings.thermalWidthDots)));
  rows.push(row('OR TYPE IT', '<input class="afield" data-dots="thermalWidthDots" ' +
    'inputmode="numeric" placeholder="dots across" value="' +
    (settings.thermalWidthDots | 0) + '" style="width:180px;max-width:100%">'));
  rows.push(note('info', 'The number of dots across the printer\u2019s head, from its own specification. The presets are conventions, not a rule: 576 dots is 80mm at 203dpi and most 80mm printers have exactly that, but an 80mm printer with a 640-dot head exists, and a 576-dot sheet sent to one prints narrow with a white strip down the side. If prints come out narrower or wider than the paper, this is the number to change.'));

  const paperDots = mediaPixels(media).w;
  const headDots = settings.thermalWidthDots | 0;
  if (media.thermal && paperDots > headDots) {
    rows.push(note('warn', media.shortName + ' renders ' + paperDots +
      ' dots wide but HEAD WIDTH is set to ' + headDots + '. The extra ' +
      (paperDots - headDots) + ' will be scaled or cut off by the printer, ' +
      'silently. Raise HEAD WIDTH to match the printer, or pick a narrower paper.'));
  }

  rows.push(row('SAMPLES', seg('calibrationSamples', [[1, '1'], [2, '2'], [4, '4']],
    settings.calibrationSamples)));
  rows.push(row('', '<button class="btn solid" data-act="cal-print" style="min-width:260px">' +
    '<span class="px" data-cell="4">PRINT TEST SHEET</span></button>'));
  rows.push(note('info', 'One sheet, six labelled variants of the same photograph, and the settings they share printed across the top: the four halftones, the current settings with GAMMA raised a quarter, and a hard threshold as the control. Pick the cell that looks best on the paper and set the controls above to match it. SAMPLES prints the same six for more than one photograph, which is worth doing once — a single face and a group shot fail differently on one bit.'));

  const when = settings.printerTestedAt
    ? new Date(settings.printerTestedAt).toLocaleString() : '';
  rows.push(note(when ? 'info' : 'warn', when
    ? 'Last test print: ' + when + ' on ' + (settings.printerTestedOn || 'unknown paper') +
      '. That is a record of the booth sending a job, not of paper coming out — a web page cannot be told whether a printer actually printed, so the only real confirmation is the one you saw.'
    : 'No test print has been sent from this device. Send one before an event: the booth cannot detect a printer, so this is the only way to know the route works.'));
  return section('PRINTER CALIBRATION', 'printer', rows);
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

  /* What this particular tablet is willing to do, which is the thing that
   * actually decides whether a USB camera can work here — and is decided by
   * the manufacturer rather than by Android's version. Worth showing before
   * anything else, because a tablet that hides USB cameras and a camera that
   * is simply unplugged produce an identical empty list. */
  let caps = '';
  try { caps = (NATIVE.deviceCapabilities && NATIVE.deviceCapabilities()) || ''; } catch {}
  const [shares, host, model] = caps.split('\t');

  const rows = [];
  if (caps) {
    rows.push(row('THIS TABLET', '<div class="seg"><button class="' +
      (shares === 'SHARES USB CAMERAS' ? 'on' : '') + '">' + escapeHTML(shares || '?') +
      '</button><button class="' + (host === 'USB HOST' ? 'on' : '') + '">' +
      escapeHTML(host || '?') + '</button></div>'));
    rows.push(row('MODEL', '<div class="seg"><button class="on">' +
      escapeHTML(model || '') + '</button></div>'));
    rows.push(note(shares === 'SHARES USB CAMERAS' ? 'info' : 'warn',
      shares === 'SHARES USB CAMERAS'
        ? 'This tablet shares USB cameras with apps, so a plugged-in camera should appear under ANDROID SEES above and simply work \u2014 no direct drive needed. This is the setting to look for when choosing a tablet, and most do not have it.'
        : 'This tablet HIDES USB cameras from apps. It does not declare the external-camera feature, so no app on it \u2014 this one or any other \u2014 can open a USB camera the normal way. DIRECT DRIVE below is the workaround, and it only works on a camera with a BULK endpoint. If you are choosing a tablet, this is the line to check in the shop: install the booth, open this panel, and buy the one that says SHARES USB CAMERAS.'));
  }
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
  // HEAD WIDTH used to be here and now lives in PRINTER CALIBRATION, with
  // the test sheet and the paper-wider-than-the-head warning: it is one
  // number and it was being asked for in two places.
  rows.push(note(devices.length ? 'info' : 'warn', devices.length
    ? 'Paired Bluetooth devices. Pick the printer, then set HEAD WIDTH in PRINTER CALIBRATION to match it and PAPER above to the paper actually loaded. The sheet is dithered to 1 bit here, so what you see on the confirm screen is what burns.'
    : 'No paired Bluetooth devices. Pair the printer in Android Settings › Connected devices first, then come back — the booth never scans for radios in front of a guest.'));
  if (currentMedia().thermal && !currentMedia().flow) rows.push(note('warn', labelPrinterNote()));
  return section('BLUETOOTH PRINTER', 'printer', rows);
}

/* How a sticker printer is reached from whatever the booth is running on.
 *
 * Three different answers, and the iPad's is the one people expect to be
 * wrong about, so it says what cannot be done before what can.
 */
function labelRouteNote(){
  if (IPADOS) {
    return 'Label paper is selected. An iPad cannot print to a USB printer, ' +
           'with or without a dock: iPadOS installs no printer drivers and ' +
           'exposes no USB printer class, so no app can reach one. What does ' +
           'work is plugging the printer into a Mac on the same wifi and ' +
           'turning on printer sharing — macOS then advertises it to iPadOS ' +
           'as an AirPrint printer and it appears in the print sheet. Expect ' +
           'one tap per print: iOS always raises that sheet and no app, native ' +
           'or web, can suppress it. For printing with no tap at all, run the ' +
           'booth on the Mac itself with kiosk-chrome.sh.';
  }
  return 'Label paper is selected. On a Mac or PC this prints to a USB ' +
         'sticker printer normally, once its driver is installed and its ' +
         'paper size is set to match PAPER above — and silently, with no ' +
         'window, through kiosk-chrome.sh. On a tablet it will not: neither ' +
         'iPadOS nor Android lets a web page reach a USB printer, and a ' +
         'Bluetooth-only one needs the Android build with PRINT MODE set to ' +
         'BLUETOOTH.';
}

/* Send one sheet, from the console, through the production print path.
 *
 * Deliberately the *real* path — the same renderer, the same thermal
 * pipeline, the same page CSS — rather than a simplified test pattern. A test
 * that takes a shortcut proves the shortcut works. This proves the thing a
 * guest will actually trigger, on the paper currently selected, which is why
 * it is also worth running after changing paper or dither settings.
 */
function testPrint(){
  const media = currentMedia();
  const tpl = guestLayouts()[0] || activeLayout();
  if (!tpl) { toast('No layout fits the selected paper.'); return; }

  const photos = (typeof edSamplePhotos === 'function' ? edSamplePhotos() : [])
                   .slice(0, tpl.shots || 1);
  if (!photos.length) { toast('No sample photographs to print.'); return; }

  const sheet = thermalize(
    renderSheet(photos, tpl, media, branding(tpl), 1,
                {mono: media.thermal || settings.photoTone !== 'colour'}),
    media);
  settings.printerTestedAt = Date.now();
  settings.printerTestedOn = media.shortName;
  saveSettings();

  // The sheet counter is a record of guests served, and a test is not one.
  printRasterImage(sheet, media, {copies: 1, test: true,
                                  label: 'SnapBox test', done: renderAdmin});
}

/// A brief message, on the tablet through the shell and otherwise in the
/// console itself, so a failure here is never silent.
function toast(message){
  if (NATIVE && NATIVE.toast) { try { NATIVE.toast(message); return; } catch {} }
  const body = el('#admin-body');
  if (!body) return;
  const box = document.createElement('div');
  box.className = 'note';
  box.innerHTML = '<span class="swatch warn-c"></span><span>' + escapeHTML(message) + '</span>';
  body.insertBefore(box, body.firstChild);
  setTimeout(() => box.remove(), 6000);
}

/// Makes a fresh code from the console, after confirming, because changing
/// it cuts this device off from the layouts saved under the old one.
function newSyncCodeFromAdmin(){
  const had = (settings.syncCode || '').trim();
  if (had && !confirm('Replace the sync code?\n\nThis device will stop seeing the layouts stored under the old code. Any device you want to keep in step will need the new one.')) return;
  settings.syncCode = newSyncCode();
  settings.syncSince = '';
  settings.syncLastNote = 'NEW CODE — NOT SYNCED YET';
  saveSettings();
  renderAdmin();
}


/* The digital copy, in the operator console.
 *
 * Like the printer section, this tests rather than detects. There is no way
 * to ask Cloudinary "will my uploads work" other than uploading something,
 * so that is what TEST UPLOAD does — one eight-pixel square, under a fixed
 * name so repeating the test stores nothing new. It is the only honest
 * answer to "is this configured", and it is worth running before an event
 * rather than discovering it with a queue waiting.
 */
async function testShare(){
  if (!settings.shareOn) { settings.shareLastNote = 'TURNED OFF'; renderAdmin(); return; }
  settings.shareLastNote = 'TESTING…';
  renderAdmin();
  try {
    const out = await Cloud.probe({cloud: settings.shareCloud, preset: settings.sharePreset});
    settings.shareTestedAt = Date.now();
    settings.shareLastNote = 'UPLOAD OK IN ' + out.ms + ' MS';
  } catch (err) {
    settings.shareLastNote = 'FAILED — ' + String(err.message).slice(0, 90);
  }
  saveSettings();
  renderAdmin();
}

function shareSection(){
  const on = !!settings.shareOn;
  const when = settings.shareTestedAt
    ? new Date(settings.shareTestedAt).toLocaleString() : 'NEVER';
  const rows = [
    row('DIGITAL COPY', seg('shareOn', [[true, 'ON'], [false, 'OFF']], on)),
    row('CLOUD NAME', field('shareCloud', 'your Cloudinary cloud name')),
    row('UPLOAD PRESET', field('sharePreset', 'an UNSIGNED preset on that account')),
    row('LINK PAGE', field('shareBase', 'https://…/s/ — where a scanned code opens')),
    row('CODE ON SCREEN', num('shareHoldSeconds', 5, 90, 5, 's')),
    row('LAST TEST', '<div class="seg"><button class="on">' +
      escapeHTML(when + (settings.shareLastNote ? '  ·  ' + settings.shareLastNote : '')) +
      '</button></div>'),
    row('', '<button class="btn solid" data-act="share-test" style="min-width:250px">' +
      '<span class="px" data-cell="4">TEST UPLOAD</span></button>'),
  ];
  rows.push(note(on ? 'warn' : 'info', on
    ? 'ON means every printed session is uploaded: each photograph, and the print as a colour picture. Guests scan the code on the DONE screen and can save them. This is the one place the booth sends a photograph anywhere — if a venue or a guest asks for it not to, this is the switch.'
    : 'OFF means no photograph leaves the device, ever. Guests get paper and nothing else, and the DONE screen shows no code.'));
  rows.push(note('info', 'The code is minted when a session starts, so it can be printed on the sheet straight away; the pictures go up when PRINT is pressed and usually land before the guest has their phone out. A code whose upload has not finished shows STILL UPLOADING on the page rather than an error.'));
  rows.push(note('info', 'The preset must be an UNSIGNED one. Unsigned is the whole security model here: a booth can add files and do nothing else — it cannot list, read or delete what is on the account. The flip side is that nothing in the booth can delete an upload either; that is a job for the Cloudinary console, where the tag "snapbox-" plus the code finds a session.'));
  rows.push(note('warn', 'Anyone holding a code can see that session. The codes are six characters from a 30 letter alphabet — 729 million of them — so they are not guessable in practice, but they are not private either. Treat a code like the photographs themselves.'));
  rows.push(note('info', 'If the network is down when PRINT is pressed, the booth leaves the code off the paper rather than printing one that leads nowhere — the sheet is composed again without it. The screen still shows the code, and says plainly that nothing uploaded.'));
  return section('DIGITAL COPY', 'cd', rows);
}

function syncSection(){
  const code = (settings.syncCode || '').trim();
  const when = settings.syncLastAt
    ? new Date(settings.syncLastAt).toLocaleString() : 'NEVER';
  const rows = [
    row('SYNC CODE', field('syncCode', 'paste the code from your other device')),
    row('AUTOMATIC', seg('syncAuto', [[true, 'ON'], [false, 'OFF']], settings.syncAuto)),
    row('LAST SYNC', '<div class="seg"><button class="on">' +
      escapeHTML(when + (settings.syncLastNote ? '  ·  ' + settings.syncLastNote : '')) +
      '</button></div>'),
    row('YOUR LAYOUTS', '<div class="seg"><button class="on">' +
      (settings.customLayouts || []).length + ' HERE</button></div>'),
    row('', '<button class="btn solid" data-act="sync-now" style="min-width:230px">' +
      '<span class="px" data-cell="4">SYNC NOW</span></button>' +
      '<span class="grow"></span>' +
      '<button class="btn" data-act="sync-new-code" style="min-width:230px">' +
      '<span class="px" data-cell="4">NEW CODE</span></button>'),
  ];
  rows.push(note(code ? 'info' : 'warn', code
    ? 'Layouts made on any device using this code turn up on the others. Put the same code into the browser, the iPad and the tablet and they stay in step — with AUTOMATIC on, on every launch and a couple of seconds after a layout is saved.'
    : 'No sync code yet. Press NEW CODE on the device that already has your layouts, then type that code into the others. There is no account to make: the code is the only thing that ties them together.'));
  rows.push(note('warn', 'Sync itself sends only layouts and the paper sizes they need — never a photograph. Photographs are a separate question, answered by DIGITAL COPY below: with that off, none ever leaves the device. On the tablet both are now promises about this code rather than something Android enforces, because sync needed the network permission the app used to go without.'));
  rows.push(note('info', 'The code is a shared secret, not a login. Anyone you give it to can read and overwrite these layouts, so treat it like the key to a filing cabinet: fine for designs, not for anything private.'));
  return section('SYNC', 'star', rows);
}

/* The printer, as much as a web page is allowed to know about it.
 *
 * Which is nothing. There is no API for listing printers in a browser and no
 * way to connect to one: `navigator.printing` is a proposal, unimplemented
 * everywhere, and Safari has nothing like it. `window.print()` hands the job
 * to the operating system and the page never learns what happened to it — not
 * which printer, not whether it printed, not whether one exists.
 *
 * So this section does not pretend to detect anything. What it offers instead
 * is the thing detection would have been *for*: a way to prove, at setup,
 * that pressing PRINT reaches paper — before a guest is standing there. On an
 * iPad that first test is also what teaches iOS which printer to use, since
 * it remembers the last one; after it, the print sheet comes up with the
 * right printer already chosen and PRINT is one tap.
 */
function printerSection(){
  const media = currentMedia();
  const when = settings.printerTestedAt
    ? new Date(settings.printerTestedAt).toLocaleString()
    : '';
  const rows = [
    row('ROUTE', '<div class="seg"><button class="on">' +
      escapeHTML(IPADOS ? 'iOS PRINT SHEET'
                : silentPrintingLikely() ? 'SILENT TO DEFAULT PRINTER'
                : 'SYSTEM PRINT DIALOG') + '</button></div>'),
    row('PAPER', '<div class="seg"><button class="on">' +
      escapeHTML(media.shortName) + '</button></div>'),
    row('LAST TEST', '<div class="seg"><button class="on">' +
      escapeHTML(when ? when + (settings.printerTestedOn
                                ? '  ·  ' + settings.printerTestedOn : '')
                      : 'NEVER') + '</button></div>'),
    row('', '<button class="btn solid" data-act="printer-test" style="min-width:260px">' +
      '<span class="px" data-cell="4">TEST PRINT</span></button>'),
  ];
  rows.push(note('info', IPADOS
    ? 'TEST PRINT sends one sheet on the paper above, through exactly the path a guest\u2019s print takes. Do it once during setup: the iOS print sheet will come up, and the printer you choose is the one iOS offers first from then on, so every print after this is a single tap. If no printer is listed, the problem is upstream of the booth — see the note under PRINT above.'
    : 'TEST PRINT sends one sheet on the paper above, through exactly the path a guest\u2019s print takes. Worth doing before every event: it is the only way to find out that the printer is out of paper, asleep, or set to the wrong stock while there is still time to fix it.'));
  rows.push(note('warn', 'A web page cannot list printers or connect to one — there is no browser API for it, on any platform, and none is coming soon. The booth cannot tell you whether a printer is plugged in, only whether a sheet you sent came out. That is why this is a button and not a status light.'));
  return section('PRINTER', 'printer', rows);
}

/* What a sticker printer needs, said once and in one place.
 *
 * These printers are cheap, common and not standardised. Two things decide
 * whether one prints: the language it speaks, and how it is reached. The
 * booth can only be honest about both.
 */
function labelPrinterNote(){
  return 'Label paper is selected. Bluetooth here speaks ESC/POS raster, ' +
         'which many waybill printers understand and some do not — the ones ' +
         'that only speak TSPL or CPCL will answer and print nothing, or feed ' +
         'blank stickers. The VOZY U9 is one of those: it reports TSPL and ' +
         'will not take ESC/POS, so on a tablet it needs PRINT MODE set to ' +
         'SYSTEM DIALOG and its own Android driver. Plugged into a Mac or PC ' +
         'it prints normally. Set HEAD WIDTH to 104MM / 832 for a 4-inch head.';
}

/// Printer-class devices on the USB port, for the operator console.
function usbPrinterNames(){
  let raw = '';
  try { raw = NATIVE && NATIVE.usbPrinters ? (NATIVE.usbPrinters() || '') : ''; } catch {}
  return raw.split('\n').filter(Boolean)
            .map(l => l.split('\t')[0]).join('  ·  ');
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
      else if (key === 'calibrationSamples') value = parseInt(value, 10) || 1;
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

  /* A typed number, for the one setting whose right value is on a printer's
   * spec sheet rather than in a list. Committed on blur and on Enter rather
   * than per keystroke: typing "576" passes through 5 and 57, and re-rendering
   * every sheet in the booth at a head width of 5 dots is a long wait for
   * nothing. */
  root.querySelectorAll('[data-dots]').forEach(input => {
    const commit = () => {
      const key = input.dataset.dots;
      const n = parseInt(input.value, 10);
      if (!n || n < 64 || n > 4096) { input.value = settings[key] | 0; return; }
      settings[key] = n;
      saveSettings();
      afterSettingChange(key);
      renderAdmin();
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  });

  root.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      settings[input.dataset.field] = input.value;
      saveSettings();
      afterSettingChange(input.dataset.field);
    });
  });
}

/* Settings that change what comes out of the printer. Any of them moving
 * means the sheet in hand is stale and the preview beside the control is
 * lying, so both are redrawn. */
const THERMAL_KEYS = ['thermalDither', 'thermalContrast', 'thermalBrightness',
  'thermalGamma', 'thermalDenoise', 'thermalSharpen', 'thermalSharpenRadius',
  'thermalFaceLift', 'thermalThreshold', 'thermalInvert', 'thermalWidthDots',
  'thermalMaxHeightDots'];

function afterSettingChange(key){
  // A changed code is a different set of layouts, so the next pull starts
  // from the beginning rather than from this device's old cursor.
  if (key === 'syncCode') { settings.syncSince = ''; syncSoon(); }
  if (key === 'syncAuto') syncSoon();
  if (key === 'mirrorPreview') applyMirror();
  if (key === 'flashEnabled' || key === 'autoExposure') renderAdmin();
  // Both of these are properties of the open track, so they are applied to
  // the camera in hand rather than waiting for the next session.
  if (key === 'captureSize' || key === 'lockCamera' || key === 'cameraSettleMs') {
    prepareCamera().then(renderAdmin);
  }
  if (key === 'printMode') renderAdmin();
  // The thermal controls only mean anything against a picture, so redraw the
  // one in hand and refresh the note under the switch.
  if (THERMAL_KEYS.indexOf(key) >= 0) {
    if (session.photos && session.photos.some(Boolean) && session.layout) compose();
    // Every one of these changes the preview, which is the whole reason the
    // preview is there. Only three of them change which rows exist, and
    // rebuilding the panel on a BRIGHTNESS tap would throw the operator's
    // scroll position away mid-adjustment.
    if (key === 'thermalDither' || key === 'thermalInvert' ||
        key === 'thermalWidthDots') renderAdmin();
    else refreshCalibrationPreview();
  }
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
  const on = !!settings.mirrorPreview;
  video.classList.toggle('mirror', on);
  uvcImage.classList.toggle('mirror', on);
  if (attractVideo) attractVideo.classList.toggle('mirror', on);
  if (attractUvc) attractUvc.classList.toggle('mirror', on);
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
 * Layout sync
 *
 * Layouts made in one place turn up everywhere else. Nothing else does.
 *
 * **No photograph is ever sent.** The payload is built from the layout list
 * and the custom paper sizes those layouts need, and from nothing else —
 * `syncPayload` below is the only thing that composes it, and it reads two
 * settings keys. Session photos live in the tab and are dropped when the
 * session ends; there is no path from a captured frame to the network, and
 * the server refuses anything that is not layout-shaped besides.
 *
 * This is why the Android build now carries the INTERNET permission it
 * deliberately went without. That permission made "photographs cannot leave
 * this tablet" a promise the operating system enforced; it is now a promise
 * about this code. The trade bought sync and cost that guarantee, and it is
 * worth being plain about which is which.
 *
 * There are no accounts. A booth has nobody to log in, so identity is a long
 * random code generated on the device and typed into the others. It is a
 * shared secret, not a login: anyone with the code can read and overwrite the
 * layouts under it.
 *
 * Everything here fails quietly. A booth with no network is the normal case,
 * not an error state, and a guest must never see a sync problem.
 * ==================================================================== */

const SYNC = {
  url: 'https://snfukbofyadfrhuaggad.supabase.co',
  // Public by design — it grants nothing on its own. The table is closed to
  // this role entirely and the only way in is the two functions, both of
  // which demand the sync code. See supabase/schema.sql.
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZnVrYm9meWFkZnJodWFnZ2FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjY3NzUsImV4cCI6MjEwMzg0Mjc3NX0.VS7OJ0vTK97AITaiXcuoTE-cJ3-jdADT1fzniDtPTfo',
  timeout: 12000,
};

let syncing = false;

/// A code long enough that guessing it is not a strategy, grouped so it can
/// be read aloud across a room without mistakes.
function newSyncCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const body = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  return 'SNAP-' + body.match(/.{1,5}/g).join('-');
}

async function syncCall(fn, body){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC.timeout);
  try {
    const res = await fetch(SYNC.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SYNC.anonKey,
        'Authorization': 'Bearer ' + SYNC.anonKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('server said ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* What goes up: every custom layout, and the custom papers they sit on.
 *
 * Built here and only here, so there is one place to look when asking what
 * this app sends. It reads `customLayouts` and `customMedia` and nothing
 * else. */
function syncPayload(){
  const layouts = settings.customLayouts || [];
  const papers = settings.customMedia || [];
  const used = new Set(layouts.map(l => l.mediaID));
  const live = layouts.map(layout => ({
    id: layout.id,
    payload: {
      layout,
      // A layout is useless on a device that has never heard of its paper, so
      // the paper travels with it.
      paper: papers.find(m => m.id === layout.mediaID && used.has(m.id)) || null,
    },
  }));
  // Deletions travel as records of their own. A layout that is simply absent
  // from a push looks, to every other device, exactly like one they have and
  // this device has not seen yet — so it would come straight back.
  const gone = (settings.syncTombstones || []).map(id => ({
    id, deleted: true, payload: {layout: {id}},
  }));
  return live.concat(gone);
}

/// Merge one pulled record in. Newest wins; a delete is a record too.
function syncAbsorb(row){
  const body = row.payload || {};
  const layout = body.layout;
  if (!layout || !layout.id) return false;

  settings.customLayouts = settings.customLayouts || [];
  settings.customMedia = settings.customMedia || [];
  const at = settings.customLayouts.findIndex(l => l.id === layout.id);

  /* A layout this device has deleted but not yet reported.
   *
   * The pull runs before the push, so the server still shows it alive — and
   * absorbing that row puts the layout back on the very device that just
   * deleted it, until the sync after next. Holding the tombstone as the
   * local truth until it has been sent is what stops a delete flickering
   * back into the list in front of the operator. */
  if (!row.deleted && (settings.syncTombstones || []).includes(layout.id)) return false;

  if (row.deleted) {
    settings.syncTombstones = (settings.syncTombstones || [])
      .filter(id => id !== layout.id);
    if (at < 0) return false;
    settings.customLayouts.splice(at, 1);
    settings.guestLayoutIDs = (settings.guestLayoutIDs || []).filter(id => id !== layout.id);
    return true;
  }

  if (body.paper && !(settings.customMedia || []).some(m => m.id === body.paper.id)) {
    settings.customMedia.push(body.paper);
  }
  if (at < 0) { settings.customLayouts.push(layout); return true; }

  // A pull always returns this device's own rows too. Replacing an identical
  // layout with itself is not a change, and counting it as one makes the
  // console report "2 LAYOUTS IN" every single time it syncs with nothing
  // new — which teaches an operator to stop reading the line.
  const same = JSON.stringify(settings.customLayouts[at]) === JSON.stringify(layout);
  settings.customLayouts[at] = layout;
  return !same;
}

/* One round trip: take what is there, then send what is here.
 *
 * **Pull first.** The other order looks safer and is not: a device that has
 * not yet heard about a deletion still holds the layout, and pushing first
 * writes it back over the tombstone — so deleting a layout on one device and
 * syncing on another silently resurrects it. Measured, before this was fixed:
 * the delete never travelled at all. Pulling first means this device learns
 * about the deletion, drops the layout, and then pushes a state that no
 * longer contains it.
 *
 * The cost of that order is a narrow last-write-wins window: edit a layout
 * here while another device pushes the same one, sync after, and the other
 * copy wins. For a design tool with one operator that is the right trade —
 * losing an edit is recoverable, and a layout coming back from the dead every
 * time you delete it is not.
 *
 * `quiet` is for the automatic runs, which must not put a message on a screen
 * a guest can see.
 */
async function syncNow(quiet){
  if (syncing) return false;
  const code = (settings.syncCode || '').trim();
  if (code.length < 16) {
    settings.syncLastNote = 'NO SYNC CODE SET';
    if (!quiet) renderAdmin();
    return false;
  }
  syncing = true;
  try {
    const rows = await syncCall('snapbox_pull',
      {p_code: code, p_since: settings.syncSince || '1970-01-01T00:00:00Z'});

    let changed = 0, newest = settings.syncSince || '';
    (rows || []).forEach(row => {
      if (syncAbsorb(row)) changed++;
      if (!newest || row.updated_at > newest) newest = row.updated_at;
    });

    // Built after absorbing, so anything the pull just deleted is already
    // gone from what goes up.
    const items = syncPayload();
    const sentTombstones = (settings.syncTombstones || []).slice();
    if (items.length) await syncCall('snapbox_push', {p_code: code, p_items: items});
    // The server is holding them now, so this device need not keep repeating
    // itself on every sync for the rest of its life.
    if (sentTombstones.length) {
      settings.syncTombstones = (settings.syncTombstones || [])
        .filter(id => !sentTombstones.includes(id));
    }

    settings.syncSince = newest || settings.syncSince;
    settings.syncLastAt = Date.now();
    settings.syncLastNote = changed
      ? changed + (changed === 1 ? ' LAYOUT IN' : ' LAYOUTS IN')
      : 'UP TO DATE';
    saveSettings();
    if (changed) {
      registerCustom(settings);
      buildLayoutTiles();
      updateAttractCount();
    }
    if (!quiet) renderAdmin();
    return true;
  } catch (err) {
    // A booth with no network is the normal case, not a fault.
    settings.syncLastNote = /abort/i.test(err && err.name || '')
      ? 'NO ANSWER — CHECK THE NETWORK'
      : 'COULD NOT SYNC: ' + (err && err.message ? err.message : 'unknown');
    saveSettings();
    if (!quiet) renderAdmin();
    return false;
  } finally {
    syncing = false;
  }
}

/// Called after anything that changes the layout list. Debounced, because
/// saving in the editor fires it on every keystroke that lands.
let syncSoonTimer = null;
function syncSoon(){
  if (!settings.syncAuto || !(settings.syncCode || '').trim()) return;
  clearTimeout(syncSoonTimer);
  syncSoonTimer = setTimeout(() => syncNow(true), 2500);
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
  'printer-test': testPrint,
  'cal-print': printCalibrationSheet,
  'sync-now': () => syncNow(false),
  'sync-new-code': newSyncCodeFromAdmin,
  'share-test': testShare,
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
fitMenuBar();
tickViewfinder();
setInterval(tickViewfinder, 1000);

// One sync on launch, so a booth picks up whatever was designed since it was
// last switched on. Quiet and unhurried: it must not delay the first guest.
if (settings.syncAuto && (settings.syncCode || '').trim()) {
  setTimeout(() => syncNow(true), 1500);
}
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

// The upload runs while the DONE screen is up, so the line under the code
// follows it rather than being written once and left to go stale.
if (window.Cloud) Cloud.onChange(st => {
  if (session.step === 'thankyou') paintShareNote(st);
});

// Exposed for poking at the renderer from the console during testing.
window.booth = {session, settings, LAYOUTS, MEDIA, renderSheet, compose,
                layoutToCanvas, registerCustom, registerCanvasLayout, renderCanvas,
                canvasPixels, sheetPixels, fitsPaper,
                pixelTextCanvas, setPixel, compactStage, isStandalone, fitMenuBar,
                refitType, uiScale,
                // Camera and print plumbing, exported so a test can reach it:
                // the iPad route through these cannot be exercised by hand
                // from this machine.
                IPADOS, HOLD_CAMERA, isExternalCamera, listCameras,
                feedDescription, cameraHeld, cameraHoldState, permissionNote,
                recoverCameraIfDropped,
                cameraState, prepareCamera, cameraReady, cameraLockNote,
                maximiseCapture, settleAndLock,
                printPageCSS, printFromDocument, rescanCameras,
                thermalize, thermalOptions, sheetDataURL, renderPack, contactSheet,
                printRasterImage, printBusy, invertCanvas,
                photoBoxDots, calibrationSource, calibrationVariants,
                calibrationSheet, calibrationPreview, printCalibrationSheet,
                liftShadows, localMean, smoothing,
                slotRects,
                raiseFlash, dropFlash, normaliseExposure, testPrint,
                tickViewfinder, setViewfinderRecording,
                // The subject bracket.
                trackScreen, paintTracker, coverRect,
                // The screen builders, so a test can drive a real screen
                // rather than a hand-assembled imitation of one.
                go, showReview, showCopies, showConfirm, finishPrinting,
                buildLayoutTiles, buildShotStrip, fail,
                // The camera sources, so a test can feed the tracker a still
                // through the same path a USB camera uses.
                uvc, uvcImage, attractUvc, video, attractVideo,
                syncNow, syncPayload, syncAbsorb, newSyncCode,
                // The digital copy.
                share, shareConfig, shareLink, sharePrintLink, shareUpload,
                sharePrintCanvas, showShareCode, paintShareNote,
                // The Android shell calls these two: the back key abandons a
                // session rather than leaving the app, and a Bluetooth job
                // reports its outcome when it lands.
                abandon, nativePrintResult, applyRotation,
                // The shell calls this when the operator starts or stops a
                // directly-driven USB camera.
                uvcChanged};
