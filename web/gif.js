/* GIF89a encoder.
 *
 * Written out rather than pulled in, for the same reason qr.js was: this app
 * ships inside an APK and has to work with no network, so every dependency is
 * a file somebody has to vendor, audit and keep. A GIF encoder is a palette,
 * LZW and a handful of block headers — small enough to own.
 *
 * Scope is deliberately narrow: a few frames, all the same size, one global
 * palette, looping forever. That is a photobooth GIF and nothing else.
 *
 * The palette is the part worth explaining. Building an optimal one per GIF
 * (median cut, octree) costs code and time for a picture that is four frames
 * of the same face under the same light. Instead there are two fixed
 * palettes: 256 greys for the monochrome prints this booth mostly makes, and
 * a 6x6x6 colour cube plus 40 greys for the rest. Fixed palettes also mean
 * every frame quantises identically, so the background does not shimmer
 * between frames the way per-frame palettes make it.
 */

/* ---------------------------------------------------------------- LZW ----
 * GIF's variable-width LZW. The dictionary starts at 2^n codes, grows a bit
 * wider each time it fills, and resets when it reaches 12 bits. Codes are
 * packed little-endian across byte boundaries, then emitted in sub-blocks of
 * at most 255 bytes.
 */
function lzwEncode(indices, minCodeSize){
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let next = endCode + 1;

  let dict = new Map();
  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    next = endCode + 1;
  };

  const out = [];
  let bitBuffer = 0, bitCount = 0;
  const emit = code => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xFF);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  resetDict();

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;          // cheaper than a string key
    if (dict.has(key)) { prefix = dict.get(key); continue; }

    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      // The width grows *after* the code that filled the old width.
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clearCode);
      resetDict();
    }
    prefix = k;
  }
  emit(prefix);
  emit(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xFF);

  // Sub-blocks: one length byte, then up to 255 bytes, ending with a zero.
  const blocked = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocked.push(chunk.length, ...chunk);
  }
  blocked.push(0);
  return blocked;
}

/* ------------------------------------------------------------ palettes ---- */

/// 256 greys. What this booth prints, and what its photographs already are.
function greyPalette(){
  const p = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) { p[i*3] = p[i*3+1] = p[i*3+2] = i; }
  return p;
}

/// A 6x6x6 cube (216) plus 40 greys, which is the old web palette and still
/// a reasonable general-purpose one when a picture has colour in it.
function colourPalette(){
  const p = new Uint8Array(256 * 3);
  let n = 0;
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
    p[n*3] = r * 51; p[n*3+1] = g * 51; p[n*3+2] = b * 51; n++;
  }
  for (let i = 0; i < 40; i++) {
    const v = Math.round(i * 255 / 39);
    p[n*3] = p[n*3+1] = p[n*3+2] = v; n++;
  }
  return p;
}

const LUMA = [0.2126, 0.7152, 0.0722];

function quantise(rgba, mono){
  const n = rgba.length / 4;
  const out = new Uint8Array(n);
  if (mono) {
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      out[p] = Math.round(LUMA[0]*rgba[i] + LUMA[1]*rgba[i+1] + LUMA[2]*rgba[i+2]);
    }
    return out;
  }
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const r = Math.round(rgba[i] / 51), g = Math.round(rgba[i+1] / 51),
          b = Math.round(rgba[i+2] / 51);
    out[p] = r * 36 + g * 6 + b;
  }
  return out;
}

/* ---------------------------------------------------------------- API ----
 * `frames` are canvases or ImageData, all the same size. `delay` is per
 * frame in milliseconds. Returns a Blob.
 */
function encodeGIF(frames, opts){
  opts = opts || {};
  if (!frames || !frames.length) return null;
  const delay = Math.max(20, opts.delay || 400);
  const mono = opts.mono !== false;
  const first = frames[0];
  const width = first.width, height = first.height;

  const bytes = [];
  const push = (...v) => bytes.push(...v);
  const short = v => push(v & 0xFF, (v >> 8) & 0xFF);
  const ascii = s => push(...[...s].map(c => c.charCodeAt(0)));

  ascii('GIF89a');
  short(width); short(height);
  // Global colour table, 8 bits per channel, 256 entries.
  push(0xF7, 0, 0);
  push(...(mono ? greyPalette() : colourPalette()));

  // Netscape extension: loop forever. Without it a GIF plays once, which for
  // a photobooth strip is the difference between a loop and a flicker.
  push(0x21, 0xFF, 11);
  ascii('NETSCAPE2.0');
  push(3, 1, 0, 0, 0);

  const centiseconds = Math.round(delay / 10);
  frames.forEach(frame => {
    const ctx = frame.getContext ? frame.getContext('2d') : null;
    const data = ctx ? ctx.getImageData(0, 0, width, height).data : frame.data;

    // Graphic control: how long this frame sits, and restore to background
    // so frames do not smear into each other.
    push(0x21, 0xF9, 4, 0x08);
    short(centiseconds);
    push(0, 0);

    push(0x2C);
    short(0); short(0); short(width); short(height);
    push(0);                                  // no local table, not interlaced

    const indices = quantise(data, mono);
    push(8);                                  // minimum LZW code size
    push(...lzwEncode(indices, 8));
  });

  push(0x3B);                                 // trailer
  return new Blob([new Uint8Array(bytes)], {type: 'image/gif'});
}

if (typeof window !== 'undefined') window.encodeGIF = encodeGIF;
if (typeof module !== 'undefined') module.exports = {encodeGIF, lzwEncode};
