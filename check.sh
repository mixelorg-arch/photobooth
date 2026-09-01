#!/bin/bash
#
# Syntax-check every source file with the macOS Swift toolchain.
#
# `swiftc -parse` does not resolve imports, so this runs without the iOS SDK
# and without Xcode — it catches syntax errors, not type errors. It is the
# only verification available on a machine with Command Line Tools only; a
# real build still needs Xcode (see build.sh).
set -uo pipefail
cd "$(dirname "$0")"

fail=0
while IFS= read -r file; do
    if ! swiftc -parse "$file" 2>/tmp/photobooth-parse.err; then
        echo "FAIL  $file"
        sed 's/^/      /' /tmp/photobooth-parse.err
        fail=1
    fi
done < <(find PhotoboothApp -name '*.swift' | sort)

if [ "$fail" -eq 0 ]; then
    echo "All $(find PhotoboothApp -name '*.swift' | wc -l | tr -d ' ') files parse."
fi
exit "$fail"
