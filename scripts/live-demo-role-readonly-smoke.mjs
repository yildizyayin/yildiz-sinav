// Existing staging sessions only. GET requests never create fixtures or call providers.
const roles=['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT'];
const base='https://demo.anunex.com';
function assert(ok,code){if(!ok)throw new Error(code);}
async function request(path,cookie,status=200){
 const response=await fetch(base+path,{headers:cookie?{Cookie:cookie}:{},redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert(response.status===status,`HTTP_${response.status}_EXPECTED_${status}`);
 const body=await response.json();return body;
}
try{
 let sessions;try{sessions=JSON.parse(process.env.DEMO_ROLE_SESSIONS_JSON||'{}');}catch{throw new Error('INVALID_SESSION_CONFIGURATION');}
 for(const role of roles)assert(typeof sessions[role]==='string'&&/^yildiz_session=[^;\s]+$/.test(sessions[role]),'MISSING_OR_INVALID_ROLE_SESSION');
 assert((await request('/api/config')).environment==='staging','NOT_STAGING');
 for(const role of roles){
  assert((await request('/api/auth/me',sessions[role])).user?.role===role,'SESSION_ROLE_MISMATCH');
  console.log('PASS: '+role+' session identity');
 }
 for(const role of roles.filter(x=>x!=='SUPER_ADMIN'))await request('/api/question-bank-standard/coverage?academicYear=2026-2027',sessions[role],403);
 console.log('PASS: five non-admin roles denied pool management');
 for(const role of ['STUDENT','PARENT']){
  await request('/api/reporting/students/stu_a001/combined',sessions[role]);
  await request('/api/reporting/students/stu_a002/combined',sessions[role],403);
 }
 await request('/api/reporting/students/stu_privacy_b/combined',sessions.INSTITUTION_MANAGER,403);
 const teacher=await request('/api/reporting/students/stu_a001/combined',sessions.TEACHER);
 assert(teacher.restrictedToSubjects===true,'TEACHER_SUBJECT_SCOPE_MISSING');
 await request('/api/reporting/students/stu_std5/combined',sessions.TEACHER,403);
 await request('/api/nibiru/guidance/assessments/counselor-queue',sessions.TEACHER,403);
 const queue=await request('/api/nibiru/guidance/assessments/counselor-queue',sessions.GUIDANCE_TEACHER);
 assert(Array.isArray(queue.sessions),'GUIDANCE_QUEUE_SCHEMA_INVALID');
 assert(queue.sessions.every(row=>!Object.hasOwn(row,'response_json')),'RAW_GUIDANCE_RESPONSE_EXPOSED');
 console.log('PASS: synthetic student/parent/teacher/institution/guidance read boundaries');
 console.log('NOT TESTED: browser/mobile/PDF, write flows, logout, providers and capacity');
}catch{
 console.error('FAILED: read-only demo role acceptance; no response bodies or credentials logged');
 process.exitCode=1;
}
