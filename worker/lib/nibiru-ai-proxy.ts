import type { Env, Role } from '../types';
import { detectNibiruIntent } from './nibiru';
import { routeNibiruSpecialist } from './nibiru-specialists';
import { chooseNibiruModelDecision,runNibiruInference } from './nibiru-model-router';
import { externalPersonalDataGate } from './privacy-external-gate';
import { minimizeNibiruAiMessages } from './privacy-minimization';

function messagesFromInput(input:any):Array<{role:'system'|'user'|'assistant';content:string}>{
  if(!Array.isArray(input?.messages))return[];
  return input.messages.filter((x:any)=>x&&typeof x.content==='string'&&['system','user','assistant'].includes(x.role)).map((x:any)=>({role:x.role,content:x.content}));
}

function isNibiruPrompt(messages:Array<{role:string;content:string}>){return messages.some(x=>x.role==='system'&&x.content.includes("Sen Nibiru'sun."));}

function extractRole(messages:Array<{role:string;content:string}>):Role{
  const text=messages.find(x=>x.role==='system')?.content||'';
  const match=text.match(/Kullanıcı rolü:\s*(SUPER_ADMIN|INSTITUTION_MANAGER|TEACHER|GUIDANCE_TEACHER|STUDENT|PARENT)/);
  return (match?.[1] as Role)||'STUDENT';
}

function extractUserMessage(messages:Array<{role:string;content:string}>){
  const text=messages.filter(x=>x.role==='user').map(x=>x.content).join('\n');
  const match=text.match(/KULLANICI MESAJI:\s*([\s\S]*?)(?:\nDOĞRULANMIŞ VERİ BAĞLAMI:|$)/);
  return (match?.[1]||text).trim();
}

export function withNibiruAiRouter(env:Env):Env{
  if(!env.AI)return env;
  const originalAi=env.AI as any;
  const routedAi=new Proxy(originalAi,{
    get(target,prop,receiver){
      if(prop!=='run'){
        const value=Reflect.get(target,prop,receiver);
        return typeof value==='function'?value.bind(target):value;
      }
      return async (requestedModel:any,input:any,options?:any)=>{
        const messages=messagesFromInput(input);
        if(!isNibiruPrompt(messages))return originalAi.run(requestedModel,input,options);
        const minimized=minimizeNibiruAiMessages(messages);
        const privacyGate=await externalPersonalDataGate(env,'NIBIRU_AI');
        if(!privacyGate.ok)throw new Error(`PRIVACY_EXTERNAL_PROVIDER_BLOCKED:${privacyGate.code}`);
        if(env.NIBIRU_ROUTER_MODE==='LEGACY'){
          return originalAi.run(requestedModel,{...input,messages:minimized.messages},options);
        }
        const role=extractRole(messages),message=extractUserMessage(messages),intent=detectNibiruIntent(message),specialist=routeNibiruSpecialist({role},message);
        const decision=chooseNibiruModelDecision(env,{role},intent,message,specialist);
        const result=await runNibiruInference(env,decision,minimized.messages,{
          role,
          intent,
          environment:env.ENVIRONMENT||'unknown',
        });
        if(!result.text)throw new Error('NIBIRU_MULTI_AI_EXHAUSTED');
        console.log(JSON.stringify({
          event:'nibiru_model_route',
          specialist:decision.specialist,
          workload:decision.workload,
          selectedFamily:result.selected?.family||null,
          selectedModel:result.selected?.model||null,
          attempts:result.attempts,
          gatewayLogId:result.gatewayLogId,
          privacyRedactions:minimized.redactions,
          privacyProviderGate:privacyGate.enforcement,
        }));
        // Keep compatibility with the legacy Nibiru response extractor.
        return {response:result.text};
      };
    },
  });
  return {...env,AI:routedAi as Ai};
}
