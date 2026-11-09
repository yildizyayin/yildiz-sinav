// Owner (9 Nov): in 2026-2027 grades 4, 8 and 12 still follow the previous MEB programmes (TYMM covers 1-3, 5-7 and
// hazırlık, 9-11 — tymm.meb.gov.tr). This collector fetches those official programme PDFs from mufredat.meb.gov.tr for
// review: it records each PDF's SHA-256 and its extracted text. Read-only: no secrets, no database access.
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const ORIGIN='https://mufredat.meb.gov.tr';
// [key, programme page id, subject, grades this programme serves in 2026-2027]
const PROGRAMS=[
 ['tur-2019',663,'TUR',[4,8]],
 ['mat-temel-2018',329,'MAT',[4,8]],
 ['fen-2018',325,'FEN',[4,8]],
 ['ink-temel-2018',355,'INK',[8]],
 ['din-4-8-2018',318,'DIN',[4,8]],
 ['ing-2-8-2018',327,'ING',[4,8]],
 ['sos-2018',354,'SOS',[4]],
];
const get=async(url,binary=false)=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'user-agent':'ANUNEX curriculum collector'}});if(!r.ok)throw Error('HTTP_'+r.status+':'+url);return binary?Buffer.from(await r.arrayBuffer()):r.text();};
await mkdir('meb2018',{recursive:true});
const report={collectedAt:new Date().toISOString(),source:ORIGIN,programs:[]};
for(const [key,pid,subject,grades] of PROGRAMS){
 const page=`${ORIGIN}/ProgramDetay.aspx?PID=${pid}`,entry={key,pid,subject,grades,page,title:null,pdfUrl:null,sha256:null,bytes:0,textFile:null,error:null};
 try{
  const html=await get(page);
  entry.title=(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'').trim();
  const hrefs=[...html.matchAll(/href=["']([^"']+\.pdf)["']/gi)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),page).href);
  if(!hrefs.length)throw Error('PDF_LINK_NOT_FOUND');
  entry.pdfUrl=hrefs[0];entry.otherPdfs=hrefs.slice(1);
  const pdf=await get(entry.pdfUrl,true);entry.bytes=pdf.length;entry.sha256=createHash('sha256').update(pdf).digest('hex');
  await writeFile(`meb2018/${key}.pdf`,pdf);
  execFileSync('pdftotext',['-layout','-enc','UTF-8',`meb2018/${key}.pdf`,`meb2018/${key}.txt`]);
  entry.textFile=`data/maarif/meb2018/${key}.txt`;
 }catch(e){entry.error=String(e.message||e);}
 report.programs.push(entry);console.log(key,pid,entry.bytes,'bytes',entry.sha256?.slice(0,12)||'',entry.error||'');
}
// Programme index: every ProgramDetay link reachable from the site's programme list pages, with its link text,
// so the next grades' programme ids are read from the official site rather than guessed.
report.index=[];
try{
 const seen=new Set(),queue=[ORIGIN+'/'];
 for(let k=0;k<queue.length&&k<25;k++){
  const html=await get(queue[k]).catch(()=>'');
  for(const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
   const href=new URL(m[1].replace(/&amp;/g,'&'),queue[k]).href,text=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   const pid=href.match(/ProgramDetay\.aspx\?PID=(\d+)/i)?.[1];
   if(pid&&!seen.has(pid)){seen.add(pid);report.index.push({pid:Number(pid),text,from:queue[k]});}
   else if(!pid&&href.startsWith(ORIGIN)&&/Program/i.test(href)&&!queue.includes(href))queue.push(href);
  }
 }
}catch(e){report.indexError=String(e.message||e);}
await writeFile('meb2018/collected.json',JSON.stringify(report,null,1));
