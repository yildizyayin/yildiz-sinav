import {visibleText,sourceHash} from './official-math-catalog.mjs';
export const branchSubjects={
 'ortaokul-turkce-dersi':['TUR','T'], 'ilkokul-turkce-dersi':['TUR','T'], 'fen-bilimleri-dersi':['FEN','FB'],
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

/**
 * Owner (4 Nov): the same exact reading, made robust to defects seen on official pages (5th-grade Türkçe, 4th-grade
 * Türkçe and Fen, 12th-grade Din). Official codes and titles are kept verbatim; only how they are found changes:
 * - entities (&nbsp;) are decoded before codes are recognised;
 * - a code counts only at the start of a line, so a reference inside an explanatory note ("… T.O.5.20. kapsamında
 *   yapılır") is not taken for an outcome;
 * - a missing dot or space after the code ("12.3.2.Gıda", "12.3.3 Bağımlılık") and a code printed without its
 *   course prefix on the official page ("12.3.1." under DKAB) are accepted as printed;
 * - the grade is also read from a code printed without a dot ("T.Y4.2").
 * It must give byte-identical results to branchThemeOutcomes on every programme already in the catalogue.
 */
export function branchThemeOutcomesV2(html,spec,theme){
 const mapping=branchSubjects[spec.course]; if(!mapping)throw Error('UNKNOWN_COURSE');
 const heading=visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
 if(heading.toLocaleLowerCase('tr-TR')!==visibleText(theme.title).toLocaleLowerCase('tr-TR'))throw Error('THEME_TITLE_MISMATCH');
 const start=html.indexOf('Öğrenme Çıktıları ve Süreç Bileşenleri'),end=html.indexOf('İçerik Çerçevesi',start);
 if(start<0||end<=start)throw Error('OUTCOME_SECTION_MISSING');
 const lines=html.slice(start,end).replace(/\s+/gu,' ').replace(/<br\b[^>]*>|<\/(?:p|div|li)>/gi,'\n').split('\n').map(l=>visibleText(l)).filter(Boolean);
 const prefixed=/^([A-ZÇĞİÖŞÜ]+\d*(?:\.[A-ZÇĞİÖŞÜ\d]+){1,6})(?:\.\s*|\s+)(\S.*)?$/u, bare=/^(\d{1,2}(?:\.\d{1,2}){2})(?:\.\s*|\s+)(\S.*)?$/u;
 const rows=[];
 for(let i=0;i<lines.length;i++){
  let m=lines[i].match(prefixed);
  if(m&&!m[1].startsWith(mapping[1]))m=null;
  if(!m&&mapping[0]==='DIN')m=lines[i].match(bare);
  if(!m)continue;
  const code=m[1],parts=code.split('.');
  const gradeOf=()=>{
   if(/^\d/.test(code))return Number(parts[0]);
   if(mapping[0]==='TUR')return /^[A-ZÇĞİÖŞÜ]+(\d+)$/u.test(parts[1])?Number(parts[1].replace(/\D/g,'')):Number(parts[2]);
   if(mapping[0]==='EDB')return spec.grade;
   return /^ENG\d+$/.test(parts[0])?Number(parts[0].slice(3)):Number(parts[1]);
  };
  if(gradeOf()!==spec.grade)throw Error('OUTCOME_GRADE_MISMATCH:'+code);
  const title=m[2]?visibleText(m[2]):(lines.slice(i+1).find(Boolean)??'');
  if(title.length<8||title.length>2000)throw Error('INVALID_OUTCOME_TITLE:'+code);
  const prior=rows.find(r=>r.code===code); if(prior){if(prior.title!==title)throw Error('CONFLICTING_THEME_CODE:'+code);continue;}
  rows.push({code,title,unit:visibleText(theme.title),topic:visibleText(theme.title),sourceUrl:theme.url});
 }
 if(!rows.length)throw Error('EMPTY_OUTCOME_SECTION');return rows;
}
