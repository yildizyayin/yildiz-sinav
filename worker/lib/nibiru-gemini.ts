/**
 * Nibiru 2.0 (owner, 13 Nov 2026): "hepsi dengeli", "samimi abi/abla", "ücretsiz Gemini"; complaints were "aynı cevabı
 * tekrarlıyor", "robot gibi", "ChatGPT/Claude hissi yok".
 *
 * Nibiru talks through Google Gemini (free tier) when GEMINI_API_KEY is set; otherwise the old rule-based path answers.
 * Privacy (KVKK master rule 5): the model never gets a name, number, phone, class list or guidance note. It gets the
 * question, the last few turns and a compact academic summary (grade, exam titles and nets, subject results, weak
 * outcomes with their codes, homework titles, today's plan). The model may write {ad} where it wants to use the
 * learner's first name; ANUNEX puts the name in after the answer comes back.
 * The model may propose actions (video, guidance message, weekly plan, results); ANUNEX only shows the ones it can
 * back with real data (e.g. a video only for an outcome in the summary that has a video).
 * KVKK: in production Gemini is used only after Google Gemini is approved in the processor and transfer registry.
 * Free quota: at most DAILY_CAP calls a day for the whole platform and USER_CAP per person; above that, the old path.
 */
import type { AuthUser, Env } from '../types';
import { all, one, uuid } from './db';
import { outcomeClip } from './outcome-videos';
import { SERVABLE_VIDEO_SQL } from './video-links';
import { externalPersonalDataGate } from './privacy-external-gate';

export const DAILY_CAP = 900, USER_CAP = 60, HISTORY_TURNS = 8;
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const num = (v: unknown, d = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(Number(v).toFixed(d)));

export type NibiruAction = { type: 'VIDEO' | 'WRITE_COUNSELOR' | 'PLAN' | 'RESULTS'; label: string; to?: string; url?: string; title?: string; start?: number; end?: number | null };
export type GeminiReply = { answer: string; suggestions: string[]; actions: NibiruAction[] };

/** The academic summary the model may see — no names, numbers or contact data. */
export function modelContext(role: string, context: any, plan: any) {
  if (context?.student) {
    return {
      kim: role === 'PARENT' ? 'velinin çocuğu' : 'öğrencinin kendisi',
      sinif: context.student.grade_level ?? null,
      sonSinavlar: (context.exams || []).slice(0, 4).map((e: any) => ({ sinav: e.title, tarih: e.exam_date || null, net: num(e.net), puan: num(e.score), dogru: e.correct_count, yanlis: e.wrong_count, bos: e.blank_count })),
      sonSinavDersleri: (context.subjects || []).map((s: any) => ({ ders: s.name, net: num(s.net), basariYuzde: num(s.success_percent, 0) })),
      gelisimAlanlari: (context.weakOutcomes || []).slice(0, 6).map((o: any) => ({ kod: o.code, kazanim: String(o.title || '').slice(0, 160), konu: o.topic || null, ders: o.subject_name, basariYuzde: num(o.avg_success, 0) })),
      odevler: (context.assignments || []).slice(0, 5).map((a: any) => ({ fey: a.title, sonGun: a.due_date || null })),
      bugunkuPlan: plan?.available ? (plan.items || []).slice(0, 5).map((t: any) => ({ gorev: t.payload?.label || null, soru: t.payload?.questionTarget ?? null, dakika: t.payload?.minutes ?? null })) : null,
    };
  }
  if (context?.classes) {
    return {
      kim: 'öğretmen',
      siniflar: (context.classes || []).map((c: any) => ({ sinif: c.name, ogrenciSayisi: c.student_count })),
      sonSinavlar: (context.recent || []).slice(0, 6).map((r: any) => ({ sinav: r.title, ders: r.subject_name, ortalamaBasari: num(r.avg_success, 0), ogrenci: r.student_count })),
      zorlanilanKazanimlar: (context.weakOutcomes || []).slice(0, 8).map((o: any) => ({ kazanim: String(o.title || '').slice(0, 160), ders: o.subject_name, ortalamaBasari: num(o.avg_success, 0), ogrenci: o.student_count })),
    };
  }
  if (context?.institution) return { kim: 'kurum yöneticisi', aktifOgrenci: context.activeStudents, aktifSinif: context.activeClasses, bekleyenOptik: context.pendingScans, bugunSinav: context.todayExams, sonSinavlar: (context.recentExams || []).slice(0, 5).map((e: any) => ({ sinav: e.title, ortalamaNet: num(e.avg_net), ortalamaBasari: num(e.avg_success, 0), sonuc: e.result_count })) };
  return { kim: role };
}

export function systemPrompt(role: string) {
  const you = role === 'STUDENT' ? 'Öğrenciye "sen" diye, samimi bir abi/abla gibi konuş.' : 'Kullanıcıya "siz" diye, sıcak ama saygılı konuş.';
  return `Sen Nibiru'sun: ANUNEX ölçme ve analiz platformunun akademik asistanı. Türkiye'de ortaokul/lise öğrencileri, velileri ve öğretmenleriyle Türkçe konuşursun. ${you}
Kurallar:
- Kısa ve doğal yaz; 2-5 cümlelik paragraflar, gerekirse madde işareti. Gereksiz selamlama ve kalıp cümle yok; aynı cümleyi tekrarlama, önceki cevaplarına bak.
- Sınav, net, puan ve kazanım hakkında yalnız BAĞLAM'daki verilere dayan. Bağlamda olmayan sayıyı ASLA uydurma; yoksa "henüz görünmüyor" de. Netleri virgülle yaz (4,67).
- Konu anlatımı istenirse: MEB müfredatına ve sınıf düzeyine uygun, örnekli, en fazla ~180 kelime anlat; sonunda tek bir kısa kontrol sorusu sor.
- Soru istenirse: çoktan seçmeli (A-D) 1-3 soru yaz, cevabı hemen verme; kullanıcı cevaplayınca değerlendir ve kısaca açıkla.
- Duygu paylaşılırsa (sıkıldım, yoruldum, kaygılıyım): önce anlayış göster, küçük bir adım öner, istersen rehber öğretmenine yazabilirsin de. Tıbbi ya da psikolojik teşhis koyma, etiketleme.
- Kişisel bilgi (ad, telefon, adres, şifre) isteme. Kullanıcının adını kullanmak istersen yalnız {ad} yaz.
- Kapsam dışı konularda (siyaset, tartışmalı dinî konular, flört, şiddet, sınav kopyası) nazikçe derse dön.
- Veliye ve öğretmene çocuğu "başarısız" diye etiketleme; gelişim alanı de.
Yanıtı yalnız şu JSON olarak ver:
{"answer":"...","suggestions":["en fazla 3 kısa takip sorusu, kullanıcının ağzından"],"actions":[{"type":"VIDEO","outcome":"<gelisimAlanlari.kod>"} | {"type":"WRITE_COUNSELOR"} | {"type":"PLAN"} | {"type":"RESULTS"}]}
actions boş olabilir; VIDEO yalnız bağlamdaki bir kazanım kodu için.`;
}

async function usageOk(env: Env, userId: string) {
  const d = today();
  const all = await one<any>(env.DB.prepare(`SELECT coalesce(sum(calls),0) n FROM nibiru_gemini_usage WHERE day=?`).bind(d));
  const mine = await one<any>(env.DB.prepare(`SELECT calls n FROM nibiru_gemini_usage WHERE day=? AND user_id=?`).bind(d, userId));
  return Number(all?.n || 0) < DAILY_CAP && Number(mine?.n || 0) < USER_CAP;
}
async function countUse(env: Env, userId: string) {
  await env.DB.prepare(`INSERT INTO nibiru_gemini_usage(day,user_id,calls) VALUES(?,?,1) ON CONFLICT(day,user_id) DO UPDATE SET calls=calls+1`).bind(today(), userId).run();
}

export async function chatHistory(env: Env, userId: string, channelKey: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT speaker,text FROM nibiru_chat_turns WHERE user_id=? AND channel_key=? AND created_at>=datetime('now','-1 day') ORDER BY created_at DESC,rowid DESC LIMIT ?`).bind(userId, channelKey, HISTORY_TURNS));
  return rows.reverse();
}
export async function saveTurns(env: Env, userId: string, channelKey: string, question: string, answer: string) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO nibiru_chat_turns(id,user_id,channel_key,speaker,text) VALUES(?,?,?,'USER',?)`).bind(uuid('nct'), userId, channelKey, question.slice(0, 2000)),
    env.DB.prepare(`INSERT INTO nibiru_chat_turns(id,user_id,channel_key,speaker,text) VALUES(?,?,?,'NIBIRU',?)`).bind(uuid('nct'), userId, channelKey, answer.slice(0, 4000)),
    env.DB.prepare(`DELETE FROM nibiru_chat_turns WHERE created_at<datetime('now','-30 days')`),
  ]);
}

async function callGemini(env: Env, body: any): Promise<any | null> {
  const models = env.NIBIRU_GEMINI_MODEL ? [env.NIBIRU_GEMINI_MODEL] : ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
      if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
      if (!res.ok) return null;
      const data: any = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
      return JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
    } catch { continue; }
  }
  return null;
}

/** First name in Turkish title case ("ALI" → "Ali"). */
export function titleName(v: unknown) {
  const s = String(v || '').trim().split(/\s+/)[0] || '';
  return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1).toLocaleLowerCase('tr-TR') : '';
}

async function videoFor(env: Env, outcomeId: string, institutionId: string | null) {
  const v = await one<any>(env.DB.prepare(`SELECT vl.url,vl.title FROM video_links vl WHERE vl.link_type='TOPIC' AND vl.outcome_id=? AND ${SERVABLE_VIDEO_SQL} ORDER BY vl.rowid DESC LIMIT 1`).bind(outcomeId));
  if (v) return { url: v.url, title: v.title, start: 0, end: null };
  const c = await outcomeClip(env, outcomeId, institutionId);
  return c ? { url: c.url, title: c.title, start: c.start, end: c.end } : null;
}

/** Only actions ANUNEX can back with real data and that fit the role. */
export async function backActions(env: Env, user: AuthUser, raw: any[], context: any): Promise<NibiruAction[]> {
  const out: NibiruAction[] = []; const seen = new Set<string>();
  for (const a of (Array.isArray(raw) ? raw : []).slice(0, 4)) {
    const type = String(a?.type || '');
    if (seen.has(type + (a?.outcome || ''))) continue; seen.add(type + (a?.outcome || ''));
    if (type === 'VIDEO' && context?.weakOutcomes) {
      const o = context.weakOutcomes.find((w: any) => w.code && w.code === a?.outcome);
      const v = o ? await videoFor(env, o.id, user.institution_id || null) : null;
      if (v) out.push({ type: 'VIDEO', label: 'Konu videosunu izle', ...v });
    } else if (type === 'WRITE_COUNSELOR' && ['STUDENT', 'PARENT'].includes(user.role)) out.push({ type, label: 'Rehber öğretmenime yaz', to: '/rehberime-yaz' });
    else if (type === 'PLAN' && user.role === 'STUDENT') out.push({ type, label: 'Bu haftaki programım', to: '/bu-haftam' });
    else if (type === 'PLAN' && user.role === 'PARENT') out.push({ type, label: 'Haftalık program', to: '/haftalik-program' });
    else if (type === 'RESULTS' && ['STUDENT', 'PARENT'].includes(user.role)) out.push({ type, label: 'Sonuçları aç', to: '/' });
  }
  return out;
}

export async function geminiNibiru(env: Env, user: AuthUser, message: string, channelKey: string, context: any, plan: any): Promise<GeminiReply | null> {
  if (!env.GEMINI_API_KEY || env.NIBIRU_GEMINI === 'off') return null;
  // KVKK: in production only after the Super Admin approved Google Gemini in the processor/transfer registry
  if (!(await externalPersonalDataGate(env, 'GOOGLE_GEMINI').catch(() => ({ ok: false }))).ok) return null;
  if (!(await usageOk(env, user.id).catch(() => false))) return null;
  const history = await chatHistory(env, user.id, channelKey).catch(() => []);
  const contents = [
    ...history.map((h: any) => ({ role: h.speaker === 'USER' ? 'user' : 'model', parts: [{ text: h.speaker === 'USER' ? h.text : JSON.stringify({ answer: h.text }) }] })),
    { role: 'user', parts: [{ text: `BAĞLAM: ${JSON.stringify(modelContext(user.role, context, plan))}\n\nMESAJ: ${message.slice(0, 1500)}` }] },
  ];
  await countUse(env, user.id).catch(() => undefined);
  const out = await callGemini(env, { systemInstruction: { parts: [{ text: systemPrompt(user.role) }] }, contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 1200 } });
  const text = typeof out?.answer === 'string' ? out.answer.trim() : '';
  if (!text) return null;
  const first = user.role === 'STUDENT' ? titleName(context?.student?.first_name) : titleName(user.display_name);
  const answer = text.replace(/\{ad\}/g, first || '').replace(/\s+([,.!?])/g, '$1').slice(0, 4000);
  const suggestions = (Array.isArray(out.suggestions) ? out.suggestions : []).filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 80)).slice(0, 3);
  const actions = await backActions(env, user, out.actions, context).catch(() => []);
  await saveTurns(env, user.id, channelKey, message, answer).catch(() => undefined);
  return { answer, suggestions, actions };
}
