/* Verselight — ESV over an offline KJV floor.
 *
 * Crossway's ESV API is free for non-commercial use (api.esv.org) and ships
 * enabled here, so the reader opens in the ESV with nothing to configure.
 *
 * What the ESV cannot be is wholly offline. Crossway's terms cap local
 * storage at 500 verses — a licensing boundary, not a technical one, and the
 * reason the complete ESV cannot be bundled the way the KJV is. Verselight
 * uses the whole allowance and stops there: passages you actually read are
 * saved and stay readable with no signal, evicted least-recently-used at the
 * cap. Past that the KJV takes over, which is public domain and already on
 * the device in full — so there is always a text, whatever the connection.
 */

const KEY = 'vl_esv_key';
const mem = new Map();          // session only, deliberately not persisted
const listeners = [];

/* The app's own Crossway key, so ESV is on out of the box rather than
   waiting for every reader to register for one. A key shipped in a page is
   readable by anyone who views source — that is unavoidable for a static app
   with no server, and it is why this one is registered for non-commercial
   use and why fetched verses are never written to storage. Replacing it in
   the Translation dialog overrides it on that device. */
const DEFAULT_KEY = '3fb0e2193893d14d7cc52f84e9f34a1e4148aca6';

let key = DEFAULT_KEY;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) key = saved;
} catch (_) {}

/* What the reader is actually looking at, which is not the same as whether
   there is a signal: a vaulted chapter reads ESV with the network off. The
   chip is painted from this rather than from connectivity, so it never
   claims a translation that is not on screen. */
let servedESV = null;
const chipWatchers = [];
function serve(isESV) {
  if (servedESV === isESV) return;
  servedESV = isESV;
  chipWatchers.forEach((fn) => { try { fn(); } catch (_) {} });
}

/* ---------- the vault: ESV that survives losing signal ----------
 *
 * Crossway's API terms permit storing up to 500 verses locally. That is the
 * whole allowance, and it is the reason the complete ESV cannot be shipped
 * the way the KJV is — not a technical limit, a licensed one.
 *
 * So the vault keeps exactly that much and no more: the passages actually
 * read, persisted, evicted least-recently-used once the cap is reached. Read
 * a chapter once with a signal and it stays readable without one. Everything
 * past 500 verses falls to the KJV, which is already on the device in full.
 *
 * The cap is enforced on write rather than trusted, because a cache that
 * quietly grows past its licence is the same as having no licence.
 */
const CAP = 500;
const VAULT = 'vl_esv_vault';
let vault = null;

function vaultLoad() {
  if (vault) return vault;
  try {
    vault = JSON.parse(localStorage.getItem(VAULT) || '{}');
    if (!vault || typeof vault !== 'object') vault = {};
  } catch (_) { vault = {}; }
  return vault;
}

const vaultCount = () =>
  Object.values(vaultLoad()).reduce((n, e) => n + (e.r ? e.r.length : 0), 0);

function vaultGet(ref) {
  const e = vaultLoad()[ref];
  if (!e) return null;
  e.t = Date.now();                       // touch, so reading keeps it alive
  vaultSave();
  return e.r;
}

function vaultSave() {
  try { localStorage.setItem(VAULT, JSON.stringify(vault)); }
  catch (_) { /* quota or private mode — the KJV still covers everything */ }
}

function vaultPut(ref, rows) {
  const v = vaultLoad();
  /* A single passage longer than the whole allowance is never stored: it
     cannot be held without exceeding the terms, and half a passage would be
     worse than none. */
  if (rows.length > CAP) return;
  v[ref] = { r: rows, t: Date.now() };

  /* Evict oldest-read first until the total is inside the cap. */
  let total = vaultCount();
  if (total > CAP) {
    const byAge = Object.keys(v).sort((a, b) => (v[a].t || 0) - (v[b].t || 0));
    for (const k of byAge) {
      if (total <= CAP) break;
      if (k === ref) continue;            // never evict what was just read
      total -= v[k].r.length;
      delete v[k];
    }
  }
  vaultSave();
}

export const ESV = {
  hasKey: () => !!key,
  usingDefault: () => key === DEFAULT_KEY,
  enabled: () => !!key && navigator.onLine,

  setKey(k) {
    const v = (k || '').trim();
    key = v || DEFAULT_KEY;                 // clearing returns to the app's key
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (_) {}
    mem.clear();
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  },

  onChange(fn) { listeners.push(fn); },

  vault: () => ({ verses: vaultCount(), cap: CAP }),
  serving: () => servedESV,
  onServed(fn) { chipWatchers.push(fn); },

  /* Returns [[chapter, verse, text], ...] — the same row shape the offline
     book files use — or null to fall back to the KJV. */
  async rows(refLabel, chapterNo) {
    const cached = mem.get(refLabel) || vaultGet(refLabel);
    if (cached) { serve(true); return cached; }   // works with no signal at all
    if (!this.enabled()) { serve(false); return null; }
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
      if (!out.length) { serve(false); return null; }
      mem.set(refLabel, out);
      vaultPut(refLabel, out);
      serve(true);
      return out;
    } catch (_) {
      serve(false);
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
  /* Before anything has rendered there is nothing served yet, so fall back to
     what the next render will produce. */
  const on = servedESV === null ? ESV.enabled() : servedESV;
  chip.textContent = on ? 'ESV' : 'KJV';
  chip.classList.toggle('esv', on);
}

function bind() {
  const chip = $('verChip'), sheet = $('keySheet');
  if (!chip || !sheet) return;

  /* Three states, and the copy has to tell them apart: reading ESV on the
     app's key, reading ESV on a key this device supplied, or offline and
     reading the KJV. */
  function status() {
    const v = ESV.vault();
    const held = v.verses
      ? ` ${v.verses} of ${v.cap} licensed verses are saved for offline reading.`
      : ` Passages you read are saved offline, up to the ${v.cap} verses the licence allows.`;
    if (!navigator.onLine) {
      return 'No signal.' + (v.verses
        ? ` Saved ESV passages still read; everything else falls back to the KJV.${held}`
        : ' Reading the offline KJV — ESV returns when you reconnect.');
    }
    if (ESV.usingDefault()) return 'Reading the ESV. No key needed — Verselight supplies one.' + held;
    return 'Reading the ESV on your own key.' + held;
  }

  const open = (e) => {
    if (e) e.preventDefault();
    $('keyInput').value = ESV.usingDefault() ? '' : '•••••••• saved';
    $('keyStatus').textContent = status();
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
    $('keyStatus').textContent = status();
    paintChip();
  });

  ESV.onChange(paintChip);
  ESV.onServed(paintChip);
  paintChip();

  /* Losing signal silently swaps the text back to the KJV; the chip has to
     say so, or it claims to be showing a translation it isn't. Both events
     also re-render, so the open chapter follows the label. */
  const changed = () => {
    paintChip();
    if (sheet.classList.contains('on')) $('keyStatus').textContent = status();
    listeners.forEach((fn) => { try { fn(); } catch (_) {} });
  };
  addEventListener('online', changed);
  addEventListener('offline', changed);
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bind);
else bind();

export { paintChip };
