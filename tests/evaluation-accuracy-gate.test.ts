import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gateSource = readFileSync(new URL('../worker/evaluation-accuracy-gate-entry.ts', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../worker/camera-chunk-root.ts', import.meta.url), 'utf8');

describe('exam evaluation accuracy gate', () => {
  it('routes scan evaluation through the correctness gate', () => {
    expect(rootSource).toContain("import evaluationAccuracyGateApp from './evaluation-accuracy-gate-entry'");
    expect(rootSource).toMatch(/scan-batches\\\/\[\^\/\]\+\\\/evaluate[\s\S]*evaluationAccuracyGateApp\.fetch/);
  });

  it('keeps only the TYT optional branch behind the temporary gate', () => {
    expect(gateSource).toContain('exam_optional_answer_keys');
    expect(gateSource).toContain('EVALUATION_ACCURACY_GATE');
    expect(gateSource).not.toContain('exam_question_booklet_orders');
    expect(gateSource).not.toContain('accepted_answers');
  });

  it('states that optional philosophy stays outside the 120-question scored envelope', () => {
    expect(gateSource).toContain('120 soruluk ana puan zarfına ek seçmeli Felsefe');
    expect(gateSource).toContain('ana puanı değiştirmeden');
  });

  it('keeps tenant and evaluator-role checks in front of scoring', () => {
    expect(gateSource).toContain('canEvaluateExam(user.role)');
    expect(gateSource).toContain("user.institution_id !== batch.institution_id");
  });
});
