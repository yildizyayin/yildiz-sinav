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
});
