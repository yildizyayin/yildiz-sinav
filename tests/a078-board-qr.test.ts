import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { embeddableVideo, physicalLinkTarget } from '../src/lib/physicalLink';

/** A078: board mode uses the booklet's own question data (with solution and approved video); book QR keys lead to the right page. Synthetic data only. */
describe('A078 board mode and book links', () => {
  it('maps QR references to their pages and never guesses an unknown one', () => {
    expect(physicalLinkTarget({ reference_type: 'WORKSHEET', reference_id: 'w 1' })).toEqual({ kind: 'route', to: '/worksheets?open=w%201' });
    expect(physicalLinkTarget({ reference_type: 'ASSIGNMENT', reference_id: 'a1' })).toEqual({ kind: 'route', to: '/assignments?open=a1' });
    expect(physicalLinkTarget({ reference_type: 'TEST', reference_id: 'doc1' })).toEqual({ kind: 'route', to: '/board/doc1' });
    expect(physicalLinkTarget({ reference_type: 'VIDEO', reference_id: null, payload: { url: 'https://youtu.be/AAAAAAAAAAA' } })).toEqual({ kind: 'external', to: 'https://youtu.be/AAAAAAAAAAA' });
    expect(physicalLinkTarget({ reference_type: 'VIDEO', reference_id: null, payload: { url: 'javascript:alert(1)' } }).kind).toBe('none');
    expect(physicalLinkTarget({ reference_type: 'WORKSHEET', reference_id: null }).kind).toBe('none');
    expect(physicalLinkTarget({ reference_type: 'SOMETHING', reference_id: 'x' }).kind).toBe('none');
    expect(embeddableVideo('https://www.youtube.com/watch?v=AAAAAAAAAAA')).toBe('https://www.youtube-nocookie.com/embed/AAAAAAAAAAA');
    expect(embeddableVideo('http://youtu.be/AAAAAAAAAAA')).toBeNull();
    expect(embeddableVideo('https://video.example/x')).toBeNull();
    expect(embeddableVideo(null)).toBeNull();
  });

  it('gives the board the same questions as the printed booklet, with solution and only an approved video', async () => {
    const t = await evaluatedExam('direct');
    const opts = `json('[{"label":"A","text":"bir"},{"label":"B","text":"iki"},{"label":"C","text":"üç"},{"label":"D","text":"dört"}]')`;
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
      INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,solution_text) VALUES
        ('bq1','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Tahta sorusu 1',${opts},'C',4,'OWNED','APPROVED','Çözüm metni'),
        ('bq2','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Tahta sorusu 2',${opts},'A',4,'OWNED','APPROVED',NULL);
      INSERT INTO question_assets(id,question_id,asset_type,external_url,title,approved) VALUES('va','bq1','SOLUTION_VIDEO','https://youtu.be/AAAAAAAAAAA','v',1),('vb','bq2','SOLUTION_VIDEO','https://youtu.be/BBBBBBBBBBB','v',0),('vc','bq2','SOLUTION_VIDEO','http://insecure.example/v','v',1);
      INSERT INTO studio_documents(id,institution_id,created_by,title,document_type,status,config_json) VALUES('sd1','school','admin','Tahta','WORKSHEET','READY','{}');
      INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES('sd1','bq1','A',1),('sd1','bq2','A',2);`);
    const r = await t.request('/api/platform/studio/sd1/items?booklet=A');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.items.map((i: any) => [i.stem, i.correctAnswer, i.solution, i.solutionVideo])).toEqual([['Tahta sorusu 1', 'C', 'Çözüm metni', 'https://youtu.be/AAAAAAAAAAA'], ['Tahta sorusu 2', 'A', null, null]]);
    expect((await t.request('/api/platform/studio/sd1/items?booklet=A', 'GET', undefined, 'stuuser')).response.status).toBe(403);
  });
});
