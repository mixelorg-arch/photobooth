/* Generates the AR marker and its ARToolKit pattern file.
 *
 * Run with:  node make-marker.js
 *
 * Why a designed marker and not the photograph: AR tracking wants rich,
 * stable, high-contrast features. A one-bit dithered thermal print is a field
 * of noise — the detector finds thousands of "corners" in the dot pattern and
 * they move with print darkness, paper batch and lighting. The same print
 * that blobbed a face reproduced text and rules perfectly, which is the clue:
 * this printer is excellent at solid black shapes. So the marker is solid
 * black shapes, and the photograph is left to be a photograph.
 *
 * ARToolKit's layout: the marker is a square, the outer 25% on each side is
 * solid black border, and the middle 50% carries the pattern. The .patt file
 * is that middle square sampled at 16x16, written out four times, once per
 * rotation, as three planes of R, G and B.
 */

const fs = require('fs');

/* The pattern, as cells. 1 is ink.
 *
 * Chosen to be strongly asymmetric: ARToolKit decides orientation by which
 * rotation matches best, so a pattern with any rotational symmetry makes the
 * hologram spin between two poses while a hand shakes. Verified below. */
const CELLS = [
  [1,1,1,0,0,0],
  [1,0,0,0,1,0],
  [1,0,1,1,1,0],
  [0,0,1,0,0,0],
  [0,1,1,0,1,1],
  [0,0,0,0,1,1],
];

const N = CELLS.length;
const SAMPLE = 16;                       // what ARToolKit expects

/// The pattern at 16x16, 0 = black, 255 = white.
function sampled(cells){
  const out = [];
  for (let y = 0; y < SAMPLE; y++) {
    const row = [];
    for (let x = 0; x < SAMPLE; x++) {
      const cy = Math.floor(y * N / SAMPLE), cx = Math.floor(x * N / SAMPLE);
      row.push(cells[cy][cx] ? 0 : 255);
    }
    out.push(row);
  }
  return out;
}

const rotate = g => g[0].map((_, x) => g.map(row => row[x]).reverse());

function pattFile(cells){
  let grid = sampled(cells);
  const blocks = [];
  for (let r = 0; r < 4; r++) {
    const planes = [];
    for (let c = 0; c < 3; c++) {
      // Greyscale, so all three planes carry the same values.
      planes.push(grid.map(row => row.map(v => String(v).padStart(3, ' ')).join(' ')).join('\n'));
    }
    blocks.push(planes.join('\n'));
    grid = rotate(grid);
  }
  return blocks.join('\n\n') + '\n';
}

/// The printable marker: black border, pattern inside, quiet white margin.
function markerSVG(cells, px){
  const size = px || 600;
  const quiet = Math.round(size * 0.08);
  const outer = size - quiet * 2;
  const border = Math.round(outer * 0.25);
  const inner = outer - border * 2;
  const cell = inner / N;

  let r = '';
  cells.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return;
    r += `<rect x="${(quiet + border + x * cell).toFixed(2)}" y="${(quiet + border + y * cell).toFixed(2)}" ` +
         `width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
  }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#FFFFFF"/>
<rect x="${quiet}" y="${quiet}" width="${outer}" height="${outer}" fill="#000000"/>
<rect x="${quiet + border}" y="${quiet + border}" width="${inner}" height="${inner}" fill="#FFFFFF"/>
<g fill="#000000">${r}</g>
</svg>
`;
}

// --- a pattern with rotational symmetry would track ambiguously ---
const key = g => g.map(r => r.join('')).join('');
let g = sampled(CELLS), seen = new Set();
for (let i = 0; i < 4; i++) { seen.add(key(g)); g = rotate(g); }
if (seen.size !== 4) {
  console.error('REJECTED: the pattern repeats under rotation (' + seen.size +
                ' distinct of 4). Orientation would flip while tracking.');
  process.exit(1);
}

fs.writeFileSync('marker.patt', pattFile(CELLS));
fs.writeFileSync('marker.svg', markerSVG(CELLS, 600));
fs.writeFileSync('marker-cells.json', JSON.stringify({cells: CELLS}, null, 2));
console.log('marker.patt        ', fs.statSync('marker.patt').size, 'bytes');
console.log('marker.svg         ', fs.statSync('marker.svg').size, 'bytes');
console.log('rotations distinct  4 of 4');
