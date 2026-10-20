export type ImageDataLike={width:number;height:number;data:Uint8ClampedArray|Uint8Array|number[]};
export type Point={x:number;y:number};

export interface OmrTemplateRuntime{
 id:string;
 name:string;
 pageWidthMm:number;
 pageHeightMm:number;
 cameraGeometry:any;
 fiducials:any;
}

export interface OmrReadResult{
 templateId:string;
 templateName:string;
 confidence:number;
 student_number?:string;
 booklet?:string;
 answers_by_subject:Record<string,string>;
 issues:string[];
 fiducialsFound:number;
}

type Transform=(xMm:number,yMm:number)=>Point;
type Bubble={xMm:number;yMm:number;radiusMm:number;value:string;questionNo?:number;position?:number};

export function parseRuntimeTemplate(raw:any):OmrTemplateRuntime{
 const camera=typeof raw.cameraGeometry==='string'?JSON.parse(raw.cameraGeometry):raw.cameraGeometry;
 const fid=typeof raw.fiducials==='string'?JSON.parse(raw.fiducials):raw.fiducials;
 return {id:String(raw.id||raw.versionId),name:String(raw.name||raw.templateName||'Optik'),pageWidthMm:Number(raw.pageWidthMm),pageHeightMm:Number(raw.pageHeightMm),cameraGeometry:camera,fiducials:fid};
}

export function scoreTemplate(image:ImageDataLike,template:OmrTemplateRuntime){
 const alignment=estimateAlignment(image,template);
 return {templateId:template.id,templateName:template.name,confidence:alignment.confidence,fiducialsFound:alignment.found,issues:alignment.issues};
}

export function readOmrImage(image:ImageDataLike,template:OmrTemplateRuntime):OmrReadResult{
 const alignment=estimateAlignment(image,template);
 const issues=[...alignment.issues];
 const answers:Record<string,string>={};
 let studentNo:string|undefined;
 let booklet:string|undefined;
 if(!alignment.transform||alignment.found<3)return {templateId:template.id,templateName:template.name,confidence:Math.min(.35,alignment.confidence),answers_by_subject:{},issues:[...issues,'Sayfa hizası güvenilir biçimde belirlenemedi. Optiğin tamamını kadraja alın.'],fiducialsFound:alignment.found};
 const regions=Array.isArray(template.cameraGeometry?.regions)?template.cameraGeometry.regions:[];
 const confidences:number[]=[alignment.confidence];
 for(const region of regions){
   const purpose=String(region.purpose||((region.type==='answers'||region.type==='bubble-grid')&&region.subjectCode?'answers':region.type)||'').toLowerCase();
   if(purpose==='answers'||region.type==='answers'){
     const subject=String(region.subjectCode||region.subject||region.id||'').trim().toUpperCase();
     if(!subject){issues.push(`Cevap bölgesi ${region.id||''}: ders kodu yok.`);continue}
     const r=readAnswerRegion(image,alignment.transform,template,region);
     answers[subject]=r.sequence;issues.push(...r.issues.map(x=>`${subject}: ${x}`));confidences.push(r.confidence);
   }else if(purpose==='student-number'||purpose==='student_number'){
     const r=readIdentityGrid(image,alignment.transform,template,region,'digit');
     studentNo=r.value||undefined;issues.push(...r.issues.map(x=>`Öğrenci no: ${x}`));confidences.push(r.confidence);
   }else if(purpose==='booklet'){
     const r=readIdentityGrid(image,alignment.transform,template,region,'value');
     booklet=r.value||undefined;issues.push(...r.issues.map(x=>`Kitapçık: ${x}`));confidences.push(r.confidence);
   }
 }
 if(!Object.keys(answers).length)issues.push('Kamera şablonunda okunabilir cevap bölgesi bulunamadı.');
 const confidence=confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:0;
 return {templateId:template.id,templateName:template.name,confidence:round(confidence,3),student_number:studentNo,booklet,answers_by_subject:answers,issues,fiducialsFound:alignment.found};
}

export function captureVideoFrame(video:HTMLVideoElement,maxWidth=1800):ImageData{
 const scale=Math.min(1,maxWidth/Math.max(1,video.videoWidth));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Kamera görüntüsü işlenemedi.');ctx.drawImage(video,0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height);
}

export async function imageFileToImageData(file:File,maxWidth=1800):Promise<ImageData>{
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,maxWidth/Math.max(1,bitmap.width));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){bitmap.close();throw new Error('Fotoğraf görüntüsü işlenemedi.');}
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return ctx.getImageData(0,0,canvas.width,canvas.height);
}

function estimateAlignment(image:ImageDataLike,template:OmrTemplateRuntime):{transform:Transform|null;confidence:number;found:number;issues:string[]}{
 const targets=Array.isArray(template.fiducials?.targets)?template.fiducials.targets:[];
 const expected=targets.map((t:any)=>({xMm:Number(Array.isArray(t)?t[0]:t.xMm??t.x),yMm:Number(Array.isArray(t)?t[1]:t.yMm??t.y)})).filter((p:any)=>Number.isFinite(p.xMm)&&Number.isFinite(p.yMm));
 if(expected.length<3)return {transform:null,confidence:0,found:0,issues:['Şablonda en az 3 kamera referans noktası bulunmalıdır.']};
 // A018: a real phone photo shows the desk around the sheet and is taken at an angle. Look for the four
 // square corner markers anywhere in the frame and undo the perspective; only when that fails fall back
 // to the old "photo is exactly the page" search.
 if(expected.length===4){const quad=locateMarkerQuad(image,template,expected);if(quad)return quad;}
 const found:{xMm:number;yMm:number;px:number;py:number;quality:number}[]=[];
 for(const p of expected){
   const ex=p.xMm/template.pageWidthMm*image.width,ey=p.yMm/template.pageHeightMm*image.height;
   const radius=Math.max(18,Math.min(image.width,image.height)*Number(template.fiducials?.searchRadiusRatio||0.07));
   const hit=darkCentroid(image,ex,ey,radius);
   if(hit)found.push({...p,px:hit.x,py:hit.y,quality:hit.quality});
 }
 if(found.length<3)return {transform:null,confidence:found.length/expected.length*.45,found:found.length,issues:[`${expected.length} referansın yalnız ${found.length} tanesi bulundu.`,'Dört köşedeki siyah kare kadrajda ve net görünmelidir.']};
 const transform=affineLeastSquares(found);
 if(!transform)return {transform:null,confidence:.2,found:found.length,issues:['Referans noktalarından sayfa dönüşümü hesaplanamadı.']};
 let residual=0;for(const f of found){const q=transform(f.xMm,f.yMm);residual+=Math.hypot(q.x-f.px,q.y-f.py)}residual/=found.length;
 const quality=found.reduce((s,f)=>s+f.quality,0)/found.length;
 const residualScore=Math.max(0,1-residual/(Math.min(image.width,image.height)*.025));
 const coverage=found.length/expected.length;
 const confidence=Math.max(0,Math.min(.99,coverage*.45+quality*.25+residualScore*.30));
 const issues:string[]=[];if(residualScore<.55)issues.push('Optik açısı fazla eğik veya referans işaretleri belirsiz.');if(found.length<expected.length)issues.push(`${expected.length-found.length} referans işareti bulunamadı.`);
 return {transform,confidence,found:found.length,issues};
}

type Blob={x:number;y:number;area:number;ink:number};
/** Solid square blobs anywhere in the frame (on a ≤1000px grey copy, locally thresholded so shadows do not matter). */
export function findSquareMarkers(image:ImageDataLike):Blob[]{
 const scale=Math.min(1,1000/Math.max(image.width,image.height));const W=Math.max(1,Math.round(image.width*scale)),H=Math.max(1,Math.round(image.height*scale));
 const gray=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)gray[y*W+x]=luminance(image,Math.min(image.width-1,x/scale),Math.min(image.height-1,y/scale));
 const integral=new Float64Array((W+1)*(H+1));for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=gray[y*W+x];integral[(y+1)*(W+1)+x+1]=integral[y*(W+1)+x+1]+row;}}
 const half=Math.max(8,Math.round(Math.min(W,H)/14));const dark=new Uint8Array(W*H);
 for(let y=0;y<H;y++){const y0=Math.max(0,y-half),y1=Math.min(H,y+half+1);for(let x=0;x<W;x++){const x0=Math.max(0,x-half),x1=Math.min(W,x+half+1);const sum=integral[y1*(W+1)+x1]-integral[y0*(W+1)+x1]-integral[y1*(W+1)+x0]+integral[y0*(W+1)+x0];const mean=sum/((y1-y0)*(x1-x0));const v=gray[y*W+x];if(v<60||(v<mean*.62&&v<170))dark[y*W+x]=1;}}
 const seen=new Uint8Array(W*H),stack:number[]=[],pix:number[]=[],out:Blob[]=[];const maxArea=W*H*.02,minArea=Math.max(20,W*H*.00002);
 for(let start=0;start<W*H;start++){if(!dark[start]||seen[start])continue;stack.length=0;pix.length=0;stack.push(start);seen[start]=1;let sx=0,sy=0,tooBig=false;
   while(stack.length){const i=stack.pop()!;if(pix.length<=maxArea)pix.push(i);else tooBig=true;const x=i%W,y=(i-x)/W;sx+=x;sy+=y;
     if(x>0&&dark[i-1]&&!seen[i-1]){seen[i-1]=1;stack.push(i-1)}if(x<W-1&&dark[i+1]&&!seen[i+1]){seen[i+1]=1;stack.push(i+1)}if(y>0&&dark[i-W]&&!seen[i-W]){seen[i-W]=1;stack.push(i-W)}if(y<H-1&&dark[i+W]&&!seen[i+W]){seen[i+W]=1;stack.push(i+W)}}
   if(tooBig||pix.length<minArea)continue;const n=pix.length,cx=sx/n,cy=sy/n;let far=0,ink=0;for(const i of pix){const x=i%W,y=(i-x)/W;far=Math.max(far,Math.hypot(x-cx,y-cy));ink+=gray[i]}
   // A square's farthest pixel sits at 0.71×√area (a filled disc at 0.56, letters and lines much further): rotation-invariant.
   const spread=(far+.5)/Math.sqrt(n),solid=n/(Math.PI*(far+.5)**2);if(spread<.63||spread>.86||solid<.5)continue;
   out.push({x:(cx+.5)/scale,y:(cy+.5)/scale,area:n/(scale*scale),ink:1-ink/n/255});
 }
 return out;
}

function locateMarkerQuad(image:ImageDataLike,template:OmrTemplateRuntime,expected:Array<{xMm:number;yMm:number}>){
 const blobs=findSquareMarkers(image).sort((a,b)=>b.area-a.area).slice(0,14);if(blobs.length<4)return null;
 // Template corners in reading order TL,TR,BR,BL.
 const byMm=cornerOrder(expected.map(p=>({x:p.xMm,y:p.yMm})));const tpl=byMm.map(i=>expected[i]);
 const tplW=(Math.hypot(tpl[1].xMm-tpl[0].xMm,tpl[1].yMm-tpl[0].yMm)+Math.hypot(tpl[2].xMm-tpl[3].xMm,tpl[2].yMm-tpl[3].yMm))/2;
 const tplH=(Math.hypot(tpl[3].xMm-tpl[0].xMm,tpl[3].yMm-tpl[0].yMm)+Math.hypot(tpl[2].xMm-tpl[1].xMm,tpl[2].yMm-tpl[1].yMm))/2;
 const probe=template.fiducials?.orientationProbe;
 let best:{h:number[];score:number;quality:number;oriented:boolean;aspect:number}|null=null;
 const n=blobs.length;
 for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++)for(let d=c+1;d<n;d++){
   const set=[blobs[a],blobs[b],blobs[c],blobs[d]];const areas=set.map(s=>s.area);if(Math.max(...areas)/Math.min(...areas)>3.2)continue;
   const order=cornerOrder(set);const img=order.map(i=>set[i]);if(!convex(img))continue;
   const quadArea=polygonArea(img);if(quadArea<image.width*image.height*.08)continue;
   // The phone may be turned: try the four ways the template corners can land on the image corners.
   for(let k=0;k<4;k++){const rot=[0,1,2,3].map(i=>img[(i+k)%4]);
     const w=(Math.hypot(rot[1].x-rot[0].x,rot[1].y-rot[0].y)+Math.hypot(rot[2].x-rot[3].x,rot[2].y-rot[3].y))/2,h=(Math.hypot(rot[3].x-rot[0].x,rot[3].y-rot[0].y)+Math.hypot(rot[2].x-rot[1].x,rot[2].y-rot[1].y))/2;
     const aspect=(w/h)/(tplW/tplH);if(aspect<.7||aspect>1.43)continue;
     const H=homography(tpl.map(p=>[p.xMm,p.yMm]),rot.map(p=>[p.x,p.y]));if(!H)continue;
     let oriented=false,probeScore=0;if(probe){const t=applyH(H);probeScore=bubbleDarkness(image,t,{xMm:Number(probe.xMm),yMm:Number(probe.yMm),radiusMm:Number(probe.radiusMm||2),value:''});oriented=probeScore>.45;if(!oriented)continue;}
     const markerSize=Math.sqrt(areas.reduce((s,v)=>s+v,0)/4);const markerQuality=Math.min(1,set.reduce((s,v)=>s+v.ink,0)/4/0.75);
     const score=quadArea+(oriented?image.width*image.height:0)-(Math.abs(Math.log(aspect))*quadArea)+markerSize;
     if(!best||score>best.score)best={h:H,score,quality:markerQuality,oriented,aspect};
   }
 }
 if(!best)return null;
 const geometry=Math.max(0,1-Math.abs(Math.log(best.aspect))/Math.log(1.43));
 const confidence=Math.max(0,Math.min(.99,.45+best.quality*.25+(.15+.15*geometry)));
 const issues:string[]=[];if(geometry<.35)issues.push('Fotoğraf çok açılı çekilmiş; telefonu kâğıda daha dik tutun.');
 return {transform:applyH(best.h),confidence,found:4,issues};
}

/** Indices in order top-left, top-right, bottom-right, bottom-left. */
function cornerOrder(points:Array<{x:number;y:number}>){
 const idx=points.map((_,i)=>i);const tl=idx.reduce((m,i)=>points[i].x+points[i].y<points[m].x+points[m].y?i:m,0),br=idx.reduce((m,i)=>points[i].x+points[i].y>points[m].x+points[m].y?i:m,0);
 const rest=idx.filter(i=>i!==tl&&i!==br);if(rest.length!==2)return [0,1,2,3];const [p,q]=rest;const tr=points[p].x-points[p].y>points[q].x-points[q].y?p:q,bl=tr===p?q:p;return [tl,tr,br,bl];
}
function convex(p:Array<{x:number;y:number}>){let sign=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];const z=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);if(Math.abs(z)<1e-6)return false;const s=Math.sign(z);if(sign&&s!==sign)return false;sign=s}return new Set(p).size===4}
function polygonArea(p:Array<{x:number;y:number}>){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2}

/** Perspective transform from four point pairs (DLT with h33=1). */
export function homography(src:number[][],dst:number[][]):number[]|null{
 const A:number[][]=[];for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y,u]);A.push([0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;if(Math.abs(A[p][c])<1e-10)return null;[A[c],A[p]]=[A[p],A[c]];const d=A[c][c];for(let j=c;j<9;j++)A[c][j]/=d;for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c];if(f)for(let j=c;j<9;j++)A[r][j]-=f*A[c][j]}}
 return [...A.map(r=>r[8]),1];
}
function applyH(h:number[]):Transform{return (x,y)=>{const w=h[6]*x+h[7]*y+h[8];return {x:(h[0]*x+h[1]*y+h[2])/w,y:(h[3]*x+h[4]*y+h[5])/w}}}

function readAnswerRegion(image:ImageDataLike,transform:Transform,template:OmrTemplateRuntime,region:any){
 const options=(Array.isArray(region.options)&&region.options.length?region.options:['A','B','C','D','E']).map((x:any)=>String(x).toUpperCase());
 const cells=buildAnswerCells(region,options);
 const questionCount=Number(region.questionCount||Math.max(0,...cells.map(c=>c.questionNo||0)));
 const groups=new Map<number,Bubble[]>();for(const c of cells){if(!c.questionNo)continue;if(!groups.has(c.questionNo))groups.set(c.questionNo,[]);groups.get(c.questionNo)!.push(c)}
 let sequence='';const issues:string[]=[];const qs:number[]=[];
 for(let q=1;q<=questionCount;q++){
   const bubbles=groups.get(q)||[];const scored=bubbles.map(b=>({b,score:bubbleDarkness(image,transform,b)})).sort((a,b)=>b.score-a.score);const top=scored[0],second=scored[1];
   const threshold=Number(region.markThreshold??.50);const delta=Number(region.doubleMarkDelta??.07);
   if(!top||top.score<threshold){
     // A018: a light pencil mark that clearly stands out from its row is read, but flagged; an unclear one stays blank and is flagged too.
     const gap=top?top.score-(second?.score||0):0;
     if(top&&top.score>=.28&&gap>=.2){sequence+=top.b.value;issues.push(`${q}. soruda soluk işaret (${top.b.value}) okundu; kontrol edin.`);qs.push(.6);continue}
     if(top&&top.score>=.18&&gap>=.12)issues.push(`${q}. soruda belirsiz soluk işaret; boş sayıldı, kontrol edin.`);
     sequence+='_';qs.push(top?.score||0);continue}
   if(second&&second.score>=threshold&&top.score-second.score<delta){sequence+='_';issues.push(`${q}. soruda çift/kararsız işaret.`);qs.push(Math.max(0,top.score-second.score));continue}
   sequence+=top.b.value;qs.push(Math.min(1,top.score-(second?.score||0)+.45));
 }
 const confidence=qs.length?qs.reduce((a,b)=>a+b,0)/qs.length:.2;return {sequence,confidence:round(confidence,3),issues};
}

function readIdentityGrid(image:ImageDataLike,transform:Transform,template:OmrTemplateRuntime,region:any,valueField:'digit'|'value'){
 const cells=buildIdentityCells(region,valueField);const positions=Math.max(0,...cells.map(c=>c.position||0));let value='';const issues:string[]=[];const conf:number[]=[];
 for(let p=1;p<=positions;p++){
   const scored=cells.filter(c=>c.position===p).map(b=>({b,score:bubbleDarkness(image,transform,b)})).sort((a,b)=>b.score-a.score);const top=scored[0],second=scored[1];const threshold=Number(region.markThreshold??.50);const delta=Number(region.doubleMarkDelta??.07);
   if(!top||top.score<threshold){
     if(top&&top.score>=.28&&top.score-(second?.score||0)>=.2){value+=top.b.value;issues.push(`${p}. hanede soluk işaret (${top.b.value}) okundu; kontrol edin.`);conf.push(.6);continue}
     value+='_';issues.push(`${p}. hane boş.`);conf.push(0);continue}
   if(second&&second.score>=threshold&&top.score-second.score<delta){value+='_';issues.push(`${p}. hanede çift işaret.`);conf.push(0);continue}
   value+=top.b.value;conf.push(Math.min(1,top.score-(second?.score||0)+.45));
 }
 const cleaned=value.includes('_')?'':value;return {value:cleaned,confidence:conf.length?round(conf.reduce((a,b)=>a+b,0)/conf.length,3):.2,issues};
}

function buildAnswerCells(region:any,options:string[]):Bubble[]{
 if(Array.isArray(region.cells)&&region.cells.length)return region.cells.map((c:any)=>({xMm:Number(c.xMm??c.x),yMm:Number(c.yMm??c.y),radiusMm:Number(c.radiusMm||region.bubbleRadiusMm||1.6),value:String(c.option||c.value||'').toUpperCase(),questionNo:Number(c.questionNo)})).filter((c:Bubble)=>Number.isFinite(c.xMm)&&Number.isFinite(c.yMm)&&c.questionNo&&c.value);
 const qCount=Number(region.questionCount||region.rows||0);if(!qCount)return[];const x=Number(region.xMm??region.x),y=Number(region.yMm??region.y),w=Number(region.widthMm??region.width),h=Number(region.heightMm??region.height);const out:Bubble[]=[];
 for(let q=0;q<qCount;q++)for(let o=0;o<options.length;o++){const cx=x+(o+.5)*w/options.length,cy=y+(q+.5)*h/qCount;out.push({xMm:cx,yMm:cy,radiusMm:Number(region.bubbleRadiusMm||Math.min(w/options.length,h/qCount)*.28),value:options[o],questionNo:q+1})}return out;
}

function buildIdentityCells(region:any,valueField:'digit'|'value'):Bubble[]{
 if(Array.isArray(region.cells)&&region.cells.length)return region.cells.map((c:any)=>({xMm:Number(c.xMm??c.x),yMm:Number(c.yMm??c.y),radiusMm:Number(c.radiusMm||region.bubbleRadiusMm||1.6),value:String(c[valueField]??c.value??''),position:Number(c.position)})).filter((c:Bubble)=>Number.isFinite(c.xMm)&&Number.isFinite(c.yMm)&&c.position&&c.value!=='');
 const positions=Number(region.positions||0);const values=(Array.isArray(region.values)&&region.values.length?region.values:(valueField==='digit'?['0','1','2','3','4','5','6','7','8','9']:['A','B','C','D'])).map(String);if(!positions)return[];const x=Number(region.xMm??region.x),y=Number(region.yMm??region.y),w=Number(region.widthMm??region.width),h=Number(region.heightMm??region.height);const out:Bubble[]=[];
 for(let p=0;p<positions;p++)for(let v=0;v<values.length;v++){const cx=x+(p+.5)*w/positions,cy=y+(v+.5)*h/values.length;out.push({xMm:cx,yMm:cy,radiusMm:Number(region.bubbleRadiusMm||Math.min(w/positions,h/values.length)*.28),value:values[v],position:p+1})}return out;
}

/** Share of ink inside the bubble relative to the paper right around it, so grey/shadowed paper reads like white paper.
 * The printed outline and letter are excluded by sampling only the inner 65%. */
function bubbleDarkness(image:ImageDataLike,transform:Transform,b:Bubble){
 const c=transform(b.xMm,b.yMm),rx=transform(b.xMm+b.radiusMm,b.yMm),ry=transform(b.xMm,b.yMm+b.radiusMm);const radius=Math.max(2,Math.min(Math.hypot(rx.x-c.x,rx.y-c.y),Math.hypot(ry.x-c.x,ry.y-c.y)));
 const inner=radius*.65,outer=radius*1.8;let sum=0,total=0;const ring:number[]=[];
 const minX=Math.max(0,Math.floor(c.x-outer)),maxX=Math.min(image.width-1,Math.ceil(c.x+outer)),minY=Math.max(0,Math.floor(c.y-outer)),maxY=Math.min(image.height-1,Math.ceil(c.y+outer));
 const step=Math.max(1,Math.floor(radius/8));
 for(let y=minY;y<=maxY;y+=step)for(let x=minX;x<=maxX;x+=step){const d2=(x-c.x)**2+(y-c.y)**2;if(d2<=inner*inner){sum+=luminance(image,x,y);total++}else if(d2>=(radius*1.25)**2&&d2<=outer*outer)ring.push(luminance(image,x,y))}
 if(!total)return 0;const mean=sum/total;
 ring.sort((a,b)=>a-b);const paper=Math.max(ring.length?ring[Math.floor(ring.length*.75)]:255,mean,1);
 if(paper<70)return 0;
 return Math.max(0,Math.min(1,(paper-mean)/paper*1.08));
}

function darkCentroid(image:ImageDataLike,cx:number,cy:number,radius:number){let sx=0,sy=0,w=0,n=0;const x0=Math.max(0,Math.floor(cx-radius)),x1=Math.min(image.width-1,Math.ceil(cx+radius)),y0=Math.max(0,Math.floor(cy-radius)),y1=Math.min(image.height-1,Math.ceil(cy+radius));
 for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){const lum=luminance(image,x,y);if(lum<95){const weight=(95-lum)/95;sx+=x*weight;sy+=y*weight;w+=weight;n++}}
 if(n<12||w<=0)return null;const area=Math.max(1,((x1-x0)/2)*((y1-y0)/2));return{x:sx/w,y:sy/w,quality:Math.min(1,n/(area*.025))};
}

function luminance(image:ImageDataLike,x:number,y:number){const i=(Math.round(y)*image.width+Math.round(x))*4;const d=image.data as any;return .2126*Number(d[i]??255)+.7152*Number(d[i+1]??255)+.0722*Number(d[i+2]??255)}

function affineLeastSquares(points:Array<{xMm:number;yMm:number;px:number;py:number}>):Transform|null{
 const a=points.map(p=>[p.xMm,p.yMm,1]);const ata=[[0,0,0],[0,0,0],[0,0,0]];for(const r of a)for(let i=0;i<3;i++)for(let j=0;j<3;j++)ata[i][j]+=r[i]*r[j];
 const bx=[0,0,0],by=[0,0,0];for(let k=0;k<points.length;k++)for(let i=0;i<3;i++){bx[i]+=a[k][i]*points[k].px;by[i]+=a[k][i]*points[k].py}const x=solve3(ata,bx),y=solve3(ata,by);if(!x||!y)return null;return(xMm,yMm)=>({x:x[0]*xMm+x[1]*yMm+x[2],y:y[0]*xMm+y[1]*yMm+y[2]});
}
function solve3(m:number[][],b:number[]){const a=m.map((r,i)=>[...r,b[i]]);for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;if(Math.abs(a[p][c])<1e-9)return null;[a[c],a[p]]=[a[p],a[c]];const d=a[c][c];for(let j=c;j<4;j++)a[c][j]/=d;for(let r=0;r<3;r++){if(r===c)continue;const f=a[r][c];for(let j=c;j<4;j++)a[r][j]-=f*a[c][j]}}return[a[0][3],a[1][3],a[2][3]]}
function round(v:number,d:number){const p=10**d;return Math.round(v*p)/p}
