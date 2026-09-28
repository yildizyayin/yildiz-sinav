import { describe, expect, it } from 'vitest';
import { evaluateAnswer, parseAcceptedAnswers } from '../worker/chunked-evaluation-entry';

describe('native exam evaluation semantics', () => {
  it('accepts JSON and legacy delimited alternative answers', () => {
    expect(parseAcceptedAnswers('["A","C"]', 'A')).toEqual(['A', 'C']);
    expect(parseAcceptedAnswers('A|C', 'A')).toEqual(['A', 'C']);
    expect(parseAcceptedAnswers('', 'B')).toEqual(['B']);
  });

  it('accepts any configured alternative answer for an active question', () => {
    expect(evaluateAnswer('C', { correct_answer: 'A', accepted_answers: '["A","C"]', question_status: 'ACTIVE' })).toEqual({
      status: 'CORRECT', contributesToScore: true, contributesToOutcome: true,
    });
  });

  it('keeps normal wrong and blank behavior for active questions', () => {
    expect(evaluateAnswer('D', { correct_answer: 'A', accepted_answers: '["A"]', question_status: 'ACTIVE' }).status).toBe('WRONG');
    expect(evaluateAnswer('_', { correct_answer: 'A', accepted_answers: '["A"]', question_status: 'ACTIVE' }).status).toBe('BLANK');
  });

  it('marks cancelled and excluded questions INVALID without score or outcome evidence', () => {
    for (const question_status of ['CANCELLED', 'EXCLUDED']) {
      expect(evaluateAnswer('A', { correct_answer: 'A', accepted_answers: '["A"]', question_status })).toEqual({
        status: 'INVALID', contributesToScore: false, contributesToOutcome: false,
      });
    }
  });
});
