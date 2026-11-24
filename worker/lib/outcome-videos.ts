/**
 * Kazanım videosu (owner, 12 Nov 2026).
 * A learner sees, for an outcome:
 *  1. the system's approved video (published topic link / approved learning video) — handled by the callers' own query;
 *  2. otherwise the link the school's teacher added for the outcome (shown at once, only to that school);
 *  3. otherwise a YouTube video found automatically, shown WITHOUT waiting for approval — but only as a real segment
 *     of that outcome: Gemini watches the public video and gives the start/end of the part that teaches the outcome;
 *     without Gemini (no key, or the free daily quota used up) the video's own chapter list is used, or a short video
 *     whose title names the outcome. With none of these nothing is shown: a whole unrelated video is never served.
 * Each outcome is searched once (by the 15-minute cron, outcomes a learner needed first) and the result is kept.
 * Safeguards for children: YouTube safeSearch=strict, embeddable/public/processed/not age-restricted/not live
 * (youtubeCandidateAvailable), Gemini is asked whether the content suits a student, playback via youtube-nocookie.
 * A teacher can remove an automatic video ("Kaldır, başka video bul"); three different students saying
 * "konuyla ilgili değil" remove it too. A removed video never comes back for that outcome.
 * Only the public video link and the outcome text are sent to YouTube/Gemini — never anything about a student.
 * Free quotas only: at most SEARCH_CAP searches and GEMINI_SECONDS_CAP seconds of video a day; nothing is paid.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { fetchYoutubeMetadata, youtubeCandidateAvailable } from './youtube-candidate-policy';

export const geminiOn = (env: Env) => Boolean(env.GEMINI_API_KEY) && (env as any).OUTCOME_VIDEO_GEMINI !== 'off';
export const SEARCH_CAP = 80; // Leave room in YouTube's default 100-search daily quota bucket.
/**
 * Owner, 23 Nov 2026: 8th and 12th grades move to the Maarif model in 2027-2028; no videos exist for them yet, so they
 * are not searched. The list is the wrangler var OUTCOME_VIDEO_SKIP_GRADES ("8,12").
 */
export const skipGrades = (env: Env) => String(env.OUTCOME_VIDEO_SKIP_GRADES || '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 12);
const skipSql = (env: Env) => { const g = skipGrades(env); return g.length ? `coalesce(o.grade_level,0) NOT IN (${g.join(',')})` : '1=1'; };
export const GEMINI_SECONDS_CAP = 7 * 3600;  // Gemini YouTube input: 8 hours of video a day on the free tier
export const REPORTS_TO_REMOVE = 3;
const MIN_VIDEO = 45, MIN_CLIP = 30, MAX_CLIP = 20 * 60, MAX_VIDEO = 40 * 60, SHORT_VIDEO = 7 * 60;
const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const youtubeId = (url: string) => url.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?=[?&#/]|$)/)?.[1] || null;
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ text matching (Turkish, no AI)
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const STOP = new Set(['ve', 'ile', 'bir', 'bu', 'icin', 'ilgili', 'olan', 'eder', 'yapar', 'aciklar', 'belirler', 'kullanir', 'cozer', 'gosterir', 'konu', 'anlatim', 'anlatimi', 'sinif', 'ders', 'soru', 'sorulari', 'ornek', 'ornekler', 'unite', 'giris', 'tekrar', 'ozet', 'test', 'cozum', 'cozumu', 'lgs', 'yks', 'tyt', 'ayt', 'meb', 'kazanim', 'ile', 'gibi', 'arasindaki', 'iliskiyi', 'farki', 'nedir', 'nasil', 'part', 'bolum', 'kisim', 'sonuc', 'final', 'kapanis', 'abone', 'olun']);
export function stems(value: string): string[] {
  const words = String(value || '').normalize('NFC').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => FOLD[c] || c).split(/[^a-z0-9]+/);
  return [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map((w) => w.slice(0, 5)))];
}
const overlap = (a: string[], b: string[]) => { const s = new Set(b); return a.filter((x) => s.has(x)).length; };

// ------------------------------------------------------------------ quality (owner, 23 Nov 2026: "gerçek video kesitleri")
// Words that every outcome uses ("…belirlemeye yönelik…yapabilme") say nothing about the topic; only the rest counts.
const GENERIC = new Set(['yonel', 'belir', 'yapab', 'edebi', 'ebilm', 'abilm', 'kulla', 'olust', 'ifade', 'uygul', 'acikl', 'gelis', 'deger', 'kendi', 'uyarl', 'temel', 'farkl', 'uygun', 'cesit', 'durum', 'calis', 'bilgi', 'turlu', 'yazil', 'sozlu', 'genel', 'yapil', 'cikar', 'bulun', 'verir', 'eder', 'ozell', 'ornek']);
/** The words of the outcome sentence itself that carry its topic. */
export const distinctive = (title: string) => stems(cleanTitle(title)).filter((w) => !GENERIC.has(w));
const SUBJECTS: [RegExp, string][] = [[/matemat/i, 'Matematik'], [/\bfen\b|fen bilim/i, 'Fen Bilimleri'], [/türkçe|turkce/i, 'Türkçe'], [/ingilizce|english/i, 'İngilizce'], [/sosyal bilg/i, 'Sosyal Bilgiler'], [/din kült|din kult/i, 'Din Kültürü'], [/inkılap|inkilap/i, 'İnkılap Tarihi'], [/fizik/i, 'Fizik'], [/kimya/i, 'Kimya'], [/biyoloji/i, 'Biyoloji'], [/coğrafya|cografya/i, 'Coğrafya'], [/tarih/i, 'Tarih'], [/edebiyat/i, 'Türk Dili ve Edebiyatı'], [/felsefe/i, 'Felsefe']];
/** Channels whose name says entertainment, not teaching. */
export const NOT_TEACHING = /\b(funn|funny|meme|prank|asmr|cartoon|gaming|gamer|minecraft|roblox|music|müzik|vlog|tiktok|comedy|kids tv|nursery|facts)\b|funnies/i;
/** Why a found clip should not be shown, or null when it is fine. Checks what is known without another API call. */
export function qualityIssue(v: { title: string; channel?: string | null; method: string; chapterTitle?: string | null }, o: { title: string; topic?: string | null; subtopic?: string | null; grade_level?: number | null; subject_name?: string | null }): string | null {
  const t = String(v.title || '');
  if (v.channel && NOT_TEACHING.test(v.channel)) return `eğitim dışı kanal (${v.channel})`;
  const grades = [...t.matchAll(/(?:^|\D)(\d{1,2})\s*\.?\s*(?:sınıf|sinif|SINIF|Sınıf)/g)].map((m) => Number(m[1]));
  if (o.grade_level && grades.length && !grades.includes(Number(o.grade_level))) return `başka sınıfın videosu (${grades.join(', ')}. sınıf)`;
  const own = SUBJECTS.find(([, n]) => n === o.subject_name);
  const named = SUBJECTS.filter(([re]) => re.test(t)).map(([, n]) => n);
  // "Türk Dili ve Edebiyatı" and "İnkılap Tarihi" also match their parent words; only a clearly different subject counts
  const other = named.filter((n) => n !== o.subject_name && !(o.subject_name || '').includes(n) && !n.includes(o.subject_name || '~'));
  if (own && other.length && !named.includes(own[1])) return `başka dersin videosu (${other.join(', ')})`;
  const keys = distinctive(o.title);
  if (v.method === 'SHORT_TITLE' && keys.length) {
    const hit = overlap(stems(t), keys);
    const need = keys.length <= 1 ? 1 : keys.length <= 7 ? 2 : 3;
    if (hit < need) return `başlık kazanımı tam söylemiyor (${hit}/${keys.length} anahtar kelime)`;
  }
  if (v.method === 'CHAPTER' && v.chapterTitle != null && keys.length && !overlap(stems(v.chapterTitle), keys)) return 'bölüm başlığı kazanımın kendi kelimelerini içermiyor';
  return null;
}

/** Chapters from a video description: lines that start (or end) with a timestamp, as YouTube itself reads them. */
export function parseChapters(description: string, duration: number) {
  const toSec = (t: string) => t.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
  const marks: { start: number; title: string }[] = [];
  for (const raw of String(description || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m = line.match(/^[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*[-–—:|.]?\s*(.{2,120})$/);
    if (!m) { const e = line.match(/^(.{2,120}?)\s*[-–—:|]?\s*[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?$/); if (e) m = [e[0], e[2], e[1]] as any; }
    if (m) marks.push({ start: toSec(m[1]), title: m[2].trim() });
  }
  const sorted = marks.filter((x) => x.start < duration).sort((a, b) => a.start - b.start).filter((x, k, a) => !k || x.start > a[k - 1].start);
  if (sorted.length < 2) return [];
  return sorted.map((c, k) => ({ ...c, end: k + 1 < sorted.length ? sorted[k + 1].start : duration }));
}

/** The chapter that names the outcome, when one clearly does. */
export function matchChapter(chapters: { start: number; end: number; title: string }[], keys: string[]) {
  let best: { start: number; end: number; title: string; score: number } | null = null;
  for (const c of chapters) {
    const cs = stems(c.title); if (!cs.length) continue;
    const hit = overlap(cs, keys);
    const ok = hit >= 2 || (hit >= 1 && cs.length <= 2);
    if (!ok || c.end - c.start < MIN_CLIP) continue;
    const score = hit / Math.max(cs.length, 1);
    if (!best || score > best.score) best = { ...c, score };
  }
  return best;
}

/** "MM:SS", "H:MM:SS" or plain seconds → seconds. */
export function timeToSeconds(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(s)) return null;
  return s.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
}

/** Gemini's answer → a clip, only when it says the video teaches the outcome, suits a student and the times are sane. */
export function acceptGemini(answer: any, duration: number) {
  if (!answer || answer.covers !== true || answer.suitable !== true) return null;
  const confidence = Number(answer.confidence);
  if (!(confidence >= 0.6)) return null;
  const start = timeToSeconds(answer.start), end = timeToSeconds(answer.end);
  if (start == null || end == null || start < 0 || end > duration + 5 || end - start < MIN_CLIP || end - start > MAX_CLIP) return null;
  return { start, end: Math.min(end, duration), confidence };
}

// ------------------------------------------------------------------ quotas
async function usage(env: Env) {
  return (await one<any>(env.DB.prepare(`SELECT searches,gemini_calls,gemini_seconds FROM outcome_video_usage WHERE day=?`).bind(today()))) || { searches: 0, gemini_calls: 0, gemini_seconds: 0 };
}
async function spend(env: Env, searches: number, geminiCalls: number, geminiSeconds: number) {
  await env.DB.prepare(`INSERT INTO outcome_video_usage(day,searches,gemini_calls,gemini_seconds) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET searches=searches+excluded.searches,gemini_calls=gemini_calls+excluded.gemini_calls,gemini_seconds=gemini_seconds+excluded.gemini_seconds`).bind(today(), searches, geminiCalls, geminiSeconds).run();
}

// ------------------------------------------------------------------ Gemini (free tier; public YouTube link + outcome text only)
// Google retires model names for new keys (12 Nov 2026: "gemini-2.5-flash is no longer available to new users").
// So the alias for the newest flash is tried first; if refused, the model Google names, else the newest plain
// "gemini-X-flash" in the key's own model list.
let geminiModel: string | null = null;
export function resetGeminiModel() { geminiModel = null; }
export function pickFlashModel(models: any[]): string | null {
  const ok = (models || []).filter((m) => (m?.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, '')).filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n))
    .sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)));
  return ok[0] || null;
}
/** Google's own alias for the newest flash model first; only when it is refused is the key's model list read. */
async function resolveGeminiModel(env: Env, list = false): Promise<string> {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
  if (geminiModel && !list) return geminiModel;
  if (!list) return 'gemini-flash-latest';
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY! }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return pickFlashModel(((await res.json()) as any)?.models) || 'gemini-flash-latest';
  } catch { /* fall through */ }
  return 'gemini-flash-latest';
}

async function askGemini(env: Env, videoId: string, o: any, retried = false): Promise<any | 'LIMIT' | null> {
  const prompt = `Bu YouTube videosu Türkiye'de ${o.grade_level ? `${o.grade_level}. sınıf ` : ''}öğrencilerine "${o.subject_name || ''}" dersinin şu kazanımını öğretmek için kullanılacak:
${o.code ? `${o.code} ` : ''}${o.title}${o.topic ? `\nKonu: ${o.topic}${o.subtopic ? ` / ${o.subtopic}` : ''}` : ''}
Videoyu izle ve bu kazanımın doğrudan anlatıldığı tek, kesintisiz bölümü bul. Bölüm en az 30 saniye, en fazla 20 dakika olsun.
Yalnız şu JSON'u ver: {"covers": true ya da false, "start": "MM:SS", "end": "MM:SS", "confidence": 0 ile 1 arası, "suitable": true ya da false}
covers: video bu kazanımı gerçekten anlatıyor mu (yalnız adı geçiyorsa false). suitable: dil ve içerik okul çağındaki bir öğrenciye uygun mu (argo, şiddet, uygunsuz içerik yoksa true). Emin değilsen covers false ver.`;
  try {
    const model = await resolveGeminiModel(env);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
      body: JSON.stringify({ contents: [{ parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0, mediaResolution: 'MEDIA_RESOLUTION_LOW' } }),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.status === 429 || res.status === 403) return 'LIMIT';
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 404 && !retried && !env.GEMINI_MODEL) {
        // the model was retired: take the one Google names in the error, else list again
        const named = body.match(/use (?:models\/)?(gemini-[A-Za-z0-9.-]+)/)?.[1]?.replace(/[.-]+$/, "");
        geminiModel = named && named !== model ? named : null;
        if (!geminiModel) geminiModel = await resolveGeminiModel(env, true).then((m) => (m === model ? null : m));
        if (geminiModel) return askGemini(env, videoId, o, true);
      }
      return { __error: `HTTP ${res.status} ${model} ${body.replace(/\s+/g, ' ').slice(0, 160)}` };
    }
    const data: any = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    try { return JSON.parse(out.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { __error: `yanıt okunamadı: ${(out || data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'boş').toString().slice(0, 120)}` }; }
  } catch (e: any) { return { __error: `bağlantı: ${String(e?.name || e).slice(0, 60)}` }; }
}

// ------------------------------------------------------------------ finding a clip for one outcome
const iso = (v: string) => { const m = String(v || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/); return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0; };

/** The outcome's own words, without the unit heading, honorifics or the "-ebilme" ending of MEB's wording. */
export function cleanTitle(title: string) {
  const words = String(title || '').replace(/\((?:cc|sav|as)\)/gi, ' ').replace(/[’'.:;()]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 3 && /(abilme|ebilme|ebilir|abilir)$/i.test(words[words.length - 1])) words.pop();
  return words.join(' ');
}
const cleanTopic = (t: string | null) => String(t || '').replace(/^\s*\d+\.?\s*(?:ünite|tema|bölüm)\s*[:.-]?\s*/i, '').trim();

/** Two searches at most: the precise one first, then a broader one when the first gives nothing usable. */
export function searchQueries(o: any) {
  const title = cleanTitle(o.title).split(' ').slice(0, 9).join(' ');
  const grade = o.grade_level ? `${o.grade_level}. sınıf` : null;
  return [
    [grade, o.subject_name, title, 'konu anlatımı'].filter(Boolean).join(' ').slice(0, 200),
    [grade, o.subject_name, cleanTopic(o.subtopic || o.topic) || title.split(' ').slice(0, 5).join(' ')].filter(Boolean).join(' ').slice(0, 200),
  ];
}
export const searchQuery = (o: any) => searchQueries(o)[0];

export async function findOutcomeVideo(env: Env, outcomeId: string): Promise<{ status: 'FOUND' | 'NOT_FOUND' | 'ERROR' | 'QUOTA'; reason: string; geminiTried?: boolean; detail?: string; shared?: number }> {
  if (!env.YOUTUBE_API_KEY) return { status: 'QUOTA', reason: 'YOUTUBE_NOT_CONFIGURED' };
  const o = await one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subtopic,o.grade_level,s.name subject_name FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id WHERE o.id=?`).bind(outcomeId));
  if (!o) return { status: 'NOT_FOUND', reason: 'OUTCOME_MISSING' };
  const u = await usage(env);
  if (u.searches >= SEARCH_CAP) return { status: 'QUOTA', reason: 'SEARCH_QUOTA' };
  const blocked = new Set((await all<any>(env.DB.prepare(`SELECT youtube_video_id FROM outcome_video_blocks WHERE outcome_id=?`).bind(outcomeId))).map((b) => b.youtube_video_id));
  const keys = stems([cleanTopic(o.topic), cleanTopic(o.subtopic), o.title].filter(Boolean).join(' '));
  let query = '', detail = '', searches = 0, foundIds = false;
  const results = new Map<string, SearchCandidate>();
  const lastDetails: any[] = [];
  for (const q of searchQueries(o)) {
    if (searches && (await usage(env)).searches >= SEARCH_CAP) break;
    query = q; searches++;
    const search = new URL('https://www.googleapis.com/youtube/v3/search');
    for (const [k, v] of Object.entries({ part: 'snippet', type: 'video', safeSearch: 'strict', videoEmbeddable: 'true', regionCode: 'TR', relevanceLanguage: 'tr', maxResults: '15', q, key: env.YOUTUBE_API_KEY })) search.searchParams.set(k, v);
    await spend(env, 1, 0, 0);
    const found = await fetchYoutubeMetadata(search);
    if (!found && !results.size) return { status: 'ERROR', reason: 'YOUTUBE_SEARCH_FAILED' };
    if (!found) break;
    const ids = [...new Set<string>(found.items.map((x: any) => x.id?.videoId)
      .filter((id: any) => /^[A-Za-z0-9_-]{11}$/.test(id) && !blocked.has(id) && !results.has(id)))];
    if (!ids.length) { if (!foundIds) detail = `"${q}": sonuç yok`; continue; }
    const details = new URL('https://www.googleapis.com/youtube/v3/videos');
    for (const [k, v] of Object.entries({ part: 'snippet,contentDetails,status,statistics', id: ids.join(','), key: env.YOUTUBE_API_KEY })) details.searchParams.set(k, v);
    const det = await fetchYoutubeMetadata(details);
    if (!det && !results.size) return { status: 'ERROR', reason: 'YOUTUBE_DETAILS_FAILED' };
    if (!det) break;
    foundIds = true;
    let available = 0;
    const before = results.size;
    for (const video of det.items) {
      if (!youtubeCandidateAvailable(video) || blocked.has(video.id)) continue;
      available++;
      if (results.has(video.id)) continue;
      lastDetails.push(video);
      const c = searchCandidate(video, o, keys);
      if (c) results.set(c.id, c);
    }
    detail = `"${q}": ${ids.length} sonuç, ${available} güvenli, ${results.size-before} uygun süreli`;
    if (rankTopicChoices([...results.values()], o).length === 5) break;
  }
  const cands = [...results.values()].sort((a,b) => b.titleHit-a.titleHit || b.views-a.views);
  const choices = rankTopicChoices(cands, o);
  // A successful search replaces the set atomically. The last good set survives provider errors.
  if (cands.length) await env.DB.batch([
    env.DB.prepare('DELETE FROM outcome_video_choices WHERE outcome_id=? AND curated=0').bind(outcomeId),
    ...choices.map((c, position) => env.DB.prepare(
      `INSERT INTO outcome_video_choices(outcome_id,youtube_video_id,title,start_seconds,end_seconds,position,channel_title,checked_at)
       VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(outcome_id,youtube_video_id) DO NOTHING`
    ).bind(outcomeId,c.id,c.title,c.start,c.end,position,c.channel)),
  ]);
  if (!cands.length) return { status: 'NOT_FOUND', reason: foundIds ? 'NO_SAFE_CANDIDATE' : 'NO_CANDIDATE', detail };

  const save = async (c: any, start: number, end: number, method: 'GEMINI' | 'CHAPTER' | 'SHORT_TITLE', confidence: number) => {
    await env.DB.prepare(`INSERT OR IGNORE INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,channel_title,duration_seconds,start_seconds,end_seconds,method,confidence,search_query) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(uuid('oav'), outcomeId, c.id, c.title, c.channel || null, c.duration, start, end, method, Math.round(confidence * 100) / 100, query).run();
    return { status: 'FOUND' as const, reason: method };
  };

  // 1. Gemini watches up to two of the best candidates and gives the exact part
  let geminiTried = false; const verdicts: string[] = [];
  // owner 13 Nov 2026: "gemini işe yaramıyorsa kapat" — 34 calls found nothing and Google's terms bar services used
  // by under-18s; OUTCOME_VIDEO_GEMINI=off (wrangler vars) keeps it off, the chapter and short-video methods remain.
  if (geminiOn(env)) {
    let spent = u.gemini_seconds;
    for (const c of cands.slice(0, 2)) {
      if (spent + c.duration > GEMINI_SECONDS_CAP) break;
      geminiTried = true; spent += c.duration;
      await spend(env, 0, 1, c.duration);
      const answer = await askGemini(env, c.id, o);
      if (answer === 'LIMIT') { detail = 'Gemini kotası'; break; }
      verdicts.push(answer?.__error ? `${c.id}: ${answer.__error}` : answer ? `${c.id}: covers=${answer.covers} suitable=${answer.suitable} conf=${answer.confidence} ${answer.start ?? ''}-${answer.end ?? ''}` : `${c.id}: yanıt yok`);
      const clip = acceptGemini(answer, c.duration);
      if (clip) return save(c, clip.start, clip.end, 'GEMINI', clip.confidence);
    }
  }
  // 2. the video's own chapter that names the outcome
  const pick = pickClip(cands, keys, o);
  // the same search often holds other outcomes of this grade and subject: no extra quota is spent on them
  const shared = await shareSearch(env, o, lastDetails, query).catch(() => 0);
  if (pick) return save(pick.c, pick.start, pick.end, pick.method, pick.confidence).then((r) => ({ ...r, shared }));
  return { status: 'NOT_FOUND', reason: 'NO_SEGMENT', geminiTried, detail: [detail, ...verdicts, shared ? `aynı aramadan ${shared} başka kazanım bulundu` : ''].filter(Boolean).join(' | ') };
}

type SearchCandidate = NonNullable<ReturnType<typeof searchCandidate>>;
function searchCandidate(video: any, outcome: any, keys: string[]) {
  const duration = iso(video.contentDetails?.duration);
  if (duration < MIN_VIDEO || duration > MAX_VIDEO) return null;
  const title = String(video.snippet?.title || '').slice(0, 200);
  const channel = String(video.snippet?.channelTitle || '').slice(0, 120);
  if (!title || qualityIssue({ title, channel, method: 'ANY' }, outcome)) return null;
  const chapters = parseChapters(video.snippet?.description || '', duration);
  const language = String(video.snippet?.defaultAudioLanguage || video.snippet?.defaultLanguage || '').toLowerCase().split('-')[0];
  return { id: String(video.id), title, channel, language, duration, chapters, chapter: matchChapter(chapters, keys),
    titleHit: overlap(stems(title), keys), views: Number(video.statistics?.viewCount || 0) };
}

export function rankTopicChoices(candidates: SearchCandidate[], outcome: {title:string;grade_level?:number}) {
  const keys = distinctive(outcome.title);
  const need = Math.max(1, Math.ceil(keys.length * 0.6));
  const matches = (title: string) => overlap(stems(title), keys);
  const choices = [];
  if (!keys.length) return choices;
  for (const c of candidates) {
    // Turkish audio/metadata is preferred. Strong Turkish outcome wording supplies
    // a fallback signal when the uploader did not set a language tag.
    if (c.language && c.language !== 'tr') continue;
    const chapter = c.chapters.filter(ch => ch.end-ch.start >= 180 && ch.end-ch.start <= 325 && matches(ch.title) >= need)
      .sort((a,b)=>matches(b.title)-matches(a.title))[0];
    const fullVideo = c.duration >= 180 && c.duration <= 300 && matches(c.title) >= need;
    if (!chapter && !fullVideo) continue;
    const source = chapter ?? { start: 0, end: c.duration, title: c.title };
    choices.push({ id: c.id, title: c.title, channel: c.channel, start: source.start, end: source.end,
      match: matches(source.title), turkish: c.language === 'tr', views: c.views });
  }
  return choices.sort((a,b)=>b.match-a.match || Number(b.turkish)-Number(a.turkish) || b.views-a.views || a.id.localeCompare(b.id)).slice(0,5);
}

async function refreshTopicChoices(env: Env) {
  const rows = await all<any>(env.DB.prepare(`SELECT c.*,o.title outcome_title,o.topic,o.subtopic,o.grade_level,s.name subject_name
    FROM outcome_video_choices c JOIN outcomes o ON o.id=c.outcome_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE c.checked_at IS NULL OR c.checked_at <= datetime('now','-7 days') ORDER BY c.checked_at LIMIT 40`));
  if (rows.length) {
    const ids = [...new Set(rows.map(r=>r.youtube_video_id))];
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    for (const [k,v] of Object.entries({part:'snippet,contentDetails,status',id:ids.join(','),key:env.YOUTUBE_API_KEY!})) url.searchParams.set(k,v);
    const response = await fetchYoutubeMetadata(url);
    if (response) {
      const videos = new Map<string, any>(response.items.map((v:any)=>[v.id,v]));
      await env.DB.batch(rows.flatMap(r=>{
        const o = { ...r, title:r.outcome_title };
        const v = videos.get(r.youtube_video_id);
        const candidate = youtubeCandidateAvailable(v) ? searchCandidate(v,o,distinctive(o.title)) : null;
        const [choice] = r.curated === 1
          ? (youtubeCandidateAvailable(v) && iso(v.contentDetails?.duration) >= r.end_seconds
              ? [{title:r.title,channel:String(v.snippet?.channelTitle || r.channel_title || '').slice(0,120),start:r.start_seconds,end:r.end_seconds}]
              : [])
          : (candidate ? rankTopicChoices([candidate],o) : []);
        return choice ? [env.DB.prepare(`UPDATE outcome_video_choices SET title=?,channel_title=?,start_seconds=?,end_seconds=?,checked_at=CURRENT_TIMESTAMP
          WHERE outcome_id=? AND youtube_video_id=? AND checked_at IS ?`).bind(choice.title,choice.channel,choice.start,choice.end,r.outcome_id,r.youtube_video_id,r.checked_at)] : [
          env.DB.prepare(`UPDATE outcome_video_queue SET choices_checked_at=NULL,status='WAITING',next_try_at=NULL
            WHERE outcome_id=? AND EXISTS (SELECT 1 FROM outcome_video_choices WHERE outcome_id=? AND youtube_video_id=? AND checked_at IS ?)`).bind(r.outcome_id,r.outcome_id,r.youtube_video_id,r.checked_at),
          env.DB.prepare('DELETE FROM outcome_video_choices WHERE outcome_id=? AND youtube_video_id=? AND checked_at IS ?').bind(r.outcome_id,r.youtube_video_id,r.checked_at),
        ];
      }));
    }
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE outcome_video_queue SET choices_checked_at=NULL,status='WAITING',next_try_at=NULL
      WHERE outcome_id IN (SELECT outcome_id FROM outcome_video_choices WHERE checked_at IS NULL OR checked_at <= datetime('now','-30 days'))`),
    env.DB.prepare(`DELETE FROM outcome_video_choices WHERE checked_at IS NULL OR checked_at <= datetime('now','-30 days')`),
  ]);
}

/** 2. the video's own chapter that names the outcome; 3. a short video whose title clearly names it. Both pass the quality rules. */
function pickClip(cands: any[], keys: string[], o: any): { c: any; start: number; end: number; method: 'CHAPTER' | 'SHORT_TITLE'; confidence: number } | null {
  for (const c of cands) if (c.chapter && !qualityIssue({ title: c.title, channel: c.channel, method: 'CHAPTER', chapterTitle: c.chapter.title }, o)) return { c, start: c.chapter.start, end: c.chapter.end, method: 'CHAPTER', confidence: Math.min(1, c.chapter.score) };
  for (const c of cands) if (c.duration <= SHORT_VIDEO && c.titleHit >= Math.min(3, Math.max(2, keys.length)) && !qualityIssue({ title: c.title, channel: c.channel, method: 'SHORT_TITLE' }, o)) return { c, start: 0, end: c.duration, method: 'SHORT_TITLE', confidence: 0.6 };
  return null;
}

/** Tries the videos of one search for the other outcomes of the same grade and subject that have no clip yet. */
async function shareSearch(env: Env, o: any, videos: any[], query: string) {
  if (!videos.length || !o.grade_level) return 0;
  const others = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subtopic,o.grade_level,s.name subject_name FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE o.subject_id=(SELECT subject_id FROM outcomes WHERE id=?) AND o.grade_level=? AND o.id<>? AND o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME'
      AND NOT EXISTS (SELECT 1 FROM outcome_auto_videos a WHERE a.outcome_id=o.id AND a.status='ACTIVE') LIMIT 300`).bind(o.id, o.grade_level, o.id));
  let n = 0;
  for (const x of others) {
    const keys = stems([cleanTopic(x.topic), cleanTopic(x.subtopic), x.title].filter(Boolean).join(' '));
    const blocked = new Set((await all<any>(env.DB.prepare(`SELECT youtube_video_id FROM outcome_video_blocks WHERE outcome_id=?`).bind(x.id))).map((b) => b.youtube_video_id));
    const cands = videos.filter((v) => !blocked.has(v.id)).map((v) => {
      const duration = iso(v.contentDetails?.duration);
      return { id: v.id as string, title: String(v.snippet?.title || 'Konu anlatımı').slice(0, 200), channel: String(v.snippet?.channelTitle || '').slice(0, 120), duration, chapter: matchChapter(parseChapters(v.snippet?.description || '', duration), keys), titleHit: overlap(stems(v.snippet?.title || ''), keys) };
    }).filter((c) => c.duration >= MIN_VIDEO && c.duration <= MAX_VIDEO && !qualityIssue({ title: c.title, channel: c.channel, method: 'ANY' }, x))
      // a shared find must be at least as clear as a searched one: a chapter, or a short video naming the outcome
      .sort((a, b) => (b.chapter ? 2 : 0) + b.titleHit - ((a.chapter ? 2 : 0) + a.titleHit));
    const pick = pickClip(cands, keys, x);
    if (!pick) continue;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,channel_title,duration_seconds,start_seconds,end_seconds,method,confidence,search_query) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(uuid('oav'), x.id, pick.c.id, pick.c.title, pick.c.channel || null, pick.c.duration, pick.start, pick.end, pick.method, Math.round(pick.confidence * 100) / 100, `${query} (aynı arama)`.slice(0, 220)),
      env.DB.prepare(`INSERT INTO outcome_video_queue(outcome_id,priority,status,attempts,last_reason) VALUES(?,0,'FOUND',0,?) ON CONFLICT(outcome_id) DO UPDATE SET status='FOUND',last_reason=excluded.last_reason,next_try_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(x.id, `SHARED · ${pick.method}`),
    ]);
    n++;
  }
  return n;
}

/**
 * Quality check of clips found before the rules of 23 Nov 2026: a clip that fails is removed, never comes back for that
 * outcome, and the outcome is searched again. Each clip is checked once.
 */
export async function recheckAutoVideos(env: Env, limit = 100) {
  const rows = await all<any>(env.DB.prepare(`SELECT a.id,a.outcome_id,a.youtube_video_id,a.title,a.channel_title,a.method,o.title outcome_title,o.topic,o.subtopic,o.grade_level,s.name subject_name
    FROM outcome_auto_videos a JOIN outcomes o ON o.id=a.outcome_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE a.status='ACTIVE' AND a.quality_checked_at IS NULL AND ${skipSql(env)} LIMIT ?`).bind(limit));
  let removed = 0;
  for (const r of rows) {
    const why = qualityIssue({ title: r.title, channel: r.channel_title, method: r.method }, { title: r.outcome_title, topic: r.topic, subtopic: r.subtopic, grade_level: r.grade_level, subject_name: r.subject_name });
    if (!why) { await env.DB.prepare(`UPDATE outcome_auto_videos SET quality_checked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(r.id).run(); continue; }
    await env.DB.batch([
      env.DB.prepare(`UPDATE outcome_auto_videos SET status='REMOVED',removed_reason=?,removed_at=CURRENT_TIMESTAMP,quality_checked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(`KALITE: ${why}`.slice(0, 300), r.id),
      env.DB.prepare(`INSERT OR IGNORE INTO outcome_video_blocks(outcome_id,youtube_video_id) VALUES(?,?)`).bind(r.outcome_id, r.youtube_video_id),
    ]);
    await enqueueOutcome(env, r.outcome_id, 5, true);
    removed++;
  }
  return { checked: rows.length, removed };
}

/** Ask for an outcome to be searched (a learner needed it, or a teacher removed its video). */
export async function enqueueOutcome(env: Env, outcomeId: string, priority = 10, force = false) {
  await env.DB.prepare(`INSERT INTO outcome_video_queue(outcome_id,priority,status) VALUES(?,?,'WAITING')
    ON CONFLICT(outcome_id) DO UPDATE SET priority=max(priority,excluded.priority),
      status=CASE WHEN ? THEN 'WAITING' ELSE status END, next_try_at=CASE WHEN ? THEN NULL ELSE next_try_at END,
      choices_checked_at=CASE WHEN ? THEN NULL ELSE choices_checked_at END,updated_at=CURRENT_TIMESTAMP`)
    .bind(outcomeId, priority, force ? 1 : 0, force ? 1 : 0, force ? 1 : 0).run();
}

/** Cron: search the next outcome(s). Needed outcomes first, then outcomes with questions, grades 5–7 then 9–11 (8 and 12 skipped), Matematik/Fen/Türkçe first and İngilizce last; misses are retried later. */
export async function runOutcomeVideoQueue(env: Env, max = 1) {
  if (!env.YOUTUBE_API_KEY) return 0;
  await recheckAutoVideos(env).catch(() => undefined);
  await refreshTopicChoices(env).catch(error=>console.error('outcome-video-choice-refresh',String(error)));
  let done = 0;
  for (let i = 0; i < max; i++) {
    let next = await one<any>(env.DB.prepare(`SELECT q.outcome_id FROM outcome_video_queue q JOIN outcomes o ON o.id=q.outcome_id WHERE o.active=1 AND (q.status='WAITING' OR (q.status IN ('NOT_FOUND','ERROR') AND q.next_try_at<=datetime('now')))
      AND ${skipSql(env)} AND (q.choices_checked_at IS NULL OR NOT EXISTS (
        SELECT 1 FROM outcome_auto_videos a WHERE a.outcome_id=q.outcome_id AND a.status='ACTIVE'
      )) ORDER BY q.status='WAITING' DESC,q.priority DESC,q.updated_at LIMIT 1`));
    if (!next) next = await one<any>(env.DB.prepare(`SELECT q.outcome_id FROM outcome_video_queue q
      JOIN outcomes o ON o.id=q.outcome_id
      WHERE q.status='FOUND' AND q.choices_checked_at IS NULL AND o.active=1 AND ${skipSql(env)}
      ORDER BY q.priority DESC,q.updated_at LIMIT 1`));
    if (!next) {
      next = await one<any>(env.DB.prepare(`SELECT o.id outcome_id FROM outcomes o WHERE o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME'
        AND NOT EXISTS (SELECT 1 FROM outcome_video_queue q WHERE q.outcome_id=o.id)
        AND NOT EXISTS (SELECT 1 FROM video_links vl WHERE vl.outcome_id=o.id AND vl.link_type='TOPIC' AND vl.approved=1)
        AND ${skipSql(env)}
        ORDER BY EXISTS (SELECT 1 FROM question_outcomes qo WHERE qo.outcome_id=o.id) DESC, CASE WHEN o.grade_level BETWEEN 5 AND 7 THEN 0 WHEN o.grade_level BETWEEN 9 AND 11 THEN 1 ELSE 2 END,
          CASE (SELECT s.name FROM subjects s WHERE s.id=o.subject_id) WHEN 'Matematik' THEN 0 WHEN 'Fen Bilimleri' THEN 0 WHEN 'Türkçe' THEN 0 WHEN 'İngilizce' THEN 2 ELSE 1 END,
          o.grade_level, o.subject_id,o.code,o.id LIMIT 1`));
      if (!next) break;
      await enqueueOutcome(env, next.outcome_id, 0);
    }
    const r = await findOutcomeVideo(env, next.outcome_id);
    if (r.status === 'QUOTA') break;
    // a miss without Gemini's look is tried again soon (Gemini may have a free quota tomorrow); a real miss after 60 days
    const retryDays = r.status === 'FOUND' ? null : r.status === 'ERROR' ? 1 : r.reason === 'NO_SEGMENT' && !r.geminiTried ? (geminiOn(env) ? 2 : 14) : 60;
    await env.DB.prepare(`UPDATE outcome_video_queue SET status=?,attempts=attempts+1,last_reason=?,next_try_at=?,choices_checked_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE choices_checked_at END,updated_at=CURRENT_TIMESTAMP WHERE outcome_id=?`)
      .bind(r.status, (r.detail ? `${r.reason} · ${r.detail}` : r.reason).slice(0, 600), retryDays == null ? null : new Date(Date.now() + retryDays * 86400_000).toISOString().replace('T', ' ').slice(0, 19), r.status==='ERROR'?0:1, next.outcome_id).run();
    done++;
  }
  return done;
}

// ------------------------------------------------------------------ what a learner sees
export type OutcomeClip = { source: 'TEACHER' | 'AUTO'; kind: 'TEACHER_VIDEO' | 'AUTO_YOUTUBE'; id: string; url: string; title: string; start: number; end: number | null; durationSeconds: number | null; method?: string };

export async function teacherVideo(env: Env, outcomeId: string, institutionId: string | null) {
  if (!institutionId) return null;
  return one<any>(env.DB.prepare(`SELECT id,url,title,start_seconds,end_seconds FROM outcome_teacher_videos WHERE institution_id=? AND outcome_id=? AND active=1 ORDER BY created_at DESC LIMIT 1`).bind(institutionId, outcomeId));
}
export async function autoVideo(env: Env, outcomeId: string) {
  return one<any>(env.DB.prepare(`SELECT id,youtube_video_id,title,channel_title,duration_seconds,start_seconds,end_seconds,method FROM outcome_auto_videos WHERE outcome_id=? AND status='ACTIVE' LIMIT 1`).bind(outcomeId));
}
export const watchUrl = (videoId: string, start: number) => `https://www.youtube.com/watch?v=${videoId}${start > 0 ? `&t=${start}s` : ''}`;
export const fromTeacher = (t: any): OutcomeClip => ({ source: 'TEACHER', kind: 'TEACHER_VIDEO', id: t.id, url: t.url, title: t.title, start: Number(t.start_seconds || 0), end: t.end_seconds ?? null, durationSeconds: t.end_seconds ? t.end_seconds - Number(t.start_seconds || 0) : null });
export const fromAuto = (a: any): OutcomeClip => ({ source: 'AUTO', kind: 'AUTO_YOUTUBE', id: a.id, url: watchUrl(a.youtube_video_id, Number(a.start_seconds || 0)), title: a.title, start: Number(a.start_seconds || 0), end: a.end_seconds ?? null, durationSeconds: a.end_seconds != null ? a.end_seconds - Number(a.start_seconds || 0) : a.duration_seconds ?? null, method: a.method });

/** Tiers 2 and 3 (the caller has already looked for the system's approved video). Asks for a search when none. */
export async function outcomeClip(env: Env, outcomeId: string | null, institutionId: string | null): Promise<OutcomeClip | null> {
  if (!outcomeId) return null;
  const t = await teacherVideo(env, outcomeId, institutionId);
  if (t) return fromTeacher(t);
  const a = await autoVideo(env, outcomeId);
  if (a) return fromAuto(a);
  await enqueueOutcome(env, outcomeId, 10).catch(() => undefined);
  return null;
}

async function removeAuto(env: Env, autoId: string, userId: string | null, reason: string) {
  const a = await one<any>(env.DB.prepare(`SELECT id,outcome_id,youtube_video_id FROM outcome_auto_videos WHERE id=? AND status='ACTIVE'`).bind(autoId));
  if (!a) return false;
  await env.DB.batch([
    env.DB.prepare(`UPDATE outcome_auto_videos SET status='REMOVED',removed_by=?,removed_reason=?,removed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(userId, reason, a.id),
    env.DB.prepare(`INSERT OR IGNORE INTO outcome_video_blocks(outcome_id,youtube_video_id) VALUES(?,?)`).bind(a.outcome_id, a.youtube_video_id),
  ]);
  await enqueueOutcome(env, a.outcome_id, 20, true);
  return true;
}

// ------------------------------------------------------------------ API
async function list(env: Env, user: AuthUser, url: URL) {
  const grade = Number(url.searchParams.get('grade')) || null;
  const subjectId = text(url.searchParams.get('subjectId'), 80) || null;
  const q = text(url.searchParams.get('q'), 80);
  const filter = text(url.searchParams.get('filter'), 20) || 'all';
  const inst = user.institution_id || null;
  const where = [`o.active=1`, `coalesce(o.node_type,'OUTCOME')='OUTCOME'`]; const args: unknown[] = [];
  if (grade) { where.push('o.grade_level=?'); args.push(grade); }
  if (subjectId) { where.push('o.subject_id=?'); args.push(subjectId); }
  if (q) { where.push(`(o.code LIKE ? OR o.title LIKE ? OR o.topic LIKE ?)`); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (filter === 'auto') where.push(`EXISTS (SELECT 1 FROM outcome_auto_videos a WHERE a.outcome_id=o.id AND a.status='ACTIVE')`);
  if (filter === 'reported') where.push(`EXISTS (SELECT 1 FROM outcome_auto_videos a JOIN outcome_video_reports r ON r.auto_video_id=a.id WHERE a.outcome_id=o.id AND a.status='ACTIVE')`);
  if (filter === 'none') where.push(`NOT EXISTS (SELECT 1 FROM outcome_auto_videos a WHERE a.outcome_id=o.id AND a.status='ACTIVE') AND NOT EXISTS (SELECT 1 FROM video_links vl WHERE vl.outcome_id=o.id AND vl.link_type='TOPIC' AND vl.approved=1)`);
  const rows = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.grade_level,s.name subject_name,
      (SELECT vl.title FROM video_links vl WHERE vl.outcome_id=o.id AND vl.link_type='TOPIC' AND vl.approved=1 LIMIT 1) system_title,
      (SELECT vl.url FROM video_links vl WHERE vl.outcome_id=o.id AND vl.link_type='TOPIC' AND vl.approved=1 LIMIT 1) system_url,
      q.status queue_status,q.last_reason
    FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id LEFT JOIN outcome_video_queue q ON q.outcome_id=o.id
    WHERE ${where.join(' AND ')} ORDER BY o.grade_level,s.name,o.code,o.id LIMIT 60`).bind(...args));
  const out = [];
  for (const r of rows) {
    const t = await teacherVideo(env, r.id, inst);
    const a = await autoVideo(env, r.id);
    const reports = a ? await one<any>(env.DB.prepare(`SELECT count(*) n FROM outcome_video_reports WHERE auto_video_id=?`).bind(a.id)) : null;
    out.push({ id: r.id, code: r.code, title: r.title, topic: r.topic, grade: r.grade_level, subject: r.subject_name,
      system: r.system_url ? { title: r.system_title, url: r.system_url } : null,
      teacher: t ? fromTeacher(t) : null,
      auto: a ? { ...fromAuto(a), videoId: a.youtube_video_id, channel: a.channel_title, reports: Number(reports?.n || 0) } : null,
      search: r.queue_status ? { status: r.queue_status, reason: r.last_reason } : null });
  }
  const subjects = await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,s.name FROM subjects s JOIN outcomes o ON o.subject_id=s.id WHERE o.active=1 ORDER BY s.name`));
  const u = await usage(env);
  const stats = await one<any>(env.DB.prepare(`SELECT (SELECT count(*) FROM outcome_auto_videos WHERE status='ACTIVE') found,(SELECT count(*) FROM outcome_video_queue WHERE status='WAITING') waiting,(SELECT count(*) FROM outcome_video_queue WHERE status='NOT_FOUND') missed,(SELECT count(*) FROM outcomes WHERE active=1 AND coalesce(node_type,'OUTCOME')='OUTCOME') total`));
  return json({ ok: true, outcomes: out, subjects,
    status: { youtube: !!env.YOUTUBE_API_KEY, gemini: geminiOn(env), today: { searches: u.searches, searchCap: SEARCH_CAP, geminiMinutes: Math.round(u.gemini_seconds / 60), geminiMinuteCap: GEMINI_SECONDS_CAP / 60 }, found: Number(stats?.found || 0), waiting: Number(stats?.waiting || 0), missed: Number(stats?.missed || 0), total: Number(stats?.total || 0) } });
}

function clipTimes(b: any) {
  const start = b?.start == null || b.start === '' ? 0 : timeToSeconds(b.start);
  const end = b?.end == null || b.end === '' ? null : timeToSeconds(b.end);
  if (start == null || (b?.end && end == null)) return 'Zamanı dakika:saniye (ör. 3:15) olarak yazın.';
  if (end != null && end - start < 10) return 'Bitiş, başlangıçtan en az 10 saniye sonra olmalı.';
  return { start, end };
}

export async function handleOutcomeVideos(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/outcome-videos')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  const p = url.pathname.replace(/\/+$/, '');
  let m = p.match(/^\/api\/outcome-videos\/auto\/([^/]+)\/report$/);
  if (m && request.method === 'POST') {
    if (user.role !== 'STUDENT') return fail(403, 'FORBIDDEN', 'Bildirimi öğrenci yapar.');
    const a = await one<any>(env.DB.prepare(`SELECT id FROM outcome_auto_videos WHERE id=? AND status='ACTIVE'`).bind(m[1]));
    if (!a) return fail(404, 'NOT_FOUND', 'Video bulunamadı.');
    await env.DB.prepare(`INSERT OR IGNORE INTO outcome_video_reports(auto_video_id,user_id,institution_id) VALUES(?,?,?)`).bind(a.id, user.id, user.institution_id || null).run();
    const n = await one<any>(env.DB.prepare(`SELECT count(*) n FROM outcome_video_reports WHERE auto_video_id=?`).bind(a.id));
    const removed = Number(n?.n || 0) >= REPORTS_TO_REMOVE && await removeAuto(env, a.id, null, 'STUDENT_REPORTS');
    return json({ ok: true, removed: !!removed });
  }
  if (!STAFF.includes(user.role)) return fail(403, 'FORBIDDEN', 'Kazanım videoları öğretmen ve yöneticilere açıktır.');
  if (p === '/api/outcome-videos' && request.method === 'GET') return list(env, user, url);
  if (p === '/api/outcome-videos/catalog-coverage' && request.method === 'GET') {
    const rows = await all<any>(env.DB.prepare(`WITH counts AS (
      SELECT o.id,v.academic_year,v.program_version,o.grade_level grade,o.subject_id subject_id,coalesce(s.name,'—') subject,
        (SELECT COUNT(*) FROM outcome_video_choices c WHERE c.outcome_id=o.id AND c.checked_at > datetime('now','-30 days')
          AND NOT EXISTS (SELECT 1 FROM outcome_video_blocks b WHERE b.outcome_id=c.outcome_id AND b.youtube_video_id=c.youtube_video_id)) choices
      FROM outcomes o JOIN curriculum_versions v ON v.id=o.curriculum_version_id AND v.verified=1 AND v.authority='MEB' AND v.grade_level=o.grade_level
      LEFT JOIN subjects s ON s.id=o.subject_id
      WHERE o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME'
    ) SELECT academic_year academicYear,program_version programVersion,grade,subject_id subjectId,subject,count(*) total,
      sum(choices=0) none,sum(choices BETWEEN 1 AND 3) partial,sum(choices BETWEEN 4 AND 5) ready
      FROM counts GROUP BY academic_year,program_version,grade,subject_id,subject ORDER BY academic_year DESC,grade,subject`));
    return json({ok:true,rows});
  }
  if (p === '/api/outcome-videos/catalog-queue' && request.method === 'POST') {
    if (user.role !== 'SUPER_ADMIN') return fail(403,'FORBIDDEN','Toplu arama için Süper Admin yetkisi gerekiyor.');
    if (!env.YOUTUBE_API_KEY) return fail(409,'YOUTUBE_NOT_CONFIGURED','YouTube API anahtarı tanımlı değil.');
    const body = await request.json().catch(()=>null) as any;
    const year = text(body?.academicYear,9), program = text(body?.programVersion,120);
    const grade = Number(body?.grade), subjectId = text(body?.subjectId,100);
    if (!/^\d{4}-\d{4}$/.test(year) || !program || !Number.isInteger(grade) || grade < 1 || grade > 12 || !subjectId)
      return fail(400,'INVALID_SCOPE','Eğitim yılı, program, sınıf ve ders seçilmeli.');
    if (skipGrades(env).includes(grade)) return fail(409,'GRADE_SKIPPED','Bu sınıf otomatik arama kapsamının dışında.');
    const result = await env.DB.prepare(`INSERT INTO outcome_video_queue(outcome_id,priority,status,choices_checked_at)
      SELECT o.id,20,'WAITING',NULL FROM outcomes o JOIN curriculum_versions v ON v.id=o.curriculum_version_id
      WHERE o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME' AND o.grade_level=? AND o.subject_id=?
        AND v.grade_level=o.grade_level AND v.academic_year=? AND v.program_version=? AND v.verified=1 AND v.authority='MEB'
        AND (SELECT count(*) FROM outcome_video_choices c WHERE c.outcome_id=o.id AND c.checked_at > datetime('now','-30 days')
          AND NOT EXISTS (SELECT 1 FROM outcome_video_blocks b WHERE b.outcome_id=c.outcome_id AND b.youtube_video_id=c.youtube_video_id)) < 4
      ON CONFLICT(outcome_id) DO UPDATE SET priority=max(priority,excluded.priority),status='WAITING',
        choices_checked_at=NULL,next_try_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE outcome_video_queue.status<>'WAITING' OR outcome_video_queue.priority<20`).bind(grade,subjectId,year,program).run();
    return json({ok:true,queued:Number(result.meta.changes || 0)});
  }
  const catalogItem = p.match(/^\/api\/outcome-videos\/catalog\/([^/]+)\/([A-Za-z0-9_-]{11})$/);
  if (catalogItem && request.method === 'DELETE') {
    if (user.role !== 'SUPER_ADMIN') return fail(403,'FORBIDDEN','Katalog düzenlemesi için Süper Admin yetkisi gerekiyor.');
    const [,outcomeId,videoId] = catalogItem;
    const found = await one(env.DB.prepare('SELECT 1 FROM outcome_video_choices WHERE outcome_id=? AND youtube_video_id=?').bind(outcomeId,videoId));
    if (!found) return fail(404,'NOT_FOUND','Seçenek bulunamadı.');
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO outcome_video_blocks(outcome_id,youtube_video_id) VALUES(?,?)').bind(outcomeId,videoId),
      env.DB.prepare('DELETE FROM outcome_video_choices WHERE outcome_id=? AND youtube_video_id=?').bind(outcomeId,videoId),
      env.DB.prepare(`UPDATE outcome_auto_videos SET status='REMOVED',removed_by=?,removed_at=CURRENT_TIMESTAMP,
        removed_reason='CATALOG_REMOVED' WHERE outcome_id=? AND youtube_video_id=? AND status='ACTIVE'`).bind(user.id,outcomeId,videoId),
    ]);
    await enqueueOutcome(env,outcomeId,30,true);
    return json({ok:true});
  }
  const catalog = p.match(/^\/api\/outcome-videos\/catalog\/([^/]+)$/);
  if (catalog && request.method === 'GET') {
    const { questionTopicVideos } = await import('./question-topic-videos');
    return json({ok:true,videos:await questionTopicVideos(env,catalog[1],user.institution_id || null)});
  }
  if (p === '/api/outcome-videos/coverage' && request.method === 'GET') {
    const rows = await all<any>(env.DB.prepare(`SELECT o.grade_level grade,coalesce(s.name,'—') subject,count(*) total,
        sum(EXISTS (SELECT 1 FROM video_links vl WHERE vl.outcome_id=o.id AND vl.link_type='TOPIC' AND vl.approved=1)) system,
        sum(EXISTS (SELECT 1 FROM outcome_teacher_videos t WHERE t.outcome_id=o.id AND t.institution_id=? AND t.active=1)) teacher,
        sum(EXISTS (SELECT 1 FROM outcome_auto_videos a WHERE a.outcome_id=o.id AND a.status='ACTIVE')) auto,
        sum(EXISTS (SELECT 1 FROM outcome_video_queue q WHERE q.outcome_id=o.id AND q.status='NOT_FOUND')) missed
      FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id WHERE o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME'
      GROUP BY o.grade_level,s.name ORDER BY o.grade_level,s.name`).bind(user.institution_id || ''));
    return json({ ok: true, rows: rows.map((r) => ({ grade: r.grade, subject: r.subject, total: Number(r.total), system: Number(r.system || 0), teacher: Number(r.teacher || 0), auto: Number(r.auto || 0), missed: Number(r.missed || 0) })) });
  }
  m = p.match(/^\/api\/outcome-videos\/auto\/([^/]+)\/remove$/);
  if (m && request.method === 'POST') {
    const b = await request.json().catch(() => ({})) as any;
    if (!(await removeAuto(env, m[1], user.id, text(b?.reason, 300) || 'TEACHER_REMOVED'))) return fail(404, 'NOT_FOUND', 'Video bulunamadı.');
    await audit(env.DB, user.id, user.institution_id || null, 'OUTCOME_AUTO_VIDEO_REMOVED', 'outcome_auto_video', m[1], { reason: text(b?.reason, 300) || null });
    return json({ ok: true });
  }
  m = p.match(/^\/api\/outcome-videos\/search\/([^/]+)$/);
  if (m && request.method === 'POST') {
    const oc = await one<any>(env.DB.prepare(`SELECT grade_level FROM outcomes WHERE id=?`).bind(m[1]));
    if (!oc) return fail(404, 'NOT_FOUND', 'Kazanım bulunamadı.');
    if (skipGrades(env).includes(Number(oc.grade_level))) return fail(409, 'GRADE_SKIPPED', `${oc.grade_level}. sınıf müfredatı 2027-2028'de Maarif modeline geçiyor; bu sınıf için otomatik video aranmıyor. Okulunuzun videosunu ekleyebilirsiniz.`);
    await enqueueOutcome(env, m[1], 30, true);
    return json({ ok: true });
  }
  if (p === '/api/outcome-videos/teacher' && request.method === 'POST') {
    if (user.role === 'SUPER_ADMIN' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Okulun kendi videosunu öğretmen ya da kurum yöneticisi ekler.');
    const b = await request.json().catch(() => ({})) as any;
    const outcomeId = text(b?.outcomeId, 80); const link = text(b?.url, 400); const title = text(b?.title, 200);
    if (!(await one(env.DB.prepare(`SELECT 1 FROM outcomes WHERE id=?`).bind(outcomeId)))) return fail(404, 'NOT_FOUND', 'Kazanım bulunamadı.');
    if (!youtubeId(link) && !/^https:\/\/\S+$/.test(link)) return fail(400, 'VALIDATION_ERROR', 'Geçerli bir https video bağlantısı yazın.');
    if (!title) return fail(400, 'VALIDATION_ERROR', 'Başlık yazın.');
    const times = clipTimes(b); if (typeof times === 'string') return fail(400, 'VALIDATION_ERROR', times);
    const id = uuid('otv');
    await env.DB.batch([
      env.DB.prepare(`UPDATE outcome_teacher_videos SET active=0 WHERE institution_id=? AND outcome_id=? AND active=1`).bind(user.institution_id, outcomeId),
      env.DB.prepare(`INSERT INTO outcome_teacher_videos(id,institution_id,outcome_id,url,title,start_seconds,end_seconds,added_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id, user.institution_id, outcomeId, link, title, times.start, times.end, user.id),
    ]);
    await audit(env.DB, user.id, user.institution_id, 'OUTCOME_TEACHER_VIDEO_ADDED', 'outcome_teacher_video', id, { outcomeId });
    return json({ ok: true, id }, 201);
  }
  m = p.match(/^\/api\/outcome-videos\/teacher\/([^/]+)$/);
  if (m && request.method === 'DELETE') {
    const r = await env.DB.prepare(`UPDATE outcome_teacher_videos SET active=0 WHERE id=? AND institution_id=? AND active=1`).bind(m[1], user.institution_id || '').run();
    if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Video bulunamadı.');
    await audit(env.DB, user.id, user.institution_id || null, 'OUTCOME_TEACHER_VIDEO_REMOVED', 'outcome_teacher_video', m[1], {});
    return json({ ok: true });
  }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
