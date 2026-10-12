import {DatabaseSync} from 'node:sqlite';
import {describe, expect, it} from 'vitest';
import {examEvaluationAccess} from '../worker/lib/exam-evaluation-access';

describe('exam evaluation distribution scope', () => {
  it('requires activation for upload and permits closed-exam evaluation only explicitly', async () => {
    const env={} as any;
    const exam={id:'exam',status:'DRAFT',owner_type:'INSTITUTION',institution_id:'school'};
    expect((await examEvaluationAccess(env,exam,'school'))?.status).toBe(400);
    exam.status='CLOSED';
    expect((await examEvaluationAccess(env,exam,'school'))?.status).toBe(400);
    expect(await examEvaluationAccess(env,exam,'school',true)).toBeNull();
  });
  it('requires an enabled central assignment for the selected institution', async () => {
    const db=new DatabaseSync(':memory:');
    try {
      db.exec("CREATE TABLE exam_institutions(id TEXT,exam_id TEXT,institution_id TEXT,enabled INTEGER);INSERT INTO exam_institutions VALUES('assignment','exam','allowed',1),('off','exam','disabled',0)");
      const env={DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({first:async()=>db.prepare(sql).get(...args)})})}} as any;
      const exam={id:'exam',status:'ACTIVE',owner_type:'CENTRAL',institution_id:null};
      expect(await examEvaluationAccess(env,exam,'allowed')).toBeNull();
      expect((await examEvaluationAccess(env,exam,'foreign'))?.status).toBe(403);
      expect((await examEvaluationAccess(env,exam,'disabled'))?.status).toBe(403);
    } finally {db.close();}
  });
  it('rejects an institution-owned exam selected for another institution', async () => {
    expect((await examEvaluationAccess({} as any,{id:'exam',status:'ACTIVE',owner_type:'INSTITUTION',institution_id:'owner'},'other'))?.status).toBe(403);
  });
});
