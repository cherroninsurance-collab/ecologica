/* Verselight — optional ESV, layered over the offline KJV.
 *
 * Crossway's ESV API is FREE for non-commercial use (api.esv.org). What it
 * is not is offline: their terms cap local storage at 500 verses, so the
 * complete ESV cannot be cached on the device. That is a licensing
 * boundary, not a technical one, and Verselight respects it.
 *
 * So ESV is an online enhancement over an offline base. With a key and a
 * signal you read ESV; without either the KJV is already on the device and
 * nothing breaks. Fetched verses live in memory for the session only and
 * are never written to storage, which keeps usage inside the free terms.
 */

const KEY = 'vl_esv_key';
const mem = new Map();          // session only, deliberately not persisted
let key = null;
const listeners = [];

try { key = localStorage.getItem(KEY); } catch (_) {}

export const ESV = {
  hasKey: () => !!key,
  enabled: () => !!key && navigator.onLine,

  setKey(k) {
    key = (k || '').trim() || null;
    try { key ? localStorage.setItem(KEY, key) : localStorage.removeItem(KEY); } catch (_) {}
    mem.clear();
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  },

  onChange(fn) { listeners.push(fn); },

  /* Returns [[chapter, verse, text], ...] — the same row shape the offline
     book files use — or null to fall back to the KJV. */
  async rows(refLabel, chapterNo) {
    if (!this.enabled()) return null;
    const cached = mem.get(refLabel);
    if (cached) return cached;
    try {
      const url = 'https://api.esv.org/v3/passage/text/?q=' + encodeURIComponent(refLabel) +
        '&include-headings=false&include-footnotes=false&include-verse-numbers=true' +
        '&include-short-copyright=false&include-passage-references=false';
      const res = await fetch(url, { headers: { Authorization: 'Token ' + key } });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = (data.passages || []).join(' ').replace(/\s+/g, ' ').trim();
      if (!raw) return null;
      const out = [];
      const re = /\[(\d+)\]\s*([^[]*)/g;
      let m;
      while ((m = re.exec(raw))) out.push([chapterNo || 0, +m[1], m[2].trim()]);
      if (!out.length) return null;
      mem.set(refLabel, out);
      return out;
    } catch (_) {
      return null;                 // offline, refused, or rate-limited → KJV
    }
  },

  NOTICE: 'Scripture quotations marked ESV are from the ESV® Bible (The Holy ' +
    'Bible, English Standard Version®), copyright © 2001 by Crossway, a ' +
    'publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
};

/* ---------- the chip + key dialog ---------- */
const $ = (id) => document.getElementById(id);

function paintChip() {
  const chip = $('verChip');
  if (!chip) return;
  const on = ESV.enabled();
  chip.textContent = on ? 'ESV' : 'KJV';
  chip.classList.toggle('esv', on);
}

function bind() {
  const chip = $('verChip'), sheet = $('keySheet');
  if (!chip || !sheet) return;

  const open = (e) => {
    if (e) e.preventDefault();
    $('keyInput').value = ESV.hasKey() ? '•••••••• saved' : '';
    $('keyStatus').textContent = ESV.hasKey()
      ? 'Key saved. The reader and the devotional use ESV whenever you have signal.'
      : 'No key set — reading the offline KJV.';
    sheet.classList.add('on');
  };

  chip.addEventListener('click', open);
  /* The footer's Translation entry opens the same sheet — a link that goes
     nowhere is worse than no link at all. */
  const verLink = $('verLink');
  if (verLink) verLink.addEventListener('click', open);

  $('keyClose').addEventListener('click', () => sheet.classList.remove('on'));
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('on'); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.classList.remove('on'); });

  $('keySave').addEventListener('click', () => {
    const v = $('keyInput').value;
    if (v.indexOf('•') === -1) ESV.setKey(v);
    $('keyStatus').textContent = ESV.hasKey()
      ? 'Key saved. The reader and the devotional use ESV whenever you have signal.'
      : 'Key cleared — reading the offline KJV.';
    paintChip();
  });

  ESV.onChange(paintChip);
  paintChip();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bind);
else bind();

export { paintChip };
