import type {Env} from '../types';
import {all} from './db';

/**
 * A081: surface the independent verifier's own assessment of each AI question
 * so the human reviewer sees the weakest questions first. A passed question has
 * every editorial score ≥3 (lower scores fail automatically), so the useful
 * signal is how far below the maximum it sits and which dimensions scored 3.
 * This is a reading aid, never an approval or a rejection.
 */
export const SCREENING_DIMENSIONS = ['outcomeAlignment','reasoningDemand','distractorQuality','languageAndFairness','visualConsistency','originalityDesign'] as const;
export type Screening = {model:string|null;total:number;max:number;weakest:string[];rationale:string|null;suspicion:number};

export function screeningFor(details:any,questionId:string):Screening|null{
 const ids:unknown=details?.questionIds;
 if(!Array.isArray(ids))return null;
 const index=ids.indexOf(questionId);
 if(index<0)return null;
 const review=Array.isArray(details?.verification?.reviews)?details.verification.reviews.find((r:any)=>r?.index===index):null;
 const editorial=review?.editorial;
 if(!editorial||typeof editorial!=='object')return null;
 const scores=SCREENING_DIMENSIONS.map(key=>Number(editorial[key]));
 if(scores.some(v=>!Number.isInteger(v)||v<0||v>4))return null;
 const total=scores.reduce((a,b)=>a+b,0),max=SCREENING_DIMENSIONS.length*4;
 const weakest=SCREENING_DIMENSIONS.filter((_,i)=>scores[i]<4&&scores[i]===Math.min(...scores));
 const rationale=typeof editorial.rationale==='string'?editorial.rationale.slice(0,600):null;
 return {model:typeof details?.verification?.model==='string'?details.verification.model:null,total,max,weakest:[...weakest],rationale,suspicion:max-total};
}

/** Loads the verifier assessment for AI questions in bounded chunks; any failure leaves questions unannotated. */
export async function loadScreening(env:Env,rows:Array<{id:string;source_job_id?:string|null}>):Promise<Map<string,Screening>>{
 const out=new Map<string,Screening>();
 const jobs=[...new Set(rows.map(r=>r.source_job_id).filter((v):v is string=>typeof v==='string'&&!!v))];
 for(let start=0;start<jobs.length;start+=80){
  const chunk=jobs.slice(start,start+80);
  let audits:any[]=[];
  try{
   audits=await all<any>(env.DB.prepare(`SELECT entity_id,details_json FROM audit_logs WHERE action='QUESTION_GENERATION_REVIEW_READY' AND entity_type='question_generation_job' AND entity_id IN (${chunk.map(()=>'?').join(',')}) ORDER BY created_at`).bind(...chunk));
  }catch{continue;}
  for(const audit of audits){
   let details:any;try{details=JSON.parse(audit.details_json||'null')}catch{continue;}
   for(const row of rows){if(row.source_job_id!==audit.entity_id)continue;const s=screeningFor(details,row.id);if(s)out.set(row.id,s);}
  }
 }
 return out;
}
