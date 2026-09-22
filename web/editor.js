/* ==================================================================== *
 * The print layout editor.
 *
 * An operator tool for designing the print itself, on any paper the booth
 * can drive: SELPHY postcard, L and card; a 58 or 80 mm thermal roll; or a
 * size typed in. It edits "canvas" layouts — a list of elements placed where
 * they were put (see renderCanvas in booth.js) — and it draws the preview
 * with the very renderer the printer gets, so the page on screen is the page
 * that comes out.
 *
 * Loaded after booth.js and uses its top-level helpers directly. Nothing in
 * here runs until the operator opens it from the console.
 * ==================================================================== */

const ED = {
  tpl: null,          // the working copy, as it will be saved
  editingId: null,    // the saved custom layout being edited, or null if new
  sel: -1,            // selected element index
  tab: 'layout',
  dirty: false,
  samples: true,      // sample photographs rather than numbered wells
  boxes: [],          // where each element was drawn, in backing-canvas px
  css: {w: 0, h: 0},  // on-screen size of the page
  renderScale: 1,     // backing canvas px per paper px
  drag: null,
  guard: null,        // an action waiting on "unsaved changes — press again"
  testPrinting: false,
  notice: '',
  sampleCache: null,
  paperDraft: null,   // the NEW PAPER form's values
};

const TOKENS = ['{event}', '{word}', '{caption}', '{date}', '{longdate}', '{n}',
                '{total}', '{link}', '{para}', '{footer}', '{shots}'];
const SWATCHES = [['ink', '#111111'], ['dim', 'rgba(17,17,17,0.55)'], ['paper', '#FFFFFF'],
                  ['#A9A2CE', '#A9A2CE'], ['#C97F7F', '#C97F7F'],
                  ['#A8BEB2', '#A8BEB2'], ['#9BA3A3', '#9BA3A3']];
const TYPE_LABEL = {photo: 'PHOTO', text: 'TEXT', para: 'PARAGRAPH', line: 'LINE',
                    box: 'BOX', qr: 'QR CODE', shots: 'SHOT LIST'};

/* Paper presets, from the manufacturers' own figures where there are any.
 * Rolls are given as their *printable* width — 80 mm paper images 72 mm,
 * 58 mm paper images 48 mm — because that is what the head can reach. */
const PAPER_PRESETS = [
  {name: 'SELPHY Postcard', w: 100, h: 148, dpi: 300},
  {name: 'SELPHY L size',   w: 89,  h: 119, dpi: 300},
  {name: 'SELPHY Card',     w: 54,  h: 86,  dpi: 300},
  {name: '4 x 6 in',        w: 101.6, h: 152.4, dpi: 300},
  {name: '5 x 7 in',        w: 127, h: 177.8, dpi: 300},
  {name: '2 x 6 in strip',  w: 50.8, h: 152.4, dpi: 300},
  {name: 'A6',              w: 105, h: 148, dpi: 300},
  {name: 'A5',              w: 148, h: 210, dpi: 300},
  {name: '80 mm roll',      w: 72,  roll: true, paper: 80, dpi: 203},
  {name: '58 mm roll',      w: 48,  roll: true, paper: 58, dpi: 203},
  {name: '112 mm roll',     w: 104, roll: true, paper: 112, dpi: 203},
];

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */
const edMedia = () => MEDIA[ED.tpl.mediaID] || currentMedia();

function edPaperMM(){
  const m = edMedia();
  return {w: m.w * 25.4, h: m.flow ? (ED.tpl.length || 150) : m.h * 25.4};
}
const mm = v => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ *
 * Sample photographs: people-shaped, so a design is judged against
 * something like what will fill it rather than a grey rectangle.
 * ------------------------------------------------------------------ */
function edSamplePhotos(){
  if (ED.sampleCache) return ED.sampleCache;
  const tones = [['#6f7d8c', '#e7e2da'], ['#8a6f6a', '#efe6df'], ['#5f7a6b', '#e2e9e3'],
                 ['#7c7258', '#ece6d6'], ['#64707a', '#dde3e8'], ['#7a6680', '#e8e1ea']];
  ED.sampleCache = tones.map(([deep, light], i) => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1125;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 1125);
    gr.addColorStop(0, light); gr.addColorStop(1, deep);
    g.fillStyle = gr; g.fillRect(0, 0, 900, 1125);
    const cx = 450 + ((i % 3) - 1) * 110;
    g.fillStyle = 'rgba(34,34,42,0.82)';
    g.beginPath(); g.ellipse(cx, 1210, 390, 470, 0, Math.PI, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, 470, 150, 188, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.beginPath(); g.ellipse(cx - 50, 420, 40, 60, -0.4, 0, Math.PI * 2); g.fill();
    return c;
  });
  return ED.sampleCache;
}

/* What the tokens resolve to in the preview: the booth's real settings, and
 * plausible timings for the shot list so it reads like a print. */
function edBrand(){
  const brand = branding(ED.tpl);
  if (ED.samples) {
    brand.tracks = brand.tracks.map((t, i) => ({label: t.label, time: mmss(i * 7 + (i ? 3 : 0))}));
    brand.total = brand.tracks.length ? brand.tracks[brand.tracks.length - 1].time : '00:00';
  }
  return brand;
}

/* ------------------------------------------------------------------ *
 * Opening, loading, closing
 * ------------------------------------------------------------------ */
function openEditor(){
  const firstCustom = (settings.customLayouts || [])[0];
  if (firstCustom) edLoadCustom(firstCustom.id);
  else edLoadBuiltIn(guestLayouts()[0].id);
  ED.dirty = false; ED.guard = null; ED.notice = '';
  go('editor');
  edRender();
}

function edLoadCustom(id){
  const saved = (settings.customLayouts || []).find(l => l.id === id);
  if (!saved) return;
  ED.tpl = JSON.parse(JSON.stringify(saved));
  ED.editingId = id;
  ED.sel = -1; ED.tab = 'layout'; ED.dirty = false;
}

/* A built-in layout is never edited in place: it becomes an editable copy on
 * the paper currently loaded, or its own natural paper if it cannot go on
 * that one. */
function edLoadBuiltIn(id){
  const tpl = LAYOUTS.find(l => l.id === id);
  if (!tpl) return;
  let media = currentMedia();
  if (!fitsPaper(tpl, media)) media = tpl.receipt ? MEDIA['thermal-80'] : MEDIA['postcard-4x6'];
  const brand = branding(tpl);
  // Every block must be present to be converted, so empty copy is stood in
  // for; the elements keep their tokens either way.
  Object.assign(brand, {
    event: brand.event || 'EVENT', word: brand.word || 'word',
    para: brand.para || 'Paragraph', footer: brand.footer || 'FOOTER',
    link: brand.link || 'https://example.com'});
  ED.tpl = layoutToCanvas(tpl, media, brand);
  ED.tpl.name = tpl.name;
  ED.tpl.subtitle = (tpl.subtitle || 'CUSTOM') + ' +';
  ED.editingId = null;
  ED.sel = -1; ED.tab = 'layout'; ED.dirty = true;
}

function edLoadBlank(mediaID){
  const media = MEDIA[mediaID] || currentMedia();
  ED.tpl = {name: 'MY LAYOUT', subtitle: 'CUSTOM', accent: '#A9A2CE', mediaID: media.id,
            background: '#FFFFFF', mono: !!media.flow, elements: []};
  if (media.flow) ED.tpl.length = Math.round(media.w * 25.4 * 2);
  ED.editingId = null; ED.sel = -1; ED.tab = 'layout'; ED.dirty = true;
}

/* Unsaved work must not vanish on a stray tap: the first press warns, the
 * second goes ahead. */
function edGuarded(key, action){
  if (!ED.dirty || ED.guard === key) { ED.guard = null; action(); return; }
  ED.guard = key;
  edSay('UNSAVED CHANGES — SAVE, OR PRESS AGAIN TO DISCARD');
}

function editorBack(){
  edGuarded('close', () => {
    ED.dirty = false;
    go('admin');
    renderAdmin();
  });
}

function edSay(text){
  ED.notice = text;
  const n = el('#ed-notice');
  if (n) { n.textContent = text; n.hidden = !text; }
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */
function edRender(){
  const root = el('#editor');
  if (!root || !ED.tpl) return;
  root.innerHTML =
    '<div class="ed-bar">' +
      '<select class="afield ed-pick" id="ed-pick">' + edPickerOptions() + '</select>' +
      '<button class="btn" data-act="ed-save"><span class="px" data-cell="3">SAVE</span></button>' +
      '<button class="btn" data-act="ed-test"><span class="px" data-cell="3">TEST PRINT</span></button>' +
      '<button class="btn solid" data-act="ed-close"><span class="px" data-cell="3">CLOSE</span></button>' +
    '</div>' +
    '<div class="ed-notice" id="ed-notice"' + (ED.notice ? '' : ' hidden') + '>' +
      escapeHTML(ED.notice) + '</div>' +
    '<div class="ed-main">' +
      '<div class="ed-stagebox">' +
        '<div class="ed-stage" id="ed-stage"><div class="ed-paper" id="ed-paper"></div></div>' +
        '<div class="ed-info">' +
          '<span id="ed-size"></span><span class="grow"></span>' +
          '<button class="ed-chip' + (ED.samples ? ' on' : '') + '" data-act="ed-samples">SAMPLE PHOTOS</button>' +
          '<button class="ed-chip' + (!ED.samples ? ' on' : '') + '" data-act="ed-wells">NUMBERED</button>' +
        '</div>' +
      '</div>' +
      '<div class="ed-side">' +
        '<div class="ed-tabs">' +
          ['layout', 'element', 'paper', 'share'].map(t =>
            '<button data-act="ed-tab" data-tab="' + t + '" class="' + (ED.tab === t ? 'on' : '') + '">' +
            t.toUpperCase() + '</button>').join('') +
        '</div>' +
        '<div class="ed-add">' +
          Object.keys(TYPE_LABEL).map(t =>
            '<button data-act="ed-add" data-type="' + t + '">+ ' + TYPE_LABEL[t] + '</button>').join('') +
        '</div>' +
        '<div class="ed-panel" id="ed-panel"></div>' +
      '</div>' +
    '</div>';
  paintPixelText(root);

  el('#ed-pick').addEventListener('change', e => {
    const value = e.target.value;
    e.target.value = edPickValue();
    edGuarded('pick:' + value, () => {
      if (value.startsWith('c:')) edLoadCustom(value.slice(2));
      else if (value.startsWith('b:')) edLoadBuiltIn(value.slice(2));
      else if (value.startsWith('n:')) edLoadBlank(value.slice(2));
      edSay(value.startsWith('b:')
        ? 'AN EDITABLE COPY OF A BUILT-IN LAYOUT. THE ORIGINAL IS UNCHANGED. SAVE TO KEEP IT.'
        : '');
      edRender();
    });
  });

  edWireStage();
  edPanel();
  // Layout has to settle before the page can be measured.
  requestAnimationFrame(() => { edFit(); edDraw(); });
}

function edPickValue(){
  return ED.editingId ? 'c:' + ED.editingId : '';
}

function edPickerOptions(){
  const current = edPickValue();
  const opt = (value, label) =>
    '<option value="' + escapeHTML(value) + '"' + (value === current ? ' selected' : '') + '>' +
    escapeHTML(label) + '</option>';
  let html = '';
  if (!ED.editingId) html += opt('', '* UNSAVED: ' + (ED.tpl.name || 'LAYOUT'));
  const customs = settings.customLayouts || [];
  if (customs.length) {
    html += '<optgroup label="YOUR LAYOUTS">' + customs.map(l => {
      const m = MEDIA[l.mediaID];
      return opt('c:' + l.id, l.name + ' · ' + (l.subtitle || '') + ' · ' + (m ? m.shortName : 'NO PAPER'));
    }).join('') + '</optgroup>';
  }
  html += '<optgroup label="START FROM A BUILT-IN">' +
    LAYOUTS.filter(l => !l.custom).map(l => opt('b:' + l.id, l.name + ' · ' + l.subtitle)).join('') +
    '</optgroup>';
  html += '<optgroup label="START FROM A BLANK PAGE">' +
    Object.values(MEDIA).map(m => opt('n:' + m.id, 'BLANK · ' + m.name)).join('') +
    '</optgroup>';
  return html;
}

/* Sizes the page to the stage, keeping its true proportions. */
function edFit(){
  const stage = el('#ed-stage'), paper = el('#ed-paper');
  if (!stage || !paper) return;
  const box = stage.getBoundingClientRect();
  const px = canvasPixels(ED.tpl, edMedia());
  const room = 28;
  const s = Math.max(0.01, Math.min((box.width - room * 2) / px.w, (box.height - room * 2) / px.h));
  ED.css = {w: Math.round(px.w * s), h: Math.round(px.h * s)};
  paper.style.width = ED.css.w + 'px';
  paper.style.height = ED.css.h + 'px';
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ED.renderScale = Math.min(1, (ED.css.w * dpr) / px.w);
  const size = edPaperMM();
  const sizeLabel = el('#ed-size');
  if (sizeLabel) {
    sizeLabel.textContent = edMedia().name + ' · ' + mm(size.w) + ' × ' + mm(size.h) + ' mm · ' +
      px.w + ' × ' + px.h + ' px';
  }
}

function edDraw(){
  const paper = el('#ed-paper');
  if (!paper || !ED.tpl) return;
  registerCanvasLayout(ED.tpl);
  ED.boxes = [];
  const canvas = renderCanvas(ED.samples ? edSamplePhotos() : [], ED.tpl, edMedia(), edBrand(),
    ED.renderScale, {editing: true, boxes: ED.boxes, numberEmptySlots: !ED.samples});
  canvas.className = 'ed-canvas';
  const old = paper.querySelector('canvas');
  if (old) old.replaceWith(canvas); else paper.prepend(canvas);
  ED.canvasSize = {w: canvas.width, h: canvas.height};
  edDrawSelection();
}

/* Handles each element type offers. Text scales by its corner; lines, the
 * paragraph and the shot list only have a width; a QR code stays square. */
const HANDLES = {photo: ['nw', 'ne', 'sw', 'se'], box: ['nw', 'ne', 'sw', 'se'],
                 para: ['w', 'e'], shots: ['w', 'e'], line: ['w', 'e'],
                 qr: ['se'], text: ['se']};

function edDrawSelection(){
  const paper = el('#ed-paper');
  if (!paper) return;
  paper.querySelectorAll('.ed-sel,.ed-guide').forEach(n => n.remove());
  const box = ED.boxes[ED.sel];
  const element = ED.tpl.elements[ED.sel];
  if (!box || !element || !ED.canvasSize) return;
  const k = ED.css.w / ED.canvasSize.w;
  const sel = document.createElement('div');
  sel.className = 'ed-sel';
  // A 1px line would be an unfindable selection, so it gets some height.
  const h = Math.max(box.h * k, 10);
  sel.style.left = (box.x * k) + 'px';
  sel.style.top = (box.y * k - (h - box.h * k) / 2) + 'px';
  sel.style.width = Math.max(box.w * k, 10) + 'px';
  sel.style.height = h + 'px';
  for (const handle of HANDLES[element.t] || []) {
    const i = document.createElement('i');
    i.className = 'h-' + handle;
    i.dataset.h = handle;
    sel.appendChild(i);
  }
  paper.appendChild(sel);
  if (ED.drag && ED.drag.centred) {
    const guide = document.createElement('div');
    guide.className = 'ed-guide';
    guide.style.left = (ED.css.w / 2) + 'px';
    paper.appendChild(guide);
  }
}

/* ------------------------------------------------------------------ *
 * Direct manipulation: select, move, resize — mouse, pen or finger.
 * ------------------------------------------------------------------ */
function edWireStage(){
  const paper = el('#ed-paper');
  if (!paper) return;

  paper.addEventListener('pointerdown', e => {
    const r = paper.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const handle = e.target.dataset && e.target.dataset.h;

    if (!handle) {
      const hit = edHit(fx * ED.canvasSize.w, fy * ED.canvasSize.h);
      if (hit !== ED.sel) {
        ED.sel = hit;
        if (hit >= 0) ED.tab = 'element';
        edPanel(); edTabsState();
      }
      if (hit < 0) { edDrawSelection(); return; }
    }
    const element = ED.tpl.elements[ED.sel];
    if (!element) return;
    e.preventDefault();
    paper.setPointerCapture(e.pointerId);
    ED.drag = {mode: handle ? 'resize' : 'move', handle, fx, fy,
               orig: JSON.parse(JSON.stringify(element)),
               box: Object.assign({}, ED.boxes[ED.sel]), moved: false};
    edDrawSelection();
  });

  paper.addEventListener('pointermove', e => {
    if (!ED.drag) return;
    const r = paper.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const dx = fx - ED.drag.fx, dy = fy - ED.drag.fy;
    if (!ED.drag.moved && Math.abs(dx * r.width) < 2 && Math.abs(dy * r.height) < 2) return;
    ED.drag.moved = true;
    const element = ED.tpl.elements[ED.sel];
    if (ED.drag.mode === 'move') edMove(element, ED.drag.orig, dx, dy);
    else edResize(element, ED.drag.orig, ED.drag.handle, dx, dy);
    ED.dirty = true;
    if (!ED.pending) {
      ED.pending = true;
      requestAnimationFrame(() => { ED.pending = false; edDraw(); });
    }
  });

  const end = () => {
    if (!ED.drag) return;
    const moved = ED.drag.moved;
    ED.drag = null;
    edDraw();
    if (moved) edPanel();       // positions changed; nobody is typing now
  };
  paper.addEventListener('pointerup', end);
  paper.addEventListener('pointercancel', end);
}

/* Topmost element under a point, with some slop so thin rules and small type
 * can be picked up with a finger. */
function edHit(cx, cy){
  const slop = 12 * (ED.canvasSize.w / Math.max(1, ED.css.w));
  for (let i = ED.tpl.elements.length - 1; i >= 0; i--) {
    const b = ED.boxes[i];
    if (!b) continue;
    if (cx >= b.x - slop && cx <= b.x + b.w + slop &&
        cy >= b.y - slop && cy <= b.y + b.h + slop) return i;
  }
  return -1;
}

/* Snapping: to half-millimetres, and to the page's centre line when an
 * element comes within a millimetre and a half of it. */
function edSnapX(v){ const w = edPaperMM().w; return Math.round(v * w * 2) / 2 / w; }
function edSnapY(v){ const h = edPaperMM().h; return Math.round(v * h * 2) / 2 / h; }

function edWidthFraction(element, box){
  // How wide the element is, as a fraction of the page, for centring.
  if (element.t === 'qr') return element.size;
  if (element.w !== undefined) return element.w;
  return box ? box.w / ED.canvasSize.w : 0;
}

function edMove(element, orig, dx, dy){
  let x = edSnapX(orig.x + dx), y = edSnapY(orig.y + dy);
  const box = ED.drag.box;
  const width = edWidthFraction(element, box);
  let left = x;
  if (element.t === 'text') {
    left = element.align === 'centre' ? x - width / 2
         : element.align === 'right'  ? x - width : x;
  }
  const centre = left + width / 2;
  ED.drag.centred = false;
  if (Math.abs(centre - 0.5) * edPaperMM().w < 1.5) {
    x += 0.5 - centre;
    ED.drag.centred = true;
  }
  element.x = x; element.y = y;
}

function edResize(element, orig, handle, dx, dy){
  const minW = 2 / edPaperMM().w, minH = 2 / edPaperMM().h;
  if (element.t === 'text') {
    const px = ED.drag.box.w || 1;
    const factor = Math.max(0.15, (px + dx * ED.canvasSize.w) / px);
    element.size = Math.max(0.005, orig.size * factor);
    return;
  }
  if (element.t === 'qr') {
    element.size = Math.max(0.05, orig.size + Math.max(dx, dy * ED.canvasSize.h / ED.canvasSize.w));
    return;
  }
  if (handle.includes('w')) {
    const right = orig.x + orig.w;
    element.x = Math.min(edSnapX(orig.x + dx), right - minW);
    element.w = right - element.x;
  }
  if (handle.includes('e')) element.w = Math.max(minW, edSnapX(orig.x + orig.w + dx) - orig.x);
  if (element.h === undefined) return;
  if (handle.includes('n')) {
    const bottom = orig.y + orig.h;
    element.y = Math.min(edSnapY(orig.y + dy), bottom - minH);
    element.h = bottom - element.y;
  }
  if (handle.includes('s')) element.h = Math.max(minH, edSnapY(orig.y + orig.h + dy) - orig.y);
}

/* ------------------------------------------------------------------ *
 * The side panel
 * ------------------------------------------------------------------ */
function edTabsState(){
  document.querySelectorAll('.ed-tabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === ED.tab));
}

function edPanel(){
  const host = el('#ed-panel');
  if (!host) return;
  const build = {layout: edLayoutPanel, element: edElementPanel,
                 paper: edPaperPanel, share: edSharePanel}[ED.tab] || edLayoutPanel;
  host.innerHTML = build();
  paintPixelText(host);
  edWirePanel(host);
}

/* Field builders. Every input carries data-k (what it edits) and data-u
 * (the unit it is shown in), so one listener handles all of them. */
const F = {
  field: (label, control) =>
    '<div class="ed-field"><label>' + escapeHTML(label) + '</label><div class="ed-ctl">' + control + '</div></div>',
  text: (k, value, placeholder) =>
    '<input class="afield ed-input" data-k="' + k + '" value="' + escapeHTML(value == null ? '' : value) +
    '" placeholder="' + escapeHTML(placeholder || '') + '">',
  area: (k, value) =>
    '<textarea class="afield ed-area" data-k="' + k + '">' + escapeHTML(value || '') + '</textarea>',
  num: (k, value, unit, step, min) =>
    '<span class="ed-numwrap"><input class="afield ed-input ed-num" type="number" inputmode="decimal" data-k="' + k +
    '" data-u="' + unit + '" step="' + (step || 0.5) + '" min="' + (min === undefined ? '' : min) +
    '" value="' + value + '"><span class="ed-unit">' + unit + '</span></span>',
  seg: (k, options, current) =>
    '<div class="seg ed-seg">' + options.map(([value, label]) =>
      '<button data-seg="' + k + '" data-v="' + escapeHTML(String(value)) + '"' +
      (String(value) === String(current) ? ' class="on"' : '') + '>' + escapeHTML(label) + '</button>').join('') +
    '</div>',
  colour: (k, value) =>
    '<div class="ed-swatches">' + SWATCHES.map(([v, paint]) =>
      '<button class="ed-sw' + (String(value || 'ink') === v ? ' on' : '') + '" data-seg="' + k +
      '" data-v="' + escapeHTML(v) + '" style="background:' + paint + '" title="' + escapeHTML(v) + '"></button>').join('') +
    '<input type="color" class="ed-pickcol" data-k="' + k + '" data-u="hex" value="' +
      (/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#111111') + '"></div>',
  btn: (act, label, extra) =>
    '<button class="btn ed-btn" data-act="' + act + '"' + (extra || '') + '>' + escapeHTML(label) + '</button>',
  head: title => '<div class="ed-head"><span class="px" data-cell="3">' + escapeHTML(title) + '</span></div>',
};

function edLayoutPanel(){
  const t = ED.tpl, m = edMedia(), size = edPaperMM();
  const papers = Object.values(MEDIA).map(p => [p.id, p.shortName]);
  let html = F.head('LAYOUT');
  html += F.field('NAME', F.text('L.name', t.name));
  html += F.field('TILE CAPTION', F.text('L.subtitle', t.subtitle));
  html += F.field('PAPER', '<select class="afield ed-input" data-k="L.mediaID">' +
    papers.map(([id, label]) => '<option value="' + id + '"' + (id === t.mediaID ? ' selected' : '') +
    '>' + escapeHTML(label) + '</option>').join('') + '</select>');
  if (m.flow) html += F.field('ROLL LENGTH', F.num('L.length', mm(t.length || 150), 'mm', 1, 20));
  html += F.field('BACKGROUND', F.colour('L.background', t.background));
  html += F.field('PHOTOS', F.seg('L.mono', [['true', 'MONO'], ['false', 'COLOUR']], String(!!t.mono)));
  html += F.field('ACCENT', F.colour('L.accent', t.accent));
  html += note('info', m.name + ': ' + mm(size.w) + ' × ' + mm(size.h) + ' mm at ' + m.dpi +
    ' dpi. Everything is placed as a fraction of the page, so switching to a paper of a ' +
    'different shape stretches the design with it — check it after you switch.');

  html += F.head('ON THE PAGE');
  if (!t.elements.length) {
    html += note('warn', 'Nothing here yet. Use the + buttons above to add a photo, text, a line, a box, a QR code or the shot list.');
  } else {
    html += '<div class="ed-layers">' + t.elements.map((e, i) =>
      '<button class="ed-layer' + (i === ED.sel ? ' on' : '') + '" data-act="ed-select" data-i="' + i + '">' +
      '<b>' + TYPE_LABEL[e.t] + '</b><span>' + escapeHTML(edSummary(e)) + '</span></button>'
    ).reverse().join('') + '</div>';
    html += note('info', 'Top of the list is on top of the page. Tap one to select it — the easy way to reach something small or hidden behind a photo.');
  }

  html += F.head('GUESTS SEE ON ' + m.shortName);
  const offered = new Set(settings.guestLayoutIDs);
  const here = LAYOUTS.filter(l => fitsPaper(l, m));
  html += '<div class="ed-layers">' + here.map(l =>
    '<button class="ed-layer' + (offered.has(l.id) ? ' on' : '') + '" data-act="ed-offer" data-id="' + l.id + '">' +
    '<b>' + (offered.has(l.id) ? 'SHOWN' : 'HIDDEN') + '</b><span>' + escapeHTML(l.name + ' · ' + l.subtitle) +
    (l.custom ? ' · YOURS' : '') + '</span></button>').join('') + '</div>';
  html += note('info', 'What a guest can pick when this paper is loaded. If you hide every one of them, the booth shows them all rather than none.');
  return html;
}

function edSummary(e){
  if (e.t === 'photo') return 'SHOT ' + ((e.src | 0) + 1) + ' · ' + mm(e.w * edPaperMM().w) + ' × ' + mm(e.h * edPaperMM().h) + ' mm';
  if (e.t === 'text' || e.t === 'para') return (e.text || '').slice(0, 28);
  if (e.t === 'qr') return e.text || '{link}';
  if (e.t === 'line') return mm(e.w * edPaperMM().w) + ' mm' + (e.dash ? ' dashed' : '');
  if (e.t === 'box') return mm(e.w * edPaperMM().w) + ' × ' + mm(e.h * edPaperMM().h) + ' mm';
  return '';
}

function edElementPanel(){
  const e = ED.tpl.elements[ED.sel];
  if (!e) {
    return F.head('ELEMENT') + note('info', 'Nothing selected. Tap something on the page, or add one with the + buttons above.');
  }
  const P = edPaperMM();
  let html = F.head(TYPE_LABEL[e.t]);

  if (e.t === 'photo') {
    const shots = [0, 1, 2, 3, 4, 5].map(i => [i, String(i + 1)]);
    html += F.field('SHOT', F.seg('E.src', shots, e.src | 0));
    html += note('info', 'Two boxes with the same shot number show the same photo — that is how a double strip is made.');
    html += F.field('FIT', F.seg('E.fit', [['fill', 'FILL · CROP'], ['fit', 'FIT · WHOLE']], e.fit || 'fill'));
    html += F.field('SHAPE', F.seg('E.shape', [['2:3', '2:3'], ['3:4', '3:4'], ['4:5', '4:5'],
      ['1:1', '1:1'], ['3:2', '3:2'], ['4:3', '4:3']], ''));
  }
  if (e.t === 'text') {
    html += F.field('TEXT', F.text('E.text', e.text));
  }
  if (e.t === 'para') {
    html += F.field('TEXT', F.area('E.text', e.text));
  }
  if (e.t === 'text' || e.t === 'para') {
    html += '<div class="ed-tokens">' + TOKENS.map(t =>
      '<button data-act="ed-token" data-token="' + t + '">' + t + '</button>').join('') + '</div>';
    html += note('info', 'Tokens are filled in when it prints: {event} and {word} from the console, {date} today, {n} the sheet number, {total} the session time, {link} the QR link.');
  }
  if (e.t === 'qr') {
    html += F.field('LINK', F.text('E.text', e.text || '{link}', '{link} or https://…'));
    html += note('info', '{link} uses QR LINK from the console. An empty link prints no code at all — a code that goes nowhere is worse than none.');
  }

  // Position and size, in millimetres.
  html += F.head('POSITION');
  html += '<div class="ed-row2">' +
    F.field('X', F.num('E.x', mm(e.x * P.w), 'mm')) +
    F.field('Y', F.num('E.y', mm(e.y * P.h), 'mm')) + '</div>';
  if (e.w !== undefined) {
    html += '<div class="ed-row2">' + F.field('WIDTH', F.num('E.w', mm(e.w * P.w), 'mm', 0.5, 1)) +
      (e.h !== undefined ? F.field('HEIGHT', F.num('E.h', mm(e.h * P.h), 'mm', 0.5, 1)) : '<span></span>') + '</div>';
  }
  if (e.t === 'qr') html += F.field('SIZE', F.num('E.size', mm(e.size * P.w), 'mm', 0.5, 5));
  html += F.btn('ed-centre', 'CENTRE ACROSS THE PAGE');

  if (e.t === 'text' || e.t === 'para' || e.t === 'shots') {
    html += F.head('TYPE');
    html += F.field('FONT', F.seg('E.face', [['sans', 'GROTESK'], ['mono', 'TYPEWRITER'],
      ['script', 'SCRIPT'], ['serif', 'SERIF']], e.face || (e.t === 'text' ? 'sans' : 'mono')));
    html += F.field('SIZE', F.num('E.size', mm(e.size * P.w), 'mm', 0.1, 0.5));
    html += F.field('WEIGHT', F.seg('E.weight', [[400, 'REGULAR'], [700, 'BOLD'], [800, 'HEAVY']], e.weight || 400));
    if (e.t === 'text') {
      html += F.field('ALIGN', F.seg('E.align', [['left', 'LEFT'], ['centre', 'CENTRE'], ['right', 'RIGHT']], e.align || 'left'));
      html += F.field('STYLE', F.seg('E.case', [['', 'AS TYPED'], ['upper', 'UPPERCASE']], e.case || ''));
      html += F.field('ITALIC', F.seg('E.italic', [['false', 'OFF'], ['true', 'ON']], String(!!e.italic)));
      html += F.field('SPACING', F.num('E.tracking', Math.round((e.tracking || 0) * 100), '%', 1));
      html += F.field('SHRINK TO', F.num('E.fit', e.fit ? mm(e.fit * P.w) : 0, 'mm', 1, 0));
      html += note('info', 'SHRINK TO makes long text smaller rather than running off the page. 0 lets it run — deliberate on the big display word.');
    }
    if (e.t === 'para') {
      html += F.field('LINE SPACING', F.num('E.leading', e.leading || 1.7, '×', 0.05, 1));
      html += F.field('INDENT', F.num('E.indent', mm((e.indent || 0) * P.w), 'mm', 0.5, 0));
      html += F.field('JUSTIFY', F.seg('E.justify', [['true', 'ON'], ['false', 'OFF']], String(e.justify !== false)));
    }
    if (e.t === 'shots') {
      html += F.field('LINE SPACING', F.num('E.leading', e.leading || 1.9, '×', 0.05, 1));
    }
    html += F.field('COLOUR', F.colour('E.colour', e.colour));
  }
  if (e.t === 'line') {
    html += F.head('LINE');
    html += F.field('THICKNESS', F.num('E.weight', mm((e.weight || 0.003) * P.w), 'mm', 0.1, 0.1));
    html += F.field('DASHED', F.seg('E.dashed', [['false', 'SOLID'], ['true', 'DASHED']], String(e.dash > 0)));
    if (e.dash > 0) html += F.field('DASH', F.num('E.dash', mm(e.dash * P.w), 'mm', 0.1, 0.2));
    html += F.field('COLOUR', F.colour('E.colour', e.colour));
  }
  if (e.t === 'box') {
    html += F.head('BOX');
    html += F.field('COLOUR', F.colour('E.colour', e.colour));
    html += F.field('CORNERS', F.num('E.radius', mm((e.radius || 0) * P.w), 'mm', 0.5, 0));
  }
  if (e.t === 'photo') {
    html += F.head('FRAME');
    html += F.field('CORNERS', F.num('E.radius', mm((e.radius || 0) * P.w), 'mm', 0.5, 0));
    html += F.field('KEYLINE', F.num('E.keyline', mm((e.keyline || 0) * P.w), 'mm', 0.1, 0));
    if (e.keyline > 0) html += F.field('KEYLINE COLOUR', F.colour('E.keylineColour', e.keylineColour));
  }
  if (e.t === 'qr') html += F.field('COLOUR', F.colour('E.colour', e.colour));

  html += F.head('ARRANGE');
  html += '<div class="ed-row2">' + F.btn('ed-forward', 'BRING FORWARD') + F.btn('ed-back', 'SEND BACK') + '</div>';
  html += '<div class="ed-row2">' + F.btn('ed-dup', 'DUPLICATE') + F.btn('ed-del', 'DELETE', ' style="background:var(--salmon)"') + '</div>';
  return html;
}

function edPaperPanel(){
  const d = ED.paperDraft || (ED.paperDraft = {name: '', roll: false, w: 100, h: 148, paper: 80, dpi: 300});
  let html = F.head('PAPER SIZES');
  html += '<div class="ed-layers">' + Object.values(MEDIA).map(m => {
    const w = mm(m.w * 25.4), h = m.flow ? 'ROLL' : mm(m.h * 25.4) + ' mm';
    return '<div class="ed-layer ed-static"><b>' + (m.custom ? 'YOURS' : 'BUILT-IN') + '</b><span>' +
      escapeHTML(m.name) + ' · ' + w + (m.flow ? ' mm wide' : ' × ' + h) + ' · ' + m.dpi + ' dpi</span>' +
      (m.custom ? '<button class="ed-x" data-act="ed-paper-del" data-id="' + m.id + '">DELETE</button>' : '') +
      '</div>';
  }).join('') + '</div>';

  html += F.head('ADD A PAPER SIZE');
  html += '<div class="ed-tokens">' + PAPER_PRESETS.map((p, i) =>
    '<button data-act="ed-preset" data-i="' + i + '">' + escapeHTML(p.name) + '</button>').join('') + '</div>';
  html += F.field('NAME', F.text('P.name', d.name, 'e.g. Wedding strip'));
  html += F.field('TYPE', F.seg('P.roll', [['false', 'SHEET'], ['true', 'ROLL']], String(d.roll)));
  html += '<div class="ed-row2">' +
    F.field(d.roll ? 'PRINT WIDTH' : 'WIDTH', F.num('P.w', d.w, 'mm', 0.1, 10)) +
    (d.roll ? F.field('PAPER WIDTH', F.num('P.paper', d.paper, 'mm', 1, 10))
            : F.field('HEIGHT', F.num('P.h', d.h, 'mm', 0.1, 10))) + '</div>';
  html += F.field('RESOLUTION', F.seg('P.dpi', [[300, '300 DPI'], [203, '203 DPI'], [600, '600 DPI']], d.dpi));
  html += note('info', d.roll
    ? 'A roll is as long as each layout makes it. PRINT WIDTH is what the head reaches — 72 mm on 80 mm paper, 48 mm on 58 mm — and at 203 dpi that is ' +
      Math.round(d.w / 25.4 * 203) + ' dots.'
    : 'SELPHY paper is 300 dpi. Any size works: the booth sends the page at exactly this size and the printer driver does the rest.');
  html += F.btn('ed-paper-add', 'ADD THIS PAPER', ' style="background:var(--ink);color:var(--paper)"');
  return html;
}

function edSharePanel(){
  let html = F.head('SAVE AS A COPY');
  html += F.btn('ed-saveas', 'SAVE AS NEW LAYOUT');
  html += F.head('MOVE TO ANOTHER DEVICE');
  html += note('info', 'The tablet app and a browser keep their layouts separately. Copy this text, paste it into IMPORT on the other one, and the layout — with its paper size — arrives intact.');
  html += '<textarea class="afield ed-area ed-code" id="ed-export" readonly>' +
    escapeHTML(JSON.stringify(edExportData())) + '</textarea>';
  html += F.btn('ed-copy', 'COPY');
  html += F.head('IMPORT');
  html += '<textarea class="afield ed-area ed-code" id="ed-import" placeholder="Paste a layout here"></textarea>';
  html += F.btn('ed-import', 'IMPORT LAYOUT');
  if (ED.editingId) {
    html += F.head('DELETE');
    html += F.btn('ed-delete', 'DELETE THIS LAYOUT', ' style="background:var(--salmon)"');
  }
  return html;
}

/* ------------------------------------------------------------------ *
 * Panel input
 * ------------------------------------------------------------------ */
/* Every field is bound to the element — and the layout — it was built for,
 * not to whatever happens to be selected when it fires.
 *
 * That matters because rebuilding the panel blurs the field being typed in,
 * and a blur fires `change`. Bound to "the current selection", that late
 * change wrote the old field's value into the newly selected element: text
 * typed into a title ended up as the contents of the next QR code added. */
function edWirePanel(host){
  const index = ED.sel, owner = ED.tpl;
  host.querySelectorAll('[data-k]').forEach(input => {
    const commit = () => edInput(input.dataset.k, input.value, input.dataset.u, index, owner);
    input.addEventListener('input', commit);
    input.addEventListener('change', () => { commit(); if (input.dataset.k === 'L.mediaID') edRender(); });
  });
  host.querySelectorAll('[data-seg]').forEach(button => {
    button.addEventListener('click', () => {
      edInput(button.dataset.seg, button.dataset.v, 'seg', index, owner);
      edPanel();
    });
  });
}

/* One place turns a field's shown value (millimetres, percent, a choice)
 * back into what the layout stores (fractions of the page). */
function edInput(key, raw, unit, index, owner){
  // A field left over from a layout that is no longer open edits nothing.
  if (owner && owner !== ED.tpl) return;
  const [scope, field] = key.split('.');
  const P = edPaperMM();
  const num = parseFloat(raw);
  ED.dirty = true;
  ED.guard = null;

  if (scope === 'L') {
    const t = ED.tpl;
    if (field === 'mono') t.mono = raw === 'true';
    else if (field === 'length') { if (num > 0) t.length = num; }
    else if (field === 'mediaID') edSwitchPaper(raw);
    else t[field] = raw;
    edFitDraw();
    return;
  }

  if (scope === 'P') {
    const d = ED.paperDraft;
    if (field === 'roll') { d.roll = raw === 'true'; if (d.roll) { d.w = 72; d.paper = 80; d.dpi = 203; } else { d.w = 100; d.h = 148; d.dpi = 300; } }
    else if (field === 'dpi') d.dpi = +raw;
    else if (field === 'name') d.name = raw;
    else if (num > 0) d[field] = num;
    return;
  }

  const e = ED.tpl.elements[index === undefined ? ED.sel : index];
  if (!e) return;
  switch (field) {
    case 'x': if (!isNaN(num)) e.x = num / P.w; break;
    case 'y': if (!isNaN(num)) e.y = num / P.h; break;
    case 'w': if (num > 0) e.w = num / P.w; break;
    case 'h': if (num > 0) e.h = num / P.h; break;
    case 'size': if (num > 0) e.size = num / P.w; break;
    case 'radius': case 'keyline': case 'indent': case 'weight':
      if (field === 'weight' && e.t !== 'line') { e.weight = +raw; break; }
      if (!isNaN(num)) e[field] = Math.max(0, num) / P.w;
      break;
    case 'dash': if (num > 0) e.dash = num / P.w; break;
    case 'dashed': e.dash = raw === 'true' ? (e.dash > 0 ? e.dash : 0.014) : 0; break;
    case 'fit': e.fit = num > 0 ? num / P.w : null; break;
    case 'tracking': if (!isNaN(num)) e.tracking = num / 100; break;
    case 'leading': if (num > 0) e.leading = num; break;
    case 'src': e.src = +raw; break;
    case 'italic': case 'justify': e[field] = raw === 'true'; break;
    case 'shape': edApplyShape(e, raw); break;
    default: e[field] = raw;
  }
  edDraw();
}

function edFitDraw(){ edFit(); edDraw(); }

/* A new paper keeps the design's proportions where it can. Going onto a
 * roll, the length is set so the page keeps the shape it had. */
function edSwitchPaper(id){
  const next = MEDIA[id];
  if (!next) return;
  const before = edPaperMM();
  ED.tpl.mediaID = id;
  if (next.flow) ED.tpl.length = Math.round(next.w * 25.4 * (before.h / before.w));
  else delete ED.tpl.length;
}

/* Sets a photo box to a true print shape, keeping its width and centre. */
function edApplyShape(e, ratio){
  const [a, b] = ratio.split(':').map(Number);
  const P = edPaperMM();
  const wmm = e.w * P.w;
  const hmm = wmm * b / a;
  const cy = e.y + e.h / 2;
  e.h = hmm / P.h;
  e.y = cy - e.h / 2;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */
function edAdd(type){
  const P = edPaperMM();
  const photos = ED.tpl.elements.filter(e => e.t === 'photo');
  const nextShot = Math.min(5, photos.length ? Math.max(...photos.map(e => e.src | 0)) + 1 : 0);
  const base = {
    photo: () => { const w = 0.6, hmm = w * P.w * 4 / 3; return {t: 'photo', x: 0.2, y: Math.max(0.02, 0.5 - hmm / P.h / 2), w, h: hmm / P.h, src: nextShot, fit: 'fill'}; },
    text:  () => ({t: 'text', text: 'TEXT', x: 0.5, y: 0.5, size: 0.08, align: 'centre', face: 'sans', weight: 800}),
    para:  () => ({t: 'para', text: '{para}', x: 0.1, y: 0.5, w: 0.8, size: 0.03, leading: 1.7, face: 'mono'}),
    line:  () => ({t: 'line', x: 0.1, y: 0.5, w: 0.8, weight: 0.004}),
    box:   () => { const w = 0.6, hmm = w * P.w * 0.5; return {t: 'box', x: 0.2, y: 0.5 - hmm / P.h / 2, w, h: hmm / P.h, colour: '#A9A2CE'}; },
    qr:    () => ({t: 'qr', text: '{link}', x: 0.35, y: 0.5, size: 0.3}),
    shots: () => ({t: 'shots', x: 0.1, y: 0.35, w: 0.8, size: 0.033, leading: 1.9, face: 'mono'}),
  }[type];
  if (!base) return;
  ED.tpl.elements.push(base());
  ED.sel = ED.tpl.elements.length - 1;
  ED.tab = 'element';
  ED.dirty = true;
  edTabsState(); edPanel(); edDraw();
}

function edSave(asNew){
  const t = ED.tpl;
  if (!t.elements.some(e => e.t === 'photo')) {
    edSay('ADD AT LEAST ONE PHOTO BOX BEFORE SAVING — A PRINT WITH NO PHOTO HAS NOTHING TO SHOOT.');
    return;
  }
  if (!MEDIA[t.mediaID]) { edSay('THIS LAYOUT\'S PAPER NO LONGER EXISTS. PICK ONE IN LAYOUT › PAPER.'); return; }
  const clean = {
    id: (!asNew && ED.editingId) || ('custom-' + Date.now().toString(36)),
    name: (t.name || 'MY LAYOUT').toUpperCase().slice(0, 24),
    subtitle: (t.subtitle || 'CUSTOM').toUpperCase().slice(0, 24),
    accent: t.accent || '#A9A2CE', mediaID: t.mediaID,
    background: t.background || '#FFFFFF', mono: !!t.mono,
    elements: JSON.parse(JSON.stringify(t.elements)),
  };
  if (MEDIA[t.mediaID].flow) clean.length = t.length || 150;

  const list = settings.customLayouts = (settings.customLayouts || []).slice();
  const at = list.findIndex(l => l.id === clean.id);
  if (at >= 0) list[at] = clean;
  else {
    list.push(clean);
    // A new layout is offered to guests straight away; hide it in LAYOUT.
    if (!settings.guestLayoutIDs.includes(clean.id)) settings.guestLayoutIDs.push(clean.id);
  }
  saveSettings();
  registerCustom(settings);
  ED.editingId = clean.id;
  ED.tpl = JSON.parse(JSON.stringify(clean));
  ED.dirty = false; ED.guard = null;
  edBoothRefresh();
  ED.notice = 'SAVED. ' + (MEDIA[clean.mediaID].id === settings.mediaID
    ? 'GUESTS CAN PICK IT NOW.'
    : 'GUESTS SEE IT WHEN THE CONSOLE\'S PAPER IS ' + MEDIA[clean.mediaID].shortName + '.');
  edRender();
}

function edDelete(){
  if (!ED.editingId) return;
  if (ED.guard !== 'delete') { ED.guard = 'delete'; edSay('PRESS DELETE AGAIN TO REMOVE THIS LAYOUT FOR GOOD.'); return; }
  ED.guard = null;
  settings.customLayouts = (settings.customLayouts || []).filter(l => l.id !== ED.editingId);
  settings.guestLayoutIDs = settings.guestLayoutIDs.filter(id => id !== ED.editingId);
  saveSettings(); registerCustom(settings); edBoothRefresh();
  const next = settings.customLayouts[0];
  if (next) edLoadCustom(next.id); else edLoadBuiltIn(guestLayouts()[0].id);
  ED.dirty = false;
  ED.notice = 'DELETED.';
  edRender();
}

/* The rest of the booth caches layouts in the tiles and the shape of the
 * sheet wells; after a save or a delete they have to hear about it. */
function edBoothRefresh(){
  buildLayoutTiles();
  applySheetAspect();
  updateAttractCount();
}

function edToggleOffer(id){
  const list = settings.guestLayoutIDs;
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  saveSettings(); edBoothRefresh(); edPanel();
}

function edAddPaper(){
  const d = ED.paperDraft;
  if (!(d.w > 0) || (!d.roll && !(d.h > 0))) { edSay('ENTER A WIDTH' + (d.roll ? '' : ' AND A HEIGHT') + ' IN MILLIMETRES.'); return; }
  const id = 'paper-' + Date.now().toString(36);
  const name = (d.name || (d.roll ? mm(d.paper) + 'mm roll' : mm(d.w) + ' x ' + mm(d.h) + ' mm')).slice(0, 40);
  const media = {id, name: name + (d.roll ? ' (roll)' : ''),
    shortName: name.toUpperCase().slice(0, 16),
    w: d.w / 25.4, h: d.roll ? 0 : d.h / 25.4, dpi: d.dpi, flow: !!d.roll};
  if (d.roll) media.paperW = d.paper;
  settings.customMedia = (settings.customMedia || []).concat([media]);
  saveSettings(); registerCustom(settings);
  ED.paperDraft = null;
  ED.notice = 'PAPER ADDED: ' + media.name.toUpperCase() + '. PICK IT IN LAYOUT › PAPER, AND IN THE CONSOLE WHEN IT IS LOADED.';
  edRender();
}

function edDeletePaper(id){
  const users = (settings.customLayouts || []).filter(l => l.mediaID === id);
  if (users.length) {
    edSay('IN USE BY ' + users.map(l => l.name).join(', ') + '. MOVE THOSE TO ANOTHER PAPER FIRST.');
    return;
  }
  if (settings.mediaID === id) { edSay('THE CONSOLE IS SET TO THIS PAPER. CHANGE IT THERE FIRST.'); return; }
  settings.customMedia = (settings.customMedia || []).filter(m => m.id !== id);
  saveSettings(); registerCustom(settings);
  edPanel();
}

function edExportData(){
  const t = ED.tpl;
  const media = MEDIA[t.mediaID];
  const out = {format: 'mixel-photobooth-layout', version: 1,
    layout: {name: t.name, subtitle: t.subtitle, accent: t.accent, mediaID: t.mediaID,
             background: t.background, mono: !!t.mono, length: t.length, elements: t.elements}};
  if (media && media.custom) out.paper = media;
  return out;
}

function edImport(){
  const text = (el('#ed-import') || {}).value || '';
  let data;
  try { data = JSON.parse(text); } catch { edSay('THAT IS NOT A LAYOUT — IT DID NOT PARSE.'); return; }
  if (!data || data.format !== 'mixel-photobooth-layout' || !data.layout ||
      !Array.isArray(data.layout.elements)) {
    edSay('THAT IS NOT A PHOTOBOOTH LAYOUT.'); return;
  }
  const bad = data.layout.elements.find(e => !ELEMENT_TYPES.includes(e && e.t));
  if (bad) { edSay('THE LAYOUT HAS AN ELEMENT THIS BOOTH DOES NOT KNOW.'); return; }

  // Its paper comes with it if it is not one of the built-in sizes.
  let mediaID = data.layout.mediaID;
  if (!MEDIA[mediaID] && data.paper) {
    const paper = Object.assign({}, data.paper, {id: 'paper-' + Date.now().toString(36)});
    delete paper.custom;
    settings.customMedia = (settings.customMedia || []).concat([paper]);
    mediaID = paper.id;
    registerCustom(settings);
  }
  if (!MEDIA[mediaID]) { edSay('THE LAYOUT NEEDS A PAPER SIZE THIS BOOTH DOES NOT HAVE.'); return; }
  ED.tpl = Object.assign({}, data.layout, {mediaID});
  ED.editingId = null;
  ED.sel = -1;
  ED.dirty = true;
  edSave(true);
  ED.notice = 'IMPORTED AND SAVED.';
  edRender();
}

/* A test print uses the layout's own paper and the sample photographs, and
 * goes out by whatever route the console is set to. It never touches the
 * guest's sheet counter. */
function edTestPrint(){
  const media = edMedia();
  registerCanvasLayout(ED.tpl);
  const sheet = renderCanvas(edSamplePhotos(), ED.tpl, media, edBrand(), 1, {});
  const dataURL = media.flow ? sheet.toDataURL('image/png') : sheet.toDataURL('image/jpeg', 0.95);
  if (NATIVE) {
    if (settings.printMode === 'thermal') {
      ED.testPrinting = true;
      edSay('SENDING A TEST PRINT OVER BLUETOOTH…');
      NATIVE.thermalPrint(dataURL, 1, Math.max(64, settings.thermalWidthDots | 0));
      return;
    }
    const size = printPaperMils(media, sheet);
    NATIVE.printSheet(dataURL, 1, size.w, size.h, 'Photobooth test · ' + (ED.tpl.name || 'layout'));
    return;
  }
  openPrintDialog(dataURL, media, 1, () => {});
}

function editorPrintResult(ok, message){
  if (!ED.testPrinting) return false;
  ED.testPrinting = false;
  edSay(ok ? 'TEST PRINT SENT.' : 'TEST PRINT FAILED: ' + (message || 'THE PRINTER DID NOT ANSWER.'));
  return true;
}

/* ------------------------------------------------------------------ *
 * Wiring into the booth
 * ------------------------------------------------------------------ */
Object.assign(ACTIONS, {
  'editor-open': openEditor,
  'ed-close': editorBack,
  'ed-save': () => edSave(false),
  'ed-saveas': () => edSave(true),
  'ed-test': edTestPrint,
  'ed-delete': edDelete,
  'ed-samples': () => { ED.samples = true; edRender(); },
  'ed-wells': () => { ED.samples = false; edRender(); },
  'ed-paper-add': edAddPaper,
  'ed-import': edImport,
  'ed-copy': () => {
    const box = el('#ed-export');
    if (!box) return;
    box.select();
    const done = () => edSay('COPIED. PASTE IT INTO IMPORT ON THE OTHER DEVICE.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, () => { document.execCommand('copy'); done(); });
    } else { document.execCommand('copy'); done(); }
  },
  'ed-centre': () => {
    const e = ED.tpl.elements[ED.sel];
    if (!e) return;
    const width = edWidthFraction(e, ED.boxes[ED.sel]);
    if (e.t === 'text') { e.x = 0.5; e.align = 'centre'; }
    else e.x = 0.5 - width / 2;
    ED.dirty = true; edDraw(); edPanel();
  },
  'ed-forward': () => edReorder(+1),
  'ed-back': () => edReorder(-1),
  'ed-dup': () => {
    const e = ED.tpl.elements[ED.sel];
    if (!e) return;
    const copy = JSON.parse(JSON.stringify(e));
    copy.x += 3 / edPaperMM().w; copy.y += 3 / edPaperMM().h;
    ED.tpl.elements.push(copy);
    ED.sel = ED.tpl.elements.length - 1;
    ED.dirty = true; edDraw(); edPanel();
  },
  'ed-del': () => {
    if (ED.sel < 0) return;
    ED.tpl.elements.splice(ED.sel, 1);
    ED.sel = -1; ED.dirty = true; ED.tab = 'layout';
    edTabsState(); edDraw(); edPanel();
  },
});

function edReorder(step){
  const list = ED.tpl.elements, i = ED.sel, j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  ED.sel = j; ED.dirty = true;
  edDraw(); edPanel();
}

/* Buttons that carry data beyond their action name. */
document.addEventListener('click', e => {
  if (session.step !== 'editor') return;
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'ed-tab') { ED.tab = b.dataset.tab; edTabsState(); edPanel(); }
  else if (act === 'ed-add') edAdd(b.dataset.type);
  else if (act === 'ed-select') { ED.sel = +b.dataset.i; ED.tab = 'element'; edTabsState(); edPanel(); edDrawSelection(); }
  else if (act === 'ed-offer') edToggleOffer(b.dataset.id);
  else if (act === 'ed-paper-del') edDeletePaper(b.dataset.id);
  else if (act === 'ed-preset') {
    const p = PAPER_PRESETS[+b.dataset.i];
    ED.paperDraft = {name: p.name, roll: !!p.roll, w: p.w, h: p.h || 148, paper: p.paper || 80, dpi: p.dpi};
    edPanel();
  }
  else if (act === 'ed-token') {
    const field = el('#ed-panel [data-k="E.text"]');
    if (!field) return;
    const start = field.selectionStart == null ? field.value.length : field.selectionStart;
    field.value = field.value.slice(0, start) + b.dataset.token + field.value.slice(field.selectionEnd || start);
    edInput('E.text', field.value, undefined, ED.sel, ED.tpl);
    field.focus();
  }
});

/* Nudging with the keyboard, on a Mac or a tablet with a keyboard attached. */
document.addEventListener('keydown', e => {
  if (session.step !== 'editor' || ED.sel < 0) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const el0 = ED.tpl.elements[ED.sel];
  const step = (e.shiftKey ? 5 : 0.5);
  const P = edPaperMM();
  const moves = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
  if (moves[e.key]) {
    e.preventDefault();
    el0.x += moves[e.key][0] / P.w; el0.y += moves[e.key][1] / P.h;
    ED.dirty = true; edDraw(); edPanel();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); ACTIONS['ed-del']();
  }
});

window.addEventListener('resize', () => {
  if (session.step === 'editor') { edFit(); edDraw(); }
});
