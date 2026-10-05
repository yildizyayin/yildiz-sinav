const BASE=(process.env.SMOKE_BASE_URL||'').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD;
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
if(!/^https:\/\/(?:demo\.anunex\.com|[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)$/i.test(BASE)||!PASSWORD)throw new Error('An isolated staging URL and demo password are required');
function assert(value,message,details){if(!value)throw new Error(`${message}${details===undefined?'':`\n${JSON.stringify(details,null,2)}`}`)}
async function request(path,{method='GET',cookie,json,expected=[200]}={}){const headers={};if(cookie)headers.Cookie=cookie;let body;if(json!==undefined){headers['content-type']='application/json';body=JSON.stringify(json)}const response=await fetch(`${BASE}${path}`,{method,headers,body,redirect:'manual'}),raw=await response.text();let payload;try{payload=raw?JSON.parse(raw):null}catch{payload={raw}}if(!expected.includes(response.status))throw new Error(`${method} ${path} expected ${expected.join('/')}, got ${response.status}\n${JSON.stringify(payload,null,2)}`);return{response,payload}}
async function login(){const {response,payload}=await request('/api/auth/login',{method:'POST',json:{identifier:'super@demo.test',password:PASSWORD,remember:false,turnstileToken:TOKEN}});assert(payload?.ok===true,'Super Admin login failed',payload);const cookie=(response.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(cookie,'Session cookie missing');return cookie}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const cookie=await login();
 const started=await request('/api/admin/capacity-benchmarks',{method:'POST',cookie,json:{profileKey:'NATIONAL',confirmation:'RUN_NATIONAL_1000000'},expected:[200,202,409]});
 if(started.response.status===409&&started.payload?.error?.code==='CAPACITY_TEST_ALREADY_RUNNING')throw new Error('Another capacity benchmark is already running');
 const runId=started.payload?.runId;assert(runId,'National capacity run id missing',started.payload);
 let run=null;
 for(let attempt=0;attempt<360;attempt++){
  if(attempt)await wait(5000);
  const status=await request('/api/admin/capacity-benchmarks',{cookie});assert(status.payload?.queueConfigured===true,'SCALE_QUEUE is not configured',status.payload);
  run=(status.payload?.runs||[]).find(x=>x.id===runId);assert(run,'National capacity run not found',status.payload);
  if(run.status==='FAILED')throw new Error(`National capacity benchmark failed: ${JSON.stringify(run)}`);
  const processed=Number(run.processed_count??run.processedCount??0),target=Number(run.student_target_count??run.studentTargetCount??1_000_000);
  console.log(`national capacity ${run.status}: ${processed}/${target}`);
  if(run.status==='COMPLETED')break;
 }
 assert(run?.status==='COMPLETED','National capacity benchmark timed out',run);
 assert(Number(run.student_target_count??run.studentTargetCount)===1_000_000,'National target is not 1,000,000 students',run);
 assert(Number(run.institution_target_count??run.institutionTargetCount)===15_000,'National institution target is not 15,000',run);
 assert(Number(run.processed_count??run.processedCount)===1_000_000,'National benchmark did not process 1,000,000 synthetic rows',run);
 assert(Number(run.failed_chunks||0)===0,'National benchmark has failed chunks',run);
 console.log(`PASS: NATIONAL synthetic Queue/D1 benchmark — 15,000 institutions / 1,000,000 students / run ${runId}`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
