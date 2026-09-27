#!/bin/bash
#
# Launch the booth in Chrome with silent printing.
#
# `window.print()` always raises the system print dialog — a page cannot
# suppress it, by design. Chrome's `--kiosk-printing` is the one exception:
# it sends every print job straight to the **default printer** with the
# **default settings** and shows no window at all.
#
# That is the whole trick, and also the whole risk: the default printer is
# the only thing deciding where a guest's photo comes out. There is no
# dialog to catch a mistake, so this script prints what it is about to use
# and refuses to guess.
#
#   ./kiosk-chrome.sh                       use the current default printer
#   ./kiosk-chrome.sh -p _LABEL_9X00        make that the default, then launch
#   ./kiosk-chrome.sh -p Canon_SELPHY_CP1500
#   ./kiosk-chrome.sh -l                    list printers and exit
#   ./kiosk-chrome.sh -p NAME -- <url>      ...with a different URL
#
# Before an event:
#   1. Pick the printer with -p, or set it in System Settings.
#   2. Check the paper size this script reports matches PAPER in the booth's
#      Admin console. Chrome will not ask, so whatever the driver says is
#      what comes out — a 100x150 sticker design on a Letter default prints
#      a photo the size of a postage stamp in the corner of a sheet of A4.
#   3. Quit Chrome completely (it ignores the flag if an instance is already
#      running), then run this script.
#
# Safari has no equivalent. Use Chrome for the booth.
set -euo pipefail

# The deployed copy. Served over HTTPS, so the camera works, and its service
# worker caches the whole app on first load — which is what a venue with no
# wifi needs. Used whenever no local server is listening, because a booth
# pointed at a dead localhost shows Chrome's error page and nothing else.
LIVE="https://mixelorg-arch.github.io/photobooth/"
LOCAL="http://localhost:8815"
URL=""
WANT=""

while [ $# -gt 0 ]; do
    case "$1" in
        -p|--printer) WANT="${2:-}"; shift 2 ;;
        -l|--list)
            echo "Printers on this Mac:"
            lpstat -p 2>/dev/null | sed 's/^printer /  /'
            echo
            echo "Default: $(lpstat -d 2>/dev/null | sed 's/.*: //')"
            exit 0 ;;
        --) shift; [ $# -gt 0 ] && URL="$1"; shift ;;
        *) URL="$1"; shift ;;
    esac
done

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${TMPDIR:-/tmp}/photobooth-kiosk-profile"

if [ ! -x "$CHROME" ]; then
    echo "Google Chrome is not installed at $CHROME" >&2
    exit 1
fi

# Checked before anything else: a running Chrome makes the rest pointless,
# and there is no sense reporting a printer for a launch that cannot happen.
if pgrep -x "Google Chrome" >/dev/null; then
    echo "Chrome is already running — quit it first (Cmd-Q), then run this again." >&2
    echo "A running instance ignores --kiosk-printing and the dialog will appear." >&2
    exit 1
fi

# Where the booth is served from, unless one was named on the command line.
if [ -z "$URL" ]; then
    if nc -z localhost 8815 2>/dev/null; then
        URL="$LOCAL"
    else
        URL="$LIVE"
    fi
fi

# ---- the printer ------------------------------------------------------
if [ -n "$WANT" ]; then
    if ! lpstat -p "$WANT" >/dev/null 2>&1; then
        echo "No printer called '$WANT'. Known printers:" >&2
        lpstat -p 2>/dev/null | sed 's/^printer /  /' >&2
        exit 1
    fi
    lpoptions -d "$WANT" >/dev/null
fi

DEFAULT=$(lpstat -d 2>/dev/null | sed 's/.*: //')
if [ -z "$DEFAULT" ]; then
    echo "No default printer is set. Nothing would come out." >&2
    echo "Pick one with:  $0 -p <name>      (list them with -l)" >&2
    exit 1
fi

# The paper the driver will use, since Chrome asks for nothing. An empty
# answer means the queue has no PageSize at all, which is worth saying out
# loud rather than discovering on the first guest.
PAPER=$(lpoptions -p "$DEFAULT" -l 2>/dev/null \
        | awk -F: '/^PageSize/ {print $2}' \
        | tr ' ' '\n' | grep '^\*' | sed 's/^\*//' | head -1)

echo "Printer : $DEFAULT"
echo "Paper   : ${PAPER:-<none set — the driver will pick>}"
echo "Booth   : $URL$([ "$URL" = "$LIVE" ] && echo "   (deployed copy — no local server running)")"
echo
echo "Every PRINT goes here with no dialog. Check the paper matches the"
echo "booth's Admin > PRINT > PAPER before the doors open."
echo

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
