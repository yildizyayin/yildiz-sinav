import { appendFileSync,existsSync,writeFileSync } from 'node:fs';
const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';const REPORT='LIVE_SMOKE_REPORT.md';const checks=[];
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,details=''){checks.push({name,details});console.log(`✓ ${name}${details?` — ${details}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function persist(ok,error){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n');let text=`\n## Standard package acceptance\n\n${checks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}`;if(!ok)text+=`${checks.length?'\n':''}- ❌ **Standard acceptance failure**\n\n\`\`\`text\n${String(error instanceof Error?error.stack||error.message:error).slice(0,8000)}\n\`\`\``;appendFileSync(REPORT,`${text}\n`)}
try{
 const admin=await login('super');
 const readiness=await req('/api/standard-readiness',{cookie:admin});
 assert(readiness.p?.summary?.missing===0,'Standard core schema has missing modules',readiness.p);
 assert(readiness.p?.acceptance?.coreAcceptanceReady===true,'Standard operational blockers remain',readiness.p);
 passed('Standard readiness gate',`core ready · external setup ${readiness.p.acceptance.externalSetup}`);
 const providers=readiness.p?.providers;
 assert(typeof providers?.youtube?.ready==='boolean'&&typeof providers?.whatsapp?.ready==='boolean','Provider activation detail missing',readiness.p);
 if(providers.whatsapp.ready)assert(providers.whatsapp.verifyToken&&providers.whatsapp.appSecret&&providers.whatsapp.accessToken&&providers.whatsapp.phoneNumberId,'WhatsApp marked ready without all required secrets',providers.whatsapp);
 passed('External provider activation contract',`YouTube ${providers.youtube.ready?'ready':'setup'} · WhatsApp ${providers.whatsapp.ready?'ready':'setup'}`);
 const bank=await req('/api/question-bank-standard/stats',{cookie:admin});
 assert(Number(bank.p?.printable||0)>=18,'Printable Standard question bank fixture missing',bank.p);
 passed('Standard question bank',`${bank.p.printable} approved printable questions`);

 const student=await login('student1');
 const coach=await req('/api/nibiru/chat',{method:'POST',cookie:student,json:{message:'Bugün ne çalışayım?'}});
 assert(coach.p?.orchestration?.specialist==='EDUCATION_COACH','Nibiru did not route study plan to Education Coach',coach.p);
 assert(coach.p?.coachPlan?.available===true&&Array.isArray(coach.p.coachPlan.items)&&coach.p.coachPlan.items.length>0,'Education Coach did not persist a verified daily plan',coach.p);
 const planId=coach.p.coachPlan.plan?.id,firstItem=coach.p.coachPlan.items[0];assert(planId&&firstItem?.id,'Education Coach plan identifiers missing',coach.p.coachPlan);
 const reused=await req('/api/nibiru/coach/daily-plan',{method:'POST',cookie:student});
 assert(reused.p?.available===true&&reused.p?.plan?.id===planId&&reused.p?.reused===true,'Daily plan is not idempotent on repeat',reused.p);
 assert(firstItem.payload?.kind==='OUTCOME_PRACTICE','First Coach item is not a measurable outcome task',firstItem);
 const started=await req(`/api/nibiru/coach/items/${encodeURIComponent(firstItem.id)}/mini-test`,{method:'POST',cookie:student,json:{},expected:201});
 assert(started.p?.ok===true&&Number(started.p?.questionCount)>=5,'Coach mini-test did not start with at least five questions',started.p);
 const firstTest=await req(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.p.testId)}`,{cookie:student});
 assert(firstTest.p?.questions?.length>=5&&firstTest.p.questions.every(x=>x.correct_answer==null),'Coach mini-test exposed answers or has insufficient questions',firstTest.p);
 const failed=await req(`/api/nibiru/coach/mini-tests/${encodeURIComponent(started.p.testId)}/submit`,{method:'POST',cookie:student,json:{answers:firstTest.p.questions.map(x=>({questionId:x.question_id,answer:'Z'}))}});
 assert(failed.p?.result?.passed===false&&failed.p?.detail?.followups?.length>=2,'Failed remeasurement did not create support actions',failed.p);
 const answerKey=Object.fromEntries(failed.p.detail.questions.map(x=>[x.question_id,x.correct_answer]));
 const coachFollowup=failed.p.detail.followups[0];
 await req(`/api/nibiru/coach/followups/${encodeURIComponent(coachFollowup.id)}/complete`,{method:'PATCH',cookie:student,json:{}});
 const retry=await req(`/api/nibiru/coach/items/${encodeURIComponent(firstItem.id)}/mini-test`,{method:'POST',cookie:student,json:{},expected:201});
 assert(retry.p?.ok===true&&Number(retry.p?.cycleNo)===2,'Coach retry mini-test did not open after support',retry.p);
 const retryTest=await req(`/api/nibiru/coach/mini-tests/${encodeURIComponent(retry.p.testId)}`,{cookie:student});
 const passedTest=await req(`/api/nibiru/coach/mini-tests/${encodeURIComponent(retry.p.testId)}/submit`,{method:'POST',cookie:student,json:{answers:retryTest.p.questions.map(x=>({questionId:x.question_id,answer:answerKey[x.question_id]}))}});
 assert(passedTest.p?.result?.passed===true&&passedTest.p?.result?.masteryStatus==='MASTERED','Successful remeasurement did not master the outcome',passedTest.p);
 const currentPlan=await req('/api/nibiru/coach/daily-plan',{cookie:student});
 assert(currentPlan.p?.available===true&&currentPlan.p?.plan?.id===planId&&currentPlan.p?.items?.some(x=>x.id===firstItem.id&&x.completed===true),'Completed Coach item was not persisted',currentPlan.p);
 passed('Education Coach verified mastery cycle',`${coach.p.coachPlan.items.length} tasks · failed → support → retry → mastered · progress ${currentPlan.p.plan.progress}%`);
 const results=await req('/api/my-results',{cookie:student});
 assert((results.p?.exams||[]).some(x=>x.exam_id==='exam_hist_08'),'Institution exam missing from student result history',results.p);
 passed('Zero Error exam source','institution exams are selectable, not only central snapshots');
 const review=await req('/api/student-standard/exam-review?examId=exam_hist_08',{cookie:student});
 const statuses=new Set((review.p?.answers||[]).map(x=>x.status));
 for(const s of ['CORRECT','WRONG','BLANK'])assert(statuses.has(s),`Question review missing ${s}`,review.p);
 passed('Correct / wrong / blank question review','all answer states available');
 const support=await req('/api/student-standard/question-support?examQuestionId=q_std_hist_mat_1',{cookie:student});
 assert(support.p?.question?.status==='WRONG','Question support did not resolve student evidence',support.p);
 assert('solutionVideo' in (support.p?.options||{})&&'topicVideo' in (support.p?.options||{}),'Video support contract incomplete',support.p);
 passed('Publisher solution + topic micro-learning contract',support.p?.microLearning?.reason||'registered video path');
 const personal=await req('/api/student-books/personal',{method:'POST',cookie:student,json:{outcomeLimit:8,questionsPerOutcome:3},expected:201});
 assert(Number(personal.p?.questionCount||0)>0,'Personal book did not select approved questions',personal.p);
 passed('Kişiye Özel Kitap',`${personal.p.outcomeCount} outcomes · ${personal.p.questionCount} questions`);
 const zero=await req('/api/student-books/zero-error',{method:'POST',cookie:student,json:{examId:'exam_hist_08',practicePerSource:2},expected:201});
 assert(Number(zero.p?.wrongCount||0)>=1&&Number(zero.p?.blankCount||0)>=1,'Zero Error source evidence missing',zero.p);
 assert(Number(zero.p?.practiceCount||0)>0,'Zero Error did not produce similar approved practice questions',zero.p);
 passed('Sıfır Hata Kitapçığı',`${zero.p.wrongCount} wrong · ${zero.p.blankCount} blank · ${zero.p.practiceCount} practice`);

 const grade5=await login('student5');
 const games=await req('/api/student-standard/games',{cookie:grade5});
 assert(games.p?.gradeLevel===5&&Array.isArray(games.p?.games)&&games.p.games.length>0,'Grade 5 educational games are not active',games.p);
 passed('5–12 educational game catalog',`${games.p.games.length} age-appropriate games for grade 5`);

 const grade12=await login('student12');
 const targets=await req('/api/student-standard/targets',{cookie:grade12});
 assert(targets.p?.gradeLevel===12&&Number(targets.p?.maxTargets)===3,'Grade 12 three-target policy is not active',targets.p);
 passed('12th-grade YKS target engine','maximum 3 targets · official data gate active');

 persist(true);console.log(`\n${checks.length} Standard live acceptance checks passed.`);
}catch(error){persist(false,error);console.error(error);process.exitCode=1}
