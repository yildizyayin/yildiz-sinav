import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo, runOutcomeVideoQueue } from '../worker/lib/outcome-videos';
import { clipEmbed } from '../src/lib/physicalLink';

afterEach(() => vi.unstubAllGlobals());

it('binds the three publisher chapters to matching MEB outcomes and preserves their boundaries', async () => {
  const t = await evaluatedExam();
  const entries = [
    ['math5', 5, 'MAT.5.1.2', 'Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme', '1jHK9ZvcAF4', 2124, 2433],
    ['math6', 6, 'MAT.6.1.4', 'Günlük hayat problemleri ya da matematiksel durumlar üzerinden ortak kat ve ortak böleni yorumlayabilme', 'dwrIijmCeEQ', 195, 500],
    ['bio9', 9, 'BİY.9.2.4', 'Canlıları sınıflandırabilme', 'xjo4mqtMPHY', 0, 325],
  ] as const;
  for (const [id, grade, code, title] of entries) {
    t.db.prepare(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority)
      VALUES(?,'2027-2028',?,'MAARIF',1,'SCHOOL','MEB')`).run('cv_'+id, grade);
    t.db.prepare(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active)
      VALUES(?,?,'sub_mat',?,?,?,1,1)`).run(id, 'cv_'+id, grade, code, title);
  }
  t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority)
    VALUES('cv_legacy','2026-2027',5,'LEGACY',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active)
    VALUES('legacy','cv_legacy','sub_mat',5,'MAT.5.1.2','Farklı içerik',1,1);`);
  const migration = readFileSync(new URL('../migrations/0187_outcome_video_choices.sql', import.meta.url), 'utf8');
  const curatedSeed = migration.slice(migration.indexOf('WITH clips'));
  t.db.exec(curatedSeed);
  t.db.exec(curatedSeed);
  expect(t.db.prepare('SELECT COUNT(*) n FROM outcome_video_choices WHERE curated=1').get()).toEqual({ n:3 });
  t.db.exec("UPDATE outcome_video_choices SET checked_at=datetime('now','-8 days') WHERE curated=1");

  t.env.YOUTUBE_API_KEY = 'synthetic';
  const videoMetadata = entries.map((r, i) => ({
    id:r[4], snippet:{title:i===0 ? '5. Sınıf Matematik Doğal Sayılarla İşlemler' : 'Ders'},
    status:{privacyStatus:'public',embeddable:true,uploadStatus:'processed'},
    contentDetails:{duration:'PT45M'},
  }));
  vi.stubGlobal('fetch', vi.fn(async (url:URL) =>
    Response.json({items:url.pathname.endsWith('/search') ? [{id:{videoId:entries[0][4]}}] : videoMetadata})));
  await runOutcomeVideoQueue(t.env,0);
  await findOutcomeVideo(t.env,'math5');
  for (const [id,,,,videoId,start,end] of entries) {
    const response = await t.request(`/api/outcome-videos/catalog/${id}`);
    expect(response.response.status).toBe(200);
    expect(response.data.videos[0]).toMatchObject({id:videoId,start,end,durationSeconds:end-start});
    const embed = new URL(clipEmbed(response.data.videos[0].url,start,end)!);
    expect(embed.searchParams.get('end')).toBe(String(end));
    expect(Number(embed.searchParams.get('start') || 0)).toBe(start);
  }
});
