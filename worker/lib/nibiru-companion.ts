import type { AuthUser, Env } from '../types';
import { getAuthUser } from './auth';
import { all, json, one, uuid } from './db';
import { publishedForLearnersSql } from './exam-schedule';
import { studentAcademicContext } from './nibiru';

/** One clock for every time window here: the Worker's own time, so a window never depends on the database's clock
 *  (and a check run with a set time sees the same windows). Built by us, never from input. */
const sqlClock = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/**
 * Nibiru veli uygulaması 2 (owner, 24 Nov 2026: "önerdiğin sırayla hepsini tek seferde yap"):
 *  1. the conversation is kept, like WhatsApp — every question and answer is saved and comes back when Nibiru opens;
 *  2. Nibiru writes first when something happens (a result is published, an absence) and the phone is notified;
 *  3. answers about results and topics carry small cards (net and trend, topic bars);
 *  4. every answer can be rated 👍/👎, and the super admin sees the 👎 ones;
 *  5. parents asking how to help at home get the guidance teacher's approved notes as cards.
 * Phone notifications carry no text: the phone shows "Nibiru · Yeni bir mesajınız var", details stay in ANUNEX.
 */

export type NibiruCard =
  | { type: 'RESULT'; title: string; date: string | null; net: number | null; percent: number | null; delta: number | null; trend: number[] }
  | { type: 'TOPICS'; items: { subject: string; title: string; percent: number }[] }
  | { type: 'GUIDE'; items: { id: string; title: string; body: string; url: string | null }[] };

const KEEP_DAYS = 180;
const pct = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n <= 1 ? n * 100 : n) : 0; };
const round2 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** The student this person may talk about, or null. */
export async function conversationStudent(env: Env, user: AuthUser, requested?: string | null): Promise<string | null> {
  if (user.role === 'STUDENT') return user.student_id || null;
  if (user.role !== 'PARENT') return null;
  const links = await all<{ student_id: string }>(env.DB.prepare(`SELECT student_id FROM parent_student_links WHERE parent_user_id=? AND active=1 ORDER BY rowid`).bind(user.id));
  if (requested && links.some((l) => l.student_id === requested)) return requested;
  return links[0]?.student_id || null;
}

// ---------------------------------------------------------------------------------------------------- cards
const RESULT_WORDS = /\b(net|puan|sonu[çc]|deneme|s[ıi]nav|nas[ıi]l gidiyor|geli[şs]im|durum)/i;
const TOPIC_WORDS = /(zorlan|zay[ıi]f|eksik|konu|kazan[ıi]m|hangi ders)/i;
const GUIDE_TOPICS: [RegExp, string][] = [
  [/(kayg[ıi]|stres|korku|panik|gergin)/i, 'EXAM_ANXIETY'],
  [/(ekran|telefon|tablet|oyun|sosyal medya|internet)/i, 'SCREEN'],
  [/(uyku|uyum|gece ge[çc])/i, 'SLEEP'],
  [/(zorbal[ıi]k|dalga ge[çc]|itiliyor|d[öo]v[üu]l)/i, 'PEER_BULLYING'],
  [/(arkada[şs])/i, 'FRIENDS'],
  [/(evde|destek|yard[ıi]m|motivasyon|[çc]al[ıi][şs]m[ıi]yor|ders [çc]al[ıi][şs]|al[ıi][şs]kanl[ıi]k|plan)/i, 'STUDY'],
];

export async function buildCards(env: Env, user: AuthUser, studentId: string | null, message: string, intent?: string | null): Promise<NibiruCard[]> {
  if (!studentId || !['PARENT', 'STUDENT'].includes(user.role)) return [];
  const cards: NibiruCard[] = [];
  const wantResult = ['LATEST_EXAM', 'STUDENT_GENERAL'].includes(String(intent)) || RESULT_WORDS.test(message);
  const wantTopics = String(intent) === 'WEAK_OUTCOMES' || TOPIC_WORDS.test(message);
  if (wantResult || wantTopics) {
    const ctx: any = await studentAcademicContext(env, studentId, user.institution_id, true);
    if (wantResult && ctx.latestExam) cards.push(resultCard(ctx.exams));
    if (wantTopics && ctx.weakOutcomes?.length) cards.push({ type: 'TOPICS', items: ctx.weakOutcomes.slice(0, 4).map((w: any) => ({ subject: String(w.subject_name || ''), title: String(w.title || '').replace(/\.$/, ''), percent: pct(w.avg_success) })) });
  }
  if (user.role === 'PARENT') {
    const topic = GUIDE_TOPICS.find(([re]) => re.test(message))?.[1];
    if (topic) { const guide = await guideCard(env, user, topic); if (guide) cards.push(guide); }
  }
  return cards;
}

function resultCard(exams: any[]): NibiruCard {
  const latest = exams[0];
  const prev = exams[1];
  const net = round2(latest.net);
  return { type: 'RESULT', title: String(latest.title || 'Son sınav'), date: latest.exam_date || null, net, percent: latest.success_percent == null ? null : pct(latest.success_percent),
    delta: net != null && prev && prev.net != null ? round2(net - Number(prev.net)) : null,
    trend: exams.slice(0, 6).map((e: any) => round2(e.net)).filter((n: number | null): n is number => n != null).reverse() };
}

/** Notes the guidance teacher approved and shared with this parent's school or class. */
async function guideCard(env: Env, user: AuthUser, topic: string): Promise<NibiruCard | null> {
  if (!user.institution_id) return null;
  const classIds = (await all<any>(env.DB.prepare(`SELECT e.class_id FROM parent_student_links l JOIN student_enrollments e ON e.student_id=l.student_id AND e.status='ACTIVE' WHERE l.parent_user_id=? AND l.active=1`).bind(user.id))).map((r) => r.class_id).filter(Boolean);
  const marks = classIds.length ? classIds.map(() => '?').join(',') : "''";
  const rows = await all<any>(env.DB.prepare(`SELECT DISTINCT r.id,r.title,r.body,r.url FROM guidance_resources r JOIN guidance_resource_shares s ON s.resource_id=r.id AND s.institution_id=?
    WHERE r.active=1 AND r.review_status='APPROVED' AND r.audience='PARENT' AND r.topic=? AND (s.class_id IS NULL OR s.class_id IN (${marks})) ORDER BY s.shared_at DESC LIMIT 2`).bind(user.institution_id, topic, ...classIds)).catch(() => []);
  return rows.length ? { type: 'GUIDE', items: rows.map((r) => ({ id: r.id, title: String(r.title), body: String(r.body).slice(0, 600), url: r.url || null })) } : null;
}

// ---------------------------------------------------------------------------------------------------- history
async function saveMessage(env: Env, userId: string, studentId: string | null, author: 'USER' | 'NIBIRU', text: string, payload: any = null, origin: 'CHAT' | 'PROACTIVE' = 'CHAT') {
  const id = uuid('nbm');
  await env.DB.prepare(`INSERT INTO nibiru_messages(id,user_id,student_id,author,origin,text,payload_json,read_at) VALUES(?,?,?,?,?,?,?,${origin === 'PROACTIVE' ? 'NULL' : 'CURRENT_TIMESTAMP'})`)
    .bind(id, userId, studentId, author, origin, text.slice(0, 6000), payload ? JSON.stringify(payload) : null).run();
  return id;
}

const asMessage = (r: any) => { const p = r.payload_json ? JSON.parse(r.payload_json) : {}; return { id: r.id, role: r.author === 'USER' ? 'user' : 'assistant', text: r.text, at: Date.parse(String(r.created_at).replace(' ', 'T') + 'Z'), origin: r.origin, feedback: r.feedback ?? null, cards: p.cards || undefined, actions: p.actions || undefined, suggestions: p.suggestions || undefined, specialist: p.specialist || undefined }; };

async function history(env: Env, user: AuthUser, url: URL) {
  const studentId = await conversationStudent(env, user, url.searchParams.get('studentId'));
  const rows = await all<any>(env.DB.prepare(`SELECT * FROM (SELECT rowid rn,id,author,origin,text,payload_json,feedback,created_at FROM nibiru_messages WHERE user_id=? AND coalesce(student_id,'')=coalesce(?,'') ORDER BY rowid DESC LIMIT 80) ORDER BY rn`).bind(user.id, studentId));
  await env.DB.prepare(`UPDATE nibiru_messages SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND coalesce(student_id,'')=coalesce(?,'') AND read_at IS NULL`).bind(user.id, studentId).run();
  return json({ ok: true, studentId, messages: rows.map(asMessage) });
}

/** POST /api/nibiru/chat passes through here: the question and the answer are kept, cards are added. */
async function chat(request: Request, env: Env, user: AuthUser, inner: (r: Request) => Promise<Response>) {
  const body = await request.clone().json().catch(() => ({})) as any;
  const message = String(body?.message || '').trim();
  const response = await inner(request);
  if (!response.ok || !message || !response.headers.get('content-type')?.includes('application/json')) return response;
  const payload: any = await response.clone().json().catch(() => null);
  if (!payload || typeof payload.answer !== 'string') return response;
  try {
    const studentId = await conversationStudent(env, user, body?.studentId || payload.studentId);
    const cards = await buildCards(env, user, studentId, message, payload.intent).catch(() => []);
    await saveMessage(env, user.id, studentId, 'USER', message);
    const extra = { cards: cards.length ? cards : undefined, actions: payload.actions, suggestions: payload.suggestions, specialist: payload.orchestration?.label || payload.orchestration?.specialistLabel };
    const messageId = await saveMessage(env, user.id, studentId, 'NIBIRU', payload.answer.replace(/^\s*Nibiru\s*:\s*/, ''), extra);
    return json({ ...payload, messageId, cards: extra.cards }, response.status);
  } catch (error) {
    console.error(JSON.stringify({ event: 'nibiru_history_save_failed', error: String(error) }));
    return response;
  }
}

async function feedback(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const value = Number(b?.value);
  if (![1, -1, 0].includes(value) || typeof b?.messageId !== 'string') return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Geçersiz değerlendirme.' } }, 400);
  const r = await env.DB.prepare(`UPDATE nibiru_messages SET feedback=?,feedback_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND author='NIBIRU'`).bind(value || null, b.messageId, user.id).run();
  if (!r.meta?.changes) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Mesaj bulunamadı.' } }, 404);
  return json({ ok: true });
}

/** Super admin: how answers are rated, and the latest 👎 with the question that led to it (no names). */
async function feedbackSummary(env: Env) {
  const totals = await one<any>(env.DB.prepare(`SELECT sum(feedback=1) up, sum(feedback=-1) down, count(*) answers FROM nibiru_messages WHERE author='NIBIRU' AND created_at>=datetime('${sqlClock()}','-30 days')`));
  const down = await all<any>(env.DB.prepare(`SELECT m.id,m.text answer,m.feedback_at,u.role,(SELECT q.text FROM nibiru_messages q WHERE q.user_id=m.user_id AND q.author='USER' AND q.created_at<=m.created_at ORDER BY q.created_at DESC, q.rowid DESC LIMIT 1) question
    FROM nibiru_messages m JOIN users u ON u.id=m.user_id WHERE m.feedback=-1 ORDER BY m.feedback_at DESC LIMIT 30`));
  return json({ ok: true, totals: { up: Number(totals?.up || 0), down: Number(totals?.down || 0), answers: Number(totals?.answers || 0) }, down: down.map((d) => ({ ...d, answer: String(d.answer).slice(0, 400), question: String(d.question || '').slice(0, 200) })) });
}

async function unread(env: Env, user: AuthUser) {
  const r = await one<{ n: number }>(env.DB.prepare(`SELECT count(*) n FROM nibiru_messages WHERE user_id=? AND read_at IS NULL`).bind(user.id));
  return json({ ok: true, unread: Number(r?.n || 0) });
}

// ---------------------------------------------------------------------------------------------------- push
const b64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The platform's own notification key: made once, kept in D1, no account or payment anywhere. */
export async function vapidKeys(env: Env) {
  const row = await one<any>(env.DB.prepare(`SELECT public_key,private_jwk FROM nibiru_push_keys WHERE id='vapid'`));
  if (row) return { publicKey: String(row.public_key), privateJwk: JSON.parse(row.private_jwk) };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicKey = b64url(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  await env.DB.prepare(`INSERT OR IGNORE INTO nibiru_push_keys(id,public_key,private_jwk) VALUES('vapid',?,?)`).bind(publicKey, JSON.stringify(privateJwk)).run();
  return vapidKeys(env);
}

async function vapidHeader(env: Env, endpoint: string) {
  const { publicKey, privateJwk } = await vapidKeys(env);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:destek@anunex.com' })}`;
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64url(sig)}, k=${publicKey}`;
}

const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//i;

/** Wakes every phone of this person; the phone writes the notification itself. */
export async function pushUser(env: Env, userId: string) {
  const subs = await all<any>(env.DB.prepare(`SELECT id,endpoint FROM nibiru_push_subscriptions WHERE user_id=?`).bind(userId));
  let sent = 0;
  for (const s of subs) {
    const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, s.endpoint), TTL: '86400', Urgency: 'normal', 'Content-Length': '0' } }).catch(() => null);
    if (res && res.status < 300) { sent++; await env.DB.prepare(`UPDATE nibiru_push_subscriptions SET last_ok_at=CURRENT_TIMESTAMP,fail_count=0 WHERE id=?`).bind(s.id).run(); }
    else if (res && (res.status === 404 || res.status === 410)) await env.DB.prepare(`DELETE FROM nibiru_push_subscriptions WHERE id=?`).bind(s.id).run();
    else await env.DB.prepare(`UPDATE nibiru_push_subscriptions SET fail_count=fail_count+1 WHERE id=?`).bind(s.id).run();
  }
  await env.DB.prepare(`DELETE FROM nibiru_push_subscriptions WHERE user_id=? AND fail_count>=5`).bind(userId).run();
  return sent;
}

async function subscribe(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const endpoint = String(b?.endpoint || '');
  if (!PUSH_HOSTS.test(endpoint) || endpoint.length > 1000) return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Bildirim adresi geçersiz.' } }, 400);
  if (request.method === 'DELETE') { await env.DB.prepare(`DELETE FROM nibiru_push_subscriptions WHERE endpoint=? AND user_id=?`).bind(endpoint, user.id).run(); return json({ ok: true }); }
  await env.DB.prepare(`INSERT INTO nibiru_push_subscriptions(id,user_id,endpoint) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,fail_count=0`).bind(uuid('nps'), user.id, endpoint).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------------------------------- Nibiru writes first
/** Which choice in "Bildirim tercihlerim" a first message belongs to. */
export const NOTIFY_CATEGORY: Record<string, 'RESULT' | 'ABSENCE' | 'GUIDANCE' | 'MEETING' | 'WEEKLY' | 'STAFF'> = {
  RESULT: 'RESULT', ABSENCE: 'ABSENCE', PROGRAM: 'GUIDANCE', SCREEN: 'GUIDANCE', RESOURCE: 'GUIDANCE', SURVEY: 'GUIDANCE', MESSAGE_SEEN: 'GUIDANCE',
  MEETING: 'MEETING', MEETING_SOON: 'MEETING', WEEKLY: 'WEEKLY', URGENT: 'STAFF', PILOT: 'STAFF', LICENSE: 'STAFF',
};
export const NOTIFY_CATEGORIES = ['RESULT', 'ABSENCE', 'GUIDANCE', 'MEETING', 'WEEKLY', 'STAFF'] as const;

async function wants(env: Env, userId: string, kind: string) {
  const row = await one<{ enabled: number }>(env.DB.prepare(`SELECT enabled FROM nibiru_notify_prefs WHERE user_id=? AND category=?`).bind(userId, NOTIFY_CATEGORY[kind] || 'GUIDANCE')).catch(() => null);
  return row ? row.enabled === 1 : true;
}

async function firstMessage(env: Env, userId: string, studentId: string | null, kind: string, refId: string, text: string, payload: any) {
  if (!(await wants(env, userId, kind))) return false;
  const claimed = await env.DB.prepare(`INSERT OR IGNORE INTO nibiru_proactive_log(user_id,kind,ref_id) VALUES(?,?,?)`).bind(userId, kind, refId).run();
  if (!claimed.meta?.changes) return false;
  await saveMessage(env, userId, studentId, 'NIBIRU', text, payload, 'PROACTIVE');
  return true;
}

/** Cron: results published in the last three days and today's absences become Nibiru's first message. */
export async function runNibiruProactive(env: Env, limit = 200) {
  const people = new Set<string>();
  const results = await all<any>(env.DB.prepare(`SELECT ep.student_id,e.id exam_id,e.title,s.first_name,er.net,dp.published_at,
      (SELECT group_concat(u.id) FROM users u WHERE u.student_id=ep.student_id AND u.role='STUDENT' AND u.active=1) student_users,
      (SELECT group_concat(l.parent_user_id) FROM parent_student_links l WHERE l.student_id=ep.student_id AND l.active=1) parent_users
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id JOIN student_entities s ON s.id=ep.student_id
    JOIN exam_delivery_profiles dp ON dp.exam_id=e.id
    WHERE ${publishedForLearnersSql('e.id')} AND datetime(coalesce(dp.result_publish_at,dp.published_at))>=datetime('${sqlClock()}','-3 days') LIMIT ?`).bind(limit)).catch(() => []);
  for (const r of results) {
    const ctx: any = await studentAcademicContext(env, r.student_id, null, true).catch(() => null);
    const card = ctx?.exams?.length ? resultCard(ctx.exams) : null;
    const delta = card && card.type === 'RESULT' && card.delta != null ? `, bir önceki sınava göre ${card.delta >= 0 ? '+' : ''}${String(card.delta).replace('.', ',')}` : '';
    const net = r.net == null ? '' : `: **${String(round2(r.net)).replace('.', ',')} net**${delta}`;
    for (const uid of String(r.parent_users || '').split(',').filter(Boolean)) {
      if (await firstMessage(env, uid, r.student_id, 'RESULT', r.exam_id, `${r.first_name}’nin **${r.title}** sonucu açıklandı${net}. Ayrıntılara birlikte bakmak ister misiniz?`, { cards: card ? [card] : undefined, suggestions: ['Hangi konularda zorlanıyor?', 'Evde nasıl destek olabilirim?'] })) people.add(uid);
    }
    for (const uid of String(r.student_users || '').split(',').filter(Boolean)) {
      if (await firstMessage(env, uid, r.student_id, 'RESULT', r.exam_id, `**${r.title}** sonucun açıklandı${net}. İstersen zorlandığın konulara birlikte bakalım.`, { cards: card ? [card] : undefined, suggestions: ['Hangi konularda zorlanıyorum?', 'Bugün ne çalışayım?'] })) people.add(uid);
    }
  }
  const absences = await all<any>(env.DB.prepare(`SELECT DISTINCT r.student_id,ps.attendance_date,s.first_name,(SELECT group_concat(l.parent_user_id) FROM parent_student_links l WHERE l.student_id=r.student_id AND l.active=1) parent_users
    FROM attendance_period_records r JOIN attendance_period_sessions ps ON ps.id=r.session_id JOIN student_entities s ON s.id=r.student_id
    WHERE r.attendance_status='ABSENT' AND ps.session_type='DAILY' AND ps.status IN ('COMPLETED','CORRECTED') AND ps.attendance_date=date('${sqlClock()}','+3 hours') LIMIT ?`).bind(limit)).catch(() => []);
  for (const a of absences) for (const uid of String(a.parent_users || '').split(',').filter(Boolean)) {
    if (await firstMessage(env, uid, a.student_id, 'ABSENCE', `${a.student_id}:${a.attendance_date}`, `Bilgilendirme: ${a.first_name} bugün okulda **devamsız** olarak işaretlendi. Bir yanlışlık olduğunu düşünüyorsanız okulla iletişime geçebilirsiniz.`, { suggestions: ['Bu dönem kaç gün devamsızlık var?'] })) people.add(uid);
  }
  const urgent = new Set<string>();
  await moreEvents(env, people, urgent, limit).catch((error) => console.error(JSON.stringify({ event: 'nibiru_events_failed', error: String(error) })));
  const pushed = await notifyPhones(env, people, urgent);
  await env.DB.prepare(`DELETE FROM nibiru_messages WHERE created_at<datetime('${sqlClock()}','-${KEEP_DAYS} days')`).run().catch(() => undefined);
  return { people: people.size, pushed };
}

// ---------------------------------------------------------------------------------------------------- phones and quiet hours
export const istanbulHour = (now = Date.now()) => new Date(now + 3 * 3600_000).getUTCHours();
export const quietNow = (now = Date.now()) => { const h = istanbulHour(now); return h >= 22 || h < 8; };

/** Phones ring now, except between 22:00 and 08:00: then they wait until morning (urgent guidance never waits). */
async function notifyPhones(env: Env, people: Set<string>, urgent: Set<string>) {
  let pushed = 0;
  const quiet = quietNow();
  for (const uid of people) {
    if (quiet && !urgent.has(uid)) { await env.DB.prepare(`INSERT OR IGNORE INTO nibiru_push_queue(user_id) VALUES(?)`).bind(uid).run(); continue; }
    pushed += await pushUser(env, uid).catch(() => 0);
  }
  if (!quiet) {
    const waiting = await all<{ user_id: string }>(env.DB.prepare(`SELECT user_id FROM nibiru_push_queue LIMIT 200`));
    for (const w of waiting) { pushed += await pushUser(env, w.user_id).catch(() => 0); await env.DB.prepare(`DELETE FROM nibiru_push_queue WHERE user_id=?`).bind(w.user_id).run(); }
  }
  return pushed;
}

// ---------------------------------------------------------------------------------------------------- more first messages
const parentsOf = async (env: Env, studentId: string) => (await all<{ id: string }>(env.DB.prepare(`SELECT parent_user_id id FROM parent_student_links WHERE student_id=? AND active=1`).bind(studentId))).map((r) => r.id);
const studentUsersOf = async (env: Env, studentId: string) => (await all<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE student_id=? AND role='STUDENT' AND active=1`).bind(studentId))).map((r) => r.id);
/** A meeting time as the counsellor typed it — Istanbul local time without a zone ("2026-11-24T17:00"). */
export const fmtDate = (v: string) => { const t = String(v).replace(' ', 'T'); const d = new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t.length === 16 ? `${t}:00` : t}+03:00`); return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' }); };

/** Staff see these in the bell too; the text never names a student. */
async function bell(env: Env, userId: string, institutionId: string | null, type: string, title: string, body: string, url: string, entityId: string) {
  await env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uuid('ntf'), userId, institutionId, type, title, body, url, 'NIBIRU', entityId).run().catch(() => undefined);
}

/**
 * The owner's list of 24 Nov 2026: from the guidance teacher (weekly programme given, screen diary asked, a note or a
 * survey shared, the message read), meeting planned and its reminder a day before, Sunday-evening weekly summary for
 * parents, and staff notices (urgent guidance request, pilot application, licence ending in 30 and 7 days).
 */
async function moreEvents(env: Env, people: Set<string>, urgent: Set<string>, limit: number) {
  const add = (ok: boolean, uid: string) => { if (ok) people.add(uid); };
  // weekly programme given
  for (const r of await all<any>(env.DB.prepare(`SELECT p.id,p.student_id,s.first_name FROM guidance_programs p JOIN student_entities s ON s.id=p.student_id WHERE p.status='GIVEN' AND p.given_at>=datetime('${sqlClock()}','-2 days') LIMIT ?`).bind(limit))) {
    for (const uid of await studentUsersOf(env, r.student_id)) add(await firstMessage(env, uid, r.student_id, 'PROGRAM', r.id, 'Rehber öğretmenin bu haftanın çalışma programını hazırladı. Birlikte bakalım mı?', { actions: [{ type: 'PLAN', label: 'Programımı aç', to: '/rehberligim' }], suggestions: ['Bugün ne çalışayım?'] }), uid);
    for (const uid of await parentsOf(env, r.student_id)) add(await firstMessage(env, uid, r.student_id, 'PROGRAM', r.id, `Rehber öğretmen ${r.first_name} için bu haftanın çalışma programını hazırladı.`, { actions: [{ type: 'PLAN', label: 'Haftalık gelişim', to: '/weekly-summary' }] }), uid);
  }
  // screen diary asked (a student or a whole class)
  for (const r of await all<any>(env.DB.prepare(`SELECT q.id,q.end_date,coalesce(q.student_id,e.student_id) student_id FROM guidance_screen_requests q LEFT JOIN student_enrollments e ON e.class_id=q.class_id AND e.status='ACTIVE' AND q.student_id IS NULL
      WHERE q.created_at>=datetime('${sqlClock()}','-2 days') AND q.end_date>=date('${sqlClock()}','+3 hours') LIMIT ?`).bind(limit * 10))) {
    if (!r.student_id) continue;
    const text = 'Rehber öğretmenin birkaç gün boyunca ekran ve uyku günlüğü tutmanı istiyor. Her akşam bir dakika yeter.';
    for (const uid of await studentUsersOf(env, r.student_id)) add(await firstMessage(env, uid, r.student_id, 'SCREEN', r.id, text, { actions: [{ type: 'PLAN', label: 'Günlüğü aç', to: '/rehberligim' }] }), uid);
    for (const uid of await parentsOf(env, r.student_id)) add(await firstMessage(env, uid, r.student_id, 'SCREEN', r.id, `Rehber öğretmen ${String(r.end_date).slice(8, 10)}.${String(r.end_date).slice(5, 7)} tarihine kadar ekran ve uyku günlüğü istiyor. Siz de veli olarak kayıt girebilirsiniz.`, { actions: [{ type: 'PLAN', label: 'Ekran günlüğü', to: '/ekran-gunlugum' }] }), uid);
  }
  // a guidance note shared with parents or students of a school/class
  for (const r of await all<any>(env.DB.prepare(`SELECT sh.id,sh.class_id,sh.institution_id,g.audience,g.title FROM guidance_resource_shares sh JOIN guidance_resources g ON g.id=sh.resource_id
      WHERE sh.shared_at>=datetime('${sqlClock()}','-2 days') AND g.active=1 AND g.review_status='APPROVED' AND g.audience IN ('PARENT','STUDENT') LIMIT ?`).bind(limit))) {
    const students = await all<{ student_id: string }>(env.DB.prepare(`SELECT student_id FROM student_enrollments WHERE institution_id=? AND status='ACTIVE' AND (? IS NULL OR class_id=?) LIMIT 2000`).bind(r.institution_id, r.class_id, r.class_id));
    for (const st of students) {
      const users = r.audience === 'PARENT' ? await parentsOf(env, st.student_id) : await studentUsersOf(env, st.student_id);
      for (const uid of users) add(await firstMessage(env, uid, st.student_id, 'RESOURCE', r.id, `Rehber öğretmen sizinle “${r.title}” notunu paylaştı.`, { actions: [{ type: 'PLAN', label: 'Notu oku', to: r.audience === 'PARENT' ? '/rehberime-yaz' : '/rehberligim' }] }), uid);
    }
  }
  // survey invitation
  for (const r of await all<any>(env.DB.prepare(`SELECT i.id,i.user_id,u.role,u.student_id FROM guidance_survey_invites i JOIN guidance_surveys v ON v.id=i.survey_id JOIN users u ON u.id=i.user_id
      WHERE i.responded=0 AND v.created_at>=datetime('${sqlClock()}','-3 days') LIMIT ?`).bind(limit)).catch(() => [])) {
    add(await firstMessage(env, r.user_id, r.role === 'STUDENT' ? r.student_id : null, 'SURVEY', r.id, 'Rehber öğretmenin kısa bir anket gönderdi. Birkaç dakikanı alır.', { actions: [{ type: 'PLAN', label: 'Ankete git', to: '/rehberime-yaz' }] }), r.user_id);
  }
  // the student's / parent's message to the guidance teacher was read
  for (const r of await all<any>(env.DB.prepare(`SELECT id,sender_user_id,student_id FROM guidance_messages WHERE status<>'NEW' AND handled_at>=datetime('${sqlClock()}','-2 days') AND sender_user_id IS NOT NULL LIMIT ?`).bind(limit))) {
    add(await firstMessage(env, r.sender_user_id, r.student_id, 'MESSAGE_SEEN', r.id, 'Rehber öğretmenin mesajını okudu. Gerekirse seninle görüşme planlayacak.', {}), r.sender_user_id);
  }
  // meetings: planned, and a reminder the day before
  for (const m of await all<any>(env.DB.prepare(`SELECT g.id,g.kind,g.scheduled_at,ms.student_id,g.created_at>=datetime('${sqlClock()}','-2 days') fresh,
        datetime(g.scheduled_at) BETWEEN datetime('${sqlClock()}','+3 hours') AND datetime('${sqlClock()}','+33 hours') soon
      FROM guidance_meetings g JOIN guidance_meeting_students ms ON ms.meeting_id=g.id WHERE g.status='PLANNED' AND datetime(g.scheduled_at)>datetime('${sqlClock()}','+3 hours') AND (g.created_at>=datetime('${sqlClock()}','-2 days') OR datetime(g.scheduled_at)<=datetime('${sqlClock()}','+33 hours')) LIMIT ?`).bind(limit))) {
    const when = fmtDate(m.scheduled_at);
    const users = [...(m.kind === 'PARENT' ? [] : await studentUsersOf(env, m.student_id)), ...(['PARENT', 'INDIVIDUAL'].includes(m.kind) ? await parentsOf(env, m.student_id) : [])];
    for (const uid of users) {
      if (m.fresh) add(await firstMessage(env, uid, m.student_id, 'MEETING', m.id, `Rehber öğretmen bir görüşme planladı: **${when}**.`, {}), uid);
      if (m.soon) add(await firstMessage(env, uid, m.student_id, 'MEETING_SOON', m.id, `Hatırlatma: rehberlik görüşmesi **${when}**.`, {}), uid);
    }
  }
  // Sunday evening: the week in short, for parents
  const now = new Date(Date.now() + 3 * 3600_000);
  if (now.getUTCDay() === 0 && now.getUTCHours() >= 19) {
    const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - 6); const weekStart = monday.toISOString().slice(0, 10);
    const links = await all<any>(env.DB.prepare(`SELECT l.parent_user_id,l.student_id,s.first_name FROM parent_student_links l JOIN student_entities s ON s.id=l.student_id
      WHERE l.active=1 AND NOT EXISTS (SELECT 1 FROM nibiru_proactive_log g WHERE g.user_id=l.parent_user_id AND g.kind='WEEKLY' AND g.ref_id=l.student_id||':'||?) LIMIT ?`).bind(weekStart, limit));
    for (const l of links) {
      const ctx: any = await studentAcademicContext(env, l.student_id, null, true).catch(() => null);
      const weekExams = (ctx?.exams || []).filter((e: any) => String(e.exam_date || '') >= weekStart);
      const absent = await one<{ n: number }>(env.DB.prepare(`SELECT count(DISTINCT ps.attendance_date) n FROM attendance_period_records r JOIN attendance_period_sessions ps ON ps.id=r.session_id WHERE r.student_id=? AND r.attendance_status='ABSENT' AND ps.session_type='DAILY' AND ps.attendance_date>=?`).bind(l.student_id, weekStart)).catch(() => null);
      const study = await one<{ d: number; q: number }>(env.DB.prepare(`SELECT count(DISTINCT log_date) d, coalesce(sum(solved),0) q FROM guidance_study_logs WHERE student_id=? AND log_date>=?`).bind(l.student_id, weekStart)).catch(() => null);
      const parts = [
        weekExams.length ? `${weekExams.length} sınav` : 'bu hafta sınav yok',
        `${Number(absent?.n || 0)} gün devamsızlık`,
        Number(study?.d || 0) ? `${study!.d} gün çalışma kaydı (${study!.q} soru)` : 'çalışma kaydı girilmedi',
      ];
      const card = weekExams.length ? resultCard(ctx.exams) : null;
      add(await firstMessage(env, l.parent_user_id, l.student_id, 'WEEKLY', `${l.student_id}:${weekStart}`, `${l.first_name} için haftanın özeti: ${parts.join(', ')}. İyi bir hafta dilerim!`, { cards: card ? [card] : undefined, suggestions: ['Hangi konularda zorlanıyor?', 'Evde nasıl destek olabilirim?'] }), l.parent_user_id);
    }
  }
  // staff: urgent guidance request → the school's guidance teachers (never waits for morning)
  for (const r of await all<any>(env.DB.prepare(`SELECT m.id,m.institution_id FROM guidance_messages m WHERE m.urgent=1 AND m.status='NEW' AND m.created_at>=datetime('${sqlClock()}','-1 day') LIMIT ?`).bind(limit))) {
    for (const u of await all<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE institution_id=? AND role='GUIDANCE_TEACHER' AND active=1`).bind(r.institution_id))) {
      if (await firstMessage(env, u.id, null, 'URGENT', r.id, 'Acil bir rehberlik talebi var. Lütfen Rehberlik Merkezi’nde bugünün listesine bakın.', { actions: [{ type: 'PLAN', label: 'Rehberlik Merkezi', to: '/' }] })) {
        people.add(u.id); urgent.add(u.id);
        await bell(env, u.id, r.institution_id, 'GUIDANCE_URGENT', 'Acil rehberlik talebi', 'Bir öğrenciden acil görüşme talebi geldi.', '/', r.id);
      }
    }
  }
  // staff: pilot application → super admins
  for (const r of await all<any>(env.DB.prepare(`SELECT id,institution_name,city FROM pilot_applications WHERE created_at>=datetime('${sqlClock()}','-2 days') LIMIT ?`).bind(limit)).catch(() => [])) {
    for (const u of await all<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE role='SUPER_ADMIN' AND active=1`))) {
      if (await firstMessage(env, u.id, null, 'PILOT', r.id, `Yeni pilot okul başvurusu: **${r.institution_name}**, ${r.city}.`, { actions: [{ type: 'PLAN', label: 'Başvurular', to: '/pilot-basvurulari' }] })) {
        people.add(u.id); await bell(env, u.id, null, 'PILOT_APPLICATION', 'Yeni pilot okul başvurusu', `${r.institution_name}, ${r.city}`, '/pilot-basvurulari', r.id);
      }
    }
  }
  // staff: licence ends in 30 or 7 days → the school's managers
  for (const r of await all<any>(env.DB.prepare(`SELECT id,institution_id,coalesce(license_expires_at,trial_expires_at) ends,CAST(julianday(coalesce(license_expires_at,trial_expires_at))-julianday('now') AS INTEGER) days
      FROM institution_licenses WHERE status='ACTIVE' AND coalesce(license_expires_at,trial_expires_at) IS NOT NULL AND julianday(coalesce(license_expires_at,trial_expires_at))-julianday('now') BETWEEN 0 AND 30 LIMIT ?`).bind(limit))) {
    const mark = Number(r.days) <= 7 ? 7 : 30;
    for (const u of await all<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE institution_id=? AND role='INSTITUTION_MANAGER' AND active=1`).bind(r.institution_id))) {
      if (await firstMessage(env, u.id, null, 'LICENSE', `${r.id}:${mark}`, `ANUNEX lisansınızın bitmesine **${Math.max(0, Number(r.days))} gün** kaldı.`, {})) {
        people.add(u.id); await bell(env, u.id, r.institution_id, 'LICENSE_EXPIRING', 'Lisans bitiyor', `ANUNEX lisansınızın bitmesine ${Math.max(0, Number(r.days))} gün kaldı.`, '/', `${r.id}:${mark}`);
      }
    }
  }
}

async function prefs(request: Request, env: Env, user: AuthUser) {
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({})) as any;
    for (const c of NOTIFY_CATEGORIES) if (typeof b?.[c] === 'boolean') await env.DB.prepare(`INSERT INTO nibiru_notify_prefs(user_id,category,enabled) VALUES(?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`).bind(user.id, c, b[c] ? 1 : 0).run();
  }
  const rows = await all<{ category: string; enabled: number }>(env.DB.prepare(`SELECT category,enabled FROM nibiru_notify_prefs WHERE user_id=?`).bind(user.id));
  const out: Record<string, boolean> = {}; for (const c of NOTIFY_CATEGORIES) out[c] = rows.find((r) => r.category === c)?.enabled !== 0;
  return json({ ok: true, prefs: out });
}

// ---------------------------------------------------------------------------------------------------- right after a change
/**
 * 24 Nov 2026 (owner: "görüşme planladım, bildirim gelmedi" on the showcase): first messages do not wait for the
 * 15-minute cron — a change that can create one (a meeting, a programme, a shared note, attendance,
 * a pilot application) runs the same pass right away. The showcase has no cron at all, so this is its only path.
 * At most once every 20 seconds per isolate.
 */
// result publication stays with the cron: publishing is a staged step and its first messages can wait minutes
const WRITE_PATHS = /^\/api\/(guidance[a-z-]*\/|school\/attendance|pilot-applications)/;
let lastAfterWrite = 0;
export function nibiruAfterWrite(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, response: Response) {
  if (!ctx || request.method === 'GET' || !response.ok || !WRITE_PATHS.test(new URL(request.url).pathname)) return;
  if (Date.now() - lastAfterWrite < 20_000) return;
  lastAfterWrite = Date.now();
  ctx.waitUntil(runNibiruProactive(env, 100).catch((error) => console.error(JSON.stringify({ event: 'nibiru_after_write_failed', error: String(error) }))));
}

// ---------------------------------------------------------------------------------------------------- routes
export async function handleNibiruCompanion(request: Request, env: Env, inner: (r: Request) => Promise<Response>): Promise<Response | null> {
  const url = new URL(request.url); const p = url.pathname;
  const mine = p === '/api/nibiru/chat' || p === '/api/nibiru/history' || p === '/api/nibiru/unread' || p === '/api/nibiru/notify-prefs' || p.startsWith('/api/nibiru/feedback') || p.startsWith('/api/nibiru/push/');
  if (!mine) return null;
  const user = await getAuthUser(env, request);
  if (!user) return p === '/api/nibiru/chat' ? null : json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (p === '/api/nibiru/chat' && request.method === 'POST') return chat(request, env, user, inner);
  if (p === '/api/nibiru/history' && request.method === 'GET') return history(env, user, url);
  if (p === '/api/nibiru/unread' && request.method === 'GET') return unread(env, user);
  if (p === '/api/nibiru/feedback' && request.method === 'POST') return feedback(request, env, user);
  if (p === '/api/nibiru/feedback/summary' && request.method === 'GET') return user.role === 'SUPER_ADMIN' ? feedbackSummary(env) : json({ ok: false, error: { code: 'FORBIDDEN', message: 'Yetkiniz yok.' } }, 403);
  if (p === '/api/nibiru/notify-prefs' && ['GET', 'PUT'].includes(request.method)) return prefs(request, env, user);
  if (p === '/api/nibiru/push/key' && request.method === 'GET') return json({ ok: true, publicKey: (await vapidKeys(env)).publicKey });
  if (p === '/api/nibiru/push/subscription' && ['POST', 'DELETE'].includes(request.method)) return subscribe(request, env, user);
  return null;
}
