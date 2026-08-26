import { ESV } from './esv.js';

/* Verselight — reader, search, and interaction layer */

const BOOKS=[
["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],
["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],
["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],
["Nehemiah",13],["Esther",10],["Job",42],["Psalms",150],["Proverbs",31],
["Ecclesiastes",12],["Song of Solomon",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],
["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],
["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],
["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],
["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],
["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],
["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],
["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],
["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],
["Jude",1],["Revelation",22]
];
const NT_START=40;
const $ = id => document.getElementById(id);

const cache={};
let cur={b:1,c:1};
let marks=JSON.parse(localStorage.getItem('vl_marks')||'{}');

async function getBook(b){
  if(cache[b])return cache[b];
  const paths=[`data/books/${b}.json`,`./data/books/${b}.json`];
  for(const p of paths){
    try{
      const r=await fetch(p);
      if(!r.ok)continue;
      cache[b]=await r.json();
      return cache[b];
    }catch(e){}
  }
  cache[b]={b,rows:[],missing:true};
  return cache[b];
}

/* Warm the rest of Scripture quietly in the background, one book at a time,
   so the first search has nothing left to fetch. The whole Bible is 4.4 MB —
   fine over wifi, rude over a metered phone connection — so this is skipped
   entirely when the browser reports Data Saver or a slow network, and the
   search still works without it. */
function warmScripture(){
  const c=navigator.connection;
  if(c&&(c.saveData||/2g|slow/.test(c.effectiveType||'')))return;
  let b=1;
  const next=()=>{
    while(b<=66&&cache[b])b++;
    if(b>66)return;
    getBook(b++).then(()=>{
      /* requestIdleCallback keeps this behind anything the reader is doing. */
      (window.requestIdleCallback||((f)=>setTimeout(f,300)))(next,{timeout:2000});
    });
  };
  next();
}
addEventListener('load',()=>setTimeout(warmScripture,2500));

/* ---------- sidebar ---------- */
const booklist=$('booklist');
function renderBooks(filter=''){
  const f=filter.trim().toLowerCase();
  let html='',ot=false,nt=false;
  BOOKS.forEach((bk,i)=>{
    const id=i+1;
    if(f&&!bk[0].toLowerCase().includes(f))return;
    if(!ot&&id<NT_START){html+='<div class="testa">Old Testament</div>';ot=true;}
    if(!nt&&id>=NT_START){html+='<div class="testa">New Testament</div>';nt=true;}
    html+=`<button class="bk ${cur.b===id?'active':''}" data-b="${id}">${bk[0]}<span>${bk[1]}</span></button>`;
  });
  booklist.innerHTML=html||'<div class="testa">No match</div>';
}
booklist.addEventListener('click',e=>{
  const b=e.target.closest('.bk');
  if(b)openChapter(+b.dataset.b,1);
});
$('bookFilter').addEventListener('input',e=>renderBooks(e.target.value));

/* ---------- reader ---------- */
const versesEl=$('verses'), chaptabs=$('chaptabs'), chapsel=$('chapsel');

async function openChapter(b,c,scroll=true){
  cur={b,c};
  const meta=BOOKS[b-1];
  $('bookTitle').textContent=meta[0];
  $('crumb').textContent=(b<NT_START?'Old Testament':'New Testament')+' · Chapter '+c;
  renderBooks($('bookFilter').value);
  chapsel.innerHTML=Array.from({length:meta[1]},(_,i)=>`<option value="${i+1}" ${i+1===c?'selected':''}>Ch. ${i+1}</option>`).join('');
  chaptabs.innerHTML=Array.from({length:meta[1]},(_,i)=>`<button class="ct ${i+1===c?'on':''}" data-c="${i+1}">${i+1}</button>`).join('');
  $('prev').disabled=(b===1&&c===1);
  $('next').disabled=(b===66&&c===meta[1]);
  versesEl.innerHTML='<div class="loading">Loading '+meta[0]+' '+c+'…</div>';

  const data=await getBook(b);
  if(cur.b!==b||cur.c!==c)return;
  if(data.missing){
    /* A filename is not an explanation. This happens in the sample build,
       which carries only some books on purpose, so say which book is not
       here rather than which file failed. */
    versesEl.innerHTML='<div class="loading">'+meta[0]+' is not included in this edition.</div>';
    return;
  }
  const paint=(rws,note)=>{
    versesEl.innerHTML=rws.length
      ? rws.map((r,i)=>{
          const k=b+':'+c+':'+r[1];
          return `<div class="v ${i===0?'first':''} ${marks[k]?'mark':''}" data-k="${k}" style="--i:${i}"><b>${r[1]}</b>${r[2]}</div>`;
        }).join('') + (note?`<div class="loading" style="text-align:left;opacity:.45;font-size:11px;margin-top:18px">${note}</div>`:'')
      : '<div class="loading">Chapter not found</div>';
  };
  const rows=(data.rows||[]).filter(r=>r[0]===c);
  paint(rows,null);

  /* With a key and a signal, re-render the same chapter in ESV. */
  ESV.rows(meta[0]+' '+c, c).then(esvRows=>{
    if(!esvRows||cur.b!==b||cur.c!==c)return;
    paint(esvRows, ESV.NOTICE);
    bindVerseTaps();
  });

  function bindVerseTaps(){}
  versesEl.querySelectorAll('.v').forEach((el,i)=>{
    el.animate(
      [{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],
      {duration:520,delay:Math.min(i*22,700),easing:'cubic-bezier(.2,.8,.3,1)',fill:'backwards'}
    );
  });
  localStorage.setItem('vl_last',b+':'+c);
  if(scroll)$('read').scrollIntoView({behavior:'smooth'});
}

chaptabs.addEventListener('click',e=>{const t=e.target.closest('.ct');if(t)openChapter(cur.b,+t.dataset.c,false)});
chapsel.addEventListener('change',e=>openChapter(cur.b,+e.target.value,false));
versesEl.addEventListener('click',e=>{
  const v=e.target.closest('.v');
  if(!v||!v.dataset.k)return;
  const k=v.dataset.k;
  if(marks[k]){delete marks[k];v.classList.remove('mark')}
  else{marks[k]=1;v.classList.add('mark');window.verselightPulse&&window.verselightPulse()}
  localStorage.setItem('vl_marks',JSON.stringify(marks));
});
$('prev').onclick=()=>{
  if(cur.c>1)openChapter(cur.b,cur.c-1,false);
  else if(cur.b>1)openChapter(cur.b-1,BOOKS[cur.b-2][1],false);
};
$('next').onclick=()=>{
  if(cur.c<BOOKS[cur.b-1][1])openChapter(cur.b,cur.c+1,false);
  else if(cur.b<66)openChapter(cur.b+1,1,false);
};
addEventListener('keydown',e=>{
  if(document.activeElement.tagName==='INPUT')return;
  if(e.key==='ArrowLeft')$('prev').click();
  if(e.key==='ArrowRight')$('next').click();
});

/* ---------- search ---------- */
const resultsEl=$('results');
let searchRun=0;
async function runSearch(q){
  q=q.trim().toLowerCase();
  if(q.length<2){resultsEl.innerHTML='<div class="loading">Type at least two characters</div>';return}
  const run=++searchRun;

  const rx=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
  const head=(n,done)=>`${n}${n>=200?'+':''} result${n===1?'':'s'}${done?'':' so far…'}`;
  const row=([b,c,v,t])=>`<div class="v" data-open="${b}|${c}">
      <span class="res-src">${BOOKS[b-1][0]} ${c}:${v}</span>${t.replace(rx,'<mark style="background:rgba(217,164,65,.35);color:inherit">$1</mark>')}</div>`;

  /* Scanning all thirty-one thousand verses takes about ten milliseconds.
     Every await, by contrast, hands a turn back to the event loop, where the
     WebGL loops are waiting to paint — so the old version spent seconds
     yielding and no measurable time searching. When the books are already in
     memory the whole search therefore runs in one synchronous pass with no
     yields at all, and paints once. */
  const missing=[];
  for(let b=1;b<=66;b++) if(!cache[b]) missing.push(b);

  const scan=()=>{
    let found=0,html='';
    for(let b=1;b<=66;b++){
      const d=cache[b];
      if(!d)continue;
      for(const r of d.rows||[]){
        if(found>=200)return{found,html,capped:true};
        if(r[2].toLowerCase().includes(q)){found++;html+=row([b,r[0],r[1],r[2]])}
      }
    }
    return{found,html,capped:false};
  };

  const paint=(res,done)=>{
    if(!res.found&&done){
      resultsEl.innerHTML='<div class="loading">No verses matched “'+q+'”</div>';
      return;
    }
    const n=res.found;
    resultsEl.innerHTML=
      `<div class="loading" style="padding:0 0 22px">${head(n,done)}</div>`+res.html;
  };

  if(!missing.length){                       // warm: one pass, one paint
    const res=scan();
    paint(res,true);
    if(res.found)window.verselightPulse&&window.verselightPulse();
    return;
  }

  /* Cold: every request goes out at once rather than in batches, and the
     list is repainted as books land so Genesis matches show while Revelation
     is still in flight. */
  resultsEl.innerHTML='<div class="loading">Searching all 66 books…</div>';
  const inflight=missing.map(b=>getBook(b).then(()=>b));
  let pulsed=false,lastPaint=0,capped=false;
  for(let i=0;i<inflight.length&&!capped;i++){
    await inflight[i];
    if(run!==searchRun)return;                            // query moved on
    /* Rescanning is cheap but not free, so intermediate paints are throttled
       to roughly five a second — enough to feel live, few enough that the
       progress display never costs more than the search. */
    const now=performance.now();
    if(now-lastPaint<180&&i<inflight.length-1)continue;
    lastPaint=now;
    const res=scan();
    paint(res,false);
    capped=res.capped;
    if(res.found&&!pulsed){pulsed=true;window.verselightPulse&&window.verselightPulse()}
  }
  if(run!==searchRun)return;
  paint(scan(),true);
}
$('q').addEventListener('keydown',e=>{if(e.key==='Enter')runSearch(e.target.value)});
document.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>{$('q').value=b.dataset.ex;runSearch(b.dataset.ex)});
resultsEl.addEventListener('click',e=>{
  const v=e.target.closest('[data-open]');
  if(!v)return;
  const [b,c]=v.dataset.open.split('|').map(Number);
  openChapter(b,c);
});

/* ---------- verse of the moment ---------- */
const PICKS=[[1,1,3],[19,23,1],[43,3,16],[45,8,28],[23,40,31],[20,3,5],[19,46,1],[40,5,14],[50,4,13],[19,119,105],[23,9,2],[66,21,4]];
async function vom(){
  const [b,c,v]=PICKS[Math.floor(Math.random()*PICKS.length)];
  const d=await getBook(b);
  const row=(d.rows||[]).find(r=>r[0]===c&&r[1]===v);
  if(!row)return;
  const el=$('vomText');
  el.style.opacity=0;
  setTimeout(()=>{
    el.innerHTML=row[2].replace(/\b(light|love|faith|hope|strength|peace|joy|glory|life)\b/i,'<em>$1</em>');
    $('vomCite').textContent=`${BOOKS[b-1][0]} ${c}:${v}`;
    el.style.transition='opacity .6s';
    el.style.opacity=1;
    window.verselightPulse&&window.verselightPulse();
  },220);
  $('vomOpen').onclick=()=>openChapter(b,c);
}
$('vomNew').onclick=vom;

/* ---------- misc ---------- */
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>$(b.dataset.go).scrollIntoView({behavior:'smooth'}));
$('randomLink').onclick=e=>{
  e.preventDefault();
  const b=1+Math.floor(Math.random()*66);
  openChapter(b,1+Math.floor(Math.random()*BOOKS[b-1][1]));
};

/* nav contrast over light bands */
const lightBands=[...document.querySelectorAll('.band.paper,.band.alt')];
const nav=$('nav');
addEventListener('scroll',()=>{
  const y=64;
  nav.classList.toggle('light',lightBands.some(el=>{const r=el.getBoundingClientRect();return r.top<y&&r.bottom>y}));
},{passive:true});

/* card spotlight follow */
document.querySelectorAll('.card').forEach(c=>{
  c.addEventListener('pointermove',e=>{
    const r=c.getBoundingClientRect();
    c.style.setProperty('--mx',(e.clientX-r.left)+'px');
    c.style.setProperty('--my',(e.clientY-r.top)+'px');
  });
});

/* reveal on scroll */
const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:.06});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

/* Animated counters, driven by elapsed time rather than tick count. The
   interval version advanced a fixed step per callback, so whenever the
   WebGL layers saturated the main thread the numbers crawled and settled
   on the wrong values — the hero read "7 books, 132 chapters". */
[[$('s1'),66,''],[$('s2'),1189,''],[$('s3'),31,'k']].forEach(([el,n,suf])=>{
  if(!el)return;
  const DUR=1100, t0=performance.now();
  const ease=t=>1-Math.pow(1-t,3);
  (function tick(now){
    const t=Math.min((now-t0)/DUR,1);
    el.textContent=Math.round(n*ease(t))+suf;
    if(t<1)requestAnimationFrame(tick); else el.textContent=n+suf;
  })(t0);
});

/* boot — restore last read position */
renderBooks();
const last=(localStorage.getItem('vl_last')||'1:1').split(':').map(Number);
openChapter(last[0]||1,last[1]||1,false);
vom();

/* Repaint the open chapter when the translation changes. */
ESV.onChange(() => { if (typeof cur === 'object') openChapter(cur.b, cur.c, false); });
