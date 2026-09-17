import './AnunexCosmos.css';
import { AnunexBrand } from './AnunexBrand';
import { NibiruMark } from './NibiruMark';

export function AnunexCosmos(){
  return <div className="anunex-cosmos" aria-label="ANUNEX ve merkezî Nibiru yapay zekâ ağı">
    <div className="cosmos-glow"/>
    <div className="anunex-owner-lockup"><AnunexBrand inverse tagline/></div>
    <div className="cosmos-system" aria-hidden="true">
      <span className="cosmos-light-wash wash-one"/><span className="cosmos-light-wash wash-two"/>
      <span className="nibiru-center-canonical"><NibiruMark size={112} state="active" showWordmark interactive/></span>
    </div>
    <div className="cosmos-message"><span>ANUNEX AKILLI EĞİTİM PLATFORMU</span><h1>Tüm eğitim zekâsı<br/>tek yörüngede.</h1><p>Ölçme, optik, akademik analiz ve rehberlik; ANUNEX’in merkezî yapay zekâsı Nibiru ile birlikte çalışır.</p></div>
  </div>;
}
