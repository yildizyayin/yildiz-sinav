import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';const REPORT='LIVE_SMOKE_REPORT.md';const checks=[];
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,detail=''){checks.push({name,detail});console.log(`✓ ${name}${detail?` — ${detail}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function persist(ok,error){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n');let text=`\n## Student Intelligence / Learning Graph\n\n${checks.map(x=>`- ✅ **${x.name}**${x.detail?` — ${x.detail}`:''}`).join('\n')}`;if(!ok)text+=`${checks.length?'\n':''}- ❌ **Student Intelligence failure**\n\n\`\`\`text\n${String(error instanceof Error?error.stack||error.message:error).slice(0,8000)}\n\`\`\``;appendFileSync(REPORT,`${text}\n`)}

try{
 const student=await login('student1');
 const first=await req('/api/student-intelligence/profile',{cookie:student});
 const profile=first.p?.profile;
 assert(profile?.profileVersion>=1,'Student intelligence profile version missing',first.p);
 assert(profile?.payload?.policy?.educationalOnly===true&&profile?.payload?.policy?.diagnosticUse===false,'Educational-only profile policy missing',profile?.payload?.policy);
 assert(profile?.payload?.policy?.rawGuidanceResponsesIncluded===false,'Raw guidance responses must never enter intelligence profile',profile?.payload?.policy);
 assert(Number(profile?.payload?.overall?.evidenceCount||0)>0,'Student intelligence has no academic evidence',profile?.payload?.overall);
 assert(Array.isArray(profile?.payload?.subjects)&&profile.payload.subjects.length>0,'Subject rollup missing',profile?.payload);
 passed('Persistent student intelligence profile',`v${profile.profileVersion} · ${profile.payload.overall.evidenceCount} evidence · ${profile.payload.subjects.length} subjects`);

 const repeat=await req('/api/student-intelligence/profile',{cookie:student});
 assert(repeat.p?.profile?.profileVersion===profile.profileVersion,'Unchanged refresh created a new profile version',{first:profile.profileVersion,second:repeat.p?.profile?.profileVersion});
 assert(repeat.p?.profile?.changed===false,'Unchanged profile refresh must be idempotent',repeat.p?.profile);
 const history=await req('/api/student-intelligence/history',{cookie:student});
 assert(Array.isArray(history.p?.history)&&history.p.history.some(x=>Number(x.profile_version)===Number(profile.profileVersion)),'Profile history snapshot missing',history.p);
 passed('Idempotent refresh + versioned history',`${history.p.history.length} history snapshots`);

 const graph=await req('/api/student-intelligence/learning-graph',{cookie:student});
 assert(Array.isArray(graph.p?.nodes)&&graph.p.nodes.length>0,'Learning Graph has no outcome nodes',graph.p);
 assert(graph.p.nodes.every(x=>['STRONG','STABLE','DEVELOPING','CRITICAL','INSUFFICIENT'].includes(x.band)),'Invalid mastery band in Learning Graph',graph.p.nodes);
 assert(graph.p?.policy?.diagnosticUse===false,'Learning Graph must remain educational-only',graph.p?.policy);
 passed('Live outcome → evidence → Learning Graph sync',`${graph.p.nodes.length} outcome nodes · ${graph.p.weak.length} current priorities`);

 const parent=await login('parent1');
 const parentProfile=await req('/api/student-intelligence/profile',{cookie:parent});
 assert(parentProfile.p?.profile?.studentId==='stu_a001','Parent did not resolve linked child',parentProfile.p);
 assert(Array.isArray(parentProfile.p?.profile?.payload?.subjects)&&parentProfile.p.profile.payload.subjects.length>0,'Parent academic view missing',parentProfile.p);
 assert(!('dimensions' in (parentProfile.p?.profile?.payload?.guidance||{})),'Parent received counselor dimension details',parentProfile.p?.profile?.payload?.guidance);
 passed('Parent-safe intelligence scope','academic view retained · counselor dimensions masked');

 const math=await login('math');
 const teacher=await req('/api/student-intelligence/profile?studentId=stu_a001',{cookie:math});
 assert(teacher.p?.profile?.accessScope==='SUBJECT','Branch teacher did not receive subject scope',teacher.p?.profile);
 const teacherSubjects=teacher.p?.profile?.payload?.subjects||[];
 assert(teacherSubjects.length>0&&teacherSubjects.every(x=>x.subjectName==='Matematik'),'Branch teacher received non-Mathematics intelligence',teacherSubjects);
 assert((teacher.p?.profile?.payload?.recentExams||[]).length===0,'Branch teacher received cross-subject exam aggregates',teacher.p?.profile?.payload?.recentExams);
 assert(Number(teacher.p?.profile?.payload?.targets?.activeCount||0)===0,'Branch teacher received target data',teacher.p?.profile?.payload?.targets);
 assert(teacher.p?.profile?.payload?.guidance?.available===false,'Branch teacher received guidance signal details',teacher.p?.profile?.payload?.guidance);
 const blockedHistory=await req('/api/student-intelligence/history?studentId=stu_a001',{cookie:math,expected:403});
 assert(blockedHistory.p?.error?.code==='SUBJECT_HISTORY_RESTRICTED','Branch teacher accessed full historical aggregate',blockedHistory.p);
 passed('Branch teacher subject boundary','Matematik only · cross-domain history blocked');

 const guidance=await login('guidance');
 const guidanceProfile=await req('/api/student-intelligence/profile?studentId=stu_a001',{cookie:guidance});
 assert(guidanceProfile.p?.profile?.accessScope==='FULL','Assigned guidance teacher should have full educational scope',guidanceProfile.p?.profile);
 assert(Number(guidanceProfile.p?.profile?.payload?.guidance?.reviewedSignalCount||0)>0,'Reviewed guidance signals missing after governance acceptance',guidanceProfile.p?.profile?.payload?.guidance);
 const guidanceText=JSON.stringify(guidanceProfile.p?.profile||{}).toLowerCase();
 assert(!guidanceText.includes('response_json')&&!guidanceText.includes('rawresponse'),'Raw guidance responses leaked into intelligence profile',guidanceProfile.p?.profile);
 passed('Counselor-reviewed development integration',`${guidanceProfile.p.profile.payload.guidance.reviewedSignalCount} reviewed signals · no raw responses`);

 const nibiru=await req('/api/nibiru/chat',{method:'POST',cookie:student,json:{message:'Hangi kazanımlarda zorlanıyorum?'}});
 assert(nibiru.p?.studentIntelligence?.contextInjected===true,'Student Intelligence was not prepared for Nibiru',nibiru.p);
 assert(Number(nibiru.p?.studentIntelligence?.profileVersion||0)>=1,'Nibiru intelligence profile version missing',nibiru.p?.studentIntelligence);
 assert(String(nibiru.p?.answer||'').startsWith('Nibiru:'),'Nibiru user-visible identity prefix is not brand-safe',nibiru.p?.answer);
 assert(!String(nibiru.p?.answer||'').includes('🤖'),'Robot emoji leaked into Nibiru answer',nibiru.p?.answer);
 assert(nibiru.p?.orchestration?.specialist,'Nibiru specialist orchestration disappeared',nibiru.p);
 passed('Nibiru common intelligence context',`profile v${nibiru.p.studentIntelligence.profileVersion} · ${nibiru.p.studentIntelligence.priorityCount} compact priorities · ${nibiru.p.orchestration.specialist}`);

 persist(true);console.log(`\n${checks.length} Student Intelligence live checks passed.`);
}catch(error){persist(false,error);console.error(error);process.exitCode=1}
