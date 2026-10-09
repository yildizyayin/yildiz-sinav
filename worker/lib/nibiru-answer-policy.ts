// A bounded final guard, independent of the model's system prompt. This is not
// comprehensive pedagogical certification or a replacement for teacher review.
export function checkNibiruAnswer(text:string){
 const value=text.normalize('NFKC').toLocaleLowerCase('tr-TR');
 const rules:Array<[string,RegExp]>=[
  ['OFFICIAL_IMPERSONATION',/meb\s+(?:çalışanıyım|temsilcisiyim|yetkilisiyim)|mill[iî]\s+eğitim\s+bakanlığı(?:nın|'nın)?\s+(?:çalışanıyım|temsilcisiyim)/u],
  ['DIAGNOSTIC_CLAIM',/(?:tanısı|tanısını)\s+(?:koydum|koyuyorum|koyarım)|(?:kesinlikle|kesin olarak)\s+(?:dehb|adhd|depresyon|otizm)\s+(?:var|hastasısın)/u],
  ['STUDENT_LABEL',/(?:sen|siz|bu öğrenci|öğrencin|çocuğun|çocuğunuz)\s+(?:tembelsin(?:iz)?|başarısızsın(?:ız)?|yetersizsin(?:iz)?|tembeldir|başarısızdır|yetersizdir)/u],
  ['RAW_PERSONAL_IDENTIFIER',/(?<!\d)\d{11}(?!\d)/u],
 ];
 const reason=rules.find(([,pattern])=>pattern.test(value))?.[0]||null;
 return{ok:reason===null,reason};
}

export const NIBIRU_SAFE_ANSWER='Nibiru: Bu yanıtı güvenilir bir akademik açıklama olarak sunamıyorum. Doğrulanmış sınav ve çalışma verileriyle gelişime açık alanları birlikte değerlendirebiliriz.';
