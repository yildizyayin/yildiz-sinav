import {DatabaseSync} from 'node:sqlite';
import {deflateSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {expect,it} from 'vitest';
import {OPTICAL_LOGO_BOX,opticalPage,renderStudioAnswerKey,renderStudioPdf,STUDIO_MARKERS} from '../worker/lib/studio-pdf';
import {renderQuickTestAnswerKey} from '../worker/lib/quick-test-pdf';
import {homography,parseRuntimeTemplate,readOmrImage} from '../src/lib/omrEngine';

/**
 * Owner, 27 Nov 2026: "testi hazırladı matbu olarak yazdırdı kurum adı ve logosu çıksın". The institution's name and
 * logo are on the booklet's first page, its name on every page's footer, on the answer form and on the answer key —
 * and the answer form still reads exactly as before (the logo never moves a corner square or a bubble).
 */
function png(width:number,height:number,dark=false):Uint8Array{
 const crc=(buf:Buffer)=>{let c=~0;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return ~c>>>0;};
 const chunk=(type:string,data:Buffer)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const o=y*(width*3+1)+1+x*3;raw[o]=dark?10:40+(x*200/width|0);raw[o+1]=dark?10:110;raw[o+2]=dark?10:170-(y*100/height|0);}}
 return new Uint8Array(Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
function setup(n:number){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,title TEXT,config_json TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,stem_text TEXT,options_json TEXT,correct_answer TEXT,content_mode TEXT DEFAULT 'TEXT',editorial_packet_json TEXT,origin_kind TEXT DEFAULT 'MANUAL');
 CREATE TABLE question_assets(id TEXT,question_id TEXT,asset_type TEXT,r2_key TEXT,external_url TEXT,placement TEXT DEFAULT 'STEM',option_label TEXT,sort_order INTEGER DEFAULT 0,alt_text TEXT);
 CREATE TABLE question_content_blocks(id TEXT,question_id TEXT,block_type TEXT,placement TEXT DEFAULT 'STEM',text_content TEXT,payload_json TEXT,alt_text TEXT,sort_order INTEGER DEFAULT 0);
 INSERT INTO studio_documents VALUES('doc','inst','Kuvveti Tanıyalım · Ünite testi','{"deliveryMode":"PDF_OPTICAL"}');`);
 for(let i=1;i<=n;i++){db.prepare('INSERT INTO question_bank VALUES(?,?,?,?,?,?,?)').run(`q${i}`,`${i}. soru: Bir cisme uygulanan kuvvetin etkisi ${'gözlemlenmiştir ve kayda geçirilmiştir. '.repeat(6)}`,JSON.stringify(['Hızlanır','Yavaşlar','Yön değiştirir','Şekli değişir'].map((t,j)=>({label:'ABCD'[j],text:t}))),'ABCD'[i%4],'TEXT',null,'MANUAL');db.prepare('INSERT INTO studio_document_items VALUES(?,?,?,?)').run('doc',`q${i}`,'A',i);}
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
 return {db,env:{DB:{prepare},FILES:{get:async()=>null}} as any};
}
function sample(name:string,bytes:ArrayBuffer){const dir=process.env.STUDIO_PDF_SAMPLE_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}`,new Uint8Array(bytes));}}
const brand={showAnunex:true,showNibiru:true,institutionName:'Yıldız Koleji Çankaya Kampüsü',institutionLogo:png(240,240)};

it('prints the institution on the booklet, its answer form and the answer key; the form geometry does not move',async()=>{
 const f=setup(24);try{
  const plain=await renderStudioPdf(f.env,'doc','A');
  const branded=await renderStudioPdf(f.env,'doc','A',brand);
  sample('kurumlu-kitapcik-A.pdf',branded.bytes);
  expect(branded.metadata.optical).toEqual(plain.metadata.optical);
  expect(branded.metadata.optical).toEqual(opticalPage('Kuvveti Tanıyalım · Ünite testi','A',24,4).geometry);
  expect(Number(branded.metadata.questionPages)).toBeGreaterThan(1);
  expect((await PDFDocument.load(branded.bytes)).getPageCount()).toBe((await PDFDocument.load(plain.bytes)).getPageCount());
  expect(branded.bytes.byteLength).toBeGreaterThan(plain.bytes.byteLength);
  const key=await renderStudioAnswerKey(f.env,'doc',brand);sample('kurumlu-cevap-anahtari.pdf',key.bytes);
  expect(key.booklets.A).toHaveLength(24);
  expect(key.bytes.byteLength).toBeGreaterThan((await renderStudioAnswerKey(f.env,'doc')).bytes.byteLength);
  await expect(renderStudioAnswerKey(f.env,'doc',{...brand,institutionLogo:new Uint8Array([1,2,3,4,5,6,7,8,9])})).rejects.toMatchObject({code:'PRINT_LOGO_FORMAT_UNSUPPORTED'});
  const quick=await renderQuickTestAnswerKey({title:'Hızlı test'},['A','B','C'],{institutionName:'Yıldız Koleji',logo:png(60,30)});
  expect(quick.byteLength).toBeGreaterThan((await renderQuickTestAnswerKey({title:'Hızlı test'},['A','B','C'])).byteLength);
 }finally{f.db.close();}
});

it('the logo box stays clear of the corner squares, the orientation disc and the booklet bubbles',()=>{
 const b=OPTICAL_LOGO_BOX,{layout}=opticalPage('Deneme','A',44,5) as any;
 for(const [x,y] of STUDIO_MARKERS){const cx=x+15,cy=y+15,dx=Math.max(b.x-cx,0,cx-(b.x+b.size)),dy=Math.max(b.y-cy,0,cy-(b.y+b.size));expect(Math.hypot(dx,dy)).toBeGreaterThan(40);}
 for(const p of [...layout.bubbles,{x:478,y:748,r:10},{x:512,y:748,r:10}]){const dx=Math.max(b.x-p.x,0,p.x-(b.x+b.size)),dy=Math.max(b.y-p.y,0,p.y-(b.y+b.size));expect(Math.hypot(dx,dy)).toBeGreaterThan(p.r+6);}
 expect(b.size).toBeLessThanOrEqual(30);
});

/** Paints the sheet with a solid black logo in its box, photographs it, reads it. */
it('reads a photographed answer form that carries a solid dark logo',()=>{
 const n=30,answers=Array.from({length:n},(_,i)=>'ABCDE'[(i*3)%5]).join('');
 const {layout,geometry}=opticalPage('Deneme','A',n,5) as any;const template=parseRuntimeTemplate({...geometry,id:'t',name:'t'});
 const s=2,PW=595*s,PH=842*s,page=new Uint8Array(PW*PH).fill(236);
 const fill=(x0:number,y0:number,x1:number,y1:number,f:(x:number,y:number)=>number|null)=>{for(let py=Math.max(0,Math.floor((842-y1)*s));py<Math.min(PH,Math.ceil((842-y0)*s));py++)for(let px=Math.max(0,Math.floor(x0*s));px<Math.min(PW,Math.ceil(x1*s));px++){const v=f(px/s,842-py/s);if(v!==null)page[py*PW+px]=v;}};
 const disc=(x:number,y:number,r:number,v:number)=>fill(x-r,y-r,x+r,y+r,(px,py)=>Math.hypot(px-x,py-y)<=r?v:null);
 const ring=(x:number,y:number,r:number)=>fill(x-r-1,y-r-1,x+r+1,y+r+1,(px,py)=>Math.abs(Math.hypot(px-x,py-y)-r)<=.5?70:null);
 STUDIO_MARKERS.forEach(([x,y])=>fill(x,y,x+30,y+30,()=>0));disc(39,768,6,0);
 const b=OPTICAL_LOGO_BOX;fill(b.x,b.y,b.x+b.size,b.y+b.size,()=>0);           // worst case: a solid black square logo
 for(const p of layout.bubbles)ring(p.x,p.y,p.r);[478,512].forEach(x=>ring(x,748,10));
 [...answers].forEach((a,i)=>layout.bubbles.filter((p:any)=>p.questionNo===i+1&&p.option===a).forEach((p:any)=>disc(p.x,p.y,p.r*.85,80)));disc(478,748,8.5,80);
 for(const turn of [0,7,180]){
  const W=1500,H=2000,img=new Uint8ClampedArray(W*H*4),t=turn*Math.PI/180,cx=W/2,cy=H/2,hw=520,hh=hw*842/595;
  const raw=[[-hw*.9,-hh],[hw*.9,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>[cx+x*Math.cos(t)-y*Math.sin(t),cy+x*Math.sin(t)+y*Math.cos(t)]);
  const toPage=homography(raw,[[0,0],[PW,0],[PW,PH],[0,PH]])!;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const w=toPage[6]*x+toPage[7]*y+toPage[8],u=Math.round((toPage[0]*x+toPage[1]*y+toPage[2])/w),v=Math.round((toPage[3]*x+toPage[4]*y+toPage[5])/w);const lum=u>=0&&v>=0&&u<PW&&v<PH?page[v*PW+u]:110;const i=(y*W+x)*4;img[i]=img[i+1]=img[i+2]=lum;img[i+3]=255;}
  const read=readOmrImage({width:W,height:H,data:img},template);
  expect(read.fiducialsFound,`turn ${turn}`).toBe(4);
  expect(read.booklet,`turn ${turn}`).toBe('A');
  expect(read.answers_by_subject.GENEL,`turn ${turn}`).toBe(answers);
 }
});
