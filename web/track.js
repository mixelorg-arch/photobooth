/* ==================================================================== *
 * Subject tracking for the viewfinder.
 *
 * The brackets in a camcorder's finder that sit on a face and follow it.
 * This is the thing that makes a viewfinder read as a camera rather than a
 * picture frame, and it is the one piece of the reference that cannot be
 * done in CSS.
 *
 * WHAT THIS IS NOT: face *recognition*, or a face detector in the sense a
 * phone camera means it. Those are convolutional models, megabytes of
 * weights, and this app's whole point is that it works on a tablet in a
 * cafe with the wifi off. There is no browser API to lean on either —
 * `FaceDetector` exists in the spec and in approximately no shipping
 * browser, and it is checked for and used when it is actually there.
 *
 * What is left is what a 1990s camcorder did: find the skin-coloured blob,
 * put a box on it, and smooth the box so it glides. It is honest about
 * being an approximation — the label says SUBJECT, not FACE, and when it
 * is unsure it says so rather than guessing a box.
 *
 * Costs about 7000 pixels of work twelve times a second, which is nothing.
 * ==================================================================== */
(function(){
'use strict';

const GRID_W   = 96;      // the picture is examined this wide, no wider
const FPS      = 12;
const SMOOTH   = 0.28;    // how fast the box follows; lower is more syrup
const HOLD     = 7;       // misses tolerated before the box is dropped
const NEED     = 2;       // consecutive finds before it is shown
const MIN_AREA = 0.012;   // of the frame; smaller than this is a hand or noise
const MAX_AREA = 0.62;    // bigger than this is a wall, or a wash of warm light

/* Skin, by two independent tests, because either alone fails somewhere that
 * matters. The RGB rule (Kovac) is good in daylight and poor under the warm
 * tungsten a cafe actually has; the YCbCr rule holds up far better under a
 * colour cast but accepts some wood and terracotta. Requiring *both* loses
 * dark skin under warm light, which is not a trade this booth will make, so
 * either is enough and the blob rules below throw out what that lets in. */
function isSkin(r, g, b){
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (r > 95 && g > 40 && b > 20 && max - min > 15 &&
      Math.abs(r - g) > 15 && r > g && r > b) return true;
  const y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 44 && cb >= 77 && cb <= 130 && cr >= 134 && cr <= 177;
}

/* ---------------------------------------------------------------- *
 * One pass over a frame
 * ---------------------------------------------------------------- */

/* Largest-blob search. A booth frame holds a face, usually a neck and
 * shoulders, sometimes hands, and whatever behind them happens to be warm.
 * Scoring is therefore not "biggest wins":
 *
 *   - height in frame matters, because hands live below faces;
 *   - a blob must be solid, because a face is and a lit wall is not;
 *   - a blob much taller than it is wide is a face plus a neck plus a
 *     chest, so only its top is kept.
 */
function findSubject(data, w, h){
  const mask = new Uint8Array(w * h);
  let skinTotal = 0;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (isSkin(data[p], data[p + 1], data[p + 2])) { mask[i] = 1; skinTotal++; }
  }
  if (!skinTotal) return null;

  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, area = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    stack[top++] = start; seen[start] = 1;
    while (top) {
      const i = stack[--top];
      const x = i % w, y = (i / w) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      // Four-connected: eight joins a face to a hand through one corner
      // pixel often enough to matter.
      if (x > 0     && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0     && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    const frac = area / (w * h);
    if (frac < MIN_AREA || frac > MAX_AREA) continue;

    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const fill = area / (bw * bh);
    if (fill < 0.38) continue;                   // a ring of warm background
    const centreY = (y0 + bh / 2) / h;
    const score = frac * (1.5 - centreY) * (0.5 + fill);
    if (!best || score > best.score) best = {x0, y0, x1, y1, area, fill, score};
  }
  if (!best) return null;

  let {x0, y0, x1, y1, fill} = best;
  let bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // Head, neck and chest come back as one tall blob. A head is about as wide
  // as it is tall, so anything much taller is cropped to its own top.
  if (bh > bw * 1.35) { bh = Math.round(bw * 1.25); y1 = y0 + bh - 1; }

  return {
    x: x0 / w, y: y0 / h, w: bw / w, h: bh / h,
    conf: Math.min(1, fill * 1.4),
  };
}

/* ---------------------------------------------------------------- *
 * The tracker itself
 * ---------------------------------------------------------------- */
let scratch = null, sg = null;
let source = null, mirrored = false;
let timer = 0, last = 0;
let box = null, hits = 0, misses = 0;
let native = null;              // a real FaceDetector, on the day one exists

const state = {found: false, x: .5, y: .5, w: .3, h: .3, conf: 0, via: 'blob'};

function frameOf(el){
  if (!el) return null;
  // <video> and <img> report their natural size differently, and both are 0
  // until something has actually arrived.
  const w = el.videoWidth || el.naturalWidth || 0;
  const h = el.videoHeight || el.naturalHeight || 0;
  return (w && h) ? {w, h} : null;
}

async function measure(){
  const dim = frameOf(source);
  if (!dim) return null;

  if (native) {
    try {
      const faces = await native.detect(source);
      if (faces && faces.length) {
        // The biggest face is the one standing in front of the booth.
        const f = faces.map(f => f.boundingBox)
                       .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        return {x: f.x / dim.w, y: f.y / dim.h, w: f.width / dim.w, h: f.height / dim.h,
                conf: 1, via: 'native'};
      }
      return null;
    } catch {
      native = null;            // one failure is enough; fall back for good
    }
  }

  const gw = GRID_W, gh = Math.max(24, Math.round(GRID_W * dim.h / dim.w));
  if (!scratch) { scratch = document.createElement('canvas'); }
  if (scratch.width !== gw || scratch.height !== gh) {
    scratch.width = gw; scratch.height = gh;
    sg = scratch.getContext('2d', {willReadFrequently: true});
  }
  try { sg.drawImage(source, 0, 0, gw, gh); }
  catch { return null; }        // a frame that is not ready yet
  const px = sg.getImageData(0, 0, gw, gh).data;
  const hit = findSubject(px, gw, gh);
  if (hit) hit.via = 'blob';
  return hit;
}

function settle(hit){
  if (hit) {
    hits++; misses = 0;
    box = box ? {
      x: box.x + (hit.x - box.x) * SMOOTH,
      y: box.y + (hit.y - box.y) * SMOOTH,
      w: box.w + (hit.w - box.w) * SMOOTH,
      h: box.h + (hit.h - box.h) * SMOOTH,
    } : {x: hit.x, y: hit.y, w: hit.w, h: hit.h};
    if (hits >= NEED) {
      state.found = true;
      state.conf = hit.conf;
      state.via = hit.via;
    }
  } else {
    misses++; hits = 0;
    if (misses > HOLD) { state.found = false; box = null; }
  }
  if (box) {
    // The overlay sits on the picture as displayed. A mirrored preview shows
    // the guest their own left on the left, so the box has to be mirrored
    // with it or it tracks the wrong side of their face.
    state.x = mirrored ? 1 - box.x - box.w : box.x;
    state.y = box.y; state.w = box.w; state.h = box.h;
  }
}

async function tick(){
  const now = performance.now();
  if (now - last >= 1000 / FPS) {
    last = now;
    settle(await measure());
  }
  if (timer) timer = requestAnimationFrame(tick);
}

const Tracker = {
  /* Point it at a <video> or <img>. `mirror` says the element is flipped on
   * screen, which is how the preview is shown. */
  watch(el, mirror){
    source = el || null;
    mirrored = !!mirror;
    box = null; hits = 0; misses = 0;
    state.found = false;
    if (source && !timer) {
      if (!native && typeof window.FaceDetector === 'function') {
        try { native = new window.FaceDetector({fastMode: true, maxDetectedFaces: 4}); }
        catch { native = null; }
      }
      timer = requestAnimationFrame(tick);
    }
  },
  stop(){
    if (timer) cancelAnimationFrame(timer);
    timer = 0; source = null; box = null; state.found = false;
  },
  read(){ return state; },
  // Exposed so a test can hand it one frame and check the answer, rather
  // than watching a box wobble and calling that verification.
  findSubject, isSkin,
  get usingNative(){ return !!native; },
};

window.Tracker = Tracker;
})();
