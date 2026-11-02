import {useEffect,useRef,useState} from 'react';
import {AnunexBrand} from './AnunexBrand';
import {NibiruMark} from './NibiruMark';

/** Mounted only inside the already authenticated result workspace. Never delays or changes authorization. */
export function ResultStudentEntrance({grade}:{grade:unknown}){
 const [visible,setVisible]=useState(()=>typeof matchMedia!=='undefined'&&!matchMedia('(prefers-reduced-motion: reduce)').matches);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(!visible)return;
  const element=dialog.current,previous=document.activeElement;
  element?.showModal();
  const media=matchMedia('(prefers-reduced-motion: reduce)'),close=()=>setVisible(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  const timer=window.setTimeout(close,1300);
  window.addEventListener('keydown',key);media.addEventListener('change',close);
  return()=>{clearTimeout(timer);window.removeEventListener('keydown',key);media.removeEventListener('change',close);element?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[visible]);
 if(!visible)return null;
 const n=Number(grade),tone=[5,6,7].includes(n)?'young':([8,9,10,11,12].includes(n)||String(grade).toLocaleLowerCase('tr-TR')==='mezun')?'senior':'neutral';
 return <dialog ref={dialog} className={`rsp-entrance rsp-entrance-${tone}`} aria-label="ANUNEX karşılama" onCancel={()=>setVisible(false)}>
  <button type="button" className="rsp-skip" onClick={()=>setVisible(false)}>Atla</button>
  <div className="rsp-orbit" aria-hidden="true"><NibiruMark size={104}/></div>
  <AnunexBrand inverse={tone==='senior'} tagline/>
  <p>{tone==='young'?'Birlikte keşfedelim.':'Sonuçların, bir sonraki adımın.'}</p>
 </dialog>;
}
