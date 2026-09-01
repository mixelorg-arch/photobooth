#!/bin/bash
#
# Launch the booth in Chrome with silent printing.
#
# `window.print()` always raises the system print dialog — a page cannot
# suppress it, by design. Chrome's `--kiosk-printing` is the one exception:
# it sends every print job straight to the **default printer** with the
# **default settings** and shows no window at all.
#
# Before an event:
#   1. System Settings › Printers & Scanners — make the SELPHY CP1500 the
#      default printer.
#   2. Set its paper to the borderless 4x6 postcard media. Chrome will not
#      ask, so whatever is set here is what prints.
#   3. Quit Chrome completely (it ignores the flag if an instance is
#      already running), then run this script.
#
# Safari has no equivalent. Use Chrome for the booth.
set -euo pipefail

URL="${1:-http://localhost:8815}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${TMPDIR:-/tmp}/photobooth-kiosk-profile"

if [ ! -x "$CHROME" ]; then
    echo "Google Chrome is not installed at $CHROME" >&2
    exit 1
fi

if pgrep -x "Google Chrome" >/dev/null; then
    echo "Chrome is already running — quit it first (⌘Q)." >&2
    echo "A running instance ignores --kiosk-printing and the dialog will appear." >&2
    exit 1
fi

# A separate profile so the kiosk flags never touch his normal browsing.
mkdir -p "$PROFILE"

exec "$CHROME" \
    --kiosk-printing \
    --kiosk "$URL" \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=Translate \
    --autoplay-policy=no-user-gesture-required
