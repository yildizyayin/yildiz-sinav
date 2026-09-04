import { useId, useRef, type CSSProperties, type PointerEvent } from 'react';
import { NIBIRU_BRAND,NIBIRU_STATE_COPY } from '../brand';
import './NibiruPlanetarySystem.css';

type NibiruState='idle'|'listening'|'thinking'|'speaking';

export function NibiruPlanetarySystem({size=520,state='idle',compact=false}:{size?:number;state?:NibiruState;compact?:boolean}){
 const shell=useRef<HTMLDivElement>(null);
 const id=useId().replace(/:/g,'');
 const move=(event:PointerEvent<HTMLDivElement>)=>{
  const box=event.currentTarget.getBoundingClientRect();
  const x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5;
  shell.current?.style.setProperty('--nx',String(x));
  shell.current?.style.setProperty('--ny',String(y));
 };
 const reset=()=>{shell.current?.style.setProperty('--nx','0');shell.current?.style.setProperty('--ny','0')};
 return <div ref={shell} className={'nibiru-living-star '+(compact?'is-compact ':'')+'is-'+state} style={{'--nibiru-size':size+'px'} as CSSProperties} onPointerMove={move} onPointerLeave={reset} aria-label={`${NIBIRU_BRAND.name} — ${NIBIRU_BRAND.ariaTagline}`}>
  <div className="nibiru-space" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
  <div className="nibiru-corona" aria-hidden="true"><b/><b/><b/></div>
  <div className="nibiru-star-shell">
   <svg className="nibiru-star-art" viewBox="0 0 500 500" role="img" aria-label={`${NIBIRU_BRAND.name} yaşayan ışık formu`}>
    <defs>
     <radialGradient id={'body'+id} cx="36%" cy="30%" r="72%">
      <stop offset="0" stopColor="#ffffff"/><stop offset=".12" stopColor="#b9e6ff"/><stop offset=".34" stopColor="#6f7cff"/><stop offset=".61" stopColor="#3833a9"/><stop offset=".84" stopColor="#121643"/><stop offset="1" stopColor="#050817"/>
     </radialGradient>
     <radialGradient id={'core'+id}><stop stopColor="#fff"/><stop offset=".22" stopColor="#bdf8ff"/><stop offset=".55" stopColor="#8f80ff" stopOpacity=".9"/><stop offset="1" stopColor="#6845ed" stopOpacity="0"/></radialGradient>
     <linearGradient id={'aurora'+id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#62e7ff"/><stop offset=".46" stopColor="#8f6fff"/><stop offset="1" stopColor="#ff62cf"/></linearGradient>
     <filter id={'surface'+id} x="-40%" y="-40%" width="180%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency=".008 .021" numOctaves="3" seed="17" result="noise"><animate attributeName="baseFrequency" dur="16s" values=".008 .021;.014 .012;.008 .021" repeatCount="indefinite"/></feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="23" xChannelSelector="R" yChannelSelector="B"/>
      <feGaussianBlur stdDeviation=".7"/>
     </filter>
     <filter id={'glow'+id} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="15" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
     <clipPath id={'clip'+id}><circle cx="250" cy="250" r="164"/></clipPath>
    </defs>
    <circle className="star-halo halo-a" cx="250" cy="250" r="205"/>
    <circle className="star-halo halo-b" cx="250" cy="250" r="187"/>
    <circle cx="250" cy="250" r="166" fill={'url(#body'+id+')'} stroke="rgba(193,226,255,.72)" strokeWidth="2"/>
    <g clipPath={'url(#clip'+id+')'} filter={'url(#surface'+id+')'}>
     <path className="star-aurora aurora-one" d="M35 234 C122 151 181 193 250 139 C318 86 394 121 475 50 L490 196 C381 238 335 206 257 265 C180 324 113 279 14 346Z" fill={'url(#aurora'+id+')'} opacity=".42"/>
     <path className="star-aurora aurora-two" d="M-5 337 C94 287 159 348 239 299 C324 247 383 281 503 209 L517 340 C412 396 338 351 260 405 C173 464 96 405 -14 451Z" fill="#62dcff" opacity=".2"/>
     <ellipse className="star-storm" cx="312" cy="285" rx="78" ry="23" fill="none" stroke="#efc4ff" strokeWidth="7" opacity=".34"/>
     <ellipse className="star-storm storm-two" cx="188" cy="191" rx="55" ry="15" fill="none" stroke="#78ecff" strokeWidth="5" opacity=".28"/>
    </g>
    <circle className="star-core-light" cx="212" cy="202" r="114" fill={'url(#core'+id+')'} filter={'url(#glow'+id+')'} opacity=".76"/>
    <ellipse className="star-specular" cx="190" cy="157" rx="58" ry="34" fill="#fff" opacity=".18" transform="rotate(-28 190 157)"/>
    <circle className="star-edge" cx="250" cy="250" r="166" fill="none" stroke="#8eeaff" strokeWidth="3" opacity=".38"/>
   </svg>
   <span className="nibiru-sense sense-a"/><span className="nibiru-sense sense-b"/><span className="nibiru-sense sense-c"/>
   <div className="nibiru-voice-wave" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div>
  </div>
  <div className="nibiru-signature"><strong>{NIBIRU_BRAND.name}</strong><span>{NIBIRU_BRAND.tagline}</span><small><i/> {NIBIRU_STATE_COPY[state]}</small></div>
 </div>;
}
