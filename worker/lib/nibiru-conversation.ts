/**
 * Nibiru sohbet katmanı (owner, 11 Nov 2026: "merhaba diyorum aynı, nasılsın diyorum aynı"). Without a language model
 * (the external AI stays closed until its KVKK review and DPA are done), every message used to fall through to the
 * same exam summary. This layer answers everyday conversation itself — greetings, how are you, thanks, who are you,
 * what can you do, goodbye, a low mood — in the user's role and the student's age group, with a few varied phrasings,
 * and offers clickable next questions. Pure functions: no data is read or invented here.
 */
export type ConversationKind = 'GREETING' | 'HOW_ARE_YOU' | 'THANKS' | 'WHO' | 'CAPABILITIES' | 'BYE' | 'LOW_MOOD';
export type ConversationContext = { role: string; firstName?: string | null; gradeLevel?: number | null; hour?: number };

const clean = (m: string) => m.toLocaleLowerCase('tr-TR').replace(/[!?.,;:…"'()]+/g, ' ').replace(/\s+/g, ' ').trim();

const PATTERNS: Array<[ConversationKind, RegExp]> = [
  // 13 Nov 2026: a low mood inside a longer sentence ('canım sıkkın hiç ders çalışmak istemiyorum') counts too
  ['LOW_MOOD', /(sıkıldım|yoruldum|bıktım|canım sıkkın|canım sıkılıyor|moralim bozuk|üzgünüm|(ders )?çalışmak istemiyorum|çalışasım yok|motivasyonum yok|motive olamıyorum|stresliyim|çok gerginim)/],
  ['HOW_ARE_YOU', /^(merhaba |selam |slm |hey )?(nasılsın|nasılsınız|naber|ne haber|nbr|iyi misin|ne var ne yok|keyifler nasıl|naptın|napıyorsun|ne yapıyorsun)( nibiru)?$/],
  ['THANKS', /^(çok )?(teşekkürler|teşekkür ederim|teşekkür ederiz|teşekkürler nibiru|sağ ol|sağol|sağolun|sağ olun|eyvallah|tşk|tşkler|eline sağlık|harikasın|süpersin)( nibiru)?$/],
  ['BYE', /^(görüşürüz|hoşça kal|hoşçakal|bay bay|bye|güle güle|kendine iyi bak|iyi geceler|iyi akşamlar görüşürüz|sonra görüşürüz)( nibiru)?$/],
  ['WHO', /^(sen kimsin|kimsin|adın ne|senin adın ne|nibiru kim|nibiru nedir|nibiru ne|sen ne(sin)?|sen bir robot musun|yapay zeka mısın|insan mısın)$/],
  ['CAPABILITIES', /^(ne yapabilirsin|neler yapabilirsin|nibiru neler yapabilir|neler yapabilir|sana ne sorabilirim|ne sorabilirim|yardım|yardım et|bana yardım et|nasıl yardımcı olursun|ne işe yararsın)$/],
  ['GREETING', /^(merhaba|merhabalar|selam|selamlar|slm|sa|selamün aleyküm|selamünaleyküm|günaydın|iyi günler|iyi akşamlar|tünaydın|hey|hello|hi|alo)( nibiru)?$/],
];

export function conversationKind(message: string): ConversationKind | null {
  const m = clean(message);
  if (!m || m.length > 60) return null;
  for (const [kind, re] of PATTERNS) if (re.test(m)) return kind;
  return null;
}

/** The questions Nibiru can answer from verified data, per role — the same phrases its intent rules recognise. */
export function nextQuestions(role: string): string[] {
  switch (role) {
    case 'STUDENT': return ['Bugün ne çalışayım?', 'Son sınavım nasıl geçti?', 'Hangi kazanımlarda zorlanıyorum?'];
    case 'PARENT': return ['Çocuğum nasıl?', 'Son sınav ne oldu?', 'Hangi konuda zorlanıyor?'];
    case 'TEACHER': case 'GUIDANCE_TEACHER': return ['Sınıfım nasıl?', 'Hangi kazanımlarda zorlanılıyor?', 'Bugün ne oldu?'];
    case 'INSTITUTION_MANAGER': return ['Kurumum nasıl?', 'Bugün ne oldu?', 'Son sınav ne oldu?'];
    default: return ['Bugün ne oldu?', 'Kurumum nasıl?'];
  }
}

const pick = <T,>(list: T[], rnd: () => number) => list[Math.floor(rnd() * list.length) % list.length];
const young = (c: ConversationContext) => c.role === 'STUDENT' && (c.gradeLevel ?? 8) <= 6;
const timeHello = (hour: number) => hour < 11 ? 'Günaydın' : hour < 18 ? 'Merhaba' : 'İyi akşamlar';

export function conversationAnswer(kind: ConversationKind, c: ConversationContext, rnd: () => number = Math.random): { answer: string; suggestions: string[] } {
  const name = c.firstName ? ` ${c.firstName}` : '';
  const hour = c.hour ?? new Date(Date.now() + 3 * 3600_000).getUTCHours();
  const student = c.role === 'STUDENT', parent = c.role === 'PARENT', staff = !student && !parent;
  const kid = young(c);
  const offer = student
    ? pick(kid ? ['Bugün birlikte hangi gezegene uçalım?', 'İstersen bugünkü görevlerine birlikte bakalım.', 'Hadi, bugün ne öğrenmek istersin?'] : ['Bugün neye bakalım?', 'İstersen bugünkü çalışma planına birlikte bakalım.', 'Sınavların, kazanımların ya da bugünkü planın hakkında sorabilirsin.'], rnd)
    : parent ? pick(['Çocuğunuzun gelişimiyle ilgili neye bakalım?', 'Son sınavı ya da desteğe ihtiyaç duyduğu konuları birlikte inceleyebiliriz.'], rnd)
      : pick(['Bugün neye bakalım?', 'Sınıf ve kazanım verilerinden neyi özetleyeyim?', 'Doğrulanmış verilerden neyi inceleyelim?'], rnd);
  let answer: string;
  switch (kind) {
    case 'GREETING':
      answer = pick([`${timeHello(hour)}${name}! ${offer}`, `Merhaba${name}, hoş geldin${staff || parent ? 'iz' : ''}. ${offer}`, `Selam${name}! Ben buradayım. ${offer}`], rnd);
      break;
    case 'HOW_ARE_YOU':
      answer = pick([
        `İyiyim, sorduğun${staff || parent ? 'uz' : ''} için teşekkürler${name}! ${student ? 'Sen nasılsın? ' : ''}${offer}`,
        `Gayet iyiyim, verilerin başında bekliyorum${name}. ${student ? 'Senin günün nasıl geçiyor? ' : ''}${offer}`,
        `Harikayım${name}, yeni bir şeyler öğrenmeye hazırım. ${offer}`], rnd);
      break;
    case 'THANKS':
      answer = pick([`Rica ederim${name}! ${student ? 'Böyle devam!' : 'Her zaman buradayım.'}`, `Ne demek${name}, yardımcı olabildiysem ne mutlu.`, `Asıl ben teşekkür ederim${name}. Başka bir şeye bakmak ister${staff || parent ? 'siniz' : 'sin'} mi?`], rnd);
      break;
    case 'BYE':
      answer = pick([`Görüşmek üzere${name}! ${student ? 'Kısa bir mola da çalışmanın parçası.' : 'İyi çalışmalar.'}`, `Hoşça kal${name}. İstediğin${staff || parent ? 'iz' : ''} zaman buradayım.`, `Kendine iyi bak${name}! Tekrar görüşelim.`], rnd);
      break;
    case 'WHO':
      answer = `Ben Nibiru, ANUNEX'in akademik rehberiyim. ${student ? 'Sınav sonuçlarını, kazanımlarını ve çalışma planını anlamana yardım ediyorum; Öğrenme Evreni\'nde de sana eşlik ediyorum.' : parent ? 'Çocuğunuzun doğrulanmış sınav ve kazanım verilerini sade bir dille açıklıyorum.' : 'Sınıf ve kurum verilerini doğrulanmış kayıtlardan özetliyorum.'} Yalnız sistemdeki gerçek verilere dayanırım; bilmediğim bir şeyi uydurmam.`;
      break;
    case 'CAPABILITIES':
      answer = student ? `Şunlarda yardımcı olabilirim${name}: son sınavını açıklamak, zorlandığın kazanımları bulmak, bugün için kısa bir çalışma planı çıkarmak. Aşağıdakilerden birine dokunabilirsin.`
        : parent ? 'Çocuğunuzun son sınavını, gelişimini ve desteğe ihtiyaç duyduğu konuları açıklayabilirim. Aşağıdan bir soru seçebilirsiniz.'
          : 'Sınıf ve kurum özetleri, zorlanılan kazanımlar ve günün durumu hakkında doğrulanmış verilerle yanıt verebilirim. Aşağıdan bir soru seçebilirsiniz.';
      break;
    case 'LOW_MOOD':
      answer = student
        ? pick([`Anlıyorum${name}, böyle günler herkese olur. İstersen sadece 10 dakikalık küçük bir görevle başlayalım; bitirince kendini daha iyi hissedebilirsin. Bu his uzun sürerse ailenle ya da rehber öğretmeninle konuşmak da iyi gelir.`,
          `Yorulman çok normal${name}. Kısa bir mola ver, su iç, sonra istersen en kolay görevinden başlayalım. Kendini sık sık böyle hissediyorsan rehber öğretmeninle konuşmayı unutma.`], rnd)
        : 'Anlıyorum. Kısa bir mola iyi gelebilir; hazır olduğunuzda kaldığımız yerden devam ederiz.';
      break;
  }
  return { answer: `Nibiru: ${answer}`, suggestions: nextQuestions(c.role) };
}

/** When a question is not understood and no language model is available: say so and offer what can be answered. */
export function clarifyAnswer(c: ConversationContext, outOfScope = false, rnd: () => number = Math.random) {
  const you = c.role === 'STUDENT' ? 'sin' : 'siniz';
  const answer = outOfScope
    ? `Nibiru: Bu konu benim alanımın dışında kalıyor. Ben sınavlar, kazanımlar ve çalışma planı hakkında yardımcı oluyorum; aşağıdakilerden birini sorabilir${you}.`
    : pick([`Nibiru: Bunu tam anlayamadım. Şöyle sorabilir${you}:`, `Nibiru: Sorunu doğru anladığımdan emin olamadım. Şunlardan birini mi demek iste${c.role === 'STUDENT' ? 'din' : 'diniz'}?`, `Nibiru: Bunu biraz daha açık yazabilir mi${you}? Örneğin:`], rnd);
  return { answer, suggestions: nextQuestions(c.role) };
}
