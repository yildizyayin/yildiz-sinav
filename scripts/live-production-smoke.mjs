const BASE_URL=(process.env.PROD_BASE_URL||'https://app.anunex.com').replace(/\/$/,'');
const timeoutMs=Number(process.env.PROD_SMOKE_TIMEOUT_MS||20_000);
const attempts=Number(process.env.PROD_SMOKE_ATTEMPTS||6);

function assert(condition,message,details){if(!condition)throw new Error(`${message}${details===undefined?'':` — ${JSON.stringify(details)}`}`)}

async function request(path,{expected=200,accept='application/json'}={}){
 let lastError;
 for(let attempt=1;attempt<=attempts;attempt++){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(`${BASE_URL}${path}`,{headers:{Accept:accept,'User-Agent':'anunex-production-smoke/1.0'},signal:controller.signal,redirect:'error'});
   const contentType=response.headers.get('content-type')||'';const body=contentType.includes('application/json')?await response.json():await response.text();
   assert(response.status===expected,`${path} HTTP ${expected} dönmedi`,{status:response.status});
   return {response,body};
  }catch(error){lastError=error;if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,10_000))}
  finally{clearTimeout(timer)}
 }
 throw lastError;
}

async function main(){
 const health=await request('/api/health');
 assert(health.body?.ok===true,'D1 sağlık kontrolü hazır değil',health.body);
 assert(health.body?.environment==='production','Health production ortamını doğrulamadı',health.body?.environment);
 assert(Boolean(health.response.headers.get('x-request-id')),'Health yanıtında X-Request-Id yok');

 const config=await request('/api/config');
 assert(config.body?.environment==='production','Public config production değil',config.body?.environment);
 assert(String(config.body?.productName||'').includes('Anunex'),'Public config ürün adını doğrulamadı');
 assert(Boolean(config.body?.turnstileSiteKey),'Production Turnstile site key boş');

 const protectedRoute=await request('/api/dashboard',{expected:401});
 assert(protectedRoute.body?.error?.code==='UNAUTHENTICATED','Korunan API anonim isteği reddetmedi',protectedRoute.body);
 assert(Boolean(protectedRoute.response.headers.get('x-request-id')),'401 yanıtında X-Request-Id yok');

 const shell=await request('/',{accept:'text/html'});
 assert((shell.response.headers.get('content-type')||'').includes('text/html'),'SPA kabuğu HTML dönmedi');

 console.log(JSON.stringify({ok:true,target:new URL(BASE_URL).origin,checks:4,mutations:0}));
}

main().catch(error=>{console.error(`Production smoke failed: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1});
