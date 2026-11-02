import { changeInstitutionLifecycle } from './lib/institution-lifecycle';
import { acceptReadableSheets, setAsideUnscorable } from './lib/result-simple-flow';
import {examOutcomePayloadSql} from './lib/exam-outcome-history';
import {publishedDefinitions} from './lib/exam-channels';
import {resultArtifactQueueDiagnostics} from './lib/result-artifact-queue';
import {startResultArtifactVerification,readResultArtifactVerification} from './lib/result-artifact-verification';
import {startResultArtifactPreparation,readResultArtifactPreparation} from './lib/result-artifact-preparation';
import type { AuthUser,Env } from './types';
import { getAuthUser,hashPassword,verifyPassword,verifyTurnstile } from './lib/auth';
import { all,audit,badRequest,forbidden,json,normalizeName,one,uuid } from './lib/db';
import { ensureSeason,evaluateBatchStep,getScanBatch,previewExamFile,resolveScanRecord,searchScanCandidates } from './index';
import { withExamOperationLock } from './lib/exam-operation-lock';
import { RESULT_NETWORK_SUMMARY_SQL, RESULT_NETWORK_SNAPSHOT_SQL, RESULT_NETWORK_ARTIFACT_ACCESS_SQL, NETWORK_INSTITUTION_SNAPSHOT_SQL, readNetworkSnapshot, snapshotSummary, snapshotDetail } from './lib/result-network-snapshot';
import { prepareResultArtifacts, readResultArtifact, inspectResultArtifactReadiness } from './lib/result-artifacts';
import { reopenNetworkResults } from './lib/result-network-correction';
import { retireResultArtifactVersions } from './lib/result-artifact-retention';
import {resultRetentionQueueDiagnostics} from './lib/result-retention-queue';
import { REPORT_SNAPSHOT_SQL } from './lib/report-snapshot';

const COOKIE='anunex_result_session';
const SIX_HOURS=6*60*60*1000;
const LOOKUP=/^[A-Za-z0-9._-]{1,40}$/;

async function sha256(value:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hmac(env:Env,value:string){const root=env.RESULT_LOOKUP_SECRET||env.SESSION_SECRET;if(!root)throw new Error('RESULT_LOOKUP_SECRET_NOT_CONFIGURED');const secret=env.RESULT_LOOKUP_SECRET||await sha256(`ANUNEX_RESULT_LOOKUP_V1|${root}`);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function secureResultCode(){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);return String(10000000+(bytes[0]%90000000))}
async function hashResultCode(env:Env,code:string){const nonce=crypto.randomUUID();return{salt:`RESULT_HMAC_V1:${nonce}`,hash:await hmac(env,`ACCESS_CODE|${nonce}|${code}`)}}
async function verifyResultCode(env:Env,code:string,salt:string,expected:string){if(!salt.startsWith('RESULT_HMAC_V1:'))return verifyPassword(code,salt,expected,100000);const nonce=salt.slice('RESULT_HMAC_V1:'.length),actual=await hmac(env,`ACCESS_CODE|${nonce}|${code}`);if(actual.length!==expected.length)return false;let different=0;for(let i=0;i<actual.length;i++)different|=actual.charCodeAt(i)^expected.charCodeAt(i);return different===0}
function rawCookie(request:Request,name:string){for(const part of (request.headers.get('cookie')||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='))}return null}
function clientIp(request:Request){return request.headers.get('CF-Connecting-IP')||'local'}
function normalizeLookup(value:unknown){return String(value||'').trim().replace(/\s+/g,'').toLocaleLowerCase('tr-TR')}
function maskName(value:string){const parts=value.trim().split(/\s+/);return parts.map(x=>x.length<2?'*':`${x[0]}${'*'.repeat(Math.min(5,x.length-1))}`).join(' ')}
function safeError(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

const DEFAULT_PORTAL_COPY={badge:'ANUNEX DOĞRULANMIŞ SONUÇ AĞI',title_line:'Sonuç yalnızca bir sayı değil.',title_emphasis:'Bir sonraki akademik rota.',subtitle:'Kurumunuz ANUNEX lisansı kullanmasa da yayınlanmış sınav sonuçlarınıza güvenle ulaşın.',license_title:'Sonucu görmek başlangıç. Gelişimi yönetmek ANUNEX.',license_text:'Optik okumadan kazanım analizine, yoklamadan kişisel öğrenme rotasına kadar kurumunuzun akademik operasyonunu tek sistemde birleştirin.',cta_label:'Kurum demosunu inceleyin',cta_url:'https://demo.anunex.com',support_phone:'05433066172'};
async function portalCopy(env:Env){try{const object=await env.FILES.get('settings/result-portal.json');if(!object)return DEFAULT_PORTAL_COPY;const stored:any=JSON.parse(await object.text());return{...DEFAULT_PORTAL_COPY,...stored}}catch{return DEFAULT_PORTAL_COPY}}
async function publicConfig(env:Env){return json({ok:true,portal:'ANUNEX_RESULT_NETWORK',turnstileSiteKey:env.TURNSTILE_SITE_KEY||'',copy:await portalCopy(env),roles:[{key:'STUDENT',label:'Öğrenci Sonuç'},{key:'INSTITUTION',label:'Kurum Sonuç'},{key:'DEALER',label:'Bayi Sonuç'}],security:{secondFactorRequired:false,tcknStored:false,aiMode:'STRUCTURED_TIPS_ONLY'}})}

async function searchInstitutions(env:Env,url:URL){
 const city=String(url.searchParams.get('city')||'').trim(),district=String(url.searchParams.get('district')||'').trim();
 if(city&&district){const rows=await all<any>(env.DB.prepare(`SELECT meb_code,name,city,district,education_level FROM national_institution_directory WHERE status='ACTIVE' AND city=? AND district=? ORDER BY name LIMIT 600`).bind(city,district));
  return json({ok:true,institutions:rows.map(x=>({code:x.meb_code,name:x.name,city:x.city,district:x.district,level:x.education_level})).sort((a,b)=>a.name.localeCompare(b.name,'tr-TR'))},200,{'Cache-Control':'public, max-age=3600'})}
 const q=normalizeName(url.searchParams.get('q')||'');if(q.length<2)return json({ok:true,institutions:[]});
 const rows=await all<any>(env.DB.prepare(`SELECT meb_code,name,city,district,education_level FROM national_institution_directory WHERE status='ACTIVE' AND (normalized_name LIKE ? OR meb_code LIKE ?) ORDER BY CASE WHEN meb_code=? THEN 0 ELSE 1 END,name LIMIT 20`).bind(`%${q}%`,`${q}%`,q));
 return json({ok:true,institutions:rows.map(x=>({code:x.meb_code,name:x.name,city:x.city,district:x.district,level:x.education_level}))});
}

async function lookup(request:Request,env:Env){
 const body:any=await request.json().catch(()=>({}));const ip=clientIp(request);const turnstile=await verifyTurnstile(env,body.turnstileToken,ip);if(!turnstile.ok)return badRequest('Robot doğrulaması tamamlanamadı.',turnstile.error||'TURNSTILE_FAILED');
 const institutionCode=String(body.institutionCode||'').trim(),grade=Number(body.gradeLevel),name=normalizeName(String(body.fullName||''));const kind=body.lookupType==='TCKN'?'TCKN':'STUDENT_NUMBER';const value=normalizeLookup(body.lookupValue);
 if(!/^\d{5,12}$/.test(institutionCode)||!Number.isInteger(grade)||grade<1||grade>12||name.length<3||!LOOKUP.test(value))return badRequest('Kurum, sınıf düzeyi, ad soyad ve arama bilgisi eksiksiz girilmelidir.');
 const token=await hmac(env,`${kind}|${institutionCode}|${value}`);const column=kind==='TCKN'?'rai.tckn_lookup_token':'rai.student_number_lookup_token';
 const identity=await one<any>(env.DB.prepare(`SELECT rai.id,rai.normalized_name,rni.display_name_snapshot,ea.exam_id,e.title,e.exam_date FROM result_access_identities rai JOIN result_network_institutions rni ON rni.id=rai.result_institution_id JOIN exam_administrations ea ON ea.id=rai.administration_id JOIN exams e ON e.id=ea.exam_id WHERE rni.meb_code=? AND rai.grade_level=? AND ${column}=? AND rai.normalized_name=? AND rai.expires_at>CURRENT_TIMESTAMP AND (rai.locked_until IS NULL OR rai.locked_until<CURRENT_TIMESTAMP) AND ea.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM exam_channel_publications pub WHERE pub.exam_id=ea.exam_id AND pub.channel='RESULT_NETWORK' AND pub.status<>'ACTIVE') ORDER BY ea.published_at DESC LIMIT 1`).bind(institutionCode,grade,token,name));
 // Identical response shape prevents account enumeration.
 if(!identity)return json({ok:true,found:false,message:'Bilgiler eşleşirse kişisel doğrulama adımı açılır.'});
 await publishedDefinitions(env,[identity]);
 const challengeId=uuid('rch'),ipHash=await sha256(ip);await env.DB.prepare(`INSERT INTO result_lookup_challenges(id,identity_id,ip_hash,expires_at) VALUES(?,?,?,datetime('now','+10 minutes'))`).bind(challengeId,identity.id,ipHash).run();
 return json({ok:true,found:true,challengeId,student:maskName(identity.normalized_name),institution:identity.display_name_snapshot,latestExam:identity.title});
}

async function verify(request:Request,env:Env){
 const body:any=await request.json().catch(()=>({}));const challengeId=String(body.challengeId||''),code=String(body.accessCode||'').replace(/\s/g,'');if(!challengeId||!/^[A-Za-z0-9]{6,12}$/.test(code))return badRequest('Doğrulama kodu geçersiz.');
 const ipHash=await sha256(clientIp(request));
 // S002: every guess is counted atomically before the code is checked, so parallel guesses can neither exceed the
 // per-challenge limit nor dodge the identity lock; a locked identity cannot keep guessing on an older challenge.
 const claim=await env.DB.prepare(`UPDATE result_lookup_challenges SET attempts=attempts+1 WHERE id=? AND ip_hash=? AND verified_at IS NULL AND attempts<5 AND datetime(expires_at)>CURRENT_TIMESTAMP
  AND EXISTS(SELECT 1 FROM result_access_identities i WHERE i.id=result_lookup_challenges.identity_id AND (i.locked_until IS NULL OR datetime(i.locked_until)<=CURRENT_TIMESTAMP))`).bind(challengeId,ipHash).run();
 if(Number((claim as any)?.meta?.changes||0)!==1)return safeError(401,'CHALLENGE_EXPIRED','Doğrulama süresi doldu; yeniden arama yapın.');
 const row=await one<any>(env.DB.prepare(`SELECT c.identity_id,i.access_code_hash,i.access_code_salt FROM result_lookup_challenges c JOIN result_access_identities i ON i.id=c.identity_id WHERE c.id=?`).bind(challengeId));
 if(!row)return safeError(401,'CHALLENGE_EXPIRED','Doğrulama süresi doldu; yeniden arama yapın.');
 const ok=await verifyResultCode(env,code,row.access_code_salt,row.access_code_hash);if(!ok){await env.DB.prepare(`UPDATE result_access_identities SET failed_attempts=COALESCE(failed_attempts,0)+1,locked_until=CASE WHEN COALESCE(failed_attempts,0)+1>=8 THEN datetime('now','+15 minutes') ELSE locked_until END WHERE id=?`).bind(row.identity_id).run();return safeError(401,'VERIFICATION_FAILED','Doğrulama bilgisi eşleşmedi.');}
 const done=await env.DB.prepare(`UPDATE result_lookup_challenges SET verified_at=CURRENT_TIMESTAMP WHERE id=? AND verified_at IS NULL`).bind(challengeId).run();
 if(Number((done as any)?.meta?.changes||0)!==1)return safeError(401,'CHALLENGE_EXPIRED','Doğrulama süresi doldu; yeniden arama yapın.');
 return openStudentSession(env,row.identity_id,ipHash);
}

async function openStudentSession(env:Env,identityId:string,ipHash:string){
 const raw=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha256(raw),sessionId=uuid('rses'),expires=new Date(Date.now()+SIX_HOURS).toISOString();await env.DB.batch([env.DB.prepare(`UPDATE result_access_identities SET failed_attempts=0,locked_until=NULL WHERE id=?`).bind(identityId),env.DB.prepare(`INSERT INTO result_portal_sessions(id,identity_id,token_hash,ip_hash,expires_at) VALUES(?,?,?,?,?)`).bind(sessionId,identityId,tokenHash,ipHash,expires)]);
 const secure=env.ENVIRONMENT==='production'?'; Secure':'';return json({ok:true},200,{'Set-Cookie':`${COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SIX_HOURS/1000}${secure}`});
}

/** First three letters of a name as the student types them, compared the way stored names are normalized
 * ("Melis", "MEL", "mel" all give "mel"; spaces are ignored so a short first name still has three letters). */
export function namePrefix(value:string){return normalizeName(value).replace(/[^a-z]/g,'').slice(0,3)}

/**
 * Student sign-in on sonuc (D-S038, owner 28 Oct): il › ilçe › kurum, sınıf düzeyi, öğrenci no (or TCKN) and the first
 * three letters of the name. No access code: the app's own student login is separate and unchanged.
 * Guessing is held back by the robot check, 20 misses per IP and 8 misses per student number in 15 minutes, and every
 * miss answers the same way, so whether a student exists is never told; only "nothing published yet" is, per school.
 */
const RESULT_LOGIN_WINDOW=`datetime('now','-15 minutes')`;
async function loginMisses(env:Env,key:string){const r=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM login_attempts WHERE identifier_hash=? AND success=0 AND created_at>=${RESULT_LOGIN_WINDOW}`).bind(await sha256(key)));return Number(r?.c||0)}
async function recordLogin(env:Env,keys:string[],ok:boolean,ipHash:string){await env.DB.batch(await Promise.all(keys.map(async k=>env.DB.prepare('INSERT INTO login_attempts (id,identifier_hash,success,ip_hash) VALUES (?,?,?,?)').bind(uuid('log'),await sha256(k),ok?1:0,ipHash))))}
async function studentLogin(request:Request,env:Env){
 const body:any=await request.json().catch(()=>({}));const ip=clientIp(request);
 const turnstile=await verifyTurnstile(env,body.turnstileToken,ip);if(!turnstile.ok)return badRequest('Robot doğrulaması tamamlanamadı.',turnstile.error||'TURNSTILE_FAILED');
 const institutionCode=String(body.institutionCode||'').trim(),grade=Number(body.gradeLevel),prefix=namePrefix(String(body.namePrefix||'')),kind=body.lookupType==='TCKN'?'TCKN':'STUDENT_NUMBER',value=normalizeLookup(body.lookupValue);
 if(!/^\d{5,12}$/.test(institutionCode)||!Number.isInteger(grade)||grade<1||grade>12||prefix.length<3||!LOOKUP.test(value))return badRequest('Kurum, sınıf düzeyi, numara ve adınızın ilk 3 harfi eksiksiz girilmelidir.');
 const ipHash=await sha256(ip),ipKey=`RESULT_LOGIN_IP|${ipHash}`,studentKey=`RESULT_LOGIN_STUDENT|${institutionCode}|${kind}|${value}`;
 if(await loginMisses(env,ipKey)>=20)return safeError(429,'LOGIN_RATE_LIMITED','Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.');
 const published=await one<any>(env.DB.prepare(`SELECT 1 x FROM result_network_institutions rni JOIN exam_administrations ea ON ea.id=rni.administration_id WHERE rni.meb_code=? AND ea.status='PUBLISHED' LIMIT 1`).bind(institutionCode));
 if(!published)return json({ok:true,found:false,reason:'NOT_PUBLISHED',message:'Kurumunuz için henüz yayınlanmış sonuç yok. Sonuçlar yayınlandığında burada açılır.'});
 const fail=async()=>{await recordLogin(env,[ipKey,studentKey],false,ipHash);return safeError(401,'LOGIN_NOT_MATCHED','Bilgiler eşleşmedi. Kurum, sınıf, numara ve adınızın ilk 3 harfini kontrol edin.')};
 if(await loginMisses(env,studentKey)>=8)return fail();
 const token=await hmac(env,`${kind}|${institutionCode}|${value}`);const column=kind==='TCKN'?'rai.tckn_lookup_token':'rai.student_number_lookup_token';
 const candidates=await all<any>(env.DB.prepare(`SELECT rai.id,rai.normalized_name FROM result_access_identities rai JOIN result_network_institutions rni ON rni.id=rai.result_institution_id JOIN exam_administrations ea ON ea.id=rai.administration_id WHERE rni.meb_code=? AND rai.grade_level=? AND ${column}=? AND rai.expires_at>CURRENT_TIMESTAMP AND ea.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM exam_channel_publications pub WHERE pub.exam_id=ea.exam_id AND pub.channel='RESULT_NETWORK' AND pub.status<>'ACTIVE') ORDER BY ea.published_at DESC LIMIT 10`).bind(institutionCode,grade,token));
 const matches=candidates.filter(c=>namePrefix(c.normalized_name)===prefix);
 if(!matches.length)return fail();
 // Two different students can share a school, grade, number and the first 3 letters (e.g. two "Mehmet"s from different
 // files). Then the full name decides; the first row is never opened on a guess.
 const compact=(v:string)=>normalizeName(v).replace(/[^a-z]/g,'');
 let match=matches[0];
 if(new Set(matches.map(c=>compact(c.normalized_name))).size>1){
  const full=compact(String(body.fullName||''));
  if(!full)return json({ok:false,error:{code:'FULL_NAME_REQUIRED',message:'Bu numarada aynı harflerle başlayan birden fazla öğrenci var. Adınızı ve soyadınızı tam yazın.'}},409);
  const exact=matches.find(c=>compact(c.normalized_name)===full);
  if(!exact)return fail();
  match=exact;
 }
 await recordLogin(env,[studentKey],true,ipHash);
 return openStudentSession(env,match.id,ipHash);
}

/** Il and ilçe lists for the student form, from the MEB directory (cached; it changes rarely). */
async function locations(env:Env,url:URL){
 const city=String(url.searchParams.get('city')||'').trim();
 const rows=city?await all<any>(env.DB.prepare(`SELECT DISTINCT district v FROM national_institution_directory WHERE status='ACTIVE' AND city=? AND district<>'' ORDER BY district`).bind(city))
  :await all<any>(env.DB.prepare(`SELECT DISTINCT city v FROM national_institution_directory WHERE status='ACTIVE' AND city<>'' ORDER BY city`));
 const list=rows.map(r=>String(r.v)).sort((a,b)=>a.localeCompare(b,'tr-TR'));
 return json({ok:true,[city?'districts':'cities']:list},200,{'Cache-Control':'public, max-age=3600'});
}

export async function resultIdentity(request:Request,env:Env){const raw=rawCookie(request,COOKIE);if(!raw)return null;const tokenHash=await sha256(raw),ipHash=await sha256(clientIp(request));return one<any>(env.DB.prepare(`SELECT rai.id,rai.normalized_name,rai.grade_level,rai.student_number_lookup_token,rai.tckn_lookup_token,rni.meb_code,rni.display_name_snapshot FROM result_portal_sessions s JOIN result_access_identities rai ON rai.id=s.identity_id JOIN result_network_institutions rni ON rni.id=rai.result_institution_id WHERE s.token_hash=? AND s.ip_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND rai.expires_at>CURRENT_TIMESTAMP`).bind(tokenHash,ipHash))}

async function studentLogout(request:Request,env:Env){const raw=rawCookie(request,COOKIE);if(raw)await env.DB.prepare(`UPDATE result_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL`).bind(await sha256(raw)).run();const secure=env.ENVIRONMENT==='production'?'; Secure':'';return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,'Cache-Control':'no-store'})}
async function studentResults(request:Request,env:Env){
 const identity=await resultIdentity(request,env);if(!identity)return safeError(401,'RESULT_SESSION_REQUIRED','Sonucunuzu yeniden doğrulayın.');
 const rows=await all<any>(env.DB.prepare(RESULT_NETWORK_SUMMARY_SQL+` ORDER BY ea.published_at DESC,ea.id LIMIT 50`).bind(identity.meb_code,identity.normalized_name,identity.grade_level,identity.student_number_lookup_token||'',identity.student_number_lookup_token||'',identity.tckn_lookup_token||'',identity.tckn_lookup_token||''));
 await publishedDefinitions(env,rows);
 const exams=rows.map(snapshotSummary).filter((row):row is NonNullable<typeof row>=>row!==null);
 exams.sort((a,b)=>String(b.exam_date||'').localeCompare(String(a.exam_date||'')));
 const unavailableSnapshotExamIds=rows.filter(row=>!readNetworkSnapshot(row.payload_json)).map(row=>row.exam_id);
 const latest=exams[0]||null;
 return json({ok:true,student:{name:maskName(identity.normalized_name),gradeLevel:identity.grade_level,institution:identity.display_name_snapshot},countdown:await (await import('./lib/national-exam-dates')).countdownForGrade(env,identity.grade_level),exams,unavailableSnapshotExamIds,tips:latest?[`${latest.exam_type} sonuçlarında ${Number(latest.net).toLocaleString('tr-TR')} net yaptın.`,`Yanlışlarını kazanım ve soru bazında inceleyerek bir sonraki çalışma adımını seç.`]:[]});
}

async function examDetail(request:Request,env:Env,examId:string){
 const identity=await resultIdentity(request,env);if(!identity)return safeError(401,'RESULT_SESSION_REQUIRED','Sonucunuzu yeniden doğrulayın.');
 const parameters=[identity.meb_code,identity.normalized_name,identity.grade_level,identity.student_number_lookup_token||'',identity.student_number_lookup_token||'',identity.tckn_lookup_token||'',identity.tckn_lookup_token||'',examId];
 let artifact:any=null;let peer:any=null;
 if(env.RESULT_ARTIFACT_READS_ENABLED==='true'&&env.RESULT_FILES){
  peer=await one<any>(env.DB.prepare(RESULT_NETWORK_ARTIFACT_ACCESS_SQL+` AND ea.exam_id=? LIMIT 1`).bind(...parameters));
  if(!peer)return safeError(404,'RESULT_NOT_FOUND','Sınav sonucu bulunamadı.');
  try{artifact=await readResultArtifact(env.RESULT_FILES,peer)}catch{return safeError(503,'RESULT_ARTIFACT_UNAVAILABLE','Sonuç dosyası doğrulanamadı. Lütfen tekrar deneyin.')}
 }
 let payload:any;
 if(artifact){payload={wrongQuestionIds:artifact.wrongQuestionIds}}else{
  // A missing artifact falls back to a freshly authorized immutable snapshot.
  peer=await one<any>(env.DB.prepare(RESULT_NETWORK_SNAPSHOT_SQL.replace('SELECT s.*,ea.exam_id',`SELECT s.*,${examOutcomePayloadSql('s','RESULT')} payload_json,ea.exam_id`)+` AND ea.exam_id=? LIMIT 1`).bind(...parameters));
  if(!peer)return safeError(404,'RESULT_NOT_FOUND','Sınav sonucu bulunamadı.');
  payload=readNetworkSnapshot(peer.payload_json);if(!payload)return safeError(409,'RESULT_SNAPSHOT_UNAVAILABLE','Bu yayının sabit sonuç kaydı bulunmuyor. Kurumunuzla iletişime geçin.');
 }
 if(artifact){
  // Read only the published outcome delta, keeping the private score artifact intact.
  const analysis=await one<any>(env.DB.prepare(`SELECT h.payload_json FROM exam_outcome_analysis_history h JOIN exam_outcome_analysis_revisions r ON r.exam_id=h.exam_id AND r.revision=h.revision JOIN exam_result_snapshots s ON s.exam_id=h.exam_id AND s.participant_id=h.participant_id AND s.institution_id=h.institution_id AND s.student_id IS h.student_id AND s.grade_level IS h.grade_level AND json_extract(s.payload_json,'$.exam.academic_year')=h.academic_year WHERE h.exam_id=? AND h.participant_id=? AND h.institution_id=? AND s.snapshot_version=? AND r.published_result_at IS NOT NULL ORDER BY h.revision DESC LIMIT 1`).bind(examId,peer.participant_id,peer.institution_id,peer.snapshot_version));
  if(analysis){const delta=JSON.parse(analysis.payload_json);payload={...payload,...delta};artifact.detail={...artifact.detail,outcomes:snapshotDetail({subjects:[],outcomes:delta.outcomes}).outcomes};}
  payload.exam=artifact.summary;
 }
 const definitionRow={exam_id:examId,payload_json:JSON.stringify(payload)};await publishedDefinitions(env,[definitionRow]);payload=JSON.parse(definitionRow.payload_json);
 const rawDetail=artifact?artifact.detail:snapshotDetail(payload);
 // S010: only outcomes of a verified curriculum are shown; when none remain the reason is stated, never an empty list.
 const ids=[...new Set((rawDetail.outcomes||[]).map((o:any)=>o.outcome_id).filter((x:any)=>typeof x==='string'))] as string[];
 const verified=ids.length?new Set((await all<any>(env.DB.prepare(`SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids))).map(r=>r.id)):new Set<string>();
 const outcomes=(rawDetail.outcomes||[]).filter((o:any)=>verified.has(o.outcome_id));
 const outcomesStatus=outcomes.length?'AVAILABLE':(rawDetail.outcomes||[]).length?'NOT_VERIFIED':'NO_OUTCOME_DATA';
 const detail={...rawDetail,outcomes,outcomesStatus};
 // Video approval can be withdrawn, but question selection is frozen evidence.
 // S011: same servable rule as the app (A067: approved, published, not broken) plus learner visibility and https only.
 const videos=Array.isArray(payload.wrongQuestionIds)?await all<any>(env.DB.prepare(`SELECT DISTINCT vl.title,vl.url,vl.link_type,q.question_no FROM exam_questions q JOIN video_links vl ON vl.exam_question_id=q.id AND vl.approved=1 AND (vl.status='PUBLISHED' OR vl.status IS NULL) AND (vl.publish_at IS NULL OR datetime(vl.publish_at)<=CURRENT_TIMESTAMP) AND COALESCE(vl.link_status,'UNKNOWN')<>'BROKEN' AND vl.visibility IN ('STUDENT_TEACHER','PUBLIC') AND vl.url LIKE 'https://%' AND (vl.exam_id IS NULL OR vl.exam_id=q.exam_id) WHERE q.exam_id=? AND q.id IN(SELECT value FROM json_each(?)) ORDER BY q.question_no LIMIT 50`).bind(examId,JSON.stringify(payload.wrongQuestionIds))):[];
 return json({ok:true,...detail,exam:payload.exam,outcomeAnalysisRevision:payload.outcomeAnalysisRevision||null,outcomeAnalysisUpdatedAt:payload.outcomeAnalysisUpdatedAt||null,videos,snapshotVersion:peer.snapshot_version,resultSource:artifact?'PRIVATE_ARTIFACT':'PUBLISHED_SNAPSHOT',videoEvidenceUnavailable:!Array.isArray(payload.wrongQuestionIds)});
}

async function requireSuper(request:Request,env:Env):Promise<AuthUser|Response>{const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();return user}
async function operatorAccessProfile(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const dealer=await one<any>(env.DB.prepare(`SELECT d.id,d.status,d.display_name,(SELECT count(*) FROM result_network_dealer_scopes s WHERE s.dealer_id=d.id AND s.active=1) scope_count FROM result_network_dealers d WHERE d.user_id=? LIMIT 1`).bind(user.id));
 const approvedDealer=dealer?.status==='APPROVED'&&Number(dealer.scope_count||0)>0;
 const institution=user.institution_id?await one<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,COALESCE(iac.lifecycle_status,i.status) lifecycle_status FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=?`).bind(user.institution_id)):null;
 const activeInstitutionManager=user.role==='INSTITUTION_MANAGER'&&institution?.lifecycle_status==='ACTIVE';
 return json({ok:true,user,access:{canManageNetwork:user.role==='SUPER_ADMIN',canManageInstitution:user.role==='SUPER_ADMIN'||activeInstitutionManager,canOperateDealer:user.role==='SUPER_ADMIN'||approvedDealer,institution:institution?{id:institution.id,name:institution.name,code:institution.code,status:institution.lifecycle_status}:null,dealer:dealer?{id:dealer.id,status:dealer.status,displayName:dealer.display_name,scopeCount:Number(dealer.scope_count||0)}:null}});
}
async function updatePortalCopy(request:Request,env:Env,user:AuthUser){const body:any=await request.json().catch(()=>({}));const clean=(key:string,max:number)=>String(body[key]??'').trim().slice(0,max);const next={badge:clean('badge',70),title_line:clean('title_line',100),title_emphasis:clean('title_emphasis',100),subtitle:clean('subtitle',280),license_title:clean('license_title',140),license_text:clean('license_text',360),cta_label:clean('cta_label',70),cta_url:clean('cta_url',240),support_phone:clean('support_phone',24),updated_at:new Date().toISOString(),updated_by:user.id};if(Object.entries(next).some(([key,value])=>!['support_phone','updated_at','updated_by'].includes(key)&&!value)||!/^https:\/\/(demo|app)\.anunex\.com(?:\/|$)/.test(next.cta_url))return badRequest('Tüm portal metinleri zorunludur; çağrı bağlantısı yalnız demo.anunex.com veya app.anunex.com olabilir.');await env.FILES.put('settings/result-portal.json',JSON.stringify(next),{httpMetadata:{contentType:'application/json'},customMetadata:{updatedBy:user.id,scope:'RESULT_PORTAL_BRAND'}});return json({ok:true,copy:next})}
async function importInstitutionDirectory(request:Request,env:Env,user:AuthUser){const body:any=await request.json().catch(()=>({})),rows=Array.isArray(body.rows)?body.rows:[],sourceUrl=String(body.sourceUrl||'').trim(),sourceType=String(body.sourceType||'MEB_OFFICIAL_EXPORT');if(!['MEB_OFFICIAL_EXPORT','MEB_PUBLIC_DIRECTORY','MANUAL_VERIFIED'].includes(sourceType))return badRequest('Kaynak türü geçersiz.','DIRECTORY_SOURCE_INVALID');if(!/^https:\/\//.test(sourceUrl))return badRequest('Kaynak adresi https:// ile başlamalı.','DIRECTORY_SOURCE_URL_REQUIRED');if(!rows.length||rows.length>5000)return badRequest('Her istekte 1–5000 kurum satırı gönderilmeli.','DIRECTORY_ROWS_INVALID');const syncId=uuid('idsync'),statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO institution_directory_sync_runs(id,source_type,source_url,status,rows_seen,created_by) VALUES(?,?,?,'RUNNING',?,?)`).bind(syncId,sourceType,sourceUrl,rows.length,user.id)];let valid=0;for(const row of rows){const code=String(row.mebCode||'').trim(),name=String(row.name||'').trim(),city=String(row.city||'').trim(),district=String(row.district||'').trim();if(!/^\d{5,12}$/.test(code)||!name||!city||!district)continue;valid++;statements.push(env.DB.prepare(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,institution_type,ownership,education_level,official_url,source_url,source_updated_at,status,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',CURRENT_TIMESTAMP) ON CONFLICT(meb_code) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,city=excluded.city,district=excluded.district,institution_type=excluded.institution_type,ownership=excluded.ownership,education_level=excluded.education_level,official_url=excluded.official_url,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,status='ACTIVE',synced_at=CURRENT_TIMESTAMP`).bind(code,name,normalizeName(name),city,district,row.institutionType||null,['PUBLIC','PRIVATE'].includes(row.ownership)?row.ownership:null,row.educationLevel||null,row.officialUrl||null,sourceUrl,body.sourceUpdatedAt||null))}try{for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80))}catch(error){console.error(JSON.stringify({event:'directory_import_failed',syncId,error:error instanceof Error?error.message:String(error)}));await env.DB.prepare(`UPDATE institution_directory_sync_runs SET status='FAILED',completed_at=CURRENT_TIMESTAMP,summary_json=? WHERE id=?`).bind(JSON.stringify({error:'WRITE_FAILED'}),syncId).run().catch(()=>undefined);return safeError(503,'DIRECTORY_IMPORT_FAILED','Bu kurum paketi kaydedilemedi. Paket güvenle yeniden gönderilebilir; kayıtlar kopyalanmaz.')}await env.DB.prepare(`UPDATE institution_directory_sync_runs SET status='COMPLETED',rows_upserted=?,completed_at=CURRENT_TIMESTAMP,summary_json=? WHERE id=?`).bind(valid,JSON.stringify({invalid:rows.length-valid}),syncId).run();await audit(env.DB,user.id,null,'NATIONAL_INSTITUTION_DIRECTORY_SYNCED','directory_sync',syncId,{sourceType,rowsSeen:rows.length,rowsUpserted:valid});return json({ok:true,syncId,rowsSeen:rows.length,rowsUpserted:valid,invalid:rows.length-valid},201)}
async function createAdministration(request:Request,env:Env,user:AuthUser){const body:any=await request.json().catch(()=>({})),examId=String(body.examId||'');const exam=await one<any>(env.DB.prepare(`SELECT id,academic_year,title FROM exams WHERE id=?`).bind(examId));if(!exam)return safeError(404,'EXAM_NOT_FOUND','Tanımlı sınav bulunamadı.');const id=uuid('eadm');await env.DB.prepare(`INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,created_by) VALUES(?,?,?,'RESULT_NETWORK','DRAFT',?)`).bind(id,exam.id,exam.academic_year,user.id).run();await audit(env.DB,user.id,null,'RESULT_ADMINISTRATION_CREATED','exam_administration',id,{examId,title:exam.title});return json({ok:true,id,examId,academicYear:exam.academic_year,status:'DRAFT'},201)}
async function listAdministrations(env:Env){const [rows,directory]=await Promise.all([all<any>(env.DB.prepare(`SELECT ea.*,e.title,e.exam_type,e.publisher_name,(SELECT count(*) FROM result_network_institutions rni WHERE rni.administration_id=ea.id) linked_institutions,(SELECT count(*) FROM result_access_identities rai WHERE rai.administration_id=ea.id) access_count,(SELECT count(*) FROM result_access_identities rai JOIN exam_results er ON er.participant_id=rai.participant_id WHERE rai.administration_id=ea.id) result_count FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.channel='RESULT_NETWORK' ORDER BY ea.created_at DESC LIMIT 200`)),one<{count:number}>(env.DB.prepare(`SELECT count(*) count FROM national_institution_directory WHERE status='ACTIVE'`))]);return json({ok:true,administrations:rows,directoryCount:Number(directory?.count||0)})}
async function publishAdministration(request:Request,env:Env,user:AuthUser,id:string){
 const row=await one<any>(env.DB.prepare(`SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'`).bind(id));
 if(!row)return safeError(404,'ADMINISTRATION_NOT_FOUND','Sınav yönetimi bulunamadı.');
 return withExamOperationLock(env,row.exam_id,'RESULT_NETWORK_OPEN',async(env)=>{
  const current=await one<any>(env.DB.prepare(`SELECT status FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'`).bind(id));
  if(current?.status!=='DRAFT')return safeError(409,'RESULT_PUBLICATION_STATE_CHANGED','Yalnız taslak sınav değerlendirmeye açılabilir.');
  const pubs=['MARKETING','LICENSED','DEMO','RESULT_NETWORK'];
  await env.DB.batch([
   env.DB.prepare(`UPDATE exam_administrations SET status='UPLOADING' WHERE id=? AND status='DRAFT'`).bind(id),
   ...pubs.map(channel=>env.DB.prepare(`INSERT INTO exam_channel_publications(id,exam_id,channel,status,source_administration_id,published_by,published_at) VALUES(?,?,?,'ACTIVE',?,?,CURRENT_TIMESTAMP) ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE',source_administration_id=excluded.source_administration_id,published_by=excluded.published_by,published_at=CURRENT_TIMESTAMP`).bind(uuid('ecp'),row.exam_id,channel,id,user.id)),
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ADMINISTRATION_OPENED','exam_administration',?,?)`).bind(uuid('aud'),user.id,id,JSON.stringify({sharedChannels:pubs})),
  ]);
  return json({ok:true,id,status:'UPLOADING',sharedChannels:pubs});
 });
}
export async function issueAccess(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return safeError(403,'FORBIDDEN','Bu işlem için yetkiniz yok.');
 const body:any=await request.json().catch(()=>({}));const administrationId=String(body.administrationId||''),participantId=String(body.participantId||''),mebCode=String(body.mebCode||''),studentNumber=normalizeLookup(body.studentNumber),tckn=normalizeLookup(body.tckn),grade=Number(body.gradeLevel),fullName=normalizeName(String(body.fullName||''));if(!administrationId||!participantId||!mebCode||!fullName||(!studentNumber&&!tckn))return badRequest('Yönetim, katılımcı, MEB kodu, öğrenci ve arama anahtarı zorunludur.');
 const directory=await one<any>(env.DB.prepare(`SELECT * FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(mebCode));if(!directory)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','MEB referans kurum kaydı bulunamadı.');
 let administration=await one<any>(env.DB.prepare(`SELECT ea.*,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.id=? AND ea.channel='RESULT_NETWORK'`).bind(administrationId));if(!administration)return safeError(404,'ADMINISTRATION_NOT_FOUND','Sonuç ağı sınav yönetimi bulunamadı.');
 return withExamOperationLock(env,administration.exam_id,'RESULT_ACCESS_ISSUE',async(env)=>{
 administration=await one<any>(env.DB.prepare(`SELECT ea.*,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.id=? AND ea.channel='RESULT_NETWORK'`).bind(administrationId));
 if(!administration||!['DRAFT','UPLOADING','READY','PUBLISHED'].includes(administration.status))return safeError(409,'RESULT_PUBLICATION_STATE_CHANGED','Sonuç yönetimi erişim kaydı için uygun değil.');
 const participant=await one<any>(env.DB.prepare(`SELECT ep.id FROM exam_participants ep JOIN institutions i ON i.id=ep.institution_id WHERE ep.id=? AND ep.exam_id=? AND i.code=?`).bind(participantId,administration.exam_id,mebCode));
 if(!participant)return safeError(409,'RESULT_ACCESS_SCOPE_INVALID','Öğrenci sınav ve kurum kapsamıyla eşleşmiyor.');
 if(administration.status==='PUBLISHED'){
  const existing=await one<any>(env.DB.prepare(`SELECT rai.participant_id FROM result_access_identities rai JOIN exam_result_snapshots s ON s.participant_id=rai.participant_id AND s.exam_id=? AND s.snapshot_version=? WHERE rai.administration_id=? AND rai.participant_id=?`).bind(administration.exam_id,administration.published_snapshot_version,administrationId,participantId));
  if(!existing)return safeError(409,'RESULT_COHORT_FROZEN','Yayınlanmış sınava yeni öğrenci erişimi eklenemez. Önce sonuçları düzeltmeye açın.');
 }
 const institutionId=uuid('rni');const institutionWrite=env.DB.prepare(`INSERT INTO result_network_institutions(id,administration_id,meb_code,display_name_snapshot,city_snapshot,district_snapshot) VALUES(?,?,?,?,?,?) ON CONFLICT(administration_id,meb_code) DO UPDATE SET display_name_snapshot=excluded.display_name_snapshot`).bind(institutionId,administrationId,mebCode,directory.name,directory.city,directory.district);const institution=await one<any>(env.DB.prepare(`SELECT id FROM result_network_institutions WHERE administration_id=? AND meb_code=?`).bind(administrationId,mebCode))||{id:institutionId};
 const code=secureResultCode(),password=await hashResultCode(env,code);const academicEnd=Number(String(administration.academic_year).slice(0,4))+1;const defaultDue=new Date(`${academicEnd}-09-30T23:59:59.000Z`);const published=administration.published_at?new Date(new Date(administration.published_at).getTime()+90*86400000):defaultDue;const expires=(published>defaultDue?published:defaultDue).toISOString();
 const studentToken=studentNumber?await hmac(env,`STUDENT_NUMBER|${mebCode}|${studentNumber}`):null,tcknToken=tckn?await hmac(env,`TCKN|${mebCode}|${tckn}`):null,id=uuid('rai');const identityWrite=env.DB.prepare(`INSERT INTO result_access_identities(id,administration_id,result_institution_id,participant_id,grade_level,normalized_name,student_number_lookup_token,tckn_lookup_token,access_code_hash,access_code_salt,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(administration_id,participant_id) DO UPDATE SET result_institution_id=excluded.result_institution_id,grade_level=excluded.grade_level,normalized_name=excluded.normalized_name,student_number_lookup_token=excluded.student_number_lookup_token,tckn_lookup_token=excluded.tckn_lookup_token,access_code_hash=excluded.access_code_hash,access_code_salt=excluded.access_code_salt,expires_at=excluded.expires_at`).bind(id,administrationId,institution.id,participantId,grade,fullName,studentToken,tcknToken,password.hash,password.salt,expires);// S005: a re-issued code replaces the old one completely — open portal sessions and unfinished searches of this
 // student end, so a leaked or lost code stops working at once.
 const sameIdentity=`(SELECT id FROM result_access_identities WHERE administration_id=? AND participant_id=?)`;
 const endSessions=env.DB.prepare(`UPDATE result_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE identity_id=${sameIdentity} AND revoked_at IS NULL`).bind(administrationId,participantId);
 const endSearches=env.DB.prepare(`DELETE FROM result_lookup_challenges WHERE identity_id=${sameIdentity} AND verified_at IS NULL`).bind(administrationId,participantId);
 await env.DB.batch([institutionWrite,identityWrite,endSessions,endSearches,env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ACCESS_ISSUED','exam_participant',?,?)`).bind(uuid('aud'),user.id,participantId,JSON.stringify({administrationId,mebCode,expiresAt:expires}))]);return json({ok:true,accessCode:code,expiresAt:expires,oneTimeDisplay:true},201);
 });
}

export async function freezeAndPublishAdministration(request:Request,env:Env,user:AuthUser,id:string){
 const row=await one<any>(env.DB.prepare(`SELECT ea.*,e.id exam_id,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.id=? AND ea.channel='RESULT_NETWORK'`).bind(id));
 if(!row)return safeError(404,'ADMINISTRATION_NOT_FOUND','Sınav yönetimi bulunamadı.');
 return withExamOperationLock(env,row.exam_id,'RESULT_NETWORK_FREEZE',async(env)=>publishInLock(env,id,user.id,false));
}

/**
 * Writes a publication: ranks over every student with result access, the report snapshot and the counts.
 * D-S037 (owner, 28 Oct): published ranks are live. A later upload adds its students and the publication is written
 * again as a new snapshot version (`live`), so everyone's Türkiye / il / ilçe rank is current. The first publication
 * keeps its date; later ones only move the version.
 */
async function publishInLock(env:Env,id:string,actorId:string|null,live:boolean):Promise<Response>{
 let row=await one<any>(env.DB.prepare(`SELECT ea.*,e.id exam_id,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.id=? AND ea.channel='RESULT_NETWORK'`).bind(id));
 if(!row||(live?row.status!=='PUBLISHED':!['UPLOADING','READY'].includes(row.status)))return badRequest('Sonuç yayını için yönetim hazır olmalıdır. Mevcut yayın yeniden dondurulamaz.','RESULT_PUBLICATION_STATE_CHANGED');
 const incomplete=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM scan_batches sb WHERE sb.exam_id=? AND sb.status<>'COMMITTED' AND NOT EXISTS(SELECT 1 FROM scan_batch_deletions del WHERE del.batch_id=sb.id) AND (EXISTS (SELECT 1 FROM scan_evaluation_progress progress WHERE progress.batch_id=sb.id)${live?'':" OR EXISTS(SELECT 1 FROM scan_records sr WHERE sr.batch_id=sb.id AND sr.resolution_status<>'CANCELLED')"})`).bind(row.exam_id));
 // live: an upload not yet evaluated joins at its own evaluation; only one half-written stops the refresh
 if(Number(incomplete?.c||0))return badRequest('Başlamış değerlendirme tamamlanmadan sonuçlar dondurulamaz.','EVALUATION_INCOMPLETE');
 // Every issued identity must have an evaluated participant in this exam and
 // an institution included by the snapshot query. Do not silently publish a
 // partial cohort by allowing INNER JOINs to drop incomplete identities.
 const missing=await one<any>(env.DB.prepare(`SELECT 1 missing FROM result_access_identities rai
 WHERE rai.administration_id=? AND NOT EXISTS(
 SELECT 1 FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id
 JOIN institutions i ON i.id=ep.institution_id
 WHERE er.participant_id=rai.participant_id AND ep.exam_id=?) LIMIT 1`).bind(id,row.exam_id));
 if(missing)return badRequest('Erişim kaydı bulunan bazı öğrencilerin sınava ait değerlendirilmiş sonucu veya kurum kaydı eksik. Eksik kayıtları tamamlayın.','RESULT_COHORT_INCOMPLETE');
 const totals=await one<any>(env.DB.prepare(`SELECT COUNT(*) participant_count,COUNT(DISTINCT ep.institution_id) institution_count FROM result_access_identities rai JOIN exam_results er ON er.participant_id=rai.participant_id JOIN exam_participants ep ON ep.id=er.participant_id WHERE rai.administration_id=? AND ep.exam_id=?`).bind(id,row.exam_id));
 if(!Number(totals?.participant_count||0))return badRequest('Yayımlanacak değerlendirilmiş öğrenci sonucu bulunmuyor.','NO_RESULTS');
 const version=Number((await one<any>(env.DB.prepare(`SELECT MAX(version) version FROM (SELECT snapshot_version version FROM exam_result_snapshots WHERE exam_id=? UNION ALL SELECT retired_through_version FROM result_artifact_retirements WHERE exam_id=?)`).bind(row.exam_id,row.exam_id)))?.version||0)+1;
 const academicEnd=Number(String(row.academic_year).slice(0,4))+1,sept30=new Date(`${academicEnd}-09-30T23:59:59.000Z`),ninetyDays=new Date(Date.now()+90*86400000),due=(ninetyDays>sept30?ninetyDays:sept30).toISOString();
 await env.DB.batch([
  env.DB.prepare(`DELETE FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?`).bind(row.exam_id,version),
  env.DB.prepare(`INSERT INTO exam_result_snapshots(
   id,exam_id,participant_id,snapshot_version,student_id,institution_id,network_id,city,district,grade_level,class_snapshot,score,net,
   national_rank,national_count,city_rank,city_count,district_rank,district_count,network_rank,network_count,institution_rank,institution_count,grade_rank,grade_count,class_rank,class_count)
  WITH base AS MATERIALIZED (SELECT ep.exam_id,ep.id participant_id,ep.student_id,ep.institution_id,
   (SELECT inm.network_id FROM institution_network_members inm WHERE inm.institution_id=ep.institution_id AND inm.active=1 ORDER BY inm.joined_at LIMIT 1) network_id,
   i.city,i.district,COALESCE(se.grade_level,e.grade_level) grade_level,ep.class_snapshot,er.score,er.net,er.correct_count
   FROM result_access_identities rai JOIN exam_results er ON er.participant_id=rai.participant_id JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id JOIN institutions i ON i.id=ep.institution_id
   LEFT JOIN student_enrollments se ON se.id=(SELECT historical.id FROM student_enrollments historical WHERE historical.student_id=ep.student_id AND historical.institution_id=ep.institution_id AND historical.season_id=ep.season_id ORDER BY historical.created_at DESC,historical.id LIMIT 1) WHERE rai.administration_id=? AND ep.exam_id=?)
  SELECT 'snap_'||lower(hex(randomblob(16))),exam_id,participant_id,?,student_id,institution_id,network_id,city,district,grade_level,class_snapshot,score,net,
   RANK() OVER(ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(),
   RANK() OVER(PARTITION BY COALESCE(city,'') ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(PARTITION BY COALESCE(city,'')),
   RANK() OVER(PARTITION BY COALESCE(city,''),COALESCE(district,'') ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(PARTITION BY COALESCE(city,''),COALESCE(district,'')),
   CASE WHEN network_id IS NOT NULL THEN RANK() OVER(PARTITION BY network_id ORDER BY COALESCE(score,net) DESC,correct_count DESC) END,CASE WHEN network_id IS NOT NULL THEN COUNT(*) OVER(PARTITION BY network_id) END,
   RANK() OVER(PARTITION BY institution_id ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(PARTITION BY institution_id),
   RANK() OVER(PARTITION BY institution_id,grade_level ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(PARTITION BY institution_id,grade_level),
   RANK() OVER(PARTITION BY institution_id,COALESCE(class_snapshot,'') ORDER BY COALESCE(score,net) DESC,correct_count DESC),COUNT(*) OVER(PARTITION BY institution_id,COALESCE(class_snapshot,''))
  FROM base`).bind(id,row.exam_id,version),
  env.DB.prepare(REPORT_SNAPSHOT_SQL).bind(row.exam_id,version),

  // S042 (D-S039): a school's or a dealer's own exam has no Türkiye rank.
  env.DB.prepare(`UPDATE exam_result_snapshots SET national_rank=NULL,national_count=NULL WHERE exam_id=? AND snapshot_version=? AND EXISTS(SELECT 1 FROM result_network_own_exams o WHERE o.exam_id=exam_result_snapshots.exam_id)`).bind(row.exam_id,version),
  env.DB.prepare(`UPDATE exam_administrations SET status='PUBLISHED',published_at=${live?'COALESCE(published_at,CURRENT_TIMESTAMP)':'CURRENT_TIMESTAMP'},retention_due_at=?,ranking_frozen_at=CURRENT_TIMESTAMP,published_snapshot_version=?,participant_count=?,institution_count=? WHERE id=?`).bind(due,version,totals.participant_count,totals.institution_count,id),
  env.DB.prepare(`UPDATE result_access_identities SET expires_at=? WHERE administration_id=?`).bind(due,id),
  env.DB.prepare(`INSERT INTO exam_publication_stats(exam_id,snapshot_version,institution_count,participant_count,city_count,payload_json) SELECT ?,?,?,?,COUNT(DISTINCT city),? FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?`).bind(row.exam_id,version,totals.institution_count,totals.participant_count,JSON.stringify({channel:'RESULT_NETWORK',administrationId:id}),row.exam_id,version),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,?,'exam_administration',?,?)`).bind(uuid('aud'),actorId,live?'RESULT_RANKINGS_REFRESHED':'RESULT_RANKINGS_FROZEN_AND_PUBLISHED',id,JSON.stringify({examId:row.exam_id,version,participants:totals.participant_count,institutions:totals.institution_count,retentionDueAt:due})),
 ]);

 return json({ok:true,id,status:'PUBLISHED',snapshotVersion:version,participantCount:Number(totals.participant_count),institutionCount:Number(totals.institution_count),retentionDueAt:due,live});
}

async function governanceSnapshot(env:Env){
 const [institutions,dealers,scopes,events,candidates,locations,dealerAudits,usage,permissionProfiles,permissionAssignments]=await Promise.all([
  all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.city,i.district,i.status,i.contact_name,i.contact_phone,i.contact_email,i.address,COALESCE(iac.lifecycle_status,i.status) lifecycle_status FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id ORDER BY i.name LIMIT 5000`)),
  all<any>(env.DB.prepare(`SELECT d.id,d.user_id,d.status,d.display_name,d.approved_at,d.created_at,d.updated_at,d.contact_name,d.contact_phone,d.contact_email,d.address,d.neighborhood,d.city,d.district,u.display_name user_name,u.email,u.username,u.phone FROM result_network_dealers d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 200`)),
  all<any>(env.DB.prepare(`SELECT id,dealer_id,scope_type,meb_code,city,district,active,created_at FROM result_network_dealer_scopes ORDER BY created_at DESC LIMIT 1000`)),
  all<any>(env.DB.prepare(`SELECT * FROM institution_governance_events ORDER BY created_at DESC LIMIT 100`)),
  all<any>(env.DB.prepare(`SELECT u.id,u.display_name,u.email,u.username,u.role,i.name institution_name FROM users u LEFT JOIN institutions i ON i.id=u.institution_id WHERE u.active=1 AND u.role IN ('INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER') ORDER BY u.display_name LIMIT 500`)),
  all<any>(env.DB.prepare(`SELECT city,district FROM (SELECT city,district FROM national_institution_directory WHERE status='ACTIVE' UNION SELECT city,district FROM institutions WHERE status='ACTIVE') WHERE city IS NOT NULL AND district IS NOT NULL ORDER BY city,district LIMIT 5000`)),
  all<any>(env.DB.prepare(`SELECT entity_id,action,created_at FROM audit_logs WHERE entity_type='result_network_dealer' ORDER BY created_at DESC LIMIT 1000`)),
  all<any>(env.DB.prepare(`SELECT institution_id,COUNT(DISTINCT exam_id) exam_count,COUNT(*) evaluated_student_count FROM exam_participants GROUP BY institution_id`)),
  all<any>(env.DB.prepare(`SELECT id,code,name,description,permissions_json FROM result_network_permission_profiles WHERE active=1 ORDER BY name`)),
  all<any>(env.DB.prepare(`SELECT a.user_id,a.profile_id,a.scope_type,a.city,a.district,a.institution_id,a.assigned_at,a.updated_at,u.display_name user_name,u.email,u.username,p.name profile_name FROM result_network_user_permission_profiles a JOIN users u ON u.id=a.user_id JOIN result_network_permission_profiles p ON p.id=a.profile_id ORDER BY u.display_name`)),
 ]);
 const activeInstitutions=institutions.filter((x:any)=>x.lifecycle_status==='ACTIVE');
 const auditByDealer=new Map<string,any>();
 for(const row of dealerAudits)if(row.entity_id&&!auditByDealer.has(row.entity_id))auditByDealer.set(row.entity_id,row);
 const usageByInstitution=new Map<string,any>(usage.map((row:any)=>[row.institution_id,row]));
 const matches=(institution:any,scope:any)=>scope.scope_type==='NATIONAL'||(scope.scope_type==='INSTITUTION'&&scope.meb_code&&scope.meb_code===institution.code)||(scope.scope_type==='CITY'&&scope.city&&scope.city===institution.city)||(scope.scope_type==='DISTRICT'&&scope.city&&scope.district&&scope.city===institution.city&&scope.district===institution.district);
 const enrichedDealers=dealers.map((dealer:any)=>{
  const dealerScopes=scopes.filter((scope:any)=>scope.dealer_id===dealer.id);
  const activeScopes=dealerScopes.filter((scope:any)=>scope.active);
  const linked=activeInstitutions.filter((institution:any)=>activeScopes.some((scope:any)=>matches(institution,scope)));
  const dealerUsage=linked.reduce((total:any,institution:any)=>{
   const item=usageByInstitution.get(institution.id);
   return{exam_count:total.exam_count+Number(item?.exam_count||0),evaluated_student_count:total.evaluated_student_count+Number(item?.evaluated_student_count||0)};
  },{exam_count:0,evaluated_student_count:0});
  const last=auditByDealer.get(dealer.id);
  return{...dealer,scopes:dealerScopes,scope_count:activeScopes.length,linked_institution_count:linked.length,exam_count:dealerUsage.exam_count,evaluated_student_count:dealerUsage.evaluated_student_count,last_action:last?.action||'RESULT_DEALER_APPROVED',last_action_at:last?.created_at||dealer.updated_at||dealer.approved_at||dealer.created_at};
 });
 return json({ok:true,institutions,dealers:enrichedDealers,scopes,events,candidates,locations,permissionProfiles,permissionAssignments});
}
async function createDealer(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({})),userId=String(body.userId||''),displayName=String(body.displayName||'').trim(),username=String(body.username||'').trim().toLowerCase(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),clean=(key:string,max:number)=>String(body[key]||'').trim().slice(0,max),contactName=clean('contactName',120),contactPhone=clean('contactPhone',32),contactEmail=clean('contactEmail',160).toLowerCase(),address=clean('address',240),neighborhood=clean('neighborhood',120),city=clean('city',80),district=clean('district',80);
 if(displayName.length<2)return badRequest('Bayi görünen adı en az 2 karakter olmalıdır.');
 if(contactEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))return badRequest('Bayi iletişim e-posta adresi geçersiz.');
 let targetId=userId;
 if(!targetId){
  if(username.length<3||password.length<6)return badRequest('Yeni bayi için görünen ad, kullanıcı adı ve en az 6 karakterli şifre zorunludur.');
  if(!/^[a-z0-9._-]+$/.test(username))return badRequest('Kullanıcı adı yalnızca küçük harf, rakam, nokta, alt çizgi ve tire içerebilir.');
  const duplicate=await one<any>(env.DB.prepare('SELECT id FROM users WHERE username=? OR (?<>\'\' AND lower(email)=?) LIMIT 1').bind(username,email,email));
  if(duplicate)return safeError(409,'USER_ALREADY_EXISTS','Bu kullanıcı adı veya e-posta zaten kullanılıyor.');
  const credentials=await hashPassword(password);targetId=uuid('usr');
  await env.DB.prepare(`INSERT INTO users(id,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,role,active) VALUES(?,?,?,?,?,?,?,?, 'INSTITUTION_MANAGER',1)`).bind(targetId,displayName,email||null,username,credentials.hash,credentials.salt,credentials.iterations, 'PBKDF2-SHA256-v1').run();
 }else{
  const target=await one<any>(env.DB.prepare('SELECT id FROM users WHERE id=? AND active=1').bind(targetId));if(!target)return safeError(404,'USER_NOT_FOUND','Aktif kullanıcı bulunamadı.');
 }
 const id=uuid('dealer');await env.DB.prepare(`INSERT INTO result_network_dealers(id,user_id,status,display_name,contact_name,contact_phone,contact_email,address,neighborhood,city,district,approved_by,approved_at) VALUES(?,?,'APPROVED',?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET status='APPROVED',display_name=COALESCE(NULLIF(excluded.display_name,''),result_network_dealers.display_name),contact_name=COALESCE(NULLIF(excluded.contact_name,''),result_network_dealers.contact_name),contact_phone=COALESCE(NULLIF(excluded.contact_phone,''),result_network_dealers.contact_phone),contact_email=COALESCE(NULLIF(excluded.contact_email,''),result_network_dealers.contact_email),address=COALESCE(NULLIF(excluded.address,''),result_network_dealers.address),neighborhood=COALESCE(NULLIF(excluded.neighborhood,''),result_network_dealers.neighborhood),city=COALESCE(NULLIF(excluded.city,''),result_network_dealers.city),district=COALESCE(NULLIF(excluded.district,''),result_network_dealers.district),approved_by=excluded.approved_by,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(id,targetId,displayName,contactName,contactPhone,contactEmail,address,neighborhood,city,district,user.id).run();
 const dealer=await one<any>(env.DB.prepare('SELECT id FROM result_network_dealers WHERE user_id=?').bind(targetId));await audit(env.DB,user.id,null,'RESULT_DEALER_APPROVED','result_network_dealer',dealer.id,{userId:targetId,createdAccount:!userId});return json({ok:true,dealerId:dealer.id,status:'APPROVED',userId:targetId,username:username||null},201);
}
async function assignPermissionProfile(request:Request,env:Env,user:AuthUser,targetUserId:string){
 const body:any=await request.json().catch(()=>({})),profileId=String(body.profileId||''),scopeType=String(body.scopeType||'ASSIGNED').toUpperCase(),city=body.city?String(body.city).trim():null,district=body.district?String(body.district).trim():null,institutionId=body.institutionId?String(body.institutionId).trim():null;
 if(!profileId)return badRequest('Yetki profili seçilmelidir.');
 if(!['ASSIGNED','NATIONAL','CITY','DISTRICT','INSTITUTION'].includes(scopeType))return badRequest('Geçersiz veri kapsamı.');
 const target=await one<any>(env.DB.prepare(`SELECT id FROM users WHERE id=? AND active=1`).bind(targetUserId));if(!target)return safeError(404,'USER_NOT_FOUND','Aktif kullanıcı bulunamadı.');
 const profile=await one<any>(env.DB.prepare(`SELECT id FROM result_network_permission_profiles WHERE id=? AND active=1`).bind(profileId));if(!profile)return safeError(404,'PERMISSION_PROFILE_NOT_FOUND','Yetki profili bulunamadı.');
 await env.DB.prepare(`INSERT INTO result_network_user_permission_profiles(user_id,profile_id,scope_type,city,district,institution_id,assigned_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_id=excluded.profile_id,scope_type=excluded.scope_type,city=excluded.city,district=excluded.district,institution_id=excluded.institution_id,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).bind(targetUserId,profileId,scopeType,city,district,institutionId,user.id).run();
 await audit(env.DB,user.id,targetUserId,'RESULT_PERMISSION_PROFILE_ASSIGNED','user',targetUserId,{profileId,scopeType,city,district,institutionId});
 return json({ok:true,userId:targetUserId,profileId,scopeType});
}
export async function dealerCanAct(env:Env,user:AuthUser,mebCode?:string){if(user.role==='SUPER_ADMIN')return{ok:true,dealerId:null};const d=await one<any>(env.DB.prepare(`SELECT id FROM result_network_dealers WHERE user_id=? AND status='APPROVED'`).bind(user.id));if(!d)return{ok:false};const directory=mebCode?await one<any>(env.DB.prepare(`SELECT city,district FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(mebCode)):null;const scope=await one<any>(env.DB.prepare(`SELECT 1 FROM result_network_dealer_scopes WHERE dealer_id=? AND active=1 AND (scope_type='NATIONAL' OR (scope_type='INSTITUTION' AND meb_code=?) OR (scope_type='CITY' AND city=?) OR (scope_type='DISTRICT' AND city=? AND district=?)) LIMIT 1`).bind(d.id,mebCode||'',directory?.city||'',directory?.city||'',directory?.district||''));return{ok:!!scope,dealerId:d.id}}
async function setDealerScope(request:Request,env:Env,user:AuthUser,dealerId:string){const body:any=await request.json().catch(()=>({})),scopeType=String(body.scopeType||'').toUpperCase(),mebCode=body.mebCode?String(body.mebCode).trim():null,city=body.city?String(body.city).trim():null,district=body.district?String(body.district).trim():null;if(!['INSTITUTION','DISTRICT','CITY','NATIONAL'].includes(scopeType))return badRequest('Geçersiz bayi kapsamı.');if(scopeType==='INSTITUTION'&&!/^\d{5,12}$/.test(mebCode||''))return badRequest('Kurum kapsamı için geçerli MEB kodu zorunludur.');if((scopeType==='CITY'&&!city)||(scopeType==='DISTRICT'&&(!city||!district)))return badRequest('İl/ilçe kapsamı bilgileri eksik.');const d=await one<any>(env.DB.prepare(`SELECT id FROM result_network_dealers WHERE id=?`).bind(dealerId));if(!d)return safeError(404,'DEALER_NOT_FOUND','Bayi bulunamadı.');await env.DB.prepare(`INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,meb_code,city,district,active) VALUES(?,?,?,?,?,?,1) ON CONFLICT(dealer_id,scope_type,meb_code,city,district) DO UPDATE SET active=1`).bind(uuid('scope'),dealerId,scopeType,mebCode,city,district).run();await audit(env.DB,user.id,null,'RESULT_DEALER_SCOPE_GRANTED','result_network_dealer',dealerId,{scopeType,mebCode,city,district});return json({ok:true,dealerId,scopeType,mebCode,city,district},201)}
async function setDealerStatus(request:Request,env:Env,user:AuthUser,dealerId:string){const body:any=await request.json().catch(()=>({})),status=String(body.status||'').toUpperCase();if(!['APPROVED','SUSPENDED','REVOKED'].includes(status))return badRequest('Geçersiz bayi durumu.');const dealer=await one<any>(env.DB.prepare(`SELECT id,user_id,status FROM result_network_dealers WHERE id=?`).bind(dealerId));if(!dealer)return safeError(404,'DEALER_NOT_FOUND','Bayi bulunamadı.');const statements:D1PreparedStatement[]=[env.DB.prepare(`UPDATE result_network_dealers SET status=?,approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE approved_by END,approved_at=CASE WHEN ?='APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,status,user.id,status,dealerId)];if(status!=='APPROVED')statements.push(env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL`).bind(dealer.user_id));await env.DB.batch(statements);await audit(env.DB,user.id,null,'RESULT_DEALER_STATUS_CHANGED','result_network_dealer',dealerId,{from:dealer.status,to:status,reason:body.reason||null});return json({ok:true,dealerId,status})}
async function removeDealerScope(env:Env,user:AuthUser,dealerId:string,scopeId:string){const scope=await one<any>(env.DB.prepare(`SELECT id FROM result_network_dealer_scopes WHERE id=? AND dealer_id=?`).bind(scopeId,dealerId));if(!scope)return safeError(404,'DEALER_SCOPE_NOT_FOUND','Bayi kapsamı bulunamadı.');await env.DB.prepare(`UPDATE result_network_dealer_scopes SET active=0 WHERE id=?`).bind(scopeId).run();await audit(env.DB,user.id,null,'RESULT_DEALER_SCOPE_REVOKED','result_network_dealer',dealerId,{scopeId});return json({ok:true,dealerId,scopeId,active:false})}
/** S021: optional contact fields of a school's card; empty means "leave as is". */
function institutionContact(body:any):{contactName:string|null;contactPhone:string|null;contactEmail:string|null;address:string|null}|string{
 const t=(v:unknown,max:number)=>{const x=String(v??'').trim().slice(0,max);return x||null};
 const contactName=t(body.contactName,120),contactPhone=t(body.contactPhone,32),contactEmail=t(body.contactEmail,160)?.toLowerCase()||null,address=t(body.address,300);
 if(contactPhone&&!/^\+?[0-9 ()-]{10,20}$/.test(contactPhone))return 'Telefon numarası geçersiz.';
 if(contactEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))return 'E-posta geçersiz.';
 return {contactName,contactPhone,contactEmail,address};
}
async function createNetworkInstitution(request:Request,env:Env,user:AuthUser){if(user.role!=='SUPER_ADMIN')return forbidden('Sonuç ağı kurumu yalnız Süper Admin oluşturabilir.');const body:any=await request.json().catch(()=>({})),code=String(body.mebCode||'').trim();const directory=code?await one<any>(env.DB.prepare(`SELECT meb_code,name,city,district FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(code)):null;if(code&&!directory&&user.role!=='SUPER_ADMIN')return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','MEB referans kurum kaydı bulunamadı.');if(user.role!=='SUPER_ADMIN'&&!code)return badRequest('Bayi işlemi için MEB kurum kodu zorunludur.');const name=directory?.name||String(body.name||'').trim(),city=directory?.city||String(body.city||'').trim(),district=directory?.district||String(body.district||'').trim();if(!name||!city||!district)return badRequest('Kurum adı, il ve ilçe zorunludur.');const contact=institutionContact(body);if(typeof contact==='string')return badRequest(contact);const permission=await dealerCanAct(env,user,code);if(!permission.ok)return forbidden();const id=uuid('inst'),institutionCode=code||`ANX-${id.slice(-8).toUpperCase()}`;const existing=await one<any>(env.DB.prepare(`SELECT id FROM institutions WHERE code=?`).bind(institutionCode));if(existing)return safeError(409,'INSTITUTION_ALREADY_EXISTS','Bu kurum sistemde zaten açık.');await env.DB.batch([env.DB.prepare(`INSERT INTO institutions(id,name,code,city,district,status,source_type,meb_code,contact_name,contact_phone,contact_email,address) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?)`).bind(id,name,institutionCode,city,district,code?'MEB':'MANUAL',code||null,contact.contactName,contact.contactPhone,contact.contactEmail,contact.address),env.DB.prepare(`INSERT INTO institution_access_controls(institution_id,lifecycle_status,updated_by) VALUES(?,'ACTIVE',?)`).bind(id,user.id),env.DB.prepare(`INSERT INTO institution_governance_events(id,institution_id,actor_user_id,actor_dealer_id,action,next_status,metadata_json) VALUES(?,?,?,?,'CREATE','ACTIVE',?)`).bind(uuid('ige'),id,user.id,permission.dealerId,JSON.stringify({mebCode:code||null}))]);await audit(env.DB,user.id,id,'RESULT_INSTITUTION_CREATED','institution',id,{mebCode:code||null,dealerId:permission.dealerId});return json({ok:true,institution:{id,name,code:institutionCode,city,district,status:'ACTIVE'}},201)}
async function setNetworkInstitutionStatus(request:Request,env:Env,user:AuthUser,id:string){if(user.role!=='SUPER_ADMIN')return forbidden('Kurum yaşam döngüsünü yalnız Süper Admin yönetebilir.');const body:any=await request.json().catch(()=>({}));const inst=await one<any>(env.DB.prepare('SELECT code FROM institutions WHERE id=?').bind(id));if(!inst)return safeError(404,'INSTITUTION_NOT_FOUND','Kurum bulunamadı.');const permission=await dealerCanAct(env,user,inst.code);if(!permission.ok)return forbidden();
 // A032b: one lifecycle for the app and the result network.
 return changeInstitutionLifecycle(env,user,id,body.status,body.reason,permission.dealerId)}

export async function updateNetworkInstitution(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden('Kurum bilgilerini yalnız Süper Admin düzenleyebilir.');
 const body:any=await request.json().catch(()=>({}));
 const before=await one<any>(env.DB.prepare(`SELECT id,name,code,city,district FROM institutions WHERE id=?`).bind(id));
 if(!before)return safeError(404,'INSTITUTION_NOT_FOUND','Kurum bulunamadı.');
 const requestedCode=body.mebCode===undefined||String(body.mebCode||'').trim()===''?String(before.code||'').trim():String(body.mebCode).trim();
 if(!requestedCode)return badRequest('Kurum kodu zorunludur.');
 const numericCode=/^\d{5,12}$/.test(requestedCode);
 const directory=numericCode?await one<any>(env.DB.prepare(`SELECT meb_code,name,city,district FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(requestedCode)):null;
 if(numericCode&&!directory)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','MEB referans kurum kaydı bulunamadı.');
 if(!numericCode&&!/^ANX-[A-Z0-9-]+$/.test(requestedCode))return badRequest('Kurum kodu MEB kodu veya ANX- ile başlayan manuel kod olmalıdır.');
 const duplicate=await one<any>(env.DB.prepare('SELECT id FROM institutions WHERE code=? AND id<>?').bind(requestedCode,id));
 if(duplicate)return safeError(409,'INSTITUTION_ALREADY_EXISTS','Bu kurum kodu başka bir kurumda kullanılıyor.');
 const name=String(directory?.name||body.name||before.name||'').trim(),city=String(directory?.city||body.city||before.city||'').trim(),district=String(directory?.district||body.district||before.district||'').trim();
 if(!name||!city||!district)return badRequest('Kurum adı, il ve ilçe zorunludur.');
 const contact=institutionContact(body);if(typeof contact==='string')return badRequest(contact);
 const after={name,code:requestedCode,city,district};
 await env.DB.batch([
  env.DB.prepare('UPDATE institutions SET name=?,code=?,city=?,district=?,contact_name=COALESCE(?,contact_name),contact_phone=COALESCE(?,contact_phone),contact_email=COALESCE(?,contact_email),address=COALESCE(?,address),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,requestedCode,city,district,contact.contactName,contact.contactPhone,contact.contactEmail,contact.address,id),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,'RESULT_INSTITUTION_UPDATED','institution',?,?)`).bind(uuid('aud'),user.id,id,id,JSON.stringify({before:{name:before.name,code:before.code,city:before.city,district:before.district},after})),
 ]);
 return json({ok:true,institution:{id,...after}});
}

export async function handleResultGovernanceMutation(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 const dealerStatus=path.match(/^\/api\/admin\/result-network\/dealers\/([^/]+)\/status$/);
 const removeScope=path.match(/^\/api\/admin\/result-network\/dealers\/([^/]+)\/scopes\/([^/]+)$/);
 const finalize=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/finalize$/);
 const reopen=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/reopen-results$/);
 const artifacts=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/prepare-artifacts$/);
 const readiness=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/artifact-readiness$/);
 const preparation=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/prepare-artifact-job$/);
 const verification=path.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/verify-artifact-job$/);
 const artifactQueue=path==='/api/admin/result-network/artifact-queue';
 if(!dealerStatus&&!removeScope&&!finalize&&!reopen&&!artifacts&&!readiness&&!preparation&&!verification&&!artifactQueue)return null;
 const user=await requireSuper(request,env);if(user instanceof Response)return user;
 if(dealerStatus&&request.method==='POST')return setDealerStatus(request,env,user,dealerStatus[1]);
 if(removeScope&&request.method==='DELETE')return removeDealerScope(env,user,removeScope[1],removeScope[2]);
 if(artifactQueue&&request.method==='GET')return resultArtifactQueueDiagnostics(env,user);
 if(verification&&request.method==='POST')return startResultArtifactVerification(request,env,user,verification[1]);
 if(verification&&request.method==='GET')return readResultArtifactVerification(env,user,verification[1]);
 if(preparation&&request.method==='GET')return readResultArtifactPreparation(env,user,preparation[1]);
 if(preparation&&request.method==='POST')return startResultArtifactPreparation(request,env,user,preparation[1]);
 if(readiness&&request.method==='GET')return inspectResultArtifactReadiness(request,env,user,readiness[1]);
 if(artifacts&&request.method==='POST')return prepareResultArtifacts(request,env,user,artifacts[1]);
 if(reopen&&request.method==='POST')return reopenNetworkResults(request,env,user,reopen[1]);
 if(finalize&&request.method==='POST')return freezeAndPublishAdministration(request,env,user,finalize[1]);
 return safeError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
}

async function scopedOperatorInstitutions(env:Env,user:AuthUser,mode:string){
 if(user.role==='SUPER_ADMIN')return all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.city,i.district FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE COALESCE(iac.lifecycle_status,i.status)='ACTIVE' ORDER BY i.name LIMIT 2000`));
 if(mode!=='DEALER'&&user.role==='INSTITUTION_MANAGER'&&user.institution_id)return all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.city,i.district FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=? AND COALESCE(iac.lifecycle_status,i.status)='ACTIVE'`).bind(user.institution_id));
 return all<any>(env.DB.prepare(`SELECT DISTINCT i.id,i.name,i.code,i.city,i.district FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id LEFT JOIN national_institution_directory ndi ON ndi.meb_code=i.code JOIN result_network_dealers d ON d.user_id=? AND d.status='APPROVED' JOIN result_network_dealer_scopes s ON s.dealer_id=d.id AND s.active=1 WHERE COALESCE(iac.lifecycle_status,i.status)='ACTIVE' AND (s.scope_type='NATIONAL' OR (s.scope_type='INSTITUTION' AND s.meb_code=i.code) OR (s.scope_type='CITY' AND s.city=ndi.city) OR (s.scope_type='DISTRICT' AND s.city=ndi.city AND s.district=ndi.district)) ORDER BY i.name LIMIT 2000`).bind(user.id));
}

async function resultOperatorContext(request:Request,env:Env,institutionId:string,examId?:string):Promise<{user:AuthUser;effective:AuthUser;institution:any;dealerId:string|null}|Response>{
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const institution=await one<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,COALESCE(iac.lifecycle_status,i.status) lifecycle_status FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=?`).bind(institutionId));
 if(!institution)return safeError(404,'INSTITUTION_NOT_FOUND','Kurum bulunamadı.');
 if(institution.lifecycle_status!=='ACTIVE')return safeError(409,'INSTITUTION_NOT_ACTIVE','Pasif, dondurulmuş veya arşivlenmiş kurumda değerlendirme yapılamaz.');
 const ownInstitution=user.role==='INSTITUTION_MANAGER'&&user.institution_id===institutionId;
 const dealerPermission=await dealerCanAct(env,user,institution.code);
 if(user.role!=='SUPER_ADMIN'&&!ownInstitution&&!dealerPermission.ok)return forbidden('Bu kurum için sonuç değerlendirme yetkiniz bulunmuyor.');
 let effective:AuthUser=user.role==='SUPER_ADMIN'||ownInstitution?user:{...user,role:'SUPER_ADMIN',institution_id:null};
 // S042: a school's or a dealer's own exam is used only by its owner (and a dealer's by the schools in its scope).
 if(examId){
  const {ownExamAllows}=await import('./lib/own-exams');const own=await ownExamAllows(env,user,examId,institutionId);
  if(!own.ok)return forbidden(own.message);
  // A school in a dealer's scope uploads to a dealer's exam: the dealer's exam is not "open to all", so the platform acts.
  if(effective.role!=='SUPER_ADMIN'&&await one(env.DB.prepare(`SELECT 1 x FROM result_network_own_exams WHERE exam_id=? AND owner_kind='DEALER'`).bind(examId)))effective={...user,role:'SUPER_ADMIN',institution_id:null};
 }
 return{user,effective,institution,dealerId:dealerPermission.dealerId||null};
}

const DEALER_SCOPE_SQL=`EXISTS(SELECT 1 FROM result_network_dealers rd JOIN result_network_dealer_scopes s ON s.dealer_id=rd.id AND s.active=1 WHERE rd.user_id=? AND rd.status='APPROVED' AND (s.scope_type='NATIONAL' OR (s.scope_type='INSTITUTION' AND s.meb_code=d.meb_code) OR (s.scope_type='CITY' AND s.city=d.city) OR (s.scope_type='DISTRICT' AND s.city=d.city AND s.district=d.district)))`;
/** Institution picker for evaluation: every MEB school the operator may act for, plus hand-opened schools for the Super Admin. */
async function searchOperatorInstitutions(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const url=new URL(request.url),mode=url.searchParams.get('mode')==='DEALER'?'DEALER':'INSTITUTION',q=normalizeName(String(url.searchParams.get('q')||'').slice(0,80));
 if(user.role!=='SUPER_ADMIN'&&mode!=='DEALER'&&user.role==='INSTITUTION_MANAGER'&&user.institution_id)return json({ok:true,institutions:await scopedOperatorInstitutions(env,user,mode)});
 if(q.length<2)return json({ok:true,institutions:[]});
 const like=`%${q}%`,prefix=`${q}%`;
 const directory=user.role==='SUPER_ADMIN'
  ?await all<any>(env.DB.prepare(`SELECT i.id,d.meb_code code,d.name,d.city,d.district,COALESCE(iac.lifecycle_status,i.status,'ACTIVE') lifecycle FROM national_institution_directory d LEFT JOIN institutions i ON i.meb_code=d.meb_code LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE d.status='ACTIVE' AND (d.normalized_name LIKE ? OR d.meb_code LIKE ?) ORDER BY CASE WHEN d.meb_code=? THEN 0 ELSE 1 END,d.name LIMIT 30`).bind(like,prefix,q))
  :await all<any>(env.DB.prepare(`SELECT i.id,d.meb_code code,d.name,d.city,d.district,COALESCE(iac.lifecycle_status,i.status,'ACTIVE') lifecycle FROM national_institution_directory d LEFT JOIN institutions i ON i.meb_code=d.meb_code LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE d.status='ACTIVE' AND (d.normalized_name LIKE ? OR d.meb_code LIKE ?) AND ${DEALER_SCOPE_SQL} ORDER BY CASE WHEN d.meb_code=? THEN 0 ELSE 1 END,d.name LIMIT 30`).bind(like,prefix,user.id,q));
 const manual=user.role==='SUPER_ADMIN'?await all<any>(env.DB.prepare(`SELECT i.id,i.code,i.name,i.city,i.district,COALESCE(iac.lifecycle_status,i.status) lifecycle FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.meb_code IS NULL AND (upper(i.name) LIKE ? OR upper(i.code) LIKE ?) ORDER BY i.name LIMIT 10`).bind(`%${String(url.searchParams.get('q')||'').trim().toLocaleUpperCase('tr-TR')}%`,`${String(url.searchParams.get('q')||'').trim().toUpperCase()}%`)):[];
 return json({ok:true,institutions:[...manual,...directory].filter((x:any)=>x.lifecycle==='ACTIVE').map((x:any)=>({id:x.id||null,code:x.code,name:x.name,city:x.city,district:x.district}))});
}
/** S033 Toplu Liste: scope filter for the operator (Super Admin all, institution manager own school, dealer its region). */
async function topluScope(request:Request,env:Env):Promise<{sql:string;args:unknown[]}|Response>{
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const mode=new URL(request.url).searchParams.get('mode')==='DEALER'?'DEALER':'INSTITUTION';
 if(user.role==='SUPER_ADMIN')return{sql:'',args:[]};
 if(mode!=='DEALER'&&user.role==='INSTITUTION_MANAGER'&&user.institution_id)return{sql:' AND ep.institution_id=?',args:[user.institution_id]};
 return{sql:` AND EXISTS(SELECT 1 FROM national_institution_directory d WHERE d.meb_code=COALESCE(i.meb_code,i.code) AND ${DEALER_SCOPE_SQL})`,args:[user.id]};
}
/** Exams with evaluated results in the operator's scope, for the exam tree (publisher → year → exam). */
async function topluExams(request:Request,env:Env){
 const scope=await topluScope(request,env);if(scope instanceof Response)return scope;
 const rows=await all<any>(env.DB.prepare(`SELECT e.id,e.title,e.academic_year,e.exam_type,e.grade_level,COALESCE(NULLIF(e.publisher_name,''),'Diğer') publisher_name,e.application_start_at,e.application_end_at,count(DISTINCT ep.institution_id) institutions,count(*) participants
  FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id JOIN exam_results er ON er.participant_id=ep.id JOIN institutions i ON i.id=ep.institution_id
  WHERE EXISTS(SELECT 1 FROM exam_channel_publications ecp WHERE ecp.exam_id=e.id AND ecp.channel='RESULT_NETWORK')${scope.sql}
  GROUP BY e.id ORDER BY publisher_name,e.academic_year DESC,COALESCE(e.application_start_at,e.exam_date,e.created_at) DESC,e.title LIMIT 500`).bind(...scope.args));
 return json({ok:true,exams:rows});
}
/** Institutions with results in one exam, for the institution tree (city → district → institution). */
async function topluInstitutions(request:Request,env:Env){
 const scope=await topluScope(request,env);if(scope instanceof Response)return scope;
 const examId=String(new URL(request.url).searchParams.get('examId')||'');if(!examId)return badRequest('Sınav seçin.');
 const rows=await all<any>(env.DB.prepare(`SELECT i.id,i.name,COALESCE(i.meb_code,i.code) code,COALESCE(NULLIF(i.city,''),'İl belirtilmemiş') city,COALESCE(NULLIF(i.district,''),'İlçe belirtilmemiş') district,count(*) participants
  FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=?${scope.sql}
  GROUP BY i.id ORDER BY city,district,i.name LIMIT 5000`).bind(examId,...scope.args));
 return json({ok:true,institutions:rows});
}
/** Earlier evaluations the operator may reopen: report, access cards and review stay reachable after a refresh. */
async function operatorHistory(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const url=new URL(request.url),mode=url.searchParams.get('mode')==='DEALER'?'DEALER':'INSTITUTION',examId=String(url.searchParams.get('examId')||'');
 const where=["EXISTS(SELECT 1 FROM exam_channel_publications ecp WHERE ecp.exam_id=b.exam_id AND ecp.channel='RESULT_NETWORK')","NOT EXISTS(SELECT 1 FROM exam_revision_state tr WHERE tr.exam_id=b.exam_id AND tr.app_trashed_at IS NOT NULL)"],args:unknown[]=[];
 if(examId){where.push('b.exam_id=?');args.push(examId)}
 if(user.role!=='SUPER_ADMIN'){
  if(mode!=='DEALER'&&user.role==='INSTITUTION_MANAGER'&&user.institution_id){where.push('b.institution_id=?');args.push(user.institution_id)}
  else{where.push(`EXISTS(SELECT 1 FROM national_institution_directory d WHERE d.meb_code=COALESCE(i.meb_code,i.code) AND ${DEALER_SCOPE_SQL})`);args.push(user.id)}
 }
 const rows=await all<any>(env.DB.prepare(`SELECT b.id,b.status,b.source_type,b.created_at,b.exam_id,b.institution_id,e.title,e.academic_year,i.name institution_name,i.code institution_code,i.city,i.district,u.display_name created_by_name,(SELECT count(*) FROM scan_records r WHERE r.batch_id=b.id) total,del.deleted_at,del.purge_after,del.reason deleted_reason FROM scan_batches b JOIN exams e ON e.id=b.exam_id JOIN institutions i ON i.id=b.institution_id LEFT JOIN users u ON u.id=b.created_by LEFT JOIN scan_batch_deletions del ON del.batch_id=b.id WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC,b.rowid DESC LIMIT 100`).bind(...args));
 return json({ok:true,batches:rows});
}
async function resultOperatorCatalog(request:Request,env:Env){
 const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const mode=new URL(request.url).searchParams.get('mode')==='DEALER'?'DEALER':'INSTITUTION';
 const institutions=await scopedOperatorInstitutions(env,user,mode);if(!institutions.length&&user.role!=='SUPER_ADMIN')return forbidden('Aktif kurum veya bayi kapsamınız bulunmuyor.');
 const institutionIds=institutions.map((x:any)=>x.id);
 const opticalScope=institutionIds.length&&user.role!=='SUPER_ADMIN'
  ? ` AND (t.owner_type='CENTRAL' OR t.owner_id IN (${institutionIds.map(()=>'?').join(',')}))`
  : '';
 const {ownExamCatalogSql,ownOpticalCatalogSql}=await import('./lib/own-exams');
 const ownExam=await ownExamCatalogSql(env,user),ownOptic=await ownOpticalCatalogSql(env,user);
 const [exams,opticals]=await Promise.all([
  all<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.exam_type,e.academic_year,e.grade_level,e.publisher_name,srv.verified scoring_verified,o.owner_kind own_kind FROM exams e JOIN exam_channel_publications ecp ON ecp.exam_id=e.id AND ecp.channel='RESULT_NETWORK' AND ecp.status='ACTIVE' JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id AND srv.verified=1 LEFT JOIN result_network_own_exams o ON o.exam_id=e.id WHERE e.status IN ('ACTIVE','CLOSED') AND NOT EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL)${ownExam.sql} ORDER BY e.academic_year DESC,e.title LIMIT 500`).bind(...ownExam.args)),
  all<any>(env.DB.prepare(`SELECT v.id,t.name,t.owner_type,t.owner_id,v.version,CASE WHEN oo.template_id IS NOT NULL OR t.owner_type='INSTITUTION' THEN 1 ELSE 0 END own FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id LEFT JOIN result_network_own_opticals oo ON oo.template_id=t.id WHERE v.active=1 AND t.active=1 AND v.parser_definition IS NOT NULL${opticalScope}${ownOptic.sql} ORDER BY t.name,v.version DESC LIMIT 200`).bind(...institutionIds.filter((x:any)=>user.role!=='SUPER_ADMIN'),...ownOptic.args)),
 ]);
 await publishedDefinitions(env,exams);
 return json({ok:true,institutions,exams,opticals});
}

async function batchOperatorContext(request:Request,env:Env,batchId:string){
 const batch=await one<any>(env.DB.prepare(`SELECT id,exam_id,institution_id,status FROM scan_batches WHERE id=?`).bind(batchId));
 if(!batch)return safeError(404,'BATCH_NOT_FOUND','Değerlendirme grubu bulunamadı.');
 const context=await resultOperatorContext(request,env,batch.institution_id,batch.exam_id);if(context instanceof Response)return context;return{...context,batch};
}

/** S031: a central exam listed in the result network opens its result administration on first use; no separate "Taslak sonuç ağı oluştur" step. */
async function ensureOpenAdministration(env:Env,examId:string,actorId:string){
 const open=await one<any>(env.DB.prepare(`SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status IN ('UPLOADING','EVALUATING','READY','PUBLISHED') LIMIT 1`).bind(examId));
 if(open)return;
 const draft=await one<any>(env.DB.prepare(`SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='DRAFT' ORDER BY created_at DESC LIMIT 1`).bind(examId));
 const exam=await one<any>(env.DB.prepare(`SELECT academic_year FROM exams WHERE id=?`).bind(examId));if(!exam)return;
 const id=draft?.id||uuid('eadm');
 await env.DB.batch([
  draft?env.DB.prepare(`UPDATE exam_administrations SET status='UPLOADING' WHERE id=? AND status='DRAFT'`).bind(id):env.DB.prepare(`INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,created_by) VALUES(?,?,?,'RESULT_NETWORK','UPLOADING',?)`).bind(id,examId,exam.academic_year,actorId),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ADMINISTRATION_OPENED','exam_administration',?,?)`).bind(uuid('aud'),actorId,id,JSON.stringify({reason:'İlk değerlendirmede otomatik açıldı.'})),
 ]);
}
/**
 * D-S038 (owner, 28 Oct): on sonuc every evaluated student can see the result once it is published; there is no access
 * code and no card step. When a batch is committed, each of its students gets a result access record keyed by school,
 * grade and student number (the HMAC token, never the number in clear). The stored code hash is a random value no
 * code can match, so the old two-step code check can never open these records.
 */
export async function issueBatchIdentities(env:Env,batchId:string,actorId:string|null){
 const batch=await one<any>(env.DB.prepare(`SELECT id,exam_id,institution_id,status FROM scan_batches WHERE id=?`).bind(batchId));
 if(!batch||batch.status!=='COMMITTED')return {issued:0,reason:'BATCH_NOT_COMMITTED'};
 if(actorId)await ensureOpenAdministration(env,batch.exam_id,actorId);
 const administration=await one<any>(env.DB.prepare(`SELECT ea.*,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.exam_id=? AND ea.channel='RESULT_NETWORK' AND ea.status IN ('UPLOADING','READY','PUBLISHED') ORDER BY ea.created_at DESC LIMIT 1`).bind(batch.exam_id));
 if(!administration)return {issued:0,reason:'RESULT_ADMINISTRATION_NOT_OPEN'};
 const institution=await one<any>(env.DB.prepare(`SELECT i.id,i.code,i.name,i.city,i.district,ndi.meb_code FROM institutions i LEFT JOIN national_institution_directory ndi ON ndi.meb_code=i.code AND ndi.status='ACTIVE' WHERE i.id=?`).bind(batch.institution_id));
 if(!institution?.meb_code)return {issued:0,reason:'OFFICIAL_INSTITUTION_CODE_REQUIRED'};
 const dealer=await one<any>(env.DB.prepare(`SELECT dealer_id FROM result_network_institutions WHERE administration_id=? AND meb_code=?`).bind(administration.id,institution.meb_code));
 await env.DB.prepare(`INSERT INTO result_network_institutions(id,administration_id,meb_code,licensed_institution_id,dealer_id,display_name_snapshot,city_snapshot,district_snapshot) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(administration_id,meb_code) DO UPDATE SET licensed_institution_id=excluded.licensed_institution_id,display_name_snapshot=excluded.display_name_snapshot,city_snapshot=excluded.city_snapshot,district_snapshot=excluded.district_snapshot`).bind(uuid('rni'),administration.id,institution.meb_code,institution.id,dealer?.dealer_id||null,institution.name,institution.city,institution.district).run();
 const resultInstitution=await one<any>(env.DB.prepare(`SELECT id FROM result_network_institutions WHERE administration_id=? AND meb_code=?`).bind(administration.id,institution.meb_code));
 const candidates=await all<any>(env.DB.prepare(`SELECT ep.id participant_id,ep.student_number_snapshot,ep.name_snapshot,COALESCE(se.grade_level,e.grade_level) grade_level FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN exams e ON e.id=ep.exam_id LEFT JOIN student_enrollments se ON se.id=(SELECT historical.id FROM student_enrollments historical WHERE historical.student_id=ep.student_id AND historical.institution_id=ep.institution_id AND historical.season_id=ep.season_id ORDER BY historical.created_at DESC,historical.id LIMIT 1) LEFT JOIN result_access_identities rai ON rai.administration_id=? AND rai.participant_id=ep.id WHERE ep.exam_id=? AND ep.institution_id=? AND rai.id IS NULL ORDER BY ep.id`).bind(administration.id,batch.exam_id,batch.institution_id));
 if(!candidates.length)return {issued:0,administrationId:administration.id};
 const academicEnd=Number(String(administration.academic_year).slice(0,4))+1,defaultDue=new Date(`${academicEnd}-09-30T23:59:59.000Z`),published=administration.published_at?new Date(new Date(String(administration.published_at).replace(' ','T')+'Z').getTime()+90*86400000):defaultDue,expires=(published>defaultDue?published:defaultDue).toISOString();
 const rows:any[]=[];
 for(const c of candidates){const number=normalizeLookup(c.student_number_snapshot);rows.push({id:uuid('rai'),p:c.participant_id,g:c.grade_level,n:normalizeName(String(c.name_snapshot||'')),t:number&&LOOKUP.test(number)?await hmac(env,`STUDENT_NUMBER|${institution.meb_code}|${number}`):null,h:await sha256(crypto.randomUUID()+crypto.randomUUID())})}
 const statements:D1PreparedStatement[]=[];
 for(let i=0;i<rows.length;i+=400)statements.push(env.DB.prepare(`INSERT INTO result_access_identities(id,administration_id,result_institution_id,participant_id,grade_level,normalized_name,student_number_lookup_token,access_code_hash,access_code_salt,expires_at)
  SELECT json_extract(value,'$.id'),?1,?2,json_extract(value,'$.p'),json_extract(value,'$.g'),json_extract(value,'$.n'),json_extract(value,'$.t'),json_extract(value,'$.h'),'NO_ACCESS_CODE',?3 FROM json_each(?4) WHERE true ON CONFLICT DO NOTHING`).bind(administration.id,resultInstitution.id,expires,JSON.stringify(rows.slice(i,i+400))));
 statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,'RESULT_ACCESS_AUTO_ISSUED','scan_batch',?,?)`).bind(uuid('aud'),actorId,batch.institution_id,batchId,JSON.stringify({administrationId:administration.id,count:rows.length,reason:'D-S038: erişim kodu yok; değerlendirilen her öğrenci yayında görür.'})));
 await env.DB.batch(statements);
 return {issued:rows.length,administrationId:administration.id};
}

/** A published administration is stale when a student with result access is not in its current snapshot. */
const STALE_PUBLICATION_SQL=`SELECT ea.id,ea.exam_id FROM exam_administrations ea WHERE ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND EXISTS(SELECT 1 FROM result_access_identities rai WHERE rai.administration_id=ea.id AND NOT EXISTS(SELECT 1 FROM exam_result_snapshots s WHERE s.exam_id=ea.exam_id AND s.snapshot_version=ea.published_snapshot_version AND s.participant_id=rai.participant_id))`;

/**
 * D-S039: after an upload is deleted or moved, a published exam's ranks are written again without its students. If no
 * student is left the publication returns to "uploading", so nothing stale stays visible to students.
 */
export async function republishAfterRemoval(env:Env,examId:string,actorId:string|null){
 const adm=await one<any>(env.DB.prepare(`SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' LIMIT 1`).bind(examId));
 if(!adm)return 'NOT_PUBLISHED';
 const left=await one<any>(env.DB.prepare(`SELECT count(*) c FROM result_access_identities WHERE administration_id=?`).bind(adm.id));
 if(!Number(left?.c||0)){await env.DB.batch([env.DB.prepare(`UPDATE exam_administrations SET status='UPLOADING',published_snapshot_version=NULL,ranking_frozen_at=NULL,participant_count=0,institution_count=0 WHERE id=?`).bind(adm.id),env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_PUBLICATION_EMPTIED','exam_administration',?,?)`).bind(uuid('aud'),actorId,adm.id,JSON.stringify({reason:'Son yükleme silindi; yayında öğrenci kalmadı.'}))]);return 'EMPTIED'}
 const r=await withExamOperationLock(env,examId,'RESULT_NETWORK_REFRESH',async(env)=>publishInLock(env,adm.id,actorId,true));
 return r.ok?'REFRESHED':'DEFERRED';
}

/**
 * D-S039: what the person should know before evaluating an upload. Student numbers already evaluated in this exam at
 * this school (a second session's optic, or the same class twice) are told to everyone; the same file or the same
 * numbers at other schools are told only to a bayi or the Super Admin, since a student may also be at a course centre.
 */
async function uploadChecks(env:Env,batchId:string,examId:string,institutionId:string,fileHash:string,wide:boolean){
 const numbers=`(SELECT DISTINCT trim(json_extract(canonical_json,'$.student_number')) FROM scan_records WHERE batch_id=? AND resolution_status<>'CANCELLED' AND trim(coalesce(json_extract(canonical_json,'$.student_number'),''))<>'')`;
 const here=await one<any>(env.DB.prepare(`SELECT count(DISTINCT ep.student_number_snapshot) c FROM exam_participants ep WHERE ep.exam_id=? AND ep.institution_id=? AND trim(ep.student_number_snapshot) IN ${numbers}`).bind(examId,institutionId,batchId));
 const school=await one<any>(env.DB.prepare(`SELECT name,COALESCE(meb_code,code) code,city,district FROM institutions WHERE id=?`).bind(institutionId));
 const out:any={school,sameSchoolNumbers:Number(here?.c||0)};
 // S041: when the form has a KURUM KODU grid, the code most sheets carry is compared with the chosen school.
 const codes=await all<any>(env.DB.prepare(`SELECT trim(json_extract(canonical_json,'$.institution_code')) code,count(*) n FROM scan_records WHERE batch_id=? AND resolution_status<>'CANCELLED' AND trim(coalesce(json_extract(canonical_json,'$.institution_code'),''))<>'' GROUP BY 1 ORDER BY n DESC LIMIT 3`).bind(batchId));
 const own=String(school?.code||'').replace(/^0+/,'');
 const readCodes=codes.filter(c=>/^\d+$/.test(String(c.code))&&!/^0+$/.test(String(c.code)));
 if(readCodes.length&&own){const top=readCodes[0];out.sheetInstitutionCode={code:String(top.code),sheets:Number(top.n),matches:String(top.code).replace(/^0+/,'')===own}}
 if(wide){
  out.otherSchools=await all<any>(env.DB.prepare(`SELECT i.name,COALESCE(i.meb_code,i.code) code,count(DISTINCT ep.student_number_snapshot) numbers FROM exam_participants ep JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=? AND ep.institution_id<>? AND trim(ep.student_number_snapshot) IN ${numbers} GROUP BY i.id ORDER BY numbers DESC LIMIT 5`).bind(examId,institutionId,batchId));
  out.sameFileElsewhere=fileHash?await all<any>(env.DB.prepare(`SELECT DISTINCT i.name,COALESCE(i.meb_code,i.code) code FROM scan_batch_files f JOIN scan_batches b ON b.id=f.batch_id JOIN institutions i ON i.id=b.institution_id WHERE f.sha256=? AND b.exam_id=? AND b.institution_id<>? AND b.id<>? AND NOT EXISTS(SELECT 1 FROM scan_batch_deletions d WHERE d.batch_id=b.id) LIMIT 5`).bind(fileHash,examId,institutionId,batchId)):[];
 }
 return out;
}

/** D-S037: rewrite the live ranks of an exam (or of every stale exam, from the schedule). A busy exam is left for the next run. */
export async function refreshLivePublications(env:Env,examId?:string,actorId:string|null=null){
 const stale=await all<any>(env.DB.prepare(STALE_PUBLICATION_SQL+(examId?' AND ea.exam_id=?':'')+' LIMIT 20').bind(...(examId?[examId]:[])));
 let refreshed=0;
 for(const s of stale){const r=await withExamOperationLock(env,s.exam_id,'RESULT_NETWORK_REFRESH',async(env)=>publishInLock(env,s.id,actorId,true));if(r.ok)refreshed++;else console.warn('RESULT_LIVE_REFRESH_SKIPPED',s.exam_id,await r.clone().text())}
 return refreshed;
}

export async function generateBatchAccessCodes(request:Request,env:Env,batchId:string){
 let context=await batchOperatorContext(request,env,batchId);if(context instanceof Response)return context;
 return withExamOperationLock(env,context.batch.exam_id,'RESULT_ACCESS_BATCH',async(env)=>{
 context=await batchOperatorContext(request,env,batchId);if(context instanceof Response)return context;
 if(context.batch.status!=='COMMITTED')return badRequest('Önce değerlendirmeyi tamamlayın.','BATCH_NOT_COMMITTED');
 await ensureOpenAdministration(env,context.batch.exam_id,context.user.id);
 const administration=await one<any>(env.DB.prepare(`SELECT ea.*,e.academic_year FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.exam_id=? AND ea.channel='RESULT_NETWORK' AND ea.status IN ('UPLOADING','READY','PUBLISHED') ORDER BY ea.created_at DESC LIMIT 1`).bind(context.batch.exam_id));
 if(!administration)return safeError(409,'RESULT_ADMINISTRATION_NOT_OPEN','Sınav önce Süper Admin tarafından Sonuç Ağı değerlendirmesine açılmalıdır.');
 if(administration.status==='PUBLISHED')return safeError(409,'RESULT_COHORT_FROZEN','Yayınlanmış sınava yeni erişim eklenemez. Önce sonuçları düzeltmeye açın.');
 const institution=await one<any>(env.DB.prepare(`SELECT i.id,i.code,i.name,i.city,i.district,ndi.meb_code FROM institutions i LEFT JOIN national_institution_directory ndi ON ndi.meb_code=i.code AND ndi.status='ACTIVE' WHERE i.id=?`).bind(context.batch.institution_id));
 if(!institution?.meb_code)return safeError(409,'OFFICIAL_INSTITUTION_CODE_REQUIRED','Öğrenci sonuç erişimi için kurum doğrulanmış MEB koduyla açılmalıdır.');
 const resultInstitutionId=uuid('rni');const institutionWrite=env.DB.prepare(`INSERT INTO result_network_institutions(id,administration_id,meb_code,licensed_institution_id,dealer_id,display_name_snapshot,city_snapshot,district_snapshot) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(administration_id,meb_code) DO UPDATE SET licensed_institution_id=excluded.licensed_institution_id,dealer_id=COALESCE(excluded.dealer_id,result_network_institutions.dealer_id),display_name_snapshot=excluded.display_name_snapshot,city_snapshot=excluded.city_snapshot,district_snapshot=excluded.district_snapshot`).bind(resultInstitutionId,administration.id,institution.meb_code,institution.id,context.dealerId,institution.name,institution.city,institution.district);
 const resultInstitution=await one<any>(env.DB.prepare(`SELECT id FROM result_network_institutions WHERE administration_id=? AND meb_code=?`).bind(administration.id,institution.meb_code))||{id:resultInstitutionId};
 const cursor=new URL(request.url).searchParams.get('cursor')||'';
 const candidates=await all<any>(env.DB.prepare(`SELECT ep.id participant_id,ep.student_number_snapshot,ep.name_snapshot,COALESCE(se.grade_level,e.grade_level) grade_level FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN exams e ON e.id=ep.exam_id LEFT JOIN student_enrollments se ON se.id=(SELECT historical.id FROM student_enrollments historical WHERE historical.student_id=ep.student_id AND historical.institution_id=ep.institution_id AND historical.season_id=ep.season_id ORDER BY historical.created_at DESC,historical.id LIMIT 1) LEFT JOIN result_access_identities rai ON rai.administration_id=? AND rai.participant_id=ep.id WHERE ep.exam_id=? AND ep.institution_id=? AND ep.id>? AND rai.id IS NULL AND ep.student_number_snapshot IS NOT NULL AND trim(ep.student_number_snapshot)<>'' ORDER BY ep.id LIMIT 81`).bind(administration.id,context.batch.exam_id,context.batch.institution_id,cursor));
 const page=candidates.slice(0,80),codes:any[]=[];const academicEnd=Number(String(administration.academic_year).slice(0,4))+1,defaultDue=new Date(`${academicEnd}-09-30T23:59:59.000Z`),published=administration.published_at?new Date(new Date(administration.published_at).getTime()+90*86400000):defaultDue,expires=(published>defaultDue?published:defaultDue).toISOString();
 const statements:D1PreparedStatement[]=[institutionWrite];
 for(const participant of page){const code=secureResultCode(),password=await hashResultCode(env,code),studentNumber=normalizeLookup(participant.student_number_snapshot),identityId=uuid('rai');statements.push(env.DB.prepare(`INSERT INTO result_access_identities(id,administration_id,result_institution_id,participant_id,grade_level,normalized_name,student_number_lookup_token,access_code_hash,access_code_salt,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(identityId,administration.id,resultInstitution.id,participant.participant_id,participant.grade_level,normalizeName(participant.name_snapshot),await hmac(env,`STUDENT_NUMBER|${institution.meb_code}|${studentNumber}`),password.hash,password.salt,expires));codes.push({studentNumber:participant.student_number_snapshot,fullName:participant.name_snapshot,gradeLevel:participant.grade_level,accessCode:code,expiresAt:expires})}
 const nextCursor=candidates.length>80?page[page.length-1]?.participant_id:null;statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,'RESULT_ACCESS_BATCH_ISSUED','scan_batch',?,?)`).bind(uuid('aud'),context.user.id,context.batch.institution_id,batchId,JSON.stringify({administrationId:administration.id,count:codes.length,hasMore:!!nextCursor})));await env.DB.batch(statements);return json({ok:true,codes,nextCursor,administrationId:administration.id,oneTimeDisplay:true});
 });
}

/** S030: every student's report card of the institution in this exam: totals, ranks and each subject's D/Y/B/net. */
async function batchKarnes(request:Request,env:Env,batchId:string){
 const report=await batchResultReport(request,env,batchId);if(!report.ok)return report;
 const data:any=await report.json();const rows:any[]=data.rows||[];
 const context=await batchOperatorContext(request,env,batchId);if(context instanceof Response)return context;
 const exam=await one<any>(env.DB.prepare(`SELECT title,academic_year,exam_type,publisher_name,exam_date FROM exams WHERE id=?`).bind(context.batch.exam_id));
 const institution=await one<any>(env.DB.prepare(`SELECT name,code,city,district FROM institutions WHERE id=?`).bind(context.batch.institution_id));
 const subjects:any[]=[];
 for(let i=0;i<rows.length;i+=90){const ids=rows.slice(i,i+90).map(r=>r.participant_id);subjects.push(...await all<any>(env.DB.prepare(`SELECT sr.participant_id,s.name subject,sr.correct_count,sr.wrong_count,sr.blank_count,sr.net FROM subject_results sr JOIN subjects s ON s.id=sr.subject_id LEFT JOIN exam_subjects es ON es.exam_id=? AND es.subject_id=sr.subject_id WHERE sr.participant_id IN (${ids.map(()=>'?').join(',')}) ORDER BY es.sort_order,s.name`).bind(context.batch.exam_id,...ids)))}
 const bySubject=new Map<string,any[]>();for(const s of subjects){const list=bySubject.get(s.participant_id)||[];list.push(s);bySubject.set(s.participant_id,list)}
 const avg=(k:string)=>rows.length?Math.round(rows.reduce((n,r)=>n+Number(r[k]||0),0)/rows.length*100)/100:0;
 return json({ok:true,exam,institution,publication:data.publication,source:data.source,summary:{participants:rows.length,averageNet:avg('net'),averageScore:avg('score')},karnes:rows.map(r=>({...r,subjects:bySubject.get(r.participant_id)||[]}))});
}
async function batchResultReport(request:Request,env:Env,batchId:string){
 const context=await batchOperatorContext(request,env,batchId);if(context instanceof Response)return context;
 if(context.batch.status!=='COMMITTED')return badRequest('Önce değerlendirmeyi tamamlayın.','BATCH_NOT_COMMITTED');
 const administration=await one<any>(env.DB.prepare(`SELECT id,status,published_snapshot_version,ranking_frozen_at,participant_count,institution_count FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' ORDER BY created_at DESC LIMIT 1`).bind(context.batch.exam_id));
 if(administration&&['PUBLISHED','ARCHIVED'].includes(administration.status)){
  if(!Number(administration.published_snapshot_version))return safeError(409,'RESULT_SNAPSHOT_UNAVAILABLE','Yayının sabit sonuç sürümü bulunmuyor.');
  const snapshots=await all<any>(env.DB.prepare(NETWORK_INSTITUTION_SNAPSHOT_SQL).bind(administration.id,context.batch.institution_id,context.batch.institution_id));
  if(snapshots.some(s=>!readNetworkSnapshot(s.payload_json)?.participant))return safeError(409,'RESULT_SNAPSHOT_UNAVAILABLE','Bazı kayıtların sabit kurum raporu bulunmuyor.');
  const rows=snapshots.map(s=>({...snapshotSummary(s),...readNetworkSnapshot(s.payload_json).participant,participant_id:s.participant_id,grade_level:s.grade_level}));
  return json({ok:true,publication:{status:administration.status,snapshotVersion:administration.published_snapshot_version,rankingFrozenAt:administration.ranking_frozen_at,participantCount:Number(administration.participant_count),institutionCount:Number(administration.institution_count)},rows,source:'PUBLISHED_SNAPSHOT'});
 }
 const rows=await all<any>(env.DB.prepare(`WITH live AS MATERIALIZED (SELECT ep.id participant_id,ep.student_number_snapshot,ep.name_snapshot,ep.class_snapshot,COALESCE(se.grade_level,e.grade_level) grade_level,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.success_percent,RANK() OVER(PARTITION BY ep.institution_id ORDER BY COALESCE(er.score,er.net) DESC,er.correct_count DESC) live_institution_rank,COUNT(*) OVER(PARTITION BY ep.institution_id) live_institution_count,RANK() OVER(PARTITION BY ep.institution_id,COALESCE(ep.class_snapshot,'') ORDER BY COALESCE(er.score,er.net) DESC,er.correct_count DESC) live_class_rank,COUNT(*) OVER(PARTITION BY ep.institution_id,COALESCE(ep.class_snapshot,'')) live_class_count FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN exams e ON e.id=ep.exam_id LEFT JOIN student_enrollments se ON se.id=(SELECT h.id FROM student_enrollments h WHERE h.student_id=ep.student_id AND h.institution_id=ep.institution_id AND h.season_id=ep.season_id ORDER BY h.created_at DESC,h.id LIMIT 1) WHERE ep.exam_id=?) SELECT live.*,live.live_institution_rank institution_rank,live.live_institution_count institution_count,live.live_class_rank class_rank,live.live_class_count class_count FROM live JOIN exam_participants ep ON ep.id=live.participant_id WHERE ep.institution_id=? ORDER BY live.net DESC,live.correct_count DESC,live.name_snapshot LIMIT 20000`).bind(context.batch.exam_id,context.batch.institution_id));
 return json({ok:true,publication:{status:administration?.status||'NOT_OPEN',rankingFrozenAt:administration?.ranking_frozen_at||null,participantCount:Number(administration?.participant_count||0),institutionCount:Number(administration?.institution_count||0)},rows,source:'LIVE_PREVIEW'});
}

export async function handleResultOperations(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 // LGS/YKS sayacı (30 Oct): the dates the student countdown uses; only the Super Admin edits them.
 if(path==='/api/admin/result-network/exam-dates'){const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const d=await import('./lib/national-exam-dates');if(request.method==='GET')return d.listExamDates(env,user);if(request.method==='PUT')return d.saveExamDate(request,env,user);return safeError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.')}
 // Föy değerlendirme (30 Oct): paper föy optics, scored against the föy's own key into FOY evidence.
 if(path.startsWith('/api/admin/result-network/operations/foy/')){const {handleFoyOperations}=await import('./lib/foy-evaluation');return handleFoyOperations(request,env,{context:(r,e,id)=>resultOperatorContext(r,e,id),institutions:scopedOperatorInstitutions,user:(r)=>getAuthUser(env,r)})}
 if(path==='/api/admin/result-network/operations/catalog'&&request.method==='GET')return resultOperatorCatalog(request,env);
 if(path==='/api/admin/result-network/operations/institutions'&&request.method==='GET')return searchOperatorInstitutions(request,env);
 if(path==='/api/admin/result-network/operations/history'&&request.method==='GET')return operatorHistory(request,env);
 if(path==='/api/admin/result-network/operations/toplu/exams'&&request.method==='GET')return topluExams(request,env);
 if(path==='/api/admin/result-network/operations/toplu/institutions'&&request.method==='GET')return topluInstitutions(request,env);
 if(path==='/api/admin/result-network/operations/toplu/pack'&&request.method==='GET'){const url=new URL(request.url),examId=String(url.searchParams.get('examId')||''),institutionId=String(url.searchParams.get('institutionId')||'');
  if(!examId||!institutionId)return badRequest('Sınav ve kurum seçin.');
  const context=await resultOperatorContext(request,env,institutionId,examId);if(context instanceof Response)return context;
  const {reportPack}=await import('./lib/result-report-pack');const data=await reportPack(env,examId,institutionId);
  if(!data||!data.students.length)return safeError(404,'REPORT_EMPTY','Bu kurumun bu sınavda değerlendirilmiş öğrencisi yok.');
  return json({ok:true,...data})}
 // S036 Veri Merkezi / Belge Merkezi: downloads in the operator's scope, each one audited.
 if(path==='/api/admin/result-network/operations/data/batches'&&request.method==='GET'){const scope=await topluScope(request,env);if(scope instanceof Response)return scope;const url=new URL(request.url);
  const {listDataBatches}=await import('./lib/result-data-center');return json({ok:true,batches:await listDataBatches(env,scope,{examId:url.searchParams.get('examId')||undefined,year:url.searchParams.get('year')||undefined,q:String(url.searchParams.get('q')||'').trim().slice(0,80)||undefined})})}
 const dataBatch=path.match(/^\/api\/admin\/result-network\/operations\/data\/batches\/([^/]+)\/(read|original|results-downloaded)$/);
 if(dataBatch&&((dataBatch[2]==='results-downloaded'&&request.method==='POST')||(dataBatch[2]!=='results-downloaded'&&request.method==='GET'))){const context=await batchOperatorContext(request,env,dataBatch[1]);if(context instanceof Response)return context;
  const dc=await import('./lib/result-data-center');
  if(dataBatch[2]==='read'){const data=await dc.readData(env,dataBatch[1]);await dc.logDownload(env,context.user,context.batch.institution_id,'READ_DATA','scan_batch',dataBatch[1],{rows:data.rows.length});return json({ok:true,...data})}
  if(dataBatch[2]==='original'){const file=await dc.originalObject(env,dataBatch[1]);if(!file)return safeError(404,'ORIGINAL_NOT_KEPT','Bu yüklemenin orijinal dosyası saklanmamış (özellikten önceki yükleme ya da saklama süresi doldu).');await dc.logDownload(env,context.user,context.batch.institution_id,'ORIGINAL','scan_batch',dataBatch[1],{fileName:file.fileName});return dc.fileResponse(file.object,file.fileName,file.contentType)}
  await dc.logDownload(env,context.user,context.batch.institution_id,'RESULTS','scan_batch',dataBatch[1]);return json({ok:true})}
 if(path==='/api/admin/result-network/operations/documents'&&request.method==='GET'){const scope=await topluScope(request,env);if(scope instanceof Response)return scope;const user=await getAuthUser(env,request);
  const {listDocuments}=await import('./lib/result-data-center');return json({ok:true,exams:await listDocuments(env,scope,user?.role==='SUPER_ADMIN')})}
 const docMatch=path.match(/^\/api\/admin\/result-network\/operations\/documents\/(EXAM|OPTIC)\/([^/]+)$/);
 if(docMatch&&request.method==='GET'){const scope=await topluScope(request,env);if(scope instanceof Response)return scope;const user=(await getAuthUser(env,request))!;
  const dc=await import('./lib/result-data-center');const file=await dc.documentObject(env,scope,user.role==='SUPER_ADMIN',docMatch[1],docMatch[2]);if(!file)return safeError(404,'DOCUMENT_NOT_FOUND','Belge bulunamadı ya da bu belgeye erişiminiz yok.');
  await dc.logDownload(env,user,user.institution_id||null,'DOCUMENT',docMatch[1]==='OPTIC'?'optical_template_asset':'exam_document_asset',docMatch[2],{fileName:file.fileName});return dc.fileResponse(file.object,file.fileName,file.contentType)}
 if(path==='/api/admin/result-network/operations/toplu/bundle'&&request.method==='GET'){const url=new URL(request.url),examId=String(url.searchParams.get('examId')||''),ids=String(url.searchParams.get('institutionIds')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,200);
  if(!examId||!ids.length)return badRequest('Sınav ve kurum seçin.');
  for(const id of ids){const context=await resultOperatorContext(request,env,id,examId);if(context instanceof Response)return context}
  const {reportBundle}=await import('./lib/report-bundle');const data=await reportBundle(env,{examId,institutionIds:ids,aytMode:url.searchParams.get('ayt')==='AYT_ONLY'?'AYT_ONLY':'COMBINED',pairExamId:String(url.searchParams.get('pairExamId')||'')||undefined});
  if(!data||!data.institutions.length)return safeError(404,'REPORT_EMPTY','Seçilen kurumların bu sınavda değerlendirilmiş öğrencisi yok.');
  return json({ok:true,...data})}
 if(path==='/api/admin/result-network/operations/toplu/growth'&&request.method==='GET'){const url=new URL(request.url),institutionId=String(url.searchParams.get('institutionId')||''),examIds=String(url.searchParams.get('examIds')||'').split(',').filter(Boolean);
  if(!institutionId||examIds.length<2)return badRequest('Gelişim raporu için bir kurum ve en az iki sınav seçin.');
  const context=await resultOperatorContext(request,env,institutionId);if(context instanceof Response)return context;
  const {growthReport}=await import('./lib/report-bundle');return json({ok:true,...await growthReport(env,examIds,institutionId)})}
 {const ownMatch=path.match(/^\/api\/admin\/result-network\/operations\/own-exams\/([^/]+)(?:\/(publish|answer-key|remove))?$/);
  if(ownMatch&&((ownMatch[2]&&request.method==='POST')||(!ownMatch[2]&&request.method==='GET'))){const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const own=await import('./lib/own-exams');
   if(ownMatch[2]==='publish')return own.publishOwnExam(env,user,ownMatch[1]);if(ownMatch[2]==='answer-key')return own.correctOwnExamKey(request,env,user,ownMatch[1]);if(ownMatch[2]==='remove')return own.removeOwnExam(request,env,user,ownMatch[1]);return own.ownExamStatus(env,user,ownMatch[1])}}
 if(path==='/api/admin/result-network/operations/own-exams'&&request.method==='POST'){const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');const {createOwnExam}=await import('./lib/own-exams');return createOwnExam(request,env,user)}
 if(path==='/api/admin/result-network/operations/opticals'&&request.method==='POST'){const {quickOptical}=await import('./lib/result-optical-quick');return quickOptical(request,env)}
 const karnes=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/karnes$/);
 if(karnes&&request.method==='GET')return batchKarnes(request,env,karnes[1]);
 const pack=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/report-pack$/);
 if(pack&&request.method==='GET'){const context=await batchOperatorContext(request,env,pack[1]);if(context instanceof Response)return context;
  if(context.batch.status!=='COMMITTED')return badRequest('Önce değerlendirmeyi tamamlayın.','BATCH_NOT_COMMITTED');
  const {reportPack}=await import('./lib/result-report-pack');const data=await reportPack(env,context.batch.exam_id,context.batch.institution_id);
  return data?json({ok:true,...data}):safeError(404,'REPORT_NOT_FOUND','Rapor bulunamadı.')}
 const preview=path.match(/^\/api\/admin\/result-network\/operations\/exams\/([^/]+)\/preview-file$/);
 if(preview&&request.method==='POST'){
  const form=await request.clone().formData();let institutionId=String(form.get('institutionId')||'');
  const mebCode=String(form.get('mebCode')||'').trim();
  // A MEB school that has no card yet is opened from the directory, but only by someone allowed to act for it.
  if(!institutionId&&/^\d{5,12}$/.test(mebCode)){
   const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
   if(!(await dealerCanAct(env,user,mebCode)).ok)return forbidden('Bu kurum için sonuç değerlendirme yetkiniz bulunmuyor.');
   const {ensureInstitutionFromDirectory}=await import('./lib/institution-claim');
   const inst=await ensureInstitutionFromDirectory(env,mebCode,user.id);if(!inst)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','Bu MEB kodu kurum rehberinde yok.');
   institutionId=inst.id;
   const rebuilt=new FormData();for(const [k,v] of form.entries())if(k!=='mebCode')rebuilt.append(k,v as any);rebuilt.set('institutionId',institutionId);
   request=new Request(request.url,{method:'POST',headers:(()=>{const h=new Headers(request.headers);h.delete('content-type');h.delete('content-length');return h})(),body:rebuilt});
  }
  if(!institutionId)return badRequest('Kurum seçilmelidir.');
  const published=await one<any>(env.DB.prepare(`SELECT 1 ok FROM exam_channel_publications WHERE exam_id=? AND channel='RESULT_NETWORK' AND status='ACTIVE'`).bind(preview[1]));
  if(!published)return safeError(404,'RESULT_EXAM_NOT_PUBLISHED','Sınav Sonuç Ağı kataloğunda yayınlanmamış.');
  const context=await resultOperatorContext(request,env,institutionId,preview[1]);if(context instanceof Response)return context;
  {const opticalVersionId=String(form.get('templateVersionId')||'');if(opticalVersionId){const {ownOpticalAllows}=await import('./lib/own-exams');if(!(await ownOpticalAllows(env,context.user,opticalVersionId)))return forbidden('Bu optik başka bir bayinin kendi optiği.')}}
  // D-S039: the same file twice into the same school and exam is stopped (a second session's optic is another file).
  const upFile=form.get('file');let fileHash='';
  if(upFile&&typeof upFile!=='string'){const d=await crypto.subtle.digest('SHA-256',await (upFile as File).arrayBuffer());fileHash=[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  if(fileHash){const dup=await one<any>(env.DB.prepare(`SELECT b.id,b.status,b.created_at FROM scan_batch_files f JOIN scan_batches b ON b.id=f.batch_id WHERE f.sha256=? AND b.exam_id=? AND b.institution_id=? AND NOT EXISTS(SELECT 1 FROM scan_batch_deletions d WHERE d.batch_id=b.id) ORDER BY b.created_at DESC LIMIT 1`).bind(fileHash,preview[1],institutionId));
   if(dup)return json({ok:false,error:{code:'DUPLICATE_UPLOAD',message:`Bu dosya bu okula ve bu sınava ${new Date(String(dup.created_at).replace(' ','T')+'Z').toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})} tarihinde zaten yüklenmiş (${dup.status==='COMMITTED'?'değerlendirildi':'değerlendirilmeyi bekliyor'}). Aynı öğrencileri iki kez saymamak için yeniden yüklenmedi. O yüklemeyi aşağıdaki "Değerlendirme geçmişi"nden açabilir ya da silip yeniden yükleyebilirsiniz.`,batchId:dup.id}},409)}
  const previewed=await previewExamFile(request,env,context.effective,preview[1]);
  if(!previewed.ok)return previewed;
  // S030: every readable sheet is a participant on the result network; no guest step.
  const body:any=await previewed.json();
  if(body?.batchId)body.checks=await uploadChecks(env,body.batchId,preview[1],institutionId,fileHash,context.user.role==='SUPER_ADMIN'||!!context.dealerId);
  const accepted=body?.batchId?await acceptReadableSheets(env,body.batchId,context.user.id,institutionId):0;
  await ensureOpenAdministration(env,preview[1],context.user.id);
  return json({...body,acceptedParticipants:accepted},previewed.status);
 }
 const resolve=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/records\/([^/]+)\/resolve$/);
 if(resolve&&request.method==='POST'){const context=await batchOperatorContext(request,env,resolve[1]);if(context instanceof Response)return context;return resolveScanRecord(request,env,context.effective,resolve[1],resolve[2])}
 const candidates=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/records\/([^/]+)\/candidates$/);
 if(candidates&&request.method==='GET'){const context=await batchOperatorContext(request,env,candidates[1]);if(context instanceof Response)return context;return searchScanCandidates(env,context.effective,candidates[1],candidates[2],new URL(request.url))}
 // D-S039: delete (restorable for 7 days), restore, and move an upload to the right school.
 const batchOnly=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)$/);
 if(batchOnly&&request.method==='DELETE'){const context=await batchOperatorContext(request,env,batchOnly[1]);if(context instanceof Response)return context;
  const body:any=await request.json().catch(()=>({}));const reason=String(body.reason||'').trim();
  if(context.batch.status==='COMMITTED'&&reason.length<5)return badRequest('Değerlendirilmiş yüklemeyi silmek için kısa bir neden yazın (en az 5 harf).','DELETE_REASON_REQUIRED');
  const {deleteBatch}=await import('./lib/batch-lifecycle');
  const done=await withExamOperationLock(env,context.batch.exam_id,'RESULT_BATCH_DELETE',async(env)=>{const r=await deleteBatch(env,batchOnly[1],context.user.id,reason);return r.ok?json(r):safeError(r.code==='NOT_FOUND'?404:409,r.code,r.code==='ALREADY_DELETED'?'Bu yükleme zaten silinmiş.':'Yükleme bulunamadı.')});
  if(!done.ok)return done;const body2:any=await done.json();
  const ranks=body2.wasEvaluated?await republishAfterRemoval(env,context.batch.exam_id,context.user.id):'NOT_NEEDED';
  return json({...body2,ranks,restorableUntilDays:7})}
 const restore=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/restore$/);
 if(restore&&request.method==='POST'){const context=await batchOperatorContext(request,env,restore[1]);if(context instanceof Response)return context;
  const {restoreBatch}=await import('./lib/batch-lifecycle');const r=await restoreBatch(env,restore[1],context.user.id);
  return r.ok?json({ok:true,next:'Yükleme geri geldi. Sonuçlar için yeniden "Değerlendir"e basın.'}):safeError(409,'RESTORE_NOT_AVAILABLE','Bu yükleme geri alınamaz; 7 günlük süre dolmuş olabilir.')}
 const move=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/move$/);
 if(move&&request.method==='POST'){const context=await batchOperatorContext(request,env,move[1]);if(context instanceof Response)return context;
  if(context.user.role!=='SUPER_ADMIN'&&!context.dealerId)return forbidden('Yüklemeyi başka okula yalnız bayi veya Süper Admin taşıyabilir. Kurum yüklemesini silip doğru okula yeniden yükleyebilir.');
  const body:any=await request.json().catch(()=>({}));const mebCode=String(body.mebCode||'').trim(),reason=String(body.reason||'').trim();
  if(!/^\d{5,12}$/.test(mebCode))return badRequest('Taşınacak okulun MEB kodunu seçin.','MOVE_TARGET_REQUIRED');
  if(reason.length<5)return badRequest('Taşıma nedenini kısaca yazın (en az 5 harf).','MOVE_REASON_REQUIRED');
  if(!(await dealerCanAct(env,context.user,mebCode)).ok)return forbidden('Bu okul yetki kapsamınızda değil.');
  const {ensureInstitutionFromDirectory}=await import('./lib/institution-claim');const target=await ensureInstitutionFromDirectory(env,mebCode,context.user.id);
  if(!target)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','Bu MEB kodu kurum rehberinde yok.');
  if(target.id===context.batch.institution_id)return badRequest('Yükleme zaten bu okulda.','MOVE_SAME_SCHOOL');
  const exam=await one<any>(env.DB.prepare('SELECT academic_year FROM exams WHERE id=?').bind(context.batch.exam_id));
  const season=await ensureSeason(env.DB,target.id,exam.academic_year);
  const {clearBatchResults}=await import('./lib/batch-lifecycle');
  const moved=await withExamOperationLock(env,context.batch.exam_id,'RESULT_BATCH_MOVE',async(env)=>{
   const cleared=await clearBatchResults(env,move[1]);
   await env.DB.batch([
    env.DB.prepare(`UPDATE scan_batches SET institution_id=?,season_id=?,status=CASE WHEN status='COMMITTED' THEN 'READY' ELSE status END WHERE id=?`).bind(target.id,season.id,move[1]),
    // the sheets are matched afresh in the new school: nobody from the old school is carried over
    env.DB.prepare(`UPDATE scan_records SET matched_student_id=NULL,match_status=CASE WHEN match_status IN ('ACTIVE_MATCH','GUEST_MATCH','AMBIGUOUS') THEN 'NEW_GUEST' ELSE match_status END,resolution_status=CASE WHEN resolution_status='RESOLVED' THEN 'PENDING' ELSE resolution_status END WHERE batch_id=? AND resolution_status<>'CANCELLED'`).bind(move[1]),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'),context.user.id,target.id,'SCAN_BATCH_MOVED','scan_batch',move[1],JSON.stringify({from:context.batch.institution_id,to:target.id,mebCode,reason,participantsRemoved:cleared.removed})),
   ]);
   return json({ok:true,removed:cleared.removed,institution:{id:target.id,name:target.name}});
  });
  if(!moved.ok)return moved;const out:any=await moved.json();
  const ranks=context.batch.status==='COMMITTED'?await republishAfterRemoval(env,context.batch.exam_id,context.user.id):'NOT_NEEDED';
  return json({...out,ranks,next:'Yükleme yeni okula taşındı. Sonuçlar için "Değerlendir"e basın.'})}
 const evaluate=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/evaluate$/);
 if(evaluate&&request.method==='POST'){const context=await batchOperatorContext(request,env,evaluate[1]);if(context instanceof Response)return context;
  // S030: sheets that cannot be scored are set aside with their reason; the rest is evaluated.
  // A batch uploaded before S030 (or reopened from the history) may still hold readable unmatched sheets: accept them first.
  if(await one(env.DB.prepare('SELECT 1 x FROM scan_batch_deletions WHERE batch_id=?').bind(evaluate[1])))return safeError(409,'BATCH_DELETED','Bu yükleme silinmiş. Önce "Geri al" ile geri getirin.');
  if(context.batch.status!=='COMMITTED')await acceptReadableSheets(env,evaluate[1],context.user.id,context.batch.institution_id);
  const setAside=context.batch.status==='COMMITTED'?[]:await setAsideUnscorable(env,evaluate[1],context.user.id,context.batch.institution_id);
  // S035: one time-limited step; the page calls again while done is false and shows "x / n öğrenci".
  const evaluated=await evaluateBatchStep(env,context.effective,evaluate[1]);
  if(!evaluated.ok)return evaluated;
  const body:any=await evaluated.json();
  // D-S038/D-S037: once the batch is done its students get result access and a published exam's live ranks are rewritten.
  let access:any=null;
  if(body.done!==false){try{access=await issueBatchIdentities(env,evaluate[1],context.user.id);if(access.issued)await refreshLivePublications(env,context.batch.exam_id,context.user.id)}catch(e){console.error('RESULT_ACCESS_AFTER_EVALUATION',e instanceof Error?e.message:e)}}
  return json({...body,setAside,studentAccess:access},evaluated.status)}
 const access=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/access-codes$/);
 if(access&&request.method==='POST')return generateBatchAccessCodes(request,env,access[1]);
 const report=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)\/report$/);
 if(report&&request.method==='GET'){const r=await batchResultReport(request,env,report[1]);if(!r.ok)return r;const body:any=await r.json();const b=await one<any>(env.DB.prepare(`SELECT exam_id,institution_id FROM scan_batches WHERE id=?`).bind(report[1]));
  const [exam,institution]=await Promise.all([one<any>(env.DB.prepare(`SELECT title,academic_year,exam_type,publisher_name FROM exams WHERE id=?`).bind(b?.exam_id)),one<any>(env.DB.prepare(`SELECT name,code,city,district FROM institutions WHERE id=?`).bind(b?.institution_id))]);
  return json({...body,exam,institution},r.status)}
 const batch=path.match(/^\/api\/admin\/result-network\/operations\/scan-batches\/([^/]+)$/);
 if(batch&&request.method==='GET'){const context=await batchOperatorContext(request,env,batch[1]);if(context instanceof Response)return context;return getScanBatch(env,context.effective,batch[1])}
 return null;
}
export async function emitResultRetentionNotices(env:Env){
 for(const notice of [{type:'NOTICE_90',days:90},{type:'NOTICE_60',days:60},{type:'NOTICE_15',days:15}] as const){await env.DB.prepare(`INSERT INTO result_retention_events(id,administration_id,event_type,summary_json) SELECT 'rre_'||lower(hex(randomblob(16))),ea.id,?,json_object('retentionDueAt',ea.retention_due_at,'daysRemaining',?) FROM exam_administrations ea WHERE ea.channel='RESULT_NETWORK' AND ea.status IN ('PUBLISHED','ARCHIVED') AND ea.retention_due_at IS NOT NULL AND datetime(ea.retention_due_at,?||' days')<=CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM result_retention_events re WHERE re.administration_id=ea.id AND re.event_type=?)`).bind(notice.type,notice.days,String(-notice.days),notice.type).run()}
}
export async function purgeExpiredResultNetwork(env:Env){
 await emitResultRetentionNotices(env);
 const rows=await all<any>(env.DB.prepare(`SELECT id,exam_id FROM exam_administrations WHERE channel='RESULT_NETWORK' AND status IN ('PUBLISHED','ARCHIVED') AND retention_due_at IS NOT NULL AND retention_due_at<=CURRENT_TIMESTAMP LIMIT 5`));
 for(const row of rows)await purgeResultNetworkAdministrationPage(env,row.id);
}

export async function purgeResultNetworkAdministrationPage(env:Env,administrationId:string):Promise<Response>{
 const row=await env.DB.prepare("SELECT id,exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(administrationId).first<{id:string;exam_id:string}>();
 if(!row)return json({ok:true,skipped:true});
 return withExamOperationLock(env,row.exam_id,'RESULT_NETWORK_RETENTION',async(env)=>{
  const current=await env.DB.prepare("SELECT id FROM exam_administrations WHERE id=? AND exam_id=? AND channel='RESULT_NETWORK' AND status IN ('PUBLISHED','ARCHIVED') AND retention_due_at IS NOT NULL AND retention_due_at<=CURRENT_TIMESTAMP").bind(row.id,row.exam_id).first();
  if(!current)return json({ok:true,skipped:true});
  await retireResultArtifactVersions(env,row.id,row.exam_id);
  const participants=await all<{participant_id:string}>(env.DB.prepare(`SELECT DISTINCT ep.id participant_id FROM exam_participants ep JOIN result_network_institutions rni ON rni.administration_id=? AND (rni.licensed_institution_id=ep.institution_id OR rni.meb_code=(SELECT code FROM institutions WHERE id=ep.institution_id)) WHERE ep.exam_id=? AND NOT EXISTS(SELECT 1 FROM result_access_identities other WHERE other.participant_id=ep.id AND other.administration_id<>rni.administration_id) AND NOT EXISTS(SELECT 1 FROM exam_delivery_profiles licensed WHERE licensed.exam_id=ep.exam_id AND licensed.snapshot_version>0) AND NOT EXISTS(SELECT 1 FROM exam_administrations licensed WHERE licensed.exam_id=ep.exam_id AND licensed.channel='LICENSED') AND NOT EXISTS(SELECT 1 FROM institution_app_conversions conv WHERE conv.institution_id=ep.institution_id) ORDER BY ep.id LIMIT 81`).bind(row.id,row.exam_id));
  const ids=participants.slice(0,80).map(x=>x.participant_id),hasMore=participants.length>80;
  const statements=[env.DB.prepare(`INSERT INTO result_retention_events(id,administration_id,event_type,summary_json) VALUES(?,?,'PURGE_STARTED',?)`).bind(uuid('rre'),row.id,JSON.stringify({deletedParticipants:ids.length,hasMore}))];
  if(ids.length)statements.push(env.DB.prepare(`DELETE FROM exam_participants WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids));
  if(!hasMore)statements.push(
   env.DB.prepare(`DELETE FROM result_artifact_manifest WHERE administration_id=?`).bind(row.id),
   env.DB.prepare(`DELETE FROM result_network_institutions WHERE administration_id=?`).bind(row.id),
   env.DB.prepare(`UPDATE exam_administrations SET status='PURGED' WHERE id=?`).bind(row.id),
   env.DB.prepare(`INSERT INTO result_retention_events(id,administration_id,event_type,summary_json) SELECT ?,?,'PURGE_COMPLETED',json_object('participants',COALESCE(SUM(json_extract(summary_json,'$.deletedParticipants')),0),'examDefinitionRetained',json('true'),'answerKeysRetained',json('true'),'outcomesRetained',json('true'),'videosRetained',json('true'),'privateArtifactCleanupPending',json('true')) FROM result_retention_events WHERE administration_id=? AND event_type='PURGE_STARTED'`).bind(uuid('rre'),row.id,row.id)
  );
  await env.DB.batch(statements);
  return json({ok:true,hasMore,deleted:ids.length});
  });
}

export async function handleResultNetworkRequest(request:Request,env:Env):Promise<Response|null>{const url=new URL(request.url),p=url.pathname;if(p==='/api/public/results/config'&&request.method==='GET')return publicConfig(env);if(p==='/api/public/results/institutions'&&request.method==='GET')return searchInstitutions(env,url);if(p==='/api/public/results/locations'&&request.method==='GET')return locations(env,url);if(p==='/api/public/results/login'&&request.method==='POST')return studentLogin(request,env);if(p==='/api/public/results/lookup'&&request.method==='POST')return lookup(request,env);if(p==='/api/public/results/verify'&&request.method==='POST')return verify(request,env);if(p==='/api/public/results/student'&&request.method==='GET')return studentResults(request,env);if(p==='/api/public/results/logout'&&request.method==='POST')return studentLogout(request,env);const detail=p.match(/^\/api\/public\/results\/exams\/([^/]+)$/);if(detail&&request.method==='GET')return examDetail(request,env,detail[1]);if(p==='/api/admin/result-network/access-profile'&&request.method==='GET')return operatorAccessProfile(request,env);if(p==='/api/admin/result-network/portal-settings'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return json({ok:true,copy:await portalCopy(env)})}if(p==='/api/admin/result-network/portal-settings'&&request.method==='PATCH'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return updatePortalCopy(request,env,user)}if(p==='/api/admin/institution-directory/import'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return importInstitutionDirectory(request,env,user)}if(p==='/api/admin/result-network/administrations'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return listAdministrations(env)}if(p==='/api/admin/result-network/administrations'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return createAdministration(request,env,user)}const publish=p.match(/^\/api\/admin\/result-network\/administrations\/([^/]+)\/publish$/);if(publish&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return publishAdministration(request,env,user,publish[1])}if(p==='/api/admin/result-network/access'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return issueAccess(request,env,user)}if(p.match(/^\/api\/admin\/result-network\/users\/([^/]+)\/permission-profile$/)&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return assignPermissionProfile(request,env,user,p.match(/^\/api\/admin\/result-network\/users\/([^/]+)\/permission-profile$/)![1])}if(p==='/api/admin/result-network/retention-queue'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return resultRetentionQueueDiagnostics(env,user)}if(p==='/api/admin/result-network/governance'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return governanceSnapshot(env)}if(p==='/api/admin/result-network/dealers'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return createDealer(request,env,user)}const scope=p.match(/^\/api\/admin\/result-network\/dealers\/([^/]+)\/scopes$/);if(scope&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return setDealerScope(request,env,user,scope[1])}const institutionEdit=p.match(/^\/api\/admin\/result-network\/institutions\/([^/]+)$/);if(institutionEdit&&request.method==='PATCH'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return updateNetworkInstitution(request,env,user,institutionEdit[1])}if(p==='/api/admin/result-network/institutions'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return createNetworkInstitution(request,env,user)}const lifecycle=p.match(/^\/api\/admin\/result-network\/institutions\/([^/]+)\/status$/);if(lifecycle&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return setNetworkInstitutionStatus(request,env,user,lifecycle[1])}return null}
