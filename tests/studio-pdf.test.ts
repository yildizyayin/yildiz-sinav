import {DatabaseSync} from 'node:sqlite';
import {deflateSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {expect,it} from 'vitest';
import {opticalPage,renderStudioAnswerKey,renderStudioPdf,StudioPrintError,wrapText} from '../worker/lib/studio-pdf';

/** Minimal valid RGB PNG for print tests. */
function png(width:number,height:number):Uint8Array{
 const crc=(buf:Buffer)=>{let c=~0;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return ~c>>>0;};
 const chunk=(type:string,data:Buffer)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const o=y*(width*3+1)+1+x*3;raw[o]=40+(x*200/width|0);raw[o+1]=110;raw[o+2]=170-(y*100/height|0);}}
 return new Uint8Array(Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

const LONG='Bir öğretmen, 8. sınıf öğrencilerinden şehirlerindeki günlük su tüketimini incelemelerini istemiştir. Öğrenciler; İzmir, Çanakkale, Muğla ve Iğdır için toplanan verileri karşılaştırarak düzenli bir rapor hazırlamış, ardından gözlemlerini sınıfta paylaşmıştır. Ğ, Ü, Ş, İ, Ö, Ç ve ı, ğ, ü, ş, ö, ç harfleri eksiksiz görünmelidir.';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,title TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,stem_text TEXT,options_json TEXT,correct_answer TEXT,content_mode TEXT DEFAULT 'TEXT',editorial_packet_json TEXT,origin_kind TEXT DEFAULT 'MANUAL');
 CREATE TABLE question_assets(id TEXT,question_id TEXT,asset_type TEXT,r2_key TEXT,external_url TEXT,placement TEXT DEFAULT 'STEM',option_label TEXT,sort_order INTEGER DEFAULT 0,alt_text TEXT);
 CREATE TABLE question_content_blocks(id TEXT,question_id TEXT,block_type TEXT,placement TEXT DEFAULT 'STEM',text_content TEXT,payload_json TEXT,alt_text TEXT,sort_order INTEGER DEFAULT 0);
 INSERT INTO studio_documents VALUES('doc','inst','8. Sınıf Matematik Deneme Sınavı — Ekim');`);
 const files=new Map<string,Uint8Array>();
 const addQ=(id:string,stem:string,options:string[],answer:string,extra:{mode?:string;editorial?:boolean}={})=>db.prepare('INSERT INTO question_bank VALUES(?,?,?,?,?,?,?)').run(id,stem,JSON.stringify(options.map((t,i)=>({label:'ABCDE'[i],text:t}))),answer,extra.mode||'TEXT',extra.editorial?'{"version":1}':null,extra.editorial?'AI_GENERATED':'MANUAL');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
 const env={DB:{prepare},FILES:{get:async(key:string)=>files.has(key)?{arrayBuffer:async()=>files.get(key)!.slice().buffer}:null}} as any;
 const book=(ids:string[])=>{ids.forEach((id,i)=>{db.prepare('INSERT INTO studio_document_items VALUES(?,?,?,?)').run('doc',id,'A',i+1);});[...ids].reverse().forEach((id,i)=>db.prepare('INSERT INTO studio_document_items VALUES(?,?,?,?)').run('doc',id,'B',i+1));};
 return {db,env,files,addQ,book};
}
async function pageCount(bytes:ArrayBuffer){return (await PDFDocument.load(bytes)).getPageCount();}
function sample(name:string,bytes:ArrayBuffer){const dir=process.env.STUDIO_PDF_SAMPLE_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}`,new Uint8Array(bytes));}}

it('prints full Turkish stems and options across real pages, with tables, charts, images and an unchanged optical page',async()=>{
 const f=setup();try{
  const ids:string[]=[];
  for(let i=1;i<=14;i++){const id=`q${i}`;ids.push(id);f.addQ(id,`${i}. durum: ${LONG}`,[`Yalnız İzmir'in tüketimi artmıştır ve bu artış önceki yılların ortalamasının belirgin biçimde üzerindedir (seçenek ${i})`,'Çanakkale ile Muğla arasındaki fark azalmıştır','Iğdır en düşük tüketime sahiptir','Dört şehrin toplamı değişmemiştir'],'ABCD'[i%4],{editorial:i===3});}
  f.db.prepare(`INSERT INTO question_content_blocks VALUES('b1','q2','TABLE','STEM',NULL,?,NULL,0)`).run(JSON.stringify({schemaVersion:1,kind:'TABLE',title:'Günlük su tüketimi',unit:'litre',columns:['Şehir','2025','2026'],rows:[['İzmir','1.240','1.310'],['Çanakkale','860','845'],['Iğdır','410','430']]}));
  f.db.prepare(`INSERT INTO question_content_blocks VALUES('b2','q3','DIAGRAM','STEM',NULL,?,NULL,0)`).run(JSON.stringify({schemaVersion:1,kind:'BAR_CHART',title:'Kitap okuma süresi',unit:'dakika',categories:['Pazartesi','Salı','Çarşamba','Perşembe'],values:[35,50,20,45]}));
  f.files.set('img/q5.png',png(320,160));f.db.prepare(`INSERT INTO question_assets VALUES('a1','q5','IMAGE','img/q5.png',NULL,'STEM',NULL,0,'Grafik')`).run();
  f.db.exec(`UPDATE question_bank SET content_mode='MIXED' WHERE id='q5'`);
  f.book(ids);
  const branding={showAnunex:true,showNibiru:true,institutionName:'Yıldız Koleji Çankaya Kampüsü',institutionLogo:png(200,200)};
  const a=await renderStudioPdf(f.env,'doc','A',branding),b=await renderStudioPdf(f.env,'doc','B',{...branding,showAnunex:false});
  sample('ornek-kitapcik-A.pdf',a.bytes);sample('ornek-kitapcik-B-anunexsiz.pdf',b.bytes);
  expect(a.metadata.branding).toEqual({showAnunex:true,showNibiru:true,institutionName:'Yıldız Koleji Çankaya Kampüsü',institutionLogo:true});
  expect((b.metadata.branding as any).showAnunex).toBe(false);
  const plain=await renderStudioPdf(f.env,'doc','A');expect(plain.metadata.branding).toEqual({showAnunex:true,showNibiru:true,institutionName:null,institutionLogo:false});
  expect((await renderStudioPdf(f.env,'doc','A',{...branding,institutionLogo:new Uint8Array([1,2,3,4,5,6,7,8,9])}).catch(e=>e)).code).toBe('PRINT_LOGO_FORMAT_UNSUPPORTED');
  expect(a.questionCount).toBe(14);
  expect(a.metadata.questionPages).toBeGreaterThan(1);
  expect(await pageCount(a.bytes)).toBe(Number(a.metadata.questionPages)+1);
  expect(a.metadata.optical).toEqual(opticalPage('8. Sınıf Matematik Deneme Sınavı — Ekim','A',14,4).geometry);
  const key=await renderStudioAnswerKey(f.env,'doc');sample('ornek-cevap-anahtari.pdf',key.bytes);
  expect(key.booklets.A).toHaveLength(14);expect(key.booklets.B).toEqual([...key.booklets.A].reverse());
 }finally{f.db.close();}
});

it('wraps by measured width, breaks over-long tokens and never drops words',async()=>{
 const pdf=await PDFDocument.create();const fontkit=(await import('@pdf-lib/fontkit')).default;pdf.registerFontkit(fontkit);
 const {DEJAVU_SANS_BASE64}=await import('../worker/lib/fonts/dejavu-subset.generated');
 const font=await pdf.embedFont(Uint8Array.from(atob(DEJAVU_SANS_BASE64),c=>c.charCodeAt(0)));
 const lines=wrapText(font,LONG+' '+'1'.repeat(120),9.5,200);
 expect(lines.every(l=>font.widthOfTextAtSize(l,9.5)<=200)).toBe(true);
 expect(lines.join(' ').replace(/\s+/g,'')).toBe((LONG+'1'.repeat(120)).replace(/\s+/g,''));
});

it('refuses to print instead of silently losing content',async()=>{
 const cases:Array<[string,(f:ReturnType<typeof setup>)=>void]>=[
  ['PRINT_UNSUPPORTED_CHARACTER',f=>f.addQ('x','Emoji 😀 içeren kök',['a','b','c','d'],'A')],
  ['PRINT_IMAGE_FORMAT_UNSUPPORTED',f=>{f.addQ('x','Görselli soru',['a','b','c','d'],'A',{mode:'MIXED'});f.files.set('w.webp',new Uint8Array([0x52,0x49,0x46,0x46,1,2,3,4,0x57,0x45,0x42,0x50]));f.db.prepare(`INSERT INTO question_assets VALUES('a','x','IMAGE','w.webp',NULL,'STEM',NULL,0,NULL)`).run();}],
  ['PRINT_EXTERNAL_IMAGE_UNSUPPORTED',f=>{f.addQ('x','Dış görsel',['a','b','c','d'],'A',{mode:'MIXED'});f.db.prepare(`INSERT INTO question_assets VALUES('a','x','IMAGE',NULL,'https://example.com/a.png','STEM',NULL,0,NULL)`).run();}],
  ['PRINT_OPTION_IMAGE_UNSUPPORTED',f=>{f.addQ('x','Şık görselli',['a','b','c','d'],'A');f.files.set('o.png',png(10,10));f.db.prepare(`INSERT INTO question_assets VALUES('a','x','IMAGE','o.png',NULL,'OPTION','A',0,NULL)`).run();}],
  ['PRINT_BLOCK_UNSUPPORTED',f=>{f.addQ('x','Formüllü',['a','b','c','d'],'A');f.db.prepare(`INSERT INTO question_content_blocks VALUES('b','x','FORMULA','STEM','x^2',NULL,NULL,0)`).run();}],
  ['PRINT_IMAGE_MISSING',f=>f.addQ('x','Görsel olmalı',['a','b','c','d'],'A',{mode:'IMAGE'})],
  ['PRINT_QUESTION_TOO_LONG',f=>f.addQ('x',(LONG+' ').repeat(40),['a','b','c','d'],'A')],
 ];
 for(const [code,arrange] of cases){
  const f=setup();try{arrange(f);f.book(['x']);
   const error=await renderStudioPdf(f.env,'doc','A').catch(e=>e);
   expect(error,code).toBeInstanceOf(StudioPrintError);expect(error.code).toBe(code);expect(error.message).toContain('Soru 1');
  }finally{f.db.close();}
 }
 const f=setup();try{f.addQ('x','Kök',['a','b','c','d'],'Z');f.book(['x']);expect((await renderStudioAnswerKey(f.env,'doc').catch(e=>e)).code).toBe('PRINT_ANSWER_KEY_INVALID');}finally{f.db.close();}
});
