import {visibleText,sourceHash} from './official-math-catalog.mjs';
export const branchSubjects={
 'ortaokul-turkce-dersi':['TUR','T'], 'fen-bilimleri-dersi':['FEN','FB'],
 'sosyal-bilgiler-dersi':['SOS','SB'], 'turk-dili-ve-edebiyati-dersi':['EDB','TDE'],
 'fizik-dersi':['FIZ','FİZ'], 'kimya-dersi':['KIM','KİM'], 'biyoloji-dersi':['BIY','BİY'],
 'tarih-dersi':['TAR','TAR'], 'cografya-dersi':['COG','COĞ'], 'felsefe-dersi':['FEL','FEL'],
 'din-kulturu-ve-ahlak-bilgisi-dersi-temel-egitim':['DIN','DKAB'],
 'din-kulturu-ve-ahlak-bilgisi-dersi-ortaogretim':['DIN','DKAB'],
 'ingilizce-dersi-9-12':['ING','ENG'], 'ingilizce-dersi-temel-egitim':['ING','ENG'],
 'tc-inkilap-tarihi-ve-ataturkculuk-dersi':['INK','İTA'],
 'tc-inkilap-tarihi-ve-ataturkculuk-dersi-2':['INK','İTA'],
};
export function branchThemeOutcomes(html,spec,theme){
 const mapping=branchSubjects[spec.course]; if(!mapping)throw Error('UNKNOWN_COURSE');
 const heading=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
 if(heading.toLocaleLowerCase('tr-TR')!==visibleText(theme.title).toLocaleLowerCase('tr-TR'))throw Error('THEME_TITLE_MISMATCH');
 const start=html.indexOf('Öğrenme Çıktıları ve Süreç Bileşenleri'),end=html.indexOf('İçerik Çerçevesi',start);
 if(start<0||end<=start)throw Error('OUTCOME_SECTION_MISSING');
 const section=html.slice(start,end).replace(/\s+/gu,' ').replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi,'\n').replace(/<[^>]*>/g,' ');
 const pattern=/(?<![\p{L}\p{N}])([A-ZÇĞİÖŞÜ]+\d*(?:\.[A-ZÇĞİÖŞÜ\d]+){1,6})\.\s+/gu;
 const matches=[...section.matchAll(pattern)].filter(m=>m[1].startsWith(mapping[1]));
 const rows=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i];
  const parts=m[1].split('.');const sourceGrade=mapping[0]==='TUR'?Number(parts[2]):mapping[0]==='EDB'?spec.grade:/^ENG\d+$/.test(parts[0])?Number(parts[0].slice(3)):Number(parts[1]);
  if(sourceGrade!==spec.grade)throw Error('OUTCOME_GRADE_MISMATCH:'+m[1]);
  const fragment=section.slice(m.index+m[0].length,matches[i+1]?.index??section.length);
  const title=visibleText(fragment.split('\n').find(s=>visibleText(s))??'');
  if(title.length<8||title.length>2000)throw Error('INVALID_OUTCOME_TITLE:'+m[1]);
  const prior=rows.find(r=>r.code===m[1]); if(prior){if(prior.title!==title)throw Error('CONFLICTING_THEME_CODE:'+m[1]);continue;}
  rows.push({code:m[1],title,unit:visibleText(theme.title),topic:visibleText(theme.title),sourceUrl:theme.url});
 }
 if(!rows.length)throw Error('EMPTY_OUTCOME_SECTION');return rows;
}
export function assembleBranchProgram(spec,pages){
 const byCode=new Map(),conflicts=[];
 const themes=pages.map(({theme,html})=>{
  const rows=branchThemeOutcomes(html,spec,theme);
  for(const row of rows){const previous=byCode.get(row.code);
   if(previous&&previous.title!==row.title)conflicts.push({code:row.code,first:previous,other:row});
   else if(previous)previous.sourceUrls.push(row.sourceUrl);
   else byCode.set(row.code,{...row,sourceUrls:[row.sourceUrl]});
  }
  return {...theme,title:visibleText(theme.title),hash:sourceHash(html),outcomes:rows};
 });
 return {...spec,subjectCode:branchSubjects[spec.course][0],themes,outcomes:[...byCode.values()],conflicts,
  importStatus:conflicts.length?'BLOCKED_CONTEXT_IDENTITY':'SOURCE_VERIFIED',examSpecification:false};
}
