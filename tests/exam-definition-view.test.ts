import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../src/pages/ExamDefinitions.tsx', import.meta.url), 'utf8');

describe('exam definition detail view', () => {
  it('opens the detail workspace immediately and shows loading/retry feedback', () => {
    expect(page).toContain("${selectedId ? 'detail-mode' : ''}");
    expect(page).toContain('Sınav ayrıntıları yükleniyor');
    expect(page).toContain('Sınav ayrıntıları açılamadı');
    expect(page).toContain('Tekrar dene');
  });
});
