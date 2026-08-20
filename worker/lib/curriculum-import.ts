export interface CurriculumCsvRow {
  rowNo: number;
  subjectCode: string;
  gradeLevel: number | null;
  outcomeCode: string | null;
  topic: string | null;
  subtopic: string | null;
  title: string;
  issues: string[];
}

export interface CurriculumParseResult {
  rows: CurriculumCsvRow[];
  delimiter: string;
  errors: string[];
}

const aliases = {
  subject: ['subject_code','subject','ders_kodu','ders','brans_kodu','branş_kodu'],
  grade: ['grade_level','grade','sinif','sınıf'],
  code: ['outcome_code','code','kazanim_kodu','kazanım_kodu','ogrenme_ciktisi_kodu','öğrenme_çıktısı_kodu'],
  topic: ['topic','konu'],
  subtopic: ['subtopic','alt_konu','altkonu'],
  title: ['title','outcome','kazanim','kazanım','ogrenme_ciktisi','öğrenme_çıktısı','aciklama','açıklama'],
} as const;

function normHeader(value:string){return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,'_')}

function detectDelimiter(header:string){const candidates=[',',';','\t'];return candidates.sort((a,b)=>header.split(b).length-header.split(a).length)[0]}

function splitCsv(line:string,delimiter:string){const out:string[]=[];let current='';let quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){out.push(current);current=''}else current+=c}out.push(current);return out}

function indexOf(headers:string[],names:readonly string[]){return headers.findIndex(h=>names.includes(h))}

export function parseCurriculumCsv(text:string, programCode:'SCHOOL'|'TYT'|'AYT', expectedGrade:number|null):CurriculumParseResult{
  const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();
  if(!normalized)return {rows:[],delimiter:',',errors:['Dosya boş.']};
  const lines=normalized.split('\n').filter(line=>line.trim().length>0);
  if(lines.length<2)return {rows:[],delimiter:',',errors:['Başlık satırı ve en az bir veri satırı gereklidir.']};
  const delimiter=detectDelimiter(lines[0]);
  const headers=splitCsv(lines[0],delimiter).map(normHeader);
  const subjectIdx=indexOf(headers,aliases.subject);const gradeIdx=indexOf(headers,aliases.grade);const codeIdx=indexOf(headers,aliases.code);const topicIdx=indexOf(headers,aliases.topic);const subtopicIdx=indexOf(headers,aliases.subtopic);const titleIdx=indexOf(headers,aliases.title);
  const errors:string[]=[];
  if(subjectIdx<0)errors.push('Ders kodu sütunu bulunamadı. Örnek: subject_code.');
  if(titleIdx<0)errors.push('Kazanım/öğrenme çıktısı metni sütunu bulunamadı. Örnek: title.');
  if(programCode==='SCHOOL'&&gradeIdx<0&&expectedGrade==null)errors.push('Okul programında sınıf bilgisi dosyada veya import ayarında bulunmalıdır.');
  if(errors.length)return {rows:[],delimiter,errors};
  const rows:CurriculumCsvRow[]=[];const dedupe=new Set<string>();
  for(let i=1;i<lines.length;i++){
    const cols=splitCsv(lines[i],delimiter);const issues:string[]=[];
    const subjectCode=(cols[subjectIdx]||'').trim().toLocaleUpperCase('tr-TR');
    const title=(cols[titleIdx]||'').trim();
    const rawGrade=gradeIdx>=0?(cols[gradeIdx]||'').trim():'';
    let gradeLevel: number|null = expectedGrade;
    if(rawGrade){const parsed=Number(rawGrade);gradeLevel=Number.isInteger(parsed)?parsed:null;if(gradeLevel==null)issues.push('Sınıf tam sayı olmalıdır.');}
    if(programCode==='SCHOOL'){
      if(gradeLevel==null||gradeLevel<1||gradeLevel>12)issues.push('Okul programında geçerli sınıf 1-12 arasında olmalıdır.');
      if(expectedGrade!=null&&gradeLevel!==expectedGrade)issues.push(`Satır sınıfı seçilen ${expectedGrade}. sınıfla eşleşmiyor.`);
    }else{
      gradeLevel=null;
    }
    if(!subjectCode)issues.push('Ders kodu boş.');
    if(!title)issues.push('Kazanım/öğrenme çıktısı metni boş.');
    const outcomeCode=codeIdx>=0?(cols[codeIdx]||'').trim()||null:null;
    const topic=topicIdx>=0?(cols[topicIdx]||'').trim()||null:null;
    const subtopic=subtopicIdx>=0?(cols[subtopicIdx]||'').trim()||null:null;
    const dedupeKey=`${subjectCode}|${gradeLevel??''}|${outcomeCode||''}|${title.toLocaleLowerCase('tr-TR')}`;
    if(dedupe.has(dedupeKey))issues.push('Dosyada aynı kazanım/öğrenme çıktısı birden fazla kez bulunuyor.');else dedupe.add(dedupeKey);
    rows.push({rowNo:i+1,subjectCode,gradeLevel,outcomeCode,topic,subtopic,title,issues});
  }
  return {rows,delimiter,errors};
}

export function validateCurriculumImportMetadata(input:{academicYear?:string;programCode?:string;gradeLevel?:number|null;programVersion?:string;authority?:string;sourceUrl?:string;sourceTitle?:string}){
  const errors:string[]=[];const academicYear=input.academicYear?.trim()||'';const programCode=input.programCode||'';const gradeLevel=input.gradeLevel==null?null:Number(input.gradeLevel);const programVersion=input.programVersion?.trim()||'';const authority=input.authority?.trim().toUpperCase()||'';const sourceUrl=input.sourceUrl?.trim()||'';const sourceTitle=input.sourceTitle?.trim()||'';
  if(!/^20\d{2}-20\d{2}$/.test(academicYear))errors.push('Akademik yıl 2026-2027 biçiminde olmalıdır.');
  if(!['SCHOOL','TYT','AYT'].includes(programCode))errors.push('Program SCHOOL, TYT veya AYT olmalıdır.');
  if(programCode==='SCHOOL'&&(!Number.isInteger(gradeLevel)||Number(gradeLevel)<1||Number(gradeLevel)>12))errors.push('Okul programında sınıf 1-12 arasında olmalıdır.');
  if((programCode==='TYT'||programCode==='AYT')&&gradeLevel!=null)errors.push('TYT/AYT importunda sınıf alanı boş olmalıdır.');
  if(!programVersion)errors.push('Program/müfredat sürümü gereklidir.');
  if(!['MEB','TTKB','OSYM','ÖSYM'].includes(authority))errors.push('Yetkili kaynak MEB, TTKB veya ÖSYM olmalıdır.');
  if(!/^https:\/\//i.test(sourceUrl))errors.push('Resmî kaynak URL HTTPS olmalıdır.');
  if(!sourceTitle)errors.push('Resmî kaynak doküman adı gereklidir.');
  return {valid:errors.length===0,errors,normalized:{academicYear,programCode,gradeLevel,programVersion,authority:authority==='OSYM'?'ÖSYM':authority,sourceUrl,sourceTitle}};
}
