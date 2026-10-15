/* SnapBox — image processing for a one-bit print head.
 * ====================================================================
 *
 * Everything in this file works on pixels and knows nothing about the booth:
 * no screens, no settings, no printers. It is loaded before booth.js and
 * shares the global scope with it, which is how `thermalize` over there
 * reaches these by name.
 *
 * It was split out of booth.js so the pipeline is one readable file that can
 * be reasoned about — and tested — on its own. The functions carry the names
 * the brief asked for; the older internal names are kept as aliases at the
 * foot of the file so nothing that already called them had to change.
 *
 * THE PIPELINE, IN ORDER
 *
 *   capture (native resolution)
 *     -> crop to the slot's shape          cropPortrait
 *     -> noise reduction, if asked         reduceNoise
 *     -> resize to the printable width     resizeForPrinter   (high quality)
 *     -> luminance greyscale               convertToGrayscale
 *     -> contrast / brightness / gamma     adjustContrast/Brightness/Gamma
 *     -> lift local shadow                 liftShadows
 *     -> sharpen                           sharpenImage
 *     -> dither to one bit                 apply*Dithering / applyThreshold
 *     -> preview                           generatePrintPreview
 *     -> send, unscaled and unredithered   printRasterImage (in booth.js)
 *
 * Two things about that order are not negotiable, and both are the reason it
 * is written down here:
 *
 *   Resize BEFORE sharpening. Sharpening and then resampling throws the
 *   sharpened edges away and leaves the halo; resizing first means the
 *   sharpening lands on the dots that will actually burn.
 *
 *   Dither LAST, and never touch the result. A dither is a field of single
 *   black and white dots. Rescaling it averages neighbours back into greys
 *   the head cannot print, and JPEG rings around every dot — measured on a
 *   label sheet, 2 levels became 20 through JPEG at quality 0.95. Once the
 *   image is one bit, the only legal operations on it are "send" and "show".
 *
 * In the booth the resize happens where a photograph is drawn into the sheet
 * (see `smoothing` in booth.js) and the tone-and-dither tail happens in
 * `thermalize` at compose time, so the sheet a guest approves on the review
 * screen is the exact one that burns, dot for dot. The order above is the
 * order those two stages run in.
 */

/* ==================================================================== *
 * Preparing a sheet for a one-bit head
 *
 * A thermal printer burns a dot or it does not. There is no grey, and no
 * amount of capture resolution changes that — the camera already hands the
 * booth more than twice the pixels a 100mm label can print. What decides how
 * much of a face survives is which dots get burned, and until now the booth
 * sent 8-bit grey and let the printer's own driver choose. Vendor drivers
 * generally threshold: every tone above some level becomes white, everything
 * below becomes black, and a face turns into two flat shapes.
 *
 * Doing it here instead, with error diffusion, is the whole difference. Each
 * dot takes the nearest of black or white, and the error — how wrong that
 * choice was — is pushed into the neighbours not yet decided, so a midtone
 * becomes a texture of black and white dots that reads as grey at arm's
 * length. The driver is then handed pure black and white and has nothing left
 * to decide.
 *
 * Order matters: tone first, then sharpening, then dithering. Sharpening
 * after a dither would only sharpen dot noise, and tone applied after would
 * have nothing continuous left to work on.
 * ==================================================================== */

/// Luminance, the way the eye weights it. A flat average makes skin too dark
/// and skies too light, which on one bit is the difference between a face and
/// a silhouette.
const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

/* A 4x4 ordered (Bayer) screen, scaled to thresholds. Coarser than error
 * diffusion on a photograph, but it does not smear, so large flat areas stay
 * even instead of growing the worms error diffusion can produce. */
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

/* The average brightness of each pixel's *neighbourhood*, which is what makes
 * the next two steps local rather than global.
 *
 * Computed on a downsampled grid and sampled back bilinearly. A true blur of
 * this radius over a million dots would cost more than the whole rest of the
 * pipeline; at this radius the difference is invisible, because the map is
 * only ever used as a slowly varying reference level.
 */
function localMean(lum, W, H, radius){
  const step = Math.max(1, Math.round(radius / 2));
  const sw = Math.max(1, Math.ceil(W / step)), sh = Math.max(1, Math.ceil(H / step));
  let grid = new Float32Array(sw * sh);
  const count = new Float32Array(sw * sh);
  for (let y = 0; y < H; y++) {
    const gy = (y / step) | 0;
    for (let x = 0; x < W; x++) {
      const gi = gy * sw + ((x / step) | 0);
      grid[gi] += lum[y * W + x]; count[gi]++;
    }
  }
  for (let i = 0; i < grid.length; i++) grid[i] /= (count[i] || 1);

  // Two box passes over the small grid: close enough to a gaussian that
  // nothing downstream can tell, at a fraction of the cost.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= sh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= sw) continue;
            sum += grid[yy * sw + xx]; n++;
          }
        }
        next[y * sw + x] = sum / n;
      }
    }
    grid = next;
  }

  // Back up to full size, bilinear, so the map has no visible blocking.
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(sh - 1, y / step), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(sw - 1, x / step), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = grid[y0 * sw + x0], b = grid[y0 * sw + x1];
      const c = grid[y1 * sw + x0], d = grid[y1 * sw + x1];
      out[y * W + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}

/* Lift what is sitting in local shadow, and leave everything else alone.
 *
 * This is the "brighten faces" step, and it is worth being exact about what
 * it is not: there is no face detection here. The browsers this runs in do
 * not offer one — Safari has no Shape Detection API at all and Chrome has
 * unshipped its FaceDetector — and carrying a detection model would mean
 * megabytes of weights in an app whose whole point is that it works offline
 * with no network permission at all.
 *
 * What it does instead is exploit the one thing reliably true of a booth
 * photograph: the face is the subject, the subject is nearer the light than
 * the background, and on thermal paper the part that fails is whatever sits
 * in local shadow — cheeks, eye sockets, the underside of a chin — which
 * fills in solid black and takes the features with it. Lifting by *local*
 * average rather than a global curve raises exactly those regions without
 * flattening the rest of the sheet, and the headroom term stops highlights
 * from washing out.
 *
 * Returns the local mean map, because the adaptive dither wants it too and
 * computing it twice would be waste.
 */
function liftShadows(lum, W, H, amount){
  const radius = Math.max(8, Math.round(Math.min(W, H) / 12));
  const mean = localMean(lum, W, H, radius);
  if (amount > 0) {
    for (let i = 0; i < lum.length; i++) {
      // How deeply this neighbourhood sits in shadow. Zero once the
      // surroundings reach mid-grey, so lit areas are untouched.
      const shade = mean[i] >= 140 ? 0 : (140 - mean[i]) / 140;
      if (shade === 0) continue;
      // How much room is left before white. Protects highlights.
      const head = lum[i] >= 235 ? 0 : (235 - lum[i]) / 235;
      const v = lum[i] + amount * 55 * shade * head;
      lum[i] = v > 255 ? 255 : v;
    }
  }
  return mean;
}

/* Unsharp mask in place: out = in + amount * (in - blur).
 *
 * Runs AFTER the photograph has been resized to the dots that will burn, so
 * the edges it builds are edges the head can actually place. Sharpening
 * before a resize spends the work on detail the resampler then averages away,
 * and sharpening after a dither sharpens dot noise rather than the picture.
 *
 * RADIUS. The blur is a 3x3 box, whose own radius is 1 px. A radius below 1
 * is reached by mixing that blur back toward the original — a blur of radius
 * r is approximated as lum + (box - lum) * r — which is exact at r = 1 and a
 * good approximation below it, and is the range that matters at 203 dpi,
 * where 0.7-1.0 px is about one printed dot. Above 1 the box is applied
 * repeatedly, once per whole pixel of radius, which widens it the way
 * successive box passes approximate a gaussian.
 *
 * Cheap, and at this resolution indistinguishable from anything more
 * principled: a dot is either burned or not, so a halo finer than a dot
 * cannot be printed.
 */
function boxBlurPlane(lum, W, H, out){
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          sum += lum[yy * W + xx]; n++;
        }
      }
      out[y * W + x] = sum / n;
    }
  }
  return out;
}

function sharpenImage(lum, W, H, amount, radius){
  if (!(amount > 0)) return lum;
  const r = radius === undefined ? 1 : Math.max(0.1, Math.min(4, radius));
  let blur = boxBlurPlane(lum, W, H, new Float32Array(lum.length));
  // Whole pixels of radius beyond the first: another box pass each.
  for (let pass = 1; pass < Math.floor(r); pass++) {
    blur = boxBlurPlane(blur, W, H, new Float32Array(lum.length));
  }
  // The fractional remainder, as a partial mix toward the blurred plane.
  const frac = r < 1 ? r : r - Math.floor(r);
  if (frac > 0 && r < 1) {
    for (let i = 0; i < blur.length; i++) blur[i] = lum[i] + (blur[i] - lum[i]) * frac;
  } else if (frac > 0) {
    const wider = boxBlurPlane(blur, W, H, new Float32Array(lum.length));
    for (let i = 0; i < blur.length; i++) blur[i] = blur[i] + (wider[i] - blur[i]) * frac;
  }
  for (let i = 0; i < lum.length; i++) {
    lum[i] = lum[i] + amount * (lum[i] - blur[i]);
  }
  return lum;
}

/* Floyd-Steinberg, scanned boustrophedon - left to right, then right to
 * left. Always scanning the same way walks the error across the page and
 * leaves a visible diagonal grain; alternating cancels it. */
function applyFloydSteinbergDithering(lum, W, H){
  for (let y = 0; y < H; y++) {
    const ltr = (y & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      const idx = y * W + x;
      const was = lum[idx];
      const now = was < 128 ? 0 : 255;
      lum[idx] = now;
      const err = was - now;
      if (err === 0) continue;            // pure black and white cost nothing
      const fwd = ltr ? 1 : -1;
      const hasNext = ltr ? x + 1 < W : x - 1 >= 0;
      const hasPrev = ltr ? x - 1 >= 0 : x + 1 < W;
      if (hasNext) lum[idx + fwd] += err * 0.4375;            // 7/16
      if (y + 1 < H) {
        if (hasPrev) lum[idx + W - fwd] += err * 0.1875;      // 3/16
        lum[idx + W] += err * 0.3125;                          // 5/16
        if (hasNext) lum[idx + W + fwd] += err * 0.0625;      // 1/16
      }
    }
  }
}

/* Error diffusion against a threshold that follows the local average.
 *
 * Plain Floyd-Steinberg decides every dot against the same mid-grey. That is
 * right for an evenly lit picture and wrong for a booth, where one region of
 * the sheet can sit well below the threshold and another well above: the dark
 * region has every dot fall the same way and goes solid, and detail inside it
 * is lost no matter how much error is diffused.
 *
 * Letting the threshold drift toward the neighbourhood's own average means a
 * dark region is judged against dark, so its internal structure survives. The
 * drift is partial — a fraction of the way, not all of it — because a
 * threshold that tracked the local mean exactly would reproduce only edges
 * and throw away the tone itself. It is clamped so no region can end up
 * deciding everything one way.
 */
function applyAdaptiveDithering(lum, W, H, mean, strength){
  const k = strength === undefined ? 0.55 : strength;
  for (let y = 0; y < H; y++) {
    const ltr = (y & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      const idx = y * W + x;
      let t = 128 + (mean[idx] - 128) * k;
      if (t < 64) t = 64; else if (t > 196) t = 196;
      const was = lum[idx];
      const now = was < t ? 0 : 255;
      lum[idx] = now;
      const err = was - now;
      if (err === 0) continue;
      const fwd = ltr ? 1 : -1;
      const hasNext = ltr ? x + 1 < W : x - 1 >= 0;
      const hasPrev = ltr ? x - 1 >= 0 : x + 1 < W;
      if (hasNext) lum[idx + fwd] += err * 0.4375;
      if (y + 1 < H) {
        if (hasPrev) lum[idx + W - fwd] += err * 0.1875;
        lum[idx + W] += err * 0.3125;
        if (hasNext) lum[idx + W + fwd] += err * 0.0625;
      }
    }
  }
}

function applyOrderedDithering(lum, W, H){
  for (let y = 0; y < H; y++) {
    const rowScreen = BAYER4[y & 3];
    for (let x = 0; x < W; x++) {
      const t = (rowScreen[x & 3] + 0.5) * 16;   // 8 .. 248
      const idx = y * W + x;
      lum[idx] = lum[idx] < t ? 0 : 255;
    }
  }
}


/* Atkinson, as shipped on the original Macintosh.
 *
 * Floyd-Steinberg hands all of its error on to the neighbours. Atkinson hands
 * on six eighths and throws the remaining quarter away, which is the whole
 * point of it: the error that would have pushed a region further in the
 * direction it is already going is discarded, so a dark area cannot snowball
 * into solid black and a light one cannot wash out to white. The cost is
 * flatter midtones and slightly less tonal accuracy; the gain is that faces
 * keep their features at both ends of the scale.
 *
 * That trade is exactly the one a thermal head wants. Heat spreads from each
 * burned dot into the paper around it, so a print always comes out heavier
 * than the pixels say. A diffusion that refuses to accumulate error is
 * therefore closer to what the paper does than one that conserves it, which
 * is why this is the default for portraits here and Floyd-Steinberg is not.
 *
 * Scanned boustrophedon, like the others: always scanning the same way walks
 * the residual error across the page and leaves a visible diagonal grain,
 * and alternating cancels it.
 */
function applyAtkinsonDithering(lum, W, H){
  const EIGHTH = 1 / 8;
  for (let y = 0; y < H; y++) {
    const ltr = (y & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      const idx = y * W + x;
      const was = lum[idx];
      const now = was < 128 ? 0 : 255;
      lum[idx] = now;
      const err = (was - now) * EIGHTH;      // one eighth, six times over
      if (err === 0) continue;
      const fwd = ltr ? 1 : -1;
      const x1 = x + fwd, x2 = x + fwd * 2;
      const in1 = x1 >= 0 && x1 < W, in2 = x2 >= 0 && x2 < W;
      if (in1) lum[idx + fwd] += err;
      if (in2) lum[idx + fwd * 2] += err;
      if (y + 1 < H) {
        const back = x - fwd;
        if (back >= 0 && back < W) lum[idx + W - fwd] += err;
        lum[idx + W] += err;
        if (in1) lum[idx + W + fwd] += err;
      }
      if (y + 2 < H) lum[idx + 2 * W] += err;
      // The remaining 2/8 is deliberately dropped. See above.
    }
  }
  return lum;
}

/* A hard threshold: every tone above the level burns white, everything below
 * burns black.
 *
 * This is what a printer's own driver generally does, and it is in here for
 * two honest reasons rather than as a portrait mode. It is right for line art
 * — a logo, a barcode, a QR code, a scan of a signature — where there are no
 * midtones to lose and a dither only adds noise. And it is the control in the
 * calibration sheet: printing a face this way next to a dithered one shows at
 * a glance what the dithering is buying.
 *
 * On a face it is the wrong answer. A portrait becomes two flat shapes with
 * the features falling on whichever side of the level they happen to sit, and
 * no amount of brightness or contrast puts them back.
 */
function applyThreshold(lum, W, H, level){
  const t = level === undefined ? 128 : level;
  for (let i = 0; i < lum.length; i++) lum[i] = lum[i] < t ? 0 : 255;
  return lum;
}

/* ==================================================================== *
 * Tone, as separate steps
 *
 * Brightness, contrast and gamma are three different things and are kept as
 * three functions because they fail in three different ways, and an operator
 * calibrating a printer needs to be able to tell which one they are fighting.
 *
 *   BRIGHTNESS adds a constant. It moves everything, including black and
 *   white, so pushed hard it flattens the ends of the scale into nothing.
 *   Right for "the whole print is too dark".
 *
 *   CONTRAST scales around mid-grey. It pulls the ends apart and clips both
 *   of them. Right for "it looks grey and flat", wrong when faces are
 *   already filling in.
 *
 *   GAMMA is a curve, not a line: it moves the midtones and leaves pure
 *   black and pure white where they are. That is what makes it the right
 *   control for a thermal head, because the thing going wrong on thermal
 *   paper is almost always the midtones — heat spreading around each dot
 *   darkens them — and gamma is the only one of the three that can lift
 *   them without also lifting the blacks or crushing the whites.
 * ==================================================================== */

/* WHERE THE CLAMPING IS, AND WHY IT IS ONLY THERE.
 *
 * The plane is float, and contrast is the one step that routinely puts values
 * outside 0-255: a contrast of 1.35 maps 0 to -45. Clamping that immediately
 * would throw the headroom away, and the next step is often the one that
 * would have used it — a brightness of +15 after a contrast of 1.35 should
 * leave the bottom of the scale at -30, which is still black, rather than at
 * +15, which is not. So contrast does not clamp, brightness does, and the
 * order is contrast then brightness.
 *
 * That order is also what makes BRIGHTNESS mean what the label says. Applied
 * the other way round, contrast multiplies the brightness offset too, so
 * "+15" would become +20 at a contrast of 1.35 and the two controls would
 * fight. Here it is a literal number of levels.
 */
function adjustBrightness(lum, amount){
  if (!amount) {
    // Still clamps: contrast above leaves the plane out of range on purpose,
    // and this is the step that closes it.
    for (let i = 0; i < lum.length; i++) {
      const v = lum[i];
      if (v < 0) lum[i] = 0; else if (v > 255) lum[i] = 255;
    }
    return lum;
  }
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i] + amount;
    lum[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return lum;
}

function adjustContrast(lum, k){
  if (k === undefined || k === 1) return lum;
  for (let i = 0; i < lum.length; i++) lum[i] = (lum[i] - 128) * k + 128;
  return lum;                                // deliberately unclamped
}

/* Gamma, applied as out = 255 * (in/255) ^ (1/g).
 *
 * So g > 1 lifts the midtones and g < 1 deepens them, which is the way round
 * people expect from a photographic gamma control. A 256-entry lookup table
 * rather than a pow() per pixel: there are only 256 possible inputs, and on a
 * 576 x 2400 receipt that is the difference between one million pow() calls
 * and two hundred and fifty-six.
 */
function adjustGamma(lum, g){
  if (!g || g === 1) return lum;
  const inv = 1 / g;
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, inv);
  for (let i = 0; i < lum.length; i++) {
    let v = lum[i];
    if (v <= 0) { lum[i] = 0; continue; }
    if (v >= 255) { lum[i] = 255; continue; }
    // Linear interpolation between table entries, because the plane holds
    // fractional values by this point and rounding to the table would
    // quantise the tone before the dither gets to it.
    const i0 = v | 0, f = v - i0;
    lum[i] = lut[i0] + (lut[i0 + 1] - lut[i0]) * f;
  }
  return lum;
}

/* Noise reduction, before the tone work and before the dither.
 *
 * Why it is optional and off by default: a booth photograph from a decent
 * webcam in a lit room has very little noise, and smoothing a clean frame
 * costs eyelashes and hair texture — the first things to go and the ones a
 * portrait is judged on. It earns its place only in a dim venue, where the
 * camera has pushed its gain up and the sensor grain is coarse enough that
 * the dither turns every grain into a burned dot. There it is the difference
 * between skin and sandpaper.
 *
 * A 3x3 median rather than a blur: a median removes isolated speckles
 * outright while leaving an edge exactly where it was, which is what
 * separates it from any averaging filter and why it does not soften the
 * picture the way a blur of the same radius would. `amount` mixes the median
 * back toward the original, so 0.3 is "take the edge off the grain" and 1.0
 * is the full median.
 *
 * Sorting nine values with a network of swaps rather than Array.sort: this
 * runs once per pixel over a million pixels, and the allocation alone would
 * dominate.
 */
function reduceNoise(lum, W, H, amount){
  if (!(amount > 0)) return lum;
  const mix = Math.min(1, amount);
  const out = new Float32Array(lum.length);
  const w = new Float32Array(9);
  const sw = (a, b) => { if (w[a] > w[b]) { const t = w[a]; w[a] = w[b]; w[b] = t; } };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { out[idx] = lum[idx]; continue; }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) w[n++] = lum[idx + dy * W + dx];
      // A 19-comparator sorting network; only the median (index 4) is needed,
      // so the tail that would finish the sort is left off.
      sw(0,1); sw(3,4); sw(6,7); sw(1,2); sw(4,5); sw(7,8);
      sw(0,1); sw(3,4); sw(6,7); sw(0,3); sw(3,6); sw(0,3);
      sw(1,4); sw(4,7); sw(1,4); sw(2,5); sw(5,8); sw(2,5);
      sw(1,3); sw(5,7); sw(2,6); sw(4,6); sw(2,4); sw(2,3); sw(4,6);
      out[idx] = lum[idx] + (w[4] - lum[idx]) * mix;
    }
  }
  lum.set(out);
  return lum;
}

/* ==================================================================== *
 * Canvas <-> plane
 *
 * Everything above works on a Float32Array of one channel. These two move
 * between that and a canvas. Float rather than Uint8 throughout, because
 * every diffusion dither pushes fractional error into pixels it has not
 * decided yet, and rounding that error at each step is how a dither acquires
 * banding.
 * ==================================================================== */

/// Luminance greyscale: one channel, weighted the way the eye weights it.
function convertToGrayscale(canvas){
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    lum[p] = LUMA_R * d[i] + LUMA_G * d[i + 1] + LUMA_B * d[i + 2];
  }
  return {lum: lum, W: W, H: H, image: img};
}

/// Write a plane back over a canvas as grey, in place.
function planeToCanvas(lum, W, H, canvas, image){
  const g = canvas.getContext('2d');
  const img = image || g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = lum[p];
    if (v < 0) v = 0; else if (v > 255) v = 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/* Take a frame from a live source at its own resolution.
 *
 * No scaling here on purpose. Whatever the camera is giving is what gets
 * copied, because this is the one point in the pipeline where the picture is
 * at full resolution and still continuous tone, and every later step can only
 * throw information away. Drawing straight from the video element to a canvas
 * also means the frame is never encoded on the way: a JPEG here, decoded and
 * re-encoded later, would put ringing into exactly the fine detail the dither
 * then has to resolve.
 */
function captureImage(source, w, h){
  const W = w || source.naturalWidth || source.videoWidth || source.width;
  const H = h || source.naturalHeight || source.videoHeight || source.height;
  if (!W || !H) return null;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  try { c.getContext('2d').drawImage(source, 0, 0, W, H); }
  catch { return null; }                     // a frame that is not yet decodable
  return c;
}

/* Crop to a target shape.
 *
 * `mode` decides what gets kept when the frame and the slot disagree:
 *
 *   'face'   the default, and the one worth explaining. A centred crop of a
 *            booth photograph cuts the top of the head off, because a person
 *            standing in front of a camera is not centred in the frame —
 *            their head is in the upper half and the lower half is torso and
 *            table. Biasing the window upward, to 38% rather than 50% of the
 *            overcut, keeps hair and forehead in and loses the table instead.
 *   'centre' a plain centred crop.
 *   'top'    flush with the top edge.
 *
 * Returns a new canvas; the frame handed in is not touched, so the original
 * capture stays available for a retake, for the digital copy, and for the
 * side-by-side preview.
 */
function cropPortrait(canvas, aspect, mode){
  const W = canvas.width, H = canvas.height;
  if (!W || !H || !aspect) return canvas;
  const want = aspect, have = W / H;
  let sw = W, sh = H, sx = 0, sy = 0;
  if (have > want) {                          // too wide: trim the sides
    sw = Math.round(H * want);
    sx = Math.round((W - sw) / 2);
  } else if (have < want) {                   // too tall: trim top and bottom
    sh = Math.round(W / want);
    const over = H - sh;
    sy = mode === 'top' ? 0 : mode === 'centre' ? Math.round(over / 2)
                                                : Math.round(over * 0.38);
  } else {
    return canvas;
  }
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;            // a crop must not resample
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

/* Resize to the dots the head will actually burn.
 *
 * Done in halving steps when the reduction is large. The browser's resampler
 * is a single bilinear pass whatever `imageSmoothingQuality` says, and one
 * bilinear pass from 1920 wide to 576 reads only 2 of every 3.3 source
 * pixels — so fine detail does not get averaged, it gets skipped, and what
 * survives is aliased. Halving repeatedly means every source pixel is read,
 * which is what a proper box filter would do and costs a few milliseconds.
 *
 * `maxHeight` is the long-receipt guard. A roll has no page length, so a tall
 * sheet is legal; a sheet taller than the printer's own buffer is not, and
 * some printers answer that by truncating silently. Scaled down to fit rather
 * than cropped, because losing the footer is worse than a slightly smaller
 * print, and the caller is told what happened.
 */
function resizeForPrinter(canvas, widthDots, maxHeight){
  const W = canvas.width, H = canvas.height;
  if (!W || !H || !widthDots) return {canvas: canvas, scaled: false, clamped: false};

  let tw = Math.max(1, Math.round(widthDots));
  let th = Math.max(1, Math.round(H * (tw / W)));
  let clamped = false;
  if (maxHeight && th > maxHeight) {
    th = Math.max(1, Math.round(maxHeight));
    tw = Math.max(1, Math.round(W * (th / H)));
    clamped = true;
  }
  if (tw === W && th === H) return {canvas: canvas, scaled: false, clamped: false};

  let src = canvas, sw = W, sh = H;
  // Halve while more than one halving still fits, then one final pass.
  while (sw >= tw * 2 && sh >= th * 2 && sw > 2 && sh > 2) {
    const hw = Math.max(tw, sw >> 1), hh = Math.max(th, sh >> 1);
    const step = document.createElement('canvas');
    step.width = hw; step.height = hh;
    const sg = step.getContext('2d');
    sg.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in sg) sg.imageSmoothingQuality = 'high';
    sg.drawImage(src, 0, 0, sw, sh, 0, 0, hw, hh);
    src = step; sw = hw; sh = hh;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, sw, sh, 0, 0, tw, th);
  return {canvas: out, scaled: true, clamped: clamped, width: tw, height: th};
}

/* ==================================================================== *
 * The pipeline, as one callable
 *
 * `processForPrint` is the tone-and-dither tail: everything from a drawn,
 * already-resized sheet to one bit. It is what `thermalize` in booth.js
 * calls, and what the calibration panel calls with six different sets of
 * options to build its test sheet — which is the point of having it here as
 * a function of its options rather than of the live settings.
 * ==================================================================== */
const DITHER_MODES = ['atkinson', 'adaptive', 'floyd', 'ordered', 'threshold', 'none'];

function processForPrint(canvas, o){
  o = o || {};
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return canvas;

  const grey = convertToGrayscale(canvas);
  const lum = grey.lum;

  /* Order: noise -> contrast -> brightness -> gamma -> lift -> sharpen -> dither.
   *
   * Noise first because every later step amplifies grain, and a median run
   * after a contrast boost is removing speckles the contrast just made worse
   * rather than the ones the sensor produced.
   *
   * Contrast before brightness, and brightness is what closes the range: see
   * the note above adjustBrightness. Gamma after both, because it is the
   * midtone curve and the midtones are not settled until the linear work is
   * done — and because it needs its input inside 0-255. */
  if (o.denoise > 0) reduceNoise(lum, W, H, o.denoise);
  if (o.contrast !== undefined && o.contrast !== 1) adjustContrast(lum, o.contrast);
  adjustBrightness(lum, o.brightness || 0);
  if (o.gamma && o.gamma !== 1) adjustGamma(lum, o.gamma);

  // Also returns the local average map, which the adaptive dither wants and
  // which would otherwise be computed twice.
  const mean = liftShadows(lum, W, H, o.faceLift || 0);
  if (o.sharpen > 0) sharpenImage(lum, W, H, o.sharpen, o.sharpenRadius);

  const mode = o.dither || 'atkinson';
  if (mode === 'atkinson') applyAtkinsonDithering(lum, W, H);
  else if (mode === 'floyd') applyFloydSteinbergDithering(lum, W, H);
  else if (mode === 'ordered') applyOrderedDithering(lum, W, H);
  else if (mode === 'threshold') applyThreshold(lum, W, H, o.threshold);
  else if (mode === 'adaptive') applyAdaptiveDithering(lum, W, H, mean);
  // 'none' leaves 8-bit grey for the driver to halftone. See the note in
  // Admin: most drivers simply threshold it.

  /* Invert last of all, and only here.
   *
   * It is a transport fix, not a look: a few printers read a 1 bit as "do not
   * burn". Inverting before the dither would be a different picture
   * altogether — the diffusion would be solving for a negative — whereas
   * inverting a finished one-bit field just swaps which dots fire, which is
   * exactly what the wrong-polarity printer needs.
   */
  if (o.invert) for (let i = 0; i < lum.length; i++) lum[i] = 255 - lum[i];

  return planeToCanvas(lum, W, H, canvas, grey.image);
}

/* Original against processed, at the true output aspect.
 *
 * Both halves are drawn at the same pixel size and the same shape as the
 * print, because a preview at a different aspect ratio or a different scale
 * answers a question nobody asked: a dither looks fine at any size except
 * its own. The processed half is NOT resampled — it is drawn at 1:1 into a
 * box of its own size, and the box is what the CSS then fits on screen — so
 * what is on the left is the frame as the camera gave it and what is on the
 * right is the actual dots.
 *
 * Returns the two canvases rather than one composite, so a caller can put
 * them side by side, over and under, or in a slider without this function
 * having an opinion about the layout.
 */
function generatePrintPreview(source, o){
  o = o || {};
  const widthDots = o.widthDots || source.width;
  const aspect = o.aspect || (source.width / source.height);

  const cropped = o.crop === false ? source
                                   : cropPortrait(source, aspect, o.cropMode || 'face');
  const sized = resizeForPrinter(cropped, widthDots, o.maxHeight);

  // The left half: the same crop and the same size, no tone work and no
  // dither. Same geometry, so the only difference between the two halves is
  // the processing itself.
  const original = document.createElement('canvas');
  original.width = sized.canvas.width; original.height = sized.canvas.height;
  const og = original.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.drawImage(sized.canvas, 0, 0);

  // The right half: a copy, so the pipeline can work in place without
  // destroying the left.
  const processed = document.createElement('canvas');
  processed.width = sized.canvas.width; processed.height = sized.canvas.height;
  const pg = processed.getContext('2d');
  pg.imageSmoothingEnabled = false;
  pg.drawImage(sized.canvas, 0, 0);
  processForPrint(processed, o);

  return {original: original, processed: processed,
          width: sized.canvas.width, height: sized.canvas.height,
          clamped: !!sized.clamped};
}

/* Older names, kept so nothing that already called them had to change. The
 * booth and its tests reach several of these by name. */
const unsharp = (lum, W, H, amount) => sharpenImage(lum, W, H, amount, 1);
const ditherFloyd = applyFloydSteinbergDithering;
const ditherAdaptive = applyAdaptiveDithering;
const ditherOrdered = applyOrderedDithering;

/* The module, for anything that would rather not reach through the global
 * scope — the calibration panel, a test, a future Worker. */
window.SnapBoxImaging = {
  captureImage, cropPortrait, convertToGrayscale, planeToCanvas,
  adjustBrightness, adjustContrast, adjustGamma, reduceNoise,
  resizeForPrinter, sharpenImage, liftShadows, localMean,
  applyAtkinsonDithering, applyFloydSteinbergDithering,
  applyAdaptiveDithering, applyOrderedDithering, applyThreshold,
  processForPrint, generatePrintPreview,
  DITHER_MODES, LUMA: {r: LUMA_R, g: LUMA_G, b: LUMA_B},
};
