import {read,utils} from '@e965/xlsx';

export type TransferStudentRow={
 rowNo:number;
 externalId?:string;
 studentNumber?:string;
 name:string;
 className?:string;
 gradeLevel?:number;
 section?:string;
 source:Record<string,string>;
 issues:string[];
};

export type TransferParseResult={format:'CSV'|'TXT'|'DAT'|'XLSX'|'XLS';headers:string[];rows:TransferStudentRow[];issues:string[]};

const MAX_ROWS=500;

function normalizedHeader(value:string){return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,'_')}
function pickIndex(headers:string[],names:string[]){return headers.findIndex(x=>names.includes(x))}
function clean(value:unknown){return String(value??'').trim()}

function splitDelimited(line:string,delimiter:string){
 const out:string[]=[];let current='',quoted=false;
 for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){out.push(current);current=''}else current+=c}out.push(current);return out;
}

function textMatrix(bytes:ArrayBuffer){
 const text=new TextDecoder().decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
 const lines=text.split('\n').filter(x=>x.trim());if(!lines.length)return [];
 const delimiter=[',',';','\t'].sort((a,b)=>splitDelimited(lines[0],b).length-splitDelimited(lines[0],a).length)[0];
 return lines.map(line=>splitDelimited(line,delimiter));
}

function spreadsheetMatrix(bytes:ArrayBuffer){
 const workbook=read(bytes,{type:'array',cellDates:false,cellFormula:false,cellHTML:false});const first=workbook.SheetNames[0];
 if(!first)return [];
 return utils.sheet_to_json<unknown[]>(workbook.Sheets[first],{header:1,raw:false,defval:''});
}

export function parseStudentTransfer(bytes:ArrayBuffer,fileName:string):TransferParseResult{
 const lower=fileName.toLocaleLowerCase('tr-TR');const spreadsheet=lower.endsWith('.xlsx')||lower.endsWith('.xls');
 const format:TransferParseResult['format']=lower.endsWith('.xlsx')?'XLSX':lower.endsWith('.xls')?'XLS':lower.endsWith('.dat')?'DAT':lower.endsWith('.txt')?'TXT':'CSV';
 let matrix:unknown[][];
 try{matrix=spreadsheet?spreadsheetMatrix(bytes):textMatrix(bytes)}catch{return {format,headers:[],rows:[],issues:['Dosya okunamadı veya bozuk.']}}
 if(matrix.length<2)return {format,headers:[],rows:[],issues:['Başlık ve en az bir öğrenci satırı gereklidir.']};
 if(matrix.length-1>MAX_ROWS)return {format,headers:matrix[0].map(x=>clean(x)),rows:[],issues:[`Tek aktarımda en fazla ${MAX_ROWS} öğrenci işlenebilir.`]};
 const rawHeaders=matrix[0].map(x=>clean(x));const headers=rawHeaders.map(normalizedHeader);
 const externalIdx=pickIndex(headers,['id','external_id','ogrenci_id','öğrenci_id','kayit_id','kayıt_id']);
 const numberIdx=pickIndex(headers,['student_number','student_no','ogrenci_no','öğrenci_no','numara','okul_no','no']);
 const nameIdx=pickIndex(headers,['name','ad_soyad','adsoyad','ogrenci','öğrenci','ogrenci_adi','öğrenci_adı']);
 const firstIdx=pickIndex(headers,['first_name','ad','ogrenci_adi','öğrenci_adı']);const lastIdx=pickIndex(headers,['last_name','soyad','ogrenci_soyadi','öğrenci_soyadı']);
 const classIdx=pickIndex(headers,['class','sinif','sınıf','class_name','sinif_sube','sınıf_şube']);
 const gradeIdx=pickIndex(headers,['grade','grade_level','sinif_duzeyi','sınıf_düzeyi']);const sectionIdx=pickIndex(headers,['section','sube','şube']);
 if(nameIdx<0&&firstIdx<0)return {format,headers:rawHeaders,rows:[],issues:['Ad soyad veya ad sütunu bulunamadı.']};
 const seenExternal=new Set<string>(),seenNumber=new Set<string>();
 const rows=matrix.slice(1).map((cells,index)=>{
  const values=rawHeaders.map((_,i)=>clean(cells[i]));const source=Object.fromEntries(rawHeaders.map((h,i)=>[h||`Sütun ${i+1}`,values[i]]));
  const externalId=externalIdx>=0?values[externalIdx]:'';const studentNumber=numberIdx>=0?values[numberIdx]:'';
  const name=nameIdx>=0?values[nameIdx]:`${firstIdx>=0?values[firstIdx]:''} ${lastIdx>=0?values[lastIdx]:''}`.trim();
  const className=classIdx>=0?values[classIdx]:'';const parsed=className.toLocaleUpperCase('tr-TR').match(/(\d{1,2})\s*[\/-]?\s*([A-ZÇĞİÖŞÜ])?/);
  const explicitGrade=gradeIdx>=0?Number(values[gradeIdx]):NaN;const gradeLevel=Number.isInteger(explicitGrade)&&explicitGrade>0?explicitGrade:parsed?Number(parsed[1]):undefined;
  const section=(sectionIdx>=0?values[sectionIdx]:parsed?.[2]||'').toLocaleUpperCase('tr-TR')||undefined;const issues:string[]=[];
  if(!name)issues.push('Ad soyad boş.');if(!gradeLevel||gradeLevel<1||gradeLevel>12)issues.push('Sınıf düzeyi 1–12 arasında olmalıdır.');if(!section)issues.push('Şube bilgisi eksik.');
  if(externalId){if(seenExternal.has(externalId))issues.push('Dosyada aynı dış sistem kimliği tekrar ediyor.');seenExternal.add(externalId)}
  if(studentNumber){const key=`${gradeLevel||''}:${studentNumber}`;if(seenNumber.has(key))issues.push('Dosyada aynı öğrenci numarası tekrar ediyor.');seenNumber.add(key)}
  return {rowNo:index+2,externalId:externalId||undefined,studentNumber:studentNumber||undefined,name,className:className||undefined,gradeLevel,section,source,issues};
 });
 return {format,headers:rawHeaders,rows,issues:[]};
}
