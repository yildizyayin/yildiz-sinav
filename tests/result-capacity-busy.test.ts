import {expect,it,vi} from 'vitest';
import worker,{resultReadOverloaded} from '../worker/privacy-export-entry';
const overloaded=new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long. PRIVATE_DIAGNOSTIC');
it('returns a private retryable busy response only for read-only result access',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const statement:any={bind:()=>statement,all:async()=>{throw overloaded},first:async()=>{throw overloaded}};
  const env:any={ENVIRONMENT:'staging',DB:{prepare:()=>statement}};
  const ctx:any={waitUntil:()=>{}};
  const response=await worker.fetch(new Request('https://test/api/public/results/student',{headers:{cookie:'anunex_result_session=synthetic'}}),env,ctx);
  expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('3');expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const payload:any=await response.json();expect(payload.error.code).toBe('RESULT_CAPACITY_BUSY');expect(payload.error.details.retryAfterSeconds).toBe(3);expect(JSON.stringify(payload)).not.toContain('PRIVATE_DIAGNOSTIC');
  const mutation=await worker.fetch(new Request('https://test/api/public/results/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:'test',accessCode:'12345678'})}),env,ctx);
  expect(mutation.status).toBe(500);expect(mutation.headers.get('Retry-After')).toBeNull();
 }finally{log.mockRestore()}
});
it('keeps expired-session and unrelated errors out of the capacity retry path',()=>{
 const get=new Request('https://test/api/public/results/student');
 expect(resultReadOverloaded(get,new Error('Some unrelated failure'))).toBe(false);
 expect(resultReadOverloaded(new Request('https://test/api/auth/login'),overloaded)).toBe(false);
 expect(resultReadOverloaded(new Request('https://test/api/public/results/lookup',{method:'POST'}),overloaded)).toBe(false);
 expect(resultReadOverloaded(new Request('https://test/api/public/results/exams/exam_1'),overloaded)).toBe(true);
});
