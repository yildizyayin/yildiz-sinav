import { Printer, TriangleAlert } from 'lucide-react';

const answerSeq='ABCDEABCDE';
const options=['A','B','C','D','E'];
const digits=['0','1','2','3','4','5','6','7','8','9'];

export function CameraTestSheet(){
 return <>
  <div className="page-head no-print"><div><span className="eyebrow">Kamera OMR test aracı</span><h1>Sentetik Demo Optiği</h1><p>Bu form yalnız kamera motorunu güvenli şekilde test etmek içindir. Piyasadaki Optik129/840/3D formu değildir.</p></div><button className="primary" onClick={()=>window.print()}><Printer size={17}/> %100 Yazdır</button></div>
  <div className="alert info no-print"><TriangleAlert size={16}/> Önce demo verisini yükleyin. Form öğrenci no <strong>1001</strong>, kitapçık <strong>A</strong> ve 10'ar soruluk MAT/TUR/FEN cevap alanlarıyla demo sınavına göre hazırlanmıştır.</div>
  <div className="camera-test-sheet">
   <Fid x={15} y={15}/><Fid x={195} y={15}/><Fid x={15} y={282}/><Fid x={195} y={282}/>
   <div className="camera-sheet-title"><strong>SENTETİK KAMERA OMR TEST FORMU</strong><span>Yalnız geliştirme / test · Gerçek piyasa optiği değildir</span></div>
   <IdentityGrid x={20} y={40} w={40} h={55} value="1001"/>
   <Booklet x={75} y={40} w={20} h={15} value="A"/>
   <AnswerGrid x={20} y={105} w={50} h={100} subject="MAT" sequence={answerSeq}/>
   <AnswerGrid x={80} y={105} w={50} h={100} subject="TUR" sequence={answerSeq}/>
   <AnswerGrid x={140} y={105} w={50} h={100} subject="FEN" sequence={answerSeq}/>
   <div className="camera-sheet-note">Yazdırma: Actual Size / %100 · Fit to Page kapalı · A4</div>
  </div>
 </>;
}

function Fid({x,y}:{x:number;y:number}){return <div className="omr-fid" style={{left:`${x-3}mm`,top:`${y-3}mm`}}/>}
function Bubble({x,y,filled,label}:{x:number;y:number;filled:boolean;label?:string}){return <div className="omr-bubble-wrap" style={{left:`${x-2}mm`,top:`${y-2}mm`}}>{label&&<span>{label}</span>}<i className={filled?'filled':''}/></div>}

function IdentityGrid({x,y,w,h,value}:{x:number;y:number;w:number;h:number;value:string}){
 const cells=[] as React.ReactNode[];
 for(let p=0;p<value.length;p++)for(let d=0;d<digits.length;d++){const cx=x+(p+.5)*w/value.length,cy=y+(d+.5)*h/digits.length;cells.push(<Bubble key={`${p}-${d}`} x={cx} y={cy} filled={digits[d]===value[p]} label={p===0?digits[d]:undefined}/>)}
 return <><div className="omr-label" style={{left:`${x}mm`,top:`${y-7}mm`}}>ÖĞRENCİ NO: {value}</div>{cells}</>;
}
function Booklet({x,y,w,h,value}:{x:number;y:number;w:number;h:number;value:string}){return <><div className="omr-label" style={{left:`${x}mm`,top:`${y-7}mm`}}>KİTAPÇIK</div>{['A','B'].map((v,i)=><Bubble key={v} x={x+w/2} y={y+(i+.5)*h/2} filled={v===value} label={v}/>)}</>}
function AnswerGrid({x,y,w,h,subject,sequence}:{x:number;y:number;w:number;h:number;subject:string;sequence:string}){
 const cells=[] as React.ReactNode[];
 for(let q=0;q<sequence.length;q++)for(let o=0;o<options.length;o++){const cx=x+(o+.5)*w/options.length,cy=y+(q+.5)*h/sequence.length;cells.push(<Bubble key={`${q}-${o}`} x={cx} y={cy} filled={options[o]===sequence[q]} label={q===0?options[o]:undefined}/>)}
 return <><div className="omr-label" style={{left:`${x}mm`,top:`${y-7}mm`}}>{subject} · 10 SORU</div>{cells}{Array.from({length:10},(_,q)=><span key={q} className="omr-qno" style={{left:`${x-5}mm`,top:`${y+(q+.5)*h/10-1.8}mm`}}>{q+1}</span>)}</>;
}
