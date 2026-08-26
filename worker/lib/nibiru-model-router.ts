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

export type NibiruInferenceResult = {
  text: string | null;
  decision: NibiruModelDecision;
  selected: NibiruModelCandidate | null;
  attempts: Array<{model:string;family:NibiruModelFamily;ok:boolean}>;
  gatewayLogId: string | null;
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

function extractText(response:any):string|null{
  const value=typeof response==='string'?response:response?.response||response?.result?.response||response?.choices?.[0]?.message?.content;
  return typeof value==='string'&&value.trim()?value.trim():null;
}

export async function runNibiruInference(
  env:Env,
  decision:NibiruModelDecision,
  messages:Array<{role:'system'|'user'|'assistant';content:string}>,
  metadata:Record<string,string|number|boolean|null|undefined>={},
):Promise<NibiruInferenceResult>{
  const attempts:NibiruInferenceResult['attempts']=[];
  if(!env.AI)return{text:null,decision,selected:null,attempts,gatewayLogId:null};

  for(const item of decision.candidates){
    try{
      const response:any=await env.AI.run(item.model as any,{
        messages,
        max_tokens:decision.maxTokens,
        temperature:decision.temperature,
      } as any,{
        gateway:{
          id:decision.gatewayId,
          skipCache:decision.skipCache,
          collectLog:true,
          metadata:{
            app:'nibiru',
            specialist:decision.specialist,
            workload:decision.workload,
            modelFamily:item.family,
            ...metadata,
          },
        },
      } as any);
      const text=extractText(response);
      attempts.push({model:item.model,family:item.family,ok:Boolean(text)});
      if(text)return{text,decision,selected:item,attempts,gatewayLogId:env.AI.aiGatewayLogId||null};
    }catch{
      attempts.push({model:item.model,family:item.family,ok:false});
    }
  }
  return{text:null,decision,selected:null,attempts,gatewayLogId:env.AI.aiGatewayLogId||null};
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
