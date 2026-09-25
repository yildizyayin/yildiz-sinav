import type { Env } from '../types';
import { all, one, uuid } from './db';

export type AccountNotificationChannel = 'EMAIL' | 'SMS';
export type AccountNotificationRecipient = {
  userId: string;
  displayName: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  password: string;
};

const CHANNELS: AccountNotificationChannel[] = ['EMAIL', 'SMS'];
const APP_URL = 'https://app.anunex.com/login';

function secret(env: Env): string | null {
  return env.ACCOUNT_NOTIFICATION_SECRET || env.SESSION_SECRET || null;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function cryptoKey(env: Env): Promise<CryptoKey> {
  const value = secret(env);
  if (!value) throw new Error('ACCOUNT_NOTIFICATION_SECRET_MISSING');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptCredential(env: Env, password: string): Promise<string | null> {
  if (!secret(env)) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), new TextEncoder().encode(password));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

async function decryptCredential(env: Env, value: string): Promise<string> {
  const [iv, encrypted] = value.split('.');
  if (!iv || !encrypted) throw new Error('CREDENTIAL_CIPHERTEXT_INVALID');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) as unknown as BufferSource }, await cryptoKey(env), decode(encrypted) as unknown as BufferSource);
  return new TextDecoder().decode(plain);
}

export function normalizeNotificationChannels(value: unknown): AccountNotificationChannel[] {
  if (!Array.isArray(value)) return [...CHANNELS];
  const selected = value.map((item) => String(item).trim().toUpperCase()).filter((item): item is AccountNotificationChannel => CHANNELS.includes(item as AccountNotificationChannel));
  return [...new Set(selected)];
}

export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#';
  const alphabet = `${upper}${lower}${digits}${symbols}`;
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const password = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
    ...Array.from(bytes.slice(4), (byte) => alphabet[byte % alphabet.length]),
  ];
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swap = bytes[index % bytes.length] % (index + 1);
    [password[index], password[swap]] = [password[swap], password[index]];
  }
  return password.join('');
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('90')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+90${digits.slice(1)}`;
  return value.trim();
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function identifier(recipient: AccountNotificationRecipient): string {
  return recipient.username || recipient.email || recipient.phone || 'hesabınız';
}

function messageText(institutionName: string, recipient: AccountNotificationRecipient, password: string): string {
  return [
    'Anunex hesap bilgileriniz oluşturuldu.',
    `Kurum: ${institutionName}`,
    `Kullanıcı: ${identifier(recipient)}`,
    `Geçici şifre: ${password}`,
    `Giriş: ${APP_URL}`,
    'İlk girişinizden sonra şifrenizi değiştirin.',
  ].join('\n');
}

async function sendEmail(env: Env, destination: string, institutionName: string, recipient: AccountNotificationRecipient, password: string) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM_ADDRESS) return { ok: false, reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  const text = messageText(institutionName, recipient, password);
  const html = text.split('\n').map((line) => `<p>${htmlEscape(line)}</p>`).join('');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM_ADDRESS, to: [destination], subject: 'Anunex giriş bilgileriniz', text, html }),
  });
  const payload = await response.json<any>().catch(() => ({}));
  return response.ok ? { ok: true, messageId: payload.id || null } : { ok: false, reason: `EMAIL_PROVIDER_${response.status}` };
}

async function sendSms(env: Env, destination: string, institutionName: string, recipient: AccountNotificationRecipient, password: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) return { ok: false, reason: 'SMS_PROVIDER_NOT_CONFIGURED' };
  const body = new URLSearchParams({ To: destination, From: env.TWILIO_FROM_NUMBER, Body: messageText(institutionName, recipient, password) });
  const authorization = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const payload = await response.json<any>().catch(() => ({}));
  return response.ok ? { ok: true, messageId: payload.sid || null } : { ok: false, reason: `SMS_PROVIDER_${response.status}` };
}

async function updateBatchStatus(env: Env, batchId: string) {
  const counts = await one<{ total: number; sent: number; failed: number; skipped: number; pending: number }>(env.DB.prepare(`
    SELECT count(*) total,
      sum(CASE WHEN status='SENT' THEN 1 ELSE 0 END) sent,
      sum(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed,
      sum(CASE WHEN status='SKIPPED' THEN 1 ELSE 0 END) skipped,
      sum(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending
    FROM account_notification_deliveries WHERE batch_id=?
  `).bind(batchId));
  const status = (counts?.pending || 0) > 0 ? 'PENDING' : (counts?.failed || 0) > 0 || (counts?.skipped || 0) > 0 ? 'PARTIAL' : 'COMPLETED';
  await env.DB.prepare(`UPDATE account_notification_batches SET status=?,completed_at=CASE WHEN ?='PENDING' THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=?`).bind(status, status, batchId).run();
  return { status, total: counts?.total || 0, sent: counts?.sent || 0, failed: counts?.failed || 0, skipped: counts?.skipped || 0 };
}

export async function createAccountNotificationBatch(env: Env, actorId: string, institutionId: string, recipients: AccountNotificationRecipient[], requestedChannels: unknown) {
  const channels = normalizeNotificationChannels(requestedChannels);
  const batchId = uuid('anb');
  const institution = await one<{ name: string }>(env.DB.prepare('SELECT name FROM institutions WHERE id=?').bind(institutionId));
  const statements: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO account_notification_batches(id,institution_id,created_by,recipient_count) VALUES(?,?,?,?)`).bind(batchId, institutionId, actorId, recipients.length)];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  for (const recipient of recipients) {
    const encrypted = await encryptCredential(env, recipient.password);
    for (const channel of channels) {
      const destination = channel === 'EMAIL' ? recipient.email : normalizePhone(recipient.phone);
      statements.push(env.DB.prepare(`INSERT INTO account_notification_deliveries(id,batch_id,user_id,institution_id,channel,destination,credential_ciphertext,credential_expires_at,status,failure_code) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
        uuid('and'), batchId, recipient.userId, institutionId, channel, destination, encrypted, expiresAt, destination ? 'PENDING' : 'SKIPPED', destination ? null : 'DESTINATION_MISSING',
      ));
    }
  }

  await env.DB.batch(statements);
  return dispatchAccountNotificationBatch(env, batchId, institution?.name || 'Anunex kurumu');
}

export async function dispatchAccountNotificationBatch(env: Env, batchId: string, institutionName?: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT d.*,u.display_name,u.username,u.email,u.phone FROM account_notification_deliveries d JOIN users u ON u.id=d.user_id WHERE d.batch_id=? AND d.status IN ('PENDING','FAILED') ORDER BY d.created_at`).bind(batchId));
  const institution = institutionName || (await one<{ name: string }>(env.DB.prepare(`SELECT i.name FROM account_notification_batches b JOIN institutions i ON i.id=b.institution_id WHERE b.id=?`).bind(batchId)))?.name || 'Anunex kurumu';
  for (const row of rows) {
    if (!row.destination) continue;
    await env.DB.prepare(`UPDATE account_notification_deliveries SET attempt_count=attempt_count+1,attempted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
    let result: { ok: boolean; reason?: string; messageId?: string | null };
    try {
      if (!row.credential_ciphertext || !row.credential_expires_at || new Date(row.credential_expires_at).getTime() <= Date.now()) throw new Error('CREDENTIAL_EXPIRED');
      const password = await decryptCredential(env, row.credential_ciphertext);
      const recipient: AccountNotificationRecipient = { userId: row.user_id, displayName: row.display_name, username: row.username, email: row.email, phone: row.phone, password };
      result = row.channel === 'EMAIL' ? await sendEmail(env, row.destination, institution, recipient, password) : await sendSms(env, row.destination, institution, recipient, password);
    } catch (error) {
      result = { ok: false, reason: error instanceof Error ? error.message : 'DELIVERY_ERROR' };
    }
    await env.DB.prepare(`UPDATE account_notification_deliveries SET status=?,provider_message_id=?,failure_code=?,sent_at=CASE WHEN ?='SENT' THEN CURRENT_TIMESTAMP ELSE sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.ok ? 'SENT' : 'FAILED', result.messageId || null, result.ok ? null : result.reason || 'DELIVERY_FAILED', result.ok ? 'SENT' : 'FAILED', row.id).run();
  }
  return updateBatchStatus(env, batchId);
}

export async function listAccountNotificationDeliveries(env: Env, institutionId: string, limit = 100) {
  return all<any>(env.DB.prepare(`SELECT d.id,d.batch_id,d.user_id,d.channel,d.destination,d.status,d.attempt_count,d.provider_message_id,d.failure_code,d.attempted_at,d.sent_at,d.created_at,u.display_name,u.role FROM account_notification_deliveries d JOIN users u ON u.id=d.user_id WHERE d.institution_id=? ORDER BY d.created_at DESC LIMIT ?`).bind(institutionId, Math.max(1, Math.min(limit, 500))));
}
