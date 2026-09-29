import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../src/pages/ExamCenterHub.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/pages/ExamDetail.tsx', import.meta.url), 'utf8');

describe('exam center detail navigation', () => {
  it('routes the exam center list through a dedicated hub and detail workspace', () => {
    expect(app).toContain('<ExamCenterHub/>');
    expect(app).toContain('path="exam-center/:examId"');
    expect(app).toContain('<ExamDetail/>');
  });

  it('opens an exam by title instead of an Aç / Sınavı aç button', () => {
    expect(hub).toContain('to={`/exam-center/${encodeURIComponent(r.id)}`}');
    expect(hub).not.toContain('Sınavı aç');
    expect(hub).not.toMatch(/>Aç\s*</);
  });

  it('provides the required three-dot management actions on the detail page', () => {
    for (const label of ['Düzenle','Kopyala','Raporlar','Arşivle','Sil']) expect(detail).toContain(label);
    expect(detail).toContain('<MoreVertical');
    expect(detail).toContain('/copy`');
    expect(detail).toContain("status:'ARCHIVED'");
    expect(detail).toContain("method:'DELETE'");
  });

  it('keeps upload/evaluation on the existing ExamCenter implementation', () => {
    expect(hub).toContain("return <ExamCenter/>");
    expect(detail).toContain('/exam-center?mode=upload');
  });
});
