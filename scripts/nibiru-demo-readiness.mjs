// Read-only demo settings; never send a WhatsApp message or run inference.
import {mkdirSync,writeFileSync} from 'node:fs';
const base='https://demo.anunex.com';
let cookie='';
async function request(path,body){
 const response=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',
  headers:{'content-type':'application/json',...(cookie?{cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 let data;try{data=await response.json()}catch{data=null;}
 return{response,data};
}
const result={time:new Date().toISOString(),environment:null,whatsapp:null,voice:null,logout:null,error:null};
try{
 const config=await request('/api/config');
 if(config.response.status!==200||config.data?.environment!=='staging')throw new Error('DEMO_STAGING_NOT_VERIFIED');
 result.environment='staging';
 const login=await request('/api/auth/login',{identifier:'manager',password:'Demo123!',remember:false,turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'});
 if(login.response.status!==200||!login.data?.ok)throw new Error(`DEMO_LOGIN_HTTP_${login.response.status}`);
 cookie=(login.response.headers.get('set-cookie')||'').match(/yildiz_session=[^;]+/)?.[0]||'';
 if(!cookie)throw new Error('DEMO_SESSION_MISSING');
 const settings=await request('/api/nibiru/settings');
 if(settings.response.status!==200)throw new Error(`SETTINGS_HTTP_${settings.response.status}`);
 const p=settings.data?.provider||{};
 result.whatsapp={enabled:Boolean(settings.data?.settings?.whatsapp_enabled),ready:Boolean(p.ready),verifyToken:Boolean(p.verifyToken),appSecret:Boolean(p.appSecret),accessToken:Boolean(p.accessToken),phoneNumberId:Boolean(p.phoneNumberId),outboundSent:false};
 const voice=await request('/api/nibiru/voice/status');
 result.voice={httpStatus:voice.response.status,activation:voice.data?.activation||null,sttConfigured:Boolean(voice.data?.providers?.stt?.configured)};
}catch(error){result.error=error instanceof Error?error.message:'READINESS_FAILED';process.exitCode=1;}
finally{
 if(cookie){const logout=await request('/api/auth/logout',{}).catch(()=>null);result.logout=logout?.response.status||null;cookie='';}
 mkdirSync('tmp/nibiru-acceptance',{recursive:true});
 writeFileSync('tmp/nibiru-acceptance/demo-readiness.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}
