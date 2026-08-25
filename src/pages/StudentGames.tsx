import { useEffect,useState } from 'react';
import { Brain,Gamepad2,Timer,Zap } from 'lucide-react';
import { api } from '../api';
import './student-standard.css';

const iconFor=(type:string)=>type==='MEMORY'?<Brain/>:type==='SPEED'?<Timer/>:type==='MATCH'?<Zap/>:<Gamepad2/>;

export function StudentGames(){
 const[data,setData]=useState<any>(null);const[error,setError]=useState('');
 useEffect(()=>{void api<any>('/api/student-standard/games').then(setData).catch((e:any)=>setError(e.message))},[]);
 return <>
  <div className="page-head"><div><span className="eyebrow">Öğrenirken oyna</span><h1>🎮 Mini Öğrenme Oyunları</h1><p>Oyunlar yalnız eğlence için değil; kısa tekrar, dikkat, hız ve kazanım pekiştirme için tasarlanır.</p></div><Gamepad2/></div>
  {error&&<div className="alert error">{error}</div>}
  {data&&<div className="alert info">{data.gradeLevel?`${data.gradeLevel}. sınıf düzeyine uygun oyunlar gösteriliyor.`:'Aktif sınıf düzeyi bulunamadı.'}</div>}
  <div className="game-grid">{(data?.games||[]).map((g:any)=><div className="game-card" key={g.game_code}><div className="game-icon">{iconFor(g.game_type)}</div><span>{g.subject_code||'Karma'} · {g.game_type}</span><h2>{g.title}</h2><p>{g.description}</p><button className="primary" disabled>Yakında oyna</button><small>Oyun motoruna bağlandığında skor, süre ve kazanım kanıtı Learning Graph'a işlenecek.</small></div>)}{data&&!data.games?.length&&<div className="empty">Bu sınıf düzeyi için mini oyunlar henüz açılmadı.</div>}</div>
 </>;
}
