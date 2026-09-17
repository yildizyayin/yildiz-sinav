import './AnunexCosmos.css';
import { AnunexBrand } from './AnunexBrand';
import { NibiruMark } from './NibiruMark';

const capabilities = [
  { name:'Ölçme', className:'measure' }, { name:'Rehberlik', className:'guidance' },
  { name:'Soru Havuzu', className:'question-bank' }, { name:'Video Öğrenme', className:'video' },
  { name:'Kurum İçgörüsü', className:'insight' }, { name:'Branş Öğretmeni', className:'teacher' },
];

export function AnunexCosmos(){
  return <div className="anunex-cosmos" aria-label="ANUNEX ve merkezî Nibiru yapay zekâ ağı">
    <div className="cosmos-stars cosmos-stars-a"/><div className="cosmos-stars cosmos-stars-b"/><div className="cosmos-glow"/>
    <div className="anunex-owner-lockup"><AnunexBrand inverse tagline/></div>
    <div className="cosmos-system" aria-hidden="true">
      <span className="cosmos-orbit orbit-one"/><span className="cosmos-orbit orbit-two"/><span className="cosmos-orbit orbit-three"/>
      <span className="cosmos-network network-a"/><span className="cosmos-network network-b"/>
      {capabilities.map(capability=><span key={capability.name} className={`cosmos-capability ${capability.className}`}><i/><em>{capability.name}</em></span>)}
      <span className="nibiru-center-canonical"><NibiruMark size={112} state="active" showWordmark/></span>
    </div>
    <div className="cosmos-message"><span>ANUNEX · NİBİRU YAPAY ZEKÂSI</span><h1>Tüm akademik süreç<br/>tek akışta.</h1><p>Ölçme, optik, analiz ve rehberlik; ANUNEX’in merkezî yapay zekâsı Nibiru ile birlikte çalışır.</p></div>
  </div>;
}
