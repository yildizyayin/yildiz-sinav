import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gateSource = readFileSync(new URL('../worker/evaluation-accuracy-gate-entry.ts', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../worker/camera-chunk-root.ts', import.meta.url), 'utf8');

describe('exam evaluation accuracy gate', () => {
  it('routes scan evaluation through the correctness gate', () => {
    expect(rootSource).toContain("import evaluationAccuracyGateApp from './evaluation-accuracy-gate-entry'");
    expect(rootSource).toMatch(/scan-batches\\\/\[\^\/\]\+\\\/evaluate[\s\S]*evaluationAccuracyGateApp\.fetch/);
  });

  it('blocks booklet reordering until the evaluator uses printed question order', () => {
    expect(gateSource).toContain('exam_question_booklet_orders');
    expect(gateSource).toContain('printed_question_no');
    expect(gateSource).toContain("coalesce(bqo.printed_question_no,q.question_no)<>q.question_no");
  });

  it('blocks non-active and alternative-answer semantics from legacy scoring', () => {
    expect(gateSource).toContain('accepted_answers');
    expect(gateSource).toContain('question_status');
    expect(gateSource).toContain("<>'ACTIVE'");
  });

  it('blocks TYT optional answer-key branches from the legacy evaluator', () => {
    expect(gateSource).toContain('exam_optional_answer_keys');
    expect(gateSource).toContain('EVALUATION_ACCURACY_GATE');
  });

  it('keeps tenant and evaluator-role checks in front of scoring', () => {
    expect(gateSource).toContain('canEvaluateExam(user.role)');
    expect(gateSource).toContain("user.institution_id !== batch.institution_id");
  });
});
