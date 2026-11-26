/**
 * Kaçış Odası odaları (owner, 26 Nov 2026: bireysel oyun; odalar sahibin PR onayıyla yayına girer). A room fits any
 * outcome: each of its three objects hides one approved question of the chosen kazanım; answering it (right or wrong —
 * a wrong answer shows the right one first) reveals that object's digit, and the door's sign says in which order the
 * digits go. No clock, no pressure; the puzzle is noticing and ordering.
 */
export type RoomObject = { id: string; name: string; art: 'panel' | 'map' | 'tank' | 'clock' | 'book' | 'plant' | 'toolbox' | 'battery' | 'screen' };
export type EscapeRoom = { id: string; title: string; intro: string; objects: RoomObject[]; sign: string[]; ending: string };

export const ROOMS: EscapeRoom[] = [
  {
    id: 'kapsul', title: 'Uzay Kapsülü',
    intro: 'Kapsülün kapısı kilitlendi! Üç cihazın içinde kodun rakamları saklı. Her cihazı bir soruyla açabilirsin; sırası sende.',
    objects: [{ id: 'panel', name: 'Kontrol paneli', art: 'panel' }, { id: 'map', name: 'Yıldız haritası', art: 'map' }, { id: 'tank', name: 'Oksijen tüpü', art: 'tank' }],
    sign: ['tank', 'panel', 'map'],
    ending: 'Kapı açıldı ve kapsülün penceresinden Dünya göründü. Görev tamam, kaptan!',
  },
  {
    id: 'kule', title: 'Kütüphane Kulesi',
    intro: 'Kulenin kapısı eski bir şifreyle kapalı. Rakamlar odadaki üç eşyada saklı. Her eşyayı bir soruyla açabilirsin; sırası sende.',
    objects: [{ id: 'clock', name: 'Duvar saati', art: 'clock' }, { id: 'book', name: 'Kalın kitap', art: 'book' }, { id: 'plant', name: 'Saksı bitkisi', art: 'plant' }],
    sign: ['book', 'plant', 'clock'],
    ending: 'Kapı gıcırdayarak açıldı ve merdivenler kulenin tepesindeki gözlemevine çıktı. Harika iş!',
  },
  {
    id: 'atolye', title: 'Robot Atölyesi',
    intro: 'Atölyenin kapısı robot kilidiyle kapandı. Kodun rakamları üç parçanın içinde. Her parçayı bir soruyla açabilirsin; sırası sende.',
    objects: [{ id: 'toolbox', name: 'Alet çantası', art: 'toolbox' }, { id: 'battery', name: 'Dev pil', art: 'battery' }, { id: 'screen', name: 'Robot ekranı', art: 'screen' }],
    sign: ['screen', 'toolbox', 'battery'],
    ending: 'Kapı açıldı ve atölyenin robotu sana el salladı: “Teşekkürler, beni de kurtardın!”',
  },
];

const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** The same play always gets the same room and the same digits (1–9); different plays differ. */
export function roomFor(sessionId: string, rooms = ROOMS): { room: EscapeRoom; digits: Record<string, number> } {
  const room = rooms[hash(sessionId) % rooms.length];
  const digits = Object.fromEntries(room.objects.map((o, k) => [o.id, 1 + (hash(`${sessionId}:${o.id}:${k}`) % 9)]));
  return { room, digits };
}

export function roomProblems(r: EscapeRoom): string[] {
  const ids = r.objects.map((o) => o.id), out: string[] = [];
  if (ids.length !== 3) out.push(`${r.id}: 3 eşya olmalı`);
  if (r.sign.length !== 3 || new Set(r.sign).size !== 3 || r.sign.some((x) => !ids.includes(x))) out.push(`${r.id}: kapı işareti üç eşyayı birer kez saymalı`);
  if (r.sign.every((x, k) => x === ids[k])) out.push(`${r.id}: kapı sırası eşyaların duruş sırasıyla aynı olmamalı`);
  return out;
}
