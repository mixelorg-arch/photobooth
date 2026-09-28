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

## Printing to the sticker printer from an iPad

**An iPad cannot print to a USB printer.** Not through a USB-C dock, not
through a hub, not with any app. iPadOS installs no printer drivers and
exposes no USB printer class to apps — unlike cameras, where iPadOS 17 added
UVC support. AirPrint is network-only. This is not a limit of the booth and
there is nothing to code around it.

**The route that does work** is to let a Mac do the driving:

1. Plug the U9 into the Mac by USB and set the queue up as above.
2. On the Mac, turn on printer sharing:

```
sudo cupsctl --share-printers
sudo lpadmin -p _LABEL_9X00 -o printer-is-shared=true
```

   Or System Settings → General → Sharing → **Printer Sharing**, ticking the
   label printer.
3. Put the iPad on the same wifi. macOS advertises a shared CUPS queue over
   Bonjour in a form iPadOS accepts, so the printer appears in the iOS print
   sheet with no app or driver on the iPad.
4. In the booth on the iPad: PAPER = `100 x 150 mm Label`, run a session,
   press PRINT, pick the printer the first time.

To undo the sharing afterwards: `sudo cupsctl --no-share-printers`.

**It will not be silent, and cannot be.** iOS raises its own print sheet on
every print and no app — web or native — can suppress it; even the native
`printToPrinter` API still shows a cancellable dialog. iOS remembers the last
printer, so after the first time it is one tap on Print. A booth that nobody is
minding wants the Mac, where `kiosk-chrome.sh` prints with no window at all.

The trade-off, plainly: the iPad is the better camera (it can drive the
Charmera over USB, which the Mac booth cannot) and the worse printer. The Mac
is the reverse.

## The printer, from the web build

**A web page cannot list printers or connect to one.** There is no API for it
on any platform — `navigator.printing` is a
[WICG proposal](https://github.com/WICG/web-printing), unimplemented
everywhere, and Safari has nothing like it. `window.print()` hands the job to
the operating system and the page never learns what happened to it: not which
printer, not whether it printed, not whether one exists. So the booth cannot
auto-detect or auto-connect to anything, and a status light claiming otherwise
would be a lie.

**Admin → PRINTER** offers what detection would have been *for* instead:

| Row | |
|---|---|
| `ROUTE` | what pressing PRINT will actually do on this device |
| `PAPER` | the paper the sheet will be built for |
| `LAST TEST` | when a test print was last sent, and on what paper |
| `TEST PRINT` | sends one sheet, through exactly the path a guest's print takes |

On an iPad that first test is also the setup step: iOS remembers the last
printer used, so after choosing it once the print sheet comes up with the right
printer already selected and PRINT is a single tap. Do it during setup, not
with a guest waiting.

The test deliberately uses the real renderer, the real thermal pipeline and the
real page CSS rather than a simplified pattern — a test that takes a shortcut
only proves the shortcut works. It does not advance the sheet counter.

### A one-bit sheet must never be JPEG

Found by that test. The booth encoded a sheet as PNG for rolls and JPEG for
everything else, a rule written when receipts were the only thermal paper.
Labels are thermal *sheets*, so they were being JPEGed — and JPEG is the worst
possible codec for a dither. A field of single black and white dots is the
worst case for a cosine transform: every dot rings, the two levels smear into a
continuum, and the driver thresholds that continuum back to one bit, undoing
the dithering exactly as a rescale does. Measured: **2 levels became 20** at
quality 0.95.

The rule is now "is it one bit", not "is it a roll" — `sheetDataURL()`, used by
guest prints, editor test prints and the console test alike. Verified across
all four paper kinds.

## Why a printed photo comes out as a black blob

Two independent causes, both fixed, both worth understanding because the
symptom is identical.

### 1. The camera exposed for the room, not the guest

A guest stands in front of the room and the room is brighter than they are, so
the camera meters for the room and puts the person at the bottom of the scale.
On a colour print that reads as "a bit dark". On a one-bit head everything
down there burns solid and the face becomes a silhouette with holes where the
glasses caught the light. No amount of dithering recovers it — by then the
tones are already squeezed into the bottom few values.

**Admin → CAMERA → AUTO EXPOSURE** fixes it while the frame is still 8-bit, in
`grabFrame`. It builds two histograms: the whole frame for black and white
points, and the middle of the frame for the subject. A centre *average* is no
use, because the middle is still mostly room — so it takes a low percentile of
the centre, which picks out the darker population standing in front of the
room, and lifts that to `EXPOSURE TARGET`.

Measured on a backlit test frame, face mean luma: **53 → 111** at the old
target, **128** at the shipped target of 165, against a head that thresholds at
128. An already well-lit frame moves 167 → 178, so it does not wreck a good
one.

### 2. The sheet was being scaled, which destroys a dither

The 80mm roll renders **576 dots** wide. Sent to a 4-inch head it has to be
enlarged 1.44x, and **enlarging a one-bit image resamples it back into grey** —
measured, 2 levels become 256 — which the driver then thresholds all over
again. Every careful dithering decision is undone and photographs come back as
blobs.

Fix: render at the paper's own width so the dots the booth chose are the dots
that burn, one for one. **`100mm Thermal Roll (receipt)`** is 799 dots, which
is 100mm at 203dpi and matches the label exactly.

**On a VOZY U9, set PAPER to `100mm Thermal Roll` for the receipt design, or
`100 x 150 mm Label` for the photo layouts. Not the 80mm roll** — that one is
for an actual 80mm receipt printer, and on a 4-inch head it will be scaled and
the dither lost.

End to end on a backlit frame through the receipt design, one photo cell:

| | ink coverage | windows carrying detail |
|---|---|---|
| 80mm render, no exposure fix, driver-scaled | 60.0% | 39.2% |
| 100mm render, auto exposure | **29.4%** | **66.6%** |

## The screen as a flash

**Admin → CAMERA → SCREEN FLASH.** The whole panel turns white for the moment
of the shutter. On a tablet booth it is the only light there is, and on a dark
stage it is worth real stops on a face.

There was already a flash in the booth and it was decorative. It fired on the
same line as the capture, so the white had not been composited — let alone
reached the guest and come back — by the time the frame was read. It looked
like a flash to whoever was watching the screen and put no light at all into
the photograph.

Three things make it a light instead:

* It is `position: fixed` and covers the whole viewport, not the stage. The
  stage is a fraction of the glass and was a fraction of the light.
* The white is **painted before the shutter** — two animation frames, one to
  apply it and one to be sure the compositor has shown it.
* It is **held** across the capture. `FLASH HOLD` (default 140 ms) is the
  pause before the frame is read, because a camera does not change exposure on
  the frame the light arrives; it needs a few frames at 30 fps to meter. At 0
  the photograph is taken before the exposure has moved.

Traced through a real session: the panel is at full white for six frames
before the shutter, still at full white on the frame that is read, and fading
by the next one.

`FLASH LEVEL` softens it below full white — gentler on the eye, less light.
Neither control can raise the device's backlight; no web page can. Turn screen
brightness up for an event.

## Getting detail onto thermal paper

The instinct is to raise the capture resolution. That is not where the detail
goes. A 100 x 150 label is 799 dots wide and the camera is asked for 1920 —
**2.4 source pixels per printed dot**, more than twice what is needed. Raising
it further changes nothing on paper.

What decides how much of a face survives is *which dots get burned*. A thermal
head burns a dot or it does not; there is no grey. The booth used to send 8-bit
grey and let the printer's driver choose, and vendor drivers generally
threshold: every tone above some level goes white, everything below goes black,
and a face becomes two flat shapes.

The booth now does that conversion itself, under **Admin → THERMAL IMAGE**.
The full path a photograph takes is **upscale → greyscale → contrast → lift
local shadow → sharpen → dither**, in that order: greyscale first because
everything after works on one channel, contrast while the tone is still
continuous, shadow lifting after contrast because contrast is what pushes
faces into shadow, sharpening before the dither because sharpening a dithered
image only sharpens dot noise, and dithering last because nothing can be
adjusted once there are two values left.

Upscaling happens where the photograph is drawn into the sheet, with
high-quality resampling on the canvas context. It matters most for a
VGA-class camera such as the Charmera, which is genuinely *enlarged* into a
label slot: measured at **+3.3% gradient energy** over the browser default
when upscaling 640x480 into a 799-wide slot. Small, but free.

`FACE LIFT` is the "brighten faces" step and it is **not face detection**. No
browser here offers one — Safari has no Shape Detection API and Chrome has
unshipped `FaceDetector` — and carrying a model would cost megabytes in an app
whose point is working offline. It reads the *local* average brightness
instead and lifts whatever sits in local shadow, which at a booth is usually a
face, with a headroom term so highlights do not wash out.

**What the measurements actually showed.** The enormous gain is dithering at
all, versus letting a driver threshold. Within dithering the differences are
small and not all one way: against a synthetic portrait with a deep shadow
side, `ADAPTIVE` gave the best printed contrast for features inside the shadow
(7.8 vs 6.2 for the untuned baseline) but the *worst* fine-detail retention
(97.1% of windows carrying detail, vs 99.8%) and the most ink. `ADAPTIVE` is
the default because it was asked for, not because it won; print one of each
and keep whichever you prefer.

Controls:

| Control | What it does |
|---|---|
| `DITHER` | `DIFFUSION` (Floyd–Steinberg), `SCREEN` (ordered 4x4 Bayer), or `OFF` (the old behaviour — hand grey to the driver) |
| `CONTRAST` | Midtone contrast **before** dithering. Thermal compresses the ends of the scale |
| `BRIGHTNESS` | Lightness before dithering. Heat spreads around each dot, so prints come out heavier than the screen |
| `SHARPEN` | Unsharp masking before dithering. Error diffusion smears fine edges; this puts them back. 0 turns it off |

Order matters and is fixed: tone, then sharpening, then dithering. Sharpening
after a dither would only sharpen dot noise, and tone applied afterwards would
have nothing continuous left to work on.

Error diffusion takes the nearest of black or white for each dot and pushes the
error — how wrong that choice was — into the neighbours not yet decided, so a
midtone becomes a texture that reads as grey at arm's length. The printer is
then handed pure black and white with nothing left to decide.

Measured: the sheet leaves the booth with **2 distinct levels, 100% pure black
or white**, at a cost of **30 ms** per sheet for a 958,000-dot label. Non-thermal
papers are untouched — the step is a no-op unless the paper is thermal, verified
by hash across all six.

The dither runs in `compose()`, so the review and confirm screens show the
dithered sheet: what a guest approves is what burns, dot for dot.

**If DIFFUSION shows worm-like streaks** on large flat areas, try `SCREEN` — it
is coarser on a face but never smears. **If faces fill in solid**, raise
BRIGHTNESS. **If it all looks grey and flat**, raise CONTRAST. **If text turns
gritty**, drop SHARPEN to 0.

## Sticker and waybill printers

Two label papers are built in, under **Admin → PRINT → PAPER**:

| Paper | Size | Renders |
|---|---|---|
| `100 x 150 mm Label (waybill sticker)` | 100 x 150 mm | 799 x 1199 dots |
| `A6 Label 105 x 148 mm (sticker)` | 105 x 148 mm | 839 x 1183 dots |

Both are 203 dpi, which is the resolution of every 4-inch thermal head, so
the render lands on the sticker at 1:1. They are **sheets, not rolls**: a
label printer feeds to the gap between stickers and stops, so these get the
ordinary six photo layouts rather than the three receipt ones.

**"A6" is sold loosely.** The stickers bundled with these printers are usually
100 x 150 mm; true A6 is 105 x 148. Measure one before an event — a 5 mm error
shows as a crooked edge on every print. Any other size can be added under
LAYOUT EDITOR.

Prefer **100 x 150** if the stock is a choice. A 4-inch head is 104 mm, or 832
dots, so 100 x 150 fits with room to spare while true A6 is 839 — seven dots
wider than the head can reach, which the driver scales away. Admin warns when
the selected paper is wider than HEAD WIDTH, which also catches the older
mistake of an 80 mm roll on a 58 mm head.

**PHOTO TONE is ignored on thermal paper.** The head has one ink and two
states, so a colour preview would be a picture the printer cannot produce.
Thermal papers — both rolls and both labels — always render monochrome,
whatever PHOTO TONE says. The preview is then honest about what will burn.

**Getting the sheet to the printer is the hard part**, and the answer differs
by route:

* **A Mac or PC over USB — the route that works.** Install the printer's
  driver, set its paper size, make it the default, and run `./kiosk-chrome.sh`.
  Chrome's `--kiosk-printing` sends every job straight there with no window.
  See below.
* **Android, PRINT MODE = SYSTEM DIALOG.** Goes through the printer's own
  Android driver. The fallback on a tablet.
* **Android, PRINT MODE = BLUETOOTH.** The only silent path on a tablet: the
  booth dithers to 1 bit and sends ESC/POS raster, with HEAD WIDTH at
  `104MM / 832`. This only works on a printer that speaks ESC/POS. **The VOZY
  U9 does not** — see below. Test-print from the layout editor before an
  event, not in front of a queue.
* **iPad.** Not possible over USB. iPadOS has no USB printing at all: unlike
  cameras, there is no USB printer class exposed to apps, and AirPrint is
  network-only.

### The VOZY U9, specifically

Plugged in over USB it identifies itself as:

```
MANUFACTURER:;COMMANDSET:TSPL;MDL:LABEL-9X00;CLASS:PRINTER;ACTIVE COMMAND:TSPL
```

**`COMMANDSET:TSPL`** settles a question worth knowing before an event: it
speaks TSPL, not ESC/POS, so the Bluetooth path above would connect, report
success and feed blank stickers. On a tablet it needs SYSTEM DIALOG and the
vendor's own Android driver. On a Mac it is straightforward.

On macOS the driver ships as `Label_TSPL-9X00.ppd` under
`/Library/Printers/PPDs/Contents/Resources/`, with the vendor's
`rastertodlabel` filter and `100mmx150mm` as its default paper — the same size
as the booth's `100 x 150 mm Label` paper. Note that macOS may auto-create the
queue with a **Generic PostScript** driver instead, which offers only Letter
and A4 and sends PostScript to a printer that cannot read it. Check with:

```
lpoptions -p <queue> | tr ' ' '\n' | grep make-and-model
```

If it says `Generic PostScript Printer`, rebind it:

```
lpadmin -p <queue> -P /Library/Printers/PPDs/Contents/Resources/Label_TSPL-9X00.ppd.gz
lpoptions -p <queue> -o PageSize=100mmx150mm -o Resolution=203dpi
```

Verified end to end on this Mac: the booth renders 799 x 1199, the chain
produces a 283 x 425 pt page and a **798 x 1198 dot raster at 203 dpi** — one
dot of rounding, a tenth of a millimetre, and no resampling worth the name.

### Silent printing to it

`./kiosk-chrome.sh` reports the printer and paper it is about to use and
refuses to guess, because `--kiosk-printing` has no dialog to catch a mistake:

```
./kiosk-chrome.sh -l                  list printers, show the default
./kiosk-chrome.sh -p _LABEL_9X00      make it the default, then launch
./kiosk-chrome.sh -p Canon_SELPHY_CP1500
```

An ordinary Chrome can stay open. The usual "quit Chrome first" rule applies
to launching with the *default* profile, where a second launch is handed to the
running instance and the flags are dropped. This script has always used a
profile of its own, which makes it a genuinely separate browser — measured on
this Mac: `--kiosk-printing` survives on its command line and a print lands on
the printer with no dialog while another Chrome carries on beside it. Only a
second *booth* on the same profile clashes, and the script checks for that.

One default printer means one silent destination. Switching the booth between
stickers and SELPHY postcards means switching the default too — change PAPER in
Admin and the printer with `-p` together, or a 100 x 150 sticker design will go
to the postcard printer.

## The tape overlay

Both camera wells are dressed as a camcorder's on-screen display, from the
reference: white monospace burned into the corners of the picture.

```
CAMERA1                                    VCR TAPE
PLAY >                                   ANA & MIGUEL
00:00:00


09:39
28.09.2026 MON
```

Deliberately **no corner brackets, no vignette, no scan lines**. The reference
is clean and the restraint is the point — the type alone is what makes a
preview read as a recording rather than as a video call. A guest who
recognises the language stands differently in front of it.

Two of the three readouts are real. The clock is the wall clock; the timecode
counts from the moment the session began, so a guest glancing at it while
posing sees a number that means something. The medium is the event name,
because that is what this particular tape is of.

`PLAY >` while the booth is idle, `REC` with a blinking red dot once the
shutter sequence is running — blinking because a steady red light is what a
*fault* looks like on real hardware, and every camcorder blinked while it
rolled. Measured across a session: PLAY at attract, REC mid-capture, PLAY
again at review.

All of it is furniture: `pointer-events:none` throughout so nothing can
swallow a tap, and none of it reaches the printed sheet.

## The start page is a mirror

The attract screen shows the live camera, full width, with the call to action
under it.

Someone deciding whether to use a booth is really deciding how they look in
it, and they will work that out somehow whether or not the booth helps — in a
phone camera, in a window, in the dark glass of the dead screen. Showing the
picture before they commit means the framing is sorted before the countdown
starts, instead of the first shot being the one where everyone is still
finding the lens. It also gave the screen something to do with the space: the
old start page was a 720px panel centred in a field of white, which on a
tablet left most of the glass idle.

**It shares the capture screen's stream rather than opening a second camera.**
Two `<video>` elements can hold the same MediaStream, and a device that will
only hand out one at a time — which is most of them — would otherwise leave
the panel black the moment the capture screen took the camera. Measured across
a full session: **0 extra camera requests**, the same stream object on both
elements.

**The camera is no longer released when a session ends.** There is nothing to
release it to: dropping the stream would black out a panel a guest is standing
in front of, and the next session would take it straight back. A booth's
camera is on for as long as the booth is. On iOS this was already true, for a
different reason — see above.

A stand-in panel shows whenever there is no picture, because a black rectangle
with no explanation reads as a broken booth.

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
