import { appendFileSync, existsSync, writeFileSync } from 'node:fs';

const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
const REPORT='LIVE_SMOKE_REPORT.md';
const finalChecks=[];

function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,details=''){finalChecks.push({name,details});console.log(`✓ ${name}${details?` — ${details}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function reqForm(path,{cookie,form,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;const r=await fetch(`${BASE}${path}`,{method:'POST',headers:h,body:form,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`POST ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function ensureReport(){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n')}
function persist(){ensureReport();appendFileSync(REPORT,`\n## Final platform feature checks\n\n${finalChecks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}\n`)}
function persistFailure(error){ensureReport();const message=String(error instanceof Error?error.stack||error.message:error).slice(0,10000);appendFileSync(REPORT,`\n## Final platform feature checks\n\n${finalChecks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}${finalChecks.length?'\n':''}- ❌ **Final feature smoke failure**\n\n\`\`\`text\n${message}\n\`\`\`\n`)}

try{
 const manager=await login('manager');

 const managerNibiru=await req('/api/nibiru/chat',{method:'POST',cookie:manager,json:{message:'Bugün ne oldu?'}});
 assert(String(managerNibiru.p?.answer||'').startsWith('Nibiru:'),'Nibiru branded AI identity prefix missing',managerNibiru.p);
 assert(!String(managerNibiru.p?.answer||'').includes('🤖'),'Legacy robot emoji leaked into Nibiru answer',managerNibiru.p);
 assert(managerNibiru.p?.intent==='TODAY_STATUS','Manager Nibiru intent mismatch',managerNibiru.p);
 passed('Nibiru manager AI transparency + institution scope',managerNibiru.p.intent);

 const nibiruSettings=await req('/api/nibiru/settings',{cookie:manager});
 assert(nibiruSettings.p?.settings?.assistant_name==='Nibiru AI','Nibiru settings missing',nibiruSettings.p);
 assert(nibiruSettings.p?.settings?.education_language_mode==='MEB_DEVELOPMENTAL','Nibiru MEB developmental language mode missing',nibiruSettings.p);
 const nibiruUsers=await req('/api/nibiru/users',{cookie:manager});
 for(const role of ['PARENT','TEACHER','INSTITUTION_MANAGER']){
   const target=(nibiruUsers.p?.users||[]).find(x=>x.role===role);
   if(!target)continue;
   const pairing=await req('/api/nibiru/pairing-code',{method:'POST',cookie:manager,json:{userId:target.id}});
   assert(/^\d{6}$/.test(pairing.p?.code||''),`Nibiru ${role} pairing code invalid`,pairing.p);
 }
 passed('Nibiru WhatsApp role pairing preparation','parent/teacher/manager role-safe pairing codes');

 const opticals=await req('/api/optical-templates',{cookie:manager});
 const optical840=(opticals.p?.templates||[]).find(x=>x.version_id==='v_opt840');
 assert(optical840?.has_print,'Optik 840 did not receive migration-generated print fields',opticals.p);
 const printers=await req('/api/printer-profiles',{cookie:manager});
 const canon=(printers.p?.profiles||[]).find(x=>x.id==='printer_canon');
 assert(canon,'Demo printer profile missing',printers.p);

 const startCal=await req('/api/calibrations/start',{method:'POST',cookie:manager,json:{printerProfileId:'printer_canon',templateVersionId:'v_opt840'}});
 assert(startCal.p?.calibration?.id,'Calibration start did not return a row',startCal.p);
 const calForm=new FormData();
 calForm.append('image',new File([new Uint8Array([255,216,255,217])],'synthetic-calibration.jpg',{type:'image/jpeg'}));
 calForm.append('metrics',JSON.stringify({offset_x_mm:0.2,offset_y_mm:-0.1,scale_x:1.001,scale_y:0.9995,rotation_deg:0.04,confidence:0.99}));
 calForm.append('mode','AUTO');
 const calAttempt=await reqForm(`/api/calibrations/${startCal.p.calibration.id}/attempt`,{cookie:manager,form:calForm});
 assert(calAttempt.p?.status==='READY','Synthetic calibration attempt did not reach READY',calAttempt.p);

 const calibrations=await req('/api/calibrations',{cookie:manager});
 const readyCal=(calibrations.p?.calibrations||[]).find(x=>x.printer_profile_id==='printer_canon'&&x.optical_template_version_id==='v_opt840');
 assert(readyCal?.status==='READY','Canon + Optik 840 calibration is not READY',calibrations.p);
 assert(Number.isFinite(Number(readyCal.offset_x_mm))&&Number.isFinite(Number(readyCal.scale_x)),'Calibration correction metrics missing',readyCal);
 const prep=await req('/api/optical-prepare?classId=class_7a&templateVersionId=v_opt840&examId=exam_demo_active&sort=number',{cookie:manager});
 assert((prep.p?.students||[]).length===20,'Personalized Optik 840 preparation did not return 20 active students',prep.p);
 assert((prep.p?.bookletCodes||[]).join(',')==='A,B','Expected A/B booklet set',prep.p?.bookletCodes);
 assert((prep.p?.students||[]).every(x=>['A','B'].includes(x.booklet_code)),'Student booklet is outside configured A/B set',prep.p?.students?.slice(0,4));
 const fields=prep.p?.template?.printFields?.fields||[];
 for(const key of ['studentName','studentNumber','class','bookletCode','institutionCode','examTitle'])assert(fields.some(x=>x.key===key),`Optik 840 print field ${key} missing`,fields);
 passed('Optik 840 + printer calibration + personalized print flow',`${prep.p.students.length} students · A/B set recognized · existing assignments preserved · ${canon.name}`);

 const guests=await req('/api/students?status=GUEST',{cookie:manager});
 assert((guests.p?.students||[]).length===45,'Expected demo guests',guests.p);
 const guest=guests.p.students[0];
 const created=await req('/api/activation-requests',{method:'POST',cookie:manager,json:{studentId:guest.id,note:'Live final smoke request'},expected:201});
 assert(created.p?.id,'Activation request id missing',created.p);
 const managerRequests=await req('/api/activation-requests',{cookie:manager});
 assert((managerRequests.p?.requests||[]).some(x=>x.id===created.p.id&&x.status==='PENDING'),'Manager cannot see pending activation request',managerRequests.p);

 const superCookie=await login('super');
 const licenses=await req('/api/admin/licenses',{cookie:superCookie});
 const demoLicense=(licenses.p?.licenses||[]).find(x=>x.id==='inst_demo');
 assert(demoLicense?.license,'License engine did not return an effective license for existing institution',licenses.p);
 assert(demoLicense.license.locked===false,'Legacy institution should remain active after license rollout',demoLicense);
 passed('License rollout backward compatibility',`${demoLicense.license.planCode} · ${demoLicense.license.status}`);

 const superRequests=await req('/api/activation-requests',{cookie:superCookie});
 assert((superRequests.p?.requests||[]).some(x=>x.id===created.p.id),'Super Admin cannot see activation request',superRequests.p);
 const superNotes=await req('/api/notifications',{cookie:superCookie});
 const activationNote=(superNotes.p?.notifications||[]).find(x=>x.entity_id===created.p.id);
 assert(activationNote,'Super Admin activation notification missing',superNotes.p);
 if(!activationNote.dynamic)await req(`/api/notifications/${activationNote.id}/read`,{method:'POST',cookie:superCookie});
 await req(`/api/activation-requests/${created.p.id}/decision`,{method:'POST',cookie:superCookie,json:{decision:'REJECT',note:'Smoke test; demo durumunu koru'}});
 const afterDecision=await req('/api/activation-requests',{cookie:manager});
 assert((afterDecision.p?.requests||[]).some(x=>x.id===created.p.id&&x.status==='REJECTED'),'Activation decision not persisted',afterDecision.p);
 const managerNotes=await req('/api/notifications',{cookie:manager});
 assert((managerNotes.p?.notifications||[]).some(x=>x.entity_id===created.p.id&&x.type==='ACTIVATION_REJECTED'),'Manager decision notification missing',managerNotes.p);
 passed('Activation request + notification flow','manager request → Super Admin decision → manager notification');

 const student=await login('student1');
 const wrong=await req('/api/my-wrong-answers',{cookie:student});
 assert(Array.isArray(wrong.p?.wrongAnswers)&&Array.isArray(wrong.p?.exams),'Wrong/blank question API invalid',wrong.p);
 const studentNotes=await req('/api/notifications',{cookie:student});
 assert(Array.isArray(studentNotes.p?.notifications),'Student notification center invalid',studentNotes.p);
 passed('Student wrong/blank learning flow',`${wrong.p.wrongAnswers.length} question rows available`);

 const parent=await login('parent1');
 const parentNibiru=await req('/api/nibiru/chat',{method:'POST',cookie:parent,json:{message:'Öğrencim nasıl?'}});
 assert(String(parentNibiru.p?.answer||'').startsWith('Nibiru:'),'Parent Nibiru answer does not expose branded AI identity',parentNibiru.p);
 assert(!String(parentNibiru.p?.answer||'').includes('🤖'),'Legacy robot emoji leaked into parent Nibiru answer',parentNibiru.p);
 assert(parentNibiru.p?.intent==='STUDENT_GENERAL','Parent general-student intent mismatch',parentNibiru.p);
 const offTopic=await req('/api/nibiru/chat',{method:'POST',cookie:parent,json:{message:'Bugün hava nasıl?'}});
 assert(offTopic.p?.outcome==='REDIRECTED','Nibiru did not redirect non-academic request',offTopic.p);
 passed('Nibiru parent context + non-academic redirect','student-linked context · AI disclosure · safe redirect');

 const weekly=await req('/api/parent/weekly-summary',{cookie:parent});
 assert(weekly.p?.student?.id==='stu_a001','Parent weekly summary child boundary failed',weekly.p);
 assert(weekly.p?.summary&&typeof weekly.p.summary.exam_count==='number','Parent weekly summary missing',weekly.p);
 const parentNotes=await req('/api/notifications',{cookie:parent});
 assert((parentNotes.p?.notifications||[]).some(x=>x.type==='WEEKLY_SUMMARY'),'Parent weekly summary notification missing',parentNotes.p);
 passed('Parent weekly summary + notification flow',`${weekly.p.summary.exam_count} exams in last 7 days`);

 const guestCountAfter=await req('/api/students?status=GUEST',{cookie:manager});
 assert((guestCountAfter.p?.students||[]).length===45,'Rejected smoke activation changed guest count',guestCountAfter.p?.students?.length);
 passed('Demo identity preservation','45 guests preserved after rejected smoke request');

 persist();
 console.log(`\n${finalChecks.length} final feature live smoke checks passed.`);
}catch(error){persistFailure(error);console.error(error);process.exitCode=1}
