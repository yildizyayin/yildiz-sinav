import {expect,it} from 'vitest';
import {decideBooklet,decideReplace,evaluateSheet} from '../worker/lib/studio-optical-submit';
import {opticalPage,STUDIO_BOOKLET_REGION,STUDIO_FIDUCIAL_TARGETS,STUDIO_OPTICAL_CAPACITY} from '../worker/lib/studio-pdf';
import {parseRuntimeTemplate,readOmrImage} from '../src/lib/omrEngine';

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

it('template fiducials sit exactly on the drawn black squares, and the booklet bubbles are readable regions',()=>{
 const {content,geometry}=opticalPage('Deneme','A',44,4) as any;
 const squares=[...content.matchAll(/0 0 0 rg (\d+) (\d+) 12 12 re f/g)].map(m=>({xMm:(Number(m[1])+6)/PT,yMm:(PAGE_H-Number(m[2])-6)/PT}));
 expect(squares).toHaveLength(4);
 squares.forEach((s,i)=>{expect(Math.abs(s.xMm-geometry.fiducials.targets[i].xMm)).toBeLessThan(.02);expect(Math.abs(s.yMm-geometry.fiducials.targets[i].yMm)).toBeLessThan(.02);});
 expect(geometry.fiducials.targets).toEqual(STUDIO_FIDUCIAL_TARGETS);
 expect(geometry.cameraGeometry.regions.find((r:any)=>r.purpose==='booklet')).toEqual(STUDIO_BOOKLET_REGION);
 // Every answer bubble of a full 44-question sheet stays above the bottom fiducials.
 const lowest=Math.max(...geometry.cameraGeometry.regions[0].cells.map((c:any)=>c.yMm));
 expect(lowest).toBeLessThan(STUDIO_FIDUCIAL_TARGETS[2].yMm-8);
 expect(STUDIO_OPTICAL_CAPACITY).toBe(44);
});

/** Paints a 150 dpi page from the drawing coordinates (not from the template) and reads it with the real engine. */
function paint(marks:Array<[number,number]>){
 const s=150/72,W=Math.round(595*s),H=Math.round(842*s),data=new Uint8ClampedArray(W*H*4).fill(255);
 const disc=(x:number,y:number,r:number,v:number)=>{const cx=x*s,cy=(PAGE_H-y)*s,R=r*s;for(let py=Math.floor(cy-R);py<=cy+R;py++)for(let px=Math.floor(cx-R);px<=cx+R;px++){if((px-cx)**2+(py-cy)**2>R*R)continue;const i=(py*W+px)*4;data[i]=data[i+1]=data[i+2]=v;}};
 const square=(x:number,y:number)=>{for(let py=Math.round((PAGE_H-y-12)*s);py<Math.round((PAGE_H-y)*s);py++)for(let px=Math.round(x*s);px<Math.round((x+12)*s);px++){const i=(py*W+px)*4;data[i]=data[i+1]=data[i+2]=0;}};
 for(const [x,y] of [[42,788],[541,788],[42,42],[541,42]])square(x,y);
 for(const [x,y] of marks)disc(x,y,6,35);
 return {width:W,height:H,data};
}

it('a filled sheet is read back exactly: every answer, blanks and the booklet bubble',()=>{
 const n=44,answers=Array.from({length:n},(_,i)=>i%11===10?'_':'ABCD'[(i*7)%4]).join('');
 const rows=Math.ceil(n/2),marks:Array<[number,number]>=[];
 [...answers].forEach((a,i)=>{if(a==='_')return;const col=Math.floor(i/rows),row=i%rows;marks.push([70+col*245+28+'ABCD'.indexOf(a)*29,666-row*28+3]);});
 marks.push([440,711]);
 const template=parseRuntimeTemplate({...(opticalPage('Deneme','B',n,4) as any).geometry,id:'t',name:'t'});
 const read=readOmrImage(paint(marks),template);
 expect(read.fiducialsFound).toBe(4);
 expect(read.booklet).toBe('B');
 expect(read.answers_by_subject.GENEL).toBe(answers);
 const blank=readOmrImage(paint([]),template);
 expect(blank.booklet).toBeUndefined();expect(blank.answers_by_subject.GENEL).toBe('_'.repeat(n));
});
