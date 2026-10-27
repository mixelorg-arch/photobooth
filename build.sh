#!/bin/bash
#
# Build the app.
#
#   ./build.sh              iOS Simulator (iPad)
#   ./build.sh iphone       iOS Simulator (iPhone)
#   ./build.sh run          build + install + launch on a booted simulator
#   ./build.sh device       archive-ready build for a real iPhone/iPad
#   ./build.sh ipad         build + install + launch on a connected iPad
#   ./build.sh open         regenerate the project and open it in Xcode
#
set -euo pipefail
cd "$(dirname "$0")"

SCHEME="Photobooth"
IPAD_SIM="${IPAD_SIM:-iPad Pro 13-inch (M4)}"
IPHONE_SIM="${IPHONE_SIM:-iPhone 16}"

# The iOS SDK ships inside Xcode. `xcode-select -p` often still points at
# Command Line Tools even when Xcode is installed, and `xcodebuild` then
# refuses to run — which looks exactly like Xcode being absent. Switching it
# with `xcode-select -s` needs sudo; setting DEVELOPER_DIR does not, so find
# Xcode ourselves and only complain when there really is none.
if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
    for candidate in /Applications/Xcode.app /Applications/Xcode-beta.app; do
        if [ -d "$candidate/Contents/Developer" ]; then
            export DEVELOPER_DIR="$candidate/Contents/Developer"
            break
        fi
    done
fi

if [ -z "${DEVELOPER_DIR:-}" ] && ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
    cat >&2 <<'MSG'
──────────────────────────────────────────────────────────────────────
This machine cannot build an iOS app yet.

It has Command Line Tools only. The iOS SDK ships *inside* Xcode and is
not available as a separate download, so there is no way around this.

  1. Install Xcode from the App Store (free, ~10 GB, and it downloads
     iOS platform support on first launch — say yes to that).

  2. Run this script again, or ./build.sh open to work in Xcode.

To put it on a real iPhone or iPad you also need a signing team:
open the project, select the Photobooth target, Signing & Capabilities,
tick "Automatically manage signing" and pick your Apple ID. A free
account works; the app then needs re-signing every 7 days.
──────────────────────────────────────────────────────────────────────
MSG
    exit 1
fi

python3 make_project.py

case "${1:-simulator}" in
  open)
    open "Photobooth.xcodeproj"
    ;;
  device)
    # -allowProvisioningUpdates: xcodebuild refuses to create or refresh a
    # provisioning profile unless asked, even with automatic signing on in
    # the project. Xcode.app does it silently; the command line does not.
    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug -destination 'generic/platform=iOS' \
        -allowProvisioningUpdates build
    ;;
  ipad)
    # Build, install and launch on the iPad that is plugged in. This is the
    # whole of "Step 5" in INSTALL-IPAD.md, and the two checks below exist
    # because both failures are otherwise reported by xcodebuild in a wall
    # of text that does not say what to do about them.
    if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "valid identities found" \
       || security find-identity -v -p codesigning 2>/dev/null | grep -q "0 valid identities found"; then
        cat >&2 <<'MSG'
No signing identity yet. Two things create one, in this order:

  1. Xcode > Settings… > Accounts > + > Apple ID        (free account is fine)

  2. Open the project, select the Photobooth TARGET, then
     Signing & Capabilities > tick "Automatically manage signing"
     > Team > pick "<your name> (Personal Team)"

Step 2 is what makes Xcode issue the certificate, so it cannot be
skipped the first time — but only the first time: make_project.py
remembers the team from then on.

  ./build.sh open     opens the project at the right place

See INSTALL-IPAD.md, steps 1 and 3.
MSG
        exit 1
    fi

    # Ask devicectl for JSON rather than scraping its table: device names
    # contain spaces ("Sean Michael's iPad"), so a positional awk field
    # picks a fragment of the name instead of the id.
    DEVJSON="$(mktemp -t photobooth-devices)"
    xcrun devicectl list devices --json-output "$DEVJSON" >/dev/null 2>&1 || true
    # One line out: udid, developer-mode status, name.
    DEVINFO="$(python3 -c '
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    sys.exit(0)
for d in devices:
    hw = d.get("hardwareProperties", {})
    conn = d.get("connectionProperties", {})
    props = d.get("deviceProperties", {})
    if hw.get("platform") not in ("iOS", "iPadOS"):
        continue
    if conn.get("pairingState") != "paired":
        continue
    udid = hw.get("udid")
    if udid:
        print("\t".join([udid,
                         props.get("developerModeStatus") or "unknown",
                         props.get("name") or "iPad"]))
        break
' "$DEVJSON" 2>/dev/null)"
    rm -f "$DEVJSON"
    UDID="$(printf '%s' "$DEVINFO" | cut -f1)"
    DEVMODE="$(printf '%s' "$DEVINFO" | cut -f2)"
    DEVNAME="$(printf '%s' "$DEVINFO" | cut -f3)"
    # Developer Mode off is the most confusing failure here: the device is
    # listed, pairs, and tunnels fine, so xcodebuild finds it — and then sits
    # for two minutes before giving up with "Timed out waiting for all
    # destinations ... to become available", which names neither the device
    # nor the setting. Catch it up front and say what to tap.
    if [ -n "$UDID" ] && [ "$DEVMODE" != "enabled" ]; then
        cat >&2 <<MSG
Developer Mode is off on "$DEVNAME" (reported: ${DEVMODE:-unknown}).

iPadOS will not run a self-signed app until you turn it on:

  Settings > Privacy & Security > Developer Mode > on

The iPad restarts. Unlock it, confirm when it asks, then run this again.

(If that row is missing, leave the iPad plugged in until Xcode has
finished "Preparing iPad for development", then look again.)
MSG
        exit 1
    fi

    if [ -z "$UDID" ]; then
        cat >&2 <<'MSG'
No iPad is connected.

  1. Plug it in and unlock it.
  2. Tap Trust on the iPad, and enter its passcode.
  3. Settings > Privacy & Security > Developer Mode > on (it restarts).

See INSTALL-IPAD.md, step 4.
MSG
        exit 1
    fi
    echo "Device: $UDID"

    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug -destination "id=$UDID" \
        -allowProvisioningUpdates -derivedDataPath build build
    APP="build/Build/Products/Debug-iphoneos/$SCHEME.app"
    xcrun devicectl device install app --device "$UDID" "$APP"
    BID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
    LAUNCHLOG="$(mktemp -t photobooth-launch)"
    if ! xcrun devicectl device process launch --device "$UDID" "$BID" 2>&1 | tee "$LAUNCHLOG"; then
        :
    fi
    # The app is installed by this point either way. The one launch failure
    # worth translating is the first-run trust prompt, whose real message is
    # buried at the bottom of three nested CoreDevice errors.
    if grep -q "has not been explicitly trusted by the user" "$LAUNCHLOG"; then
        IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
                    | sed -n 's/.*"\(Apple Develop[^"]*\)".*/\1/p' | head -1)"
        cat >&2 <<MSG

──────────────────────────────────────────────────────────────────────
The app INSTALLED fine. iPadOS just will not launch it until you say
you trust the certificate it was signed with. This is once per
developer account, not once per build.

On the iPad:

  Settings > General > VPN & Device Management
    > ${IDENTITY:-your Apple ID}
    > Trust

Then open Photobooth from the Home Screen.
──────────────────────────────────────────────────────────────────────
MSG
    fi
    rm -f "$LAUNCHLOG"
    ;;
  iphone)
    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug \
        -destination "platform=iOS Simulator,name=$IPHONE_SIM" build
    ;;
  run)
    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug -destination "platform=iOS Simulator,name=$IPAD_SIM" \
        -derivedDataPath build build
    APP="build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
    xcrun simctl install booted "$APP"
    xcrun simctl launch booted \
        "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
    ;;
  *)
    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug \
        -destination "platform=iOS Simulator,name=$IPAD_SIM" build
    ;;
esac
