import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { handleWhatsAppMessage, PAIRING_FAILURE_LIMIT } from '../worker/nibiru-license-entry';

/** A068: WhatsApp identity — pairing-code guessing is limited per phone; only a valid code links a number. Synthetic data only. */
const sha = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, '0')).join('');
let n = 0;
const msg = (from: string, text: string) => ({ from, id: `wamid.${++n}`, type: 'text', text });

describe('A068 WhatsApp pairing limit', () => {
  it('stops checking codes after repeated wrong attempts from one number', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE nibiru_settings SET enabled=1,whatsapp_enabled=1 WHERE id='platform'`);
    t.db.prepare(`INSERT INTO nibiru_pairing_codes(id,user_id,code_hash,expires_at,created_by) VALUES('pc1','parent',?,?,'admin')`).run(await sha('482913'), new Date(Date.now() + 15 * 60000).toISOString());
    const guesser = '905550000001';
    for (let k = 0; k < PAIRING_FAILURE_LIMIT; k++) await handleWhatsAppMessage(t.env as any, msg(guesser, `BAĞLA ${String(100000 + k)}`));
    await handleWhatsAppMessage(t.env as any, msg(guesser, 'BAĞLA 482913'));
    expect(t.db.prepare(`SELECT count(*) c FROM nibiru_whatsapp_identities WHERE phone_e164=?`).get(guesser)).toMatchObject({ c: 0 });
    expect(t.db.prepare(`SELECT used_at FROM nibiru_pairing_codes WHERE id='pc1'`).get()).toMatchObject({ used_at: null });
    // the right person on their own number still links
    // earlier successful links do not count against a number
    for (let k = 0; k < PAIRING_FAILURE_LIMIT; k++) t.db.prepare(`INSERT INTO nibiru_pairing_attempts(id,phone_e164,succeeded) VALUES(?,?,1)`).run(`ok${k}`, '905550000002');
    await handleWhatsAppMessage(t.env as any, msg('905550000002', 'BAĞLA 482913'));
    expect(t.db.prepare(`SELECT user_id FROM nibiru_whatsapp_identities WHERE phone_e164='905550000002'`).get()).toMatchObject({ user_id: 'parent' });
    expect(t.db.prepare(`SELECT count(*) c FROM nibiru_pairing_attempts WHERE succeeded=1`).get()).toMatchObject({ c: PAIRING_FAILURE_LIMIT + 1 });
  });
});
