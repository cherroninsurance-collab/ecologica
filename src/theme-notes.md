# ECOLOGIA — visual & interaction direction (v2)

## Palette inversion: night sky → heaven's morning
The v1 sanctuary-dark palette read as reverent but heavy. v2 moves to the
light: a bright blue sky, sunlit cumulus, and the pearl gates standing open.

| token | v1 (night) | v2 (heaven) |
|---|---|---|
| ground | `#020617` navy void | `#cfe6ff` → `#eaf4ff` sky gradient |
| glass | 1.5% white on black | 55% white frost, light-on-light |
| ink | `#e2e8f0` | `#1e293b` slate (AA on frost) |
| accent | `#eab308` | `#c2870b` (darkened for legibility on light) |

Light-on-light glass needs *more* border contrast, not less — the panel edge
is the only thing separating it from the sky, so borders go to 85% white with
a soft blue drop shadow instead of a black one.

## Heaven's gates
Drawn in direction-space inside `env()`, so they sit behind everything and —
importantly — refract *through* the codex glass. Two pillars, a semicircular
arch, and vertical railings between, rendered as luminous field glow rather
than solid geometry so they read as light rather than architecture
(Rev 21:25 — "its gates will never be shut").

## Clouds
Two fbm layers projected onto altitude planes: high cirrus drifting slowly,
lower cumulus banks near the horizon drifting faster for parallax. Lit from
the sun direction with a gold rim on the upper edge.

## The codex is now the main control
The floating Bible is clickable. Its screen-space rect is computed in JS from
the same camera constants the shader uses, and an invisible hit-area tracks
it. Clicking runs the ascension: the camera dollies in, the pages splay wide,
light blooms to white — and the reader opens out of the whiteout.

## Voice
System speech gets a real engine: best-available voice by scored preference,
0.88 rate, sentence chunking (Chrome truncates long utterances), and
play/stop toggling. If `data/voice/*.mp3` exists — pre-rendered by
`tools/render-voice.mjs` with an ElevenLabs key — playback prefers those
files, keeping premium narration fully offline.
