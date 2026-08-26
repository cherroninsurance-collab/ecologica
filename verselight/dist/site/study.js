/* Verselight — Study: the learning modules.
 *
 * Nine ways into the same text. Three are games built for children, three
 * drill the disciplines an adult teacher needs, and three are reference: the
 * whole canon book by book, everything Jesus taught, and the map of where
 * the commission sends you.
 *
 * Each module is a function handed an empty element. Nothing renders until a
 * card is tapped, and the three reference tables are fetched on first use —
 * a reader who never opens Study never pays for it.
 */

import { ESV } from './esv.js';

const $ = (id) => document.getElementById(id);

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const shuffle = (a) => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- narration ----------
   The device synthesizer, but with the best installed voice chosen by score
   rather than whatever the browser defaults to — which is reliably the worst
   one present. Long passages are split into sentences because Chrome
   silently truncates an utterance past roughly two hundred characters, which
   is why naive speechSynthesis calls cut off mid-verse. */
const Voice = (() => {
  const PREFERRED = [
    'Google UK English Male', 'Google UK English Female', 'Google US English',
    'Microsoft Guy Online', 'Microsoft Aria Online', 'Microsoft Ryan Online',
    'Daniel', 'Serena', 'Samantha', 'Alex', 'Karen', 'Moira', 'Tessa',
  ];
  let voice = null, queue = [], speaking = false;
  let onState = () => {};

  function pick() {
    if (!('speechSynthesis' in window)) return null;
    const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    if (!all.length) return null;
    const score = (v) => {
      let s = 0;
      const i = PREFERRED.indexOf(v.name);
      if (i >= 0) s += 1000 - i * 10;
      if (/natural|neural|premium|enhanced/i.test(v.name)) s += 400;
      if (/compact|espeak|robot/i.test(v.name)) s -= 500;
      if (v.localService) s += 60;            // still works with the network off
      if (/en-GB/i.test(v.lang)) s += 25;     // reads Jacobean English well
      if (v.default) s += 10;
      return s;
    };
    return all.slice().sort((a, b) => score(b) - score(a))[0];
  }

  if ('speechSynthesis' in window) {
    voice = pick();
    speechSynthesis.onvoiceschanged = () => { voice = pick(); };
  }

  const sentences = (text) => String(text)
    .replace(/\s+/g, ' ').replace(/[""]/g, '')
    .match(/[^.!?;:]+[.!?;:]*/g) || [text];

  function next() {
    if (!queue.length) { speaking = false; onState(false); return; }
    const u = new SpeechSynthesisUtterance(queue.shift().trim());
    if (voice) u.voice = voice;
    u.rate = 0.88;                            // unhurried; this is Scripture
    u.pitch = 0.98;
    u.onend = next;
    u.onerror = next;
    speechSynthesis.speak(u);
  }

  return {
    available: () => 'speechSynthesis' in window,
    onStateChange(fn) { onState = fn; },
    speaking: () => speaking,
    stop() {
      queue = []; speaking = false;
      try { speechSynthesis.cancel(); } catch (_) {}
      onState(false);
    },
    speak(text) {
      this.stop();
      if (!text || !('speechSynthesis' in window)) return;
      speaking = true; onState(true);
      queue = sentences(text);
      next();
    },
    toggle(text) { if (speaking) this.stop(); else this.speak(text); },
  };
})();

const say = (t) => Voice.speak(t);

function celebrate(host, msg) {
  const r = el('div', 'sx-result');
  r.append(el('div', 'big', '✦'), el('p', null, msg));
  host.append(r);
  r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- reference tables, fetched on first use ---------- */
let CANON = null, OVERVIEW = null, TEACH = null;
async function tables() {
  if (CANON && OVERVIEW && TEACH) return true;
  try {
    const [c, o, t] = await Promise.all([
      fetch('data/canon.json').then((r) => r.json()),
      fetch('data/bible-overview.json').then((r) => r.json()),
      fetch('data/jesus-teachings.json').then((r) => r.json()),
    ]);
    CANON = c; OVERVIEW = o; TEACH = t;
    return true;
  } catch (_) {
    return false;
  }
}

/* ======================= games ======================= */

const CREATION_DAYS = [
  { n: 1, label: 'Light and Darkness', ref: 'Genesis 1:3-5' },
  { n: 2, label: 'Sky and Waters', ref: 'Genesis 1:6-8' },
  { n: 3, label: 'Land and Plants', ref: 'Genesis 1:9-13' },
  { n: 4, label: 'Sun, Moon, Stars', ref: 'Genesis 1:14-19' },
  { n: 5, label: 'Fish and Birds', ref: 'Genesis 1:20-23' },
  { n: 6, label: 'Animals and People', ref: 'Genesis 1:24-31' },
  { n: 7, label: 'God Rested', ref: 'Genesis 2:1-3' },
];

/* Sequence the seven days. A wrong tap never punishes — it nudges the card
   and re-reads the question. */
function gameCreation(host) {
  let next = 0;
  const rail = el('div', 'sx-rail');
  CREATION_DAYS.forEach(() => rail.append(document.createElement('i')));
  const slots = el('div', 'sx-slots'), pool = el('div', 'sx-slots');
  host.append(rail, slots, pool);

  shuffle(CREATION_DAYS).forEach((day) => {
    const card = el('button', 'sx-card');
    card.append(el('strong', null, day.label), el('small', null, day.ref));
    card.onclick = () => {
      if (day.n === CREATION_DAYS[next].n) {
        card.disabled = true;
        card.classList.add('placed');
        card.querySelector('strong').textContent = `Day ${day.n} · ${day.label}`;
        slots.append(card);
        rail.children[next].classList.add('lit');
        next++;
        if (next === CREATION_DAYS.length) {
          celebrate(host, 'You built the whole first week. God spoke, and it was so — and everything He made was very good.');
        }
      } else {
        card.classList.remove('wrong'); void card.offsetWidth; card.classList.add('wrong');
        say(`Not yet. What came on day ${next + 1}?`);
      }
    };
    pool.append(card);
  });
}

const HEROES = [
  { hero: 'Noah', deed: 'Built the ark when no rain had ever fallen', ref: 'Genesis 6' },
  { hero: 'David', deed: 'Faced the giant with a sling and God’s name', ref: '1 Samuel 17' },
  { hero: 'Daniel', deed: 'Kept praying, even facing the lions’ den', ref: 'Daniel 6' },
  { hero: 'Esther', deed: 'Went to the king to save her people', ref: 'Esther 4' },
  { hero: 'Ruth', deed: 'Stayed loyal and followed the true God', ref: 'Ruth 1' },
  { hero: 'Mary', deed: 'Said yes to God and became Jesus’ mother', ref: 'Luke 1' },
];

function gameHeroes(host) {
  let picked = null, done = 0;
  host.append(el('p', 'sx-lead', 'Tap a name, then tap the brave thing God helped them do.'));
  const wrap = el('div', 'sx-two');
  const heroCol = el('div', 'sx-col'), deedCol = el('div', 'sx-col');
  wrap.append(heroCol, deedCol);
  host.append(wrap);

  HEROES.forEach((h) => {
    const b = el('button', 'sx-card');
    b.append(el('strong', null, h.hero));
    b.dataset.hero = h.hero;
    b.onclick = () => {
      if (b.disabled) return;
      heroCol.querySelectorAll('.sx-card').forEach((x) => x.classList.remove('picked'));
      b.classList.add('picked');
      picked = h;
    };
    heroCol.append(b);
  });

  shuffle(HEROES).forEach((h) => {
    const b = el('button', 'sx-card');
    b.append(el('strong', null, h.deed), el('small', null, h.ref));
    b.onclick = () => {
      if (b.disabled) return;
      if (!picked) { say('Pick a name first.'); return; }
      if (picked.hero === h.hero) {
        b.disabled = true; b.classList.add('placed');
        const hb = heroCol.querySelector(`[data-hero="${h.hero}"]`);
        hb.disabled = true; hb.classList.remove('picked'); hb.classList.add('placed');
        picked = null; done++;
        if (done === HEROES.length) {
          celebrate(host, 'Every one of them was an ordinary person with an extraordinary God. He is the same God today — and He knows your name.');
        }
      } else {
        b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
      }
    };
    deedCol.append(b);
  });
}

const MEMORY_VERSES = [
  { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son.' },
  { ref: 'Psalm 119:105', text: 'Thy word is a lamp unto my feet, and a light unto my path.' },
  { ref: 'Genesis 1:1', text: 'In the beginning God created the heaven and the earth.' },
];

function gameVerse(host) {
  const verse = MEMORY_VERSES[Math.floor(Math.random() * MEMORY_VERSES.length)];
  const words = verse.text.split(/\s+/);
  let next = 0;
  host.append(el('p', 'sx-lead', `Tap the words in order — ${verse.ref}`));
  const line = el('div', 'sx-line'), pool = el('div', 'sx-tiles');
  host.append(line, pool);

  shuffle(words.map((w, i) => ({ w, i }))).forEach(({ w, i }) => {
    const tile = el('button', 'sx-tile', w);
    tile.onclick = () => {
      /* The exact position counts, and so does an identical repeated word —
         otherwise "God" in the wrong slot reads as a mistake it isn't. */
      if (i === next || w === words[next]) {
        tile.classList.add('used');
        tile.disabled = true;
        const span = el('span', null, (next ? ' ' : '') + w);
        line.append(span);
        requestAnimationFrame(() => span.classList.add('lit'));
        next++;
        if (next === words.length) {
          line.classList.add('done');
          say(verse.text);
          celebrate(host, `You built ${verse.ref}. Say it out loud three times — the Word hidden in your heart goes with you everywhere.`);
        }
      } else {
        tile.classList.remove('wrong'); void tile.offsetWidth; tile.classList.add('wrong');
        say(words.slice(0, next).join(' '));
      }
    };
    pool.append(tile);
  });
}

/* ======================= study ======================= */

const EPOCHS = [
  { n: 1, label: 'Creation', ref: 'Genesis 1–2' },
  { n: 2, label: 'The Fall', ref: 'Genesis 3' },
  { n: 3, label: 'Covenant with Abraham', ref: 'Genesis 12' },
  { n: 4, label: 'The Exodus', ref: 'Exodus 12–14' },
  { n: 5, label: 'Law at Sinai', ref: 'Exodus 20' },
  { n: 6, label: 'Davidic Kingdom', ref: '2 Samuel 7' },
  { n: 7, label: 'Exile & Prophets', ref: 'Isaiah 53' },
  { n: 8, label: 'The Incarnation', ref: 'Luke 2' },
  { n: 9, label: 'Cross & Resurrection', ref: 'Luke 23–24' },
  { n: 10, label: 'Pentecost & the Church', ref: 'Acts 2' },
  { n: 11, label: 'New Creation', ref: 'Revelation 21' },
];

function moduleChronology(host) {
  let next = 0;
  host.append(el('p', 'sx-lead', 'Place the eleven epochs of redemptive history in order.'));
  const rail = el('div', 'sx-rail');
  EPOCHS.forEach(() => rail.append(document.createElement('i')));
  const slots = el('div', 'sx-slots'), pool = el('div', 'sx-slots');
  host.append(rail, slots, pool);

  shuffle(EPOCHS).forEach((e) => {
    const c = el('button', 'sx-card');
    c.append(el('strong', null, e.label), el('small', null, e.ref));
    c.onclick = () => {
      if (e.n === EPOCHS[next].n) {
        c.disabled = true; c.classList.add('placed');
        slots.append(c); rail.children[next].classList.add('lit'); next++;
        if (next === EPOCHS.length) {
          celebrate(host, 'One story, one Author, one Redeemer. From the garden to the city every epoch bends toward Christ — "beginning at Moses and all the prophets, he expounded unto them in all the scriptures the things concerning himself." (Luke 24:27)');
        }
      } else {
        c.classList.remove('wrong'); void c.offsetWidth; c.classList.add('wrong');
      }
    };
    pool.append(c);
  });
}

const EXEGESIS = [
  {
    passage: 'Philippians 2:5-8',
    text: 'Let this mind be in you, which was also in Christ Jesus: who, being in the form of God, thought it not robbery to be equal with God: but made himself of no reputation, and took upon him the form of a servant…',
    steps: [
      { stage: 'OBSERVATION', q: 'What does the text actually SAY about Christ’s status before the incarnation?',
        opts: ['He was created first among all beings',
               'He was in the form of God and equal with God',
               'He became divine after His resurrection'],
        a: 1, why: 'The text states He "was in the form of God" and held equality with God prior to emptying Himself. Observation asks what is on the page — not yet what it means.' },
      { stage: 'INTERPRETATION', q: 'What does "made himself of no reputation" mean in context?',
        opts: ['He ceased to be God',
               'He gave up His divine attributes permanently',
               'He did not cling to His privileges but took the form of a servant'],
        a: 2, why: 'The grammar defines the emptying by the participle that follows: "and took upon him the form of a servant." He added humanity and veiled glory; He did not subtract deity. Context, not English connotation, governs meaning.' },
      { stage: 'APPLICATION', q: 'What does Paul command the church to DO with this?',
        opts: ['Adopt Christ’s self-lowering mindset toward one another',
               'Debate the two natures of Christ precisely',
               'Wait passively for exaltation'],
        a: 0, why: 'The hymn is framed by an imperative: "Let this mind be in you." The deepest Christology in Scripture is deployed to settle a church squabble. Doctrine always lands in obedience.' },
    ],
  },
  {
    passage: 'Romans 3:23-24',
    text: 'For all have sinned, and come short of the glory of God; being justified freely by his grace through the redemption that is in Christ Jesus.',
    steps: [
      { stage: 'OBSERVATION', q: 'What is the scope of the word "all"?',
        opts: ['Only the notably wicked', 'Every human being without exception', 'Only those outside the covenant'],
        a: 1, why: 'Paul has spent chapters 1–3 closing every escape route — moralist, pagan and religious alike. "All" is universal, which is why the remedy must be universal too.' },
      { stage: 'INTERPRETATION', q: 'What does "justified" mean here?',
        opts: ['Made gradually more moral over time',
               'Declared righteous in God’s courtroom',
               'Forgiven but still legally guilty'],
        a: 1, why: 'Justification is forensic — a legal declaration, not an infusion of improvement. God pronounces the ungodly righteous on the basis of Christ’s redemption, not their progress.' },
      { stage: 'APPLICATION', q: 'What follows for someone still trying to earn God’s favour?',
        opts: ['Try harder with better methods',
               'Receive as a gift what can never be earned',
               'Balance grace with sufficient merit'],
        a: 1, why: '"Freely by his grace" forecloses the transaction. Adding merit to grace does not improve the gospel — it abolishes it (Galatians 2:21).' },
    ],
  },
];

function moduleExegesis(host) {
  const study = EXEGESIS[Math.floor(Math.random() * EXEGESIS.length)];
  let idx = 0, score = 0;
  const passage = el('div', 'sx-block');
  passage.innerHTML = `<span class="kind">${esc(study.passage)}</span><p class="quote">${esc(study.text)}</p>`;
  const rail = el('div', 'sx-rail');
  study.steps.forEach(() => rail.append(document.createElement('i')));
  const stage = el('div');
  host.append(passage, rail, stage);

  function render() {
    const s = study.steps[idx];
    stage.innerHTML = '';
    stage.append(el('span', 'sx-eyebrow', `Step ${idx + 1} of ${study.steps.length} · ${s.stage}`));
    stage.append(el('p', 'sx-q', s.q));
    let answered = false;
    s.opts.forEach((opt, i) => {
      const b = el('button', 'sx-opt', opt);
      b.onclick = () => {
        if (answered) return;
        answered = true;
        const right = i === s.a;
        if (right) score++;
        b.classList.add(right ? 'correct' : 'miss');
        if (!right) stage.querySelectorAll('.sx-opt')[s.a].classList.add('correct');
        const ex = el('div', 'sx-explain');
        ex.innerHTML = `<b>${right ? 'Correct.' : 'Not quite.'}</b> ${esc(s.why)}`;
        stage.append(ex);
        rail.children[idx].classList.add('lit');
        const nextBtn = el('button', 'sx-go',
          idx < study.steps.length - 1 ? 'Next step ›' : 'Finish the drill');
        nextBtn.onclick = () => {
          idx++;
          if (idx < study.steps.length) render();
          else {
            stage.innerHTML = '';
            celebrate(stage, `${score} of ${study.steps.length} on ${study.passage}. Observation before interpretation, interpretation before application — the discipline that keeps a teacher from preaching their own imagination.`);
          }
        };
        stage.append(nextBtn);
      };
      stage.append(b);
    });
  }
  render();
}

const THREADS = [
  { theme: 'The Lamb', chain: [
    { ref: 'Genesis 22:8', note: '"God will provide himself a lamb" — Abraham on the mountain.' },
    { ref: 'Exodus 12:13', note: 'The Passover blood on the doorposts: judgment passes over.' },
    { ref: 'Isaiah 53:7', note: '"As a lamb to the slaughter" — the silent Servant.' },
    { ref: 'John 1:29', note: '"Behold the Lamb of God, which taketh away the sin of the world."' },
    { ref: 'Revelation 5:6', note: 'The Lamb standing, as though slain — worthy to open the scroll.' },
  ] },
  { theme: 'The Temple', chain: [
    { ref: 'Exodus 40:34', note: 'The glory fills the tabernacle — God dwells among His people.' },
    { ref: '1 Kings 8:11', note: 'The cloud fills Solomon’s temple at its dedication.' },
    { ref: 'Ezekiel 10:18', note: 'The glory departs; sin drives out the presence.' },
    { ref: 'John 2:19-21', note: '"Destroy this temple" — He spake of the temple of his body.' },
    { ref: '1 Corinthians 3:16', note: 'You yourselves are God’s temple, indwelt by His Spirit.' },
  ] },
  { theme: 'The Kingdom', chain: [
    { ref: 'Genesis 1:28', note: 'Humanity commissioned to rule creation under God.' },
    { ref: '2 Samuel 7:16', note: 'David’s throne established for ever.' },
    { ref: 'Daniel 7:14', note: 'One like a son of man receives everlasting dominion.' },
    { ref: 'Mark 1:15', note: '"The kingdom of God is at hand: repent ye, and believe."' },
    { ref: 'Revelation 11:15', note: 'The kingdoms of this world become the kingdoms of our Lord.' },
  ] },
];

function moduleConcordance(host) {
  const thread = THREADS[Math.floor(Math.random() * THREADS.length)];
  let next = 0;
  host.append(el('p', 'sx-lead',
    `Thread: ${thread.theme}. Tap the references in canonical order to trace how the promise unfolds.`));
  const rail = el('div', 'sx-rail');
  thread.chain.forEach(() => rail.append(document.createElement('i')));
  const trace = el('div'), pool = el('div', 'sx-slots');
  host.append(rail, trace, pool);

  shuffle(thread.chain).forEach((link) => {
    const b = el('button', 'sx-card');
    b.append(el('strong', null, link.ref));
    b.onclick = () => {
      if (link.ref === thread.chain[next].ref) {
        b.disabled = true; b.style.display = 'none';
        const step = el('div', 'sx-block');
        step.innerHTML = `<span class="kind">${next + 1} · ${esc(link.ref)}</span><p>${esc(link.note)}</p>`;
        trace.append(step);
        rail.children[next].classList.add('lit');
        next++;
        if (next === thread.chain.length) {
          celebrate(host, `The thread of ${thread.theme} runs unbroken from Genesis to Revelation. Sixty-six books, forty authors, sixteen centuries — one Mind behind it, and one Christ at its centre.`);
        }
      } else {
        b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
      }
    };
    pool.append(b);
  });
}

/* ======================= reference ======================= */

async function moduleBooks(host) {
  if (!await tables()) { host.append(el('p', 'sx-lead', 'Reference tables unavailable.')); return; }
  const grid = el('div', 'sx-books'), detail = el('div');
  host.append(grid, detail);
  OVERVIEW.books.forEach((ov) => {
    const meta = CANON[ov.b] || {};
    const c = el('button', 'sx-mini' + (meta.testament === 'OT' ? ' ot' : ''));
    c.innerHTML = `<b>${esc(meta.name || 'Book ' + ov.b)}</b><span>${meta.testament === 'OT' ? 'Old' : 'New'}</span>`;
    c.onclick = () => {
      grid.querySelectorAll('.sx-mini').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      detail.innerHTML =
        `<div class="sx-block lead"><span class="kind">${esc(meta.name)} — ${esc(ov.t)}</span>
           <p class="quote">Key verse: ${esc(ov.kv)}</p></div>` +
        ov.ls.map((l, i) => `<div class="sx-block"><span class="kind">Lesson ${i + 1}</span><p>${esc(l)}</p></div>`).join('') +
        `<div class="sx-block christ"><span class="kind">Where is Jesus here?</span><p>${esc(ov.c)}</p></div>`;
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    grid.append(c);
  });
}

async function moduleTeachings(host) {
  if (!await tables()) { host.append(el('p', 'sx-lead', 'Reference tables unavailable.')); return; }
  TEACH.categories.forEach((cat) => {
    const head = el('div', 'sx-block lead');
    head.innerHTML = `<span class="kind">${esc(cat.title)} · ${esc(cat.ref)}</span><p>${esc(cat.intro)}</p>`;
    host.append(head);
    cat.items.forEach((it) => {
      const acc = el('div', 'sx-acc');
      const btn = el('button');
      btn.innerHTML = `<b>${esc(it.title)}</b><small>${esc(it.ref)}</small>`;
      const inner = el('div', 'inner');
      inner.hidden = true;
      inner.innerHTML =
        `<div class="sx-block"><span class="kind">What Jesus taught</span><p>${esc(it.teaching)}</p></div>
         <div class="sx-block christ"><span class="kind">Live it</span><p>${esc(it.live)}</p></div>`;
      btn.onclick = () => { inner.hidden = !inner.hidden; acc.classList.toggle('open', !inner.hidden); };
      acc.append(btn, inner);
      host.append(acc);
    });
  });
}

const MISSION_RINGS = [
  { r: 0.13, label: 'JERUSALEM', note: 'Where you already are' },
  { r: 0.30, label: 'JUDEA', note: 'Your own people and region' },
  { r: 0.48, label: 'SAMARIA', note: 'The neighbours you would rather avoid' },
  { r: 0.72, label: 'ENDS OF THE EARTH', note: 'Every nation, tribe and tongue' },
];

function moduleMaps(host) {
  host.append(el('p', 'sx-lead',
    '"But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth." — Acts 1:8'));
  const cv = el('canvas', 'sx-map');
  const legend = el('div');
  host.append(cv, legend);
  legend.innerHTML = MISSION_RINGS.map((r, i) =>
    `<div class="sx-block"><span class="kind">${i + 1} · ${r.label}</span><p>${r.note}</p></div>`).join('');

  requestAnimationFrame(() => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07080b'); g.addColorStop(1, '#141824');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.62;
    const gold = '#d9a441';
    MISSION_RINGS.slice().reverse().forEach((ring) => {
      const rr = base * ring.r;
      const grd = ctx.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
      grd.addColorStop(0, 'rgba(217,164,65,0)');
      grd.addColorStop(1, 'rgba(217,164,65,.10)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = gold + '66';
      ctx.setLineDash([4, 8]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(244,241,234,.72)';
      ctx.font = '600 9.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ring.label, cx, cy - rr + 14);
    });
    for (let i = 0; i < 12; i++) {                 // the dispatch, radiating out
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * base * 0.72, y = cy + Math.sin(a) * base * 0.72;
      const grad = ctx.createLinearGradient(cx, cy, x, y);
      grad.addColorStop(0, gold + 'cc');
      grad.addColorStop(1, gold + '00');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    core.addColorStop(0, '#fff8e1'); core.addColorStop(1, gold + '00');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
  });
}

/* ======================= router ======================= */

const MODULES = {
  books: ['The Sixty-Six', 'Every book of the canon: its theme, key verse, main lessons, and where it points to Christ.', moduleBooks],
  teachings: ['The Teachings of Jesus', 'The Sermon, the parables, the seven I AMs, the miracles, and His final words.', moduleTeachings],
  chronology: ['Testament Illuminations', 'Eleven epochs of redemptive history. Place them along the river of light.', moduleChronology],
  exegesis: ['Exegesis Training', 'The inductive method drilled: observation, then interpretation, then application.', moduleExegesis],
  concordance: ['Redemptive Threads', 'Trace one theme across both testaments in canonical order.', moduleConcordance],
  maps: ['The Acts 1:8 Dispatch', 'Concentric commission: the gospel moves outward from wherever you stand.', moduleMaps],
  creation: ['The Creation Adventure', 'Seven days, in the order God spoke them. Tap each day as it comes.', gameCreation],
  heroes: ['Heroes of Faith', 'Ordinary people, extraordinary God. Match each name to their brave act.', gameHeroes],
  verse: ['Build the Verse', 'Every word in its place — then watch the whole verse light up.', gameVerse],
};

function openModule(id) {
  const m = MODULES[id];
  if (!m) return;
  const sheet = $('studySheet');
  $('studyTitle').textContent = m[0];
  $('studySub').textContent = m[1];
  const body = $('studyBody');
  body.innerHTML = '';
  sheet.classList.add('on');
  sheet.querySelector('.box').scrollTop = 0;
  m[2](body);
}

function closeStudy() {
  Voice.stop();
  $('studySheet').classList.remove('on');
}

function boot() {
  const sheet = $('studySheet');
  if (!sheet) return;

  document.querySelectorAll('[data-module]').forEach((b) => {
    b.addEventListener('click', () => openModule(b.dataset.module));
  });
  $('studyClose').addEventListener('click', closeStudy);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeStudy(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('on')) closeStudy(); });

  /* Read the open passage aloud. Hidden outright when the device has no
     synthesizer, rather than offering a button that does nothing. */
  const listen = $('listenBtn');
  if (listen) {
    if (!Voice.available()) listen.style.display = 'none';
    else {
      listen.addEventListener('click', () => {
        const t = $('devoTitle')?.textContent || '';
        const v = [...document.querySelectorAll('#devoVerses .v')]
          .map((n) => n.textContent.replace(/^\d+/, '')).join(' ');
        Voice.toggle(t + '. ' + v);
      });
      Voice.onStateChange((on) => { listen.textContent = on ? 'Stop' : 'Listen'; });
    }
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();

export { Voice, ESV };
