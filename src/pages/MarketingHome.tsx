import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, BookOpenCheck, BrainCircuit, Building2, CalendarClock, Camera, Check, CheckCircle2, ChevronRight, ClipboardCheck, FileText, Gamepad2, GraduationCap, HeartHandshake, Layers3, LineChart, LockKeyhole, MapPin, MessageCircle, Mic2, Monitor, Network, Phone, PlayCircle, ScanLine, Send, ShieldCheck, Sparkles, Target, Trophy, UserRoundCheck, Users, Volume2 } from 'lucide-react';
import { AnunexBrand } from '../components/AnunexBrand';
import { NibiruMark } from '../components/NibiruMark';
import { NibiruPlanetarySystem } from '../components/NibiruPlanetarySystem';
import './marketing-home.css';
import './marketing-premium.css';

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

const nibiruConversations=[
 {key:'student-plan',label:'Bugünkü rota',audience:'Öğrenci',initial:'E',question:'Bugün ne yapmalıyım?',identity:'Güvenli öğrenci profili tanındı · Efe',title:'Merhaba Efe, bugünkü rotanı hazırladım.',body:'Son sınavındaki biyoloji ve matematik sinyallerine göre üç odak seçtim.',tasks:['Biyoloji · 18 dk konu tekrarı','Fonksiyonlar · 12 hedef soru','Paragraf · 20 soru hız çalışması'],signoff:'Hazırsan başlayalım, geleceğin doktoru.'},
 {key:'wrong-question',label:'Yanlış soru',audience:'Öğrenci',initial:'E',question:'Bu soruda neden hata yaptım?',identity:'Soru ve kazanım bağlamı doğrulandı',title:'İşlem hatası değil, kavram karışıklığı görüyorum.',body:'Bileşke fonksiyonda işlem sırasını ters uygulamışsın. Önce g(2), sonra f sonucunu kullanacağız.',tasks:['90 sn konu özeti','Öğretmen onaylı video','Aynı kazanımdan 3 soru'],signoff:'Hata bir etiket değil; bir sonraki doğru adımın işaretidir.'},
 {key:'teacher',label:'Öğretmen',audience:'Öğretmen',initial:'Ö',question:'8-A için bugün neye odaklanmalıyım?',identity:'Yetkili sınıf verisi · 8-A',title:'İki kazanım sınıf müdahalesi istiyor.',body:'Öğrencilerin %41’i olasılık, %36’sı çarpanlar konusunda aynı hata örüntüsünü gösterdi.',tasks:['12 dk sınıf tekrarı','6 öğrencilik destek grubu','Akşam mini kontrol testi'],signoff:'Plan hazır; istersen ödevi tek dokunuşla atayabilirim.'},
 {key:'parent',label:'Veli',audience:'Veli',initial:'V',question:'Çocuğumun bu haftası nasıl geçti?',identity:'Veli görünümü · mahremiyet sınırı açık',title:'Efe düzenli ilerledi; baskı değil süreklilik gerekiyor.',body:'Görev tamamlama yükseldi. Matematikte küçük bir tekrar ihtiyacı var; ayrıntılı öğrenci cevabı paylaşılmıyor.',tasks:['4/5 görev tamamlandı','Haftalık gelişim +%6','Pazar günü 20 dk tekrar'],signoff:'Bu hafta “çabanı gördüm” demeniz en doğru destek olur.'},
 {key:'institution',label:'Kurum',audience:'Kurum',initial:'K',question:'Bugün hangi sınıflara müdahale etmeliyiz?',identity:'Kurum yöneticisi · yetkili özet',title:'Üç sınıf için erken müdahale öneriyorum.',body:'Devamsızlık, sınav eğilimi ve görev tamamlama birlikte değerlendirildi; yalnız doğrulanmış kurum verisi kullanıldı.',tasks:['7-B · devamsızlık sinyali','8-C · matematik kazanımı','11-A · deneme düşüşü'],signoff:'Rehberlik ve öğretmen görevlerini onayınıza hazırladım.'},
 {key:'goal',label:'Hedef meslek',audience:'Öğrenci',initial:'Z',question:'Hedefime yaklaşıyor muyum?',identity:'Hedef program · Tıp Fakültesi',title:'Evet Zeynep; yönün doğru, planı biraz dengeleyeceğiz.',body:'Fen ivmen güçlü. Türkçe hızın hedef sıralaman için bu hafta öncelik olmalı.',tasks:['Paragraf · günlük 25 soru','Kimya · 2 kazanım tekrarı','Cumartesi TYT simülasyonu'],signoff:'Bugünün küçük adımları geleceğin doktorunu inşa ediyor.'}
] as const;

async function playNibiruVoice(scenario:string,text:string){
 try{
  const response=await fetch('/api/public/nibiru/voice-demo?scenario='+encodeURIComponent(scenario));
  if(!response.ok)throw new Error('voice');
  const url=URL.createObjectURL(await response.blob());
  const audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);await audio.play();return;
 }catch{}
 if(!('speechSynthesis'in window))return;
 window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);
 utterance.lang='tr-TR';utterance.rate=.94;utterance.pitch=1.02;
 const voices=window.speechSynthesis.getVoices();
 utterance.voice=voices.find(v=>v.lang.toLowerCase().startsWith('tr'))||null;window.speechSynthesis.speak(utterance);
}



const studentJourney=[
  {icon:Target,title:'Hedefini tanır',text:'LGS hedef lisesi veya YKS hedef programı; resmî veri ve öğrencinin gerçek gelişimi birlikte izlenir.'},
  {icon:CalendarClock,title:'Bugünü planlar',text:'Nibiru; ödev, eksik kazanım ve yaklaşan sınava göre uygulanabilir günlük rota hazırlar.'},
  {icon:ScanLine,title:'Ölçer ve anlar',text:'Optik, kamera ve sınav sonuçlarından yanlış, boş ve öğrenme açığı görünür hâle gelir.'},
  {icon:BookOpenCheck,title:'Kişiselleştirir',text:'Kişiye Özel Kitap, Sıfır Hata Kitapçığı, Mavi/Kırmızı Föy ve hedefli tekrar oluşturur.'},
  {icon:PlayCircle,title:'Doğru desteği bulur',text:'Onaylı çözüm videosunu; yoksa kazanıma uygun kısa YouTube konu anlatım adaylarını sunar.'},
  {icon:Trophy,title:'Gelişimi yaşatır',text:'Sayaçlar, görev zinciri, güvenli mini oyunlar ve kanıta dayalı ilerleme ile motivasyonu korur.'},
];

const integrations=[
  {icon:MessageCircle,label:'WhatsApp akademik kanal',text:'Öğrenci, veli ve kurum arasında doğrulanmış kimlikle çalışan güvenli akademik iletişim.',state:'Entegre',steps:['Kurum duyuru, ödev ve sınav hatırlatmasını seçer','Onaylı şablon doğru öğrenci veya veliye gider','Nibiru yanıtı rol ve veri sınırları içinde kişiselleştirir']},
  {icon:PlayCircle,label:'YouTube mikro öğrenme',text:'Yanlış veya boş sorudan doğrudan doğru video desteğine uzanan kazanım bazlı akış.',state:'Entegre',steps:['Yayınevi çözümü varsa önce kendi video çözümü açılır','Yoksa kazanıma uygun kısa ve güvenli adaylar taranır','Nibiru 5 aday içinden en uygun konu anlatımını seçer']},
  {icon:Camera,label:'Telefon kamerası + optik',text:'Kişiselleştirilmiş optik hazırlama, kamera ile cevap yakalama ve ham görseli kalıcılaştırmayan akış.',state:'Çalışan çekirdek',steps:['Öğrenci ve sınava özel optik hazırlanır','Telefon kamerası cevapları güvenli biçimde yakalar','Sonuç kazanım ve kişisel öğrenme akışına bağlanır']},
  {icon:BrainCircuit,label:'Nibiru uzman orkestrasyonu',text:'Eğitim koçu, branş öğretmeni, rehberlik, veli rehberi ve kurum içgörüsü tek kimlik altında.',state:'Aktif',steps:['Kullanıcının rolü ve sorusu anlaşılır','Doğru uzman ve model otomatik seçilir','Yanıt yalnız yetkili, doğrulanmış veriye dayanır']},
];

export function MarketingHome(){
  const [activeRole,setActiveRole]=useState<ShowcaseKey>('student');
  const [activeConversation,setActiveConversation]=useState(0);
  const [nibiruOpen,setNibiruOpen]=useState(true);
  const conversation=nibiruConversations[activeConversation];
  const role=useMemo(()=>roleShowcases[activeRole],[activeRole]);
  useEffect(()=>{
    document.title='ANUNEX — Nibiru AI Destekli Ölçme ve Analiz Platformu';
    document.documentElement.classList.add('marketing-document');
    return()=>document.documentElement.classList.remove('marketing-document');
  },[]);
  return <div className="marketing-home">
    <header className="marketing-header">
      <a href="#top" className="marketing-logo"><AnunexBrand tagline/><span className="header-nibiru"><i/><b>NIBIRU</b><small>Öğrenmenin yaşayan zekâsı</small></span></a>
      <nav aria-label="Tanıtım menüsü"><a href="#platform">Platform</a><a href="#nibiru">Nibiru</a><a href="#roller">Paneller</a><a href="#oyunlar">Mini Oyunlar</a><a href="#entegrasyon">Entegrasyonlar</a><a href="#iletisim">İletişim</a></nav>
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

      <section className="nibiru-section nibiru-planet-section" id="nibiru">
        <div className="nibiru-stage nibiru-live-stage">
          <NibiruPlanetarySystem size={560} state={nibiruOpen?'speaking':'idle'}/>
          <div className="live-signal"><i/><span>{nibiruOpen?'Nibiru bağlamı analiz ediyor':'Nibiru çevrimiçi'}</span></div>
        </div>
        <div className="nibiru-copy"><span>NIBIRU · ANUNEX’İN AKADEMİK ZEKA GEZEGENİ</span><h2>Tek bir yapay zekâ değil.<br/><em>Uzmanların ortak yörüngesi.</em></h2><p>Merkezde Nibiru; çevresinde ölçme, rehberlik, branş, veli, kurum, içerik ve video uzmanları. Kullanıcıyı, rolünü ve yalnızca yetkili verisini tanır; doğru uzmanı doğru anda devreye alır.</p>
          <div className="nibiru-tabs" role="tablist" aria-label="Nibiru örnek görüşmeleri">{nibiruConversations.map((item,index)=><button key={item.key} type="button" role="tab" aria-selected={activeConversation===index} className={activeConversation===index?'active':''} onClick={()=>{setActiveConversation(index);setNibiruOpen(true)}}>{item.label}</button>)}</div>
          <div className="nibiru-conversation multi-conversation" aria-live="polite">
            <div className="conversation-user"><span><small>{conversation.audience}</small>{conversation.question}</span><div>{conversation.initial}</div></div>
            {nibiruOpen?<div className="conversation-nibiru"><NibiruMark size={34} state="speaking"/><div><small className="identity-recognition"><ShieldCheck/> {conversation.identity}</small><strong>{conversation.title}</strong><p>{conversation.body}</p><ul>{conversation.tasks.map(task=><li key={task}><CheckCircle2/> {task}</li>)}</ul><p className="career-signoff">{conversation.signoff}</p><button type="button" onClick={()=>playNibiruVoice(conversation.key,[conversation.title,conversation.body,...conversation.tasks,conversation.signoff].join(' '))}><Volume2/> Gerçek rehber sesinden dinle</button></div></div>:<button className="ask-nibiru" type="button" onClick={()=>setNibiruOpen(true)}><Sparkles/> Nibiru’ya sor <Send/></button>}
          </div>
          <div className="nibiru-capabilities"><div><Sparkles/><span><strong>Tanır</strong><small>Rolü ve doğrulanmış bağlamı bilir</small></span></div><div><LineChart/><span><strong>Birleştirir</strong><small>Uzman zekâları tek yanıtta buluşturur</small></span></div><div><Mic2/><span><strong>İnsan gibi iletişim kurar</strong><small>Sıcak, öğretici ve güven veren ses</small></span></div><div><LockKeyhole/><span><strong>Sınırlarını korur</strong><small>Yetki, KVKK ve mahremiyet önce gelir</small></span></div></div>
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

      <section className="game-showcase" id="oyunlar"><div className="game-copy"><span>ÖĞRENMEYİ OYUNA DEĞİL · OYUNU ÖĞRENMEYE BAĞLAR</span><h2>Her oyun gerçek bir<br/><em>kazanımı güçlendirir.</em></h2><p>ANUNEX mini oyunları rastgele puan dağıtmaz. Öğrencinin eksik kazanımını, yaş grubunu ve çalışma hedefini tanır; kısa, güvenli ve ölçülebilir görevler üretir.</p><div className="game-proof"><span><CheckCircle2/> Reklamsız ve güvenli</span><span><CheckCircle2/> Kazanım bağlantılı</span><span><CheckCircle2/> Öğretmen görünürlüklü</span></div></div><div className="game-console"><div className="game-top"><div><small>EFE’NİN BUGÜNKÜ GÖREVİ</small><strong>Fonksiyon Yörüngesi</strong></div><span><Trophy/> 1.280 XP</span></div><div className="game-arena"><div className="game-orbit-track"><i/><i/><i/></div><div className="game-core"><Gamepad2/><strong>3 / 5</strong><span>Doğru eşleşme</span></div><button className="answer-chip a">f(2)=5</button><button className="answer-chip b">f(3)=7</button><button className="answer-chip c">f(4)=9</button></div><div className="game-bottom"><div><span>Günlük seri</span><strong>12 gün</strong></div><div><span>Güçlenen kazanım</span><strong>Doğrusal fonksiyon</strong></div><button>Oyunu başlat <ChevronRight/></button></div></div></section>

      <section className="marketing-section integration-section" id="entegrasyon"><div className="section-heading"><span>BAŞKA ARAÇLAR DEĞİL · TEK AKADEMİK AKIŞ</span><h2>Kimsede olmayan fark,<br/><em>özelliklerin birlikte çalışması.</em></h2><p>Her parça tek başına değil; aynı öğrenci, aynı kazanım ve aynı güvenli veri kaydı üzerinde birbirini tamamlar.</p></div><div className="integration-grid">{integrations.map(({icon:Icon,label,text,state,steps})=><article key={label}><div><Icon/><span>{state}</span></div><h3>{label}</h3><p>{text}</p><ol>{steps.map((step,index)=><li key={step}><b>0{index+1}</b><span>{step}</span></li>)}</ol></article>)}</div>
        <div className="unique-strip"><span><FileText/> Kişiye Özel Kitap</span><span><BookOpen/> Sıfır Hata Kitapçığı</span><span><Gamepad2/> Güvenli Mini Oyunlar</span><span><Monitor/> Tema & Özel Gün Yönetimi</span><span><HeartHandshake/> Rehberlik Müdahale Akışı</span></div>
      </section>

      <section className="connected-demo connected-real-stories">
        <div className="connected-heading"><span>GERÇEK İLETİŞİM · GERÇEK ÖĞRENME AKIŞI</span><h2>Nibiru yalnız cevap vermez.<br/><em>Kimi dinlediğini ve neyi koruması gerektiğini bilir.</em></h2><p>WhatsApp görüşmesi doğrulanmış veli kimliğiyle, YouTube seçimi öğrencinin gerçek sınav kazanımıyla çalışır. Hassas sonuçlar mesajda açık bırakılmaz; güvenli ANUNEX bağlantısıyla paylaşılır.</p></div>
        <div className="real-story-grid">
          <article className="whatsapp-phone-story">
            <div className="phone-hardware"><div className="phone-island"/><div className="wa-header"><button aria-label="Geri">‹</button><span className="wa-nibiru-avatar"/><div><strong>Nibiru · ANUNEX</strong><small><i/> Akademik asistan · çevrimiçi</small></div></div>
              <div className="wa-encryption"><LockKeyhole/> Mesajlar kurum politikası ve KVKK sınırlarında işlenir.</div>
              <div className="wa-chat-thread">
                <div className="wa-day">BUGÜN</div>
                <div className="wa-message outgoing m1">Merhaba Nibiru<span>10:02 ✓✓</span></div>
                <div className="wa-message incoming nibiru-message m2"><b>Nibiru</b>Merhaba Seval Hanım. Aras Bulut’un velisi olarak sizi tanıdım. Bugün size hangi konu hakkında bilgi vermemi istersiniz?<span>10:02</span></div>
                <div className="wa-message outgoing m3">Deneme sınavı sonucu açıklandı mı?<span>10:03 ✓✓</span></div>
                <div className="wa-message incoming nibiru-message m4"><b>Nibiru</b>Evet, sonuç açıklandı. Aras Bulut’un karnesini güvenli bağlantı olarak şimdi sizinle paylaştım.<button><FileText/> Karnesini güvenle aç</button><span>10:03</span></div>
                <div className="wa-message outgoing m5">Sonuçları sence nasıl?<span>10:04 ✓✓</span></div>
                <div className="wa-message incoming nibiru-message m6"><b>Nibiru</b>Son dört denemeye göre düzenli bir ilerleme görüyorum. Matematikte “çarpanlar ve katlar” kazanımında kısa tekrar yararlı olur. Sonuç tek başına bir etiket değildir; öğretmeniyle birlikte belirlenen çalışma planını izlemenizi öneririm.<span>10:04</span></div>
                <div className="wa-message outgoing m7">Teşekkür ederim.<span>10:05 ✓✓</span></div>
                <div className="wa-message incoming nibiru-message m8"><b>Nibiru</b>Rica ederim Seval Hanım. Aras Bulut’un çabasını fark etmeniz ve gelişimini baskı kurmadan desteklemeniz çok kıymetli. İhtiyaç duyduğunuzda buradayım.<span>10:05</span></div>
              </div><div className="wa-compose"><span>Mesaj</span><Mic2/></div>
            </div>
            <div className="story-explain"><span>WHATSAPP AKADEMİK KANAL</span><h3>Veli sorar; Nibiru kimliği, yetkiyi ve doğru dili birlikte korur.</h3><ul><li><CheckCircle2/> Veli ve öğrenci ilişkisi doğrulanır</li><li><CheckCircle2/> Karne açık mesaj yerine güvenli bağlantıyla paylaşılır</li><li><CheckCircle2/> Olumsuz sonuçlarda yargılayan değil, gelişimi destekleyen MEB’e uygun dil kullanılır</li></ul></div>
          </article>
          <article className="youtube-learning-story">
            <div className="youtube-result-head"><div><span>ANUNEX · SINAV SONUCU</span><h3>Matematik · Çarpanlar ve Katlar</h3><p>Aras Bulut bu kazanımda 4 sorunun 2’sinde desteğe ihtiyaç duyuyor.</p></div><span className="yt-score">2 / 4</span></div>
            <div className="nibiru-video-advice"><span className="wa-nibiru-avatar"/><div><strong>Nibiru önerisi</strong><p>Önce 4 dakika 18 saniyelik öğretmen onaylı özeti izlemeni öneriyorum. Ardından sana üç kısa kontrol sorusu hazırlayacağım.</p></div></div>
            <div className="video-candidate-list">
              {[
               ['01','Çarpanlar ve Katlar · Hızlı Konu Özeti','4:18','1,2 Mn izlenme','Öğretmen onaylı','ÖNERİLEN'],
               ['02','Asal Çarpanlara Ayırma · Pratik Yöntem','6:42','846 B izlenme','MEB kazanımıyla uyumlu',''],
               ['03','EBOB–EKOK Mantığını Anlayalım','8:05','2,1 Mn izlenme','Yaş düzeyine uygun',''],
               ['04','Yeni Nesil Çarpanlar Soruları','7:24','623 B izlenme','Soru çözümü',''],
               ['05','Çarpanlar · 5 Dakikada Tekrar','5:11','504 B izlenme','Kısa tekrar','']
              ].map(([no,title,duration,views,trust,badge])=><button type="button" className={badge?'recommended':''} key={no}><span className="yt-thumb"><PlayCircle/><small>{duration}</small></span><span className="yt-copy"><small>{no} · {trust}</small><strong>{title}</strong><em>{views}</em></span>{badge&&<b>{badge}</b>}<ChevronRight/></button>)}
            </div>
            <div className="youtube-policy"><ShieldCheck/><p><strong>Beş aday nasıl seçilir?</strong> Önce yayınevinin kendi çözümü; yoksa kazanım eşleşmesi, yaş düzeyi, süre, popülerlik, kanal güvenilirliği ve öğretmen onayı birlikte değerlendirilir. Kurum isterse yalnız kendi onaylı kanal listesini açar.</p></div>
          </article>
        </div>
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
