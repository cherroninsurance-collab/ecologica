# ECOLOGIA — The Sacred Word

A holographic, glassmorphic Bible application built for the Great Commission:
**the complete Bible, every interactive module, 100% offline, on any device,
with no license required — anywhere on earth.**

> *"Go therefore and make disciples of all nations."* — Matthew 28:19

---

## Why this exists

Missionaries work where there is no signal, no app store, and no budget for
per-seat licensing. ECOLOGIA is a single folder of static files. Put it on a
phone, walk into a valley with no bars, and nothing is lost.

## What's inside

| | |
|---|---|
| **Complete Scripture** | All 66 books, **31,102 verses** — the full King James Version, public domain worldwide |
| **Reader** | Book and chapter navigation, tap any verse to hear it read aloud by the device's own voice |
| **Canonical Atlas** | Every book's theme, key verse, main lessons, and where it points to Christ |
| **Teachings of Jesus** | 45 teachings — the Sermon on the Mount, the parables, the seven I AMs, the miracles, His final words |
| **YOUTH games** | The Creation Adventure · Heroes of Faith · Build the Verse |
| **ADULT modules** | Testament Illuminations · Exegesis Training · Concordance threads |
| **Daily Devotional** | *The Descending Light* — **365 original readings** across 45 arcs: Scripture, reflection, prayer, and one thing to do today |
| **Global Maps** | The Acts 1:8 dispatch — the gospel moving outward from wherever you stand |

## On Bible translations and licensing

This app ships the **King James Version (1611)**, which is in the **public
domain worldwide**. No license, royalty, permission, or attribution agreement
is required to copy, print, translate, or distribute it — including
commercially, including in unlimited quantity, forever.

That is a deliberate choice. Modern translations such as the ESV, NIV, and NASB
are copyrighted, and bundling their full text in an app requires a negotiated
license from the publisher. For field work where the app will be copied phone
to phone by people you will never meet, a public-domain text is the only
option that stays legal at every hop.

If you ever do license a modern translation, `tools/fetch-kjv.mjs` shows the
expected data shape — `{ translation, verses: [{ b, c, v, t }] }`. Drop a new
file in `data/`, point `Scripture.load()` at it, and nothing else changes.

Other public-domain options that work the same way: the **World English
Bible** (modern English, public domain) and the **American Standard Version**.

## The daily devotional — and why it is original

**The famous devotionals cannot legally be shipped in an app.** Worth stating
plainly, because it is the first thing anyone asks:

| Devotional | Status |
|---|---|
| *My Utmost for His Highest* (Chambers) | **In copyright** — US publication 1935, renewed 1963 |
| *Jesus Calling* (Sarah Young, 2004) | In copyright |
| *Our Daily Bread* | In copyright |
| *New Morning Mercies* (Tripp, 2014) | In copyright |
| *Morning and Evening* (Spurgeon, 1865) | **Public domain** |
| *Faith's Checkbook* (Spurgeon, 1888) | **Public domain** |
| *Streams in the Desert* (Cowman, 1925) | **Public domain in the US** |

Spurgeon and Cowman are free to use — but no machine-readable copy was
reachable, and reproducing their text from memory would risk putting words in
a real author's mouth. Inventing quotations and attributing them to Spurgeon
would be worse than omitting him.

So *The Descending Light* is **original writing**, built on the method the
classics share rather than their text: one passage, one truth, one prayer, one
thing to do today. **365 readings across 45 arcs**, a full year:

- **Days 1–90 — the gospel.** The God who speaks · the weight and the kindness ·
  the cross · the empty tomb · grace not wages · teach us to pray · in the
  valley · who you now are · the Spirit and holiness · love made visible ·
  sent ones · hope and glory
- **Days 91–180 — walking with God.** Worship · wisdom for the ordinary day ·
  work and calling · money and contentment · the tongue · home and family ·
  rest · fear and courage · humility · waiting · gratitude · friendship
- **Days 181–270 — the whole story.** Genesis through Revelation, walked in
  order: creation, Egypt, wilderness, kings, prophets, exile, the life of
  Christ, the early church, the letters, and the end that is a beginning
- **Days 271–365 — God and His people.** The character of God · the Spirit ·
  the church · the disciplines · endurance · witness · justice and mercy ·
  eternity · Advent · the incarnation · the year's end

The entry is chosen deterministically from the date, so everyone reading on a
given day gets the same one, and arrows let you move through the journey. The
passage is pulled live from the offline KJV rather than duplicated, so the
devotional always shows the real text.

Add a 366th entry for leap years the same way — the engine reads the array
length and needs no code change.

## Adding the ESV (you probably don't have to pay)

The most common question about this app. The short version:

**Crossway's ESV API is free for non-commercial use.** No payment, no
negotiation — register at [api.esv.org](https://api.esv.org/) and you have a
key. What it is *not* is offline: Crossway's terms cap local storage at 500
verses or half a book, so the complete ESV cannot be saved to a device. That
is a licensing boundary, not a technical one.

So ECOLOGIA treats ESV as an **online enhancement over an offline base**. Open
*TRANSLATION* in the footer, paste a key, and passages render in ESV whenever
you have signal — falling back instantly to the offline KJV when you don't.
Fetched verses are held in memory for the session only and never written to
storage, which keeps the app inside the free terms.

**Why modern translations are copyrighted at all:** a translation is decades of
scholarly labour — committees of Hebrew and Greek specialists, revision cycles,
typesetting. Copyright funds that work and stops the text being altered and
republished under the same name. It is not a fee to *read* the ESV, which is
free everywhere. It is a fee to *redistribute the whole text inside your own
product*.

**For full offline ESV** you need a negotiated license
([crossway.org/permissions](https://www.crossway.org/permissions/)). Crossway
does grant ministry and missions licenses, sometimes at no cost — worth asking,
and worth describing this project when you do. Once granted, drop the text into
`data/` in the same shape as the KJV file and nothing else changes.

## Narration

Tap **LISTEN TIMBRE**, or tap any verse in the reader, to hear it read aloud.

By default this uses the device's own speech engine — but with a real engine
around it: the best installed voice is chosen by score rather than accepting
the browser default (usually the worst one), the rate is slowed to 0.88, and
long passages are split into sentences because Chrome silently truncates
utterances past ~200 characters.

For a premium voice, `tools/render-voice.mjs` bakes **ElevenLabs** narration
into `data/voice/*.mp3` at build time:

```bash
export ELEVENLABS_API_KEY=sk_...
node tools/render-voice.mjs            # the default clip set
node tools/render-voice.mjs --book 43  # narrate a whole book
```

This is deliberately a *build* step, not a runtime call. ElevenLabs is a
network service, and calling it while someone reads would break the promise
that this app works with no signal. Rendering ahead of time means you pay
once and every copy plays that voice offline, forever. The app prefers those
files when present and falls back to the device voice when they are not, so
the step is entirely optional.

## heavens.js — the background as a drop-in for any site

The sky engine is also shipped standalone. Copy `dist/heavens.js` next to any
HTML file and add one line — that is the entire install:

```html
<script src="heavens.js" data-heavens></script>
```

It creates a fixed, full-screen canvas behind your page (`z-index:-1`,
`pointer-events:none`), so it never touches your layout or intercepts clicks.
For control, mount it yourself:

```html
<script src="heavens.js"></script>
<script>
  const sky = Heavens.mount({
    accent: 0xc2870b,   // colour of the light
    book:   false,      // hide the codex — just sky, clouds and gates
    gates:  false,
    quality:'auto'
  });
  sky.setAccent(0x2f7fd0);   // retheme live; it eases rather than jumping
</script>
```

18 KB, no dependencies, no network. Open `demo.html` for a live playground and
the full option/method reference. MIT licensed — use it anywhere.

## Rendering

The centerpiece codex is **not** a 3D model or a WebGL library. It is a
raymarched signed-distance field in a single fragment shader — one fullscreen
triangle, zero dependencies:

- Real single-bounce refraction, marched through the glass to the far wall
- **Chromatic dispersion** across three IORs (1.440 / 1.495 / 1.550), so red
  bends least and blue most, as in a real prism
- Beer–Lambert absorption through the leaves
- Volumetric god-rays integrated by step *length*, not per iteration
- Illuminated script ruling broken into word-length segments
- Spring-damped mouse parallax; portrait viewports pull the camera back

## Build and run

```bash
node tools/build.mjs               # → index.html
node tools/build.mjs --standalone  # → also ecologia-standalone.html (Bible inlined)

npx http-server -p 8080            # any static server; then open localhost:8080
```

`index.html` is the app. `data/bible-kjv.json` is the Scripture text. The
service worker precaches both on first visit, so every visit after that works
with the network off.

To refresh the Scripture text from source: `node tools/fetch-kjv.mjs data/bible-kjv.json`

## Deploy

Any static host works — Netlify, GitHub Pages, Cloudflare Pages, or a folder
on a USB stick. There is no backend, no build step at runtime, no database,
no telemetry, and no account system. Nothing about this app phones home.

For field distribution:
- **PWA** — visit once, "Add to Home Screen", then it works offline forever
- **Standalone file** — `ecologia-standalone.html` is one self-contained file;
  send it by Bluetooth, WhatsApp, or SD card where nothing else reaches
- **Hotspot** — any phone running a pocket static server can hand the app to
  nearby devices with no internet at all

## License

Application code: MIT (see `LICENSE`).
Scripture text: King James Version, public domain.
