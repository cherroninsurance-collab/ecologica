#!/usr/bin/env node
/* Verselight — two bundles for working in a chat rather than a repo.
 *
 * The deployable build embeds all 4.2 MB of Scripture, which is correct for a
 * host and useless for a conversation: an assistant asked to change one colour
 * would have to reproduce the entire Bible to hand the file back. So this
 * splits the app along the line that actually matters — code, which is edited,
 * versus data, which is generated.
 *
 *   dist/verselight-source.txt   every source file, ~130 KB. Attach this to a
 *                                chat and ask for changes; the reply is small
 *                                enough to be a real edit rather than a
 *                                truncated approximation.
 *
 *   dist/verselight-demo.html    one runnable file, ~200 KB. The complete
 *                                design and every interaction, carrying a
 *                                sample of Scripture instead of all of it, so
 *                                it renders as a chat artifact and can be
 *                                regenerated in full.
 *
 * Usage: node tools/bundle.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(ROOT, p);
mkdirSync(r('dist'), { recursive: true });

const SRC = ['index.html', 'app.js', 'devotional.js', 'study.js', 'esv.js',
             'gate.js', 'bg.js', 'cross.js', 'plate.js'];

/* ---------------- 1 · source bundle ---------------- */

const header = `VERSELIGHT — COMPLETE SOURCE
============================

The whole app except two generated assets: fonts/ (30 self-hosted woff2 files)
and data/ (66 Scripture files, the devotional, and three study tables). Those
are built once and sit beside the code; nothing below needs them to be read or
edited.

Files are separated by lines beginning "===== FILE:". To change something, ask
for the affected file back in full — they are small on purpose.

Build:  node tools/build.mjs      copies src/ to the site root
        node tools/artifact.mjs   folds everything into one deployable file

`;

const parts = [header];
for (const f of SRC) {
  const code = readFileSync(r('src/' + f), 'utf8');
  parts.push(`\n===== FILE: src/${f} (${(code.length / 1024).toFixed(1)} KB) =====\n\n${code}`);
}
const bundle = parts.join('\n');
writeFileSync(r('dist/verselight-source.txt'), bundle);

/* ---------------- 2 · runnable demo ---------------- */

/* Which Scripture rides along. The devotional cites a passage a day, and a
   reader opening the app expects the famous chapters to be there; everything
   else is one fetch away in the full build. Whole books are kept rather than
   verse ranges so the reader's chapter navigation still behaves. */
/* A gospel and an epistle: enough to exercise the reader, chapter navigation
   and search without carrying Genesis (207 KB), Psalms (242 KB) or Isaiah
   (201 KB), any one of which would double the file on its own. */
const DEMO_BOOKS = [
  43,   // John          104 KB
  50,   // Philippians    12 KB
];
const MAX_DAYS = 30;

const devo = JSON.parse(readFileSync(r('data/devotional.json'), 'utf8'));

/* Keep the days whose passage this file can actually show, drawn from the
   whole year rather than the first few weeks — a reading that cannot display
   its own text is worse than one fewer reading. */
const demoDevo = {
  ...devo,
  days: devo.days.filter((d) => DEMO_BOOKS.includes(d.ref[0])).slice(0, MAX_DAYS),
};

const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const uEsc = (s) => s.replace(/[^\x00-\x7F]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const hEsc = (s) => s.replace(/[^\x00-\x7F]/g, (c) => '&#' + c.charCodeAt(0) + ';');

const blocks = [];
let dataBytes = 0;
const embed = (id, text) => {
  blocks.push(`<script type="application/json" id="${id}">${uEsc(esc(text))}<\/script>`);
  dataBytes += text.length;
};
embed('vl-devotional', JSON.stringify(demoDevo));
for (const b of DEMO_BOOKS) embed('vl-book-' + b, readFileSync(r(`data/books/${b}.json`), 'utf8'));
for (const [id, f] of [['vl-canon', 'canon.json'], ['vl-overview', 'bible-overview.json'],
                       ['vl-teach', 'jesus-teachings.json']]) {
  embed(id, readFileSync(r('data/' + f), 'utf8'));
}

/* A book that did not ride along resolves to an empty one, which the reader
   already renders as "unavailable" rather than failing. */
const shim = `(function(){
  var real = window.fetch ? window.fetch.bind(window) : null;
  var FLAT = { 'data/devotional.json':'vl-devotional', 'data/canon.json':'vl-canon',
               'data/bible-overview.json':'vl-overview', 'data/jesus-teachings.json':'vl-teach' };
  var json = function(t){ return new Response(t, { status:200,
    headers:{ 'Content-Type':'application/json' } }); };
  window.fetch = function(u, o){
    var p = String(u).split('?')[0].replace(/^\\.\\//, '');
    if (FLAT[p]) return Promise.resolve(json(document.getElementById(FLAT[p]).textContent));
    var m = p.match(/^data\\/books\\/(\\d+)\\.json$/);
    if (m) {
      var el = document.getElementById('vl-book-' + m[1]);
      return Promise.resolve(json(el ? el.textContent
        : JSON.stringify({ b:+m[1], rows:[], missing:true })));
    }
    return real ? real(u, o) : Promise.reject(new Error('offline'));
  };
})();`;

/* No fonts: 1.3 MB of base64 would dwarf the code and defeat the point. The
   stacks already name real fallbacks, so the demo renders in Georgia and the
   system UI face rather than silently in Times. */
const wrap = (name, code) => `/* ===== ${name} ===== */\n(function(){\n${code}\n})();`;
const strip = (src) => src
  .replace(/^\s*import\s+\{\s*ESV\s*\}\s+from\s+['"][^'"]+['"];?\s*$/m, 'var ESV = window.__VL_ESV;')
  .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]\.\/gate\.js['"];?\s*$/m,
    (_, names) => `var ${names.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => `${n} = window.__VL_GATE.${n}`).join(', ')};`)
  .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^(\s*)export\s+/gm, '$1');
const mod = (f) => strip(readFileSync(r('src/' + f), 'utf8'));

const code = [
  shim,
  wrap('gate.js', mod('gate.js') +
    '\nwindow.__VL_GATE = { TOUCH:TOUCH, SCALE:SCALE, visible:visible, limiter:limiter };'),
  wrap('esv.js', mod('esv.js') + '\nwindow.__VL_ESV = ESV;'),
  ...['devotional.js', 'study.js', 'app.js', 'bg.js', 'cross.js', 'plate.js']
    .map((f) => wrap(f, mod(f))),
].join('\n');

const html = readFileSync(r('src/index.html'), 'utf8');
const styles = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
let body = html.replace(/[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, '')
  .replace(/<script>[\s\S]*?serviceWorker[\s\S]*?<\/script>/g, '');

const demo = `<title>Verselight</title>
${hEsc(styles)}
${hEsc(body)}
${blocks.join('\n')}
<script>
${uEsc(code)}
<\/script>
`;
writeFileSync(r('dist/verselight-demo.html'), demo);

if (/[^\x00-\x7F]/.test(demo)) throw new Error('non-ASCII survived in the demo');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`✔ dist/verselight-source.txt — ${kb(bundle.length)} · ${SRC.length} files`);
console.log(`✔ dist/verselight-demo.html  — ${kb(demo.length)} · ` +
  `${DEMO_BOOKS.length} books, ${demoDevo.days.length} devotional days, all 9 study modules`);
