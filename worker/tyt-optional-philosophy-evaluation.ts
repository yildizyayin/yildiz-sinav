import type { CanonicalRecord, Env } from './types';
import { all, one, uuid } from './lib/db';

type AnyRow = Record<string, any>;
type OptionalStatus = 'CORRECT' | 'WRONG' | 'BLANK' | 'INVALID';

function acceptedAnswers(value: unknown, primary: string): string[] {
  const fallback = String(primary || '').trim().toUpperCase();
  const raw = String(value ?? '').trim();
  if (!raw) return fallback ? [fallback] : [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const values = parsed.map((item) => String(item ?? '').trim().toUpperCase()).filter(Boolean);
      return [...new Set(values.length ? values : [fallback])].filter(Boolean);
    }
  } catch {
    // Legacy rows may use delimited text.
  }
  const values = raw.split(/[|/,;]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  return [...new Set(values.length ? values : [fallback])].filter(Boolean);
}

function assess(rawValue: unknown, key: AnyRow): OptionalStatus {
  const questionStatus = String(key.question_status || 'ACTIVE').toUpperCase();
  if (questionStatus === 'CANCELLED' || questionStatus === 'EXCLUDED') return 'INVALID';
  const raw = String(rawValue ?? '').trim().toUpperCase();
  if (!raw || raw === '_') return 'BLANK';
  return acceptedAnswers(key.accepted_answers, key.correct_answer).includes(raw) ? 'CORRECT' : 'WRONG';
}

export async function persistTytOptionalPhilosophyEvidence(env: Env, batchId: string): Promise<void> {
  const batch = await one<AnyRow>(env.DB.prepare('SELECT id,exam_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return;

  const keys = await all<AnyRow>(env.DB.prepare(`
    SELECT oak.*,s.code subject_code
    FROM exam_optional_answer_keys oak
    JOIN subjects s ON s.id=oak.subject_id
    WHERE oak.exam_id=? AND s.code='TYT_FEL'
    ORDER BY oak.booklet_code,oak.question_no
  `).bind(batch.exam_id));
  if (!keys.length) return;

  const participants = await all<AnyRow>(env.DB.prepare(`
    SELECT ep.id participant_id,ep.booklet_code,sr.canonical_json
    FROM exam_participants ep
    JOIN scan_records sr ON sr.id=ep.scan_record_id
    WHERE sr.batch_id=?
  `).bind(batchId));

  const prepared = participants.map((participant) => {
    let record: CanonicalRecord;
    try { record = JSON.parse(participant.canonical_json) as CanonicalRecord; }
    catch { throw new Error('TYT_OPTIONAL_RECORD_INVALID'); }

    const sequence = record.answers_by_subject?.TYT_FEL;
    const booklet = String(participant.booklet_code || record.booklet || '').toUpperCase();
    const bookletKeys = keys.filter((key) => String(key.booklet_code).toUpperCase() === booklet);

    if (sequence != null && sequence !== '' && bookletKeys.length !== 5) {
      throw new Error(`TYT_OPTIONAL_KEY_INCOMPLETE_${booklet || 'UNKNOWN'}`);
    }
    return { participant, sequence, booklet, bookletKeys };
  });

  for (const { participant, sequence, booklet, bookletKeys } of prepared) {
    const statements: D1PreparedStatement[] = [
      env.DB.prepare('DELETE FROM tyt_optional_philosophy_answers WHERE participant_id=?').bind(participant.participant_id),
      env.DB.prepare('DELETE FROM tyt_optional_philosophy_results WHERE participant_id=?').bind(participant.participant_id),
    ];

    if (sequence == null || sequence === '') {
      await env.DB.batch(statements);
      continue;
    }

    let correct = 0, wrong = 0, blank = 0, invalid = 0, evidence = 0;
    for (let i = 0; i < bookletKeys.length; i++) {
      const key = bookletKeys[i];
      const status = assess(sequence[i], key);
      const raw = String(sequence[i] || '').trim().toUpperCase();
      if (status === 'CORRECT') { correct++; evidence++; }
      else if (status === 'WRONG') { wrong++; evidence++; }
      else if (status === 'BLANK') { blank++; evidence++; }
      else invalid++;
      statements.push(env.DB.prepare(`
        INSERT INTO tyt_optional_philosophy_answers(id,participant_id,answer_key_id,answer,status)
        VALUES(?,?,?,?,?)
      `).bind(uuid('tytpa'), participant.participant_id, key.id, raw && raw !== '_' ? raw : null, status));
    }

    const subjectId = bookletKeys[0].subject_id;
    const successPercent = evidence ? (correct / evidence) * 100 : 0;
    statements.push(env.DB.prepare(`
      INSERT INTO tyt_optional_philosophy_results(
        id,participant_id,exam_id,subject_id,booklet_code,correct_count,wrong_count,blank_count,invalid_count,evidence_count,success_percent
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      uuid('tytpr'), participant.participant_id, batch.exam_id, subjectId, booklet,
      correct, wrong, blank, invalid, evidence, successPercent,
    ));
    await env.DB.batch(statements);
  }
}
