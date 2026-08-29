import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  containsRawCameraMedia,
  minimizeNibiruAiMessages,
  minimizeWhatsAppOutboundText,
  privacyMinimizationPolicy,
} from '../worker/lib/privacy-minimization';

const proxySource = readFileSync(new URL('../worker/lib/nibiru-ai-proxy.ts', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../worker/privacy-minimization-entry.ts', import.meta.url), 'utf8');
const voiceSource = readFileSync(new URL('../worker/nibiru-voice-entry.ts', import.meta.url), 'utf8');

describe('KVKK data minimization', () => {
  it('pseudonymizes direct student identifiers before Nibiru provider routing', () => {
    const input = [{
      role: 'user' as const,
      content: 'KULLANICI MESAJI: Ali nasıl?\nDOĞRULANMIŞ VERİ BAĞLAMI: {"student":{"id":"stu_123","first_name":"Ali","last_name":"Yılmaz","student_number":"4567","email":"ali@example.com","student_id":"stu_123"},"latestExam":{"net":12.5}}',
    }];
    const result = minimizeNibiruAiMessages(input);
    expect(result.redactions).toBeGreaterThan(0);
    expect(result.messages[0].content).not.toContain('Ali');
    expect(result.messages[0].content).not.toContain('Yılmaz');
    expect(result.messages[0].content).not.toContain('4567');
    expect(result.messages[0].content).not.toContain('ali@example.com');
    expect(result.messages[0].content).not.toContain('stu_123');
    expect(result.messages[0].content).toContain('12.5');
  });

  it('actually passes minimized messages into the multi-provider Nibiru inference call', () => {
    expect(proxySource).toContain('const minimized=minimizeNibiruAiMessages(messages)');
    expect(proxySource).toContain('runNibiruInference(env,decision,minimized.messages');
    expect(proxySource).not.toContain('runNibiruInference(env,decision,messages,{');
  });

  it('replaces academic WhatsApp detail with a secure-panel notification', () => {
    const result = minimizeWhatsAppOutboundText('Son sınav sonucu 14 net, 3 yanlış ve 1 boş.');
    expect(result.minimized).toBe(true);
    expect(result.text).toContain('güvenli panelden');
    expect(result.text).not.toContain('14 net');
    expect(result.text).not.toContain('3 yanlış');
  });

  it('keeps non-sensitive operational WhatsApp text usable', () => {
    const result = minimizeWhatsAppOutboundText('Planlı bilgilendirmeniz hazır. Lütfen Anunex panelini açın.');
    expect(result.minimized).toBe(false);
    expect(result.text).toContain('Planlı bilgilendirmeniz hazır');
  });

  it('detects raw camera media fields recursively but accepts extracted optical records', () => {
    expect(containsRawCameraMedia({ records: [{ student_number: '10', answers_by_subject: { MAT: 'ABCDE' } }] })).toBe(false);
    expect(containsRawCameraMedia({ records: [{ answers_by_subject: { MAT: 'ABCDE' }, rawFrame: 'base64...' }] })).toBe(true);
    expect(containsRawCameraMedia({ imageData: 'base64...' })).toBe(true);
  });

  it('enforces rejection of raw camera media at the top-level worker entry', () => {
    expect(entrySource).toContain('CAMERA_RAW_MEDIA_NOT_ACCEPTED');
    expect(entrySource).toContain('containsRawCameraMedia(body)');
    expect(entrySource).toContain('request.clone().json');
  });

  it('marks voice transcription as ephemeral and does not persist raw audio in application tables', () => {
    expect(entrySource).toContain("X-Anunex-Raw-Audio-Retention', 'ephemeral'");
    expect(entrySource).toContain("X-Anunex-Voiceprint', 'disabled'");
    expect(voiceSource).toContain('request.arrayBuffer()');
    expect(voiceSource).not.toMatch(/INSERT\s+INTO[^\n]*(audio|voice)/i);
    expect(voiceSource).not.toMatch(/FILES\.put\(/i);
  });

  it('keeps the agreed privacy policy explicit in code', () => {
    expect(privacyMinimizationPolicy.aiDirectIdentifiers).toBe('PSEUDONYMIZE_BEFORE_PROVIDER');
    expect(privacyMinimizationPolicy.whatsappAcademicDetail).toBe('SECURE_PANEL_NOTICE_ONLY');
    expect(privacyMinimizationPolicy.cameraRawMedia).toBe('REJECT_SERVER_UPLOAD');
    expect(privacyMinimizationPolicy.voiceRawAudio).toBe('EPHEMERAL_NO_APPLICATION_STORAGE');
    expect(privacyMinimizationPolicy.biometricIdentity).toBe('NOT_USED');
  });
});
