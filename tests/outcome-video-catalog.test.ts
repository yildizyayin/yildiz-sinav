import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo, runOutcomeVideoQueue } from '../worker/lib/outcome-videos';

afterEach(()=>vi.unstubAllGlobals());
const ids = ['AAAAAAAAAAA','BBBBBBBBBBB','CCCCCCCCCCC','DDDDDDDDDDD','EEEEEEEEEEE','FFFFFFFFFFF','GGGGGGGGGGG'];
const title = '8. Sınıf Türkçe Metnin Ana Fikri';
const video = (id:string, name:string, duration:string, language:string, views:number) => ({
  id, snippet:{title:name,channelTitle:'Eğitim',defaultAudioLanguage:language},
  status:{privacyStatus:'public',embeddable:true,uploadStatus:'processed'},
  contentDetails:{duration},statistics:{viewCount:String(views)},
});

describe('shared outcome video catalog',()=>{
  it('combines searches, filters unsuitable results and fills a shared set of five',async()=>{
    const t = await evaluatedExam('direct',{outcomes:true});
    t.env.YOUTUBE_API_KEY='synthetic';
    const found=ids.map((id,i)=>video(id,title,i===5?'PT6M':'PT4M',i===6?'en':'tr',i*100));
    let searches=0;
    vi.stubGlobal('fetch',vi.fn(async (input:URL)=>{
      if(input.pathname.endsWith('/search')) {
        const page=searches++===0 ? ids.slice(0,3) : ids.slice(2);
        return Response.json({items:page.map(videoId=>({id:{videoId}}))});
      }
      return Response.json({items:found.filter(v=>input.searchParams.get('id')?.split(',').includes(v.id))});
    }));
    await findOutcomeVideo(t.env,'o_tur1');
    expect(searches).toBe(2);
    const options=await t.request('/api/outcome-videos/catalog/o_tur1','GET',undefined,'teacher');
    expect(options.data.videos.map((v:any)=>v.id)).toEqual(ids.slice(0,5).reverse());
    expect(options.data.videos[0]).toMatchObject({channel:'Eğitim',durationSeconds:240});
    const coverage=await t.request('/api/outcome-videos/catalog-coverage');
    expect(coverage.data.rows).toContainEqual(expect.objectContaining({academicYear:'2026-2027',subjectId:'sub_tur',ready:1}));
    expect((await t.request('/api/outcome-videos/catalog/o_tur1','GET',undefined,'stuuser')).response.status).toBe(403);
    expect((await t.request('/api/outcome-videos/catalog-queue','POST',{academicYear:'2026-2027',programVersion:'MAARIF-2026',grade:8,subjectId:'sub_tur'})).data.queued).toBe(0);
    expect((await t.request('/api/outcome-videos/catalog-queue','POST',{academicYear:'2026-2027',programVersion:'MAARIF-2026',grade:8,subjectId:'sub_mat'})).data.queued).toBe(1);
    expect((await t.request('/api/outcome-videos/catalog/o_tur1/EEEEEEEEEEE','DELETE',undefined,'teacher')).response.status).toBe(403);
    expect((await t.request('/api/outcome-videos/catalog/o_tur1/EEEEEEEEEEE','DELETE')).response.status).toBe(200);
    expect((await t.request('/api/outcome-videos/catalog/o_tur1')).data.videos.map((v:any)=>v.id)).toEqual(ids.slice(0,4).reverse());
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`,'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`,'POST')).response.status).toBe(200);
    const match=t.db.prepare(`SELECT sa.exam_question_id id FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id
      JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id WHERE ep.student_id='s1' AND qo.outcome_id=? LIMIT 1`).get('o_tur1') as {id:string};
    const support=await t.request(`/api/student-standard/question-support?examQuestionId=${match.id}`,'GET',undefined,'stuuser');
    expect(support.data.options.topicVideos.map((v:any)=>v.id)).toEqual(ids.slice(0,4).reverse());

  });

  it('drops expired choices and keeps valid metadata fresh when YouTube is available',async()=>{
    const t=await evaluatedExam('direct',{outcomes:true});
    t.env.YOUTUBE_API_KEY='synthetic';
    t.db.exec(`INSERT INTO outcome_video_choices(outcome_id,youtube_video_id,title,start_seconds,end_seconds,position,checked_at) VALUES
      ('o_tur1','AAAAAAAAAAA','old',0,240,0,datetime('now','-8 days')),
      ('o_tur1','BBBBBBBBBBB','old',0,240,1,datetime('now','-31 days'))`);
    vi.stubGlobal('fetch',vi.fn(async (input:URL)=>Response.json({items:input.pathname.endsWith('/videos')
      ? [video(ids[0],title,'PT4M','tr',0)] : []})));
    await runOutcomeVideoQueue(t.env,0);
    const options=await t.request('/api/outcome-videos/catalog/o_tur1');
    expect(options.data.videos.map((v:any)=>[v.id,v.title])).toEqual([[ids[0],title]]);
  });
});
