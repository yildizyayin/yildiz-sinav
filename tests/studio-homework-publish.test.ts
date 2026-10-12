import {describe,it,expect} from 'vitest';
import {publishStudioHomework} from '../worker/lib/studio-homework-publish';

describe('Studio homework publish fail-closed guards',()=>{
 it('rejects unauthorized users without touching storage',async()=>{
  const response=await publishStudioHomework(new Request('https://app.anunex.com/api/platform/studio/std_1/publish-homework',{method:'POST',body:JSON.stringify({studentIds:['s1']})}),{} as any,{role:'STUDENT'} as any,'std_1');
  expect(response.status).toBe(403);
 });
 it('rejects missing recipient list before querying D1',async()=>{
  const response=await publishStudioHomework(new Request('https://app.anunex.com/api/platform/studio/std_1/publish-homework',{method:'POST',body:'{}'}),{} as any,{role:'SUPER_ADMIN'} as any,'std_1');
  expect(response.status).toBe(400);
 });
 it('rejects duplicate recipient IDs before querying D1',async()=>{
  const response=await publishStudioHomework(new Request('https://app.anunex.com/api/platform/studio/std_1/publish-homework',{method:'POST',body:JSON.stringify({studentIds:['s1','s1']})}),{} as any,{role:'SUPER_ADMIN'} as any,'std_1');
  expect(response.status).toBe(400);
 });
 it('returns existing assignment without inserting duplicate records',async()=>{
  let statements=0;
  const db={prepare:(_sql:string)=>{statements++;return {bind:()=>({first:async()=>statements===1?{institution_id:'inst1',created_by:'owner',status:'PUBLISHED'}:{external_id:'asg_existing'}})};}};
  const response=await publishStudioHomework(new Request('https://app.anunex.com/api/platform/studio/doc1/publish-homework',{
   method:'POST',body:JSON.stringify({studentIds:['student1']})}),{DB:db} as any,{role:'SUPER_ADMIN',id:'owner'} as any,'doc1');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ok:true,assignmentId:'asg_existing',reused:true});
  expect(statements).toBe(2);
 });

});
