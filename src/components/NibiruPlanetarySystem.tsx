import { useEffect,useRef,type CSSProperties } from 'react';
import './NibiruPlanetarySystem.css';

export type NibiruSystemState='idle'|'listening'|'thinking'|'speaking';
type Props={size?:number;state?:NibiruSystemState;compact?:boolean;className?:string};
type SystemStyle=CSSProperties&{'--system-size'?:string;'--tilt-x'?:string;'--tilt-y'?:string};

const intelligences=[
 {name:'Ölçme',color:'#71dcff',orbit:'one'},
 {name:'Rehberlik',color:'#ad8cff',orbit:'one'},
 {name:'Branş',color:'#58dfb0',orbit:'two'},
 {name:'Veli',color:'#ffb565',orbit:'two'},
 {name:'Kurum',color:'#6f91ff',orbit:'three'},
 {name:'İçerik',color:'#ff789f',orbit:'three'},
 {name:'Video',color:'#f6d365',orbit:'three'},
];

export function NibiruPlanetarySystem({size=520,state='idle',compact=false,className=''}:Props){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;const move=(event:PointerEvent)=>{const box=node.getBoundingClientRect(),x=(event.clientX-box.left)/Math.max(1,box.width)-.5,y=(event.clientY-box.top)/Math.max(1,box.height)-.5;node.style.setProperty('--tilt-x',`${Math.max(-1,Math.min(1,y))*-8}deg`);node.style.setProperty('--tilt-y',`${Math.max(-1,Math.min(1,x))*10}deg`);node.style.setProperty('--light-x',`${50+x*22}%`);node.style.setProperty('--light-y',`${42+y*18}%`)};node.addEventListener('pointermove',move,{passive:true});node.addEventListener('pointerleave',()=>{node.style.setProperty('--tilt-x','0deg');node.style.setProperty('--tilt-y','0deg')});return()=>node.removeEventListener('pointermove',move)},[]);
 const style:SystemStyle={'--system-size':`${size}px`};
 return <div ref={ref} className={`nibiru-planet-system is-${state} ${compact?'is-compact':''} ${className}`.trim()} style={style} role="img" aria-label="Nibiru merkezî akademik zekâ ve yörüngesindeki uzman yapay zekâlar">
  <div className="nibiru-space-field"/>
  <div className="nibiru-system-plane">
   <span className="nibiru-system-orbit orbit-one"/><span className="nibiru-system-orbit orbit-two"/><span className="nibiru-system-orbit orbit-three"/>
   <div className="nibiru-main-planet"><span className="nibiru-atmosphere"/><span className="nibiru-surface"/><span className="nibiru-aurora"/><span className="nibiru-conscious-core"/><strong>NIBIRU</strong><small>MERKEZÎ AKADEMİK ZEKÂ</small></div>
   {intelligences.map((item,index)=><span className={`nibiru-ai-planet orbiting-${item.orbit} p-${index+1}`} style={{'--planet-color':item.color} as CSSProperties} key={item.name}><i/><b>{item.name}</b></span>)}
   <span className="nibiru-data-ray ray-one"/><span className="nibiru-data-ray ray-two"/><span className="nibiru-data-ray ray-three"/>
  </div>
  <div className="nibiru-system-legend"><i/><span>{state==='listening'?'Dinliyor':state==='thinking'?'Uzman zekâlar birlikte düşünüyor':state==='speaking'?'Yanıtlıyor':'Akademik sistem çevrimiçi'}</span></div>
 </div>;
}
