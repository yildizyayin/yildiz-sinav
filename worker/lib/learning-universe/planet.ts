import type { Env } from '../../types';
import { all } from '../db';

/**
 * Benim Gezegenim (owner, 25 Nov 2026: "beğendim bu şekilde devam edebilirsin"). The student's own planet, worked out
 * from what they already did — nothing new is stored:
 *  - each correct, server-graded answer in a finished Öğrenme Evreni play grows one thing in the region of its subject;
 *  - each wrong answer whose content has not been answered right since is a seed, waiting for its review;
 *  - every piece names the outcome it came from, so the planet always says which kazanım it was earned on.
 * XP and the level stay where they are; the planet is a picture of real answers, never a score.
 */
export type PlanetPiece = { kind: string; outcomeCode: string | null; outcomeTitle: string };
export type PlanetRegion = { subjectId: string | null; name: string; pieces: PlanetPiece[]; total: number; seeds: number; outcomes: number };
const KINDS = ['tree', 'wave', 'mountain', 'house', 'flower', 'crystal'];
const MAX_PIECES = 40;

export async function universePlanet(env: Env, studentId: string): Promise<{ regions: PlanetRegion[]; total: number; seeds: number }> {
  const rows = await all<any>(env.DB.prepare(`SELECT o.subject_id, COALESCE(sb.name,'Ders') subject_name, o.code, o.title, i.source, i.ref_id, i.correct, i.answered_at
      FROM lu_session_items i JOIN lu_sessions s ON s.id=i.session_id JOIN outcomes o ON o.id=s.outcome_id LEFT JOIN subjects sb ON sb.id=o.subject_id
      WHERE s.student_id=? AND s.status='SUBMITTED' AND i.answered_at IS NOT NULL AND i.correct IS NOT NULL
      ORDER BY i.answered_at, s.id, i.seq`).bind(studentId));
  const regions = new Map<string, PlanetRegion & { _kind: string; _outcomes: Set<string>; _open: Map<string, boolean> }>();
  for (const r of rows) {
    const key = r.subject_id || r.subject_name;
    let g = regions.get(key);
    if (!g) { g = { subjectId: r.subject_id ?? null, name: r.subject_name, pieces: [], total: 0, seeds: 0, outcomes: 0, _kind: KINDS[regions.size % 3], _outcomes: new Set(), _open: new Map() }; regions.set(key, g); }
    g._outcomes.add(r.code || r.title);
    const ref = `${r.source}:${r.ref_id}`;
    if (r.correct) {
      g.total++;
      g._open.set(ref, false);                                    // answered right now: its seed, if any, has grown
      // a region's own kind most of the time, with a house, a flower or a crystal every third piece
      const kind = g.total % 3 === 0 ? KINDS[3 + ((g.total / 3) % 3)] : g._kind;
      g.pieces.push({ kind, outcomeCode: r.code ?? null, outcomeTitle: r.title });
    } else if (!g._open.has(ref) || g._open.get(ref)) g._open.set(ref, true);
  }
  const out = [...regions.values()].map(({ _kind, _outcomes, _open, ...g }) => ({ ...g, pieces: g.pieces.slice(-MAX_PIECES), seeds: [..._open.values()].filter(Boolean).length, outcomes: _outcomes.size }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr')).slice(0, 6);
  return { regions: out, total: out.reduce((n, g) => n + g.total, 0), seeds: out.reduce((n, g) => n + g.seeds, 0) };
}
