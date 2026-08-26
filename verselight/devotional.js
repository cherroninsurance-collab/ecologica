/* Verselight — The Descending Light: 365 daily readings.
 *
 * Scripture/reflection/prayer/today, the four-part shape the enduring
 * devotionals share. The passage is pulled live from the offline book
 * files rather than duplicated, so the reading always shows the real text
 * — and upgrades to ESV when a key and a signal are present.
 */

import { ESV } from './esv.js';

const $ = (id) => document.getElementById(id);

const BOOK_NAMES = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
  'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
  'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
  '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
  'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
];

let DEVO = null;
let offset = 0;
const bookCache = new Map();

async function book(b) {
  if (bookCache.has(b)) return bookCache.get(b);
  try {
    const r = await fetch('data/books/' + b + '.json');
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    bookCache.set(b, d);
    return d;
  } catch (_) {
    return null;
  }
}

/* Deterministic from the date, so a group reads the same entry without any
   server, and it survives reloads with no storage. */
function todayIndex(off) {
  const day = Math.floor(Date.now() / 86400000);
  const n = DEVO.days.length;
  return (((day + off) % n) + n) % n;
}

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function paintVerses(rows, label, note) {
  $('devoVerses').innerHTML =
    rows.map((r, i) => `<div class="v ${i === 0 ? 'first' : ''}"><b>${r[1]}</b>${esc(r[2])}</div>`).join('') +
    (note ? `<div class="loading" style="text-align:left;opacity:.45;font-size:11px;margin-top:14px">${esc(note)}</div>` : '');
  const ref = $('devoRef');
  if (ref && label) ref.innerHTML = ref.dataset.ref + ' &nbsp;·&nbsp; ' + label;
}

async function render() {
  if (!DEVO) return;
  const i = todayIndex(offset);
  const e = DEVO.days[i];
  const arc = (DEVO.arcs || []).find((a) => a.id === e.arc);

  $('devoArc').textContent = `Day ${e.d} of ${DEVO.days.length}` + (arc ? ` · ${arc.title}` : '');
  $('devoTitle').textContent = e.title;
  $('devoRef').dataset.ref = e.refLabel;
  $('devoRef').textContent = e.refLabel;
  $('devoReflection').textContent = e.reflection;
  $('devoPrayer').textContent = e.prayer;
  $('devoAction').textContent = e.today;
  $('devoVerses').innerHTML = '<div class="loading">Loading…</div>';

  const [b, c, from, to] = e.ref;
  const data = await book(b);
  if (i !== todayIndex(offset)) return;                 // user moved on

  const rows = data && data.rows
    ? data.rows.filter((r) => r[0] === c && r[1] >= from && r[1] <= to)
    : [];

  /* The ESV is asked for first, not swapped in afterwards — showing the KJV
     and replacing it mid-read is how the reading ended up in the wrong
     translation every time it opened. */
  const esvRows = ESV.enabled() ? await ESV.rows(e.refLabel, c) : null;
  if (i !== todayIndex(offset)) return;                 // user moved on again

  if (esvRows) paintVerses(esvRows, 'ESV', ESV.NOTICE);
  else if (rows.length) paintVerses(rows, 'KJV', null);
  else $('devoVerses').innerHTML = '<div class="loading">Passage unavailable offline</div>';
}

async function boot() {
  try {
    const r = await fetch('data/devotional.json');
    DEVO = await r.json();
  } catch (_) {
    const host = $('devotional');
    if (host) host.style.display = 'none';             // fail quietly, not loudly
    return;
  }
  $('devoPrev').addEventListener('click', () => { offset--; render(); });
  $('devoNext').addEventListener('click', () => { offset++; render(); });
  $('devoToday').addEventListener('click', () => { offset = 0; render(); });
  ESV.onChange(render);
  render();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();

export { BOOK_NAMES };
