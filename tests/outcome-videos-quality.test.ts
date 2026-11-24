import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo, qualityIssue, recheckAutoVideos, runOutcomeVideoQueue } from '../worker/lib/outcome-videos';

/**
 * Kazanım videosu kalite ve hız (owner, 23 Nov 2026): no clip of another grade, another subject or an entertainment
 * channel; a short video must name the outcome itself; one search also serves the other outcomes it covers; 8th and
 * 12th grades (Maarif model in 2027-2028) are not searched.
 */
afterEach(() => vi.unstubAllGlobals());
const o7 = { title: 'Metnin bölümlerini belirlemeye yönelik çözümleme yapabilme', topic: 'Okuma', grade_level: 7, subject_name: 'Türkçe' };
const video = (id: string, title: string, description = '', duration = 'PT6M', channel = 'Türkçe Dersleri') => ({ id, snippet: { title, description, channelTitle: channel, liveBroadcastContent: 'none' }, contentDetails: { duration }, statistics: { viewCount: '1000' }, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } });
function youtube(items: any[]) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: any) => { const url = String(u); urls.push(url); return new Response(JSON.stringify(url.includes('/search') ? { items: items.map((v) => ({ id: { videoId: v.id } })) } : { items })); }));
  return urls;
}

describe('kazanım videosu kalite', () => {
  it('rejects another grade, another subject, an entertainment channel and a title that does not name the outcome', () => {
    expect(qualityIssue({ title: '5. Sınıf Türkçe Paragrafta Anlam', method: 'CHAPTER' }, o7)).toMatch(/başka sınıfın videosu \(5\. sınıf\)/);
    expect(qualityIssue({ title: 'Topun hareketi #fizik #yks', method: 'SHORT_TITLE' }, { title: 'Kuvvetin hareket üzerindeki etkisi', grade_level: 7, subject_name: 'Fen Bilimleri' })).toMatch(/başka dersin videosu/);
    expect(qualityIssue({ title: 'Metinler arası karşılaştırma', channel: 'Furry Funnies & Facts', method: 'SHORT_TITLE' }, o7)).toMatch(/eğitim dışı kanal/);
    expect(qualityIssue({ title: 'Bilgilendirici metinde anahtar kelimeleri belirlemeye yönelik çözümleme', method: 'SHORT_TITLE' }, o7)).toMatch(/başlık kazanımı tam söylemiyor/);
    expect(qualityIssue({ title: '7. Sınıf Türkçe | Metnin Bölümleri ve Çözümleme', method: 'SHORT_TITLE' }, o7)).toBeNull();
    expect(qualityIssue({ title: 'Dinleme Sürecinde Öz Yansıtma | 7. Sınıf Türkçe', method: 'SHORT_TITLE' }, { title: 'Dinleme/izleme sürecine yönelik öz yansıtma yapabilme', grade_level: 7, subject_name: 'Türkçe' })).toBeNull();
  });

  it('removes an old clip that fails, never brings it back and searches the outcome again', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    t.db.exec(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,channel_title,duration_seconds,start_seconds,end_seconds,method) VALUES
      ('a_bad','o_mat1','BBBBBBBBBBB','5. Sınıf Matematik Üslü İfadeler','Ders',300,0,300,'SHORT_TITLE'),
      ('a_ok','o_tur1','CCCCCCCCCCC','8. Sınıf Türkçe Metnin Ana Fikri','Ders',900,60,240,'CHAPTER')`);
    expect(await recheckAutoVideos(t.env)).toEqual({ checked: 2, removed: 1 });
    expect(t.db.prepare(`SELECT status,removed_reason FROM outcome_auto_videos WHERE id='a_bad'`).get()).toMatchObject({ status: 'REMOVED', removed_reason: expect.stringContaining('KALITE: başka sınıfın videosu') });
    expect(t.db.prepare(`SELECT status FROM outcome_auto_videos WHERE id='a_ok'`).get()).toMatchObject({ status: 'ACTIVE' });
    expect(t.db.prepare(`SELECT 1 x FROM outcome_video_blocks WHERE outcome_id='o_mat1' AND youtube_video_id='BBBBBBBBBBB'`).get()).toBeTruthy();
    expect(t.db.prepare(`SELECT status FROM outcome_video_queue WHERE outcome_id='o_mat1'`).get()).toMatchObject({ status: 'WAITING' });
    expect(await recheckAutoVideos(t.env)).toEqual({ checked: 0, removed: 0 }); // each clip once
  });

  it('skips the wrong-grade candidate and uses one search for the other outcome of the same grade and subject', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    t.db.exec(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o_tur2','cv8','sub_tur',8,'T.8.1.2','Okuma','Metindeki söz sanatlarını belirler.',1,1)`);
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    const urls = youtube([
      video('DDDDDDDDDDD', '6. Sınıf Türkçe Ana Fikir', '0:00 Giriş\n1:00 Metnin ana fikri\n4:00 Bitiş', 'PT6M'),
      video('EEEEEEEEEEE', '8. Sınıf Türkçe Okuma', '0:00 Giriş\n1:00 Metnin ana fikri nasıl bulunur\n5:00 Söz sanatları benzetme kişileştirme\n9:00 Kapanış', 'PT10M'),
    ]);
    const r = await findOutcomeVideo(t.env, 'o_tur1');
    expect(r).toMatchObject({ status: 'FOUND', reason: 'CHAPTER', shared: 1 });
    expect(urls.filter((u) => u.includes('/search'))).toHaveLength(1);
    expect(t.db.prepare(`SELECT youtube_video_id v,start_seconds s FROM outcome_auto_videos WHERE outcome_id='o_tur1' AND status='ACTIVE'`).get()).toEqual({ v: 'EEEEEEEEEEE', s: 60 });
    expect(t.db.prepare(`SELECT youtube_video_id v,start_seconds s,search_query q FROM outcome_auto_videos WHERE outcome_id='o_tur2' AND status='ACTIVE'`).get()).toMatchObject({ v: 'EEEEEEEEEEE', s: 300, q: expect.stringContaining('(aynı arama)') });
    expect(t.db.prepare(`SELECT status FROM outcome_video_queue WHERE outcome_id='o_tur2'`).get()).toMatchObject({ status: 'FOUND' });
  });

  it('does not search the grades the owner set aside, and says so when a teacher asks', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic', OUTCOME_VIDEO_SKIP_GRADES: '8,12' });
    youtube([]);
    t.db.exec(`INSERT INTO outcome_video_queue(outcome_id,priority,status) VALUES('o_mat1',30,'WAITING')`);
    await runOutcomeVideoQueue(t.env, 5);
    const searched = t.db.prepare(`SELECT o.grade_level g FROM outcome_video_queue q JOIN outcomes o ON o.id=q.outcome_id WHERE q.status<>'WAITING'`).all() as any[];
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((x) => x.g !== 8)).toBe(true);
    expect(t.db.prepare(`SELECT status FROM outcome_video_queue WHERE outcome_id='o_mat1'`).get()).toMatchObject({ status: 'WAITING' });
    const r = await t.request('/api/outcome-videos/search/o_mat1', 'POST', {});
    expect(r.response.status).toBe(409);
    expect(r.data.error.code).toBe('GRADE_SKIPPED');
  });
});
