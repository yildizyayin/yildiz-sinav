import type { AuthUser } from '../types';
import { resolveNibiruPageContext } from './nibiru-page-context';

export type NibiruSpecialist =
  | 'NIBIRU_CORE'
  | 'EDUCATION_COACH'
  | 'GUIDANCE_COUNSELOR'
  | 'SUBJECT_TEACHER'
  | 'PARENT_GUIDE'
  | 'INSTITUTION_INSIGHT';

export type NibiruSpecialistRoute = {
  specialist: NibiruSpecialist;
  label: string;
  reason: string;
  subjectHint: string | null;
  pageContext: ReturnType<typeof resolveNibiruPageContext>;
};

function lower(value:string){return value.toLocaleLowerCase('tr-TR').trim()}

export function detectSubjectHint(message:string):string|null{
  const m=lower(message);
  const subjects:Array<[RegExp,string]>=[
    [/(matematik|geometri|problem|cebir|sayılar)/,'Matematik'],
    [/(türkçe|paragraf|dil bilgisi|sözcük|cümle)/,'Türkçe'],
    [/(fen bilimleri|fen|fizik)/,'Fen / Fizik'],
    [/(kimya)/,'Kimya'],
    [/(biyoloji)/,'Biyoloji'],
    [/(sosyal|tarih|coğrafya|inkılap)/,'Sosyal Bilimler'],
    [/(ingilizce|english)/,'İngilizce'],
  ];
  return subjects.find(([rx])=>rx.test(m))?.[1]||null;
}

export function routeNibiruSpecialist(user:Pick<AuthUser,'role'>,message:string,context?:{pathname?:string|null}):NibiruSpecialistRoute{
  const m=lower(message);
  const subjectHint=detectSubjectHint(message);
  const pageContext=resolveNibiruPageContext(context?.pathname);
  const target=/(hedef|üniversite|bölüm|meslek|lise hedef|yks|lgs|tyt|ayt|sıralama|tercih|kaç net daha)/.test(m);
  const guidanceAssessment=/(rba|rehberlik testi|rehberlik ölçe|çalışma alışkanlık.*test|motivasyon.*test|sınav hazırlık.*test|öz değerlendirme)/.test(m);
  const plan=/(bugün ne (çalış|yap)|çalışma plan|bugünkü plan|program|kaç soru|görev|ödev plan|bu hafta ne çalış)/.test(m);
  const subjectQuestion=Boolean(subjectHint)||/(bu soru|soruyu|neden yanlış|nasıl çöz|nasıl çözer|konuyu anlat|kazanımı anlat|çözümünü anlat)/.test(m);

  if(user.role==='INSTITUTION_MANAGER'||user.role==='SUPER_ADMIN')return{specialist:'INSTITUTION_INSIGHT',label:'Kurum Akademik İçgörü AI',reason:pageContext?`${pageContext.label} bağlamında kurum/platform yönetim verisi önceliklendirildi.`:'Kurum/platform kapsamındaki akademik yönetim verisi önceliklendirildi.',subjectHint,pageContext};
  if(user.role==='PARENT')return{specialist:'PARENT_GUIDE',label:'Veli Akademik Rehber AI',reason:pageContext?`${pageContext.label} bağlamında yalnız bağlı öğrenciyi açıklayan veli uzmanı seçildi.`:'Yalnız bağlı öğrencinin gelişimini veli dilinde açıklayan uzman seçildi.',subjectHint,pageContext};
  if(user.role==='GUIDANCE_TEACHER')return{specialist:'GUIDANCE_COUNSELOR',label:'Rehber Öğretmen AI',reason:pageContext?`${pageContext.label} bağlamında rehber öğretmen uzmanı seçildi.`:'Rehber öğretmen rolünde sınıfın tüm derslerini kapsayan gelişim rotası önceliklendirildi.',subjectHint,pageContext};
  if(user.role==='TEACHER')return{specialist:'SUBJECT_TEACHER',label:subjectHint?`${subjectHint} Branş Öğretmeni AI`:'Branş Öğretmeni AI',reason:pageContext?`${pageContext.label} bağlamında atanmış branş ve sınıf kapsamı önceliklendirildi.`:'Öğretmenin atanmış branş ve sınıf kapsamı önceliklendirildi.',subjectHint,pageContext};
  if(user.role==='STUDENT'){
    if(guidanceAssessment)return{specialist:'GUIDANCE_COUNSELOR',label:'Rehber Öğretmen AI',reason:'Mesaj RBA veya rehberlik amaçlı eğitimsel öz-değerlendirme istiyor; gerçek rehber öğretmen onayı zorunlu.',subjectHint,pageContext};
    if(target||pageContext?.domain==='GUIDANCE')return{specialist:'GUIDANCE_COUNSELOR',label:'Rehber Öğretmen AI',reason:pageContext?.domain==='GUIDANCE'?`${pageContext.label} sayfa bağlamı rehberlik uzmanına yönlendirildi.`:'Mesaj hedef veya eğitimsel rehberlik rotasıyla ilgili.',subjectHint,pageContext};
    if(plan||pageContext?.domain==='COACH')return{specialist:'EDUCATION_COACH',label:'Eğitim Koçu AI',reason:pageContext?.domain==='COACH'?`${pageContext.label} sayfa bağlamı eğitim koçuna yönlendirildi.`:'Mesaj günlük/haftalık çalışma uygulaması ve görev planıyla ilgili.',subjectHint,pageContext};
    if(subjectQuestion||pageContext?.domain==='CONTENT'||pageContext?.domain==='EXAM')return{specialist:'SUBJECT_TEACHER',label:subjectHint?`${subjectHint} Branş Öğretmeni AI`:'Branş Öğretmeni AI',reason:pageContext?`${pageContext.label} bağlamı ders, soru, kazanım veya sınav uzmanına yönlendirildi.`:'Mesaj belirli bir ders, soru, konu veya kazanım açıklaması istiyor.',subjectHint,pageContext};
    return{specialist:'EDUCATION_COACH',label:'Eğitim Koçu AI',reason:'Öğrenci genel akademik gelişim sorusu günlük uygulama koçuna yönlendirildi.',subjectHint,pageContext};
  }
  return{specialist:'NIBIRU_CORE',label:'Nibiru Core',reason:'Uzman gerektirmeyen genel akademik yönlendirme.',subjectHint,pageContext};
}
