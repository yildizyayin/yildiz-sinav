export interface CalibrationAnalysis {
  offset_x_mm: number;
  offset_y_mm: number;
  scale_x: number;
  scale_y: number;
  rotation_deg: number;
  confidence: number;
  targetsFound: number;
  note: string;
}

const PAGE_W = 210;
const PAGE_H = 297;
const EXPECTED = [
  { x: 15, y: 15 },
  { x: PAGE_W - 15, y: 15 },
  { x: 15, y: PAGE_H - 15 },
  { x: PAGE_W - 15, y: PAGE_H - 15 },
];

export async function analyzeCalibrationImage(file: File): Promise<CalibrationAnalysis> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Görsel analiz edilemiyor.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const regions = [
    [0,0,0.28,0.28], [0.72,0,1,0.28], [0,0.72,0.28,1], [0.72,0.72,1,1]
  ] as const;
  const points = regions.map(r=>darkCentroid(img,width,height,r)).filter(Boolean) as Array<{x:number;y:number;confidence:number}>;
  if (points.length < 4) return { offset_x_mm:0,offset_y_mm:0,scale_x:1,scale_y:1,rotation_deg:0,confidence:0.25,targetsFound:points.length,note:'Dört köşe referans işaretinin tamamı bulunamadı. Sayfanın tamamının göründüğü düz bir tarama/fotoğraf yükleyin.' };
  const [tl,tr,bl,br]=points;
  const mmx=(p:{x:number})=>p.x/width*PAGE_W;
  const mmy=(p:{y:number})=>p.y/height*PAGE_H;
  const expectedDX=EXPECTED[1].x-EXPECTED[0].x;
  const expectedDY=EXPECTED[2].y-EXPECTED[0].y;
  const actualDX=((tr.x-tl.x)+(br.x-bl.x))/2/width*PAGE_W;
  const actualDY=((bl.y-tl.y)+(br.y-tr.y))/2/height*PAGE_H;
  const scaleX=actualDX/expectedDX;
  const scaleY=actualDY/expectedDY;
  const avgX=((mmx(tl)-EXPECTED[0].x)+(mmx(tr)-EXPECTED[1].x)+(mmx(bl)-EXPECTED[2].x)+(mmx(br)-EXPECTED[3].x))/4;
  const avgY=((mmy(tl)-EXPECTED[0].y)+(mmy(tr)-EXPECTED[1].y)+(mmy(bl)-EXPECTED[2].y)+(mmy(br)-EXPECTED[3].y))/4;
  const rotation=Math.atan2(tr.y-tl.y,tr.x-tl.x)*180/Math.PI;
  const conf=Math.max(0.35,Math.min(0.98,points.reduce((s,p)=>s+p.confidence,0)/4));
  return { offset_x_mm:round(avgX,3),offset_y_mm:round(avgY,3),scale_x:round(scaleX,5),scale_y:round(scaleY,5),rotation_deg:round(rotation,3),confidence:round(conf,3),targetsFound:4,note:'Analiz, tam sayfa tarama veya mümkün olduğunca dik çekilmiş fotoğraflarda en güvenilir sonucu verir.' };
}

function darkCentroid(img:ImageData,w:number,h:number,r:readonly[number,number,number,number]){
  const [rx0,ry0,rx1,ry1]=r; const x0=Math.floor(rx0*w),y0=Math.floor(ry0*h),x1=Math.floor(rx1*w),y1=Math.floor(ry1*h);
  let sx=0,sy=0,n=0;
  for(let y=y0;y<y1;y+=2){for(let x=x0;x<x1;x+=2){const i=(y*w+x)*4;const lum=0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2];if(lum<55){sx+=x;sy+=y;n++;}}}
  const regionSamples=Math.max(1,((x1-x0)/2)*((y1-y0)/2));
  if(n<Math.max(16,regionSamples*0.0008)) return null;
  return {x:sx/n,y:sy/n,confidence:Math.min(1,n/(regionSamples*0.015))};
}
function round(v:number,d:number){const p=10**d;return Math.round(v*p)/p}
