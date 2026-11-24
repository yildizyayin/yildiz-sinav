import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { runNibiruProactive } from '../worker/lib/nibiru-companion';

/**
 * Nibiru bildirimleri (owner, 24 Nov 2026): first messages for guidance events, meetings, the Sunday summary and staff
 * notices; each person can switch kinds off; phones stay quiet 22:00–08:00 (Istanbul) except for urgent guidance.
 */
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const at = (isoUtc: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(isoUtc)); };
const sqlNow = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber','x','x',1,'school'),('mgr','INSTITUTION_MANAGER','Müdür','x','x',1,'school')`);
  const texts = (uid: string) => (t.db.prepare(`SELECT text FROM nibiru_messages WHERE user_id=? ORDER BY rowid`).all(uid) as any[]).map((r) => r.text);
  const pushes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { pushes.push(String(url)); return new Response(null, { status: 201 }); }));
  const subscribe = (uid: string) => t.db.exec(`INSERT INTO nibiru_push_subscriptions(id,user_id,endpoint) VALUES('ps_${uid}','${uid}','https://web.push.apple.com/${uid}')`);
  return { t, texts, pushes, subscribe };
}

describe('Nibiru bildirim olayları', () => {
  it('writes for the weekly programme, a meeting and its reminder, to the student and the parent', async () => {
    const { t, texts } = await setup();
    const tomorrow = sqlNow(new Date(Date.now() + 20 * 3600_000));
    t.db.exec(`INSERT INTO guidance_programs(id,institution_id,student_id,week_start,status,given_at) VALUES('gp1','school','s1','2026-11-23','GIVEN',CURRENT_TIMESTAMP);
      INSERT INTO guidance_meetings(id,institution_id,counselor_id,kind,area,topic,scheduled_at) VALUES('gm1','school','gt','INDIVIDUAL','ACADEMIC','STUDY','${tomorrow}');
      INSERT INTO guidance_meeting_students(meeting_id,student_id) VALUES('gm1','s1');`);
    await runNibiruProactive(t.env);
    for (const uid of ['stuuser', 'parent']) {
      const all = texts(uid).join(' | ');
      expect(all).toMatch(/çalışma programını hazırladı/);
      expect(all).toMatch(/görüşme planladı/);
      expect(all).toMatch(/Hatırlatma: rehberlik görüşmesi/);
    }
    const before = texts('parent').length;
    await runNibiruProactive(t.env);
    expect(texts('parent')).toHaveLength(before); // once per event
  });

  it('respects “Bildirim tercihlerim”', async () => {
    const { t, texts } = await setup();
    const r = await t.request('/api/nibiru/notify-prefs', 'PUT', { GUIDANCE: false }, 'parent');
    expect(r.data.prefs).toMatchObject({ GUIDANCE: false, RESULT: true, WEEKLY: true });
    t.db.exec(`INSERT INTO guidance_programs(id,institution_id,student_id,week_start,status,given_at) VALUES('gp1','school','s1','2026-11-23','GIVEN',CURRENT_TIMESTAMP)`);
    await runNibiruProactive(t.env);
    expect(texts('parent')).toEqual([]);
    expect(texts('stuuser').join()).toMatch(/çalışma programını/);
  });

  it('keeps phones quiet at night and rings them in the morning; urgent guidance never waits', async () => {
    const { t, pushes, subscribe, texts } = await setup();
    subscribe('parent'); subscribe('gt');
    at('2026-11-24T20:30:00Z'); // 23:30 Istanbul
    t.db.exec(`INSERT INTO guidance_programs(id,institution_id,student_id,week_start,status,given_at) VALUES('gp1','school','s1','2026-11-23','GIVEN','${sqlNow(new Date())}');
      INSERT INTO guidance_messages(id,institution_id,student_id,sender_user_id,sender_role,category,body,urgent,status,created_at) VALUES('gmsg1','school','s1','stuuser','STUDENT','WORRY','yardım','1','NEW','${sqlNow(new Date())}')`);
    await runNibiruProactive(t.env);
    expect(pushes).toEqual(['https://web.push.apple.com/gt']);
    expect(texts('gt')[0]).toMatch(/Acil bir rehberlik talebi/);
    expect(t.db.prepare(`SELECT type FROM notifications WHERE recipient_user_id='gt'`).get()).toEqual({ type: 'GUIDANCE_URGENT' });
    expect(t.db.prepare(`SELECT user_id FROM nibiru_push_queue`).all()).toContainEqual({ user_id: 'parent' });
    expect(t.db.prepare(`SELECT user_id FROM nibiru_push_queue`).all()).not.toContainEqual({ user_id: 'gt' });
    at('2026-11-25T05:15:00Z'); // 08:15 Istanbul
    await runNibiruProactive(t.env);
    expect(pushes).toContain('https://web.push.apple.com/parent');
    expect(t.db.prepare(`SELECT count(*) n FROM nibiru_push_queue`).get()).toEqual({ n: 0 });
  });

  it('sends the Sunday-evening summary to parents once a week', async () => {
    const { t, texts } = await setup();
    at('2026-11-29T17:10:00Z'); // Sunday 20:10 Istanbul
    t.db.exec(`INSERT INTO guidance_study_logs(id,institution_id,student_id,log_date,source,solved) VALUES('sl1','school','s1','2026-11-26','MAVI_FOY',40),('sl2','school','s1','2026-11-27','ANUNEX',25)`);
    await runNibiruProactive(t.env);
    await runNibiruProactive(t.env);
    const weekly = texts('parent').filter((x) => x.includes('haftanın özeti'));
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toMatch(/0 gün devamsızlık, 2 gün çalışma kaydı \(65 soru\)/);
    expect(texts('stuuser').some((x) => x.includes('haftanın özeti'))).toBe(false);
  });

  it('tells super admins about a pilot application and managers about a licence ending', async () => {
    const { t, texts } = await setup();
    t.db.exec(`INSERT INTO pilot_applications(id,institution_name,city,institution_type,contact_name,phone,kvkk_version) VALUES('pa1','Deneme Ortaokulu','Konya','DEVLET_OKULU','Yetkili','05550000000','v1');
      INSERT OR REPLACE INTO institution_licenses(id,institution_id,plan_code,status,license_expires_at) VALUES('lic1','school','ANNUAL','ACTIVE',datetime('now','+6 days'))`);
    await runNibiruProactive(t.env);
    expect(texts('admin')[0]).toMatch(/Yeni pilot okul başvurusu: \*\*Deneme Ortaokulu\*\*, Konya/);
    expect(texts('mgr')[0]).toMatch(/lisansınızın bitmesine \*\*(5|6) gün\*\* kaldı/);
    expect(t.db.prepare(`SELECT type FROM notifications WHERE recipient_user_id='mgr'`).get()).toEqual({ type: 'LICENSE_EXPIRING' });
  });
});
