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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const minify = (p) => JSON.stringify(JSON.parse(read(p)));

/* Inlining JS into HTML: the parser ends a <script> block at the first
   "</script" it sees — even inside a comment or a string. heavens.js
   documents its own install snippet, so that sequence must be escaped or
   the library is silently truncated mid-comment. */
const inlineSafe = (js) => js.replace(/<\/script/gi, '<\\/script');

const heavens = inlineSafe(read('src/heavens.js'));

/* Scripture is split into one file per book.
   The single 5 MB bundle cost ~31s to interactive on a phone: the whole
   Bible had to arrive and parse before anything could be read. Per-book
   files are 20–200 KB, so opening John fetches John and nothing else. */
{
  const bible = JSON.parse(read('data/bible-kjv.json'));
  const byBook = new Map();
  for (const v of bible.verses) {
    if (!byBook.has(v.b)) byBook.set(v.b, []);
    byBook.get(v.b).push([v.c, v.v, v.t]);        // array rows: no repeated keys
  }
  mkdirSync(resolve(ROOT, 'data/books'), { recursive: true });
  let total = 0;
  for (const [id, rows] of byBook) {
    const json = JSON.stringify({ b: id, rows });
    writeFileSync(resolve(ROOT, `data/books/${id}.json`), json);
    total += Buffer.byteLength(json);
  }
  if (byBook.size !== 66) throw new Error(`Split produced ${byBook.size} books, expected 66.`);
  writeFileSync(resolve(ROOT, 'data/books/index.json'),
    JSON.stringify({ translation: bible.translation, books: [...byBook.keys()].sort((a,b)=>a-b) }));
  console.log(`\u2714 data/books/ — 66 files, ${(total/1024/1024).toFixed(1)} MB total, ` +
              `largest ~${Math.round(Math.max(...[...byBook.values()].map(r=>JSON.stringify(r).length))/1024)} KB`);
}

let html = read('src/ecologia.src.html')
  .replace('__HEAVENS_JS__', () => heavens)
  .replace('__BIBLE_DATA__', minify('data/bible-overview.json'))
  .replace('__TEACH_DATA__', minify('data/jesus-teachings.json'))
  .replace('__DEVO_DATA__', minify('data/devotional.json'))
  .replace(/__CANON_META__/g, minify('data/canon.json'));

for (const token of ['__BIBLE_DATA__', '__TEACH_DATA__', '__CANON_META__', '__HEAVENS_JS__', '__DEVO_DATA__']) {
  if (html.includes(token)) throw new Error('Unreplaced token: ' + token);
}
// The OFFLINE ACTIVE badge is a promise; fail the build if anything reaches out.
const external = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
if (external) throw new Error('External request breaks offline: ' + external.join(', '));

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);

// Ship the background engine standalone too, so it can be dropped into
// any other site with a single <script> tag.
mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
writeFileSync(resolve(ROOT, 'dist/heavens.js'), read('src/heavens.js'));
console.log(`\u2714 dist/heavens.js — ${kb(heavens)} KB (drop-in background)`);

writeFileSync(resolve(ROOT, 'index.html'), html);
console.log(`✔ index.html — ${kb(html)} KB (loads data/bible-kjv.json)`);

if (process.argv.includes('--standalone')) {
  /* Embedded as a JSON *string*, not an object literal. A 5 MB literal is
     parsed by the JS engine during script evaluation and blocks first paint;
     a string is cheap to load and JSON.parse runs later, off the critical
     path, when Scripture is first actually needed. */
  const bible = minify('data/bible-kjv.json');
  const solo = html.replace('<script>\n/* ═══',
    `<script>window.__ECOLOGIA_BIBLE_RAW__=${JSON.stringify(bible)};</script>\n<script>\n/* ═══`);
  if (!solo.includes('__ECOLOGIA_BIBLE_RAW__=')) throw new Error('Inline injection failed.');
  writeFileSync(resolve(ROOT, 'ecologia-standalone.html'), solo);
  console.log(`✔ ecologia-standalone.html — ${kb(solo)} KB (entire Bible inlined)`);
}
