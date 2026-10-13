import {describe,it,expect} from 'vitest';
import {publishStudioExam} from '../worker/lib/studio-exam-publish';
describe('Studio exam publication safety',()=>{
 const request=(body:any={academicYear:'2026-2027'})=>new Request('https://app.anunex.com/api/platform/studio/doc1/publish-exam',{method:'POST',body:JSON.stringify(body)});
 it('denies students before any database call',async()=>expect((await publishStudioExam(request(),{} as any,{role:'STUDENT'} as any,'doc1')).status).toBe(403));
 it('rejects missing Studio document',async()=>{
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>null})})}};
  expect((await publishStudioExam(request(),env as any,{role:'SUPER_ADMIN'} as any,'doc1')).status).toBe(404);
 }); it('rejects missing scoring profile before querying booklets',async()=>{
  let calls=0;
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>{calls++;return calls===1?{id:'doc1',institution_id:'inst',created_by:'admin',status:'READY',document_type:'PRACTICE_EXAM'}:null;}})})}};
  const response=await publishStudioExam(request(),env as any,{role:'SUPER_ADMIN',id:'admin'} as any,'doc1');
  expect(response.status).toBe(400);
  expect((await response.json() as any).error.code).toBe('SCORING_PROFILE_REQUIRED');
 });

});
