export interface CurriculumCsvRow {
  rowNo: number;
  subjectCode: string;
  gradeLevel: number | null;
  outcomeCode: string | null;
  parentCode: string | null;
  nodeType: 'UNIT' | 'TOPIC' | 'OUTCOME' | 'SUB_OUTCOME';
  unit: string | null;
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
  parentCode: ['parent_code','parent_outcome_code','ust_kazanim_kodu','üst_kazanım_kodu','alt_kazanim_parent_code'],
  nodeType: ['node_type','type','level','duzey','düzey','kazanim_turu','kazanım_türü'],
  unit: ['unit','unite','ünite'],
  topic: ['topic','konu'],
  subtopic: ['subtopic','alt_konu','altkonu'],
  title: ['title','outcome','kazanim','kazanım','ogrenme_ciktisi','öğrenme_çıktısı','aciklama','açıklama'],
} as const;

function normHeader(value:string){return value.trim().toLowerCase().replace(/\s+/g,'_')}

function detectDelimiter(text:string){
 const counts=new Map([[',',0],[';',0],['\t',0]]);let quoted=false,started=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){started=true;if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted){if(c==='\n'){if(started)break;for(const k of counts.keys())counts.set(k,0);continue;}if(c!==' '&&c!=='\t')started=true;if(counts.has(c))counts.set(c,counts.get(c)!+1);}}
 return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
}

function readCsvRecords(text:string,delimiter:string){
 const records:{cols:string[];rowNo:number}[]=[];let cols:string[]=[],field='',quoted=false,closed=false,line=1,startLine=1;
 const finish=()=>{cols.push(field);if(cols.length>1||cols[0].trim())records.push({cols,rowNo:startLine});cols=[];field='';closed=false;};
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
  if(c===delimiter){cols.push(field);field='';closed=false;continue;}
  if(c==='\n'){finish();line++;startLine=line;continue;}
  if(closed){if(c===' '||c==='\t')continue;return {records:[],errors:[`${line}. satırda kapanan tırnaktan sonra beklenmeyen karakter var.`]};}
  if(c==='"'){if(field.trim())return {records:[],errors:[`${line}. satırda alan ortasında tırnak var.`]};field='';quoted=true;continue;}
  field+=c;
 }
 if(quoted)return {records:[],errors:[`${startLine}. satırda açılan tırnak kapanmamış.`]};
 finish();return {records,errors:[] as string[]};
}

function indexOf(headers:string[],names:readonly string[]){return headers.findIndex(h=>names.includes(h))}

type HierarchyRow=Pick<CurriculumCsvRow,'subjectCode'|'gradeLevel'|'outcomeCode'|'parentCode'|'issues'>;

// Parent codes are local to the same subject and grade. Walk iteratively so a
// large valid hierarchy does not overflow the JavaScript call stack.
export function validateCurriculumHierarchy(rows:HierarchyRow[]):void {
 const key=(r:HierarchyRow,code:string)=>JSON.stringify([r.subjectCode,r.gradeLevel,code]);
 const byCode=new Map<string,HierarchyRow[]>();
 for(const r of rows){if(!r.outcomeCode)continue;const k=key(r,r.outcomeCode);const group=byCode.get(k)||[];group.push(r);byCode.set(k,group);}
 for(const group of byCode.values())if(group.length>1)for(const r of group)r.issues.push('Aynı ders ve sınıfta kayıt kodu tekil olmalıdır.');
 const parents=new Map<HierarchyRow,HierarchyRow>();
 for(const r of rows){if(!r.parentCode)continue;const candidates=byCode.get(key(r,r.parentCode))||[];
  if(candidates.length!==1){r.issues.push('Üst kayıt kodu aynı ders ve sınıfta tek bir kayda karşılık gelmelidir.');continue;}
  parents.set(r,candidates[0]);
 }
 const done=new Set<HierarchyRow>();
 for(const start of rows){if(done.has(start))continue;const chain:HierarchyRow[]=[];const positions=new Map<HierarchyRow,number>();let current:HierarchyRow|undefined=start;
  while(current&&!done.has(current)&&!positions.has(current)){positions.set(current,chain.length);chain.push(current);current=parents.get(current);}
  if(current&&positions.has(current))for(const r of chain.slice(positions.get(current)!))r.issues.push('Üst kayıt bağlantıları döngü oluşturamaz.');
  for(const r of chain)done.add(r);
 }
}

export function parseCurriculumCsv(text:string, programCode:'SCHOOL'|'TYT'|'AYT', expectedGrade:number|null):CurriculumParseResult{
  const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(!normalized.trim())return {rows:[],delimiter:',',errors:['Dosya boş.']};
  const delimiter=detectDelimiter(normalized);const parsed=readCsvRecords(normalized,delimiter);
  if(parsed.errors.length)return {rows:[],delimiter,errors:parsed.errors};
  const records=parsed.records;
  if(records.length<2)return {rows:[],delimiter,errors:['Başlık satırı ve en az bir veri satırı gereklidir.']};
  const headers=records[0].cols.map(normHeader);
  const subjectIdx=indexOf(headers,aliases.subject);const gradeIdx=indexOf(headers,aliases.grade);const codeIdx=indexOf(headers,aliases.code);const parentCodeIdx=indexOf(headers,aliases.parentCode);const nodeTypeIdx=indexOf(headers,aliases.nodeType);const unitIdx=indexOf(headers,aliases.unit);const topicIdx=indexOf(headers,aliases.topic);const subtopicIdx=indexOf(headers,aliases.subtopic);const titleIdx=indexOf(headers,aliases.title);
  const errors:string[]=[];
  const allowedHeaders=new Set<string>(Object.values(aliases).flat());
  if(headers.some(h=>!allowedHeaders.has(h)))errors.push('CSV başlığında boş veya tanınmayan alan var. Belgelenen başlıkları kullanın.');
  for(const names of Object.values(aliases))if(headers.filter(h=>(names as readonly string[]).includes(h)).length>1)errors.push('Aynı veri alanı için birden fazla başlık kullanılamaz.');
  if(subjectIdx<0)errors.push('Ders kodu sütunu bulunamadı. Örnek: subject_code.');
  if(titleIdx<0)errors.push('Kazanım/öğrenme çıktısı metni sütunu bulunamadı. Örnek: title.');
  if(programCode==='SCHOOL'&&gradeIdx<0&&expectedGrade==null)errors.push('Okul programında sınıf bilgisi dosyada veya import ayarında bulunmalıdır.');
  if(errors.length)return {rows:[],delimiter,errors};
  const rows:CurriculumCsvRow[]=[];const dedupe=new Set<string>();
  for(let i=1;i<records.length;i++){
    const {cols,rowNo}=records[i];const issues:string[]=[];
    if(cols.length!==headers.length)issues.push('Satırdaki alan sayısı CSV başlığıyla eşleşmiyor.');
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
    const parentCode=parentCodeIdx>=0?(cols[parentCodeIdx]||'').trim()||null:null;
    const rawNodeType=nodeTypeIdx>=0?(cols[nodeTypeIdx]||'').trim().toUpperCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_'):'';
    const nodeTypes:Record<string,CurriculumCsvRow['nodeType']>={UNIT:'UNIT',UNITE:'UNIT',TOPIC:'TOPIC',KONU:'TOPIC',OUTCOME:'OUTCOME',KAZANIM:'OUTCOME',OGRENME_CIKTISI:'OUTCOME',SUB_OUTCOME:'SUB_OUTCOME',ALT_KAZANIM:'SUB_OUTCOME',ALT_OGRENME_CIKTISI:'SUB_OUTCOME'};
    const nodeType=nodeTypes[rawNodeType]||'OUTCOME';
    if(rawNodeType&&!Object.hasOwn(nodeTypes,rawNodeType))issues.push('Kayıt türü UNIT, TOPIC, OUTCOME veya SUB_OUTCOME olmalıdır.');
    const unit=unitIdx>=0?(cols[unitIdx]||'').trim()||null:null;
    const topic=topicIdx>=0?(cols[topicIdx]||'').trim()||null:null;
    const subtopic=subtopicIdx>=0?(cols[subtopicIdx]||'').trim()||null:null;
    const dedupeKey=JSON.stringify([subjectCode,gradeLevel,outcomeCode,title.toLocaleLowerCase('tr-TR')]);
    if(dedupe.has(dedupeKey))issues.push('Dosyada aynı kazanım/öğrenme çıktısı birden fazla kez bulunuyor.');else dedupe.add(dedupeKey);
    if (nodeType !== 'UNIT' && nodeType !== 'TOPIC' && !outcomeCode) issues.push('Kazanım/öğrenme çıktısı kodu boş.');
    rows.push({rowNo,subjectCode,gradeLevel,outcomeCode,parentCode,nodeType,unit,topic,subtopic,title,issues});
  }
  validateCurriculumHierarchy(rows);
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
