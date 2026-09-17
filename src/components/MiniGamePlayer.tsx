import { useMemo,useRef,useState } from 'react';
import { CheckCircle2,RotateCcw,Trophy,X } from 'lucide-react';
import { api } from '../api';

type Game={game_code:string;title:string;description?:string};
type Challenge={prompt:string;options:string[];answer:number};

const SETS:Record<string,Challenge[]>={
 MATH_SPEED:[
  {prompt:'18 + 27 kaçtır?',options:['35','45','55','65'],answer:1},
  {prompt:'72 ÷ 8 kaçtır?',options:['7','8','9','10'],answer:2},
  {prompt:'6 × 14 kaçtır?',options:['74','80','84','96'],answer:2},
  {prompt:'125 − 48 kaçtır?',options:['67','77','83','87'],answer:1},
  {prompt:'3/4 kesrinin ondalık gösterimi hangisidir?',options:['0,25','0,50','0,75','1,25'],answer:2},
 ],
 TURKISH_WORD_HUNT:[
  {prompt:'“Cesur” sözcüğünün yakın anlamlısı hangisidir?',options:['Korkak','Yürekli','Durgun','Uzak'],answer:1},
  {prompt:'“Kitapları masaya bıraktı.” cümlesinde çoğul isim hangisidir?',options:['Kitapları','Masaya','Bıraktı','Cümlede yok'],answer:0},
  {prompt:'Bir metnin okuyucuya vermek istediği temel iletiye ne denir?',options:['Başlık','Ana düşünce','Örnek','Benzetme'],answer:1},
  {prompt:'“Bugün hava çok güzel.” cümlesinde zamanı bildiren sözcük hangisidir?',options:['Hava','Çok','Güzel','Bugün'],answer:3},
  {prompt:'“Koşmak” sözcüğü hangi türdedir?',options:['Fiil','İsim','Sıfat','Zamir'],answer:0},
 ],
 SCIENCE_PLANET:[
  {prompt:'Hücrenin yönetim merkezi hangisidir?',options:['Çekirdek','Koful','Hücre zarı','Sitoplazma'],answer:0},
  {prompt:'Hareketten kaynaklanan enerji hangisidir?',options:['Potansiyel','Kinetik','Kimyasal','Isı'],answer:1},
  {prompt:'Büyüme ve onarımda görev alan bölünme hangisidir?',options:['Mayoz','Mitoz','Döllenme','Tomurcuklanma'],answer:1},
  {prompt:'Bir cismin hareketini değiştirebilen etkiye ne denir?',options:['Hacim','Kuvvet','Yoğunluk','Sıcaklık'],answer:1},
  {prompt:'Bitki hücresinde bulunup hayvan hücresinde bulunmayan yapı hangisidir?',options:['Çekirdek','Sitoplazma','Hücre duvarı','Hücre zarı'],answer:2},
 ],
 MEMORY_CARDS:[
  {prompt:'Kavramı eşleştir: “Kinetik”',options:['Konum enerjisi','Hareket enerjisi','Işık enerjisi','Ses enerjisi'],answer:1},
  {prompt:'Kavramı eşleştir: “Ana düşünce”',options:['Temel ileti','Yazar adı','Kelime sayısı','İlk cümle'],answer:0},
  {prompt:'Kavramı eşleştir: “Oran”',options:['İki çokluğun karşılaştırılması','Toplama işlemi','Bir açı türü','Zaman ölçüsü'],answer:0},
  {prompt:'Kavramı eşleştir: “Mitoz”',options:['Üreme hücresi oluşumu','Büyüme ve onarım','Solunum','Sindirim'],answer:1},
  {prompt:'Kavramı eşleştir: “Fiil”',options:['Varlık adı','Eylem bildiren sözcük','İsmin yerini tutan sözcük','Niteleme sözcüğü'],answer:1},
 ],
 SIXTY_SECONDS:[
  {prompt:'9 × 7 kaçtır?',options:['56','63','72','81'],answer:1},
  {prompt:'“Gelecek” zaman eki hangisidir?',options:['-dı','-yor','-acak','-r'],answer:2},
  {prompt:'Suyun donma noktası kaç °C’dir?',options:['0','10','50','100'],answer:0},
  {prompt:'2,5 + 1,5 kaçtır?',options:['3','3,5','4','4,5'],answer:2},
  {prompt:'Paragrafın ne anlattığını gösteren kavram hangisidir?',options:['Konu','Yazı tipi','Satır sayısı','Yazar yaşı'],answer:0},
 ],
};

function challenges(code:string){return SETS[code]||SETS.SIXTY_SECONDS}

export function MiniGamePlayer({game,onClose,onSaved}:{game:Game;onClose:()=>void;onSaved:()=>void}){
 const questions=useMemo(()=>challenges(game.game_code),[game.game_code]);const[index,setIndex]=useState(0);const[correct,setCorrect]=useState(0);const[finished,setFinished]=useState(false);const[choice,setChoice]=useState<number|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const started=useRef(Date.now());
 const q=questions[index];
 const pick=(value:number)=>{if(choice!==null||finished)return;setChoice(value);if(value===q.answer)setCorrect(x=>x+1)};
 const next=async()=>{if(choice===null)return;if(index<questions.length-1){setIndex(x=>x+1);setChoice(null);return}const finalCorrect=correct;const score=Math.round(finalCorrect*100/questions.length),duration=Math.max(1,Math.round((Date.now()-started.current)/1000)),xp=10+finalCorrect*5;setBusy(true);setError('');try{await api('/api/platform/games',{method:'POST',body:JSON.stringify({gameCode:game.game_code,score,xpEarned:xp,durationSeconds:duration,payload:{correct:finalCorrect,total:questions.length,engine:'STANDARD_MINI_GAME_V1'}})});setFinished(true);onSaved()}catch(e:any){setError(e.message||'Oyun sonucu kaydedilemedi.')}finally{setBusy(false)}};
 const restart=()=>{setIndex(0);setCorrect(0);setFinished(false);setChoice(null);setError('');started.current=Date.now()};
 return <div className="panel" style={{marginBottom:18}}><div className="panel-head"><div><span className="eyebrow">AKADEMİK MİNİ OYUN</span><h2>{game.title}</h2><p>{game.description}</p></div><button className="ghost" onClick={onClose}><X size={17}/> Kapat</button></div>{error&&<div className="alert error">{error}</div>}{finished?<div className="success-box"><Trophy/><div><strong>Tamamlandı · %{Math.round(correct*100/questions.length)}</strong><span>{correct}/{questions.length} doğru · XP hesabına işlendi.</span><button className="secondary" style={{marginTop:10}} onClick={restart}><RotateCcw size={15}/> Tekrar oyna</button></div></div>:<><div className="summary-strip"><div className="summary"><span>Soru</span><strong>{index+1}/{questions.length}</strong></div><div className="summary"><span>Doğru</span><strong>{correct}</strong></div></div><h3 style={{marginTop:18}}>{q.prompt}</h3><div className="exam-grid">{q.options.map((option,i)=><button key={option} className={choice===null?'secondary':i===q.answer?'primary':'secondary'} style={{justifyContent:'flex-start',opacity:choice!==null&&i!==q.answer ? .65 : 1}} disabled={choice!==null} onClick={()=>pick(i)}>{choice!==null&&i===q.answer&&<CheckCircle2 size={16}/>} {String.fromCharCode(65+i)}) {option}</button>)}</div><button className="primary" style={{marginTop:14}} disabled={choice===null||busy} onClick={()=>void next()}>{busy?'Kaydediliyor…':index===questions.length-1?'Oyunu bitir':'Sonraki soru'}</button></>}</div>;
}
