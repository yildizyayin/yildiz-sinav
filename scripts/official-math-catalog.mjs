import {createHash} from 'node:crypto';
export const officialMathGrades=[5,6,7,8,9,10,11,12].map(grade=>({grade,indexUrl:`https://tymm.meb.gov.tr/ogretim-programlari/${grade<9?'ortaokul-matematik-dersi':'matematik-dersi'}/${grade<9?grade+1:grade+2}`,course:grade<9?'ortaokul-matematik-dersi':'matematik-dersi'}));
export const sourceHash=html=>createHash('sha256').update(html).digest('hex');
export function visibleText(s){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/gu,' ').trim();}
export function mathThemeLinks(html,grade){
 const meta=officialMathGrades.find(s=>s.grade===grade);if(!meta)throw Error('UNSUPPORTED_GRADE');
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
 const title=visibleText(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
 if(!new RegExp(`(?:^|\\s)${grade}\\.\\s*Sınıf`,'u').test(title))throw Error('INDEX_GRADE_MISMATCH');
 const links=[];
 for(const m of clean.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const url=new URL(m[1],meta.indexUrl);if(url.origin!=='https://tymm.meb.gov.tr'||!new RegExp(`^/${meta.course}/unite/\\d+$`).test(url.pathname)||url.search||url.hash)continue;
  const title=visibleText(m[2]);if(!title||!/(Tema|Ünite)/iu.test(title))throw Error('INVALID_THEME_LABEL');if(!links.some(l=>l.url===url.href))links.push({url:url.href,title});
 }
 if(links.length<3||links.length>20)throw Error('THEME_CATALOG_INCOMPLETE');return links;
}
export function mathThemeOutcomes(html,grade,theme){
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
 const title=visibleText(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
 if(title.toLocaleLowerCase('tr-TR')!==theme.title.toLocaleLowerCase('tr-TR'))throw Error('THEME_TITLE_MISMATCH');
 const start=clean.indexOf('Öğrenme Çıktıları ve Süreç Bileşenleri'),end=clean.indexOf('İçerik Çerçevesi',start);
 if(start<0||end<=start)throw Error('OFFICIAL_OUTCOME_SECTION_MISSING');
 // A single official heading may span several adjacent strong tags. Keep its
 // full visible text until the first labelled process component, not first </strong>.
 const section=clean.slice(start,end).replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|&#xA0;/gi,' ');
 const blocks=[...section.matchAll(/MAT\.(\d+)\.(\d+)\.(\d+)\.\s+/gu)];const rows=[];
 for(let i=0;i<blocks.length;i++){
  const m=blocks[i],fragment=section.slice(m.index+m[0].length,blocks[i+1]?.index??section.length),process=fragment.search(/(?:^|\n)\s*[a-zçğıöşü]\)\s*/u);
  const title=visibleText(process<0?fragment:fragment.slice(0,process));
  if(Number(m[1])!==grade||title.length<10||title.length>1500||!/(?:bilme|çözme)[.!]?$/u.test(title))throw Error('INVALID_OFFICIAL_OUTCOME:'+m[0]+':'+title.slice(0,300));
  const code=`MAT.${m[1]}.${m[2]}.${m[3]}`;if(rows.some(r=>r.code===code))throw Error('DUPLICATE_THEME_OUTCOME');rows.push({code,title,topic:theme.title,unit:theme.title,sourceUrl:theme.url});
 }
 if(!rows.length||rows.length>30)throw Error('OUTCOME_SECTION_EMPTY_OR_OVERSIZED');return rows;
}
export function assertSameMathCatalog(expected,observed){
 const project=items=>items.map(s=>({grade:s.grade,indexUrl:s.indexUrl,themes:s.themes.map(t=>({url:t.url,title:t.title,codes:t.codes})),outcomes:s.outcomes.map(o=>({code:o.code,title:o.title,unit:o.unit,sourceUrl:o.sourceUrl}))}));
 if(JSON.stringify(project(expected))!==JSON.stringify(project(observed)))throw Error('OFFICIAL_CATALOG_CHANGED_REVIEW_REQUIRED');
}
export async function fetchMathCatalog(fetcher=fetch){
 const result=[];
 const get=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!r.ok)throw Error('OFFICIAL_SOURCE_HTTP_'+r.status);const s=await r.text();if(s.length>5e6)throw Error('OFFICIAL_SOURCE_TOO_LARGE');return s;};
 // At most four theme requests at once, and all sources before any publication.
 for(const meta of officialMathGrades){
  const index=await get(meta.indexUrl),links=mathThemeLinks(index,meta.grade),themes=[],outcomes=[];
  for(let i=0;i<links.length;i+=4){const pages=await Promise.all(links.slice(i,i+4).map(async theme=>{const html=await get(theme.url),rows=mathThemeOutcomes(html,meta.grade,theme);return {theme:{...theme,hash:sourceHash(html),codes:rows.map(r=>r.code)},rows};}));for(const p of pages){themes.push(p.theme);outcomes.push(...p.rows);}}
  if(new Set(outcomes.map(o=>o.code)).size!==outcomes.length)throw Error('DUPLICATE_GRADE_OUTCOME');result.push({...meta,indexHash:sourceHash(index),themes,outcomes});
 }
 return result;
}
export function fullMathCsv(spec){const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';return [['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>['MAT',spec.grade,o.code,o.title,o.topic,o.unit,'OUTCOME'])].map(r=>r.map(cell).join(';')).join('\n');}
