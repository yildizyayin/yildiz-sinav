import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';const REPORT='LIVE_SMOKE_REPORT.md';const checks=[];
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function passed(name,detail=''){checks.push({name,detail});console.log(`✓ ${name}${detail?` — ${detail}`:''}`)}
async function login(identifier){const r=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}),redirect:'manual'});const p=await r.json();assert(r.ok&&p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c;}
async function jsonReq(path,{method='GET',cookie,body}={}){const r=await fetch(`${BASE}${path}`,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}assert(r.ok,`${method} ${path} failed with ${r.status}`,p);return p;}
function persist(ok,error){if(!existsSync(REPORT))writeFileSync(REPORT,'# Live Staging Smoke Report\n');let text=`\n## Standard final closure\n\n${checks.map(x=>`- ✅ **${x.name}**${x.detail?` — ${x.detail}`:''}`).join('\n')}`;if(!ok)text+=`${checks.length?'\n':''}- ❌ **Standard final closure failure**\n\n\`\`\`text\n${String(error instanceof Error?error.stack||error.message:error).slice(0,8000)}\n\`\`\``;appendFileSync(REPORT,`${text}\n`)}

try{
 const admin=await login('super');
 const readiness=await jsonReq('/api/standard-readiness',{cookie:admin});
 assert(readiness?.acceptance?.standardPackageReady===true,'Standard package is not final-ready',readiness);
 assert(readiness?.acceptance?.saleReady===true,'Standard saleReady must represent the Standard package itself',readiness.acceptance);
 assert(Number(readiness?.acceptance?.packageConfigRequired||0)===0,'Required Standard provider/config setup remains',readiness.acceptance);
 assert((readiness.operational||[]).filter(x=>x.blocking&&x.state!=='READY').length===0,'Blocking operational Standard item remains',readiness.operational);
 passed('Standard package final readiness',`sale ready · optional channels ${readiness.acceptance.optionalChannelSetup}`);

 const student=await login('student1');
 const prefs=await jsonReq('/api/student-standard/preferences',{method:'PATCH',cookie:student,body:{appearance:'DARK',font_scale:1.05,density:'COMFORTABLE',countdown_target_date:'2027-06-01',countdown_label:'Standard Kabul Sınavı'}});
 assert(prefs?.preferences?.appearance==='DARK','Student personalization did not persist',prefs);
 const home=await jsonReq('/api/student-standard/home-context',{cookie:student});
 assert(home?.preferences?.appearance==='DARK','Personalized home context did not reuse preferences',home);
 assert(home?.countdown?.targetDate==='2027-06-01'&&home?.countdown?.label==='Standard Kabul Sınavı','Countdown target did not persist into home context',home);
 assert(Number.isFinite(Number(home?.countdown?.days))&&home?.countdown?.flipClock===true,'Countdown live day/flip context missing',home.countdown);
 passed('Student personalization + countdown','preferences persisted · live countdown + flip clock context');

 const [results,outcomes]=await Promise.all([jsonReq('/api/my-results',{cookie:student}),jsonReq('/api/my-outcomes',{cookie:student})]);
 assert(Array.isArray(results?.exams)&&results.exams.length>0,'Student result history is empty',results);
 assert(Array.isArray(outcomes?.outcomes)&&outcomes.outcomes.length>0,'Student outcome analysis is empty',outcomes);
 assert(outcomes.outcomes.some(x=>['DEVELOPING','STRONG','INSUFFICIENT_EVIDENCE'].includes(x.mastery_status)),'Outcome mastery classification missing',outcomes);
 passed('Basic results + outcome analysis',`${results.exams.length} exams · ${outcomes.outcomes.length} outcome rows`);

 const catalog=await jsonReq('/api/worksheets',{cookie:student});
 assert(Array.isArray(catalog?.worksheets)&&catalog.worksheets.length>0,'Student has no consumable published worksheets',catalog);
 assert(catalog.worksheets.every(x=>String(x.program_code||'SCHOOL')!=='SCHOOL'||Number(x.grade_level)===7),'Student can see another grade worksheet',catalog.worksheets.map(x=>({id:x.id,grade:x.grade_level,program:x.program_code})));
 const worksheet=catalog.worksheets.find(x=>x.pdf_asset_id&&x.answer_key_asset_id);assert(worksheet,'No worksheet has PDF + answer key assets',catalog.worksheets);
 for(const [kind,assetId] of [['PDF',worksheet.pdf_asset_id],['ANSWER_KEY',worksheet.answer_key_asset_id]]){const r=await fetch(`${BASE}/api/worksheets/${encodeURIComponent(worksheet.id)}/assets/${encodeURIComponent(assetId)}`,{headers:{cookie:student}});const bytes=new Uint8Array(await r.arrayBuffer());assert(r.ok,`${kind} asset download failed`,{status:r.status});assert((r.headers.get('content-type')||'').includes('application/pdf'),`${kind} is not served as PDF`,r.headers.get('content-type'));assert(bytes.length>100&&new TextDecoder('ascii').decode(bytes.slice(0,5))==='%PDF-',`${kind} PDF bytes are invalid`,{bytes:bytes.length});}
 const detail=await jsonReq(`/api/worksheets/${encodeURIComponent(worksheet.id)}`,{cookie:student});
 assert(Array.isArray(detail?.questionLinks)&&detail.questionLinks.length>=Number(worksheet.total_questions||1),'Worksheet question support is incomplete',detail);
 assert(detail.questionLinks.every(x=>x.solution_url&&x.topic_url),'Worksheet has a question without solution/topic support',detail.questionLinks.find(x=>!x.solution_url||!x.topic_url));
 passed('Role-safe consumable worksheet',`${worksheet.title} · PDF + answer key + ${detail.questionLinks.length} question supports`);

 const support=await jsonReq('/api/student-standard/question-support?examQuestionId=q_std_hist_mat_1',{cookie:student});
 assert(support?.options?.solutionVideo?.url,'Registered solution video missing',support);
 assert(support?.options?.topicVideo?.url,'Registered topic micro-learning video missing',support);
 assert(/^https:\/\//.test(support.options.solutionVideo.url)&&/^https:\/\//.test(support.options.topicVideo.url),'Video URLs are not HTTPS',support.options);
 passed('Real registered micro-learning route','solution + topic video available without YouTube API auto-discovery');

 persist(true);console.log(`\n${checks.length} Standard final closure checks passed.`);
}catch(error){persist(false,error);console.error(error);process.exitCode=1}
