import type { Role } from '../auth';

export type NibiruUiContext={pathname:string;pageKey:string;label:string;prompts:string[]};
const rules:Array<[RegExp,string,string,string[]]>=[
 [/^\/academic-target/,'ACADEMIC_TARGET','Hedef ve Tercih Robotu',['Bu sayfadaki hedeflerimi nasıl değerlendirmeliyim?','Tercih listemde nelere dikkat etmeliyim?']],
 [/^\/guidance/,'GUIDANCE','Rehberlik Ölçekleri',['Bu sayfadaki süreci açıkla','Sonraki güvenli adım nedir?']],
 [/^\/student-growth/,'STUDENT_GROWTH','Gelişim Yolculuğu',['Gelişim verilerimi özetle','Bugün hangi alana öncelik vereyim?']],
 [/^\/assignments/,'ASSIGNMENTS','Ödevler',['Bu sayfadaki ödevleri önceliklendir','Eksik işler için kısa plan oluştur']],
 [/^\/(wrong-answers|outcomes|worksheets|worksheet|content-center|my-books)/,'LEARNING_CONTENT','İçerik ve Öğrenme',['Bu sayfadaki içerikleri nasıl kullanmalıyım?','Gelişime açık kazanımı açıkla']],
 [/^\/(exam|my-results|optical|camera-test|calibration)/,'EXAM','Sınav ve Optik',['Bu sayfadaki sonuçları özetle','Kontrol etmem gereken bir durum var mı?']],
 [/^\/attendance/,'ATTENDANCE','Yoklama ve Devamsızlık',['Bu sayfadaki devam durumunu özetle','Takip gerektiren durumu açıkla']],
 [/^\/(students|classes|children|institutions|enterprise|users|teacher-assignments)/,'INSTITUTION','Kurum ve Kullanıcılar',['Bu sayfadaki durumu özetle','Bir sonraki yönetim adımı nedir?']],
 [/^\/(reports|weekly-summary)/,'REPORTS','Raporlar',['Bu raporun önemli noktalarını açıkla','Hangi göstergeyi önce izlemeliyim?']],
 [/^\/(licenses|premium|feature-lab|standard-readiness|scale|transfers)/,'SYSTEM','Platform ve Lisans',['Bu sayfadaki durumu özetle','Eksik veya riskli adım var mı?']],
];
const rolePrompt:Record<Role,string>={SUPER_ADMIN:'Platformda şu an neye öncelik vermeliyim?',INSTITUTION_MANAGER:'Kurumum için sıradaki işlem nedir?',TEACHER:'Sınıfım için neye öncelik vermeliyim?',GUIDANCE_TEACHER:'Öğrenci gelişiminde neyi incelemeliyim?',STUDENT:'Bugün ne çalışmalıyım?',PARENT:'Çocuğumun gelişiminde neyi izlemeliyim?'};
export function nibiruUiContext(pathname:string,role:Role):NibiruUiContext{const path=String(pathname||'/').split('?')[0],matched=rules.find(([rx])=>rx.test(path));return matched?{pathname:path,pageKey:matched[1],label:matched[2],prompts:[...matched[3],rolePrompt[role]]}:{pathname:path,pageKey:path==='/'?'HOME':'OTHER',label:path==='/'?'Ana Sayfa':'Bulunduğunuz Sayfa',prompts:[rolePrompt[role],'Bu sayfada bana nasıl yardımcı olabilirsin?']}}
