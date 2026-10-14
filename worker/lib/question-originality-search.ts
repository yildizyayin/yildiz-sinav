import type {Env} from '../types';
import {one} from './db';
/** Lexical candidate retrieval across the platform pool, not a uniqueness certificate. */
export function originalitySearchQuery(stem:string){
 const stop=new Set(['bir','için','olan','olarak','göre','kaç','hangi','aşağıdaki','yukarıdaki','olur','kadar','toplam','daha','sonra','doğru','aynı','iki','her','verilen']);
 const words=[...new Set((stem.toLocaleLowerCase('tr-TR').match(/\p{L}{4,}/gu)??[]).filter(w=>!stop.has(w)))].sort((a,b)=>b.length-a.length).slice(0,10);
 return words.map(w=>'"'+w+'"').join(' OR ');
}
export async function questionOriginalityCandidates(env:Env,drafts:{stemText:string}[]){
 const found=new Map<string,any>();
 for(const draft of drafts){const match=originalitySearchQuery(draft.stemText);if(!match)continue;
  const r=await one<{candidates_json:string}>(env.DB.prepare(`SELECT COALESCE(json_group_array(json_object('id',id,'stemText',stem,'solutionText',solution)),'[]') candidates_json FROM
   (SELECT q.id,substr(q.stem_text,1,650) stem,substr(q.solution_text,1,650) solution FROM question_editorial_search f JOIN question_bank q ON q.id=f.question_id
   WHERE question_editorial_search MATCH ? AND q.owner_type='PLATFORM' ORDER BY f.rank LIMIT 5)`).bind(match));
  for(const q of JSON.parse(r?.candidates_json??'[]'))found.set(q.id,q);
 }
 return [...found.values()].slice(0,8);
}
