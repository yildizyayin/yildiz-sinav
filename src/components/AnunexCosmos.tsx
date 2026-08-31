import './AnunexCosmos.css';
import { AnunexBrand } from './AnunexBrand';
import { NibiruMark } from './NibiruMark';

const worlds = [
  { name:'Dünya', className:'earth' }, { name:'Mars', className:'mars' },
  { name:'Venüs', className:'venus' }, { name:'Uranüs', className:'uranus' },
  { name:'Ay', className:'moon' }, { name:'Güneş', className:'sun' },
];

export function AnunexCosmos(){
  return <div className="anunex-cosmos" aria-label="ANUNEX evreni ve merkezî Nibiru yapay zekâ ağı">
    <div className="cosmos-stars cosmos-stars-a"/><div className="cosmos-stars cosmos-stars-b"/><div className="cosmos-glow"/>
    <div className="anunex-owner-lockup"><AnunexBrand inverse tagline/></div>
    <div className="cosmos-system" aria-hidden="true">
      <span className="cosmos-orbit orbit-one"/><span className="cosmos-orbit orbit-two"/><span className="cosmos-orbit orbit-three"/>
      <span className="cosmos-network network-a"/><span className="cosmos-network network-b"/>
      {worlds.map(world=><span key={world.name} className={`cosmos-world ${world.className}`}><i/><em>{world.name}</em></span>)}
      <span className="nibiru-halo halo-one"/><span className="nibiru-halo halo-two"/>
      <span className="nibiru-center-canonical"><NibiruMark size={112} state="active" showWordmark/></span>
    </div>
    <div className="cosmos-message"><span>ANUNEX AKILLI EĞİTİM EVRENİ</span><h1>Tüm eğitim zekâsı<br/>tek yörüngede.</h1><p>Ölçme, optik, akademik analiz ve rehberlik; ANUNEX’in merkezî yapay zekâsı Nibiru ile birlikte çalışır.</p></div>
  </div>;
}
