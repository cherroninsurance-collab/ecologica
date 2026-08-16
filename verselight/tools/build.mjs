#!/usr/bin/env node
/* Verselight build — copy sources to the site root and enforce the one
 * promise the app makes: that it works with no network at all.
 *
 * There is no bundling step. The design ships as separate ES modules so
 * the browser can cache them independently, and Scripture is one file per
 * book so opening John fetches John and nothing else.
 *
 * Usage: node tools/build.mjs
 */

import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(ROOT, p);

const SOURCES = ['index.html', 'app.js', 'bg.js', 'cross.js', 'plate.js', 'gate.js',
                 'esv.js', 'devotional.js', 'study.js', 'fonts.css'];

let bytes = 0;
for (const f of SOURCES) {
  const src = r('src/' + f);
  if (!existsSync(src)) throw new Error('Missing source: src/' + f);
  copyFileSync(src, r(f));
  bytes += readFileSync(src).length;
}

/* The offline guarantee, enforced rather than asserted. Any src/href
   pointing at an outside host fails the build — that is how a "works
   anywhere" app quietly stops working anywhere. api.esv.org is the one
   allowed exception: it is an explicit online-only enhancement that always
   falls back to the on-device KJV. */
const html = readFileSync(r('index.html'), 'utf8');
const external = (html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || [])
  .filter((u) => !u.includes('api.esv.org'));
if (external.length) throw new Error('External request breaks offline use: ' + external.join(', '));

/* Scripture completeness — a Bible missing books is not shippable. */
const books = readdirSync(r('data/books')).filter((f) => /^\d+\.json$/.test(f));
if (books.length !== 66) throw new Error(`Expected 66 book files, found ${books.length}`);

const devo = JSON.parse(readFileSync(r('data/devotional.json'), 'utf8'));
const days = devo.days.map((d) => d.d);
if (days.length !== 365 || days.some((d, i) => d !== i + 1)) {
  throw new Error(`Devotional must be 365 contiguous days; got ${days.length}`);
}

const fonts = existsSync(r('fonts')) ? readdirSync(r('fonts')).length : 0;

const kb = (n) => (n / 1024).toFixed(0);
console.log(`✔ ${SOURCES.length} source files — ${kb(bytes)} KB`);
console.log(`✔ ${books.length} books · ${devo.days.length} devotional days · ${fonts} self-hosted fonts`);
console.log('✔ zero external requests (api.esv.org excepted, online-only by design)');
