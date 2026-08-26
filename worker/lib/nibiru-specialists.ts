import type { AuthUser } from '../types';

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

export function routeNibiruSpecialist(user:Pick<AuthUser,'role'>,message:string):NibiruSpecialistRoute{
  const m=lower(message);
  const subjectHint=detectSubjectHint(message);
  const target=/(hedef|üniversite|bölüm|meslek|lise hedef|yks|lgs|tyt|ayt|sıralama|tercih|kaç net daha)/.test(m);
  const plan=/(bugün ne (çalış|yap)|çalışma plan|bugünkü plan|program|kaç soru|görev|ödev plan|bu hafta ne çalış)/.test(m);
  const subjectQuestion=Boolean(subjectHint)||/(bu soru|soruyu|neden yanlış|nasıl çöz|nasıl çözer|konuyu anlat|kazanımı anlat|çözümünü anlat)/.test(m);

  if(user.role==='INSTITUTION_MANAGER'||user.role==='SUPER_ADMIN')return{specialist:'INSTITUTION_INSIGHT',label:'Kurum Akademik İçgörü AI',reason:'Kurum/platform kapsamındaki akademik yönetim verisi önceliklendirildi.',subjectHint};
  if(user.role==='PARENT')return{specialist:'PARENT_GUIDE',label:'Veli Akademik Rehber AI',reason:'Yalnız bağlı öğrencinin gelişimini veli dilinde açıklayan uzman seçildi.',subjectHint};
  if(user.role==='GUIDANCE_TEACHER')return{specialist:'GUIDANCE_COUNSELOR',label:'Rehber Öğretmen AI',reason:'Rehber öğretmen rolünde sınıfın tüm derslerini kapsayan gelişim rotası önceliklendirildi.',subjectHint};
  if(user.role==='TEACHER')return{specialist:'SUBJECT_TEACHER',label:subjectHint?`${subjectHint} Branş Öğretmeni AI`:'Branş Öğretmeni AI',reason:'Öğretmenin atanmış branş ve sınıf kapsamı önceliklendirildi.',subjectHint};
  if(user.role==='STUDENT'){
    if(target)return{specialist:'GUIDANCE_COUNSELOR',label:'Rehber Öğretmen AI',reason:'Mesaj hedef, LGS/YKS, üniversite/bölüm veya ilerleme rotasıyla ilgili.',subjectHint};
    if(plan)return{specialist:'EDUCATION_COACH',label:'Eğitim Koçu AI',reason:'Mesaj günlük/haftalık çalışma uygulaması ve görev planıyla ilgili.',subjectHint};
    if(subjectQuestion)return{specialist:'SUBJECT_TEACHER',label:subjectHint?`${subjectHint} Branş Öğretmeni AI`:'Branş Öğretmeni AI',reason:'Mesaj belirli bir ders, soru, konu veya kazanım açıklaması istiyor.',subjectHint};
    return{specialist:'EDUCATION_COACH',label:'Eğitim Koçu AI',reason:'Öğrenci genel akademik gelişim sorusu günlük uygulama koçuna yönlendirildi.',subjectHint};
  }
  return{specialist:'NIBIRU_CORE',label:'Nibiru Core',reason:'Uzman gerektirmeyen genel akademik yönlendirme.',subjectHint};
}
