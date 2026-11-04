// Rerun: parser V2 splits same-line outcomes; codes without a trailing dot.
// Owner (4 Nov): collect missing MEB TYMM programmes straight from tymm.meb.gov.tr (read-only, no database access).
// The output is reviewed and committed to the curriculum catalogue; the production deploy re-fetches the same pages
// and only publishes when the content still matches exactly (scripts/production-question-curricula.mjs).
import {writeFile} from 'node:fs/promises';
import {visibleText,sourceHash,mathThemeOutcomes} from './official-math-catalog.mjs';
import {readFile} from 'node:fs/promises';
import {branchThemeOutcomes,branchThemeOutcomesV2} from './official-branch-catalog.mjs';
import {expandBranchCatalog} from './production-question-curricula.mjs';
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
   try{theme.outcomes=branchThemeOutcomesV2(html,{course,grade},{url:link.url,title}).map(o=>[o.code,o.title]);}
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
// The robust reader must read every programme already in the catalogue exactly as before.
report.existingCheck={programs:0,themes:0,mismatches:[]};
for(const p of expandBranchCatalog(JSON.parse(await readFile('data/question-branch-catalog-2028.json','utf8'))).programs){
 report.existingCheck.programs++;
 for(const t of p.themes){report.existingCheck.themes++;
  try{const html=await get(t.url);const v1=JSON.stringify(branchThemeOutcomes(html,p,t)),v2=JSON.stringify(branchThemeOutcomesV2(html,p,t)),cat=JSON.stringify(t.outcomes);
   if(v1!==v2||v2!==cat){const a=new Map(JSON.parse(v1).map(o=>[o.code,o.title])),b=new Map(JSON.parse(v2).map(o=>[o.code,o.title]));
    report.existingCheck.mismatches.push({course:p.course,grade:p.grade,url:t.url,v1EqualsCatalog:v1===cat,v2EqualsCatalog:v2===cat,
     added:[...b].filter(([k])=>!a.has(k)),removed:[...a].filter(([k])=>!b.has(k)),changed:[...a].filter(([k,v])=>b.has(k)&&b.get(k)!==v).map(([k,v])=>[k,v,b.get(k)]),
     orderOnly:a.size===b.size&&[...a].every(([k,v])=>b.get(k)===v),section:[...a].some(([k])=>!b.has(k))?outcomeSection(html)?.slice(0,30000):undefined});}
  }catch(e){report.existingCheck.mismatches.push({course:p.course,grade:p.grade,url:t.url,error:String(e.message||e)});}
 }
}
console.log('existing',JSON.stringify({...report.existingCheck,mismatches:report.existingCheck.mismatches.length}));
await writeFile('official-curricula-collected.json',JSON.stringify(report,null,1));
