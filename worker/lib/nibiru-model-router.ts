import type { AuthUser, Env } from '../types';
import type { NibiruIntent } from './nibiru';
import type { NibiruSpecialistRoute } from './nibiru-specialists';

export type NibiruWorkload =
  | 'FAST_FACT'
  | 'COACHING'
  | 'GUIDANCE'
  | 'SUBJECT_REASONING'
  | 'SUBJECT_EXPLANATION'
  | 'PARENT_EXPLANATION'
  | 'INSTITUTION_ANALYSIS'
  | 'CORE';

export type NibiruModelFamily = 'FAST' | 'META' | 'NVIDIA' | 'CUSTOM';

export type NibiruModelCandidate = {
  family: NibiruModelFamily;
  model: string;
  purpose: string;
};

export type NibiruModelDecision = {
  workload: NibiruWorkload;
  specialist: NibiruSpecialistRoute['specialist'];
  specialistLabel: string;
  gatewayId: string;
  candidates: NibiruModelCandidate[];
  maxTokens: number;
  temperature: number;
  skipCache: boolean;
  reason: string;
};

export type NibiruInferenceAttempt = {
  model: string;
  family: NibiruModelFamily;
  ok: boolean;
  transport?: 'gateway' | 'direct' | 'none';
};

export type NibiruInferenceResult = {
  text: string | null;
  decision: NibiruModelDecision;
  selected: NibiruModelCandidate | null;
  attempts: NibiruInferenceAttempt[];
  gatewayLogId: string | null;
  gatewayConfigured: boolean;
  directFallbackUsed: boolean;
};

export type NibiruProbeItem = {
  family: NibiruModelFamily;
  model: string;
  ok: boolean;
  transport: 'gateway' | 'direct' | 'none';
  gatewayFallback: boolean;
  preview: string | null;
  error: string | null;
};

export type NibiruProbeResult = {
  ok: boolean;
  gatewayId: string | null;
  gatewayConfigured: boolean;
  routerMode: string;
  results: NibiruProbeItem[];
};

const DEFAULT_FAST = '@cf/zai-org/glm-4.7-flash';
const DEFAULT_META = '@cf/meta/llama-4-scout-17b-16e-instruct';
const DEFAULT_NVIDIA = '@cf/nvidia/nemotron-3-120b-a12b';

function lower(value:string){return String(value||'').toLocaleLowerCase('tr-TR')}
function uniqueCandidates(rows:NibiruModelCandidate[]){
  const seen=new Set<string>();
  return rows.filter(row=>{if(!row.model||seen.has(row.model))return false;seen.add(row.model);return true;});
}

function models(env:Env){
  return {
    fast: env.NIBIRU_FAST_MODEL || DEFAULT_FAST,
    meta: env.NIBIRU_META_MODEL || DEFAULT_META,
    nvidia: env.NIBIRU_REASONING_MODEL || DEFAULT_NVIDIA,
    custom: env.NIBIRU_CUSTOM_MODEL || null,
  };
}

function candidate(family:NibiruModelFamily,model:string,purpose:string):NibiruModelCandidate{return{family,model,purpose}}

export function classifyNibiruWorkload(
  user:Pick<AuthUser,'role'>,
  intent:NibiruIntent,
  message:string,
  route:NibiruSpecialistRoute,
):NibiruWorkload{
  const m=lower(message);
  if(['GREETING','HELP','LATEST_EXAM','TODAY_STATUS'].includes(intent))return 'FAST_FACT';
  if(route.specialist==='EDUCATION_COACH')return 'COACHING';
  if(route.specialist==='GUIDANCE_COUNSELOR')return 'GUIDANCE';
  if(route.specialist==='PARENT_GUIDE')return 'PARENT_EXPLANATION';
  if(route.specialist==='INSTITUTION_INSIGHT')return 'INSTITUTION_ANALYSIS';
  if(route.specialist==='SUBJECT_TEACHER'){
    const quantitative=/(matematik|geometri|problem|cebir|fen|fizik|kimya|biyoloji|sayısal|işlem|denklem|olasılık|fonksiyon)/.test(m)
      || /Matematik|Fen|Fizik|Kimya|Biyoloji/.test(route.subjectHint||'');
    const reasoning=/(neden|nasıl çöz|çözüm|ispat|mantık|adım adım|yanlış yaptım|hata nerede)/.test(m);
    return quantitative&&reasoning?'SUBJECT_REASONING':'SUBJECT_EXPLANATION';
  }
  if(user.role==='INSTITUTION_MANAGER'||user.role==='SUPER_ADMIN')return 'INSTITUTION_ANALYSIS';
  return 'CORE';
}

export function chooseNibiruModelDecision(
  env:Env,
  user:Pick<AuthUser,'role'>,
  intent:NibiruIntent,
  message:string,
  route:NibiruSpecialistRoute,
):NibiruModelDecision{
  const workload=classifyNibiruWorkload(user,intent,message,route);
  const m=models(env);
  const custom=m.custom?candidate('CUSTOM',m.custom,'Opsiyonel haricî/kurumsal model'):null;
  let rows:NibiruModelCandidate[]=[];
  let maxTokens=650,temperature=0.2,reason='Dengeli akademik yanıt';

  switch(workload){
    case 'FAST_FACT':
      rows=[candidate('FAST',m.fast,'Hızlı, düşük maliyetli doğrulanmış veri açıklaması'),candidate('META',m.meta,'Doğal dil yedeği')];
      maxTokens=420;temperature=0.1;reason='Basit bilgi/özet için hızlı model yeterli.';break;
    case 'COACHING':
      rows=[candidate('FAST',m.fast,'Günlük görev ve kısa koçluk'),candidate('META',m.meta,'Daha doğal koçluk dili'),candidate('NVIDIA',m.nvidia,'Karmaşık planlama yedeği')];
      maxTokens=620;temperature=0.2;reason='Eğitim Koçu sık kullanılır; maliyet ve hız öncelikli.';break;
    case 'GUIDANCE':
      rows=[candidate('META',m.meta,'Doğal, destekleyici rehberlik dili'),candidate('NVIDIA',m.nvidia,'Karmaşık hedef/gap açıklaması'),candidate('FAST',m.fast,'Ekonomik yedek')];
      maxTokens=760;temperature=0.2;reason='Rehberlikte doğal dil öncelikli; sayısal kararlar deterministik motordan gelir.';break;
    case 'SUBJECT_REASONING':
      rows=[candidate('NVIDIA',m.nvidia,'Zor matematik/fen ve çok adımlı akademik muhakeme'),candidate('META',m.meta,'Alternatif öğretim açıklaması'),candidate('FAST',m.fast,'Ekonomik yedek')];
      maxTokens=900;temperature=0.12;reason='Sayısal/çok adımlı soruda reasoning modeli öncelikli.';break;
    case 'SUBJECT_EXPLANATION':
      rows=[candidate('META',m.meta,'Öğrenciye doğal konu/soru anlatımı'),candidate('NVIDIA',m.nvidia,'Derin açıklama yedeği'),candidate('FAST',m.fast,'Ekonomik yedek')];
      maxTokens=760;temperature=0.18;reason='Konu anlatımında doğal ve açıklayıcı dil öncelikli.';break;
    case 'PARENT_EXPLANATION':
      rows=[candidate('META',m.meta,'Veliye sade ve doğal gelişim açıklaması'),candidate('FAST',m.fast,'Ekonomik yedek')];
      maxTokens=620;temperature=0.16;reason='Veli dilinde sadelik ve doğallık öncelikli.';break;
    case 'INSTITUTION_ANALYSIS':
      rows=[candidate('NVIDIA',m.nvidia,'Kurum/sınıf düzeyi çoklu veri analizi'),candidate('FAST',m.fast,'Basit kurum özeti yedeği'),candidate('META',m.meta,'Yönetici dilinde açıklama yedeği')];
      maxTokens=850;temperature=0.1;reason='Kurum içgörüsünde çoklu veri ve trend analizi öncelikli.';break;
    default:
      rows=[candidate('FAST',m.fast,'Genel Nibiru çekirdeği'),candidate('META',m.meta,'Doğal dil yedeği')];
      maxTokens=600;temperature=0.18;reason='Genel akademik yönlendirme.';
  }

  if(custom&&env.NIBIRU_CUSTOM_MODEL_MODE==='PRIMARY')rows=[custom,...rows];
  else if(custom&&env.NIBIRU_CUSTOM_MODEL_MODE==='FALLBACK')rows=[...rows,custom];

  if(env.NIBIRU_ROUTER_MODE==='FAST_ONLY')rows=[candidate('FAST',m.fast,'Maliyet koruma modu')];
  if(env.NIBIRU_ROUTER_MODE==='LEGACY'&&env.NIBIRU_AI_MODEL)rows=[candidate('CUSTOM',env.NIBIRU_AI_MODEL,'Eski tek-model uyumluluk modu')];

  return {
    workload,
    specialist:route.specialist,
    specialistLabel:route.label,
    gatewayId:env.NIBIRU_AI_GATEWAY_ID||'default',
    candidates:uniqueCandidates(rows),
    maxTokens,
    temperature,
    // Öğrenci/veli/kurum bağlamı kişiseldir; model yanıt cache'i kullanıcılar arasında paylaşılmaz.
    skipCache:true,
    reason,
  };
}

function textFromValue(value:any):string|null{
  if(typeof value==='string'&&value.trim())return value.trim();
  if(Array.isArray(value)){
    const joined=value.map(part=>typeof part==='string'?part:part?.text||part?.content||'').join('');
    return joined.trim()?joined.trim():null;
  }
  return null;
}

function extractText(response:any):string|null{
  const values=[
    response,
    response?.response,
    response?.result?.response,
    response?.output_text,
    response?.text,
    response?.choices?.[0]?.message?.content,
    response?.choices?.[0]?.message?.text,
    response?.choices?.[0]?.delta?.content,
    response?.choices?.[0]?.text,
  ];
  for(const value of values){
    const text=textFromValue(value);
    if(text)return text;
  }
  return null;
}

function gatewayIdEnabled(value:string|null|undefined){
  const id=String(value||'').trim();
  return Boolean(id)&&!['off','none','disabled','direct'].includes(id.toLocaleLowerCase('en-US'));
}

function gatewayOptions(decision:Pick<NibiruModelDecision,'gatewayId'|'skipCache'>){
  if(!gatewayIdEnabled(decision.gatewayId))return undefined;
  return {gateway:{id:String(decision.gatewayId).trim(),skipCache:decision.skipCache}};
}

function errorMessage(error:unknown){
  return String(error instanceof Error?error.message:error||'AI_PROVIDER_ERROR').replace(/\s+/g,' ').slice(0,240);
}

type ModelCallResult={
  text:string|null;
  transport:'gateway'|'direct'|'none';
  gatewayFallback:boolean;
  error:string|null;
};

async function callModel(
  env:Env,
  item:Pick<NibiruModelCandidate,'model'|'family'>,
  decision:Pick<NibiruModelDecision,'gatewayId'|'skipCache'|'maxTokens'|'temperature'>,
  messages:Array<{role:'system'|'user'|'assistant';content:string}>,
):Promise<ModelCallResult>{
  if(!env.AI)return{text:null,transport:'none',gatewayFallback:false,error:'AI_BINDING_MISSING'};
  const input:any={messages,temperature:decision.temperature,stream:false};
  if(item.model===DEFAULT_FAST){
    // Cloudflare's GLM schema exposes prompt as a required text-generation field;
    // keep messages as well for chat compatibility and provide both forms.
    input.prompt=messages.map(message=>message.role.toUpperCase()+': '+message.content).join('\\n');
  }
  if(item.model===DEFAULT_FAST||item.family==='FAST'){
    input.max_completion_tokens=decision.maxTokens;
    input.reasoning_effort='low';
  }else{
    input.max_tokens=decision.maxTokens;
  }
  const gateway=gatewayOptions(decision);
  if(!gateway){
    try{
      const response:any=await env.AI.run(item.model as any,input);
      const text=extractText(response);
      return{text,transport:'direct',gatewayFallback:false,error:text?null:'EMPTY_RESPONSE'};
    }catch(error){return{text:null,transport:'direct',gatewayFallback:false,error:errorMessage(error)}}
  }
  try{
    const response:any=await env.AI.run(item.model as any,input,gateway as any);
    const text=extractText(response);
    if(text)return{text,transport:'gateway',gatewayFallback:false,error:null};
    throw new Error('EMPTY_GATEWAY_RESPONSE');
  }catch(gatewayError){
    try{
      const response:any=await env.AI.run(item.model as any,input);
      const text=extractText(response);
      return{text,transport:'direct',gatewayFallback:true,error:text?null:'EMPTY_DIRECT_RESPONSE'};
    }catch(directError){
      return{text:null,transport:'direct',gatewayFallback:true,error:'Gateway: '+errorMessage(gatewayError)+'; Direct: '+errorMessage(directError)};
    }
  }
}

export async function runNibiruInference(
  env:Env,
  decision:NibiruModelDecision,
  messages:Array<{role:'system'|'user'|'assistant';content:string}>,
  metadata:Record<string,string|number|boolean|null|undefined>={},
):Promise<NibiruInferenceResult>{
  void metadata;
  const attempts:NibiruInferenceAttempt[]=[];
  const gatewayConfigured=gatewayIdEnabled(decision.gatewayId);
  let directFallbackUsed=false;
  if(!env.AI)return{text:null,decision,selected:null,attempts,gatewayLogId:null,gatewayConfigured,directFallbackUsed};

  for(const item of decision.candidates){
    const result=await callModel(env,item,decision,messages);
    directFallbackUsed=directFallbackUsed||result.gatewayFallback;
    attempts.push({model:item.model,family:item.family,ok:Boolean(result.text),transport:result.transport});
    if(result.text)return{text:result.text,decision,selected:item,attempts,gatewayLogId:env.AI.aiGatewayLogId||null,gatewayConfigured,directFallbackUsed};
  }
  return{text:null,decision,selected:null,attempts,gatewayLogId:env.AI.aiGatewayLogId||null,gatewayConfigured,directFallbackUsed};
}

export async function probeNibiruModels(env:Env):Promise<NibiruProbeResult>{
  const m=models(env);
  const gatewayId=gatewayIdEnabled(env.NIBIRU_AI_GATEWAY_ID||'default')?(env.NIBIRU_AI_GATEWAY_ID||'default'):null;
  const decision={
    gatewayId:gatewayId||'',
    skipCache:true,
    maxTokens:256,
    temperature:0,
  } as Pick<NibiruModelDecision,'gatewayId'|'skipCache'|'maxTokens'|'temperature'>;
  const messages=[{role:'system' as const,content:'Sen Nibiru sağlayıcı bağlantı testisin. Yalnızca kısa bir yanıt ver.'},{role:'user' as const,content:'Bağlantı testi başarılıysa yalnızca OK yaz.'}];
  const candidates:NibiruModelCandidate[]=[
    candidate('FAST',m.fast,'Bağlantı testi'),
    candidate('META',m.meta,'Bağlantı testi'),
    candidate('NVIDIA',m.nvidia,'Bağlantı testi'),
  ];
  const results=await Promise.all(candidates.map(async item=>{
    const call=await callModel(env,item,decision,messages);
    return{
      family:item.family,
      model:item.model,
      ok:Boolean(call.text),
      transport:call.transport,
      gatewayFallback:call.gatewayFallback,
      preview:call.text?call.text.replace(/\s+/g,' ').slice(0,120):null,
      error:call.error,
    };
  }));
  return{
    ok:results.every(item=>item.ok),
    gatewayId,
    gatewayConfigured:Boolean(gatewayId),
    routerMode:env.NIBIRU_ROUTER_MODE||'SMART',
    results,
  };
}

export function nibiruRoutingMatrix(env:Env){
  const m=models(env);
  return {
    gatewayId:env.NIBIRU_AI_GATEWAY_ID||'default',
    routerMode:env.NIBIRU_ROUTER_MODE||'SMART',
    models:{fast:m.fast,meta:m.meta,nvidia:m.nvidia,custom:m.custom},
    policy:[
      {workload:'FAST_FACT',primary:'FAST',use:'Selam/yardım, son sınav, kısa doğrulanmış özet'},
      {workload:'COACHING',primary:'FAST',use:'Eğitim Koçu günlük/haftalık plan ve görev dili'},
      {workload:'GUIDANCE',primary:'META',use:'Rehber AI hedef, motivasyon ve gelişim rotası açıklaması'},
      {workload:'SUBJECT_REASONING',primary:'NVIDIA',use:'Matematik/fen çok adımlı soru ve reasoning'},
      {workload:'SUBJECT_EXPLANATION',primary:'META',use:'Branş konu/soru anlatımı ve alternatif açıklama'},
      {workload:'PARENT_EXPLANATION',primary:'META',use:'Veliye sade, güvenli gelişim özeti'},
      {workload:'INSTITUTION_ANALYSIS',primary:'NVIDIA',use:'Kurum/sınıf trend ve çoklu veri analizi'},
    ],
  };
}
