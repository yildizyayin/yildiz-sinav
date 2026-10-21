/**
 * A028: one student may appear only once per subject in an upload. Two sheets linked to the same student
 * with overlapping tests (the same sheet scanned twice, or a wrong manual match) used to create two
 * participants (direct evaluation) or silently overwrite one with the other (chunked). Rows whose tests do
 * not overlap (sözel and sayısal sessions of the same student) are a legitimate merge and are allowed.
 */
type Row = { id?: string; row_no: number; matched_student_id?: string | null; resolution_status?: string; canonical_json?: string };

function subjectsOf(row: Row): string[] {
  try { const c = JSON.parse(row.canonical_json || '{}'); return Object.entries(c.answers_by_subject || {}).filter(([, v]) => String(v || '').replace(/[_\s]/g, '').length > 0).map(([k]) => k.toUpperCase()); }
  catch { return []; }
}

export function duplicateStudentConflicts(rows: Row[]): Array<{ studentId: string; rows: number[] }> {
  const byStudent = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.matched_student_id || r.resolution_status === 'CANCELLED') continue;
    const list = byStudent.get(r.matched_student_id) || []; list.push(r); byStudent.set(r.matched_student_id, list);
  }
  const out: Array<{ studentId: string; rows: number[] }> = [];
  for (const [studentId, list] of byStudent) {
    if (list.length < 2) continue;
    const clash = new Set<number>();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = subjectsOf(list[i]), b = new Set(subjectsOf(list[j]));
      if (!a.length || !b.size || a.some((s) => b.has(s))) { clash.add(list[i].row_no); clash.add(list[j].row_no); }
    }
    if (clash.size) out.push({ studentId, rows: [...clash].sort((x, y) => x - y) });
  }
  return out;
}

export function duplicateMessage(conflicts: Array<{ rows: number[] }>): string {
  return `Aynı öğrenci aynı testler için birden fazla satıra bağlı: ${conflicts.map((c) => `satır ${c.rows.join(', ')}`).join('; ')}. Fazla satırı iptal edin veya doğru öğrenciye bağlayın.`;
}
