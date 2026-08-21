import { appendFileSync, existsSync, writeFileSync } from 'node:fs';

const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
const REPORT='LIVE_SMOKE_REPORT.md';
const finalChecks=[];

function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,details=''){finalChecks.push({name,details});console.log(`✓ ${name}${details?` — ${details}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function ensureReport(){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n')}
function persist(){ensureReport();appendFileSync(REPORT,`\n## Final platform feature checks\n\n${finalChecks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}\n`)}
function persistFailure(error){ensureReport();const message=String(error instanceof Error?error.stack||error.message:error).slice(0,10000);appendFileSync(REPORT,`\n## Final platform feature checks\n\n${finalChecks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}${finalChecks.length?'\n':''}- ❌ **Final feature smoke failure**\n\n\`\`\`text\n${message}\n\`\`\`\n`)}

try{
 const manager=await login('manager');

 const opticals=await req('/api/optical-templates',{cookie:manager});
 const demoOptical=(opticals.p?.templates||[]).find(x=>x.version_id==='optv_demo');
 assert(demoOptical?.has_print,'Demo optical is not print-ready',opticals.p);
 const printers=await req('/api/printer-profiles',{cookie:manager});
 const canon=(printers.p?.profiles||[]).find(x=>x.id==='printer_canon');
 assert(canon,'Demo printer profile missing',printers.p);
 const calibrations=await req('/api/calibrations',{cookie:manager});
 const readyCal=(calibrations.p?.calibrations||[]).find(x=>x.printer_profile_id==='printer_canon'&&x.optical_template_version_id==='optv_demo');
 assert(readyCal?.status==='READY','Printer + optical calibration is not READY',calibrations.p);
 assert(Number.isFinite(Number(readyCal.offset_x_mm))&&Number.isFinite(Number(readyCal.scale_x)),'Calibration correction metrics missing',readyCal);
 const prep=await req('/api/optical-prepare?classId=class_7a&templateVersionId=optv_demo&examId=exam_demo_active&sort=number',{cookie:manager});
 assert((prep.p?.students||[]).length===65,'Personalized optical preparation did not return 65 active students',prep.p);
 assert((prep.p?.bookletCodes||[]).join(',')==='A,B','Expected A/B booklet set',prep.p?.bookletCodes);
 assert((prep.p?.students||[]).some(x=>x.booklet_code==='A')&&(prep.p?.students||[]).some(x=>x.booklet_code==='B'),'Booklet assignment did not distribute A/B',prep.p?.students?.slice(0,4));
 const fields=prep.p?.template?.printFields?.fields||[];
 for(const key of ['studentName','studentNumber','class','bookletCode','institutionCode','examTitle'])assert(fields.some(x=>x.key===key),`Print field ${key} missing`,fields);
 passed('Optical template + printer calibration + personalized print flow',`${prep.p.students.length} students · A/B booklet · ${canon.name}`);

 const guests=await req('/api/students?status=GUEST',{cookie:manager});
 assert((guests.p?.students||[]).length===45,'Expected demo guests',guests.p);
 const guest=guests.p.students[0];
 const created=await req('/api/activation-requests',{method:'POST',cookie:manager,json:{studentId:guest.id,note:'Live final smoke request'},expected:201});
 assert(created.p?.id,'Activation request id missing',created.p);
 const managerRequests=await req('/api/activation-requests',{cookie:manager});
 assert((managerRequests.p?.requests||[]).some(x=>x.id===created.p.id&&x.status==='PENDING'),'Manager cannot see pending activation request',managerRequests.p);

 const superCookie=await login('super');
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
