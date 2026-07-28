#!/usr/bin/env node
/* ECOLOGIA — pre-render narration with ElevenLabs.
 *
 * WHY PRE-RENDER INSTEAD OF CALLING THE API AT RUNTIME
 * ElevenLabs is a network service. Calling it while the user reads would
 * break the one promise this app makes: that it works with no signal, in
 * a valley, forever. So the premium voice is baked into audio files at
 * BUILD time. They ship inside the bundle, the service worker precaches
 * them, and playback costs zero network. You pay for the render once;
 * every missionary who receives a copy hears it offline.
 *
 * The app prefers data/voice/<id>.mp3 when present and silently falls
 * back to the device's own synthesizer when it is not — so this step is
 * entirely optional and nothing breaks if you skip it.
 *
 * USAGE
 *   export ELEVENLABS_API_KEY=sk_...
 *   node tools/render-voice.mjs                 # the default clip set
 *   node tools/render-voice.mjs --book 43       # narrate a whole book
 *   node tools/render-voice.mjs --voice <id>    # pick a specific voice
 *
 * COST WARNING: a whole-Bible render is roughly 4.5 million characters.
 * Check your plan's quota before passing --book on a large book, and be
 * aware the default clip set below is deliberately small.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/voice');
const API = 'https://api.elevenlabs.io/v1/text-to-speech';

// A warm, unhurried narrator. Override with --voice <id>.
const DEFAULT_VOICE = 'pNInz6obpgDQGcFmaJgB';   // "Adam" — steady, low, reverent
const MODEL = 'eleven_multilingual_v2';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY first. This step is optional — without\n' +
                'it the app uses the device voice and still works fully offline.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const voiceId = arg('--voice') || DEFAULT_VOICE;

const bible = JSON.parse(readFileSync(resolve(ROOT, 'data/bible-kjv.json'), 'utf8'));
const canon = JSON.parse(readFileSync(resolve(ROOT, 'data/canon.json'), 'utf8'));

/* Default clip set: the passages the app narrates most. */
function defaultClips() {
  const pick = (b, c, from, to) => ({
    id: `${b}-${c}-${from}-${to}`,
    text: bible.verses
      .filter(v => v.b === b && v.c === c && v.v >= from && v.v <= to)
      .map(v => v.t).join(' '),
  });
  return [
    pick(43, 1, 1, 5),    // In the beginning was the Word
    pick(19, 23, 1, 6),   // The LORD is my shepherd
    pick(45, 8, 28, 39),  // All things work together for good
    pick(23, 40, 28, 31), // They that wait upon the LORD
    pick(40, 5, 3, 12),   // The Beatitudes
    pick(40, 28, 18, 20), // The Great Commission
    pick(46, 13, 1, 13),  // Though I speak with the tongues of men
    pick(66, 21, 1, 7),   // Behold, I make all things new
  ];
}

function bookClips(bookId) {
  const meta = canon[bookId];
  if (!meta) throw new Error('Unknown book id: ' + bookId);
  const out = [];
  for (let c = 1; c <= meta.chapters; c++) {
    const text = bible.verses.filter(v => v.b === bookId && v.c === c)
      .map(v => v.t).join(' ');
    if (text) out.push({ id: `${bookId}-${c}`, text });
  }
  return out;
}

async function render(clip) {
  const dest = resolve(OUT, clip.id + '.mp3');
  if (existsSync(dest)) { console.log(`  · ${clip.id} (cached)`); return 0; }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clip.text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.55,          // steady; Scripture should not emote wildly
          similarity_boost: 0.80,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    });
    if (res.ok) {
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`  ✔ ${clip.id}  (${clip.text.length} chars)`);
      return clip.text.length;
    }
    if (res.status === 429 && attempt < 2) {          // rate limited: back off
      await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${clip.id}: HTTP ${res.status} ${await res.text()}`);
  }
  return 0;
}

const bookArg = arg('--book');
const clips = bookArg ? bookClips(Number(bookArg)) : defaultClips();
const chars = clips.reduce((n, c) => n + c.text.length, 0);

mkdirSync(OUT, { recursive: true });
console.log(`Rendering ${clips.length} clips (${chars.toLocaleString()} characters) ` +
            `with voice ${voiceId}…`);

let spent = 0;
for (const clip of clips) spent += await render(clip);

console.log(`\nDone. ${spent.toLocaleString()} characters billed this run.`);
console.log('Add "data/voice/" to the PRECACHE list in sw.js so the audio ships offline.');
