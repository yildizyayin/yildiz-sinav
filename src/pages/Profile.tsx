import { Building2, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth, type Role } from '../auth';

export function Profile(){
  const {user,institution}=useAuth();
  if(!user)return null;
  return <>
    <div className="page-head"><div><span className="eyebrow">Hesabım</span><h1>Profil ve erişim bilgileri</h1><p>Bu sayfa hesabınızın hangi rol ve kurum kapsamında çalıştığını gösterir.</p></div></div>
    <div className="kpi-grid" style={{marginBottom:20}}>
      <Info label="Rol" value={roleName(user.role)} icon={<ShieldCheck size={18}/>}/>
      <Info label="Kurum" value={institution?.name||'Platform geneli'} icon={<Building2 size={18}/>}/>
      <Info label="Kullanıcı" value={user.username||'—'} icon={<UserRound size={18}/>}/>
      <Info label="E-posta" value={user.email||'Tanımlı değil'} icon={<Mail size={18}/>}/>
    </div>
    <div className="panel">
      <div className="panel-head"><div><h2>Erişim kapsamı</h2><p>Yetkiler sadece menüde gizlenmez; backend tarafında da rol, kurum, sınıf ve branş kapsamına göre uygulanır.</p></div><KeyRound size={20}/></div>
      <div className="cards-list">
        <Scope role={user.role}/>
        <div className="list-card"><div className="quick-icon"><ShieldCheck size={18}/></div><div><strong>Güvenli oturum</strong><span>Oturum kapatıldığında mevcut session iptal edilir. Yetkisiz API erişimleri engellenir.</span></div></div>
      </div>
    </div>
  </>;
}

function Info({label,value,icon}:{label:string;value:string;icon:React.ReactNode}){return <div className="kpi-card"><div className="quick-icon" style={{marginBottom:10}}>{icon}</div><span>{label}</span><strong style={{fontSize:18}}>{value}</strong></div>}
function Scope({role}:{role:Role}){
  const text:Record<Role,string>={
    SUPER_ADMIN:'Tüm kurumlar, sezonlar, sınav tanımları, optikler, müfredat, raporlar ve sistem ayarları.',
    INSTITUTION_MANAGER:'Yalnız kendi kurumu içindeki öğrenciler, öğretmenler, sınavlar, raporlar, optikler ve operasyonlar.',
    TEACHER:'Yalnız atandığınız sınıflar ve kendi branşınızla ilgili sonuç, kazanım, sınav ve föy verileri.',
    GUIDANCE_TEACHER:'Yalnız atandığınız sınıflardaki öğrencilerin tüm ders sonuçları ve gelişim görünümü.',
    STUDENT:'Yalnız kendi sınav sonuçlarınız, geliştirilecek kazanımlarınız, föyleriniz ve birleşik gelişim raporunuz.',
    PARENT:'Yalnız hesabınıza bağlanmış çocukların sonuç ve gelişim raporları.',
  };
  return <div className="list-card"><div className="quick-icon"><UserRound size={18}/></div><div><strong>{roleName(role)} kapsamı</strong><span>{text[role]}</span></div></div>;
}
function roleName(role:Role){return ({SUPER_ADMIN:'Süper Admin',INSTITUTION_MANAGER:'Kurum Yöneticisi',TEACHER:'Branş Öğretmeni',GUIDANCE_TEACHER:'Rehber Öğretmeni',STUDENT:'Öğrenci',PARENT:'Veli'} as const)[role]}
