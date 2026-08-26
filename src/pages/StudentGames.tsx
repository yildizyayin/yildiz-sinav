import { useEffect,useState } from 'react';
import { Brain,Gamepad2,Timer,Zap } from 'lucide-react';
import { api } from '../api';
import { MiniGamePlayer } from '../components/MiniGamePlayer';
import './student-standard.css';

const iconFor=(type:string)=>type==='MEMORY'?<Brain/>:type==='SPEED'?<Timer/>:type==='MATCH'?<Zap/>:<Gamepad2/>;

export function StudentGames(){
 const[data,setData]=useState<any>(null);const[profile,setProfile]=useState<any>(null);const[active,setActive]=useState<any>(null);const[error,setError]=useState('');
 const load=async()=>{const [catalog,gamification]=await Promise.all([api<any>('/api/student-standard/games'),api<any>('/api/platform/games')]);setData(catalog);setProfile(gamification.profile)};
 useEffect(()=>{void load().catch((e:any)=>setError(e.message))},[]);
 return <>
  <div className="page-head"><div><span className="eyebrow">Öğrenirken oyna</span><h1>🎮 Mini Öğrenme Oyunları</h1><p>Oyunlar yalnız eğlence için değil; kısa tekrar, dikkat, hız ve kazanım pekiştirme için tasarlanır.</p></div><Gamepad2/></div>
  {error&&<div className="alert error">{error}</div>}
  {data&&<div className="alert info">{data.gradeLevel?`${data.gradeLevel}. sınıf düzeyine uygun oyunlar gösteriliyor · ${Number(profile?.xp||0)} XP · Seviye ${Number(profile?.level||1)}.`:'Aktif sınıf düzeyi bulunamadı.'}</div>}
  {active&&<MiniGamePlayer game={active} onClose={()=>setActive(null)} onSaved={()=>void load()}/>}
  <div className="game-grid">{(data?.games||[]).map((g:any)=><div className="game-card" key={g.game_code}><div className="game-icon">{iconFor(g.game_type)}</div><span>{g.subject_code||'Karma'} · {g.game_type}</span><h2>{g.title}</h2><p>{g.description}</p><button className="primary" onClick={()=>setActive(g)}>Şimdi oyna</button><small>Sonuç, süre ve XP güvenli öğrenci hesabına kaydedilir.</small></div>)}{data&&!data.games?.length&&<div className="empty">Bu sınıf düzeyi için mini oyunlar henüz açılmadı.</div>}</div>
 </>;
}
