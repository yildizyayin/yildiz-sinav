import {expect,it} from 'vitest';
import {readOmrImage,scoreTemplate,type ImageDataLike,type OmrTemplateRuntime} from '../src/lib/omrEngine';

function image(width=1000,height=1000):ImageDataLike{
 const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255}return{width,height,data};
}
function dot(img:ImageDataLike,x:number,y:number,r=11){
 const d=img.data as Uint8ClampedArray;for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(img.height-1,Math.ceil(y+r));py++)for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(img.width-1,Math.ceil(x+r));px++){if((px-x)**2+(py-y)**2>r*r)continue;const i=(py*img.width+px)*4;d[i]=15;d[i+1]=15;d[i+2]=15;d[i+3]=255;}
}
const mm=(value:number)=>value*10;
function template():OmrTemplateRuntime{return{
 id:'camera-v1',name:'Synthetic Camera Form',pageWidthMm:100,pageHeightMm:100,
 fiducials:{searchRadiusRatio:.04,targets:[{xMm:10,yMm:10},{xMm:90,yMm:10},{xMm:10,yMm:90},{xMm:90,yMm:90}]},
 cameraGeometry:{regions:[
  {id:'math',type:'answers',purpose:'answers',subjectCode:'MAT',xMm:30,yMm:30,widthMm:40,heightMm:20,questionCount:2,options:['A','B','C','D'],bubbleRadiusMm:1.5,markThreshold:.5,doubleMarkDelta:.07},
  {id:'booklet',purpose:'booklet',xMm:10,yMm:60,widthMm:10,heightMm:20,positions:1,values:['A','B'],bubbleRadiusMm:1.5,markThreshold:.5,doubleMarkDelta:.07},
 ]}
};}
function validSheet(){
 const img=image();for(const [x,y] of [[10,10],[90,10],[10,90],[90,90]])dot(img,mm(x),mm(y),12);
 // Answer cells: q1=B, q2=D. For 30..70mm / four options => x 35,45,55,65. Rows => y 35,45.
 dot(img,mm(45),mm(35),13);dot(img,mm(65),mm(45),13);
 // Booklet A: one position, first of two values => x 15, y 65.
 dot(img,mm(15),mm(65),13);return img;
}

it('reads a synthetic photographed optical form through fiducial alignment and bubble detection',()=>{
 const img=validSheet(),t=template();const scored=scoreTemplate(img,t);expect(scored.fiducialsFound).toBe(4);expect(scored.confidence).toBeGreaterThan(.75);
 const result=readOmrImage(img,t);expect(result.fiducialsFound).toBe(4);expect(result.answers_by_subject).toEqual({MAT:'BD'});expect(result.booklet).toBe('A');expect(result.confidence).toBeGreaterThan(.65);expect(result.issues.filter(issue=>issue.includes('çift'))).toEqual([]);
});

it('turns double marks into blank instead of guessing an answer',()=>{
 const img=validSheet();dot(img,mm(55),mm(35),13);const result=readOmrImage(img,template());expect(result.answers_by_subject.MAT).toBe('_D');expect(result.issues.some(issue=>issue.includes('çift/kararsız'))).toBe(true);
});

it('fails closed when a photographed sheet does not contain enough fiducials',()=>{
 const img=image();dot(img,mm(10),mm(10),12);dot(img,mm(90),mm(10),12);const result=readOmrImage(img,template());expect(result.fiducialsFound).toBeLessThan(3);expect(result.answers_by_subject).toEqual({});expect(result.confidence).toBeLessThanOrEqual(.35);expect(result.issues.some(issue=>issue.includes('kadraja'))).toBe(true);
});
