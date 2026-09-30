/* ==================================================================== *
 * The digital copy: Cloudinary upload, and the link a guest scans.
 *
 * A printed sticker is the souvenir; this is the copy that survives it.
 * Every session gets a short code, the photographs and the print go up
 * under that code, and a QR pointing at a plain page that shows them.
 *
 * Two things shape the whole design:
 *
 *  1. THE URL IS KNOWN BEFORE THE UPLOAD FINISHES. Cloudinary lets an
 *     unsigned upload name its own `public_id`, and delivery URLs work
 *     without the version component (both measured against this account,
 *     2026-09-30). So the booth mints the code, prints the QR immediately,
 *     and the bytes catch up a few seconds later while the guest is still
 *     reading the screen. Waiting for the upload before printing would put
 *     a venue's wifi in the middle of the print queue, which is the one
 *     place it must never be.
 *
 *  2. NO SECRET IS AVAILABLE. The account has an unsigned preset and
 *     nothing else — no key, no signature. Unsigned means uploads only:
 *     nothing here can delete, overwrite someone else's asset, or list
 *     what is stored. It also means the preset name is public in this
 *     file, which is how unsigned presets work; the exposure is that a
 *     stranger who reads it can upload to the account, not that they can
 *     read it.
 *
 * Failure is expected, not exceptional. Venues lose wifi mid-session, so
 * every job retries with a backoff, and the booth asks `live()` before it
 * commits a QR to paper — a code printed onto a sticker that leads
 * nowhere is worse than a sticker with no code on it.
 * ==================================================================== */
(function(){
'use strict';

/* Codes are read off a screen and, when that fails, typed in by hand.
 * 0/O, 1/I/L and U/V are the pairs people get wrong, so none of them are
 * here. 30^6 is 729 million: at a thousand sessions a day the chance of
 * ever colliding stays under one in two thousand for a decade. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';
const CODE_LEN = 6;

/* Long edge of an uploaded photograph. Big enough to fill a phone screen
 * and to print small at home; small enough that a session's worth goes up
 * over cafe wifi in seconds. */
const MAX_EDGE = 1600;
const QUALITY  = 0.86;

const TRIES    = 4;
const BACKOFF  = [800, 2500, 6000];   // ms between attempts

function newCode(){
  const n = new Uint8Array(CODE_LEN);
  (self.crypto || window.crypto).getRandomValues(n);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[n[i] % ALPHABET.length];
  return out;
}

/* Where a session's assets live. One folder per code keeps the Cloudinary
 * console usable by hand, which matters because unsigned credentials
 * cannot delete anything — tidying up is always a manual job. */
const folder    = code => 'snapbox/' + code;
const publicID  = (code, name) => folder(code) + '/' + name;

/* Delivery. `fl_attachment` is what makes a phone save the file rather
 * than open it; measured against this account, it comes back with
 * content-disposition: attachment, which is the only reliable way to hand
 * a cross-origin file to mobile Safari. */
const imageURL = (cloud, code, name, ext) =>
  'https://res.cloudinary.com/' + cloud + '/image/upload/' +
  publicID(code, name) + '.' + (ext || 'jpg');
const saveURL = (cloud, code, name, filename) =>
  'https://res.cloudinary.com/' + cloud + '/image/upload/' +
  'fl_attachment:' + (filename || name) + '/' + publicID(code, name) + '.jpg';

/* What the QR carries. Short on purpose: every character costs modules,
 * and modules are what a phone camera has to resolve on a screen held at
 * arm's length or on a sticker the size of a stamp. The photo count rides
 * along so the page knows what to ask for without a round trip. */
function linkFor(base, code, count){
  const root = String(base || '').trim() || 'https://mixelorg-arch.github.io/photobooth/s/';
  return root + (root.endsWith('/') ? '' : '/') + '#' + code + '.' + (count | 0);
}

/* ---------------------------------------------------------------- *
 * Turning a canvas into something to post
 * ---------------------------------------------------------------- */
function shrink(canvas, maxEdge){
  const long = Math.max(canvas.width, canvas.height);
  if (long <= maxEdge) return canvas;
  const k = maxEdge / long;
  const out = document.createElement('canvas');
  out.width  = Math.max(1, Math.round(canvas.width  * k));
  out.height = Math.max(1, Math.round(canvas.height * k));
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function toBlob(canvas, type, quality){
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas would not encode')),
                  type, quality);
  });
}

/* ---------------------------------------------------------------- *
 * The queue
 * ---------------------------------------------------------------- */
const queue = [];
let running = false;

/* 'idle'    nothing has been attempted yet
 * 'working' at least one job is in flight
 * 'up'      something has landed — the network is good
 * 'down'    a job exhausted its retries — assume no usable network
 * Only 'down' changes what the booth prints. */
let state = 'idle';
const counts = {done: 0, failed: 0};
let listener = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const announce = () => { try { listener && listener(status()); } catch {} };

function status(){
  return {
    state,
    pending: queue.length,
    done: counts.done,
    failed: counts.failed,
  };
}

async function post(job){
  const fd = new FormData();
  fd.append('file', job.blob);
  fd.append('upload_preset', job.preset);
  fd.append('public_id', job.publicID);
  // Tags are the only handle left for finding an event's assets later,
  // since listing needs a signature.
  fd.append('tags', 'snapbox,snapbox-' + job.code);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + job.cloud + '/image/upload',
                          {method: 'POST', body: fd});
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch {}
    throw new Error('Cloudinary ' + res.status + ' ' + detail);
  }
  return res.json();
}

async function pump(){
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue[0];
    if (state !== 'up') { state = 'working'; announce(); }
    try {
      await post(job);
      queue.shift();
      counts.done++;
      state = 'up';
      announce();
    } catch (err) {
      job.tries = (job.tries || 0) + 1;
      if (job.tries >= TRIES) {
        queue.shift();
        counts.failed++;
        state = 'down';
        console.warn('upload gave up:', job.publicID, err.message);
        announce();
      } else {
        console.warn('upload retry', job.tries, job.publicID, err.message);
        await sleep(BACKOFF[Math.min(job.tries - 1, BACKOFF.length - 1)]);
      }
    }
  }
  running = false;
  announce();
}

/* ---------------------------------------------------------------- *
 * What the booth calls
 * ---------------------------------------------------------------- */

/* A new session. Anything still queued from the last one is kept: those
 * guests have already walked off with a printed code, and a late upload
 * is what makes that code work. Only the counters restart. */
function begin(){
  counts.done = 0;
  counts.failed = 0;
  // A session that starts while the network is known-bad should not be
  // told the last session's verdict — but nor should it forget it while
  // jobs are still failing. 'down' clears only when nothing is waiting.
  if (state === 'down' && !queue.length) state = 'idle';
  announce();
}

/* Queue one canvas. Returns immediately: nothing in the booth ever waits
 * on the network. */
async function push(cfg, name, canvas){
  if (!cfg || !cfg.cloud || !cfg.preset || !cfg.code) return;
  try {
    const blob = await toBlob(shrink(canvas, MAX_EDGE), 'image/jpeg', QUALITY);
    queue.push({cloud: cfg.cloud, preset: cfg.preset, code: cfg.code,
                publicID: publicID(cfg.code, name), blob, tries: 0});
    announce();
    pump();
  } catch (err) {
    counts.failed++;
    state = 'down';
    console.warn('could not encode for upload:', name, err.message);
    announce();
  }
}

/* Is a link worth printing? Optimistic by design — an untried network is
 * assumed good, because the alternative is never printing a code until
 * after the first upload, which on a one-shot layout is never in time.
 * It turns pessimistic the moment a job actually exhausts its retries. */
function live(){
  if (state === 'down') return false;
  // A tablet that knows it has no network says so; the positive case is
  // not trustworthy, so it is not consulted.
  if (navigator.onLine === false) return false;
  return true;
}

/* One tiny upload, for the operator console. Answers the only question
 * that matters — does this cloud name and this preset accept a file from
 * this device — and returns the URL it made so it can be opened. */
async function probe(cfg){
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#111111'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#FFFFFF'; g.fillRect(2, 2, 4, 4);
  const blob = await toBlob(c, 'image/jpeg', 0.8);
  const t0 = Date.now();
  let out;
  try {
    out = await post({cloud: cfg.cloud, preset: cfg.preset, code: 'selftest',
                      publicID: 'snapbox/selftest/probe', blob});
  } catch (err) {
    // The probe is the booth's evidence about the network. A failed one is
    // evidence too, and the printed QR depends on it being recorded.
    state = 'down';
    announce();
    throw err;
  }
  state = 'up';
  announce();
  return {ms: Date.now() - t0, url: out.secure_url};
}

window.Cloud = {
  newCode, folder, imageURL, saveURL, linkFor,
  begin, push, probe, live, status,
  onChange(fn){ listener = fn; },
};
})();
