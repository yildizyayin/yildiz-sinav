import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Owner (10 Nov 2026): students choose among the four approved themes; the Super Admin can still switch one off. */
it('opens the four approved themes to students, not to other roles, and honours an explicit switch-off', async () => {
  const t = await evaluatedExam('direct');
  try {
    const keys = async (who: string) => ((await t.request('/api/panel-experience', 'GET', undefined, who)).data.allowedThemes || []).map((x: any) => x.theme_key).sort();
    expect(await keys('stuuser')).toEqual(['ANUNEX_COSMIC', 'ANUNEX_FOCUS', 'ANUNEX_NEON', 'ANUNEX_STANDARD']);
    expect(await keys('teacher')).toEqual(['ANUNEX_STANDARD']);
    t.db.exec(`INSERT INTO institution_panel_theme_access(institution_id,theme_key,role,enabled,updated_by) VALUES('school','ANUNEX_NEON','STUDENT',0,'admin')`);
    expect(await keys('stuuser')).toEqual(['ANUNEX_COSMIC', 'ANUNEX_FOCUS', 'ANUNEX_STANDARD']);
  } finally { t.db.close(); }
}, 60000);
