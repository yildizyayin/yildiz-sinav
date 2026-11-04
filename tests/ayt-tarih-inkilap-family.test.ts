import { describe, expect, it } from 'vitest';
import { catalogSubjectsFor, examOutcomeScope, examSubjectsForOutcome } from '../worker/lib/exam-outcome-matching';

/** Owner (4 Nov): AYT Tarih-1 and Tarih-2 questions may be linked to 12th-grade T.C. İnkılap Tarihi ve Atatürkçülük outcomes. */
describe('AYT Tarih ↔ İnkılap Tarihi', () => {
  const ayt = examOutcomeScope({ exam_type: 'AYT', grade_level: 12, academic_year: '2026-2027' });
  it('offers İnkılap outcomes to both AYT history tests', () => {
    expect(catalogSubjectsFor(ayt, 'sub_ayt_tar1')).toEqual(['sub_tar', 'sub_ink']);
    expect(catalogSubjectsFor(ayt, 'sub_ayt_tar2')).toEqual(['sub_tar', 'sub_ink']);
    expect(examSubjectsForOutcome(ayt, 'sub_ink')).toEqual(expect.arrayContaining(['sub_ayt_tar1', 'sub_ayt_tar2']));
  });
  it('leaves the other tests unchanged', () => {
    expect(catalogSubjectsFor(ayt, 'sub_ayt_cog1')).toEqual(['sub_cog']);
    expect(catalogSubjectsFor(examOutcomeScope({ exam_type: 'TYT' }), 'sub_tyt_sos')).toEqual(['sub_tar', 'sub_cog', 'sub_fel', 'sub_din']);
  });
});
