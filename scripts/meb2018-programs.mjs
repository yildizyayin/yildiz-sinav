// Owner (9 Nov): previous MEB programmes (2018/2019) still serve grades 4, 8 and 12 in 2026-2027. These readers take
// the text extracted from the official programme PDFs (mufredat.meb.gov.tr, pdftotext -layout) and return each
// outcome with its official code. Nothing is guessed: an outcome is a line that starts with its code at the left
// margin, continued by the following unindented lines; English outcomes are read from their table column.
const CODE={
 TUR:g=>new RegExp(`^T\\.${g}\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
 MAT:g=>new RegExp(`^M\\.${g}\\.\\d+\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
 FEN:g=>new RegExp(`^F\\.${g}\\.\\d+\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
 INK:g=>new RegExp(`^İTA\\.${g}\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
 DIN:g=>new RegExp(`^${g}\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
 SOS:g=>new RegExp(`^SB\\.${g}\\.\\d+\\.\\d+(?:\\.(?=[\\s\\p{L}])|(?=\\s))`,'u'),
};
const UNIT={
 TUR:g=>new RegExp(`^T\\.${g}\\.(\\d+)\\.\\s+(.+)$`),
 MAT:g=>new RegExp(`^M\\.${g}\\.(\\d+\\.\\d+)\\.\\s+(.+)$`),
 FEN:g=>new RegExp(`^F\\.${g}\\.(\\d+\\.\\d+)\\.\\s+(.+)$`),
 INK:()=>/^\s*(\d+)\.\s*ÜNİTE:\s*(.+)$/,
 DIN:g=>new RegExp(`^\\s*${g}\\.(\\d+)\\.\\s+([^.]+?)\\s*$`),
 SOS:()=>/^\s*(\d+)\.\s+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ,'’-]+?)\s*$/u,
};
const STOP=/^(Önerilen Süre|Konu \/ Kavramlar|Kazanım ve Açıklamaları|\d+\.\s*SINIF)/;
const clean=s=>s.replace(/[\s\u00a0]+/g,' ').trim();
const ENDED=/[.!?)]\s*$/;
const BULLET=/^\s*([\uf000-\uf8ff•●▪\-–]|[a-zçğıöşü]\)|[a-zçğıöşü]\.\s)/;
const ANY_CODE=/^\s*(T|M|F|İTA|SB|E\d+)\.\d+\.\d+|^\s*\d+\.\d+\.\d+\./;
function joinLines(lines){
 let out='';
 for(const raw of lines){const l=raw.trim();if(!out){out=l;continue;}
  if(/[a-zçğıöşü]-$/i.test(out)&&/^[a-zçğıöşü]/.test(l))out=out.slice(0,-1)+l; else out+=' '+l;}
 return clean(out);
}
export function readMarginOutcomes(text,subject,grade){
 const code=CODE[subject](grade),unitRe=UNIT[subject](grade),lines=String(text).split(/\r?\n/);
 const out=[],seen=new Map();let unit=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const u=line.match(unitRe);if(u&&!code.test(line)&&!/\.{5,}/.test(line))unit=clean(u[2]);
  const m=line.match(code);if(!m)continue;
  const parts=[line.slice(m[0].length)];
  for(let j=i+1;j<lines.length;j++){const n=lines[j];
   if(!n.trim()||code.test(n)||ANY_CODE.test(n)||STOP.test(n)||(unitRe.test(n)&&!/^\s/.test(n)))break;
   // an indented line continues the sentence only while it is unfinished and is not an explanation bullet
   if(/^\s/.test(n)&&(ENDED.test(joinLines(parts))||BULLET.test(n)))break;
   parts.push(n);}
  const c=m[0].replace(/\.$/,''),title=joinLines(parts);
  if(seen.has(c)){const prev=seen.get(c);if(prev.title!==title)prev.conflicts=(prev.conflicts||[]).concat(title);continue;}
  const o={code:c,title,unit};seen.set(c,o);out.push(o);
 }
 return out;
}
// English: "E8.1.SI1. Students will be able to …" sits in the middle column; the sentence is read from that column
// (text before the next run of 2+ spaces) on the following lines until it ends with a full stop.
export function readEnglishOutcomes(text,grade){
 const re=new RegExp(`E${grade}\\.(\\d+)\\.([A-Z]+\\d+)\\.?`),lines=String(text).split(/\r?\n/),out=[],seen=new Set();
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(re);if(!m)continue;
  const col=m.index,code=`E${grade}.${m[1]}.${m[2]}`;if(seen.has(code))continue;
  let t=lines[i].slice(col+m[0].length).split(/\s{2,}/)[0].trim();
  for(let j=i+1;j<lines.length&&!/\.\s*$/.test(t)&&j<i+12;j++){
   const n=lines[j];if(n.length<=col)continue;
   if(n.slice(Math.max(0,col-2),col).trim())continue; // first column runs into this one: not ours
   const seg=n.slice(col).split(/\s{2,}/)[0].trim();
   if(!seg||re.test(seg)||/^(Listening|Reading|Writing|Spoken (Interaction|Production))$/.test(seg))continue;
   t+=' '+seg;
  }
  seen.add(code);out.push({code,title:clean(t),unit:`Unit ${m[1]}`});
 }
 return out;
}

// Grade 12 (secondary programmes, 2018): each programme numbers its outcomes its own way.
//  MAT/FIZ/KIM/BIY: "12.1.1.1. …" (unit "12.1. …"); COG/DIN: "12.1.1. …" (unit "12.1. …");
//  INK (T.C. İnkılap Tarihi, a 12th-grade-only course): "1.1. …" under "1. ÜNİTE: …";
//  EDB (Türk Dili ve Edebiyatı): one outcome set for grades 9-12, "A.1. 1." / "B.1." / "C.2. 3.".
// Table rows (code, title, then numbers) and contents lines (dot leaders) are never outcomes.
const TABLE_ROW=/\s{3,}\d+(\s+\d+)*\s*$|\.{5,}/;
const SCHOOL12={
 MAT:{code:/^\s*12\.\d+\.\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/},
 FIZ:{code:/^\s*12\.\d+\.\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/},
 KIM:{code:/^\s*12\.\d+\.\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/},
 BIY:{code:/^\s*12\.\d+\.\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/},
 // Coğrafya has two 12th-grade sets with the same codes: the 4-hour programme (AYT) comes first, the 2-hour one after
 // "COĞRAFYA DERSİ 11 VE 12. SINIFLAR"; the 4-hour set is read.
 COG:{code:/^\s*12\.\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/,start:/^\s*12\. SINIF ÜNİTE, KAZANIM VE AÇIKLAMALARI\s*$/,end:/^\s*COĞRAFYA DERSİ 11 VE 12\. SINIFLAR\s*$/},
 // the PDF prints 12.2.1 as "12,2.1."; the comma is read as the dot it stands for
 DIN:{code:/^\s*12[.,]\d+\.\d+(?:\.(?=[\s\p{L}])|(?=\s))/u,unit:/^\s*12\.(\d+)\.\s+(\S.*?)\s*$/},
 // the PDF prints outcome 8.2 as "8.2.1990 sonrasında …" (no space before the year)
 INK:{code:/^\s*\d+\.\d+\.(?=\s|\d{4}\s)/u,unit:/^\s*(\d+)\.\s*ÜNİTE:\s*(.+?)\s*$/,start:/^\s*1\.\s*ÜNİTE:/},
 EDB:{code:/^\s*[A-C]\.(?:\d+\.\s*)?\d+\.(?=\s)/u,unit:/^\s*(?:([A-C])\)\s+|(\d+)\.\s+)([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ()/,-]+?)\s*$/u,start:/^\s*3\.2\.\s*KONU, KAZANIM/},
};
const CODE12=new RegExp('^\\s*(?:'+['12\\.\\d+\\.\\d+','[A-C]\\.(?:\\d+\\.\\s*)?\\d+\\.','\\d+\\.\\d+\\.(?=\\s)'].join('|')+')','u');
export function readSchool12(text,subject){
 const cfg=SCHOOL12[subject];if(!cfg)throw Error('NO_GRADE12_READER:'+subject);
 let lines=String(text).split(/\r?\n/);
 if(cfg.start){const at=lines.findIndex(l=>cfg.start.test(l)&&!TABLE_ROW.test(l));if(at<0)throw Error('START_NOT_FOUND:'+subject);lines=lines.slice(at);}
 if(cfg.end){const to=lines.findIndex(l=>cfg.end.test(l));if(to<0)throw Error('END_NOT_FOUND:'+subject);lines=lines.slice(0,to);}
 const out=[],seen=new Map();let unit=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(TABLE_ROW.test(line))continue;
  const m=line.match(cfg.code);
  if(!m){const u=line.match(cfg.unit);if(u)unit=clean(u[u.length-1]);continue;}
  const parts=[line.slice(m[0].length)];
  for(let j=i+1;j<lines.length;j++){const n=lines[j];
   if(!n.trim()||cfg.code.test(n)||CODE12.test(n)||STOP.test(n.trim())||TABLE_ROW.test(n)||cfg.unit.test(n))break;
   if(ENDED.test(joinLines(parts))||BULLET.test(n))break;
   parts.push(n);}
  const c=m[0].trim().replace(/\s+/g,'').replace(/,/g,'.').replace(/\.$/,''),title=joinLines(parts);
  if(seen.has(c)){const prev=seen.get(c);if(prev.title!==title)prev.conflicts=(prev.conflicts||[]).concat(title);continue;}
  const o={code:c,title,unit};seen.set(c,o);out.push(o);
 }
 return out;
}
export function readProgram(text,subject,grade){return subject==='ING'?readEnglishOutcomes(text,grade):grade===12?readSchool12(text,subject):readMarginOutcomes(text,subject,grade);}
