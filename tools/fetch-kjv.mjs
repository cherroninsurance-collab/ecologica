/* Fetch the complete public-domain KJV and compile it into the app's
   offline bundle format. Run once; the result ships inside the build. */
import { writeFileSync } from 'node:fs';

const FILES = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges',
'Ruth','1Samuel','2Samuel','1Kings','2Kings','1Chronicles','2Chronicles','Ezra','Nehemiah',
'Esther','Job','Psalms','Proverbs','Ecclesiastes','SongofSolomon','Isaiah','Jeremiah',
'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum',
'Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts',
'Romans','1Corinthians','2Corinthians','Galatians','Ephesians','Philippians','Colossians',
'1Thessalonians','2Thessalonians','1Timothy','2Timothy','Titus','Philemon','Hebrews','James',
'1Peter','2Peter','1John','2John','3John','Jude','Revelation'];

const BASE = 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/';
const verses = [];
let failures = [];

for (let i = 0; i < FILES.length; i++) {
  const bookId = i + 1;
  const url = BASE + FILES[i] + '.json';
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      for (const ch of data.chapters) {
        const c = Number(ch.chapter);
        for (const v of ch.verses) {
          verses.push({ b: bookId, c, v: Number(v.verse), t: v.text.trim() });
        }
      }
      ok = true;
    } catch (e) {
      if (attempt === 2) failures.push(FILES[i] + ': ' + e.message);
      else await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  if (bookId % 12 === 0) console.log(`  …${bookId}/66 books, ${verses.length} verses`);
}

if (failures.length) { console.error('FAILED:', failures); process.exit(1); }

const books = new Set(verses.map(v => v.b));
console.log(`books: ${books.size}  verses: ${verses.length}  (KJV canonical total = 31102)`);

writeFileSync(process.argv[2], JSON.stringify({
  translation: {
    id: 'KJV',
    name: 'King James Version',
    language: 'en',
    copyright: 'King James Version (1611). Public domain worldwide. No license, royalty, or permission is required to copy, print, or distribute this text — anywhere on earth.',
    licensed: 1,
  },
  verses,
}));
console.log('wrote', process.argv[2]);
