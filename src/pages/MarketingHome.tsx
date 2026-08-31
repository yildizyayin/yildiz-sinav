import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, BookOpenCheck, BrainCircuit, Building2, CalendarClock, Camera, Check, CheckCircle2, ChevronRight, ClipboardCheck, FileText, Gamepad2, GraduationCap, HeartHandshake, Layers3, LineChart, LockKeyhole, MapPin, MessageCircle, Mic2, Monitor, Network, Phone, PlayCircle, ScanLine, Send, ShieldCheck, Sparkles, Target, Trophy, UserRoundCheck, Users, Volume2 } from 'lucide-react';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark } from '../components/NibiruMark';
import './marketing-home.css';

const APP_URL='https://app.anunex.com';
const DEMO_URL='https://demo.anunex.com';
const PHONE_DISPLAY='0543 306 61 72';
const PHONE_URL='tel:+905433066172';
const WHATSAPP_URL='https://wa.me/905433066172?text=Merhaba%2C%20ANUNEX%20kurum%20demosu%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.';

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

const roleShowcases={
  institution:{label:'Kurum',eyebrow:'AKADEMİK KONTROL MERKEZİ',title:'Kurumun tamamını tek bakışta yönetin.',description:'Sınav, optik, öğrenci, öğretmen, lisans, föy ve akademik performans aynı merkezde; zincir yapılarda kampüsler ortak standartta.',accent:'#2f6df6',metrics:[['1.248','Aktif öğrenci'],['%78,6','Başarı ort.'],['12','Risk sinyali']],actions:['Sınav Merkezi','Optik Hazırla / Bas','Zincir Kurum Raporu']},
  teacher:{label:'Öğretmen',eyebrow:'SINIFTAN KAZANIMA',title:'Öğretmenin zamanını öğrenciye geri verin.',description:'Branşa ve atanan sınıfa göre sınav, yoklama, ödev, föy ve kazanım görünümü; Nibiru sınıfın bir sonraki adımını açıklar.',accent:'#7b5cff',metrics:[['6','Sınıf'],['84','Ödev teslimi'],['3','Öncelikli kazanım']],actions:['Sınıflarım','Ödev Merkezi','Kazanım Gelişimi']},
  guidance:{label:'Rehberlik',eyebrow:'ERKEN SİNYAL · DOĞRU DESTEK',title:'Sorunu büyümeden fark edin.',description:'Hedef, motivasyon, çalışma alışkanlığı ve sınav verilerini birlikte okuyun; yalnız yetkili öğrenciler için kanıta dayalı müdahale planlayın.',accent:'#e35d8f',metrics:[['18','Takipte öğrenci'],['5','Yeni sinyal'],['9','Tamamlanan görüşme']],actions:['Gelişim Sinyalleri','Hedef Takibi','Rehberlik Onayları']},
  student:{label:'Öğrenci',eyebrow:'BENİM AKADEMİK YÖRÜNGEM',title:'Her öğrenci için yaşayan bir çalışma alanı.',description:'Hedefler, geri sayımlar, görevler, sonuçlar, yanlışlar, kişisel kitaplar, Sıfır Hata ve Nibiru koçluğu tek kişisel ekranda.',accent:'#18a989',metrics:[['154','TYT’ye gün'],['3','Bugünkü görev'],['%72','Haftalık hedef']],actions:['Bugünkü Rotam','Benim Kitaplarım','Yanlış / Boş Sorularım']},
  parent:{label:'Veli',eyebrow:'SADE · GÜVENLİ · ANLAŞILIR',title:'Çocuğunuzun gelişimini doğru dille görün.',description:'Özel cevaplar yerine güvenli gelişim özetleri, haftalık eğilimler, kurum bildirimleri ve Nibiru Veli Rehberi.',accent:'#ed8d35',metrics:[['2','Yeni bildirim'],['↑ %6','Aylık gelişim'],['4/5','Görev tamamlama']],actions:['Haftalık Özet','Gelişim Raporu','Nibiru Veli Rehberi']},
} as const;

type ShowcaseKey=keyof typeof roleShowcases;

const studentJourney=[
  {icon:Target,title:'Hedefini tanır',text:'LGS hedef lisesi veya YKS hedef programı; resmî veri ve öğrencinin gerçek gelişimi birlikte izlenir.'},
  {icon:CalendarClock,title:'Bugünü planlar',text:'Nibiru; ödev, eksik kazanım ve yaklaşan sınava göre uygulanabilir günlük rota hazırlar.'},
  {icon:ScanLine,title:'Ölçer ve anlar',text:'Optik, kamera ve sınav sonuçlarından yanlış, boş ve öğrenme açığı görünür hâle gelir.'},
  {icon:BookOpenCheck,title:'Kişiselleştirir',text:'Kişiye Özel Kitap, Sıfır Hata Kitapçığı, Mavi/Kırmızı Föy ve hedefli tekrar oluşturur.'},
  {icon:PlayCircle,title:'Doğru desteği bulur',text:'Onaylı çözüm videosunu; yoksa kazanıma uygun kısa YouTube konu anlatım adaylarını sunar.'},
  {icon:Trophy,title:'Gelişimi yaşatır',text:'Sayaçlar, görev zinciri, güvenli mini oyunlar ve kanıta dayalı ilerleme ile motivasyonu korur.'},
];

const integrations=[
  {icon:MessageCircle,label:'WhatsApp akademik kanal',text:'Doğrulanmış kullanıcıya kurum duyurusu, gelişim hatırlatması ve Nibiru destek akışı.',state:'Kuruluma hazır'},
  {icon:PlayCircle,label:'YouTube mikro öğrenme',text:'Kazanıma göre güvenli arama, kısa video adayları ve yapay zekâ destekli uygunluk seçimi.',state:'Entegrasyonlu'},
  {icon:Camera,label:'Telefon kamerası + optik',text:'Kişiselleştirilmiş optik hazırlama, kamera ile cevap yakalama ve ham görseli kalıcılaştırmayan akış.',state:'Çalışan çekirdek'},
  {icon:BrainCircuit,label:'Nibiru uzman orkestrasyonu',text:'Eğitim koçu, branş öğretmeni, rehberlik, veli rehberi ve kurum içgörüsü tek kimlik altında.',state:'Aktif'},
];

export function MarketingHome(){
  const [activeRole,setActiveRole]=useState<ShowcaseKey>('student');
  const [nibiruStep,setNibiruStep]=useState<0|1>(0);
  const role=useMemo(()=>roleShowcases[activeRole],[activeRole]);
  useEffect(()=>{
    document.title='ANUNEX — Nibiru AI Destekli Ölçme ve Analiz Platformu';
    document.documentElement.classList.add('marketing-document');
    return()=>document.documentElement.classList.remove('marketing-document');
  },[]);
  return <div className="marketing-home">
    <header className="marketing-header">
      <a href="#top" className="marketing-logo"><AnunexBrand tagline/></a>
      <nav aria-label="Tanıtım menüsü"><a href="#platform">Platform</a><a href="#nibiru">Nibiru</a><a href="#roller">Paneller</a><a href="#ogrenci">Öğrenci</a><a href="#iletisim">İletişim</a></nav>
      <div className="marketing-actions"><a className="marketing-link" href={DEMO_URL}>Demo</a><a className="marketing-button small" href={APP_URL}>Sisteme Giriş <ArrowRight size={16}/></a></div>
    </header>

    <main id="top">
      <section className="marketing-hero">
        <div className="hero-aurora" aria-hidden="true"/><div className="hero-grid" aria-hidden="true"/>
        <div className="hero-copy">
          <div className="hero-kicker"><NibiruMark size={24} state="active"/><span>Nibiru AI destekli ölçme ve analiz platformu</span></div>
          <h1>Ölçmenin ötesinde.<br/><em>Her öğrenci için yön.</em></h1>
          <p>ANUNEX; optik cevap yakalamadan kazanım analizine, kişiselleştirilmiş öğrenmeden rehberliğe kadar okulun akademik kararlarını tek ve güvenli bir sistemde birleştirir.</p>
          <div className="hero-actions"><a className="marketing-button" href={DEMO_URL}>7 Günlük Kurum Demosu <ArrowRight size={18}/></a><a className="marketing-button secondary" href="#roller">Panelleri Gör <ChevronRight size={18}/></a></div>
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

      <section className="nibiru-section" id="nibiru">
        <div className="nibiru-stage nibiru-live-stage">
          <div className="nibiru-rings"/><NibiruMark size={176} state={nibiruStep?'speaking':'active'} showWordmark/>
          <div className="live-signal"><i/><span>{nibiruStep?'Nibiru yanıtlıyor':'Nibiru çevrimiçi'}</span></div>
        </div>
        <div className="nibiru-copy"><span>NIBIRU · ANUNEX’İN YAŞAYAN ZEKÂSI</span><h2>Bir sohbet kutusu değil.<br/><em>Sistemin kalbi.</em></h2><p>Nibiru; ölçme verisini, öğrencinin öğrenme geçmişini ve kullanıcının rolünü birlikte okuyarak kanıta dayalı içgörüler üretir. Dinler, analiz eder, önerir ve yönlendirir; veri yoksa tahmin yürütmez.</p>
          <div className="nibiru-conversation" aria-live="polite">
            <div className="conversation-user"><span>Ben geleceğin doktoruyum. Bugün ne yapmalıyım?</span><div>E</div></div>
            {nibiruStep===1&&<div className="conversation-nibiru"><NibiruMark size={34} state="speaking"/><div><strong>Geleceğin doktoru için bugünü planladım.</strong><p>Son sınavındaki biyoloji hücre bölünmeleri ve matematik fonksiyonlar sinyallerine göre üç odak hazırladım.</p><ul><li><CheckCircle2/> Biyoloji · 18 dk konu tekrarı</li><li><CheckCircle2/> Fonksiyonlar · 12 hedef soru</li><li><CheckCircle2/> Paragraf · 20 soru hız çalışması</li></ul><button type="button"><Volume2/> Dinle</button></div></div>}
            {nibiruStep===0&&<button className="ask-nibiru" type="button" onClick={()=>setNibiruStep(1)}><Sparkles/> Nibiru’ya sor <Send/></button>}
          </div>
          <div className="nibiru-capabilities"><div><Sparkles/><span><strong>Anlar</strong><small>Doğrulanmış bağlamı okur</small></span></div><div><LineChart/><span><strong>Analiz eder</strong><small>Örüntü ve riski görünür kılar</small></span></div><div><Mic2/><span><strong>Dinler ve konuşur</strong><small>Bas-konuş ses deneyimi</small></span></div><div><LockKeyhole/><span><strong>Sınırlarını bilir</strong><small>Yetki ve mahremiyeti korur</small></span></div></div>
        </div>
      </section>

      <section className="marketing-section role-section" id="roller"><div className="section-heading"><span>WEB VE MOBİL · HER ROL İÇİN AYRI DENEYİM</span><h2>Aynı akademik gerçek. <em>Beş farklı çalışma alanı.</em></h2><p>Tanıtımda gördüğünüz ekranlar, ANUNEX’in gerçek rol yetkileri ve çalışan modülleriyle eşleşir. Masaüstünde derinlik, mobilde hız kaybolmaz.</p></div>
        <div className="role-switcher" role="tablist" aria-label="Panel türü">{(Object.keys(roleShowcases) as ShowcaseKey[]).map(key=><button type="button" role="tab" aria-selected={activeRole===key} className={activeRole===key?'active':''} key={key} onClick={()=>setActiveRole(key)}>{roleShowcases[key].label}</button>)}</div>
        <div className="role-showcase" style={{'--role-accent':role.accent} as React.CSSProperties}>
          <div className="role-story"><span>{role.eyebrow}</span><h3>{role.title}</h3><p>{role.description}</p><div>{role.actions.map(action=><small key={action}><Check/> {action}</small>)}</div></div>
          <RoleDesktop role={role} activeRole={activeRole}/>
          <RoleMobile role={role} activeRole={activeRole}/>
        </div>
        <div className="role-grid role-summary-grid">{roles.map(({icon:Icon,title,text},i)=><article key={title}><div className="role-icon"><Icon/></div><span>0{i+1}</span><h3>{title}</h3><p>{text}</p><i/></article>)}</div>
      </section>

      <section className="student-universe" id="ogrenci">
        <div className="student-universe-copy"><span>ÖĞRENCİ İÇİN TEK EKRANDAN FAZLASI</span><h2>Bir sonuç sayfası değil.<br/><em>Kişisel gelişim modeli.</em></h2><p>ANUNEX öğrencinin yalnız kaç net yaptığını göstermez. Hedefini tanır, bugününü planlar, eksiğini materyale dönüştürür ve gelişimi öğrenci–öğretmen–rehberlik–veli arasında güvenli biçimde görünür kılar.</p><a href={DEMO_URL} className="marketing-button light">Öğrenci deneyimini incele <ArrowRight/></a></div>
        <div className="student-orbit-map"><div className="orbit-line"/><div className="student-core"><NibiruMark size={72} state="active"/><strong>Benim<br/>Yörüngem</strong></div>{studentJourney.map(({icon:Icon,title,text},index)=><article key={title} style={{'--journey-index':index} as React.CSSProperties}><span><Icon/></span><div><small>0{index+1}</small><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="marketing-section integration-section"><div className="section-heading"><span>BAŞKA ARAÇLAR DEĞİL · TEK AKADEMİK AKIŞ</span><h2>Kimsede olmayan fark,<br/><em>özelliklerin birlikte çalışması.</em></h2><p>Her parça tek başına değil; aynı öğrenci, aynı kazanım ve aynı güvenli veri kaydı üzerinde birbirini tamamlar.</p></div><div className="integration-grid">{integrations.map(({icon:Icon,label,text,state})=><article key={label}><div><Icon/><span>{state}</span></div><h3>{label}</h3><p>{text}</p></article>)}</div>
        <div className="unique-strip"><span><FileText/> Kişiye Özel Kitap</span><span><BookOpen/> Sıfır Hata Kitapçığı</span><span><Gamepad2/> Güvenli Mini Oyunlar</span><span><Monitor/> Tema & Özel Gün Yönetimi</span><span><HeartHandshake/> Rehberlik Müdahale Akışı</span></div>
      </section>

      <section className="why-section"><div className="why-copy"><span>NEDEN KURUMLAR ANUNEX’İ SEÇER?</span><h2>Dağınık araçlar yerine<br/><em>tek bir gelişim sistemi.</em></h2><p>Sınav, optik, rapor, ödev ve rehberlik farklı yerlerde kaldığında okul veriyi taşımakla vakit kaybeder. ANUNEX tüm süreci aynı akademik kayıt üzerinde birleştirir.</p><a className="marketing-button" href={DEMO_URL}>Kurumunuzda deneyin <ArrowRight size={18}/></a></div><div className="why-list"><WhyItem title="Daha hızlı operasyon" text="Tekrarlayan ölçme ve raporlama işlerini azaltır; öğretmenin zamanını öğrenciye geri verir."/><WhyItem title="Daha erken müdahale" text="Sorun dönem sonunda değil, kanıt oluştuğu anda görünür olur."/><WhyItem title="Daha kişisel öğrenme" text="Her öğrenci aynı sonuca değil, kendi eksiğine göre hazırlanmış rotaya ulaşır."/><WhyItem title="Daha güvenilir karar" text="Kurum yönetimi sezgi yerine ölçülebilir gelişim verisiyle hareket eder."/></div></section>

      <section className="security-section" id="guven"><div className="security-mark"><ShieldCheck/></div><div><span>GÜVEN, SONRADAN EKLENEN BİR ÖZELLİK DEĞİL</span><h2>Okul verisi okulun sorumluluğudur.<br/><em>ANUNEX bunu ciddiye alır.</em></h2></div><div className="security-points"><p><Check/> Kurum ve rol bazlı erişim sınırları</p><p><Check/> Hassas işlemler için denetim kayıtları</p><p><Check/> Kamera ve optik süreçlerinde veri minimizasyonu</p><p><Check/> Saklama, silme ve dışa aktarma yaşam döngüsü</p></div></section>

      <section className="contact-section" id="iletisim"><div><span>ANUNEX’İ KURUMUNUZDA GÖRÜN</span><h2>Aradığınız sistemin<br/><em>gerçekte nasıl çalıştığını konuşalım.</em></h2><p>İhtiyacınızı dinleyelim; kurum yapınıza uygun modülleri ve 7 günlük demo planını birlikte oluşturalım.</p></div><div className="contact-cards"><a href={PHONE_URL}><Phone/><span><small>Telefon</small><strong>{PHONE_DISPLAY}</strong></span><ArrowRight/></a><a href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle/><span><small>WhatsApp</small><strong>Hemen bilgi alın</strong></span><ArrowRight/></a><div><MapPin/><span><small>Merkez</small><strong>Kartal / İSTANBUL</strong></span></div></div></section>

      <section className="final-cta"><div className="cta-orb"><NibiruMark size={120} state="speaking"/></div><AnunexBrand inverse tagline/><h2>Akademik gelişimi<br/>tek yörüngede buluşturun.</h2><p>Hayal edilen özellikleri anlatmakla kalmıyoruz. Optikten kişisel öğrenmeye, Nibiru’dan kurum yönetimine kadar aynı sistem içinde çalıştırıyoruz.</p><div><a className="marketing-button light" href={DEMO_URL}>7 Günlük Demo <ArrowRight size={18}/></a><a className="marketing-button ghost" href={WHATSAPP_URL} target="_blank" rel="noreferrer">İletişime Geç</a></div></section>
    </main>

    <a className="floating-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="WhatsApp ile ANUNEX hakkında bilgi alın"><MessageCircle/><span>Bilgi alın</span></a>
    <footer><AnunexBrand compact tagline/><p>ANUNEX — Nibiru AI Destekli Ölçme ve Analiz Platformu · Kartal / İSTANBUL · {PHONE_DISPLAY}</p><div><a href={APP_URL}>Sisteme Giriş</a><a href={DEMO_URL}>Demo</a><a href="#guven">Güven ve KVKK</a><a href={PHONE_URL}>İletişim</a></div><small>© 2026 ANUNEX. Bilginin yörüngesinde.</small></footer>
  </div>;
}

function MockKpi({label,value,trend}:{label:string;value:string;trend:string}){return <div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>}
function FlowStep({no,title,text}:{no:string;title:string;text:string}){return <article><span>{no}</span><div><h3>{title}</h3><p>{text}</p></div><ChevronRight/></article>}
function WhyItem({title,text}:{title:string;text:string}){return <article><span><Check/></span><div><h3>{title}</h3><p>{text}</p></div></article>}
function RoleDesktop({role,activeRole}:{role:typeof roleShowcases[ShowcaseKey];activeRole:ShowcaseKey}){return <div className="role-device desktop-device"><div className="device-bar"><i/><i/><i/><span>app.anunex.com</span></div><div className="device-shell"><aside><AnunexBrand compact inverse tagline={false}/><b><Layers3/> Ana Sayfa</b>{role.actions.map(action=><span key={action}><ChevronRight/> {action}</span>)}<small><NibiruMark size={26} state="active"/> Nibiru AI</small></aside><main><header><div><small>{role.eyebrow}</small><strong>{role.label} Paneli</strong></div><div className="fake-avatar">{role.label.charAt(0)}</div></header><div className="role-device-metrics">{role.metrics.map(([value,label])=><div key={label}><span>{label}</span><strong>{value}</strong><i/></div>)}</div><div className="role-device-work"><div><span>Gelişim görünümü</span><svg viewBox="0 0 420 130"><path d="M8 110 C55 95 70 104 112 78 S185 96 225 61 S290 70 330 42 S378 36 412 18" fill="none" stroke="var(--role-accent)" strokeWidth="5" strokeLinecap="round"/><path d="M8 110 C55 95 70 104 112 78 S185 96 225 61 S290 70 330 42 S378 36 412 18 V125 H8Z" fill="var(--role-accent)" opacity=".08"/></svg></div><div className="role-nibiru-card"><NibiruMark size={38} state="thinking"/><strong>Nibiru içgörüsü</strong><p>{activeRole==='student'?'Bugünkü rotanın ilk iki adımı hazır.':activeRole==='parent'?'Haftalık gelişim dengeli ilerliyor.':activeRole==='guidance'?'Beş öğrenci için erken destek sinyali oluştu.':activeRole==='teacher'?'Üç kazanım hedefli tekrar istiyor.':'7/B için hedefli tekrar planı hazır.'}</p></div></div></main></div></div>}
function RoleMobile({role,activeRole}:{role:typeof roleShowcases[ShowcaseKey];activeRole:ShowcaseKey}){return <div className="role-device mobile-device"><div className="mobile-speaker"/><div className="mobile-role-head"><NibiruMark size={28} state="active"/><span><small>{role.label}</small><strong>{activeRole==='student'?'Bugünkü yörüngen hazır.':'Güncel görünüm hazır.'}</strong></span></div><div className="mobile-role-score"><span>{role.metrics[0][1]}</span><strong>{role.metrics[0][0]}</strong><i><b/></i></div><div className="mobile-role-list">{role.actions.map((action,index)=><div key={action}><span>{index+1}</span><strong>{action}</strong><ChevronRight/></div>)}</div><nav><Layers3/><BarChart3/><NibiruMark size={24} state="active"/><MessageCircle/></nav></div>}
