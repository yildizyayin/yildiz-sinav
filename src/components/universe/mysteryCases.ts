/**
 * Gizem Dosyası davaları (owner, 25–26 Nov 2026: bireysel oyun; hikâyeler sahibin PR onayıyla yayına girer).
 * A case is a story frame that fits any outcome: each clue opens when the student answers one approved question of the
 * chosen kazanım (checked on the server), and the student — not the game — decides which suspect a clue rules out.
 * Every case ends kindly: nobody did anything bad, there was a reason. Invented names, no real people or places.
 */
export type Suspect = { id: string; name: string; art: 'robot' | 'astronaut' | 'captain' | 'gardener' | 'chef' | 'engineer' | 'guide' | 'guard' | 'visitor' | 'librarian' | 'coach' | 'musician'; facts: Array<[string, string]> };
export type Clue = { title: string; found: string; rulesOut: string | null };
export type MysteryCase = { id: string; title: string; ask: string; intro: string; suspects: Suspect[]; clues: Clue[]; culprit: string; ending: string };

export const CASES: MysteryCase[] = [
  {
    id: 'uydu', title: 'Kayıp Uydu Vakası', ask: 'Uyduyu kim aldı?',
    intro: 'Nibiru İstasyonu, 15:00 ile 15:30 arası. Hava durumu uydusu laboratuvardan kayboldu. İstasyonda üç kişi vardı. İpuçlarını topla, eleyerek bul.',
    suspects: [
      { id: 'zet', name: 'Robot Zet', art: 'robot', facts: [['Kart', 'Mavi'], ['Giriş', '14:45'], ['İz', 'Tekerlek']] },
      { id: 'lara', name: 'Astronot Lara', art: 'astronaut', facts: [['Kart', 'Kırmızı'], ['Giriş', '15:20'], ['İz', 'Bot, 24 cm']] },
      { id: 'orion', name: 'Kaptan Orion', art: 'captain', facts: [['Kart', 'Kırmızı'], ['Giriş', '14:45'], ['İz', 'Bot, 30 cm']] },
    ],
    clues: [
      { title: 'Kamera kaydı', found: 'Kamera: uyduyu alanın kartı kırmızıydı.', rulesOut: 'zet' },
      { title: 'Kapı kayıtları', found: 'Kapı: uydu 15:00’te yerindeydi; alan kişi istasyona 15:00’ten sonra girdi.', rulesOut: 'orion' },
      { title: 'Ayak izi', found: 'Laboratuvar: uydunun yanındaki iz, 24 cm’lik bir bot izi.', rulesOut: null },
    ],
    culprit: 'lara',
    ending: 'Astronot Lara uyduyu çalmamış: güneş paneli kırılmış, tamir için atölyeye götürmüş ama kayıt defterine yazmayı unutmuş. Mantık zincirin kusursuzdu, dedektif!',
  },
  {
    id: 'pitir', title: 'Robot Köpek Pıtır Nerede?', ask: 'Pıtır’ı kim götürdü?',
    intro: 'Okul bahçesinin robot köpeği Pıtır, sabah 10:00 ile 11:00 arasında ortadan kayboldu. Bahçede üç kişi çalışıyordu. İpuçlarıyla eleyerek bul.',
    suspects: [
      { id: 'ada', name: 'Bahçıvan Ada', art: 'gardener', facts: [['Eldiven', 'Yeşil'], ['Geliş', '10:00'], ['Üstünde', 'Çiçek tozu']] },
      { id: 'kerem', name: 'Aşçı Kerem', art: 'chef', facts: [['Eldiven', 'Beyaz'], ['Geliş', '10:30'], ['Üstünde', 'Un']] },
      { id: 'su', name: 'Mühendis Su', art: 'engineer', facts: [['Eldiven', 'Beyaz'], ['Geliş', '10:00'], ['Üstünde', 'Makine yağı']] },
    ],
    clues: [
      { title: 'Tasmadaki lif', found: 'Pıtır’ın tasmasında beyaz bir eldiven lifi bulundu.', rulesOut: 'ada' },
      { title: 'Bahçe kamerası', found: 'Pıtır 10:15’te hâlâ bahçedeydi; onu alan kişi bahçeye 10:15’ten sonra geldi.', rulesOut: 'su' },
      { title: 'Patilerdeki iz', found: 'Pıtır’ın patilerinde beyaz bir toz var: un!', rulesOut: null },
    ],
    culprit: 'kerem',
    ending: 'Aşçı Kerem, yağmur başlayınca Pıtır ıslanmasın diye onu mutfağa almış; kurabiye pişirirken de herkese haber vermeyi unutmuş. Pıtır şimdi kurabiye kokuyor!',
  },
  {
    id: 'harita', title: 'Müzedeki Gezegen Haritası', ask: 'Haritayı kim aldı?',
    intro: 'Uzay müzesinin eski gezegen haritası vitrininden kayboldu. Müzede o sırada üç kişi vardı. İpuçlarını topla, eleyerek bul.',
    suspects: [
      { id: 'nil', name: 'Rehber Nil', art: 'guide', facts: [['Çanta', 'Sırt çantası'], ['Kat', '2. kat'], ['Ayakkabı', 'Spor']] },
      { id: 'mert', name: 'Bekçi Mert', art: 'guard', facts: [['Çanta', 'El çantası'], ['Kat', '2. kat'], ['Ayakkabı', 'Çizme']] },
      { id: 'deniz', name: 'Ziyaretçi Deniz', art: 'visitor', facts: [['Çanta', 'Sırt çantası'], ['Kat', '1. kat'], ['Ayakkabı', 'Çizme']] },
    ],
    clues: [
      { title: 'Görevlinin notu', found: 'Görevli, haritanın bir sırt çantasıyla taşındığını gördü.', rulesOut: 'mert' },
      { title: 'Kat kayıtları', found: 'Harita 2. kattaki vitrinden alındı; o saatte 1. kattakiler yukarı çıkmadı.', rulesOut: 'deniz' },
      { title: 'Vitrin önü', found: 'Vitrinin önünde spor ayakkabı izi var.', rulesOut: null },
    ],
    culprit: 'nil',
    ending: 'Rehber Nil haritayı, gelen okul grubuna yakından göstermek için almış; çocukların sorularına cevap verirken geri koymayı unutmuş. Harita yerine döndü, tur da çok güzel geçti!',
  },
  {
    id: 'kupa', title: 'Kaybolan Bilim Kupası', ask: 'Kupayı kim aldı?',
    intro: 'Okulun bilim yarışması kupası, ödül töreninden önce dolabından kayboldu. Dolabın yanında üç kişi vardı. İpuçlarıyla eleyerek bul.',
    suspects: [
      { id: 'cem', name: 'Kütüphaneci Cem', art: 'librarian', facts: [['Anahtar kart', 'Var'], ['Ceket', 'Mavi'], ['Geliş', '12:10']] },
      { id: 'duru', name: 'Antrenör Duru', art: 'coach', facts: [['Anahtar kart', 'Var'], ['Ceket', 'Sarı'], ['Geliş', '12:40']] },
      { id: 'tan', name: 'Müzisyen Tan', art: 'musician', facts: [['Anahtar kart', 'Yok'], ['Ceket', 'Sarı'], ['Geliş', '12:40']] },
    ],
    clues: [
      { title: 'Dolap kilidi', found: 'Dolap yalnız anahtar kartla açılıyor.', rulesOut: 'tan' },
      { title: 'Saat kaydı', found: 'Kupa 12:30’da hâlâ dolaptaydı.', rulesOut: 'cem' },
      { title: 'Kapıdaki iplik', found: 'Dolabın kapısına sarı bir iplik takılmış.', rulesOut: null },
    ],
    culprit: 'duru',
    ending: 'Antrenör Duru kupayı tören için parlatmaya götürmüş! Kupa şimdi pırıl pırıl ve sahnede seni bekliyor.',
  },
];

/** The same play always gets the same case; different plays get different ones. */
export function caseFor(sessionId: string, cases = CASES): MysteryCase {
  let h = 0; for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return cases[h % cases.length];
}

/** Checks a case: three suspects, three clues, each of the first two rules out one innocent suspect, the culprit is never ruled out. */
export function caseProblems(c: MysteryCase): string[] {
  const ids = new Set(c.suspects.map((s) => s.id)), out: string[] = [];
  if (c.suspects.length !== 3 || c.clues.length !== 3) out.push(`${c.id}: 3 şüpheli ve 3 ipucu olmalı`);
  if (!ids.has(c.culprit)) out.push(`${c.id}: suçlu şüpheliler arasında değil`);
  const ruled = c.clues.map((k) => k.rulesOut).filter(Boolean) as string[];
  if (ruled.length !== 2 || new Set(ruled).size !== 2) out.push(`${c.id}: ilk iki ipucu iki ayrı şüpheliyi elemeli`);
  if (ruled.includes(c.culprit)) out.push(`${c.id}: suçlu elenmemeli`);
  if (ruled.some((r) => !ids.has(r))) out.push(`${c.id}: elenen şüpheli yok`);
  if (c.clues[2]?.rulesOut !== null) out.push(`${c.id}: son ipucu suçlamaya götürmeli`);
  return out;
}
