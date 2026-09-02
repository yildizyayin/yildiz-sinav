import { useId,useRef,type CSSProperties,type PointerEvent } from 'react';
import { NIBIRU_BRAND } from '../brand';
import './NibiruMark.css';
import './NibiruInteractive.css';

export type NibiruVisualState='idle'|'active'|'listening'|'thinking'|'speaking';

type MarkProps={
  size?:number;
  state?:NibiruVisualState;
  className?:string;
  title?:string;
  showWordmark?:boolean;
  interactive?:boolean;
};

type MarkStyle=CSSProperties&{'--nibiru-size'?:string;'--nibiru-gaze-x'?:string;'--nibiru-gaze-y'?:string};

export function NibiruMark({size=34,state='idle',className='',title=`${NIBIRU_BRAND.name} — ${NIBIRU_BRAND.ariaTagline}`,showWordmark=false,interactive=false}:MarkProps){
 const markRef=useRef<HTMLSpanElement>(null);
 const id=useId().replace(/:/g,'');
 const style:MarkStyle={'--nibiru-size':`${size}px`};
 const move=(event:PointerEvent<HTMLSpanElement>)=>{
  if(!interactive)return;
  const box=event.currentTarget.getBoundingClientRect();
  const x=((event.clientX-box.left)/Math.max(box.width,1)-.5)*2;
  const y=((event.clientY-box.top)/Math.max(box.height,1)-.5)*2;
  markRef.current?.style.setProperty('--nibiru-gaze-x',String(Math.max(-1,Math.min(1,x))));
  markRef.current?.style.setProperty('--nibiru-gaze-y',String(Math.max(-1,Math.min(1,y))));
 };
 const reset=()=>{markRef.current?.style.setProperty('--nibiru-gaze-x','0');markRef.current?.style.setProperty('--nibiru-gaze-y','0')};
 return <span className={`nibiru-brand-lockup ${className}`.trim()} title={title} aria-label={title}>
  <span ref={markRef} className={`nibiru-mark nibiru-${state} ${interactive?'nibiru-interactive':''}`} style={style} onPointerMove={move} onPointerLeave={reset} aria-hidden="true">
   <svg className="nibiru-mark-art" viewBox="0 0 100 100">
    <defs>
     <radialGradient id={`nmb${id}`} cx="34%" cy="27%" r="76%"><stop offset="0" stopColor="#fff"/><stop offset=".13" stopColor="#c8f3ff"/><stop offset=".34" stopColor="#7587ff"/><stop offset=".61" stopColor="#4b38bd"/><stop offset=".84" stopColor="#17194d"/><stop offset="1" stopColor="#070916"/></radialGradient>
     <radialGradient id={`nmc${id}`} cx="42%" cy="38%" r="58%"><stop stopColor="#fff" stopOpacity=".92"/><stop offset=".28" stopColor="#baf7ff" stopOpacity=".72"/><stop offset=".66" stopColor="#9e7dff" stopOpacity=".28"/><stop offset="1" stopColor="#6f4fff" stopOpacity="0"/></radialGradient>
     <linearGradient id={`nma${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#67e9ff"/><stop offset=".48" stopColor="#9572ff"/><stop offset="1" stopColor="#f46bd3"/></linearGradient>
     <clipPath id={`nmclip${id}`}><circle cx="50" cy="50" r="37"/></clipPath>
    </defs>
    <circle className="nibiru-mark-haze" cx="50" cy="50" r="45"/>
    <circle className="nibiru-mark-body" cx="50" cy="50" r="37" fill={`url(#nmb${id})`}/>
    <g clipPath={`url(#nmclip${id})`}>
     <path className="nibiru-mark-aurora aurora-a" d="M-5 46 C17 25 34 40 49 26 C66 11 83 25 108 7 L110 39 C85 49 71 43 52 57 C34 70 17 60 -8 77Z" fill={`url(#nma${id})`} opacity=".5"/>
     <path className="nibiru-mark-aurora aurora-b" d="M-8 70 C17 57 32 75 51 62 C70 50 83 61 110 43 L112 72 C87 86 69 75 53 87 C31 101 14 87 -10 98Z" fill="#67e5ff" opacity=".22"/>
    </g>
    <circle className="nibiru-mark-corelight" cx="42" cy="39" r="27" fill={`url(#nmc${id})`}/>
    <ellipse className="nibiru-mark-specular" cx="38" cy="31" rx="13" ry="8" transform="rotate(-28 38 31)"/>
    <circle className="nibiru-mark-edge" cx="50" cy="50" r="37"/>
   </svg>
   <span className="nibiru-signal"/>
   <span className="nibiru-voice-pulse"><i/><i/><i/></span>
  </span>
  {showWordmark&&<span className="nibiru-wordmark"><strong>{NIBIRU_BRAND.name}</strong><small>{NIBIRU_BRAND.tagline}</small></span>}
 </span>;
}

export function NibiruNavIcon({size=19}:{size?:number}){
 return <NibiruMark size={size} title={NIBIRU_BRAND.name}/>;
}
