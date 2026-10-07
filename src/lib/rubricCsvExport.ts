export function rubricCsvCell(value:unknown){
 let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function renderRubricCsv(rows:any[]){
 const output:any[][]=[['Eğitim yılı','Gözlem tarihi','Rubrik','Sürüm','Kaynak türü','Öğrenme çıktısı','Süreç','Ölçüt','Gözlenen düzey','Düzey açıklaması','Gözlem kanıtı','Geri bildirim','Sonraki adım']];
 for(const obs of rows){
  if(!Array.isArray(obs.selections)||!Array.isArray(obs.snapshot?.criteria))throw new Error('Rubrik gözleminin ölçütleri geçersiz.');
  for(const selected of obs.selections){const criterion=obs.snapshot.criteria.find((c:any)=>c.id===selected.criterionId),level=criterion?.levels?.find((l:any)=>l.id===selected.levelId);if(!criterion||!level)throw new Error('Rubrik gözleminin düzey seçimi geçersiz.');
   output.push([obs.snapshot.academicYear,obs.observed_at,obs.snapshot.title,obs.snapshot.versionLabel,obs.snapshot.sourceKind==='OFFICIAL'?'Resmî doküman':'Öğretmen tasarımı',obs.snapshot.outcomeCode,obs.snapshot.componentCode,criterion.title,level.label,level.description,obs.evidence_note,obs.feedback,obs.next_step]);
  }
 }
 return '\ufeff'+output.map(row=>row.map(rubricCsvCell).join(';')).join('\r\n');
}
/** Collect the complete authorized scope before making any download artifact. */
export async function collectRubricCsvPages(fetchPage:(cursor:string|null)=>Promise<any>,isCurrent:()=>boolean){
 const rows:any[]=[];const cursors=new Set<string>();let cursor:string|null=null;
 do{
  if(!isCurrent())return null;const page=await fetchPage(cursor);if(!isCurrent())return null;
  if(!Array.isArray(page.observations))throw new Error('Gözlem sayfası geçersiz.');rows.push(...page.observations);
  if(rows.length>5000)throw new Error('Dışa aktarım 5.000 gözlem sınırını aşıyor. Bir dönem seçerek kapsamı daraltın.');
  cursor=page.nextCursor||null;if(cursor!==null){if(typeof cursor!=='string'||cursors.has(cursor))throw new Error('Gözlem listesinin devamı geçersiz.');cursors.add(cursor);}
 }while(cursor);
 if(!isCurrent())return null;return {csv:renderRubricCsv(rows),observationCount:rows.length};
}
