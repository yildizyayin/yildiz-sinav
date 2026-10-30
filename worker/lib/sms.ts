import type { Env } from '../types';
import { uuid } from './db';

/**
 * S046: one SMS door for the platform. Netgsm (Turkish operator, registered sender name) is the provider; the old
 * Twilio path stays only as a fallback for account notifications that were already wired to it. Message bodies are
 * never stored: sms_delivery_log keeps a hashed number, the purpose and the outcome.
 */
export type SmsProvider = 'NETGSM' | 'TWILIO' | null;
export type SmsResult = { ok: boolean; provider: SmsProvider; ref: string | null; error: string | null };

export function netgsmConfigured(env: Env): boolean {
  return Boolean(env.NETGSM_USERCODE && env.NETGSM_PASSWORD && env.NETGSM_HEADER);
}

export function smsProvider(env: Env): SmsProvider {
  if (netgsmConfigured(env)) return 'NETGSM';
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) return 'TWILIO';
  return null;
}

/** Codes only go through Netgsm: a Turkish operator with a registered sender, no transfer abroad. */
export function smsOtpEnabled(env: Env): boolean {
  return netgsmConfigured(env) && String(env.SMS_LOGIN_ENABLED || 'ON').toUpperCase() !== 'OFF';
}

/** A Turkish mobile number as ten digits (5XXXXXXXXX), or null. */
export function normalizeTrMobile(input: unknown): string | null {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^5\d{9}$/.test(digits) ? digits : null;
}

/** The ways the same number may have been typed into users.phone. */
export function phoneVariants(mobile: string): string[] {
  return [mobile, `0${mobile}`, `90${mobile}`, `+90${mobile}`, `0 ${mobile}`, `+90 ${mobile}`];
}

export async function sha256(value: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function phoneHash(mobile: string): Promise<string> {
  return sha256(`tr-mobile:${mobile}`);
}

async function netgsm(env: Env, path: 'otp' | 'send', body: Record<string, unknown>): Promise<SmsResult> {
  const auth = btoa(`${env.NETGSM_USERCODE}:${env.NETGSM_PASSWORD}`);
  try {
    const response = await fetch(`https://api.netgsm.com.tr/sms/rest/v2/${path}`, {
      method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await response.json<any>().catch(() => ({}));
    const code = String(payload?.code ?? '');
    if (code === '00') return { ok: true, provider: 'NETGSM', ref: String(payload.jobid || payload.jobId || '') || null, error: null };
    return { ok: false, provider: 'NETGSM', ref: null, error: `NETGSM_${code || response.status}` };
  } catch {
    return { ok: false, provider: 'NETGSM', ref: null, error: 'NETGSM_UNREACHABLE' };
  }
}

async function log(env: Env, purpose: string, userId: string | null, mobile: string, r: SmsResult) {
  await env.DB.prepare(`INSERT INTO sms_delivery_log(id,purpose,user_id,phone_hash,provider,status,provider_ref,error_code) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(uuid('sms'), purpose, userId, await phoneHash(mobile), r.provider || 'NONE', r.ok ? 'SENT' : r.provider ? 'FAILED' : 'NOT_CONFIGURED', r.ref, r.error).run().catch(() => undefined);
}

/** A one-time code. Netgsm's OTP route delivers it with priority and without İYS filtering (transactional). */
export async function sendOtpSms(env: Env, mobile: string, text: string, purpose: string, userId: string | null = null): Promise<SmsResult> {
  const r = netgsmConfigured(env)
    ? await netgsm(env, 'otp', { msgheader: env.NETGSM_HEADER, msg: text, no: mobile })
    : { ok: false, provider: null, ref: null, error: 'SMS_PROVIDER_NOT_CONFIGURED' } as SmsResult;
  await log(env, purpose, userId, mobile, r);
  return r;
}

/** An ordinary transactional message (account notices). */
export async function sendTextSms(env: Env, mobile: string, text: string, purpose: string, userId: string | null = null): Promise<SmsResult> {
  let r: SmsResult;
  if (netgsmConfigured(env)) r = await netgsm(env, 'send', { msgheader: env.NETGSM_HEADER, iysfilter: '0', messages: [{ msg: text, no: mobile }] });
  else if (smsProvider(env) === 'TWILIO') {
    const body = new URLSearchParams({ To: `+90${mobile}`, From: String(env.TWILIO_FROM_NUMBER), Body: text });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(String(env.TWILIO_ACCOUNT_SID))}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    }).catch(() => null);
    const payload = response ? await response.json<any>().catch(() => ({})) : {};
    r = response?.ok ? { ok: true, provider: 'TWILIO', ref: payload.sid || null, error: null } : { ok: false, provider: 'TWILIO', ref: null, error: `SMS_PROVIDER_${response?.status || 'UNREACHABLE'}` };
  } else r = { ok: false, provider: null, ref: null, error: 'SMS_PROVIDER_NOT_CONFIGURED' };
  await log(env, purpose, userId, mobile, r);
  return r;
}
