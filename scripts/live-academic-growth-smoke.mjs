import { appendFileSync, existsSync, writeFileSync } from 'node:fs';

const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
const REPORT='LIVE_SMOKE_REPORT.md';
const checks=[];

function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,details=''){checks.push({name,details});console.log(`✓ ${name}${details?` — ${details}`:''}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}
function persist(ok,error){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n');let text=`\n## Nibiru academic growth / communication checks\n\n${checks.map(x=>`- ✅ **${x.name}**${x.details?` — ${x.details}`:''}`).join('\n')}`;if(!ok)text+=`${checks.length?'\n':''}- ❌ **Academic growth smoke failure**\n\n\`\`\`text\n${String(error instanceof Error?error.stack||error.message:error).slice(0,8000)}\n\`\`\``;appendFileSync(REPORT,`${text}\n`)}

try{
 const manager=await login('manager');
 const sources=await req('/api/academic-targets/sources',{cookie:manager});
 const kinds=new Set((sources.p?.sources||[]).map(x=>x.source_kind));
 for(const kind of ['MEB_ROTA_MAARIF','MEB_EOKUL','OSYM','YOK_ATLAS'])assert(kinds.has(kind),`Official target source missing: ${kind}`,sources.p);
 passed('Official academic target source registry','MEB Rota Maarif + e-Okul + ÖSYM + YÖK Atlas');

 const lgsSearch=await req('/api/academic-targets/search?type=LGS_SCHOOL&year=2026&q=Kartal',{cookie:manager});
 const yksSearch=await req('/api/academic-targets/search?type=YKS_PROGRAM&year=2026&q=Bilgisayar',{cookie:manager});
 assert(Array.isArray(lgsSearch.p?.targets)&&Array.isArray(yksSearch.p?.targets),'Target search API invalid',{lgs:lgsSearch.p,yks:yksSearch.p});
 passed('Official target search boundaries',`LGS ${lgsSearch.p.targets.length} · YKS ${yksSearch.p.targets.length} verified rows currently loaded`);

 const announcements=await req('/api/announcements',{cookie:manager});
 assert(Array.isArray(announcements.p?.announcements),'Manager announcement center API invalid',announcements.p);
 passed('Institution announcement center','panel + WhatsApp-template + SMS-fallback ledger ready');

 const calendar=await req('/api/worksheet-calendar',{cookie:manager});
 assert(Array.isArray(calendar.p?.entries),'Worksheet calendar API invalid',calendar.p);
 const worksheetNibiru=await req('/api/nibiru/chat',{method:'POST',cookie:manager,json:{message:'Bu hafta hangi föyü uygulamalıyız?'}});
 assert(worksheetNibiru.p?.intent==='WORKSHEET_CALENDAR','Nibiru worksheet calendar intent not active',worksheetNibiru.p);
 assert(String(worksheetNibiru.p?.answer||'').startsWith('🤖 Nibiru:'),'Nibiru worksheet answer lacks AI disclosure',worksheetNibiru.p);
 passed('Worksheet calendar + Nibiru guidance',`${calendar.p.entries.length} published calendar rows visible`);

 const teacher=await login('math');
 const teacherAnnouncements=await req('/api/announcements',{cookie:teacher});
 assert(Array.isArray(teacherAnnouncements.p?.announcements),'Teacher announcement scope failed',teacherAnnouncements.p);
 const teacherCalendar=await req('/api/worksheet-calendar',{cookie:teacher});
 assert(Array.isArray(teacherCalendar.p?.entries),'Teacher worksheet calendar scope failed',teacherCalendar.p);
 passed('Teacher communication + worksheet scope','role-scoped endpoints available');

 const student=await login('student1');
 const myTarget=await req('/api/academic-targets/me',{cookie:student});
 assert(typeof myTarget.p?.gradeLevel==='number','Student grade target eligibility context missing',myTarget.p);
 const studentAnalysis=await req('/api/academic-targets/analysis',{cookie:student});
 assert('target' in (studentAnalysis.p||{}),'Student target analysis contract missing',studentAnalysis.p);
 passed('Student target eligibility + analysis boundary',`grade ${myTarget.p.gradeLevel} · target ${myTarget.p.target?'set':'not set'}`);

 const superCookie=await login('super');
 const sourceAdmin=await req('/api/academic-targets/sources',{cookie:superCookie});
 assert((sourceAdmin.p?.sources||[]).every(x=>x.base_url&&x.official===1),'Official source metadata incomplete',sourceAdmin.p);
 passed('Super Admin official-source governance','source URL + official flag enforced');

 const official=await req('/api/official-question-intelligence/status',{cookie:superCookie});
 const officialKeys=new Set((official.p?.sources||[]).map(x=>x.source_key));
 for(const key of ['MEB_LGS_ARCHIVE','OSYM_YKS_GROUP','MEB_OGM_MATERIAL','EBA_RESOURCE'])assert(officialKeys.has(key),`Official question source missing: ${key}`,official.p);
 assert(official.p?.policy?.copyrightedQuestionTextStored===false,'Copyright-safe question policy is not enforced',official.p);
 assert(official.p?.policy?.officialMetadataOnly===true,'Official metadata-only policy missing',official.p);
 assert(official.p?.policy?.difficulty?.EASY==='BLUE'&&official.p?.policy?.difficulty?.MEDIUM==='GREEN'&&official.p?.policy?.difficulty?.HARD==='RED','Difficulty color policy mismatch',official.p);
 passed('Official question intelligence registry','MEB LGS + ÖSYM YKS + EBA/OGM references · protected text not copied');

 const managerOfficial=await req('/api/official-question-intelligence/status',{cookie:manager,expected:403});
 assert(managerOfficial.p?.error?.code==='FORBIDDEN','Official question admin scope not protected',managerOfficial.p);
 passed('Official question intelligence authorization','Super Admin only status/source governance');

 const insight=await req('/api/official-question-intelligence/outcomes?examFamily=LGS&gradeLevel=8',{cookie:superCookie});
 assert(Array.isArray(insight.p?.items),'Outcome intelligence search contract invalid',insight.p);
 assert(insight.p?.predictionPolicy==='HISTORICAL_PRIORITY_NOT_GUARANTEE','Historical priority policy missing',insight.p);
 passed('Official outcome-history contract',`${insight.p.items.length} outcome rows · historical priority is explicitly not a prediction guarantee`);

 persist(true);
 console.log(`\n${checks.length} academic growth live smoke checks passed.`);
}catch(error){persist(false,error);console.error(error);process.exitCode=1}
