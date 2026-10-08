import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateExamSchedule } from '../worker/lib/exam-schedule';

const platform = readFileSync(new URL('../worker/platform-entry.ts', import.meta.url), 'utf8');
const schedule = readFileSync(new URL('../worker/lib/exam-schedule.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/pages/ExamDetail.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0056_exam_application_result_schedule.sql', import.meta.url), 'utf8');

describe('exam application and result schedule', () => {
  it('validates application and publication timeline ordering', () => {
    expect(validateExamSchedule({
      applicationStartAt:'2026-09-25T06:00:00.000Z',
      applicationEndAt:'2026-09-29T12:00:00.000Z',
      resultPublishAt:'2026-09-29T15:00:00.000Z',
    }).ok).toBe(true);
    expect(validateExamSchedule({applicationStartAt:'2026-09-30T00:00:00Z',applicationEndAt:'2026-09-29T00:00:00Z'}).ok).toBe(false);
    expect(validateExamSchedule({applicationEndAt:'2026-09-29T12:00:00Z',resultPublishAt:'2026-09-29T11:59:00Z'}).ok).toBe(false);
  });

  it('persists separate application and result publication timestamps', () => {
    expect(migration).toContain('application_start_at');
    expect(migration).toContain('application_end_at');
    expect(migration).toContain('result_publish_at');
  });

  it('auto-publishes only due frozen results and audits the transition', () => {
    expect(schedule).toContain("result_freeze_status='FROZEN'");
    expect(schedule).toContain("datetime(p.result_publish_at)<=CURRENT_TIMESTAMP");
    expect(schedule).toContain("result_freeze_status='PUBLISHED'");
    expect(schedule).toContain('EXAM_RESULTS_AUTO_PUBLISHED');
    expect(platform).toContain('publishScheduledExamResults(env)');
  });

  it('blocks student and parent result access before publication time', () => {
    expect(platform).toContain("user.role==='STUDENT'||user.role==='PARENT'");
    expect(platform).toContain('RESULT_NOT_PUBLISHED');
    expect(platform).toContain('resultsAvailableNow');
    expect(platform).toContain('datetime(p.result_publish_at)<=CURRENT_TIMESTAMP');
  });

  it('exposes later and immediate publication actions on the exam detail page', () => {
    expect(detail).toContain('Uygulama başlangıcı');
    expect(detail).toContain('Uygulama bitişi');
    expect(detail).toContain('Sonuç yayın tarihi / saati');
    expect(detail).toContain('Sonra yayınla / planı kaydet');
    expect(detail).toContain('Şimdi yayınla');
    expect(detail).toContain('/schedule`');
    expect(detail).toContain('/freeze`');
    expect(detail).toContain('/publish`');
  });
});
