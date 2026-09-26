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

## Camera permission on an iPad

**No web page can grant itself a camera.** That is a browser boundary, not a
gap to code around, and it holds on every platform. What the booth controls is
how often it *asks*.

iOS does not remember the answer for a Home Screen web app. The decision is
thrown away when the app closes and asked for again the next time anything
calls `getUserMedia` — see [WebKit
215884](https://bugs.webkit.org/show_bug.cgi?id=215884). Releasing the camera
at the end of a session therefore puts a permission prompt in front of **every
guest**, which is what used to happen here.

So on iPadOS the booth takes the camera once, at launch, and never lets go:

* The request happens seconds after the icon is tapped, so the prompt lands on
  whoever is setting the booth up rather than on the first guest in the queue.
* A session ending no longer releases the camera, and neither does a USB device
  being plugged in. Measured over ten consecutive sessions: **one request at
  launch, none seen by a guest.** The same ten sessions ask ten times on every
  other platform, which is the behaviour that already shipped there and is left
  alone — a WebView and a desktop browser both remember the grant, so holding a
  lens open between guests would cost a live camera and buy nothing.
* Coming back from the background retakes it. iOS ends the tracks of a
  backgrounded web app, and an ended track is not an error — it is a black
  preview and a countdown that photographs nothing.
* **Do not close the app between guests.** Closing it is the one thing that
  brings the prompt back.

**Admin → CAMERA → ACCESS** reads `HELD FOR THIS LAUNCH` once the answer is in.
That is the state to leave the booth in before the doors open. If it reads
`NOT GRANTED YET`, press LOOK AGAIN and answer the prompt.

**To be rid of the prompt entirely**, run the booth in Safari rather than from
the Home Screen and set **Settings → Safari → Camera → Allow**. Safari
remembers that; a Home Screen app cannot. The cost is the address bar, and
losing the full-screen launch and the screen-stays-awake behaviour. For a
kiosk iPad that does nothing else it is a reasonable trade; for a shared iPad
it is not, because it grants the camera to every site.

## A USB camera on an iPad

iPadOS shares USB Video Class cameras with web pages — Safari's `getUserMedia`
can open one — so an iPad with a USB-C port is the one browser platform where
a plugged-in camera works with no native app at all. It needs iPadOS 17 or
later. This is the opposite of Android, where the external-camera driver is
optional and many tablets (the Huawei MatePad SE among them) show the camera
on the USB bus and then never hand it to any app.

**The Kodak Charmera specifically.**

1. **Take the memory card out.** With a card in, it mounts as a drive and no
   app anywhere can take a preview from it. No card is what puts it into
   webcam mode. This is the usual reason it does not appear.
2. **Use a USB-C-to-USB-C cable.** The one in the box is USB-C-to-USB-A and
   needs an adapter before it reaches an iPad. Get a long one — a 20 cm cable
   cannot reach where guests stand.
3. Open **Admin → CAMERA → LOOK AGAIN**, and allow the camera when Safari
   asks. Safari hides camera names, and on iPadOS will not list a USB camera
   at all, until the page has been granted the camera once; it also does not
   reliably notice a camera being plugged in afterwards. LOOK AGAIN is what
   covers both.

**Reading the CAMERA rows when it will not appear.** `SEEN` lists every camera
the page can find, named exactly as Safari names it. `FEED` is the size of the
picture actually arriving — the Charmera is a VGA-class webcam, so `640x480`
on an iPad whose own lens does 1080p is the plainest confirmation that the
right camera is in use, whatever the label says. If `SEEN` shows only Front
and Back Camera, work through the three steps above; if it still will not
appear, open FaceTime and see whether that finds it. If FaceTime cannot
either, it is the camera or the cable, not the booth.

AUTO picks a plugged-in camera over the built-in lens by name. On iPadOS the
rule is stronger than the keyword list used elsewhere: iPadOS names its own
lenses Front Camera, Back Camera and Desk View Camera and nothing else, so
anything left over is something plugged in — which catches USB cameras whose
product name says nothing about being a webcam. Pin one explicitly under
Admin → CAMERA → DEVICE if AUTO ever guesses wrong.

**What it will look like.** The Charmera is a keychain camera with a tiny
sensor and its webcam mode is VGA-class. On 58 mm and 80 mm thermal that costs
nothing — the paper is 384 and 576 dots wide and dithered to one bit — but on
a 4x6 SELPHY print it will be visibly soft. That is the camera, not the booth.

## Hosting

Live at **<https://mixelorg-arch.github.io/photobooth/>**.

From the project root, one command deploys everything:

```bash
./publish.sh                 # or: ./publish.sh "what changed"
```

It bumps the service-worker cache version, commits, pushes `main`, and pushes
`web/` to the `gh-pages` branch as its root.

**The cache bump is the important part.** The worker serves cache-first, so
without a new cache name every Home Screen icon keeps running the old build
forever — you deploy and nothing changes. `publish.sh` handles it; if you ever
push by hand, edit `CACHE` in `sw.js` first.

**The worker does not register on localhost**, for exactly that reason — a
cache-first worker hands back the last build and every edit looks like it did
nothing. It unregisters anything an earlier visit left behind, too. To test the
offline path on purpose, load `http://localhost:8815/?sw=1`.

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

The countdown runs *on* the live preview — a small boxed numeral in the
top-right corner, out of where a face sits, with a bar along the bottom edge.
People need to see themselves while they pose, which a full-screen countdown
dialog made impossible.
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

Printing on iPadOS also takes a different route inside the app. Every other
browser prints from a hidden iframe, which keeps the job out of the visible
page; Safari on iOS and iPadOS ignores `print()` called on an iframe entirely
and only prints the top-level window. So on an iPad the sheet is placed in the
page itself, in a block that is hidden on screen and is the only thing visible
on paper. The page rules are the same either way, so the paper is the same.

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

**The 80mm receipt** prints through the same path with
`@page{size:80mm auto;margin:0}` and the image at `72mm` wide, height auto —
a roll feeds as far as the receipt is long rather than to a page height. The
sheet is sent as PNG rather than JPEG for that paper: JPEG ringing around a
QR's finder patterns is exactly what stops a phone reading it.

The **camera path could not be exercised** — the tool browser blocks device
capture. Countdown, capture and the flash are wired the same way as the rest,
but they are the one part that has only been read, not run.
