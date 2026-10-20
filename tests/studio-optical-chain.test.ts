import {expect,it} from 'vitest';
import {decideBooklet,decideReplace,evaluateSheet} from '../worker/lib/studio-optical-submit';
import {opticalPage,STUDIO_BOOKLET_REGION,STUDIO_MARKERS,STUDIO_OPTICAL_CAPACITY} from '../worker/lib/studio-pdf';
import {homography,parseRuntimeTemplate,readOmrImage} from '../src/lib/omrEngine';

const PT=2.83465,PAGE_H=842;

it('booklet bubble must agree with the scanning template; blank/double needs explicit confirmation',()=>{
 expect(decideBooklet('A','A',undefined)).toEqual({ok:true});
 expect(decideBooklet('A','B',true)).toMatchObject({ok:false,status:409,code:'BOOKLET_MISMATCH'});
 expect(decideBooklet('B',null,undefined)).toMatchObject({ok:false,code:'BOOKLET_UNREAD'});
 expect(decideBooklet('B','',true)).toEqual({ok:true});
 expect(decideBooklet('A','C',true)).toMatchObject({ok:false,code:'INVALID_READ_BOOKLET'});
});

it('maps printed positions to the stored booklet order, counts blanks and rejects wrong-length or invalid reads',()=>{
 const rowsB=[{id:'q3',correct_answer:'C'},{id:'q2',correct_answer:'B'},{id:'q1',correct_answer:'A'}];
 const r=evaluateSheet(rowsB,'C_D');
 expect(r).toMatchObject({ok:true,correct:1,blank:1,total:3});
 if(r.ok)expect(r.responses.map(x=>[x.questionId,x.selectedAnswer,x.isCorrect,x.position])).toEqual([['q3','C',true,1],['q2',null,false,2],['q1','D',false,3]]);
 expect(evaluateSheet(rowsB,'CB')).toMatchObject({ok:false,code:'ANSWER_COUNT_MISMATCH'});
 expect(evaluateSheet(rowsB,'C?A')).toMatchObject({ok:false,code:'INVALID_ANSWER_VALUE'});
 expect(evaluateSheet(rowsB,{q1:'a',q2:'z'})).toMatchObject({ok:true,correct:1,blank:2});
 expect(evaluateSheet(rowsB,undefined)).toMatchObject({ok:false,code:'ANSWERS_REQUIRED'});
 expect(evaluateSheet([],'')).toMatchObject({ok:false,code:'BOOKLET_EMPTY'});
});

it('never silently replaces an earlier result',()=>{
 const prev={score:.5,booklet_code:'A',completed_at:'2026-10-20T10:00:00Z'};
 expect(decideReplace(null,undefined,undefined)).toEqual({ok:true,replacing:false});
 expect(decideReplace(prev,undefined,undefined)).toMatchObject({ok:false,status:409,code:'ALREADY_SCANNED',previous:{score:.5,booklet:'A'}});
 expect(decideReplace(prev,true,'yok')).toMatchObject({ok:false,code:'REPLACE_REASON_REQUIRED'});
 expect(decideReplace(prev,true,'yanlış öğrenci seçildi')).toEqual({ok:true,replacing:true});
});

it('v2 sheet: fiducial targets are the centres of the drawn squares, bubbles never overlap and stay inside the corner frame',()=>{
 for(const n of [1,5,15,16,30,31,44]){
  const {layout,geometry}=opticalPage('Deneme','A',n,5) as any;
  expect(geometry.version).toBe('ANUNEX-OPTICAL-2');
  STUDIO_MARKERS.forEach(([x,y],i)=>{expect(Math.abs((x+15)/PT-geometry.fiducials.targets[i].xMm)).toBeLessThan(.02);expect(Math.abs((PAGE_H-y-15)/PT-geometry.fiducials.targets[i].yMm)).toBeLessThan(.02);});
  expect(geometry.cameraGeometry.regions.find((r:any)=>r.purpose==='booklet')).toEqual(STUDIO_BOOKLET_REGION);
  const b=layout.bubbles;expect(b).toHaveLength(n*5);
  for(const p of b){expect(p.r).toBeGreaterThanOrEqual(6);expect(p.y-p.r).toBeGreaterThan(54+10);expect(p.y+p.r).toBeLessThan(705);expect(p.x-p.r).toBeGreaterThan(54);expect(p.x+p.r).toBeLessThan(541);}
  for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++)expect(Math.hypot(b[i].x-b[j].x,b[i].y-b[j].y)).toBeGreaterThan(b[i].r+b[j].r+3);
  if(n<=15)expect(b[0].r).toBe(11);
 }
 expect(STUDIO_OPTICAL_CAPACITY).toBe(44);
});

/** Paints the sheet from the drawing layout (not from the template), then photographs it: desk, clutter, perspective, uneven light. */
function photo(layout:any,marks:Array<{x:number;y:number;r:number}>,opts:{turn?:number;tilt?:number;dropCorner?:boolean;lightInk?:boolean}={}){
 const s=2,PW=595*s,PH=842*s,page=new Uint8Array(PW*PH).fill(236);
 const fill=(x0:number,y0:number,x1:number,y1:number,f:(x:number,y:number)=>number|null)=>{for(let py=Math.max(0,Math.floor((PAGE_H-y1)*s));py<Math.min(PH,Math.ceil((PAGE_H-y0)*s));py++)for(let px=Math.max(0,Math.floor(x0*s));px<Math.min(PW,Math.ceil(x1*s));px++){const v=f(px/s,PAGE_H-py/s);if(v!==null)page[py*PW+px]=Math.min(page[py*PW+px],v);}};
 const disc=(x:number,y:number,r:number,v:number)=>fill(x-r,y-r,x+r,y+r,(px,py)=>Math.hypot(px-x,py-y)<=r?v:null);
 const ring=(x:number,y:number,r:number)=>fill(x-r-1,y-r-1,x+r+1,y+r+1,(px,py)=>Math.abs(Math.hypot(px-x,py-y)-r)<=.5?70:null);
 STUDIO_MARKERS.filter((_,i)=>!(opts.dropCorner&&i===3)).forEach(([x,y])=>fill(x,y,x+30,y+30,()=>0));
 disc(39,768,6,0);
 for(const b of layout.bubbles)ring(b.x,b.y,b.r);[478,512].forEach(x=>ring(x,748,10));
 for(const m of marks)disc(m.x,m.y,m.r*.85,opts.lightInk?150:80);
 const W=1500,H=2000,img=new Uint8ClampedArray(W*H*4);
 const t=(opts.turn??0)*Math.PI/180,tilt=opts.tilt??.12,cx=W/2+20,cy=H/2-30,hw=520,hh=hw*842/595;
 const raw=[[-hw*(1-tilt),-hh],[hw*(1-tilt),-hh],[hw,hh],[-hw,hh]].map(([x,y])=>[cx+x*Math.cos(t)-y*Math.sin(t),cy+x*Math.sin(t)+y*Math.cos(t)]);
 const toPage=homography(raw,[[0,0],[PW,0],[PW,PH],[0,PH]])!;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const w=toPage[6]*x+toPage[7]*y+toPage[8],u=Math.round((toPage[0]*x+toPage[1]*y+toPage[2])/w),v=Math.round((toPage[3]*x+toPage[4]*y+toPage[5])/w);
  let lum=u>=0&&v>=0&&u<PW&&v<PH?page[v*PW+u]:95+((x*7+y*13)%23);
  // clutter on the desk: a dark pen (long bar) and a dark square coaster far bigger than the markers
  if((x>40&&x<70&&y>200&&y<900)||(x>1380&&x<1495&&y>1860&&y<1975))lum=20;
  lum=lum*(.78+.3*x/W);const i=(y*W+x)*4;img[i]=img[i+1]=img[i+2]=lum;img[i+3]=255;}
 return {width:W,height:H,data:img};
}

it('reads a photographed v2 sheet: desk around it, perspective, uneven light, upside down, faint marks',()=>{
 const n=44,answers=Array.from({length:n},(_,i)=>i%11===10?'_':'ABCDE'[(i*7)%5]).join('');
 const {layout,geometry}=opticalPage('Deneme','B',n,5) as any;const template=parseRuntimeTemplate({...geometry,id:'t',name:'t'});
 const marks=[...answers].flatMap((a,i)=>a==='_'?[]:layout.bubbles.filter((b:any)=>b.questionNo===i+1&&b.option===a));marks.push({x:512,y:748,r:10});
 for(const opts of [{},{turn:9,tilt:.2},{turn:180},{turn:-6,lightInk:true}] as Array<{turn?:number;tilt?:number;lightInk?:boolean}>){
  const read=readOmrImage(photo(layout,marks,opts),template);
  expect(read.fiducialsFound,JSON.stringify(opts)).toBe(4);
  expect(read.booklet,JSON.stringify(opts)).toBe('B');
  expect(read.answers_by_subject.GENEL,JSON.stringify(opts)).toBe(answers);
  expect(read.confidence).toBeGreaterThan(opts.lightInk?.6:.75);
  if(opts.lightInk)expect(read.issues.join(' ')).toContain('soluk');
 }
 const blank=readOmrImage(photo(layout,[]),template);
 expect(blank.booklet).toBeUndefined();expect(blank.answers_by_subject.GENEL).toBe('_'.repeat(n));
});

it('fails closed when a corner square is out of the frame instead of guessing answers',()=>{
 const {layout,geometry}=opticalPage('Deneme','A',5,5) as any;const template=parseRuntimeTemplate({...geometry,id:'t',name:'t'});
 const read=readOmrImage(photo(layout,layout.bubbles.filter((b:any)=>b.option==='A'),{dropCorner:true}),template);
 expect(read.answers_by_subject.GENEL??'').not.toBe('AAAAA');
 expect(read.confidence).toBeLessThan(.6);
 expect(read.issues.join(' ')).toMatch(/referans|kadraj|kare/);
});
