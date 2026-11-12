// Rehberlik merkezi: Turkish labels shared by the guidance screens (owner, 12 Nov 2026).
export const KIND: Record<string, string> = { INDIVIDUAL: 'Bireysel', GROUP: 'Grup', PARENT: 'Veli', TEACHER: 'Öğretmen' };
export const AREA: Record<string, string> = { ACADEMIC: 'Akademik', CAREER: 'Kariyer', SOCIAL_EMOTIONAL: 'Sosyal-duygusal' };
export const TOPIC: Record<string, string> = {
  STUDY: 'Ders çalışma', EXAM: 'Sınav ve deneme', ATTENDANCE: 'Devamsızlık', EXAM_ANXIETY: 'Sınav kaygısı', PEER_BULLYING: 'Akran zorbalığı',
  SCREEN: 'Ekran kullanımı', FAMILY: 'Aile', FRIENDS: 'Arkadaşlık', CAREER: 'Meslek ve tercih', HEALTH: 'Sağlık', OTHER: 'Diğer',
};
export const TOPIC_AREA: Record<string, string> = { STUDY: 'ACADEMIC', EXAM: 'ACADEMIC', ATTENDANCE: 'ACADEMIC', EXAM_ANXIETY: 'SOCIAL_EMOTIONAL', PEER_BULLYING: 'SOCIAL_EMOTIONAL', SCREEN: 'SOCIAL_EMOTIONAL', FAMILY: 'SOCIAL_EMOTIONAL', FRIENDS: 'SOCIAL_EMOTIONAL', CAREER: 'CAREER', HEALTH: 'SOCIAL_EMOTIONAL', OTHER: 'ACADEMIC' };
export const MEETING_STATUS: Record<string, string> = { PLANNED: 'Planlandı', DONE: 'Yapıldı', CANCELLED: 'İptal' };
export const MESSAGE_CATEGORY: Record<string, string> = { TALK: 'Konuşmak istiyorum', PEER_BULLYING: 'Akran zorbalığı', STUDY: 'Ders ve çalışma', FAMILY: 'Aile', WORRY: 'Endişe / kaygı', OTHER: 'Diğer' };
export const MESSAGE_STATUS: Record<string, string> = { NEW: 'Yeni', SEEN: 'Görüldü', CLOSED: 'Kapandı' };
export const SENDER: Record<string, string> = { STUDENT: 'Öğrenci', PARENT: 'Veli', TEACHER: 'Öğretmen' };
export const SIGNAL: Record<string, string> = { ATTENDANCE: 'Devamsızlık', NET_DROP: 'Net düşüşü', SUPPORT_LOOP: 'Destek döngüsü', MESSAGE: 'Rehberlik mesajı', PROGRAM: 'Haftalık program' };

export const dateTr = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const timeTr = (local?: string | null) => (local && local.length >= 16 ? local.slice(11, 16) : '');
export const nowLocal = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
export const properCase = (name?: string | null) => (name || '').toLocaleLowerCase('tr-TR').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toLocaleUpperCase('tr-TR'));
