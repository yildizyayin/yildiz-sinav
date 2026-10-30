/**
 * P01: one place that decides which Studio booklets exist and how their question order is built.
 *
 * Booklet support — a booklet is usable only when every stage supports it: creation, the stored items, the
 * answer key, the preview, the PDF and evaluation (the optical sheet has bubbles for A and B only). C/D stay
 * closed until all of these say yes; nothing turns them on piecemeal.
 *
 * Order — booklet A is exactly the order the user gave (or the drawn order when the system picked). Every other
 * booklet is derived from the persistent question ids alone (B = A reversed unit by unit), so the A↔B mapping can be
 * rebuilt at any time. Questions sharing a stem group move together and
 * keep their internal order.
 */
export const BOOKLET_STAGES = ['create', 'items', 'answerKey', 'preview', 'pdf', 'evaluation'] as const;
export type BookletStage = typeof BOOKLET_STAGES[number];
export const STUDIO_BOOKLET_SUPPORT: Record<string, Record<BookletStage, boolean>> = {
  A: { create: true, items: true, answerKey: true, preview: true, pdf: true, evaluation: true },
  B: { create: true, items: true, answerKey: true, preview: true, pdf: true, evaluation: true },
  C: { create: false, items: true, answerKey: true, preview: true, pdf: true, evaluation: false },
  D: { create: false, items: true, answerKey: true, preview: true, pdf: true, evaluation: false },
};

export function bookletUsable(code: unknown): code is string {
  const support = STUDIO_BOOKLET_SUPPORT[String(code || '').toUpperCase()];
  return Boolean(support) && BOOKLET_STAGES.every((stage) => support[stage]);
}
export const USABLE_BOOKLETS = Object.keys(STUDIO_BOOKLET_SUPPORT).filter(bookletUsable);

export type OrderedQuestion = { id: string; groupId?: string | null; groupOrder?: number | null };
type Unit = { key: string; ids: string[] };

/** Consecutive questions of the same stem group form one unit; singles are units of one. */
export function unitsOf(questions: OrderedQuestion[]): Unit[] {
  const units: Unit[] = [];
  for (const q of questions) {
    const last = units[units.length - 1];
    if (q.groupId && last && last.key === `g:${q.groupId}`) last.ids.push(q.id);
    else units.push({ key: q.groupId ? `g:${q.groupId}` : `q:${q.id}`, ids: [q.id] });
  }
  return units;
}

/**
 * Group members must sit next to each other in their group order. Returns an error message or null.
 * `expected` is every member of each group in its stored order.
 */
export function checkGroupIntegrity(questions: OrderedQuestion[], expected: Map<string, string[]>): string | null {
  const units = unitsOf(questions);
  const groupUnits = units.filter((u) => u.key.startsWith('g:')).map((u) => u.key);
  if (new Set(groupUnits).size !== groupUnits.length) return 'Ortak köklü sorular ayrılmış; aynı kökün soruları art arda gelmeli.';
  const seen = new Set<string>();
  for (const unit of units) {
    if (!unit.key.startsWith('g:')) continue;
    const group = unit.key.slice(2);
    if (seen.has(group)) return 'Ortak köklü sorular ayrılmış; aynı kökün soruları art arda gelmeli.';
    seen.add(group);
    const members = expected.get(group) || [];
    if (unit.ids.length !== members.length) return 'Ortak köklü bir sorunun bütün soruları birlikte seçilmeli.';
    if (unit.ids.some((id, i) => id !== members[i])) return 'Ortak köklü soruların kendi sırası değiştirilemez.';
  }
  return null;
}

/**
 * Booklet order for `code`, built only from the persistent ids. A is the given order; B is A reversed unit by unit
 * (a stem group stays together in its own order). Without groups this is exactly the A↔B mapping every Studio
 * booklet printed so far has used, so a reordered or rebuilt document stays consistent with earlier prints.
 */
export async function bookletOrder(_documentId: string, code: string, questions: OrderedQuestion[]): Promise<string[]> {
  const units = unitsOf(questions);
  if (code === 'A') return units.flatMap((u) => u.ids);
  if (code === 'B') return [...units].reverse().flatMap((u) => u.ids);
  throw new Error(`BOOKLET_ORDER_UNSUPPORTED_${code}`);
}

/**
 * Stem groups arrive with migration 0147. A database without the column cannot hold grouped questions at all, so
 * "not installed" means "no groups" — this is a schema fact checked once, not a swallowed query error.
 */
const installed = new WeakMap<object, Promise<boolean>>();
export function stemGroupsInstalled(env: { DB: D1Database }): Promise<boolean> {
  let p = installed.get(env.DB);
  if (!p) {
    p = env.DB.prepare(`SELECT 1 ok FROM pragma_table_info('question_bank') WHERE name='stem_group_id'`).first<{ ok: number }>().then((r) => Boolean(r?.ok));
    installed.set(env.DB, p);
  }
  return p;
}
