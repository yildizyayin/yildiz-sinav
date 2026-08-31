import { useEffect } from 'react';
import { ArrowRight, BarChart3, BookOpenCheck, Building2, Camera, Check, ChevronRight, ClipboardCheck, GraduationCap, Layers3, LineChart, LockKeyhole, Network, ScanLine, ShieldCheck, Sparkles, Target, UserRoundCheck, Users } from 'lucide-react';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark } from '../components/NibiruMark';
import './marketing-home.css';

const APP_URL='https://app.anunex.com';
const DEMO_URL='https://demo.anunex.com';

const features=[
  {icon:ScanLine,title:'Optik ve kamera ile hızlı veri toplama',text:'Kişiselleştirilmiş optikler hazırlayın; tarayıcıdan veya telefon kamerasından cevapları güvenli biçimde yakalayın.'},
  {icon:BarChart3,title:'Kazanım düzeyinde gerçek analiz',text:'Net ve puanın arkasındaki öğrenme açığını öğrenci, sınıf, şube, kurum ve zincir düzeyinde görün.'},
  {icon:BookOpenCheck,title:'Kişiye özel öğrenme materyali',text:'Yanlış, boş ve eksik kazanımlardan kişiye özel kitaplar, Sıfır Hata Kitapçığı ve hedefli çalışma rotaları üretin.'},
  {icon:ClipboardCheck,title:'Sınavdan eyleme tek akış',text:'Sınav planlama, yoklama, ödev, föy, video çözüm ve gelişim takibini birbirinden koparmadan yönetin.'},
  {icon:Network,title:'Kurumdan zincire ölçeklenen yönetim',text:'Tek kurumdan çok kampüslü yapılara kadar rol, lisans, tema, içerik ve performans standartlarını merkezden yönetin.'},
  {icon:ShieldCheck,title:'Mahremiyet önce tasarım',text:'Kurum ve rol izolasyonu, denetim kayıtları, veri minimizasyonu ve yaşam döngüsü kontrolleriyle okul verisini koruyun.'},
];

const roles=[
  {icon:Building2,title:'Kurum ve zincir yönetimi',text:'Akademik operasyon, lisans, kullanıcı, sınav ve standartları tek merkezden yönetin.'},
  {icon:GraduationCap,title:'Öğretmen',text:'Planlayın, ölçün, ödev verin; sınıfın güçlü ve gelişen kazanımlarını anında görün.'},
  {icon:Target,title:'Rehberlik',text:'Erken sinyalleri fark edin, öğrenciye zamanında ve kanıta dayalı destek sunun.'},
  {icon:Users,title:'Öğrenci',text:'Hedeflerini, çalışma rotasını, sonuçlarını ve gelişimini tek kişisel ekranda takip etsin.'},
  {icon:UserRoundCheck,title:'Veli',text:'Çocuğunun akademik yolculuğunu anlaşılır, güvenli ve eyleme dönük özetlerle izlesin.'},
];

export function MarketingHome(){
  useEffect(()=>{
    document.title='ANUNEX — Nibiru AI Destekli Ölçme ve Analiz Platformu';
    document.documentElement.classList.add('marketing-document');
    return()=>document.documentElement.classList.remove('marketing-document');
  },[]);
  return <div className="marketing-home">
    <header className="marketing-header">
      <a href="#top" className="marketing-logo"><AnunexBrand tagline/></a>
      <nav aria-label="Tanıtım menüsü"><a href="#platform">Platform</a><a href="#nibiru">Nibiru</a><a href="#roller">Paneller</a><a href="#guven">Güven</a></nav>
      <div className="marketing-actions"><a className="marketing-link" href={DEMO_URL}>Demo</a><a className="marketing-button small" href={APP_URL}>Sisteme Giriş <ArrowRight size={16}/></a></div>
    </header>

    <main id="top">
      <section className="marketing-hero">
        <div className="hero-aurora" aria-hidden="true"/><div className="hero-grid" aria-hidden="true"/>
        <div className="hero-copy">
          <div className="hero-kicker"><NibiruMark size={24} state="active"/><span>Nibiru AI destekli ölçme ve analiz platformu</span></div>
          <h1>Ölçmenin ötesinde.<br/><em>Her öğrenci için yön.</em></h1>
          <p>ANUNEX; optik cevap yakalamadan kazanım analizine, kişiselleştirilmiş öğrenmeden rehberliğe kadar okulun akademik kararlarını tek ve güvenli bir sistemde birleştirir.</p>
          <div className="hero-actions"><a className="marketing-button" href={DEMO_URL}>7 Günlük Kurum Demosu <ArrowRight size={18}/></a><a className="marketing-button secondary" href="#platform">Neden ANUNEX? <ChevronRight size={18}/></a></div>
          <div className="hero-assurances"><span><Check/> MEB kurumlarının iş akışlarına uygun</span><span><Check/> KVKK odaklı mimari</span><span><Check/> Web ve mobil</span></div>
        </div>
        <div className="hero-product" aria-label="ANUNEX platform görünümü">
          <div className="product-glow"/>
          <div className="product-window">
            <aside><AnunexBrand compact inverse tagline={false}/><div className="mock-nav active"><Layers3/>Genel Bakış</div><div className="mock-nav"><ClipboardCheck/>Sınavlar</div><div className="mock-nav"><Camera/>Optik Okuma</div><div className="mock-nav"><Users/>Öğrenciler</div><div className="mock-nav"><LineChart/>Raporlar</div><div className="mock-nibiru"><NibiruMark size={30} state="active"/><span><b>Nibiru</b><small>Yaşayan zekâ</small></span></div></aside>
            <div className="product-main"><div className="mock-top"><div><small>2026–2027 Eğitim Dönemi</small><strong>Akademik Genel Bakış</strong></div><span className="mock-avatar">AY</span></div><div className="mock-kpis"><MockKpi label="Aktif Öğrenci" value="1.248" trend="↑ %3,2"/><MockKpi label="Optik Okuma" value="1.872" trend="↑ %5,4"/><MockKpi label="Başarı Ort." value="%78,6" trend="↑ %2,6"/></div><div className="mock-workspace"><div className="mock-chart"><div className="mock-title"><strong>Kazanım gelişimi</strong><span>Son 6 sınav</span></div><svg viewBox="0 0 420 150" role="img" aria-label="Yükselen kazanım gelişimi grafiği"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3e73f4" stopOpacity=".24"/><stop offset="1" stopColor="#3e73f4" stopOpacity="0"/></linearGradient></defs><path d="M5 125 C55 115 75 90 120 96 S185 73 215 78 S275 52 310 63 S370 30 415 22 V145 H5Z" fill="url(#chart-fill)"/><path d="M5 125 C55 115 75 90 120 96 S185 73 215 78 S275 52 310 63 S370 30 415 22" fill="none" stroke="#356df1" strokeWidth="4" strokeLinecap="round"/></svg></div><div className="mock-insight"><NibiruMark size={48} state="thinking"/><strong>Nibiru İçgörüsü</strong><p>7/B sınıfında üç kazanım için hedefli tekrar öneriliyor.</p><span>Çalışma rotasını aç →</span></div></div></div>
          </div>
          <div className="product-mobile"><div className="mobile-island"/><div className="mobile-head"><NibiruMark size={26} state="active"/><span><small>Merhaba Efe</small><strong>Bugünkü rotan hazır.</strong></span></div><div className="mobile-progress"><span>Günlük çalışma</span><strong>%65</strong><i><b/></i></div><div className="mobile-cards"><span><b>154</b><small>TYT gün</small></span><span><b>3</b><small>Görev</small></span></div><div className="mobile-route"><strong>Bugünün görevleri</strong><p><Check/> Paragraf · 20 soru</p><p><span/> Fonksiyonlar · Konu çalış</p><p><span/> Deneme · Başla</p></div></div>
        </div>
      </section>

      <section className="trust-ribbon"><div><ShieldCheck/><span><strong>KVKK odaklı</strong><small>Veri minimizasyonu ve denetim</small></span></div><div><Users/><span><strong>Çok rollü</strong><small>Her kullanıcıya kendi çalışma alanı</small></span></div><div><Sparkles/><span><strong>Yaşayan yapay zekâ</strong><small>Kanıta dayalı öneri ve otomasyon</small></span></div><div><Network/><span><strong>Ölçeklenebilir</strong><small>Tek okuldan zincir kuruma</small></span></div></section>

      <section className="marketing-section platform-section" id="platform"><div className="section-heading"><span>TEK BİR AKADEMİK OMURGA</span><h2>Veriyi toplamaz; <em>karara dönüştürür.</em></h2><p>ANUNEX’in değeri yalnız sınav sonucunu göstermek değil, sonucu doğru kişiye doğru anda uygulanabilir bir sonraki adım olarak sunmaktır.</p></div><div className="decision-flow"><FlowStep no="01" title="Yakala" text="Optik, kamera veya veri aktarımı"/><FlowStep no="02" title="Anla" text="Soru ve kazanım düzeyinde analiz"/><FlowStep no="03" title="Kişiselleştir" text="Öğrenciye özel rota ve materyal"/><FlowStep no="04" title="Uygula" text="Ödev, föy, rehberlik ve müdahale"/><FlowStep no="05" title="İzle" text="Gelişimi kanıtlarla takip et"/></div><div className="feature-grid">{features.map(({icon:Icon,title,text})=><article key={title}><span><Icon/></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="nibiru-section" id="nibiru"><div className="nibiru-stage"><div className="nibiru-rings"/><NibiruMark size={190} state="active" showWordmark/></div><div className="nibiru-copy"><span>NIBIRU · ANUNEX’İN YAŞAYAN ZEKÂSI</span><h2>Bir sohbet kutusu değil.<br/><em>Sistemin kalbi.</em></h2><p>Nibiru; ölçme verisini, öğrencinin öğrenme geçmişini ve kullanıcının rolünü birlikte okuyarak kanıta dayalı içgörüler üretir. Dinler, analiz eder, önerir ve yönlendirir; veri yoksa tahmin yürütmez.</p><div className="nibiru-capabilities"><div><Sparkles/><span><strong>Anlar</strong><small>Doğrulanmış bağlamı okur</small></span></div><div><LineChart/><span><strong>Analiz eder</strong><small>Örüntü ve riski görünür kılar</small></span></div><div><Target/><span><strong>Yönlendirir</strong><small>Bir sonraki doğru adımı önerir</small></span></div><div><LockKeyhole/><span><strong>Sınırlarını bilir</strong><small>Yetki ve mahremiyeti korur</small></span></div></div></div></section>

      <section className="marketing-section role-section" id="roller"><div className="section-heading"><span>HER ROL İÇİN AYRI DENEYİM</span><h2>Aynı veri. <em>Doğru kullanıcıya doğru görünüm.</em></h2><p>ANUNEX’in standart tasarım dili masaüstü, tablet ve mobilde tutarlıdır; her rol yalnız ihtiyacı olan bilgi ve işlemleri görür.</p></div><div className="role-grid">{roles.map(({icon:Icon,title,text},i)=><article key={title} className={i===0?'featured':''}><div className="role-icon"><Icon/></div><span>0{i+1}</span><h3>{title}</h3><p>{text}</p><i/></article>)}</div></section>

      <section className="why-section"><div className="why-copy"><span>NEDEN KURUMLAR ANUNEX’İ SEÇER?</span><h2>Dağınık araçlar yerine<br/><em>tek bir gelişim sistemi.</em></h2><p>Sınav, optik, rapor, ödev ve rehberlik farklı yerlerde kaldığında okul veriyi taşımakla vakit kaybeder. ANUNEX tüm süreci aynı akademik kayıt üzerinde birleştirir.</p><a className="marketing-button" href={DEMO_URL}>Kurumunuzda deneyin <ArrowRight size={18}/></a></div><div className="why-list"><WhyItem title="Daha hızlı operasyon" text="Tekrarlayan ölçme ve raporlama işlerini azaltır; öğretmenin zamanını öğrenciye geri verir."/><WhyItem title="Daha erken müdahale" text="Sorun dönem sonunda değil, kanıt oluştuğu anda görünür olur."/><WhyItem title="Daha kişisel öğrenme" text="Her öğrenci aynı sonuca değil, kendi eksiğine göre hazırlanmış rotaya ulaşır."/><WhyItem title="Daha güvenilir karar" text="Kurum yönetimi sezgi yerine ölçülebilir gelişim verisiyle hareket eder."/></div></section>

      <section className="security-section" id="guven"><div className="security-mark"><ShieldCheck/></div><div><span>GÜVEN, SONRADAN EKLENEN BİR ÖZELLİK DEĞİL</span><h2>Okul verisi okulun sorumluluğudur.<br/><em>ANUNEX bunu ciddiye alır.</em></h2></div><div className="security-points"><p><Check/> Kurum ve rol bazlı erişim sınırları</p><p><Check/> Hassas işlemler için denetim kayıtları</p><p><Check/> Kamera ve optik süreçlerinde veri minimizasyonu</p><p><Check/> Saklama, silme ve dışa aktarma yaşam döngüsü</p></div></section>

      <section className="final-cta"><div className="cta-orb"><NibiruMark size={120} state="speaking"/></div><AnunexBrand inverse tagline/><h2>Akademik gelişimi<br/>tek yörüngede buluşturun.</h2><p>ANUNEX’i gerçek kurum senaryolarıyla deneyin; ekibinizin ve öğrencilerinizin nasıl çalışacağını görün.</p><div><a className="marketing-button light" href={DEMO_URL}>7 Günlük Demo <ArrowRight size={18}/></a><a className="marketing-button ghost" href={APP_URL}>Sisteme Giriş</a></div></section>
    </main>

    <footer><AnunexBrand compact tagline/><p>ANUNEX — Nibiru AI Destekli Ölçme ve Analiz Platformu</p><div><a href={APP_URL}>Sisteme Giriş</a><a href={DEMO_URL}>Demo</a><a href="#guven">Güven ve KVKK</a></div><small>© 2026 ANUNEX. Bilginin yörüngesinde.</small></footer>
  </div>;
}

function MockKpi({label,value,trend}:{label:string;value:string;trend:string}){return <div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>}
function FlowStep({no,title,text}:{no:string;title:string;text:string}){return <article><span>{no}</span><div><h3>{title}</h3><p>{text}</p></div><ChevronRight/></article>}
function WhyItem({title,text}:{title:string;text:string}){return <article><span><Check/></span><div><h3>{title}</h3><p>{text}</p></div></article>}
