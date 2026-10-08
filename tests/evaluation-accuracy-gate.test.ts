import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gateSource = readFileSync(new URL('../worker/evaluation-accuracy-gate-entry.ts', import.meta.url), 'utf8');
const optionalSource = readFileSync(new URL('../worker/tyt-optional-philosophy-evaluation.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../migrations/0055_tyt_optional_philosophy_results.sql', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../worker/camera-chunk-root.ts', import.meta.url), 'utf8');

describe('exam evaluation accuracy wrapper', () => {
  it('routes scan evaluation through the correctness wrapper', () => {
    expect(rootSource).toContain("import evaluationAccuracyGateApp from './evaluation-accuracy-gate-entry'");
    expect(rootSource).toMatch(/scan-batches\\\/\[\^\/\]\+\\\/evaluate[\s\S]*evaluationAccuracyGateApp\.fetch/);
  });

  it('evaluates the official score first and persists optional evidence afterwards', () => {
    const chunkSource=readFileSync(new URL('../worker/chunked-evaluation-entry.ts', import.meta.url),'utf8');
    expect(gateSource).toContain('export default chunkedEvaluationApp');
    expect(chunkSource).toContain('persistTytOptionalPhilosophyEvidence');
    expect(chunkSource.indexOf('const response=await evaluateChunkUnlocked')).toBeLessThan(chunkSource.indexOf('await persistTytOptionalPhilosophyEvidence(env'));
    expect(gateSource).not.toContain('EVALUATION_ACCURACY_GATE');
  });

  it('keeps optional philosophy outside exam_results and subject_results', () => {
    expect(optionalSource).toContain('tyt_optional_philosophy_results');
    expect(optionalSource).toContain('tyt_optional_philosophy_answers');
    expect(optionalSource).not.toContain("'exam_results'");
    expect(optionalSource).not.toContain("'subject_results'");
    expect(migrationSource).toContain('must never alter the');
    expect(migrationSource).toContain('120-question TYT score/net/rank envelope');
  });

  it('requires exactly five booklet-specific keys and accepts canonical TYT_FEL answers', () => {
    expect(optionalSource).toContain("record.answers_by_subject?.TYT_FEL");
    expect(optionalSource).toContain('bookletKeys.length !== 5');
    expect(optionalSource).toContain('TYT_OPTIONAL_KEY_INCOMPLETE_');
  });

  it('handles accepted answers and cancelled/excluded questions without score pollution', () => {
    expect(optionalSource).toContain('accepted_answers');
    expect(optionalSource).toContain("questionStatus === 'CANCELLED' || questionStatus === 'EXCLUDED'");
    expect(optionalSource).toContain("return 'INVALID'");
  });

  it('is idempotent for repeated evaluation', () => {
    expect(optionalSource).toContain('DELETE FROM tyt_optional_philosophy_answers WHERE participant_id=?');
    expect(optionalSource).toContain('DELETE FROM tyt_optional_philosophy_results WHERE participant_id=?');
  });
});
