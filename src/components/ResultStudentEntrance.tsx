import {useEffect,useRef,useState} from 'react';
import {AnunexBrand} from './AnunexBrand';
import {NibiruMark} from './NibiruMark';
import './result-student-entrance.css';

type EntranceTone='young'|'senior'|'neutral';
const DURATION=1600;

/** Decorative, local-only particle field. No images, requests or student information. */
function ParticleOrbit({tone}:{tone:EntranceTone}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const node=canvas.current,ctx=node?.getContext('2d');
  if(!node||!ctx)return;
  let frame=0,width=0,height=0,started=0,lastFrame=0;
  const mobile=window.innerWidth<600,count=mobile?1000:1800;
  const points=Array.from({length:count},(_,i)=>{
   const y=1-2*(i+.5)/count,angle=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);
   return {x:Math.cos(angle)*r,y,z:Math.sin(angle)*r,angle,seed:i};
  });
  const resize=()=>{
   const box=node.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,mobile?1.5:2);
   width=box.width;height=box.height;node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  const observer=new ResizeObserver(resize);observer.observe(node);resize();
  const draw=(now:number)=>{
   if(!started)started=now;
   frame=requestAnimationFrame(draw);
   // Cap the decorative work at 30fps on phones; the CSS identity reveal stays smooth.
   if(mobile&&now-lastFrame<32)return;
   lastFrame=now;
   const t=(now-started)/1000,reveal=Math.min(1,t/.55),ease=1-Math.pow(1-reveal,3);
   const radius=Math.min(width*.245,height*.34)*(0.8+ease*.2),cx=width/2,cy=height*.48;
   const rotation=t*(tone==='young'?.24:.17),cos=Math.cos(rotation),sin=Math.sin(rotation);
   ctx.clearRect(0,0,width,height);
   const glow=ctx.createRadialGradient(cx-radius*.3,cy-radius*.3,0,cx,cy,radius*2.05);
   glow.addColorStop(0,'rgba(26,118,199,.12)');glow.addColorStop(.55,'rgba(16,95,175,.06)');glow.addColorStop(1,'rgba(4,13,24,0)');
   ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
   // Quiet distant stars, fixed positions and smooth luminance (no flashing).
   for(let i=0;i<54;i++){
    const x=((i*173.31)%997)/997*width,y=((i*271.79)%991)/991*height;
    const alpha=(.11+.09*Math.sin(i+t*.5))*ease;
    ctx.fillStyle=`rgba(143,196,226,${alpha})`;ctx.fillRect(x,y,i%7===0?1.4:.8,i%7===0?1.4:.8);
   }
   // Two elliptical orbit trails pass behind the illuminated particle shell.
   for(let ring=0;ring<2;ring++){
    ctx.save();ctx.translate(cx,cy);ctx.rotate((ring?-.52:.32)+t*.025);
    ctx.beginPath();ctx.ellipse(0,0,radius*(ring?1.64:1.87),radius*(ring?.45:.39),0,0,Math.PI*2);
    ctx.strokeStyle=`rgba(76,155,218,${ease*(ring?.12:.2)})`;ctx.lineWidth=.7;ctx.stroke();ctx.restore();
   }
   const cloud=points.map(p=>{
    const ripple=1+.075*Math.sin(p.y*11+p.angle*.3+t*1.3)+.035*Math.cos(p.angle*5-t*.7);
    const gather=1+(1-ease)*(.45+(p.seed%17)/18);
    const x=(p.x*cos-p.z*sin)*ripple,y=(p.y*.97+.045*Math.sin(p.angle*3+t))*ripple,z=(p.x*sin+p.z*cos)*ripple;
    const perspective=3.8/(3.8-z);
    return {x:cx+x*radius*perspective*gather,y:cy+y*radius*perspective*gather,z,seed:p.seed,light:Math.max(0,-x*.45-y*.45+z*.5)};
   }).sort((a,b)=>a.z-b.z);
   for(const p of cloud){
    const depth=(p.z+1.15)/2.3,alpha=(.1+depth*.48+p.light*.22)*ease;
    const dot=(.45+depth*.75)*(mobile?.9:1),bright=p.seed%19===0;
    ctx.fillStyle=`rgba(${bright?197:70+Math.round(p.light*55)},${bright?238:151+Math.round(p.light*58)},255,${alpha})`;
    ctx.beginPath();ctx.arc(p.x,p.y,bright?dot*1.45:dot,0,Math.PI*2);ctx.fill();
    if(bright&&p.z>.2){ctx.fillStyle=`rgba(85,181,255,${alpha*.11})`;ctx.beginPath();ctx.arc(p.x,p.y,dot*4.6,0,Math.PI*2);ctx.fill();}
   }
   // Foreground orbit particles establish depth without a large decorative illustration.
   for(let i=0;i<120;i++){
    const angle=i/120*Math.PI*2+t*.25,x=Math.cos(angle)*radius*1.87,y=Math.sin(angle)*radius*.39;
    const rotatedX=x*Math.cos(.32)-y*Math.sin(.32),rotatedY=x*Math.sin(.32)+y*Math.cos(.32);
    if(Math.sin(angle)<0)continue;
    ctx.fillStyle=`rgba(130,210,255,${ease*(.2+.5*Math.pow((Math.cos(angle-t)+1)/2,5))})`;
    ctx.beginPath();ctx.arc(cx+rotatedX,cy+rotatedY,i%11===0?1.55:.65,0,Math.PI*2);ctx.fill();
   }
  };
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();ctx.clearRect(0,0,width,height);};
 },[tone]);
 return <canvas ref={canvas} className="rsp-cinema-particles" aria-hidden="true"/>;
}

/** Mounted only after a fresh authenticated login. Does not delay or change authorization. */
export function ResultStudentEntrance({grade}:{grade:unknown}){
 const [visible,setVisible]=useState(()=>typeof matchMedia!=='undefined'&&!matchMedia('(prefers-reduced-motion: reduce)').matches);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(!visible)return;
  const element=dialog.current,previous=document.activeElement;
  element?.showModal();
  const media=matchMedia('(prefers-reduced-motion: reduce)'),close=()=>setVisible(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  const timer=window.setTimeout(close,DURATION);
  window.addEventListener('keydown',key);media.addEventListener('change',close);
  return()=>{clearTimeout(timer);window.removeEventListener('keydown',key);media.removeEventListener('change',close);element?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[visible]);
 if(!visible)return null;
 const n=Number(grade),tone:EntranceTone=[5,6,7].includes(n)?'young':([8,9,10,11,12].includes(n)||String(grade).toLocaleLowerCase('tr-TR')==='mezun')?'senior':'neutral';
 return <dialog ref={dialog} className={`rsp-entrance rsp-cinematic rsp-entrance-${tone}`} aria-label="ANUNEX karşılama" onCancel={()=>setVisible(false)}>
  <button type="button" className="rsp-skip" onClick={()=>setVisible(false)} autoFocus>Atla <span aria-hidden="true">↗</span></button>
  <div className="rsp-cinema-stage" aria-hidden="true">
   <ParticleOrbit tone={tone}/>
   <div className="rsp-cinema-nibiru"><NibiruMark size={116}/></div>
   <span className="rsp-cinema-horizon"/>
  </div>
  <div className="rsp-cinema-identity">
   <AnunexBrand inverse tagline/>
   <p>{tone==='young'?'Birlikte keşfedelim.':'Sonuçların, bir sonraki adımın.'}</p>
  </div>
  <div className="rsp-cinema-progress" aria-hidden="true"><span/></div>
 </dialog>;
}
