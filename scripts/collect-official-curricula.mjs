// Owner (4 Nov): collect missing MEB TYMM programmes straight from tymm.meb.gov.tr (read-only, no database access).
// The output is reviewed and committed to the curriculum catalogue; the production deploy re-fetches the same pages
// and only publishes when the content still matches exactly (scripts/production-question-curricula.mjs).
import {writeFile} from 'node:fs/promises';
import {visibleText,sourceHash,mathThemeOutcomes} from './official-math-catalog.mjs';
import {branchThemeOutcomes} from './official-branch-catalog.mjs';
const ORIGIN='https://tymm.meb.gov.tr';
const BRANCH=[
 ['ilkokul-turkce-dersi',4,'/ogretim-programlari/ilkokul-turkce-dersi/5'],
 ['fen-bilimleri-dersi',4,'/ogretim-programlari/fen-bilimleri-dersi/5'],
 ['sosyal-bilgiler-dersi',4,'/ogretim-programlari/sosyal-bilgiler-dersi/5'],
 ['ingilizce-dersi-temel-egitim',4,'/ogretim-programlari/ingilizce-dersi-temel-egitim/5'],
 ['din-kulturu-ve-ahlak-bilgisi-dersi-temel-egitim',4,'/ogretim-programlari/din-kulturu-ve-ahlak-bilgisi-dersi-temel-egitim/5'],
 ['ortaokul-turkce-dersi',5,'/ogretim-programlari/ortaokul-turkce-dersi/6'],
 ['din-kulturu-ve-ahlak-bilgisi-dersi-ortaogretim',12,'/ogretim-programlari/din-kulturu-ve-ahlak-bilgisi-dersi-ortaogretim/14'],
];
const MATH=[['ilkokul-matematik-dersi',4,'/ogretim-programlari/ilkokul-matematik-dersi/5']];
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error',headers:{'user-agent':'ANUNEX curriculum collector'}});if(!r.ok)throw Error('HTTP_'+r.status+':'+url);const s=await r.text();if(s.length>5e6)throw Error('TOO_LARGE');return s;};
function themeLinks(html,course,indexUrl){
 const out=[];for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const u=new URL(m[1],indexUrl);if(u.origin===ORIGIN&&new RegExp(`^/${course}/unite/\\d+$`).test(u.pathname)&&!u.search&&!u.hash&&visibleText(m[2])&&!out.some(x=>x.url===u.href))out.push({url:u.href,label:visibleText(m[2])});}
 return out;
}
function outcomeSection(html){const start=html.indexOf('Öğrenme Çıktıları ve Süreç Bileşenleri'),end=html.indexOf('İçerik Çerçevesi',start);return start<0||end<=start?null:visibleText(html.slice(start,end).replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi,' | '));}
const report={collectedAt:new Date().toISOString(),branch:[],math:[]};
for(const [course,grade,path] of BRANCH){
 const indexUrl=ORIGIN+path,entry={course,grade,indexUrl,heading:null,themes:[],errors:[]};
 try{
  const index=await get(indexUrl);entry.heading=visibleText(index.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
  for(const link of themeLinks(index,course,indexUrl)){
   const html=await get(link.url),title=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
   const theme={url:link.url,label:link.label,title,hash:sourceHash(html)};
   try{theme.outcomes=branchThemeOutcomes(html,{course,grade},{url:link.url,title}).map(o=>[o.code,o.title]);}
   catch(e){theme.error=String(e.message||e);theme.section=outcomeSection(html)?.slice(0,20000)??null;}
   entry.themes.push(theme);
  }
 }catch(e){entry.errors.push(String(e.message||e));}
 report.branch.push(entry);console.log(course,grade,entry.themes.length,'themes',entry.themes.filter(t=>t.error).length,'errors',entry.errors.join(';'));
}
for(const [course,grade,path] of MATH){
 const indexUrl=ORIGIN+path,entry={course,grade,indexUrl,heading:null,themes:[],errors:[]};
 try{
  const index=await get(indexUrl);entry.heading=visibleText(index.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');entry.indexHash=sourceHash(index);
  for(const link of themeLinks(index,course,indexUrl)){
   const html=await get(link.url),title=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
   const theme={url:link.url,label:link.label,title,hash:sourceHash(html)};
   try{theme.outcomes=mathThemeOutcomes(html,grade,{url:link.url,title}).map(o=>[o.code,o.title]);}
   catch(e){theme.error=String(e.message||e);theme.section=outcomeSection(html)?.slice(0,20000)??null;}
   entry.themes.push(theme);
  }
 }catch(e){entry.errors.push(String(e.message||e));}
 report.math.push(entry);console.log(course,grade,entry.themes.length,'themes',entry.themes.filter(t=>t.error).length,'errors',entry.errors.join(';'));
}
await writeFile('official-curricula-collected.json',JSON.stringify(report,null,1));
