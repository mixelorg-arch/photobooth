/* ==================================================================== *
 * QR Code — model 2, byte mode, error correction level M, versions 1-10.
 *
 * Written out of ISO/IEC 18004 rather than pulled in, because the booth has
 * no build step and takes no dependencies. Ten versions carry 216 bytes,
 * far more than the gallery link a receipt prints.
 *
 * Verified by round trip: encode here, render to a canvas, decode it back
 * with the browser's BarcodeDetector and compare. A QR that only *looks*
 * like a QR is worse than none — a guest would scan it and get nothing.
 * ==================================================================== */
(function(){
'use strict';

/* ---- GF(256), primitive polynomial x^8+x^4+x^3+x^2+1, generator 2 ---- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/* Error correction structure for level M: [ecCodewordsPerBlock,
 * [[blockCount, dataCodewordsPerBlock], ...]] */
const EC_M = {
  1:[10,[[1,16]]],        2:[16,[[1,28]]],        3:[26,[[1,44]]],
  4:[18,[[2,32]]],        5:[24,[[2,43]]],        6:[16,[[4,27]]],
  7:[18,[[4,31]]],        8:[22,[[2,38],[2,39]]], 9:[22,[[3,36],[2,37]]],
  10:[26,[[4,43],[1,44]]],
};
/* Alignment pattern centres, per version. */
const ALIGN = {
  1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30],
  6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50],
};
const dataCapacity = v => EC_M[v][1].reduce((s, [n, d]) => s + n * d, 0);

/* Generator polynomial for `n` error correction codewords. */
function genPoly(n){
  let p = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) {
      next[j]     ^= mul(p[j], 1);
      next[j + 1] ^= mul(p[j], EXP[i]);
    }
    p = next;
  }
  return p;
}

/* Reed-Solomon remainder — the error correction codewords for one block. */
function rsEncode(data, ecLen){
  const gen = genPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

/* ---- bit stream ---- */
function BitBuffer(){ this.bits = []; }
BitBuffer.prototype.push = function(value, length){
  for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
};

/* ---- format and version information, both BCH coded ---- */
function formatBits(mask){
  const d = (0 /* level M = 0b00 */ << 3) | mask;   // 5 data bits
  let r = d << 10;
  for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
  return (((d << 10) | (r & 0x3FF)) ^ 0x5412) & 0x7FFF;
}
function versionBits(v){
  let r = v << 12;
  for (let i = 17; i >= 12; i--) if ((r >>> i) & 1) r ^= 0x1F25 << (i - 12);
  return ((v << 12) | (r & 0xFFF)) & 0x3FFFF;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

/* Encode `text` and return {size, modules} where modules[r][c] is 0 or 1. */
function encode(text){
  const bytes = new TextEncoder().encode(String(text));

  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
  }
  if (!version) throw new Error('QR: ' + bytes.length + ' bytes is more than version 10 holds');

  /* --- data codewords --- */
  const bb = new BitBuffer();
  bb.push(0b0100, 4);                              // byte mode
  bb.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) bb.push(b, 8);

  const capacityBits = dataCapacity(version) * 8;
  bb.push(0, Math.min(4, capacityBits - bb.bits.length));   // terminator
  while (bb.bits.length % 8) bb.bits.push(0);
  const words = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    words.push(byte);
  }
  for (let pad = 0xEC; words.length < dataCapacity(version); pad ^= 0xEC ^ 0x11) words.push(pad);

  /* --- split into blocks, add error correction, interleave --- */
  const [ecLen, groups] = EC_M[version];
  const blocks = [];
  let at = 0;
  for (const [count, dataLen] of groups) {
    for (let i = 0; i < count; i++) {
      const d = words.slice(at, at + dataLen); at += dataLen;
      blocks.push({data: d, ec: rsEncode(d, ecLen)});
    }
  }
  const final = [];
  const maxData = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) final.push(b.data[i]);
  for (let i = 0; i < ecLen; i++)
    for (const b of blocks) final.push(b.ec[i]);

  /* --- the matrix --- */
  const size = version * 4 + 17;
  const m = Array.from({length: size}, () => new Uint8Array(size));
  const fn = Array.from({length: size}, () => new Uint8Array(size));  // function module?
  const put = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = 1; };

  // Finder patterns and their separators.
  for (const [fr, fc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = fr + dr, c = fc + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const d = Math.max(Math.abs(3 - dr), Math.abs(3 - dc));
      put(r, c, d !== 2 && d <= 3);
    }
  }
  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = ALIGN[version];
  for (let i = 0; i < centres.length; i++) for (let j = 0; j < centres.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === centres.length - 1) ||
        (i === centres.length - 1 && j === 0)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      put(centres[i] + dr, centres[j] + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // Timing patterns.
  for (let i = 0; i < size; i++) { if (!fn[6][i]) put(6, i, i % 2 === 0); if (!fn[i][6]) put(i, 6, i % 2 === 0); }
  // Format information areas are reserved now and written per mask below.
  for (let i = 0; i <= 8; i++) { if (i !== 6) { put(8, i, 0); put(i, 8, 0); } }
  for (let i = 0; i < 8; i++) { put(8, size - 1 - i, 0); put(size - 1 - i, 8, 0); }
  put(size - 8, 8, 1);                                   // the always-dark module
  // Version information, versions 7 and up.
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (vb >>> i) & 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
      put(b, a, bit); put(a, b, bit);
    }
  }

  // Data, zigzagging up and down column pairs from the right edge.
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (fn[r][c] || bit >= final.length * 8) continue;
        m[r][c] = (final[bit >>> 3] >>> (7 - (bit & 7))) & 1;
        bit++;
      }
    }
  }

  /* --- choose the mask that scores lowest --- */
  let best = null, bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const test = m.map(row => Uint8Array.from(row));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (!fn[r][c] && MASKS[mask](r, c)) test[r][c] ^= 1;
    writeFormat(test, fn, size, mask);
    const p = penalty(test, size);
    if (p < bestPenalty) { bestPenalty = p; best = test; }
  }
  return {size, modules: best, version};
}

function writeFormat(m, fn, size, mask){
  const bits = formatBits(mask);
  const b = i => (bits >>> i) & 1;
  for (let i = 0; i <= 5; i++) m[i][8] = b(i);
  m[7][8] = b(6); m[8][8] = b(7); m[8][7] = b(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = b(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = b(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = b(i);
  m[size - 8][8] = 1;
}

/* The four penalty rules from the spec. Lower is a QR that scans better. */
function penalty(m, size){
  let score = 0;

  // Rule 1 — runs of five or more of one colour.
  const run = get => {
    for (let a = 0; a < size; a++) {
      let last = -1, len = 0;
      for (let b = 0; b < size; b++) {
        const v = get(a, b);
        if (v === last) { len++; if (len === 5) score += 3; else if (len > 5) score += 1; }
        else { last = v; len = 1; }
      }
    }
  };
  run((r, c) => m[r][c]);
  run((c, r) => m[r][c]);

  // Rule 2 — two by two blocks of one colour.
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }

  // Rule 3 — the finder-lookalike 1011101 with four light modules beside it.
  const A = [1,0,1,1,1,0,1,0,0,0,0], B = [0,0,0,0,1,0,1,1,1,0,1];
  const at = (r, c, horiz) => horiz ? m[r][c] : m[c][r];
  for (let a = 0; a < size; a++) for (let b = 0; b + 11 <= size; b++) {
    for (const horiz of [true, false]) {
      let mA = true, mB = true;
      for (let i = 0; i < 11; i++) {
        const v = at(a, b + i, horiz);
        if (v !== A[i]) mA = false;
        if (v !== B[i]) mB = false;
      }
      if (mA) score += 40;
      if (mB) score += 40;
    }
  }

  // Rule 4 — deviation from half dark.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = dark * 100 / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

/* Draw into an existing 2D context. `box` is the target square in device
 * pixels; the module size is rounded down to a whole pixel and the result
 * centred, because a fractional module on a 203dpi thermal head prints as
 * a smear the scanner cannot read. `quiet` is in modules (the spec's
 * minimum is 4). Returns the square actually drawn. */
function draw(g, text, box, colour){
  const {size, modules} = encode(text);
  const quiet = 4, total = size + quiet * 2;
  const unit = Math.max(1, Math.floor(box.size / total));
  const side = unit * total;
  const x = Math.round(box.x + (box.size - side) / 2);
  const y = Math.round(box.y + (box.size - side) / 2);

  g.save();
  g.fillStyle = '#FFFFFF';
  g.fillRect(x, y, side, side);
  g.fillStyle = colour || '#000000';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    if (modules[r][c]) g.fillRect(x + (c + quiet) * unit, y + (r + quiet) * unit, unit, unit);
  g.restore();
  return {x, y, size: side};
}

window.QR = {encode, draw};
})();
