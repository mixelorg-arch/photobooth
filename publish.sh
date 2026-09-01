#!/bin/bash
#
# Publish the web app to GitHub Pages.
#
# Only `web/` goes to the site — the Swift sources stay on the main branch.
# `git subtree` pushes that one folder to a `gh-pages` branch as its root, so
# the site lives at the repository root and needs no path juggling.
#
#   ./publish.sh                 push web/ to origin gh-pages
#
# One-time setup, in this order:
#   1. Create an empty repository on github.com (Public — GitHub Pages on a
#      private repository needs a paid plan).
#   2. git remote add origin https://github.com/<you>/<repo>.git
#   3. git push -u origin main
#   4. ./publish.sh
#   5. Repository → Settings → Pages → Source: "Deploy from a branch",
#      branch `gh-pages`, folder `/ (root)`.
#
# The site appears at https://<you>.github.io/<repo>/ within a minute or two.
set -euo pipefail
cd "$(dirname "$0")"

if ! git remote get-url origin >/dev/null 2>&1; then
    echo "No 'origin' remote yet. Create the repository on github.com, then:" >&2
    echo "  git remote add origin https://github.com/<you>/<repo>.git" >&2
    exit 1
fi

if [ -n "$(git status --porcelain web)" ]; then
    echo "web/ has uncommitted changes — commit them first, or the site will" >&2
    echo "publish the last committed version and not what you just edited." >&2
    git status --short web >&2
    exit 1
fi

echo "Publishing web/ to gh-pages…"
git subtree push --prefix web origin gh-pages
echo
echo "Done. Settings → Pages → branch: gh-pages, folder: / (root)."
