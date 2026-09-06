const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';
const TOKEN='XXXX.DUMMY.TOKEN.XXXX';

function assert(value,message,details){
  if(!value)throw new Error(message+(details===undefined?'':'\n'+JSON.stringify(details,null,2)));
}

async function request(path,{method='GET',cookie,json,expected=200}={}){
  const headers={};
  if(cookie)headers.Cookie=cookie;
  let body;
  if(json!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(json);}
  const response=await fetch(BASE+path,{method,headers,body,redirect:'manual'});
  const text=await response.text();
  let payload;
  try{payload=text?JSON.parse(text):null;}catch{payload={raw:text};}
  if(response.status!==expected)throw new Error(method+' '+path+' expected '+expected+', got '+response.status+'\n'+JSON.stringify(payload,null,2));
  return{response,payload};
}

async function login(identifier){
  const result=await request('/api/auth/login',{
    method:'POST',
    json:{identifier,password:PASSWORD,remember:false,turnstileToken:TOKEN},
  });
  assert(result.payload?.ok===true,identifier+' login failed',result.payload);
  const cookie=(result.response.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];
  assert(cookie,'Super Admin session cookie missing');
  return cookie;
}

try{
  const cookie=await login('super');
  const result=await request('/api/nibiru/ai/probe',{method:'POST',cookie});
  const probe=result.payload?.probe;
  assert(result.payload?.environment==='staging','AI probe must run against staging',result.payload);
  assert(result.payload?.bindingReady===true,'Cloudflare AI binding is missing',result.payload);
  assert(result.payload?.freeMode===true&&result.payload?.paidPlanRequired===false,'Free-mode guard is not active',result.payload);
  assert(probe?.ok===true,'At least one Nibiru provider failed the live probe',probe);
  const expected=['FAST','META','NVIDIA'];
  for(const family of expected){
    const item=(probe.results||[]).find(x=>x.family===family);
    assert(item?.ok===true,'Provider probe failed for '+family,item);
    console.log('✓ '+family+' provider response · '+item.model+' · '+item.transport+(item.gatewayFallback?' · direct fallback':''));
  }
  const inference=await request('/api/nibiru/chat',{
    method:'POST',
    cookie,
    json:{message:'Akademik gelişim verilerini süreç odaklı ve kısa biçimde açıkla.'},
  });
  const orchestration=inference.payload?.orchestration;
  assert(inference.payload?.ok===true&&inference.payload?.outcome==='ANSWERED','Nibiru inference did not answer',inference.payload);
  assert(orchestration?.gatewayConfigured===true,'Nibiru inference did not report Gateway configuration',inference.payload);
  assert(Boolean(orchestration?.selectedFamily),'Nibiru inference did not select a model family',inference.payload);
  assert((orchestration?.attempts||[]).some(item=>item.ok===true),'Nibiru inference had no successful model attempt',inference.payload);
  console.log('✓ Nibiru real inference · '+orchestration.selectedFamily+' · '+(orchestration.attempts||[]).map(item=>item.family+':'+(item.ok?'ok':'failed')).join(', '));

  console.log('\nNibiru free multi-AI activation probe passed.');
}catch(error){
  console.error('\nNIBIRU AI PROVIDER PROBE FAILED');
  console.error(error instanceof Error?error.stack||error.message:error);
  process.exitCode=1;
}
