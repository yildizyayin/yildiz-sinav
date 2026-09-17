import { useEffect,useRef,type CSSProperties } from 'react';
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

type MarkStyle=CSSProperties&{'--nibiru-size'?:string};

export function NibiruMark({size=34,state='idle',className='',title='Nibiru Akademik Zekâ',showWordmark=false,interactive=false}:MarkProps){
 const markRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!interactive)return;const move=(event:PointerEvent)=>{const node=markRef.current;if(!node)return;const box=node.getBoundingClientRect(),dx=(event.clientX-(box.left+box.width/2))/Math.max(box.width,1),dy=(event.clientY-(box.top+box.height/2))/Math.max(box.height,1);node.style.setProperty('--nibiru-gaze-x',`${Math.max(-1,Math.min(1,dx))*18}%`);node.style.setProperty('--nibiru-gaze-y',`${Math.max(-1,Math.min(1,dy))*18}%`)};window.addEventListener('pointermove',move,{passive:true});return()=>window.removeEventListener('pointermove',move)},[interactive]);
 const style:MarkStyle={'--nibiru-size':`${size}px`};
 return <span className={`nibiru-brand-lockup ${className}`.trim()} title={title} aria-label={title}>
  <span ref={markRef} className={`nibiru-mark nibiru-${state} ${interactive?'nibiru-interactive':''}`} style={style} aria-hidden="true">
   <span className="nibiru-aura"/>
   <span className="nibiru-sphere">
    <i className="nibiru-flow nibiru-flow-a"/>
    <i className="nibiru-flow nibiru-flow-b"/>
    <i className="nibiru-flow nibiru-flow-c"/>
    <i className="nibiru-glint"/>
   </span>
   <span className="nibiru-signal"/>
   <span className="nibiru-voice-wave"><i/><i/><i/><i/><i/></span>
  </span>
  {showWordmark&&<span className="nibiru-wordmark"><strong>NIBIRU AI</strong><small>ÖĞRENMENİN YAŞAYAN ZEKÂSI</small></span>}
 </span>;
}

export function NibiruNavIcon({size=19}:{size?:number}){
 return <NibiruMark size={size} title="Nibiru"/>;
}
