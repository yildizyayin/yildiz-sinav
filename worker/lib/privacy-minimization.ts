export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const DIRECT_IDENTIFIER_JSON_KEYS = [
  'first_name',
  'last_name',
  'display_name',
  'student_number',
  'email',
  'phone',
  'username',
  'student_id',
  'user_id',
  'parent_user_id',
  'actor_user_id',
  'requester_user_id',
  'subject_user_id',
  'subject_student_id',
  'tckn',
  'tc_no',
  'national_id',
  'address',
  'birth_date',
] as const;

const RAW_CAMERA_KEYS = new Set([
  'image',
  'imagedata',
  'imagebase64',
  'base64',
  'photo',
  'frame',
  'frames',
  'rawimage',
  'rawframe',
  'rawframes',
  'video',
  'face',
  'faceimage',
]);

const ACADEMIC_DETAIL_PATTERN = /\b(net|puan|doğru|yanlış|boş|sıralama|yüzde|başarı|başarı oranı|kazanım|zayıf|eksik|deneme sonucu|sınav sonucu)\b/iu;
const SECURE_WHATSAPP_NOTICE = 'Anunex’te yeni bir akademik bilgilendirme var. Ayrıntıları güvenli panelden görüntüleyebilirsiniz.';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectKnownIdentifiers(messages: AiMessage[]): string[] {
  const values = new Set<string>();
  const keys = DIRECT_IDENTIFIER_JSON_KEYS.join('|');
  const jsonPattern = new RegExp(`"(?:${keys})"\\s*:\\s*"([^"]+)"`, 'giu');
  for (const message of messages) {
    for (const match of message.content.matchAll(jsonPattern)) {
      const value = String(match[1] || '').trim();
      if (value.length >= 3) values.add(value);
    }
    for (const email of message.content.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu)) values.add(email[0]);
    for (const nationalId of message.content.matchAll(/(?<!\d)\d{11}(?!\d)/g)) values.add(nationalId[0]);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

export function redactDirectIdentifiers(text: string, knownIdentifiers: string[] = []): { text: string; redactions: number } {
  let output = String(text || '');
  let redactions = 0;
  const keys = DIRECT_IDENTIFIER_JSON_KEYS.join('|');
  const jsonPattern = new RegExp(`("(?:${keys})"\\s*:\\s*)"[^"]*"`, 'giu');
  output = output.replace(jsonPattern, (_match, prefix) => {
    redactions++;
    return `${prefix}"[PSEUDONYMIZED]"`;
  });
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, () => {
    redactions++;
    return '[PSEUDONYMIZED_EMAIL]';
  });
  output = output.replace(/(?<!\d)\d{11}(?!\d)/g, () => {
    redactions++;
    return '[PSEUDONYMIZED_ID]';
  });
  for (const value of knownIdentifiers) {
    if (!value || value.startsWith('[PSEUDONYMIZED')) continue;
    const pattern = new RegExp(escapeRegExp(value), 'giu');
    output = output.replace(pattern, () => {
      redactions++;
      return '[PSEUDONYMIZED]';
    });
  }
  return { text: output, redactions };
}

export function minimizeNibiruAiMessages(messages: AiMessage[]): { messages: AiMessage[]; redactions: number } {
  const knownIdentifiers = collectKnownIdentifiers(messages);
  let redactions = 0;
  const minimized = messages.map(message => {
    const result = redactDirectIdentifiers(message.content, knownIdentifiers);
    redactions += result.redactions;
    return { ...message, content: result.text };
  });
  return { messages: minimized, redactions };
}

export function minimizeWhatsAppOutboundText(text: string): { text: string; minimized: boolean } {
  const value = String(text || '').trim();
  if (!value) return { text: '', minimized: false };
  const containsEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value);
  const containsNationalId = /(?<!\d)\d{11}(?!\d)/.test(value);
  if (ACADEMIC_DETAIL_PATTERN.test(value) || containsEmail || containsNationalId) {
    return { text: SECURE_WHATSAPP_NOTICE, minimized: true };
  }
  return { text: value, minimized: false };
}

export function containsRawCameraMedia(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsRawCameraMedia);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLocaleLowerCase('en-US').replace(/[_-]/g, '');
    if (RAW_CAMERA_KEYS.has(normalized)) return true;
    if (child && typeof child === 'object' && containsRawCameraMedia(child)) return true;
  }
  return false;
}

export const privacyMinimizationPolicy = Object.freeze({
  aiDirectIdentifiers: 'PSEUDONYMIZE_BEFORE_PROVIDER',
  whatsappAcademicDetail: 'SECURE_PANEL_NOTICE_ONLY',
  cameraRawMedia: 'REJECT_SERVER_UPLOAD',
  voiceRawAudio: 'EPHEMERAL_NO_APPLICATION_STORAGE',
  biometricIdentity: 'NOT_USED',
});
