import type { AuthUser, Env } from '../types';
import { getAuthUser } from './auth';
import { all, json, one, uuid } from './db';
import { publishedForLearnersSql } from './exam-schedule';
import { studentAcademicContext } from './nibiru';

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
  const totals = await one<any>(env.DB.prepare(`SELECT sum(feedback=1) up, sum(feedback=-1) down, count(*) answers FROM nibiru_messages WHERE author='NIBIRU' AND created_at>=datetime('now','-30 days')`));
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
async function firstMessage(env: Env, userId: string, studentId: string, kind: string, refId: string, text: string, payload: any) {
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
    WHERE ${publishedForLearnersSql('e.id')} AND datetime(coalesce(dp.result_publish_at,dp.published_at))>=datetime('now','-3 days') LIMIT ?`).bind(limit)).catch(() => []);
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
    WHERE r.attendance_status='ABSENT' AND ps.session_type='DAILY' AND ps.status IN ('COMPLETED','CORRECTED') AND ps.attendance_date=date('now','+3 hours') LIMIT ?`).bind(limit)).catch(() => []);
  for (const a of absences) for (const uid of String(a.parent_users || '').split(',').filter(Boolean)) {
    if (await firstMessage(env, uid, a.student_id, 'ABSENCE', `${a.student_id}:${a.attendance_date}`, `Bilgilendirme: ${a.first_name} bugün okulda **devamsız** olarak işaretlendi. Bir yanlışlık olduğunu düşünüyorsanız okulla iletişime geçebilirsiniz.`, { suggestions: ['Bu dönem kaç gün devamsızlık var?'] })) people.add(uid);
  }
  let pushed = 0;
  for (const uid of people) pushed += await pushUser(env, uid).catch(() => 0);
  await env.DB.prepare(`DELETE FROM nibiru_messages WHERE created_at<datetime('now','-${KEEP_DAYS} days')`).run().catch(() => undefined);
  return { people: people.size, pushed };
}

// ---------------------------------------------------------------------------------------------------- routes
export async function handleNibiruCompanion(request: Request, env: Env, inner: (r: Request) => Promise<Response>): Promise<Response | null> {
  const url = new URL(request.url); const p = url.pathname;
  const mine = p === '/api/nibiru/chat' || p === '/api/nibiru/history' || p === '/api/nibiru/unread' || p.startsWith('/api/nibiru/feedback') || p.startsWith('/api/nibiru/push/');
  if (!mine) return null;
  const user = await getAuthUser(env, request);
  if (!user) return p === '/api/nibiru/chat' ? null : json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (p === '/api/nibiru/chat' && request.method === 'POST') return chat(request, env, user, inner);
  if (p === '/api/nibiru/history' && request.method === 'GET') return history(env, user, url);
  if (p === '/api/nibiru/unread' && request.method === 'GET') return unread(env, user);
  if (p === '/api/nibiru/feedback' && request.method === 'POST') return feedback(request, env, user);
  if (p === '/api/nibiru/feedback/summary' && request.method === 'GET') return user.role === 'SUPER_ADMIN' ? feedbackSummary(env) : json({ ok: false, error: { code: 'FORBIDDEN', message: 'Yetkiniz yok.' } }, 403);
  if (p === '/api/nibiru/push/key' && request.method === 'GET') return json({ ok: true, publicKey: (await vapidKeys(env)).publicKey });
  if (p === '/api/nibiru/push/subscription' && ['POST', 'DELETE'].includes(request.method)) return subscribe(request, env, user);
  return null;
}
