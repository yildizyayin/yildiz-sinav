import { useRef, type CSSProperties, type PointerEvent } from 'react';
import './NibiruPlanetarySystem.css';

type NibiruState='idle'|'listening'|'thinking'|'speaking';

export function NibiruPlanetarySystem({size=520,state='idle',compact=false}:{size?:number;state?:NibiruState;compact?:boolean}){
 const shell=useRef<HTMLDivElement>(null);
 const move=(event:PointerEvent<HTMLDivElement>)=>{
  const box=event.currentTarget.getBoundingClientRect();
  const x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5;
  shell.current?.style.setProperty('--nx',String(x));
  shell.current?.style.setProperty('--ny',String(y));
 };
 const reset=()=>{shell.current?.style.setProperty('--nx','0');shell.current?.style.setProperty('--ny','0')};
 return <div ref={shell} className={'nibiru-living-star '+(compact?'is-compact ':'')+'is-'+state} style={{'--nibiru-size':size+'px'} as CSSProperties} onPointerMove={move} onPointerLeave={reset} aria-label="Nibiru — Öğrenmenin yaşayan zekâsı">
  <div className="nibiru-aura-large" aria-hidden="true"/>
  <div className="nibiru-liquid-sphere" aria-hidden="true">
   <i className="liquid-flow flow-a"/><i className="liquid-flow flow-b"/><i className="liquid-flow flow-c"/><i className="liquid-glint"/>
  </div>
  <div className="nibiru-signal-layer" aria-hidden="true"/>
  <div className="nibiru-voice-wave-large" aria-hidden="true"><i/><i/><i/><i/><i/></div>
  <div className="nibiru-signature"><strong>NIBIRU</strong><span>Öğrenmenin yaşayan zekâsı</span><small><i/> {state==='speaking'?'Sizinle konuşuyor':state==='listening'?'Sizi dinliyor':state==='thinking'?'Düşünüyor':'Sizinle birlikte öğreniyor'}</small></div>
 </div>;
}
