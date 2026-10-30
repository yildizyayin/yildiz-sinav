/** Read-only presentation of published rows. No totals, scores or missing branches are inferred. */
export type ResultRow = {subject?:string;subject_name?:string;subject_code?:string;subject_id?:string;correct_count?:number|null;wrong_count?:number|null;blank_count?:number|null;net?:number|null};
export const resultValue=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2});
const key=(v:unknown)=>String(v||'').toLocaleLowerCase('tr-TR').replace(/[ıİ]/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const rowTitle=(r:ResultRow)=>r.subject||r.subject_name||r.subject_code||'Ders';
const groups=[
 {title:'Türkçe',codes:['TYT_TUR'],names:['Türkçe','TYT Türkçe'],children:[]},
 {title:'Sosyal Bilimler',codes:['TYT_SOS'],names:['Sosyal','Sosyal Bilimler','TYT Sosyal Bilimler'],children:[['Tarih',['TYT_TAR','TYT_TAR1']],['Coğrafya',['TYT_COG','TYT_COG1']],['Felsefe',['TYT_FEL']],['Din Kültürü',['TYT_DIN']]]},
 {title:'Temel Matematik',codes:['TYT_MAT'],names:['Matematik','Temel Matematik','TYT Temel Matematik'],children:[['Matematik',['TYT_MATEMATIK']],['Geometri',['TYT_GEO']]]},
 {title:'Fen Bilimleri',codes:['TYT_FEN'],names:['Fen','Fen Bilimleri','TYT Fen Bilimleri'],children:[['Fizik',['TYT_FIZ']],['Kimya',['TYT_KIM']],['Biyoloji',['TYT_BIY']]]}
] as const;
export type ResultGroup={title:string;parent:ResultRow|null;children:{title:string;row:ResultRow|null}[];plain?:boolean};
export function resultGroups(rows:ResultRow[],examType:unknown):ResultGroup[]{
 if(!/tyt/i.test(String(examType||''))&&!rows.some(r=>/^TYT_/.test(r.subject_code||'')))return rows.map(r=>({title:rowTitle(r),parent:r,children:[],plain:true}));
 const used=new Set<ResultRow>(),result:ResultGroup[]=[];
 for(const group of groups){
  const parent=rows.find(r=>!used.has(r)&&group.codes.some(c=>c===r.subject_code))||rows.find(r=>!used.has(r)&&group.names.some(n=>key(n)===key(rowTitle(r))))||null;
  if(parent)used.add(parent);
  const children=group.children.map(([title,codes])=>{const row=rows.find(r=>!used.has(r)&&(codes.some(c=>c===r.subject_code)||key(rowTitle(r))===key(title)))||null;if(row)used.add(row);return {title,row};});
  if(parent||children.some(x=>x.row))result.push({title:group.title,parent,children});
 }
 return [...result,...rows.filter(r=>!used.has(r)).map(r=>({title:rowTitle(r),parent:r,children:[],plain:true}))];
}
export function outcomeNumber(row:Record<string,unknown>,field:string){const value=row[field];return value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);}
