import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Owner (10 Nov 2026): Gold/Premium/Live, the AI teacher and live lessons are off on the student side. */
it('students cannot reach membership or the AI teacher, even with the features switched on', async () => {
  const t = await evaluatedExam('direct');
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key IN ('MEMBERSHIP','LIVE')`);
    for (const [path, method, body] of [
      ['/api/platform/membership', 'GET', undefined], ['/api/membership/catalog', 'GET', undefined],
      ['/api/membership/orders', 'POST', { planId: 'x' }], ['/api/platform/ai-coach', 'POST', { message: 'merhaba' }], ['/api/platform/ai-guidance', 'POST', { message: 'merhaba' }],
    ] as const) {
      const r = await t.request(path, method, body, 'stuuser');
      expect(r.response.status, path).toBe(403);
      expect(r.data.error.code, path).toBe('STUDENT_SUSPENDED');
    }
    // other roles are untouched by this rule (they get their usual answers, not the student block)
    expect((await t.request('/api/membership/catalog', 'GET', undefined, 'admin')).data?.error?.code).not.toBe('STUDENT_SUSPENDED');
  } finally { t.db.close(); }
}, 60000);

it('the student menu and routes no longer offer Gold/Premium/Live or live lessons', () => {
  const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  const studentNav = layout.slice(layout.indexOf('  STUDENT: ['), layout.indexOf('  PARENT: ['));
  expect(studentNav).not.toContain('/premium');
  expect(studentNav).not.toContain('/live-lessons');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  expect(app).toContain('<Route path="premium" element={<Navigate to="/" replace/>}/>');
  expect(app).toMatch(/path="live-lessons" element=\{<RoleGate allowed=\{ALL_ROLES\.filter\(role=>role!=='STUDENT'\)\}>/);
});
