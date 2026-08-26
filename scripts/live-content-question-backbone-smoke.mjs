const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';const FIXTURE=`LIVE_RIGHTS_POLICY_FIXTURE_${Date.now()}`;
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}

const admin=await login('super');
const status=await req('/api/question-backbone/status',{cookie:admin});
assert(status.p?.policy?.officialExamContent==='METADATA_ONLY','Official exam content policy is not metadata-only',status.p);
assert(status.p?.policy?.licensedAndPublicDomainRequireVerifiedProvenance===true,'Rights provenance gate is not active',status.p);
assert(status.p?.policy?.userProvidedAutomaticallyPrintable===false,'USER_PROVIDED became automatically printable',status.p);
console.log('✓ Question backbone policy — metadata-only official exams · verified rights for external printable content');

const textBlocked=await req('/api/official-question-intelligence/mappings/import',{method:'POST',cookie:admin,expected:400,json:{sourceKey:'OSYM_YKS_GROUP',rows:[{year:2026,examFamily:'YKS',sessionCode:'TYT',questionNo:1,outcomeCode:'NOT_USED_BECAUSE_POLICY_RUNS_FIRST',questionText:'DO NOT STORE THIS TEST PAYLOAD',options:['A','B']}]}});
assert(textBlocked.p?.error?.code==='OFFICIAL_QUESTION_MAPPING_POLICY_FAILED','Official mapping accepted full question payload',textBlocked.p);
assert(textBlocked.p?.error?.details?.some?.(x=>x.code==='OFFICIAL_QUESTION_METADATA_ONLY'),'Metadata-only rejection detail missing',textBlocked.p);
console.log('✓ Official question copyright boundary — stem/options rejected before mapping write');

const spoofBlocked=await req('/api/official-question-intelligence/mappings/import',{method:'POST',cookie:admin,expected:400,json:{sourceKey:'OSYM_YKS_GROUP',rows:[{year:2026,examFamily:'YKS',sessionCode:'TYT',questionNo:1,outcomeCode:'NOT_USED_BECAUSE_POLICY_RUNS_FIRST',sourceUrl:'https://www.osym.gov.tr.evil.example/fake'}]}});
assert(spoofBlocked.p?.error?.code==='OFFICIAL_QUESTION_MAPPING_POLICY_FAILED','Spoofed official question source URL was accepted',spoofBlocked.p);
console.log('✓ Official question source boundary — lookalike domain rejected before archive write');

const questions=await req('/api/platform/questions',{cookie:admin});let q=(questions.p?.questions||[]).find(x=>x.source_label===FIXTURE);
if(!q){const created=await req('/api/platform/questions',{method:'POST',cookie:admin,expected:201,json:{stemText:'Staging hak doğrulama motoru için sentetik soru.',gradeLevel:99,difficulty:3,correctAnswer:'A',options:['A','B','C','D'],sourceLabel:FIXTURE,copyrightStatus:'LICENSED',originKind:'MANUAL'}});assert(created.p?.id,'Synthetic rights fixture creation failed',created.p);q={id:created.p.id};}
const qid=q.id;const provenance=await req(`/api/question-provenance/${encodeURIComponent(qid)}`,{cookie:admin});
assert(provenance.p?.question?.reviewStatus==='REVIEW','Licensed question was auto-approved before rights verification',provenance.p);
const blockedApproval=await req(`/api/question-bank-standard/${encodeURIComponent(qid)}/review`,{method:'PATCH',cookie:admin,expected:400,json:{status:'APPROVED'}});
assert(blockedApproval.p?.error?.code==='QUESTION_RIGHTS_EVIDENCE_REQUIRED','Licensed question approval bypassed verified provenance',blockedApproval.p);
console.log('✓ Printable rights gate — LICENSED content remains REVIEW until verified evidence exists');

let proof=(provenance.p?.records||[]).find(x=>x.rights_basis==='WRITTEN_LICENSE'&&x.verification_status==='DECLARED');
if(!proof){const declared=await req(`/api/question-provenance/${encodeURIComponent(qid)}`,{method:'POST',cookie:admin,expected:201,json:{rightsBasis:'WRITTEN_LICENSE',licenseReference:'STAGING-POLICY-TEST-ONLY',evidenceNote:'Sentetik staging güvenlik testi; gerçek yayın/lisans içeriği değildir.'}});proof={id:declared.p.id};}
const verified=await req(`/api/question-provenance/records/${encodeURIComponent(proof.id)}`,{method:'PATCH',cookie:admin,json:{status:'VERIFIED',note:'Staging politika zinciri doğrulama testi.'}});assert(verified.p?.status==='VERIFIED','Rights evidence verification failed',verified.p);
const approved=await req(`/api/question-bank-standard/${encodeURIComponent(qid)}/review`,{method:'PATCH',cookie:admin,json:{status:'APPROVED'}});assert(approved.p?.status==='APPROVED','Verified licensed question could not be approved',approved.p);
console.log('✓ Provenance review chain — declare → Super Admin verify → printable approval');

const patchBypass=await req(`/api/question-bank-standard/${encodeURIComponent(qid)}`,{method:'PATCH',cookie:admin,expected:400,json:{copyrightStatus:'PUBLIC_DOMAIN',sourceLabel:FIXTURE,originKind:'MANUAL',keepApproved:true}});
assert(patchBypass.p?.error?.code==='QUESTION_RIGHTS_EVIDENCE_REQUIRED','Copyright-status edit bypassed provenance while preserving APPROVED',patchBypass.p);
console.log('✓ Rights edit guard — changing APPROVED content to a new external rights basis cannot bypass provenance');

await req(`/api/question-bank-standard/${encodeURIComponent(qid)}`,{method:'PATCH',cookie:admin,json:{copyrightStatus:'RESTRICTED',sourceLabel:FIXTURE,originKind:'MANUAL'}});
const cleanup=await req(`/api/question-provenance/${encodeURIComponent(qid)}`,{cookie:admin});assert(cleanup.p?.question?.copyrightStatus==='RESTRICTED'&&cleanup.p?.question?.reviewStatus==='REVIEW','Synthetic fixture cleanup failed',cleanup.p);
console.log('✓ Staging fixture cleanup — returned to RESTRICTED / REVIEW, not printable');

const finalStatus=await req('/api/question-backbone/status',{cookie:admin});assert(typeof finalStatus.p?.summary?.official_archives==='number'&&typeof finalStatus.p?.summary?.verified_official_mappings==='number','Question backbone status counters missing',finalStatus.p);
console.log(`✓ Question backbone status — archives ${finalStatus.p.summary.official_archives} · mappings ${finalStatus.p.summary.verified_official_mappings} · rights review ${finalStatus.p.summary.rights_review_required}`);
console.log('\n8 content/question backbone live checks passed.');
