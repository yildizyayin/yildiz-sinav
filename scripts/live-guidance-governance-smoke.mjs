import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';const REPORT='LIVE_SMOKE_REPORT.md';const checks=[];
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,detail=''){checks.push({name,detail});console.log(`✓ ${name}${detail?` — ${detail}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function persist(ok,error){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n');let text=`\n## Counselor-approved RBA / guidance governance\n\n${checks.map(x=>`- ✅ **${x.name}**${x.detail?` — ${x.detail}`:''}`).join('\n')}`;if(!ok)text+=`${checks.length?'\n':''}- ❌ **Guidance governance failure**\n\n\`\`\`text\n${String(error instanceof Error?error.stack||error.message:error).slice(0,8000)}\n\`\`\``;appendFileSync(REPORT,`${text}\n`)}

try{
 const student=await login('student1');
 const instruments=await req('/api/nibiru/guidance/instruments',{cookie:student});
 assert(instruments.p?.instruments?.some(x=>x.code==='RBA_EDU_V1'),'RBA educational instrument is missing',instruments.p);
 passed('Educational instrument registry','RBA + counselor approval policy');

 const existing=await req('/api/nibiru/guidance/assessments/my',{cookie:student});
 const open=(existing.p?.sessions||[]).find(x=>x.code==='RBA_EDU_V1'&&['PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED'].includes(x.status));
 let session=open;
 if(!session){const chat=await req('/api/nibiru/chat',{method:'POST',cookie:student,json:{message:'RBA testi yapmak istiyorum'}});assert(chat.p?.orchestration?.specialist==='GUIDANCE_COUNSELOR','RBA did not route to Guidance Counselor AI',chat.p);session=chat.p?.guidanceAssessment?.proposal?.session;}
 assert(session?.id,'Nibiru did not create/reuse counselor-governed RBA proposal',session);
 if(session.status==='PROPOSED'){
  const blocked=await req(`/api/nibiru/guidance/assessments/${encodeURIComponent(session.id)}/submit`,{method:'POST',cookie:student,json:{responses:{}},expected:400});
  assert(blocked.p?.error?.code==='COUNSELOR_APPROVAL_REQUIRED','Student could submit before real counselor approval',blocked.p);
  passed('Pre-approval student boundary','questions/submission blocked');
 }

 const counselor=await login('guidance');
 let queue=await req('/api/nibiru/guidance/assessments/counselor-queue',{cookie:counselor});
 let row=(queue.p?.sessions||[]).find(x=>x.id===session.id);assert(row,'Proposal missing from assigned counselor queue',queue.p);
 if(row.status==='PROPOSED'){const approved=await req(`/api/nibiru/guidance/assessments/${encodeURIComponent(session.id)}/approve`,{method:'PATCH',cookie:counselor,json:{note:'Canlı kabul rehber öğretmen onayı'}});assert(approved.p?.session?.status==='APPROVED','Counselor approval did not persist',approved.p);}
 passed('Real counselor approval','assigned GUIDANCE_TEACHER opened assessment');

 const mine=await req('/api/nibiru/guidance/assessments/my',{cookie:student});
 const studentSession=(mine.p?.sessions||[]).find(x=>x.id===session.id);const items=studentSession?.question_schema?.items;
 if(studentSession?.status==='APPROVED'||studentSession?.status==='IN_PROGRESS'){
  assert(Array.isArray(items)&&items.length>0,'Approved questions were not released to student',studentSession);
  const responses=Object.fromEntries(items.map((x,i)=>[x.id,(i%5)+1]));
  const submitted=await req(`/api/nibiru/guidance/assessments/${encodeURIComponent(session.id)}/submit`,{method:'POST',cookie:student,json:{responses}});assert(submitted.p?.status==='SUBMITTED','Student responses were not submitted',submitted.p);
 }
 passed('Student assessment submission','released only after counselor approval');

 queue=await req('/api/nibiru/guidance/assessments/counselor-queue',{cookie:counselor});row=(queue.p?.sessions||[]).find(x=>x.id===session.id);assert(row?.status==='SUBMITTED','Submitted assessment missing from counselor queue',queue.p);assert(row?.scored_result?.dimensions&&!('response_json' in row),'Counselor queue must expose derived scores without raw responses',row);
 const reviewed=await req(`/api/nibiru/guidance/assessments/${encodeURIComponent(session.id)}/review`,{method:'PATCH',cookie:counselor,json:{note:'Sonuç eğitimsel gelişim planında kullanılabilir.'}});assert(reviewed.p?.session?.status==='REVIEWED'&&reviewed.p?.session?.reviewed_by,'Counselor review did not persist',reviewed.p);
 passed('Counselor review gate','derived scores accepted into development signals');

 const development=await req('/api/nibiru/guidance/development-profile',{cookie:student});
 assert(development.p?.development?.available===true&&Number(development.p?.development?.reviewedAssessments||0)>0,'Reviewed RBA did not enter student development context',development.p);
 const guided=await req('/api/nibiru/chat',{method:'POST',cookie:student,json:{message:'Hedefim ve gelişimim nasıl gidiyor?'}});
 assert(String(guided.p?.answer||'').includes('Rehber öğretmen onaylı gelişim odağı'),'Nibiru Guidance did not use reviewed counselor signals',guided.p);
 passed('Nibiru reviewed-development context','only REVIEWED educational signals used');

 persist(true);console.log(`\n${checks.length} guidance governance checks passed.`);
}catch(error){persist(false,error);console.error(error);process.exitCode=1}
