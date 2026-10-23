import type { Env } from '../types';

/** A066: daily caps for paid speech and transcription (counts only; no audio or text is stored). */
export const VOICE_DAILY_LIMIT={SPEAK:40,TRANSCRIBE:60} as const;
/** A066: reserve one use of today's quota before calling a provider; false when the cap is reached. */
export async function reserveVoiceUse(env:Env,user:{id:string;role:string},kind:'SPEAK'|'TRANSCRIBE'){
 if(user.role==='SUPER_ADMIN')return true;
 const day=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
 const r=await env.DB.prepare(`INSERT INTO nibiru_voice_daily_usage(user_id,usage_date,kind,count) VALUES(?,?,?,1) ON CONFLICT(user_id,usage_date,kind) DO UPDATE SET count=count+1 WHERE count<?`).bind(user.id,day,kind,VOICE_DAILY_LIMIT[kind]).run();
 return Number(r.meta?.changes||0)===1;
}
