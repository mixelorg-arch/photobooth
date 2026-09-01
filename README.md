# Photobooth — browser build

The same booth as the iPad app, running in a browser so it can be tested on
the MacBook without Xcode. Same flow, same layouts, same composition maths,
same look — `booth.js` ports `PhotoLayoutRenderer.swift` and
`SessionState.swift` directly, `booth.css` is `Panel/` in CSS, and the 5x7
bitmap font's glyph table is shared verbatim between the two.

Three files, no dependencies, no build step.

## Running it

**It has to be served over `http://localhost` or HTTPS.** Browsers only give a
page the camera in a secure context, and `file://` is not one — double-clicking
`index.html` gets you the booth with a dead camera.

```bash
python3 -m http.server 8815 --directory PhotoboothiPad/web
```

Then open <http://localhost:8815> and allow the camera when asked.

There is also a `photobooth-web` entry in `.claude/launch.json`.

## Installing it on an iPhone or iPad

The app installs to the Home Screen and launches full screen, with no Safari
chrome and no address bar.

1. Open the hosted HTTPS address in **Safari** (not Chrome — only Safari can
   add to the Home Screen on iOS).
2. **Share → Add to Home Screen → Add.**
3. Launch it from the Home Screen icon.

Two things that only work from the Home Screen icon: full screen, and the
screen staying awake mid-countdown.

**It must be HTTPS.** `http://192.168.x.x` from your laptop will not do —
Safari refuses the camera outside a secure context, so the booth would launch
with a dead preview. Host it (see below) or use localhost.

**Offline.** A service worker caches the whole app on first load, so once it
has been opened on the device it keeps working with no network at all — which
is the normal case at a venue. Bump `CACHE` in `sw.js` on every deploy or the
Home Screen icon will keep serving the old build.

**Lock it down** with Settings → Accessibility → **Guided Access**, then
triple-click the side button on the attract screen.

## Hosting

**GitHub Pages.** Free, HTTPS, and it serves a folder of static files — which
is exactly what this is. From the project root:

```bash
./publish.sh
```

That pushes `web/` to a `gh-pages` branch; set Settings → Pages → branch
`gh-pages`, folder `/ (root)`. The repository has to be **public** — Pages on
a private repository needs a paid plan. Full steps are in the script's header.

**Not Cloudinary.** It is a media CDN: it stores and transforms images and
video, and serves them from per-asset URLs. It has no concept of a site root,
so `index.html` would have no stable address, relative links to `booth.css`
and `booth.js` would not resolve, and a service worker cannot take a scope
there — which kills both the offline cache and the Home Screen install. Use it
for the photos if you ever add uploads; not for the app.

## Using it

| | |
|---|---|
| Start | click anywhere on the attract screen, or press **Space** |
| Redo one photo | on the review screen, **tap the photo** — tap again to unmark |
| Leave a session | the **✕** in any title bar, or **Esc** |
| Operator console | **three clicks in the top-left corner**, or **Shift+A** — passcode `1234` |
| Full screen | **⌃⌘F** (Safari) / **⌘⇧F** (Chrome) for the real kiosk look |

## Printing silently

**On a Mac, in Chrome.** Press PRINT and paper comes out, no dialog.

**Not on an iPhone or iPad.** iOS Safari always raises the AirPrint sheet and
has no kiosk-printing flag — there is no way for a web page to print silently
there, and no workaround exists. On an iPad the guest picks the printer from
the sheet each time. If silent printing on the iPad matters more than avoiding
Xcode, the native build is the only way to get it.

**There is no web API for that.** `window.print()` always raises the system
print dialog and no page can suppress it — that is a deliberate browser
boundary, not something to work around. The one real exception is Chrome's
`--kiosk-printing` flag, which sends every print job straight to the default
printer with no window at all.

```bash
./kiosk-chrome.sh
```

That relaunches Chrome in kiosk + kiosk-printing mode on a throwaway profile,
so the flags never touch your normal browsing. Before an event:

1. **System Settings › Printers & Scanners** — make the SELPHY CP1500 the
   **default** printer.
2. Set its paper to the **borderless 4×6** postcard media. Chrome will not
   ask, so whatever is set there is what prints.
3. **Quit Chrome completely** first — a running instance ignores the flag.

Safari has no equivalent and will always show the dialog. Use Chrome for the
booth.

Run without the flag and the dialog appears, which is fine for testing. The
operator console shows **PRINT MODE: SILENT / DIALOG** so you find out before
the party, not during it.

The page box is set to the media size either way
(`@page { size: 4in 6in; margin: 0 }`), so the sheet prints at true size.
Copies are sent as N identical pages rather than as a copy count, the same way
the iPad build sends N `printingItems` — it is the only way to be sure the
number survives whatever the printer defaults to.

**SAVE PNG** writes the composed 1200×1800 sheet to Downloads, which is the
quickest way to check a layout without spending dye-sub paper.

`US Letter` is in the paper list for exactly that: proofing on plain paper.

## What is different from the iPad build

- **Printing** goes through the system dialog instead of AirPrint, so there is
  no remembered printer and no borderless flag set from code.
- **No Bluetooth thermal path.** A browser has no ESC/POS route worth having.
- **No kiosk lock.** Guided Access has no browser equivalent; full screen is
  as far as it goes.
- Photos live in the tab and are dropped when the session ends — nothing is
  written to disk unless you press SAVE PNG.

Everything else — the layout engine, the 2:3 cell rule, the framing guide, the
countdown, the branding footer, the idle reset, the settings — behaves the
same, and settings persist in `localStorage` under `photobooth.settings.v1`.

## Verified

Walked in a browser: attract → layout → review → copies → confirm → print →
thank you, plus the operator console. The print path was checked with the
dialog stubbed: 3 copies produced 3 pages, every page decoded at the full
1200 px sheet width, with `@page{size:4in 6in;margin:0}`. All three layouts
render against all four paper sizes without error.

The **camera path could not be exercised** — the tool browser blocks device
capture. Countdown, capture and the flash are wired the same way as the rest,
but they are the one part that has only been read, not run.
