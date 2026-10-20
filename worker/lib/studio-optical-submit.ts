/**
 * A018: binds a scanned Studio optical sheet to the exact printed questions.
 * Pure decisions so they can be tested without D1:
 * - the booklet read from the sheet must match the template it was scanned with;
 *   a blank/double booklet mark needs an explicit teacher confirmation;
 * - answers arrive by printed position and are mapped server-side to the stored booklet order;
 * - an existing result is never silently replaced.
 */
export type SheetRow = { id: string; correct_answer: string | null };
export type BookletDecision = { ok: true } | { ok: false; status: number; code: string; message: string };

export function decideBooklet(templateBooklet: string, readBooklet: unknown, confirmed: unknown): BookletDecision {
  const read = typeof readBooklet === 'string' && readBooklet.trim() ? readBooklet.trim().toUpperCase() : null;
  if (read && !['A', 'B'].includes(read)) return { ok: false, status: 400, code: 'INVALID_READ_BOOKLET', message: 'Okunan kitapçık değeri geçersiz.' };
  if (read && read !== templateBooklet) return { ok: false, status: 409, code: 'BOOKLET_MISMATCH', message: `Optikte ${read} kitapçığı işaretli, ama ${templateBooklet} kitapçığı şablonuyla okutuldu. ${read} kitapçığını seçip tekrar okutun.` };
  if (!read && confirmed !== true) return { ok: false, status: 409, code: 'BOOKLET_UNREAD', message: `Optikte kitapçık işareti okunamadı (boş veya çift). Öğrencinin ${templateBooklet} kitapçığını çözdüğünü doğrulayıp onaylayın.` };
  return { ok: true };
}

export type Evaluation =
  | { ok: true; responses: { questionId: string; selectedAnswer: string | null; isCorrect: boolean; sourceChannel: 'OPTICAL'; position: number }[]; correct: number; total: number; score: number; blank: number }
  | { ok: false; status: number; code: string; message: string };

const VALID = new Set(['A', 'B', 'C', 'D', 'E']);

/** `answers` is the engine's sequence ("AC_B…", '_' = blank/unclear) or a legacy {questionId: option} map. */
export function evaluateSheet(rows: SheetRow[], answers: unknown): Evaluation {
  if (!rows.length) return { ok: false, status: 404, code: 'BOOKLET_EMPTY', message: 'Kitapçık soruları bulunamadı.' };
  let selected: (string | null)[];
  if (typeof answers === 'string') {
    const seq = answers.trim().toUpperCase();
    if (seq.length !== rows.length) return { ok: false, status: 400, code: 'ANSWER_COUNT_MISMATCH', message: `Optikte ${seq.length} soru okundu, kitapçıkta ${rows.length} soru var. Doğru kitapçık şablonuyla tekrar okutun.` };
    if (/[^A-E_]/.test(seq)) return { ok: false, status: 400, code: 'INVALID_ANSWER_VALUE', message: 'Okunan cevaplarda geçersiz değer var.' };
    selected = [...seq].map(ch => (ch === '_' ? null : ch));
  } else if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    const map = answers as Record<string, unknown>;
    selected = rows.map(row => { const v = String(map[row.id] ?? '').trim().toUpperCase(); return VALID.has(v) ? v : null; });
  } else return { ok: false, status: 400, code: 'ANSWERS_REQUIRED', message: 'Okunan cevaplar gereklidir.' };
  let correct = 0, blank = 0;
  const responses = rows.map((row, i) => {
    const answer = selected[i];
    if (!answer) blank++;
    const ok = !!answer && answer === String(row.correct_answer || '').trim().toUpperCase();
    if (ok) correct++;
    return { questionId: row.id, selectedAnswer: answer, isCorrect: ok, sourceChannel: 'OPTICAL' as const, position: i + 1 };
  });
  return { ok: true, responses, correct, total: rows.length, score: correct / rows.length, blank };
}

export type ReplaceDecision = { ok: true; replacing: boolean } | { ok: false; status: number; code: string; message: string; previous?: Record<string, unknown> };

export function decideReplace(existing: { score: number | null; booklet_code: string | null; completed_at: string | null } | null, replace: unknown, reason: unknown): ReplaceDecision {
  if (!existing) return { ok: true, replacing: false };
  const previous = { score: existing.score, booklet: existing.booklet_code, scannedAt: existing.completed_at };
  if (replace !== true) return { ok: false, status: 409, code: 'ALREADY_SCANNED', message: `Bu öğrencinin optiği daha önce okutuldu (kitapçık ${existing.booklet_code || '—'}, puan %${Math.round(Number(existing.score || 0) * 100)}). Değiştirmek için gerekçe yazarak yeniden kaydı onaylayın.`, previous };
  if (typeof reason !== 'string' || reason.trim().length < 5) return { ok: false, status: 400, code: 'REPLACE_REASON_REQUIRED', message: 'Önceki sonucun yerine yazmak için en az 5 karakterlik gerekçe yazın.', previous };
  return { ok: true, replacing: true };
}
