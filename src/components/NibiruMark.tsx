import type { CSSProperties } from 'react';

export type NibiruVisualState='idle'|'active'|'listening'|'thinking'|'speaking';

type MarkProps={
  size?:number;
  state?:NibiruVisualState;
  className?:string;
  title?:string;
  showWordmark?:boolean;
};

type MarkStyle=CSSProperties&{'--nibiru-size'?:string};

export function NibiruMark({size=34,state='idle',className='',title='Nibiru Akademik Zekâ',showWordmark=false}:MarkProps){
 const style:MarkStyle={'--nibiru-size':`${size}px`};
 return <span className={`nibiru-brand-lockup ${className}`.trim()} title={title} aria-label={title}>
  <span className={`nibiru-mark nibiru-${state}`} style={style} aria-hidden="true">
   <span className="nibiru-eclipse"/>
   <span className="nibiru-core"/>
   <span className="nibiru-orbit nibiru-orbit-a"><i/></span>
   <span className="nibiru-orbit nibiru-orbit-b"><i/></span>
   <span className="nibiru-signal"/>
  </span>
  {showWordmark&&<span className="nibiru-wordmark"><strong>NIBIRU</strong><small>AKADEMİK ZEKÂ</small></span>}
 </span>;
}

export function NibiruNavIcon({size=19}:{size?:number}){
 return <NibiruMark size={size} title="Nibiru"/>;
}
