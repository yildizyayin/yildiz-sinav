import './AnunexCosmos.css';

const worlds = [
  { name:'Dünya', className:'earth' }, { name:'Mars', className:'mars' },
  { name:'Venüs', className:'venus' }, { name:'Uranüs', className:'uranus' },
  { name:'Ay', className:'moon' }, { name:'Güneş', className:'sun' },
];

export function AnunexCosmos(){
  return <div className="anunex-cosmos" aria-label="ANUNEX evreni ve merkezî Nibiru yapay zekâ ağı">
    <div className="cosmos-stars cosmos-stars-a"/><div className="cosmos-stars cosmos-stars-b"/><div className="cosmos-glow"/>
    <div className="anunex-owner-lockup"><span className="anunex-symbol" aria-hidden="true"><i>A</i><b/></span><span><strong>ANUNEX</strong><small>BİLGİNİN YÖRÜNGESİNDE</small></span></div>
    <div className="cosmos-system" aria-hidden="true">
      <span className="cosmos-orbit orbit-one"/><span className="cosmos-orbit orbit-two"/><span className="cosmos-orbit orbit-three"/>
      <span className="cosmos-network network-a"/><span className="cosmos-network network-b"/>
      {worlds.map(world=><span key={world.name} className={`cosmos-world ${world.className}`}><i/><em>{world.name}</em></span>)}
      <span className="nibiru-halo halo-one"/><span className="nibiru-halo halo-two"/>
      <span className="nibiru-center"><i/><b>N</b><strong>NIBIRU</strong><small>ANUNEX YAPAY ZEKÂSI</small></span>
    </div>
    <div className="cosmos-message"><span>ANUNEX AKILLI EĞİTİM EVRENİ</span><h1>Tüm eğitim zekâsı<br/>tek yörüngede.</h1><p>Ölçme, optik, akademik analiz ve rehberlik; ANUNEX’in merkezî yapay zekâsı Nibiru ile birlikte çalışır.</p></div>
  </div>;
}
