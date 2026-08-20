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

function estimateAlignment(image:ImageDataLike,template:OmrTemplateRuntime):{transform:Transform|null;confidence:number;found:number;issues:string[]}{
 const targets=Array.isArray(template.fiducials?.targets)?template.fiducials.targets:[];
 const expected=targets.map((t:any)=>({xMm:Number(Array.isArray(t)?t[0]:t.xMm??t.x),yMm:Number(Array.isArray(t)?t[1]:t.yMm??t.y)})).filter((p:any)=>Number.isFinite(p.xMm)&&Number.isFinite(p.yMm));
 if(expected.length<3)return {transform:null,confidence:0,found:0,issues:['Şablonda en az 3 kamera referans noktası bulunmalıdır.']};
 const found:{xMm:number;yMm:number;px:number;py:number;quality:number}[]=[];
 for(const p of expected){
   const ex=p.xMm/template.pageWidthMm*image.width,ey=p.yMm/template.pageHeightMm*image.height;
   const radius=Math.max(18,Math.min(image.width,image.height)*Number(template.fiducials?.searchRadiusRatio||0.07));
   const hit=darkCentroid(image,ex,ey,radius);
   if(hit)found.push({...p,px:hit.x,py:hit.y,quality:hit.quality});
 }
 if(found.length<3)return {transform:null,confidence:found.length/expected.length*.45,found:found.length,issues:[`${expected.length} referansın yalnız ${found.length} tanesi bulundu.`]};
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

function readAnswerRegion(image:ImageDataLike,transform:Transform,template:OmrTemplateRuntime,region:any){
 const options=(Array.isArray(region.options)&&region.options.length?region.options:['A','B','C','D','E']).map((x:any)=>String(x).toUpperCase());
 const cells=buildAnswerCells(region,options);
 const questionCount=Number(region.questionCount||Math.max(0,...cells.map(c=>c.questionNo||0)));
 const groups=new Map<number,Bubble[]>();for(const c of cells){if(!c.questionNo)continue;if(!groups.has(c.questionNo))groups.set(c.questionNo,[]);groups.get(c.questionNo)!.push(c)}
 let sequence='';const issues:string[]=[];const qs:number[]=[];
 for(let q=1;q<=questionCount;q++){
   const bubbles=groups.get(q)||[];const scored=bubbles.map(b=>({b,score:bubbleDarkness(image,transform,b)})).sort((a,b)=>b.score-a.score);const top=scored[0],second=scored[1];
   const threshold=Number(region.markThreshold??.50);const delta=Number(region.doubleMarkDelta??.07);
   if(!top||top.score<threshold){sequence+='_';qs.push(top?.score||0);continue}
   if(second&&second.score>=threshold&&top.score-second.score<delta){sequence+='_';issues.push(`${q}. soruda çift/kararsız işaret.`);qs.push(Math.max(0,top.score-second.score));continue}
   sequence+=top.b.value;qs.push(Math.min(1,top.score-(second?.score||0)+.45));
 }
 const confidence=qs.length?qs.reduce((a,b)=>a+b,0)/qs.length:.2;return {sequence,confidence:round(confidence,3),issues};
}

function readIdentityGrid(image:ImageDataLike,transform:Transform,template:OmrTemplateRuntime,region:any,valueField:'digit'|'value'){
 const cells=buildIdentityCells(region,valueField);const positions=Math.max(0,...cells.map(c=>c.position||0));let value='';const issues:string[]=[];const conf:number[]=[];
 for(let p=1;p<=positions;p++){
   const scored=cells.filter(c=>c.position===p).map(b=>({b,score:bubbleDarkness(image,transform,b)})).sort((a,b)=>b.score-a.score);const top=scored[0],second=scored[1];const threshold=Number(region.markThreshold??.50);const delta=Number(region.doubleMarkDelta??.07);
   if(!top||top.score<threshold){value+='_';issues.push(`${p}. hane boş.`);conf.push(0);continue}
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

function bubbleDarkness(image:ImageDataLike,transform:Transform,b:Bubble){
 const c=transform(b.xMm,b.yMm),rx=transform(b.xMm+b.radiusMm,b.yMm),ry=transform(b.xMm,b.yMm+b.radiusMm);const radius=Math.max(2,Math.min(Math.hypot(rx.x-c.x,rx.y-c.y),Math.hypot(ry.x-c.x,ry.y-c.y)));let dark=0,total=0;
 const minX=Math.max(0,Math.floor(c.x-radius)),maxX=Math.min(image.width-1,Math.ceil(c.x+radius)),minY=Math.max(0,Math.floor(c.y-radius)),maxY=Math.min(image.height-1,Math.ceil(c.y+radius));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const dx=x-c.x,dy=y-c.y;if(dx*dx+dy*dy>radius*radius)continue;const lum=luminance(image,x,y);dark+=(255-lum)/255;total++}return total?dark/total:0;
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
