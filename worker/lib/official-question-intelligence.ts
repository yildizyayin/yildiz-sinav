import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';

type DifficultyBand='EASY'|'MEDIUM'|'HARD';
type ExamFamily='LGS'|'YKS';

const OFFICIAL_INTENT=/(ösym|yks|tyt|ayt|lgs|çıkmış soru|kaç soru|kazanımdan.*soru|soru.*kazanım|çıkma olasılığı|çıkma ihtimali|geçmiş yıllar|yıllara göre)/i;

export function questionDifficulty(value:number|string|undefined|null):{band:DifficultyBand;color:'BLUE'|'GREEN'|'RED';label:string}{
  const n=Number(value||3);
  if(n<=2)return {band:'EASY',color:'BLUE',label:'Kolay'};
  if(n>=4)return {band:'HARD',color:'RED',label:'Zor'};
  return {band:'MEDIUM',color:'GREEN',label:'Orta'};
}

function stripTags(v:string){return v.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();}
function absoluteUrl(href:string,base:string){try{const u=new URL(href,base);return /^https?:$/.test(u.protocol)?u.toString():null}catch{return null}}
function anchors(html:string,base:string){const out:Array<{url:string;text:string}>=[];const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;while((m=re.exec(html))){const url=absoluteUrl(m[1],base);if(url)out.push({url,text:stripTags(m[2])});}return out;}
function yearOf(v:string){const years=[...v.matchAll(/\b(20(?:1[8-9]|2\d))\b/g)].map(x=>Number(x[1]));return years.length?Math.max(...years):null;}
function yksSession(v:string){const t=v.toLocaleUpperCase('tr-TR');if(t.includes('TYT'))return 'TYT';if(t.includes('AYT'))return 'AYT';if(t.includes('YDT'))return 'YDT';return 'YKS';}
function lgsSession(v:string){const t=v.toLocaleLowerCase('tr-TR');if(t.includes('sayısal')||t.includes('sayisal'))return 'SAYISAL';if(t.includes('sözel')||t.includes('sozel'))return 'SOZEL';return 'LGS';}
function normalize(v:string){return v.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}

async function parseBody(request:Request){return request.json().catch(()=>({})) as Promise<any>}

async function listStatus(env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const sources=await all<any>(env.DB.prepare(`SELECT s.*,
    (SELECT COUNT(*) FROM official_exam_archives a WHERE a.source_key=s.source_key AND a.active=1) archive_count,
    (SELECT COUNT(*) FROM official_question_outcome_facts f JOIN official_exam_archives a ON a.id=f.archive_id WHERE a.source_key=s.source_key AND f.verification_status='VERIFIED') verified_mapping_count
    FROM official_question_sources s WHERE s.active=1 ORDER BY s.authority,s.label`));
  const runs=await all<any>(env.DB.prepare(`SELECT r.*,s.label source_label FROM official_question_sync_runs r JOIN official_question_sources s ON s.source_key=r.source_key ORDER BY r.started_at DESC LIMIT 60`));
  const coverage=await all<any>(env.DB.prepare(`SELECT exam_family,MIN(exam_year) first_year,MAX(exam_year) last_year,COUNT(DISTINCT exam_year) year_count,COUNT(*) mapped_question_count
    FROM official_question_outcome_facts WHERE verification_status='VERIFIED' GROUP BY exam_family ORDER BY exam_family`));
  return json({ok:true,sources,runs,coverage,policy:{copyrightedQuestionTextStored:false,officialMetadataOnly:true,openLicensedQuestionsMayBeStored:true,difficulty:{EASY:'BLUE',MEDIUM:'GREEN',HARD:'RED'}}});
}

async function discoverSource(env:Env,user:AuthUser,sourceKey:string){
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const source=await one<any>(env.DB.prepare(`SELECT * FROM official_question_sources WHERE source_key=? AND active=1`).bind(sourceKey));
  if(!source)return notFound('Resmî kaynak bulunamadı.');
  const runId=uuid('oqs');
  await env.DB.prepare(`INSERT INTO official_question_sync_runs(id,source_key,sync_kind,requested_by,status) VALUES(?,?, 'REFRESH',?,'RUNNING')`).bind(runId,sourceKey,user.id).run();
  try{
    const response=await fetch(String(source.index_url),{headers:{'User-Agent':'Mozilla/5.0 (compatible; AcademicSourceRegistry/1.0; +https://yildizyayin.com)'}});
    if(!response.ok)throw new Error(`Kaynak HTTP ${response.status}`);
    const html=await response.text();
    const found=anchors(html,String(source.index_url));
    const candidates:Array<{year:number;session:string;title:string;url:string;documentUrl:string|null}>=[];
    for(const a of found){
      const combined=`${a.text} ${a.url}`;const year=yearOf(combined);if(!year)continue;
      if(source.exam_family==='LGS'){
        const looks=/lgs|sözel|sozel|sayısal|sayisal|kitapç|kitapc/i.test(combined);if(!looks)continue;
        candidates.push({year,session:lgsSession(combined),title:a.text||`${year} LGS`,url:a.url,documentUrl:/\.pdf(?:$|\?)/i.test(a.url)?a.url:null});
      }else if(source.exam_family==='YKS'){
        const looks=/yks|tyt|ayt|ydt/i.test(combined)&&/soru|kitapç|kitapc|tsk|pdfdokuman/i.test(combined);if(!looks)continue;
        candidates.push({year,session:yksSession(combined),title:a.text||`${year} YKS`,url:a.url,documentUrl:/\.pdf(?:$|\?)/i.test(a.url)?a.url:null});
      }
    }
    const unique=new Map<string,typeof candidates[number]>();for(const c of candidates)unique.set(`${c.year}|${c.session}|${c.url}`,c);
    let discovered=0,updated=0;
    for(const c of unique.values()){
      const existing=await one<any>(env.DB.prepare(`SELECT id FROM official_exam_archives WHERE source_key=? AND exam_family=? AND exam_year=? AND session_code=? AND landing_url=?`).bind(sourceKey,source.exam_family,c.year,c.session,c.url));
      if(existing){await env.DB.prepare(`UPDATE official_exam_archives SET title=?,document_url=COALESCE(?,document_url),last_seen_at=CURRENT_TIMESTAMP,active=1 WHERE id=?`).bind(c.title,c.documentUrl,existing.id).run();updated++;}
      else{await env.DB.prepare(`INSERT INTO official_exam_archives(id,source_key,authority,exam_family,exam_year,session_code,title,landing_url,document_url,rights_status,ingestion_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid('oqa'),sourceKey,source.authority,source.exam_family,c.year,c.session,c.title,c.url,c.documentUrl,source.rights_status,source.ingestion_policy).run();discovered++;}
    }
    await env.DB.batch([
      env.DB.prepare(`UPDATE official_question_sources SET last_checked_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE source_key=?`).bind(sourceKey),
      env.DB.prepare(`UPDATE official_question_sync_runs SET status='SUCCESS',discovered_count=?,updated_count=?,details_json=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).bind(discovered,updated,JSON.stringify({anchors:found.length,candidates:unique.size,contentCopied:false}),runId),
    ]);
    await audit(env.DB,user.id,user.institution_id,'OFFICIAL_QUESTION_SOURCE_REFRESHED','official_question_source',sourceKey,{discovered,updated});
    return json({ok:true,sourceKey,discovered,updated,archiveCandidates:unique.size,contentCopied:false,rightsStatus:source.rights_status,ingestionPolicy:source.ingestion_policy});
  }catch(error:any){
    await env.DB.batch([
      env.DB.prepare(`UPDATE official_question_sources SET last_checked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE source_key=?`).bind(sourceKey),
      env.DB.prepare(`UPDATE official_question_sync_runs SET status='FAILED',error_count=1,details_json=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify({error:String(error?.message||error)}),runId),
    ]);
    return json({ok:false,error:{code:'SOURCE_REFRESH_FAILED',message:'Resmî kaynak güncellenemedi.',details:String(error?.message||error)}},502);
  }
}

async function importMappings(request:Request,env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN')return forbidden();const b=await parseBody(request);const rows:Array<any>=Array.isArray(b.rows)?b.rows:[];
  if(!rows.length||rows.length>10000)return badRequest('1–10000 arası eşleştirme satırı gönderin.');
  const sourceKey=String(b.sourceKey||'').trim();const source=await one<any>(env.DB.prepare(`SELECT * FROM official_question_sources WHERE source_key=?`).bind(sourceKey));if(!source)return badRequest('Geçerli sourceKey gereklidir.');
  const runId=uuid('oqs');await env.DB.prepare(`INSERT INTO official_question_sync_runs(id,source_key,sync_kind,requested_by,status) VALUES(?,?,'MAPPING_IMPORT',?,'RUNNING')`).bind(runId,sourceKey,user.id).run();
  let mapped=0,skipped=0;const errors:Array<any>=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i];try{
      const year=Number(r.year);const questionNo=Number(r.questionNo);const family=String(r.examFamily||source.exam_family||'').toUpperCase();const session=String(r.sessionCode||family).toUpperCase();
      if(!year||!questionNo||!family)throw new Error('year/questionNo/examFamily eksik');
      let outcome:any=null;if(r.outcomeId)outcome=await one<any>(env.DB.prepare(`SELECT id,code,title,subject_id FROM outcomes WHERE id=?`).bind(r.outcomeId));
      if(!outcome&&r.outcomeCode)outcome=await one<any>(env.DB.prepare(`SELECT id,code,title,subject_id FROM outcomes WHERE code=? AND active=1 ORDER BY official DESC LIMIT 1`).bind(r.outcomeCode));
      if(!outcome&&r.outcomeTitle)outcome=await one<any>(env.DB.prepare(`SELECT id,code,title,subject_id FROM outcomes WHERE title=? AND active=1 ORDER BY official DESC LIMIT 1`).bind(r.outcomeTitle));
      if(!outcome)throw new Error('Kazanım bulunamadı');
      const landing=String(r.sourceUrl||source.index_url);let archive=await one<any>(env.DB.prepare(`SELECT * FROM official_exam_archives WHERE source_key=? AND exam_family=? AND exam_year=? AND session_code=? ORDER BY CASE WHEN landing_url=? THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 1`).bind(sourceKey,family,year,session,landing));
      if(!archive){const id=uuid('oqa');await env.DB.prepare(`INSERT INTO official_exam_archives(id,source_key,authority,exam_family,exam_year,session_code,title,landing_url,document_url,rights_status,ingestion_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,sourceKey,source.authority,family,year,session,r.examTitle||`${year} ${family} ${session}`,landing,r.documentUrl||null,source.rights_status,source.ingestion_policy).run();archive={id};}
      const diff=questionDifficulty(r.difficulty);const subjectId=r.subjectId||outcome.subject_id||null;let subjectName=String(r.subjectName||'').trim()||null;if(!subjectName&&subjectId){const s=await one<any>(env.DB.prepare(`SELECT name FROM subjects WHERE id=?`).bind(subjectId));subjectName=s?.name||null;}
      const confidence=Math.max(0,Math.min(1,Number(r.mappingConfidence??(r.verified?1:.75))));const status=r.verified===false?'REVIEW':'VERIFIED';
      const existing=await one<any>(env.DB.prepare(`SELECT id FROM official_question_outcome_facts WHERE archive_id=? AND session_code=? AND COALESCE(subject_name,'')=COALESCE(?,'') AND question_no=? AND COALESCE(outcome_code_snapshot,'')=COALESCE(?,'')`).bind(archive.id,session,subjectName,questionNo,r.historicOutcomeCode||outcome.code||null));
      if(existing){await env.DB.prepare(`UPDATE official_question_outcome_facts SET outcome_id=?,subject_id=?,subject_name=?,outcome_code_snapshot=?,outcome_title_snapshot=?,difficulty_band=?,difficulty_color=?,mapping_method='IMPORT',mapping_confidence=?,verification_status=?,source_page=?,source_anchor=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(outcome.id,subjectId,subjectName,r.historicOutcomeCode||outcome.code||null,r.historicOutcomeTitle||outcome.title,diff.band,diff.color,confidence,status,r.sourcePage||null,r.sourceAnchor||null,r.notes||null,existing.id).run();}
      else{await env.DB.prepare(`INSERT INTO official_question_outcome_facts(id,archive_id,exam_family,exam_year,session_code,subject_id,subject_name,question_no,outcome_id,outcome_code_snapshot,outcome_title_snapshot,difficulty_band,difficulty_color,mapping_method,mapping_confidence,verification_status,source_page,source_anchor,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'IMPORT',?,?,?,?,?)`).bind(uuid('oqf'),archive.id,family,year,session,subjectId,subjectName,questionNo,outcome.id,r.historicOutcomeCode||outcome.code||null,r.historicOutcomeTitle||outcome.title,diff.band,diff.color,confidence,status,r.sourcePage||null,r.sourceAnchor||null,r.notes||null).run();}
      mapped++;
    }catch(e:any){skipped++;if(errors.length<50)errors.push({row:i+1,error:String(e?.message||e)});}
  }
  const status=skipped?'PARTIAL':'SUCCESS';await env.DB.prepare(`UPDATE official_question_sync_runs SET status=?,mapped_count=?,skipped_count=?,error_count=?,details_json=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,mapped,skipped,skipped,JSON.stringify({errors}),runId).run();
  await audit(env.DB,user.id,user.institution_id,'OFFICIAL_QUESTION_MAPPINGS_IMPORTED','official_question_source',sourceKey,{mapped,skipped});
  return json({ok:true,sourceKey,mapped,skipped,errors});
}

async function factRowsForOutcome(env:Env,outcomeId:string,family?:string|null){
  const params:any[]=[outcomeId,outcomeId];let familySql='';if(family){familySql=' AND f.exam_family=?';params.push(family);}
  return all<any>(env.DB.prepare(`SELECT f.exam_family,f.exam_year,f.session_code,f.subject_name,f.question_no,f.difficulty_band,f.difficulty_color,f.mapping_confidence,
      a.landing_url,a.document_url,a.authority
    FROM official_question_outcome_facts f JOIN official_exam_archives a ON a.id=f.archive_id
    WHERE f.verification_status='VERIFIED' AND (f.outcome_id=? OR EXISTS(
      SELECT 1 FROM official_outcome_equivalences e WHERE e.current_outcome_id=? AND e.verified=1 AND e.exam_family=f.exam_family AND e.from_year=f.exam_year
      AND ((e.from_outcome_code IS NOT NULL AND e.from_outcome_code=f.outcome_code_snapshot) OR (e.from_outcome_code IS NULL AND e.from_outcome_title=f.outcome_title_snapshot))
    ))${familySql} ORDER BY f.exam_year,f.session_code,f.question_no`).bind(...params));
}

async function outcomeStats(env:Env,outcomeId:string,family?:string|null){
  const outcome=await one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.grade_level,o.topic,o.subtopic,s.name subject_name FROM outcomes o JOIN subjects s ON s.id=o.subject_id WHERE o.id=?`).bind(outcomeId));if(!outcome)return null;
  const facts=await factRowsForOutcome(env,outcomeId,family);const families=family?[family]:[...new Set(facts.map(x=>String(x.exam_family)))];
  const stats:any[]=[];
  for(const fam of families){const f=facts.filter(x=>x.exam_family===fam);if(!f.length)continue;const years=[...new Set(f.map(x=>Number(x.exam_year)))].sort((a,b)=>a-b);const fromYear=years[0],toYear=years[years.length-1];const perYear=years.map(y=>({year:y,count:f.filter(x=>Number(x.exam_year)===y).length}));
    const archiveYears=await all<any>(env.DB.prepare(`SELECT DISTINCT exam_year FROM official_exam_archives WHERE exam_family=? AND active=1 AND exam_year BETWEEN ? AND ? ORDER BY exam_year`).bind(fam,fromYear,toYear));const analyzedYears=Math.max(years.length,archiveYears.length||0);const appeared=perYear.filter(x=>x.count>0).length;const avg=f.length/Math.max(1,analyzedYears);const latest=perYear.at(-1)?.count||0;const recent=perYear.slice(-3);const recentAvg=recent.reduce((a,c)=>a+c.count,0)/Math.max(1,recent.length);const consistency=appeared/Math.max(1,analyzedYears);
    const score=Math.min(100,Math.round(consistency*40+Math.min(1,avg/2)*30+Math.min(1,recentAvg/2)*30));const band=score>=65?'HIGH':score>=35?'MEDIUM':'LOW';
    stats.push({examFamily:fam,fromYear,toYear,totalQuestionCount:f.length,latestYearQuestionCount:latest,yearsAppeared:appeared,yearsAnalyzed:analyzedYears,averagePerYear:Number(avg.toFixed(2)),recentThreeYearAverage:Number(recentAvg.toFixed(2)),historicalPriorityScore:score,historicalPriorityBand:band,perYear});
  }
  return {outcome,stats,facts:facts.slice(-100),disclaimer:'Tarihsel öncelik göstergesi geçmiş resmî sınav dağılımına dayanır; gelecekte soru çıkacağını garanti etmez.'};
}

async function listOutcomeInsights(request:Request,env:Env,user:AuthUser){
  const u=new URL(request.url);const q=String(u.searchParams.get('q')||'').trim();const family=String(u.searchParams.get('examFamily')||'').toUpperCase()||null;const grade=u.searchParams.get('gradeLevel');
  const ps:any[]=[];const wh=[`o.active=1`];if(q){wh.push(`(o.title LIKE ? OR o.code LIKE ? OR o.topic LIKE ? OR o.subtopic LIKE ?)`);const s=`%${q}%`;ps.push(s,s,s,s);}if(grade){wh.push('o.grade_level=?');ps.push(Number(grade));}
  const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.grade_level,o.topic,o.subtopic,s.name subject_name FROM outcomes o JOIN subjects s ON s.id=o.subject_id WHERE ${wh.join(' AND ')} ORDER BY s.name,o.title LIMIT 60`).bind(...ps));
  const items:any[]=[];for(const o of outcomes){const x=await outcomeStats(env,o.id,family);const summary=x?.stats?.[0]||null;items.push({...o,summary});}
  return json({ok:true,items,examFamily:family,difficultyLegend:{BLUE:'Kolay',GREEN:'Orta',RED:'Zor'},predictionPolicy:'HISTORICAL_PRIORITY_NOT_GUARANTEE'});
}

async function outcomeInsight(request:Request,env:Env,user:AuthUser,outcomeId:string){
  const family=String(new URL(request.url).searchParams.get('examFamily')||'').toUpperCase()||null;const payload=await outcomeStats(env,outcomeId,family);return payload?json({ok:true,...payload}):notFound('Kazanım bulunamadı.');
}

export async function handleOfficialQuestionIntelligenceApi(request:Request,env:Env,user:AuthUser):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/official-question-intelligence'))return null;
  if(p==='/api/official-question-intelligence/status'&&request.method==='GET')return listStatus(env,user);
  if(p==='/api/official-question-intelligence/outcomes'&&request.method==='GET')return listOutcomeInsights(request,env,user);
  if(p==='/api/official-question-intelligence/mappings/import'&&request.method==='POST')return importMappings(request,env,user);
  let m=p.match(/^\/api\/official-question-intelligence\/sources\/([^/]+)\/refresh$/);if(m&&request.method==='POST')return discoverSource(env,user,m[1]);
  m=p.match(/^\/api\/official-question-intelligence\/outcomes\/([^/]+)\/stats$/);if(m&&request.method==='GET')return outcomeInsight(request,env,user,m[1]);
  return json({ok:false,error:{code:'NOT_FOUND',message:'Resmî soru zekâsı API yolu bulunamadı.'}},404);
}

async function studentScope(env:Env,user:AuthUser,requested?:string|null){
  if(user.role==='STUDENT')return user.student_id;
  if(user.role==='PARENT'&&requested){const r=await one<any>(env.DB.prepare(`SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id,requested));return r?requested:null;}
  return null;
}

export async function nibiruOfficialOutcomeInsight(env:Env,user:AuthUser,message:string,requestedStudentId?:string|null):Promise<{answer:string;studentId?:string;outcomeId?:string}|null>{
  if(!OFFICIAL_INTENT.test(message))return null;const sid=await studentScope(env,user,requestedStudentId);if(!sid)return null;
  const enr=await one<any>(env.DB.prepare(`SELECT grade_level FROM student_enrollments WHERE student_id=? AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).bind(sid));const family:ExamFamily=Number(enr?.grade_level)===8?'LGS':'YKS';
  const weak=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,s.name subject_name,ROUND(AVG(r.success_rate),3) success_rate,SUM(r.evidence_count) evidence_count
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id WHERE r.student_id=? GROUP BY o.id,o.code,o.title,s.name HAVING SUM(r.evidence_count)>0 ORDER BY AVG(r.success_rate) ASC,SUM(r.evidence_count) DESC LIMIT 20`).bind(sid));
  if(!weak.length)return {answer:`🤖 Nibiru · Yapay Zekâ Akademik Asistanı: ${family} geçmiş soru dağılımıyla karşılaştırma yapabilirim; ancak önce bu öğrenci için yeterli kazanım sonucu oluşması gerekiyor.`};
  const nm=normalize(message);let chosen=weak.find(w=>{const t=normalize(String(w.title||''));const code=normalize(String(w.code||''));return (code&&nm.includes(code))||(t.length>12&&nm.includes(t));})||null;
  if(!chosen){let best:any=null,bestCount=-1;for(const w of weak.slice(0,10)){const x=await outcomeStats(env,w.id,family);const count=Number(x?.stats?.[0]?.totalQuestionCount||0);if(count>bestCount){best={w,x};bestCount=count;}}chosen=best?.w||weak[0];if(best?.x){const s=best.x.stats?.[0];if(s){const success=Math.round(Number(chosen.success_rate||0)*100);const band=s.historicalPriorityBand==='HIGH'?'yüksek':s.historicalPriorityBand==='MEDIUM'?'orta':'düşük';return {studentId:sid,outcomeId:chosen.id,answer:`🤖 Nibiru · Yapay Zekâ Akademik Asistanı: ${chosen.subject_name} dersinde “${chosen.title}” kazanımı şu an çalışma önceliklerinden biri; mevcut sınav kanıtlarında başarı oranı yaklaşık %${success}. Doğrulanmış resmî ${family} eşleştirmelerinde ${s.fromYear}–${s.toYear} arasında bu kazanımla ilişkili toplam ${s.totalQuestionCount} soru kaydı var; ${s.toYear} yılında ${s.latestYearQuestionCount} soru görülmüş. Tarihsel tekrar/öncelik göstergesi ${band}. Bu, ${family==='YKS'?'ÖSYM':'MEB'}’nin gelecek sınavda bu kazanımdan soru soracağı anlamına gelmez; geçmiş dağılıma göre çalışma önceliğidir.`};}}
  }
  const x=await outcomeStats(env,chosen.id,family);const s=x?.stats?.[0];if(!s)return {studentId:sid,outcomeId:chosen.id,answer:`🤖 Nibiru · Yapay Zekâ Akademik Asistanı: “${chosen.title}” kazanımında gelişim alanı görüyorum; fakat bu kazanım için henüz doğrulanmış resmî ${family} geçmiş soru eşleştirmesi bulunmuyor. Sayı uydurmayacağım.`};
  const success=Math.round(Number(chosen.success_rate||0)*100);const band=s.historicalPriorityBand==='HIGH'?'yüksek':s.historicalPriorityBand==='MEDIUM'?'orta':'düşük';
  return {studentId:sid,outcomeId:chosen.id,answer:`🤖 Nibiru · Yapay Zekâ Akademik Asistanı: ${chosen.subject_name} dersindeki “${chosen.title}” kazanımında mevcut başarı oranı yaklaşık %${success}. Doğrulanmış resmî ${family} eşleştirmelerinde ${s.fromYear}–${s.toYear} arasında toplam ${s.totalQuestionCount} soru; ${s.toYear} yılında ${s.latestYearQuestionCount} soru görülmüş. Tarihsel çalışma önceliği ${band}. Bu bir soru tahmini veya garanti değildir.`};
}
