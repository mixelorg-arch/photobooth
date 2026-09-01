#!/usr/bin/env python3
"""Generate the home-screen icons from the app's own pixel camera glyph.

Drawn rather than exported so the icon cannot drift from the UI: the grid
below is the same one `booth.js` and `PixelIcons.swift` render. Re-run after
changing it.
"""
from PIL import Image, ImageDraw

CAMERA = [
    "................",
    "......KKKK......",
    "....KKWWWWKK....",
    ".KKKKKKKKKKKKKK.",
    ".KWWWKKKKKKWRWK.",
    ".KWKKWWWWWWKKWK.",
    ".KWKWWAAAAWWKWK.",
    ".KWKWAAAAAAWKWK.",
    ".KWKWAAAAAAWKWK.",
    ".KWKWWAAAAWWKWK.",
    ".KWKKWWWWWWKKWK.",
    ".KWWWKKKKKKWWWK.",
    ".KKKKKKKKKKKKKK.",
    "................",
]
INK    = (17, 17, 17, 255)
PAPER  = (255, 255, 255, 255)
ACCENT = (169, 162, 206, 255)      # lavender, the app's own
RED    = (201, 127, 127, 255)
LEGEND = {".": None, "K": INK, "W": PAPER, "A": ACCENT, "R": RED}


def icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), PAPER)
    d = ImageDraw.Draw(img)

    # The heavy black frame the whole design system is built on. A maskable
    # icon loses its corners to the platform's mask, so it skips the frame
    # and just keeps a generous margin.
    if not maskable:
        rule = max(2, round(size * 0.055))
        d.rectangle([0, 0, size - 1, size - 1], outline=INK, width=rule)

    rows, cols = len(CAMERA), max(len(r) for r in CAMERA)
    margin = size * (0.30 if maskable else 0.20)
    cell = (size - margin * 2) / cols
    ox = (size - cell * cols) / 2
    oy = (size - cell * rows) / 2

    for r, line in enumerate(CAMERA):
        for c, ch in enumerate(line):
            fill = LEGEND.get(ch)
            if not fill:
                continue
            x0, y0 = ox + c * cell, oy + r * cell
            d.rectangle([x0, y0, x0 + cell, y0 + cell], fill=fill)
    return img


if __name__ == "__main__":
    made = []
    for size in (180, 192, 512):
        path = "icons/icon-%d.png" % size
        icon(size).save(path)
        made.append(path)
    # Android/Chrome safe-zone variant. iOS ignores it; it costs 6 KB.
    icon(512, maskable=True).save("icons/icon-512-maskable.png")
    made.append("icons/icon-512-maskable.png")
    print("wrote " + ", ".join(made))
