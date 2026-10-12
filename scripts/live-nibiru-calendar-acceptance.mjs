import assert from 'node:assert/strict';

const BASE='https://demo.anunex.com';
const password=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const cookies=[];
async function request(path,{method='GET',cookie,body,status=200}={}){
 const response=await fetch(BASE+path,{method,redirect:'manual',headers:{Origin:BASE,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const payload=await response.json().catch(()=>null);
 assert.equal(response.status,status,`${method} ${path}: HTTP ${response.status}, ${payload?.error?.code||'unexpected status'}`);
 return {response,payload};
}
async function login(identifier,role){
 const {response}=await request('/api/auth/login',{method:'POST',body:{identifier,password,remember:false,turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}});
 const cookie=response.headers.get('set-cookie')?.match(/yildiz_session=[^;]+/)?.[0];assert(cookie,'Session not created');cookies.push(cookie);
 const {payload}=await request('/api/auth/me',{cookie});assert.equal(payload.user.role,role);return {cookie,user:payload.user};
}
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const to=new Date(Date.parse(day)+7*86400000).toISOString().slice(0,10);
let student,eventId,eventBody;
try{
 const publicAnswer=await request('/api/nibiru/public-chat',{method:'POST',body:{message:'Çocuğumun sonucunu göster'}});
 assert.equal(publicAnswer.payload.personalized,false);assert.equal(publicAnswer.payload.mode,'GUEST_INFORMATION');
 await request('/api/nibiru/identity',{status:401});await request(`/api/calendar?from=${day}&to=${to}`,{status:401});
 await request('/api/calendar',{method:'POST',body:{title:'unauthorized'},status:401});
 console.log('PASS guest entry and unauthenticated private-data denial');
 student=await login('student1','STUDENT');const parent=await login('parent1','PARENT');
 const si=await request('/api/nibiru/identity',{cookie:student.cookie}),pi=await request('/api/nibiru/identity',{cookie:parent.cookie});
 assert.equal(si.payload.students.length,1);assert.equal(si.payload.students[0].id,student.user.student_id);
 assert(pi.payload.students.some(s=>s.id===student.user.student_id),'Synthetic parent is not linked to the expected student');
 console.log('PASS live student identity and current parent link (no names printed)');
 const studentCalendar=await request(`/api/calendar?from=${day}&to=${to}`,{cookie:student.cookie});
 const parentCalendar=await request(`/api/calendar?from=${day}&to=${to}`,{cookie:parent.cookie});
 assert(Array.isArray(studentCalendar.payload.events)&&Array.isArray(parentCalendar.payload.events));
 eventBody={title:'Sentetik takvim kabul kontrolü',scope:'PERSONAL',kind:'STUDY',startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+5400000).toISOString(),recurrence:'NONE',reminderMinutes:30};
 const created=await request('/api/calendar',{cookie:student.cookie,method:'POST',body:eventBody,status:201});eventId=created.payload.id;assert(eventId);
 const afterStudent=await request(`/api/calendar?from=${day}&to=${to}`,{cookie:student.cookie});assert(afterStudent.payload.events.some(e=>e.id===eventId),'Saved personal event missing');
 const afterParent=await request(`/api/calendar?from=${day}&to=${to}`,{cookie:parent.cookie});assert(!afterParent.payload.events.some(e=>e.id===eventId),'Student private plan exposed to parent');
 await request(`/api/calendar/${eventId}/acknowledge`,{cookie:parent.cookie,method:'POST',body:{occurrenceAt:eventBody.startsAt},status:404});
 await request(`/api/calendar/${eventId}`,{cookie:student.cookie,method:'PUT',body:{...eventBody,revision:1,status:'CANCELLED'}});eventId=null;
 console.log('PASS live calendar save, parent privacy boundary and cancellation');
 for(const cookie of cookies){await request('/api/auth/logout',{method:'POST',cookie,body:{}});await request('/api/auth/me',{cookie,status:401});}
 cookies.length=0;
 console.log('PASS real session revocation and denied cookie reuse');
 console.log('ACCEPTED staging only; synthetic users; no WhatsApp/SMS, no bulk fixtures, no paid voice, no device passkey claim');
}finally{
 if(eventId&&student&&eventBody)await request(`/api/calendar/${eventId}`,{cookie:student.cookie,method:'PUT',body:{...eventBody,revision:1,status:'CANCELLED'}}).catch(()=>console.error('Synthetic calendar cleanup pending'));
 for(const cookie of cookies)await request('/api/auth/logout',{method:'POST',cookie,body:{}}).catch(()=>console.error('Synthetic session cleanup pending'));
}
