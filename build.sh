#!/bin/bash
#
# Build the app.
#
#   ./build.sh              iOS Simulator (iPad)
#   ./build.sh iphone       iOS Simulator (iPhone)
#   ./build.sh run          build + install + launch on a booted simulator
#   ./build.sh device       archive-ready build for a real iPhone/iPad
#   ./build.sh open         regenerate the project and open it in Xcode
#
set -euo pipefail
cd "$(dirname "$0")"

SCHEME="Photobooth"
IPAD_SIM="${IPAD_SIM:-iPad Pro 13-inch (M4)}"
IPHONE_SIM="${IPHONE_SIM:-iPhone 16}"

if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
    cat >&2 <<'MSG'
──────────────────────────────────────────────────────────────────────
This machine cannot build an iOS app yet.

It has Command Line Tools only. The iOS SDK ships *inside* Xcode and is
not available as a separate download, so there is no way around this.

  1. Install Xcode from the App Store (free, ~10 GB, and it downloads
     iOS platform support on first launch — say yes to that).

  2. Point the toolchain at it:

       sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

  3. Accept the licence once:

       sudo xcodebuild -license accept

  4. Run this script again, or ./build.sh open to work in Xcode.

To put it on a real iPhone or iPad you also need a signing team:
open the project, select the Photobooth target, Signing & Capabilities,
tick "Automatically manage signing" and pick your Apple ID. A free
account works; the app then needs re-signing every 7 days.

Everything else here is finished and ready — sources, project file,
asset catalog. Nothing else is waiting on you.
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
    xcodebuild -project Photobooth.xcodeproj -scheme "$SCHEME" \
        -configuration Debug -destination 'generic/platform=iOS' build
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
