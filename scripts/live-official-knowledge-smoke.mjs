const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
async function req(path,{method='GET',cookie,json,expected=200}={}){const h={};if(cookie)h.Cookie=cookie;let body;if(json!==undefined){h['Content-Type']='application/json';body=JSON.stringify(json)}const r=await fetch(`${BASE}${path}`,{method,headers:h,body,redirect:'manual'});const text=await r.text();let p;try{p=text?JSON.parse(text):null}catch{p={raw:text}}if(r.status!==expected)throw new Error(`${method} ${path} expected ${expected}, got ${r.status}\n${JSON.stringify(p,null,2)}`);return{r,p}}
async function login(identifier){const{r,p}=await req('/api/auth/login',{method:'POST',json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(p?.ok===true,`${identifier} login failed`,p);const c=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(c,'session cookie missing');return c}

const admin=await login('super');
const sources=await req('/api/official-knowledge/sources',{cookie:admin});
for(const kind of ['MEB_TYMM','MEB_MUFREDAT','TTKB','OSYM','YOK_ATLAS'])assert(sources.p?.sources?.some(x=>x.kind===kind),`Official source missing: ${kind}`,sources.p);
console.log('✓ Official education source catalog — MEB/TTKB/TYMM · ÖSYM · YÖK Atlas');

const valid=await req('/api/official-knowledge/validate',{method:'POST',cookie:admin,json:{sourceKind:'MEB_TYMM',authority:'MEB',sourceUrl:'https://tymm.meb.gov.tr/ogretim-programlari/',sourceVerifiedAt:new Date().toISOString()}});
assert(valid.p?.verdict?.valid===true&&valid.p?.verdict?.sourceKind==='MEB_TYMM','Valid TYMM source was not accepted',valid.p);
const spoof=await req('/api/official-knowledge/validate',{method:'POST',cookie:admin,json:{sourceKind:'YOK_ATLAS',authority:'YÖK',sourceUrl:'https://yokatlas.yok.gov.tr.evil.example/program',sourceVerifiedAt:new Date().toISOString()}});
assert(spoof.p?.verdict?.valid===false,'Lookalike YOK Atlas domain was accepted',spoof.p);
console.log('✓ Official domain policy — valid source accepted · lookalike rejected');

const rejectedTarget=await req('/api/academic-targets/import',{method:'POST',cookie:admin,expected:400,json:{sourceKind:'YOK_ATLAS',year:2026,rows:[{programCode:'REJECT_ONLY',universityName:'Reject Test',programName:'Reject Test',scoreType:'SAY',sourceUrl:'https://yokatlas.yok.gov.tr.evil.example/program',sourceVerifiedAt:new Date().toISOString()}]}});
assert(rejectedTarget.p?.error?.code==='OFFICIAL_TARGET_BATCH_INVALID','Spoofed official target batch was not blocked before import',rejectedTarget.p);
console.log('✓ Target import boundary — spoofed official target batch blocked before write');

const fd=new FormData();fd.append('file',new File(['subject_code,grade_level,outcome_code,title\nMAT,7,REJECT.1,Reject only'], 'reject.csv',{type:'text/csv'}));fd.append('academicYear','2026-2027');fd.append('programCode','SCHOOL');fd.append('gradeLevel','7');fd.append('programVersion','REJECT-SPOOF-ONLY');fd.append('authority','TTKB');fd.append('sourceUrl','https://mufredat.meb.gov.tr.evil.example/Programlar.aspx');fd.append('sourceTitle','Reject spoof source');
const cr=await fetch(`${BASE}/api/curriculum-admin/import-preview`,{method:'POST',headers:{Cookie:admin},body:fd,redirect:'manual'});const ct=await cr.text();let cp;try{cp=JSON.parse(ct)}catch{cp={raw:ct}}assert(cr.status===400,'Spoofed curriculum source was not rejected',cp);assert(['OFFICIAL_SOURCE_NOT_ALLOWED','OFFICIAL_SOURCE_DOMAIN_MISMATCH'].includes(cp?.error?.code),'Unexpected curriculum source rejection code',cp);
console.log('✓ Curriculum import boundary — spoofed TTKB/MEB domain blocked before R2/DB import');

const status=await req('/api/official-knowledge/status',{cookie:admin});
assert(Array.isArray(status.p?.sources)&&status.p.sources.length>=7,'Official knowledge status source registry missing',status.p);assert(typeof status.p?.summary?.verifiedCurriculumVersions==='number'&&typeof status.p?.summary?.activeOfficialTargets==='number','Official knowledge summary missing',status.p);
console.log(`✓ Official knowledge status — curriculum ${status.p.summary.verifiedCurriculumVersions} · targets ${status.p.summary.activeOfficialTargets} · provenance ${status.p.summary.provenanceEvents}`);
console.log('\n5 official education knowledge live checks passed.');
