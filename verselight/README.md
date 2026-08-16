# Verselight

The complete King James Bible, a 365-day devotional, full-text search across
all 31,102 verses, and nine study modules — with no network at all.

## Build

    node tools/build.mjs      # copies src/ to the site root (what Netlify serves)
    node tools/artifact.mjs   # folds the whole app into one HTML file

`build.mjs` enforces the promise the app makes: it fails if any `src`/`href`
points at an outside host (api.esv.org excepted, see below), if any of the 66
book files is missing, or if the devotional is not 365 contiguous days.

### Deploying by hand

    node tools/build.mjs
    mkdir -p dist/site && cp index.html *.js fonts.css sw.js manifest.webmanifest _headers dist/site/
    cp -r fonts data dist/site/
    (cd dist/site && zip -rq ../verselight-netlify.zip .)

Drag `verselight-netlify.zip` onto app.netlify.com/drop. It must be a zip or a
folder with `index.html` at its root — a single bare file is rejected, and
because a drop deploy has no build step there are no logs to explain why.

`artifact.mjs` produces two single-file shapes:

- `dist/index.html` — a complete document. Drop it on any static host on its
  own; it carries its own manifest and icons as data URLs.
- `verselight-standalone.html` — the same content without `<head>`, for a host
  that supplies the document skeleton.

Both embed Scripture as `<script type="application/json">` blocks behind a
`fetch` shim, so the app keeps its normal lazy-loading code paths and the
sources never learn they were bundled.

## What is where

    src/index.html    markup, design tokens, all styles
    src/app.js        reader, sidebar, search, verse of the moment
    src/devotional.js the 365-day reading
    src/study.js      the nine study modules and the narration engine
    src/esv.js        optional online ESV over the offline KJV
    src/gate.js       shared render gate — visibility, frame limiter, DPR scale
    src/bg.js         background field
    src/cross.js      hero — raymarched glass
    src/plate.js      filigree and the book
    data/books/N.json one file per book: {b, rows:[[chapter, verse, text]]}

## Text and licensing

The King James Version is public domain worldwide — no license or permission
is needed to copy or share it, which is what lets this app be passed phone to
phone and stay legal at every hop.

The ESV is optional and online-only. Crossway's API is free for
non-commercial use, but their terms cap local storage at 500 verses, so the
whole text cannot be cached on the device. Fetched verses live in memory for
the session and are never written to storage. Without a key or without a
signal the KJV is already on the device and nothing breaks.

## Performance notes

Five WebGL canvases run at once. `gate.js` gates every loop on
IntersectionObserver visibility, caps touch devices to 24fps, scales
resolution down on touch, and cuts the hero's raymarch from 108 steps to 46 —
without which a phone renders this at about one frame a second.

Search scans all 66 books in roughly 10ms once they are in memory, so the
warm path runs synchronously in one pass. Awaiting per book instead cost
seconds: every yield hands a turn to the render loops.
