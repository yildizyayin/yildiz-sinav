import type {EditorialPacket} from './question-editorial';
export type VideoScene={title:string;text:string;spokenText:string;visual?:Omit<EditorialPacket['visual'],'readingPurpose'>};
export type QuestionVideoPlan={version:1;width:1280;height:720;language:'tr-TR';scenes:VideoScene[];narrationText:string;sourceQuestionId:string;sourceRevision:number;synthetic:boolean};
/** Layout-only transformation of approved source text. No new solution is invented. */
export function buildQuestionVideoPlan(q:{id:string;review_revision:number;stem_text:string;solution_text:string;correct_answer:string;options_json:string},synthetic=false,visual?:VideoScene['visual']):QuestionVideoPlan{
 let raw:any;try{raw=JSON.parse(q.options_json)}catch{throw Error('INVALID_VIDEO_QUESTION')}
 if(!Array.isArray(raw)||![4,5].includes(raw.length)||!q.stem_text?.trim()||!q.solution_text?.trim())throw Error('INVALID_VIDEO_QUESTION');
 const options=raw.map((o:any,i:number)=>({label:String.fromCharCode(65+i),text:typeof o==='string'?o:String(o?.text??'')}));
 if(options.some(o=>!o.text.trim())||!options.some(o=>o.label===q.correct_answer))throw Error('INVALID_VIDEO_QUESTION');
 const chunk=(text:string,max=520)=>{const chunks:string[]=[];let rest=text.trim();while(rest.length>max){let n=rest.lastIndexOf(' ',max);if(n<max/2)n=max;chunks.push(rest.slice(0,n));rest=rest.slice(n).trimStart();}if(rest)chunks.push(rest);return chunks;};
 const scenes:VideoScene[]=[];
 const add=(title:string,text:string)=>{for(const part of chunk(text))scenes.push({title,text:part,spokenText:part.replace(/[×*]/g,' çarpı ').replace(/÷/g,' bölü ').replace(/[−–]/g,' eksi ').replace(/=/g,' eşittir ')});};
 add(synthetic?'Teknik test · öğrenci içeriği değildir':'Soruyu inceleyelim',q.stem_text+'\n\n'+options.map(o=>`${o.label}) ${o.text}`).join('\n'));
 if(visual&&visual.kind!=='NONE'){
  const text=visual.kind==='TABLE'?visual.columns.join(' · ')+'; '+visual.rows.map(r=>r.join(' · ')).join('; '):visual.categories.map((c,i)=>c+': '+visual.values[i]).join('; ');
  if(text.length>2000)throw Error('VIDEO_VISUAL_TOO_LONG');
  scenes.push({title:visual.title,text,spokenText:[visual.title,visual.unit,text].filter(Boolean).join('. '),visual});
 }
 add('Çözüm adımları',q.solution_text);
 const correct=options.find(o=>o.label===q.correct_answer)!;add('Doğru cevap',`${correct.label} seçeneği: ${correct.text}`);
 if(scenes.length>12)throw Error('VIDEO_PLAN_TOO_LONG');
 return {version:1,width:1280,height:720,language:'tr-TR',scenes,narrationText:scenes.map(s=>s.spokenText).join('\n'),sourceQuestionId:q.id,sourceRevision:q.review_revision,synthetic};
}
