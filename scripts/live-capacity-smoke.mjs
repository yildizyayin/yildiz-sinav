import { appendFileSync } from 'node:fs';

const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';

function assert(value,message,details){if(!value)throw new Error(`${message}${details===undefined?'':`\n${JSON.stringify(details,null,2)}`}`)}
async function request(path,{method='GET',cookie,json,expected=[200]}={}){
 const headers={};if(cookie)headers.Cookie=cookie;let body;
 if(json!==undefined){headers['content-type']='application/json';body=JSON.stringify(json)}
 const response=await fetch(`${BASE}${path}`,{method,headers,body,redirect:'manual'}),raw=await response.text();let payload;
 try{payload=raw?JSON.parse(raw):null}catch{payload={raw}}
 if(!expected.includes(response.status))throw new Error(`${method} ${path} expected ${expected.join('/')}, got ${response.status}\n${JSON.stringify(payload,null,2)}`);
 return {response,payload};
}
async function login(){
 const {response,payload}=await request('/api/auth/login',{method:'POST',json:{identifier:'super@demo.test',password:PASSWORD,remember:false,turnstileToken:TOKEN}});
 assert(payload?.ok===true,'Super Admin login failed',payload);
 const cookie=(response.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(cookie,'Session cookie missing');return cookie;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
 const cookie=await login();
 const started=await request('/api/admin/capacity-tests',{method:'POST',cookie,json:{confirmation:'RUN_100K_STAGING'},expected:[200,202]});
 const runId=started.payload?.runId;assert(runId,'Capacity run id missing',started.payload);
 let run=started.payload?.reused?started.payload:null;
 for(let attempt=0;!run||run.status!=='COMPLETED';attempt++){
  if(attempt>=180)throw new Error(`100K capacity run timed out: ${JSON.stringify(run)}`);
  if(attempt)await wait(5000);
  const status=await request('/api/admin/capacity-tests',{cookie});
  assert(status.payload?.queueConfigured===true,'SCALE_QUEUE is not configured',status.payload);
  run=(status.payload?.runs||[]).find(x=>x.id===runId);assert(run,'Capacity run not found',status.payload);
  if(run.status==='FAILED')throw new Error(`100K capacity run failed: ${JSON.stringify(run)}`);
  console.log(`capacity ${run.status}: ${run.processed_count||run.processedCount||0}/100000 rows, ${run.completed_chunks||run.completedChunks||0}/${run.total_chunks||run.totalChunks||1000} chunks`);
 }
 const processed=Number(run.processed_count??run.processedCount),failed=Number(run.failed_chunks||0),chunks=Number(run.completed_chunks??run.completedChunks);
 assert(Number(run.target_count??run.targetCount)===100000&&processed===100000&&chunks===1000&&failed===0,'100K capacity acceptance failed',run);
 const detail=`${processed.toLocaleString('tr-TR')} izole sentetik kayıt · ${chunks} Queue parçası · 0 başarısız parça${started.payload.reused?' · son 30 günlük kanıt yeniden kullanıldı':''}`;
 appendFileSync('LIVE_SMOKE_REPORT.md',`\n## 100K Queue kapasite kabulü\n\n- ✅ **Başarılı** — ${detail}\n- Run: \`${runId}\`\n`);
 console.log(`✓ Live 100K Queue capacity — ${detail}`);
}

main().catch(error=>{console.error(error);process.exitCode=1});
