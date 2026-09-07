const BASE_URL=(process.env.RESULT_BASE_URL||'').replace(/\/$/,'');
const timeoutMs=Number(process.env.RESULT_SMOKE_TIMEOUT_MS||20_000);
const attempts=Number(process.env.RESULT_SMOKE_ATTEMPTS||5);

function assert(condition,message,details){
  if(!condition)throw new Error(`${message}${details===undefined?'':` — ${JSON.stringify(details)}`}`);
}

async function request(path,{expected=200,accept='application/json'}={}){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${BASE_URL}${path}`,{
        headers:{Accept:accept,'User-Agent':'anunex-result-production-smoke/1.0'},
        signal:controller.signal,
        redirect:'error',
      });
      const contentType=response.headers.get('content-type')||'';
      const body=contentType.includes('application/json')?await response.json():await response.text();
      assert(response.status===expected,`${path} HTTP ${expected} dönmedi`,{status:response.status,body});
      return {response,body};
    }catch(error){
      lastError=error;
      if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,5_000));
    }finally{clearTimeout(timer)}
  }
  throw lastError;
}

async function main(){
  assert(BASE_URL.startsWith('https://'),'RESULT_BASE_URL güvenli bir HTTPS adresi olmalıdır.');

  const health=await request('/api/health');
  assert(health.body?.ok===true,'Sonuç Ağı D1 sağlık kontrolü hazır değil',health.body);
  assert(health.body?.environment==='production','Sonuç Ağı production ortamını doğrulamadı',health.body);

  const config=await request('/api/public/results/config');
  assert(config.body?.portal==='ANUNEX_RESULT_NETWORK','Sonuç Ağı public config kimliği yanlış',config.body);
  assert(Boolean(config.body?.turnstileSiteKey),'Sonuç Ağı Turnstile site key boş');
  assert(Array.isArray(config.body?.roles)&&config.body.roles.map(x=>x.key).join(',')==='STUDENT,INSTITUTION,DEALER','Sonuç rolleri eksik',config.body?.roles);
  assert(config.body?.security?.tcknStored===false,'TCKN saklama politikası güvenli değil',config.body?.security);

  const protectedRoute=await request('/api/admin/result-network/governance',{expected:401});
  assert(protectedRoute.body?.error?.code==='UNAUTHENTICATED','Sonuç yönetimi anonim isteği reddetmedi',protectedRoute.body);

  const isolatedRoute=await request('/api/dashboard',{expected:404});
  assert(isolatedRoute.body?.error?.code==='RESULT_NETWORK_ROUTE_NOT_AVAILABLE','Lisanslı uygulama API yüzeyi Sonuç Ağına sızıyor',isolatedRoute.body);

  const shell=await request('/',{accept:'text/html'});
  assert((shell.response.headers.get('content-type')||'').includes('text/html'),'Sonuç Ağı SPA kabuğu HTML dönmedi');

  console.log(JSON.stringify({ok:true,target:new URL(BASE_URL).origin,checks:5,mutations:0}));
}

main().catch(error=>{
  console.error(`Result Network smoke failed: ${error instanceof Error?error.message:String(error)}`);
  process.exitCode=1;
});
