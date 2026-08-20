import { describe, expect, it } from 'vitest';
import { readOmrImage, scoreTemplate, type ImageDataLike, type OmrTemplateRuntime } from '../src/lib/omrEngine';

function image(w=400,h=400):ImageDataLike{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255}return{width:w,height:h,data}}
function disk(img:ImageDataLike,cx:number,cy:number,r:number){const d=img.data as Uint8ClampedArray;for(let y=Math.max(0,cy-r);y<=Math.min(img.height-1,cy+r);y++)for(let x=Math.max(0,cx-r);x<=Math.min(img.width-1,cx+r);x++){if((x-cx)**2+(y-cy)**2>r*r)continue;const i=(y*img.width+x)*4;d[i]=d[i+1]=d[i+2]=0;d[i+3]=255}}
function mm(v:number){return Math.round(v*4)}
function baseImage(){const img=image();for(const [x,y] of [[10,10],[90,10],[10,90],[90,90]])disk(img,mm(x),mm(y),7);return img}
const template:OmrTemplateRuntime={id:'demo',name:'Synthetic OMR',pageWidthMm:100,pageHeightMm:100,fiducials:{targets:[[10,10],[90,10],[10,90],[90,90]],searchRadiusRatio:.05},cameraGeometry:{regions:[{id:'MAT',type:'bubble-grid',purpose:'answers',subjectCode:'MAT',questionCount:2,options:['A','B'],markThreshold:.45,doubleMarkDelta:.08,cells:[{questionNo:1,option:'A',xMm:30,yMm:30,radiusMm:2},{questionNo:1,option:'B',xMm:40,yMm:30,radiusMm:2},{questionNo:2,option:'A',xMm:30,yMm:40,radiusMm:2},{questionNo:2,option:'B',xMm:40,yMm:40,radiusMm:2}]}]}};

describe('camera OMR engine',()=>{
 it('finds configured fiducials and reads a marked bubble while preserving a blank question',()=>{const img=baseImage();disk(img,mm(40),mm(30),8);const score=scoreTemplate(img,template);expect(score.fiducialsFound).toBe(4);expect(score.confidence).toBeGreaterThan(.7);const r=readOmrImage(img,template);expect(r.answers_by_subject.MAT).toBe('B_');expect(r.confidence).toBeGreaterThan(.5)});
 it('treats a double mark as blank and surfaces it for review',()=>{const img=baseImage();disk(img,mm(30),mm(30),8);disk(img,mm(40),mm(30),8);const r=readOmrImage(img,template);expect(r.answers_by_subject.MAT[0]).toBe('_');expect(r.issues.join(' ')).toMatch(/çift|kararsız/i)});
 it('refuses to invent answers when fiducials are missing',()=>{const r=readOmrImage(image(),template);expect(Object.keys(r.answers_by_subject)).toHaveLength(0);expect(r.confidence).toBeLessThan(.5)});
});
