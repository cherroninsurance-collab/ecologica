#!/usr/bin/env node
/* ECOLOGIA build.
 *
 * Emits two artifacts from one source:
 *   index.html            — the app; fetches data/bible-kjv.json (5 MB),
 *                           precached by sw.js for offline/PWA use
 *   ecologia-standalone.html — everything inlined including the full
 *                           Bible, so one file can be handed device to
 *                           device with no server and no signal
 *
 * Usage: node tools/build.mjs [--standalone]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const minify = (p) => JSON.stringify(JSON.parse(read(p)));

let html = read('src/ecologia.src.html')
  .replace('__BIBLE_DATA__', minify('data/bible-overview.json'))
  .replace('__TEACH_DATA__', minify('data/jesus-teachings.json'))
  .replace(/__CANON_META__/g, minify('data/canon.json'));

for (const token of ['__BIBLE_DATA__', '__TEACH_DATA__', '__CANON_META__']) {
  if (html.includes(token)) throw new Error('Unreplaced token: ' + token);
}
// The OFFLINE ACTIVE badge is a promise; fail the build if anything reaches out.
const external = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
if (external) throw new Error('External request breaks offline: ' + external.join(', '));

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);

writeFileSync(resolve(ROOT, 'index.html'), html);
console.log(`✔ index.html — ${kb(html)} KB (loads data/bible-kjv.json)`);

if (process.argv.includes('--standalone')) {
  const bible = minify('data/bible-kjv.json');
  const solo = html.replace('<script>\n/* ═══',
    `<script>window.__ECOLOGIA_BIBLE__=${bible};</script>\n<script>\n/* ═══`);
  if (!solo.includes('__ECOLOGIA_BIBLE__=')) throw new Error('Inline injection failed.');
  writeFileSync(resolve(ROOT, 'ecologia-standalone.html'), solo);
  console.log(`✔ ecologia-standalone.html — ${kb(solo)} KB (entire Bible inlined)`);
}
