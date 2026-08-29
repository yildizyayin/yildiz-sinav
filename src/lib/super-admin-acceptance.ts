export type SuperAdminAcceptanceItem={
  key:string;
  title:string;
  detail:string;
  evidence:string;
  path:string;
};

export const SUPER_ADMIN_ACCEPTANCE:SuperAdminAcceptanceItem[]=[
  {key:'VISIBILITY',title:'Görünürlük ve tek merkez menü',detail:'Süper Admin modülleri aranabilir, gruplanabilir ve favorilenebilir menüde görünür.',evidence:'33 yönetim rotası + ana kontrol merkezi',path:'/'},
  {key:'AUTHORIZATION',title:'Rol ve backend yetkisi',detail:'Ekran rotaları RoleGate ile, yönetim API’leri ayrıca backend rol kontrolüyle korunur.',evidence:'SUPER_ADMIN istemci kapısı + sunucu doğrulaması',path:'/profile'},
  {key:'SCOPE',title:'Kurum kapsamı ve global yönetim',detail:'Kurum verisiyle çalışan ortak ekranlar Süper Admin için zorunlu kurum seçimi uygular.',evidence:'Yoklama, ödev, öğrenci, kullanıcı, optik, rapor ve toplu işlem kapsamı',path:'/institutions'},
  {key:'EMPTY_ERROR',title:'Boş ve hata durumları',detail:'Veri bulunmadığında yönlendirici boş durum; API hatasında görünür hata mesajı gösterilir.',evidence:'İlk kurum kurulumu + modül bazlı boş/hata panelleri',path:'/'},
  {key:'MOBILE',title:'Mobil ve dar ekran kullanımı',detail:'Menü alt mobil çubuğa dönüşür; formlar, kartlar ve operasyon ızgaraları tek kolona iner.',evidence:'760 px ve altı responsive kabul kuralları',path:'/'},
  {key:'PRACTICALITY',title:'Günlük işlem pratikliği',detail:'Kurum/demo, lisans, sınav, optik, Nibiru ve rapor işlemleri ana ekrandan tek adımda açılır.',evidence:'Öncelikli işlemler ve canlı operasyon KPI’ları',path:'/'},
  {key:'EXPORT',title:'Yazdırma, PDF ve CSV',detail:'Birleşik rapor CSV indirilebilir; tarayıcı yazdırma akışı PDF üretimini destekler.',evidence:'Yetki yeniden doğrulanarak dışa aktarım',path:'/reports'},
  {key:'AUDIT_SESSION',title:'Denetim izi ve güvenli çıkış',detail:'Kritik yazma ve rapor dışa aktarım işlemleri denetlenir; mevcut veya tüm cihaz oturumları sonlandırılabilir.',evidence:'Audit kaydı + üst/yan çıkış + Profil Güvenlik Merkezi',path:'/profile'},
];
