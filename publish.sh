#!/bin/bash
#
# Bump, commit and publish the web app to GitHub Pages, in one step.
#
#   ./publish.sh                 deploy whatever is in the working tree
#   ./publish.sh "message"       ...with a commit message of your own
#
# What it does, in order:
#   1. Bumps CACHE in web/sw.js. This is not optional and not a nicety —
#      the service worker serves cache-first, so without a new cache name
#      every Home Screen icon keeps running the old build forever. It is the
#      single easiest way to deploy and see nothing change.
#   2. Commits everything that changed.
#   3. Pushes main.
#   4. Pushes web/ to the gh-pages branch as its root, so the site lives at
#      the repository root with no path juggling.
#
# One-time setup:
#   Settings → Pages → Source: "Deploy from a branch",
#   branch `gh-pages`, folder `/ (root)`.  Repository must be Public —
#   Pages on a private repository needs a paid plan.
set -euo pipefail
cd "$(dirname "$0")"

if ! git remote get-url origin >/dev/null 2>&1; then
    echo "No 'origin' remote. Create the repository, then:" >&2
    echo "  git remote add origin https://github.com/<you>/<repo>.git" >&2
    exit 1
fi

# ---- 1. cache version ------------------------------------------------
current=$(sed -n "s/^const CACHE = 'photobooth-v\([0-9]*\)';/\1/p" web/sw.js)
if [ -z "$current" ]; then
    echo "Could not find the CACHE line in web/sw.js — fix it by hand." >&2
    exit 1
fi
next=$((current + 1))
sed -i '' "s/^const CACHE = 'photobooth-v${current}';/const CACHE = 'photobooth-v${next}';/" web/sw.js
echo "Cache  photobooth-v${current} → photobooth-v${next}"

# ---- 2. commit -------------------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -m "${1:-Deploy web app (cache v$next)}

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    echo "Commit $(git rev-parse --short HEAD)"
else
    echo "Nothing to commit."
fi

# ---- 3 & 4. push -----------------------------------------------------
echo "Pushing main…"
git push -q origin main

echo "Publishing web/ to gh-pages…"
git subtree push --prefix web origin gh-pages

url=$(git remote get-url origin \
      | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
user=${url%%/*}
repo=${url##*/}
echo
echo "Live in a minute or so at  https://${user}.github.io/${repo}/"
