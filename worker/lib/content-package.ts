/**
 * İçerik Paketi (owner, 26 Nov 2026: "bu dosyayı en uygun hale getirerek entegrasyonu sağlayalım").
 * A ready-made package — questions with images, a solution video per question and a topic video per outcome —
 * enters ANUNEX through the Super Admin's browser:
 *  1. preview: per outcome, which questions are ready, already in, invalid, and which media still need uploading;
 *  2. media:   each file is sent once; the server hashes it, refuses it unless the hash matches, and stores it at the
 *              content-addressed (sealed) key the review gate already trusts — so a re-upload costs nothing;
 *  3. commit:  ready questions enter the bank as REVIEW with origin AI_GENERATED (never APPROVED: the owner's review
 *              gate still decides), with their sealed image and solution video; the topic video is kept for its outcome.
 * The package's own id (e.g. FB511-01) makes a re-run add nothing. Outcomes must be official, verified and active for
 * 2027–2028 and of the package's grade; an outcome that is missing (e.g. FB.5.7.1) holds its questions back.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';

export const PACKAGE_ACADEMIC_YEAR = '2027-2028';
export const PACKAGE_MAX_QUESTIONS = 60;          // per preview / commit call: the browser sends one outcome at a time
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const COPYRIGHTS = ['OWNED', 'LICENSED', 'PUBLIC_DOMAIN', 'USER_PROVIDED'];
const LABELS = ['A', 'B', 'C', 'D'];
const SHA = /^[0-9a-f]{64}$/;
export const mediaKey = (sha: string) => `question-media/immutable/${sha.slice(0, 2)}/${sha}`;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function videoCode() { const b = crypto.getRandomValues(new Uint8Array(7)); return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join(''); }

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
type Media = { sha256: string; bytes: number };
export type PackageQuestion = { id: string; outcome: string; stem: string; options: Record<string, string>; answer: string; solution: string; hint?: string | null; difficulty: number; image?: (Media & { alt?: string | null }) | null; video?: Media | null };
export type PackageOutcome = { code: string; topic?: (Media & { seconds?: number | null }) | null };
type Body = { package?: unknown; gradeLevel?: unknown; sourceLabel?: unknown; copyrightStatus?: unknown; outcome?: PackageOutcome; questions?: PackageQuestion[]; confirm?: unknown };

function media(v: any, kind: string, errors: string[]): Media | null {
  if (!v) return null;
  const sha256 = str(v.sha256).toLowerCase(), bytes = Number(v.bytes);
  if (!SHA.test(sha256) || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_MEDIA_BYTES) { errors.push(`${kind} için geçerli bir SHA-256 özeti ve boyut gerekli.`); return null; }
  return { sha256, bytes };
}
export function checkQuestion(q: any, outcomeCode: string) {
  const errors: string[] = [];
  const id = str(q?.id);
  if (!/^[A-Z]{2,4}\d{3,4}-\d{2,3}$/.test(id)) errors.push('Soru kimliği FB511-01 biçiminde olmalı.');
  if (str(q?.outcome) !== outcomeCode) errors.push(`Soru ${outcomeCode} kazanımına ait değil.`);
  const stem = str(q?.stem); if (!stem || stem.length > 3000) errors.push('Soru kökü boş ya da çok uzun.');
  const opts = q?.options && typeof q.options === 'object' ? q.options : {};
  const options = LABELS.map((label) => ({ label, text: str(opts[label]) }));
  if (Object.keys(opts).sort().join('') !== 'ABCD' || options.some((o) => !o.text)) errors.push('Dört şık (A–D) dolu olmalı.');
  else if (new Set(options.map((o) => o.text.toLocaleLowerCase('tr-TR'))).size < 4) errors.push('İki şık aynı.');
  const answer = str(q?.answer).toUpperCase(); if (!LABELS.includes(answer)) errors.push('Doğru cevap A–D olmalı.');
  const solution = str(q?.solution); if (!solution) errors.push('Yazılı çözüm gerekli.');
  const difficulty = Number(q?.difficulty); if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) errors.push('Zorluk 1–6 olmalı.');
  const image = media(q?.image, 'Görsel', errors), video = media(q?.video, 'Çözüm videosu', errors);
  if (!video) errors.push('Çözüm videosu gerekli.');
  return { errors, row: { id, stem, options, answer, solution, hint: str(q?.hint) || null, difficulty, image: image ? { ...image, alt: str(q?.image?.alt) || 'Soru görseli' } : null, video } };
}

async function present(env: Env, sha: string) {
  const head = await env.FILES.head(mediaKey(sha));
  return !!head && String(head.customMetadata?.sha256 || '') === sha;
}

async function plan(env: Env, body: Body) {
  const pkg = str(body.package), grade = Number(body.gradeLevel), sourceLabel = str(body.sourceLabel), copyright = str(body.copyrightStatus).toUpperCase();
  const top: string[] = [];
  if (!/^[a-z0-9-]{3,40}$/.test(pkg)) top.push('Paket adı küçük harf, rakam ve tire olmalı (ör. fen-5).');
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) top.push('Sınıf düzeyi gerekli.');
  if (!sourceLabel || sourceLabel.length > 80) top.push('Kaynak etiketi gerekli.');
  if (!COPYRIGHTS.includes(copyright)) top.push('Telif durumu OWNED, LICENSED, PUBLIC_DOMAIN ya da USER_PROVIDED olmalı.');
  const code = str(body.outcome?.code);
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!code) top.push('Kazanım kodu gerekli.');
  if (questions.length > PACKAGE_MAX_QUESTIONS) top.push(`Bir seferde en çok ${PACKAGE_MAX_QUESTIONS} soru gönderilebilir.`);
  let outcome: any = null, outcomeError: string | null = null;
  if (code) {
    const found = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subject_id,o.grade_level FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.code=? AND cv.academic_year=? AND cv.verified=1 AND o.official=1 AND o.active=1`).bind(code, PACKAGE_ACADEMIC_YEAR));
    const same = found.filter((o) => Number(o.grade_level) === grade);
    if (!same.length) outcomeError = `${code} doğrulanmış ${PACKAGE_ACADEMIC_YEAR} resmî ${grade}. sınıf kazanımları arasında yok; bu kazanımın soruları bekletilir.`;
    else if (same.length > 1) outcomeError = `${code} birden fazla kazanıma karşılık geliyor; elle eşleştirilmeli.`;
    else outcome = same[0];
  }
  const topicErrors: string[] = [];
  const topic = media(body.outcome?.topic, 'Konu videosu', topicErrors);
  const topicDone = outcome ? await one<any>(env.DB.prepare(`SELECT video_code FROM content_package_topics WHERE outcome_id=? AND package=?`).bind(outcome.id, pkg)) : null;
  const seen = new Set<string>(), seenStem = new Set<string>();
  const items: any[] = [];
  for (const q of questions) {
    const c = checkQuestion(q, code);
    const r = c.row; const errors = [...c.errors], warnings: string[] = [];
    if (r.id && seen.has(r.id)) errors.push('Bu soru kimliği pakette iki kez geçiyor.'); seen.add(r.id);
    const stemKey = r.stem.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
    if (seenStem.has(stemKey)) warnings.push('Aynı kök bu kazanımda başka bir soruda da var.'); seenStem.add(stemKey);
    let status = 'READY', questionId: string | null = null;
    const done = r.id ? await one<any>(env.DB.prepare(`SELECT question_id,video_code FROM content_package_items WHERE external_id=?`).bind(r.id)) : null;
    if (done) { status = 'EXISTS'; questionId = done.question_id; }
    else if (top.length || outcomeError || errors.length) status = outcomeError && !errors.length ? 'HELD' : 'INVALID';
    else {
      const copy = await one<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE grade_level=? AND subject_id=? AND question_type='MULTIPLE_CHOICE' AND review_status<>'ARCHIVED' AND lower(trim(stem_text))=lower(trim(?)) AND options_json=? LIMIT 1`)
        .bind(grade, outcome.subject_id, r.stem, JSON.stringify(r.options)));
      if (copy) { status = 'DUPLICATE'; questionId = copy.id; }
    }
    const need: Array<Media & { kind: string }> = [];
    if (status === 'READY') for (const [kind, m] of [['IMAGE', r.image], ['VIDEO', r.video]] as const) if (m && !(await present(env, m.sha256))) need.push({ kind, sha256: m.sha256, bytes: m.bytes });
    if (status === 'READY' && need.length) status = 'NEEDS_MEDIA';
    items.push({ id: r.id, status, errors, warnings, questionId, need, row: r });
  }
  const topicNeed = outcome && topic && !topicDone && !(await present(env, topic.sha256)) ? [{ kind: 'TOPIC', ...topic }] : [];
  return { pkg, grade, sourceLabel, copyright, top, outcome, outcomeError, topic, topicErrors, topicDone, topicNeed, items, seconds: Number(body.outcome?.topic?.seconds) || null };
}

const view = (p: Awaited<ReturnType<typeof plan>>) => {
  const count = (s: string) => p.items.filter((i) => i.status === s).length;
  return {
    ok: true, academicYear: PACKAGE_ACADEMIC_YEAR, errors: p.top,
    outcome: p.outcome ? { code: p.outcome.code, title: p.outcome.title } : null, outcomeError: p.outcomeError,
    topic: { status: p.topicDone ? 'EXISTS' : p.topicErrors.length ? 'INVALID' : !p.topic ? 'NONE' : p.topicNeed.length ? 'NEEDS_MEDIA' : 'READY', errors: p.topicErrors, code: p.topicDone?.video_code || null },
    summary: { total: p.items.length, ready: count('READY'), needsMedia: count('NEEDS_MEDIA'), exists: count('EXISTS'), duplicate: count('DUPLICATE'), held: count('HELD'), invalid: count('INVALID') },
    need: [...p.topicNeed, ...p.items.flatMap((i) => i.need)].filter((m, k, a) => a.findIndex((x) => x.sha256 === m.sha256) === k),
    items: p.items.map((i) => ({ id: i.id, status: i.status, errors: i.errors, warnings: i.warnings, questionId: i.questionId })),
  };
};

async function uniqueCode(env: Env, used: Set<string>) {
  for (let k = 0; k < 8; k++) {
    const c = videoCode();
    if (used.has(c)) continue;
    const taken = await one<any>(env.DB.prepare(`SELECT 1 x FROM content_package_items WHERE video_code=? UNION ALL SELECT 1 FROM content_package_topics WHERE video_code=? LIMIT 1`).bind(c, c));
    if (!taken) { used.add(c); return c; }
  }
  throw new Error('VIDEO_CODE_EXHAUSTED');
}

async function commit(env: Env, user: AuthUser, p: Awaited<ReturnType<typeof plan>>) {
  const stmts: D1PreparedStatement[] = [], created: Array<{ id: string; questionId: string; code: string }> = [], used = new Set<string>();
  for (const i of p.items.filter((x) => x.status === 'READY')) {
    const r = i.row, o = p.outcome, qid = uuid('q'), code = await uniqueCode(env, used);
    stmts.push(env.DB.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,topic,question_type,difficulty_level,option_count,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by,origin_kind)
      SELECT ?,'PLATFORM',?,?,?,?,'MULTIPLE_CHOICE',?,4,?,?,?,?,?,?,'REVIEW',?,'AI_GENERATED' WHERE NOT EXISTS(SELECT 1 FROM content_package_items WHERE external_id=?)`)
      .bind(qid, PACKAGE_ACADEMIC_YEAR, p.grade, o.subject_id, o.topic || null, r.difficulty, r.stem, JSON.stringify(r.options), r.answer, r.solution, `${p.sourceLabel} · ${r.id}`.slice(0, 120), p.copyright, user.id, r.id));
    stmts.push(env.DB.prepare(`INSERT INTO question_learning_links(question_id,node_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`).bind(qid, `ln_${o.id}`, qid));
    const asset = (type: string, placement: string, m: Media, mime: string, alt: string | null) => env.DB.prepare(`INSERT INTO question_assets(id,question_id,asset_type,r2_key,external_url,title,approved,placement,option_label,sort_order,alt_text,mime_type,rights_status,byte_sha256,byte_size,sealed_at)
      SELECT ?,?,?,?,NULL,NULL,1,?,NULL,0,?,?,'VERIFIED',?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`).bind(uuid('qa'), qid, type, mediaKey(m.sha256), placement, alt, mime, m.sha256, m.bytes, qid);
    if (r.image) stmts.push(asset('IMAGE', 'STEM', r.image, 'image/jpeg', r.image.alt));
    stmts.push(asset('SOLUTION_VIDEO', 'SOLUTION', r.video!, 'video/mp4', `${r.id} çözüm videosu`));
    stmts.push(env.DB.prepare(`INSERT INTO content_package_items(external_id,package,question_id,outcome_id,hint,video_code,created_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`)
      .bind(r.id, p.pkg, qid, o.id, r.hint, code, user.id, qid));
    created.push({ id: r.id, questionId: qid, code });
  }
  let topicCode: string | null = null;
  if (p.outcome && p.topic && !p.topicDone && !p.topicNeed.length && !p.topicErrors.length) {
    const vid = uuid('lv'); topicCode = await uniqueCode(env, used);
    stmts.push(env.DB.prepare(`INSERT INTO learning_videos(id,provider,external_id,url,title,grade_level,subject_id,duration_seconds,approved,active) VALUES(?,'R2',?,?,?,?,?,?,0,1)
      ON CONFLICT(provider,url) DO NOTHING`).bind(vid, p.topic.sha256, `r2:${mediaKey(p.topic.sha256)}`, `Konu anlatımı · ${p.outcome.code}`, p.grade, p.outcome.subject_id, p.seconds ? Math.round(p.seconds) : null));
    stmts.push(env.DB.prepare(`INSERT INTO content_package_topics(outcome_id,package,learning_video_id,r2_key,byte_sha256,byte_size,video_code,created_by)
      SELECT ?,?,id,?,?,?,?,? FROM learning_videos WHERE provider='R2' AND url=?`).bind(p.outcome.id, p.pkg, mediaKey(p.topic.sha256), p.topic.sha256, p.topic.bytes, topicCode, user.id, `r2:${mediaKey(p.topic.sha256)}`));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { created, topicCode };
}

async function sha256(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export async function handleContentPackage(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/admin\/content-package\/(preview|commit|media\/([0-9a-f]{64}))$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN' || user.must_change_password) return fail(403, 'FORBIDDEN', 'İçerik paketini yalnız Süper Admin aktarır.');
  if (request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (m[2]) {
    if (request.method !== 'PUT') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const sha = m[2], type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'video/mp4'].includes(type)) return fail(415, 'UNSUPPORTED_MEDIA', 'Yalnız JPEG, PNG ve MP4 yüklenebilir.');
    if (await present(env, sha)) return json({ ok: true, sha256: sha, stored: false });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_BYTES) return fail(413, 'MEDIA_TOO_LARGE', 'Dosya boş ya da 50 MB sınırının üzerinde.');
    if ((await sha256(bytes)) !== sha) return fail(422, 'MEDIA_HASH_MISMATCH', 'Dosyanın özeti paketteki özetle uyuşmuyor; dosya yüklenmedi.');
    await env.FILES.put(mediaKey(sha), bytes, { httpMetadata: { contentType: type }, customMetadata: { sha256: sha, source: 'content-package' } });
    if (!(await present(env, sha))) return fail(503, 'MEDIA_STORE_FAILED', 'Dosya depolamada doğrulanamadı; yeniden deneyin.');
    return json({ ok: true, sha256: sha, stored: true });
  }
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return fail(400, 'BODY_REQUIRED', 'Paket bilgisi okunamadı.');
  const p = await plan(env, body);
  if (m[1] === 'preview') return json(view(p));
  if (body.confirm !== true) return fail(400, 'CONFIRMATION_REQUIRED', 'Aktarımı onaylayın.');
  if (p.top.length) return json({ ...view(p), ok: false }, 400);
  const out = await commit(env, user, p);
  if (out.created.length || out.topicCode) await audit(env.DB, user.id, null, 'CONTENT_PACKAGE_IMPORTED', 'content_package', p.pkg, { outcome: p.outcome?.code, questions: out.created.length, topic: !!out.topicCode });
  return json({ ...view(await plan(env, body)), created: out.created.length, topicCode: out.topicCode });
}
