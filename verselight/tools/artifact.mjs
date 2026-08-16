#!/usr/bin/env node
/* Verselight — single-file build.
 *
 * The normal build ships separate modules and one JSON file per book so the
 * browser fetches only what a reader opens. Some hosts serve exactly one
 * file and nothing else, so this build folds the whole app — fonts, all 66
 * books, the devotional, every module — into one HTML document.
 *
 * Two things make that possible without touching the sources:
 *   - Scripture is embedded as <script type="application/json"> blocks and a
 *     small fetch shim answers data/* requests from them, so app.js and
 *     devotional.js keep their normal lazy-loading code paths.
 *   - ES modules are wrapped in IIFEs and their imports rewritten to two
 *     globals, because a single inline <script> has no module graph and
 *     Content-Security-Policy rules out blob: and data: module URLs.
 *
 * Usage: node tools/artifact.mjs [outfile]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(ROOT, p);
const OUT = process.argv[2] || r('verselight-standalone.html');       // fragment
const FULL = r('dist/index.html');                                    // drop-in document

/* The mark: a gold disc with a white core on the ink ground — the same
   signature the wordmark draws in CSS. SVG so it is sharp at every size a
   home screen asks for, and a data: URL so the document stays one file. */
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%2307080b'/%3E%3Ccircle cx='50' cy='50' r='17' fill='%23d9a441'/%3E%3Ccircle cx='50' cy='50' r='7' fill='%23fff'/%3E%3C/svg%3E";

/* Anything embedded in a <script> block has to survive the HTML parser,
   which ends the block at the first "</script" regardless of context. */
const inlineSafe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

/* This build has no <head>, so it cannot carry a <meta charset>. A host that
   serves it without a charset would decode em dashes and middots as Latin-1
   mojibake, so nothing non-ASCII is left in the file to misread.
   \\uXXXX is valid JSON, valid JavaScript, and inert inside a comment;
   entities cover the markup. */
const uEsc = (s) => s.replace(/[^\x00-\x7F]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const hEsc = (s) => s.replace(/[^\x00-\x7F]/g, (c) => '&#' + c.charCodeAt(0) + ';');

/* ---------- fonts ---------- */
/* Google's subsets split each face across unicode ranges; the "-2" files are
   the latin block that actually renders English, the others are latin-ext,
   Vietnamese and Cyrillic. Dropping those halves the payload and changes
   nothing on screen for an English Bible. */
let css = readFileSync(r('src/fonts.css'), 'utf8');
const faces = css.split(/(?=@font-face)/).filter((b) => b.includes('@font-face'));
let kept = 0, dropped = 0;
const out = [];
for (const face of faces) {
  const m = face.match(/url\(fonts\/([^)]+)\)/);
  if (!m) continue;
  if (!/-2\.woff2$/.test(m[1])) { dropped++; continue; }
  const file = r('fonts/' + m[1]);
  if (!existsSync(file)) { dropped++; continue; }
  const b64 = readFileSync(file).toString('base64');
  out.push(face.replace(/url\(fonts\/[^)]+\)/, `url(data:font/woff2;base64,${b64})`).trim());
  kept++;
}
const fontCss = out.join('\n');

/* ---------- modules ---------- */
/* Each file becomes an IIFE. gate.js and esv.js publish what the others
   import onto two globals; every import line is rewritten to read from them.
   Wrapping matters beyond tidiness — the sources declare colliding top-level
   names that only stayed separate because they were separate modules. */
const wrap = (name, code) => `/* ===== ${name} ===== */\n(function(){\n${code}\n})();`;

const strip = (src) => src
  .replace(/^\s*import\s+\{\s*ESV\s*\}\s+from\s+['"][^'"]+['"];?\s*$/m, 'var ESV = window.__VL_ESV;')
  .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]\.\/gate\.js['"];?\s*$/m,
    (_, names) => `var ${names.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => `${n} = window.__VL_GATE.${n}`).join(', ')};`)
  .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^(\s*)export\s+/gm, '$1');

const mod = (f) => strip(readFileSync(r('src/' + f), 'utf8'));

const gate = wrap('gate.js', mod('gate.js') +
  '\nwindow.__VL_GATE = { TOUCH: TOUCH, SCALE: SCALE, visible: visible, limiter: limiter };');
const esv = wrap('esv.js', mod('esv.js') + '\nwindow.__VL_ESV = ESV;');

/* ---------- data ---------- */
const blocks = [];
const embed = (id, path) => {
  const text = readFileSync(r(path), 'utf8');
  blocks.push(`<script type="application/json" id="${id}">${uEsc(inlineSafe(text))}<\/script>`);
  return text.length;
};
let dataBytes = embed('vl-devotional', 'data/devotional.json');
for (let b = 1; b <= 66; b++) dataBytes += embed('vl-book-' + b, `data/books/${b}.json`);
/* The Study reference tables: the canon index, the per-book overview, and
   the teachings of Jesus. */
const TABLES = { canon: 'data/canon.json', overview: 'data/bible-overview.json',
                 teach: 'data/jesus-teachings.json' };
for (const [k, path] of Object.entries(TABLES)) dataBytes += embed('vl-' + k, path);

/* The shim answers from the embedded blocks and passes everything else
   through, so the ESV request in esv.js still reaches the network. */
const shim = `/* ===== embedded Scripture ===== */
(function(){
  var real = window.fetch ? window.fetch.bind(window) : null;
  var FLAT = {
    'data/devotional.json': 'vl-devotional',
    'data/canon.json': 'vl-canon',
    'data/bible-overview.json': 'vl-overview',
    'data/jesus-teachings.json': 'vl-teach'
  };
  var map = function(u){
    var p = String(u).split('?')[0].replace(/^\\.\\//, '');
    if (FLAT[p]) return FLAT[p];
    var m = p.match(/^data\\/books\\/(\\d+)\\.json$/);
    return m ? 'vl-book-' + m[1] : null;
  };
  window.fetch = function(u, o){
    var id = map(u), el = id && document.getElementById(id);
    if (el) return Promise.resolve(new Response(el.textContent,
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return real ? real(u, o) : Promise.reject(new Error('offline'));
  };
})();`;

/* ---------- document ---------- */
let html = readFileSync(r('src/index.html'), 'utf8');

/* Just the product name — a hosted page is listed by its title, and the
   tagline the site's <title> carries for search engines only gets in the way
   of recognising it in a list. */
const title = 'Verselight';
const styles = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];

/* Body only: the host wraps this in its own document skeleton. */
let body = html.replace(/[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
body = body
  .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, '')      // module tags → inlined below
  .replace(/<script>[\s\S]*?serviceWorker[\s\S]*?<\/script>/g, '');  // no SW on a single file

const code = [shim, gate, esv,
  ...['devotional.js', 'study.js', 'app.js', 'bg.js', 'cross.js', 'plate.js'].map((f) => wrap(f, mod(f)))
].join('\n');

const HEAD = `<title>${hEsc(title)}</title>
<style>
${fontCss}
</style>
${hEsc(styles)}`;

const BODY = `${hEsc(body)}
${blocks.join('\n')}
<script>
${uEsc(code)}
<\/script>`;

const page = HEAD + '\n' + BODY + '\n';

/* Two shapes of the same app. FRAGMENT suits a host that supplies its own
   <html> and <head> around the content; FULL is a complete document that can
   be dropped on any static host on its own — so it carries the head the
   fragment does without, including everything a phone needs to install it to
   a home screen. There is no separate manifest file to lose, so it travels
   as a data: URL. */
const MANIFEST = JSON.stringify({
  name: 'Verselight', short_name: 'Verselight',
  description: 'The complete Bible and a year of daily devotionals. Works offline.',
  start_url: './', scope: './', display: 'standalone',
  background_color: '#07080b', theme_color: '#07080b',
  icons: [{ src: ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});

const full = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#07080b">
<meta name="description" content="Verselight - the complete Bible and a year of daily devotionals. Works entirely offline, anywhere on earth.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Verselight">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="${ICON}">
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(MANIFEST)}">
${HEAD}
</head>
<body>
${BODY}
</body>
</html>
`;

mkdirSync(dirname(FULL), { recursive: true });
writeFileSync(OUT, page);
writeFileSync(FULL, full);

for (const [name, doc] of [['fragment', page], ['drop-in', full]]) {
  if (/[^\x00-\x7F]/.test(doc)) throw new Error(name + ': non-ASCII survived — charset-dependent output');
  const ext = (doc.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || [])
    .filter((u) => !u.includes('api.esv.org'));
  if (ext.length) throw new Error(name + ': still references an external host: ' + ext[0]);
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`✔ ${kept} font faces inlined (${dropped} non-latin subsets dropped)`);
console.log(`✔ 66 books + devotional embedded — ${mb(dataBytes)} of text`);
console.log(`✔ ${OUT.split('/').pop()} — ${mb(page.length)}  (fragment, for a host that supplies <head>)`);
console.log(`✔ dist/index.html — ${mb(full.length)}  (complete document, drop straight on any host)`);
