import type {Env} from '../types';

const rates:Record<string,readonly [number,number]>={
 '@cf/zai-org/glm-4.7-flash':[5500,36400],
 '@cf/qwen/qwen3-30b-a3b-fp8':[4625,30475],
 '@cf/openai/gpt-oss-120b':[31818,68182],
 '@cf/nvidia/nemotron-3-120b-a12b':[45455,136364],
};
export function questionCallReservation(model:string,input:any){
 const rate=rates[model],maximum=input?.max_tokens??input?.max_completion_tokens;
 if(!rate||!Number.isSafeInteger(maximum)||maximum<1||maximum>12000||input?.stream===true)throw Error('QUESTION_AI_BUDGET_UNSUPPORTED_CALL');
 // Conservative byte-level token envelope, including schema and chat framing.
 const bytes=new TextEncoder().encode(JSON.stringify(input)).length;
 if(bytes>200000)throw Error('QUESTION_AI_INPUT_TOO_LARGE');
 return Math.ceil(((bytes+2048)*rate[0]+maximum*rate[1])/1e6);
}
export function questionCallCharge(model:string,raw:any):number|null{
 const u=raw?.usage??{},rate=rates[model];
 if(typeof u.neurons==='number'&&Number.isFinite(u.neurons)&&u.neurons>0)return Math.ceil(u.neurons);
 if(rate&&Number.isSafeInteger(u.prompt_tokens)&&Number.isSafeInteger(u.completion_tokens)&&u.prompt_tokens>=0&&u.completion_tokens>0)return Math.ceil((u.prompt_tokens*rate[0]+u.completion_tokens*rate[1])/1e6);
 return null;
}
/** Shared by manual runs, verification and scheduled question calls. No silent refund on errors. */
export function withQuestionAiBudget(env:Env):Env{
 const cfg=env as Env&{QUESTION_AI_DAILY_NEURON_LIMIT?:string;QUESTION_AI_PAID_BUDGET_APPROVED?:string};
 if(cfg.QUESTION_AI_DAILY_NEURON_LIMIT===undefined)return env;
 const limit=Number(cfg.QUESTION_AI_DAILY_NEURON_LIMIT),ai=env.AI;
 const wrapped={...env,AI:{run:async(model:string,input:any)=>{
  if(!ai||!Number.isSafeInteger(limit)||limit<1||(limit>10000&&cfg.QUESTION_AI_PAID_BUDGET_APPROVED!=='true')||limit>1000000000)throw Error('QUESTION_AI_BUDGET_NOT_CONFIGURED');
  const day=new Date().toISOString().slice(0,10),id=crypto.randomUUID(),reserved=questionCallReservation(model,input);
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO question_ai_budget_days(day,limit_neurons) VALUES(?,?)').bind(day,limit),env.DB.prepare('INSERT INTO question_ai_budget_calls(id,day,model,reserved_neurons) VALUES(?,?,?,?)').bind(id,day,model,reserved)]);
  let raw:any;
  try{raw=await ai.run(model as any,input);}catch(e){await env.DB.prepare("UPDATE question_ai_budget_calls SET status='UNKNOWN' WHERE id=? AND status='HELD'").bind(id).run();throw e;}
  const charged=questionCallCharge(model,raw);
  if(charged===null){await env.DB.prepare("UPDATE question_ai_budget_calls SET status='UNKNOWN' WHERE id=? AND status='HELD'").bind(id).run();return raw;}
  await env.DB.batch([
   env.DB.prepare("UPDATE question_ai_budget_days SET held_neurons=held_neurons-?,charged_neurons=charged_neurons+? WHERE day=? AND EXISTS(SELECT 1 FROM question_ai_budget_calls WHERE id=? AND status='HELD')").bind(reserved,charged,day,id),
   env.DB.prepare("UPDATE question_ai_budget_calls SET status='SETTLED',charged_neurons=? WHERE id=? AND status='HELD'").bind(charged,id),
  ]);
  if(charged>reserved)throw Error('QUESTION_AI_USAGE_ENVELOPE_EXCEEDED');
  return raw;
 }} as any};
 return wrapped;
}
