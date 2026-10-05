import type { AuthUser, Env } from '../types';
import { all, forbidden, json, notFound, one } from './db';

type AssetRow={
 id:string; question_id:string; r2_key:string|null; external_url:string|null; mime_type:string|null;
 byte_sha256:string|null; byte_size:number|null; sealed_at:string|null;
};
type IntegrityResult={ok:true}|{ok:false;code:string;message:string};
const immutablePrefix='question-media/immutable/';
const maxAssets=20;
const maxAssetBytes=20*1024*1024;

async function sha256(bytes:ArrayBuffer){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function immutableKey(hash:string){return `${immutablePrefix}${hash.slice(0,2)}/${hash}`}

export async function verifyQuestionMediaIntegrity(env:Env,questionId:string):Promise<IntegrityResult>{
 const assets=await all<AssetRow>(env.DB.prepare(`SELECT id,question_id,r2_key,external_url,mime_type,byte_sha256,byte_size,sealed_at
   FROM question_assets WHERE question_id=? ORDER BY id LIMIT ?`).bind(questionId,maxAssets+1));
 if(assets.length>maxAssets)return{ok:false,code:'QUESTION_MEDIA_LIMIT',message:'Bir soruda en fazla 20 medya varlığı onaylanabilir.'};
 for(const asset of assets){
  if(asset.external_url)return{ok:false,code:'QUESTION_MEDIA_EXTERNAL_MUTABLE',message:'Harici medya bağlantısı değiştirilebilir olduğu için soru onaylanamaz. Medyayı yerel arşive mühürleyin.'};
  if(!asset.r2_key||!asset.r2_key.startsWith(immutablePrefix)||!asset.byte_sha256||asset.byte_sha256.length!==64||asset.byte_size===null||!asset.sealed_at)
   return{ok:false,code:'QUESTION_MEDIA_SEAL_REQUIRED',message:'Soru medyası içerik özetiyle mühürlenmeden onaylanamaz.'};
  const head=await env.FILES.head(asset.r2_key);
  if(!head)return{ok:false,code:'QUESTION_MEDIA_MISSING',message:'Mühürlü soru medyası depolamada bulunamadı.'};
  if(Number(head.size)!==Number(asset.byte_size)||String(head.customMetadata?.sha256||'')!==asset.byte_sha256)
   return{ok:false,code:'QUESTION_MEDIA_INTEGRITY_FAILED',message:'Soru medyasının depolama bütünlüğü doğrulanamadı.'};
 }
 return{ok:true};
}

export async function sealQuestionMedia(env:Env,user:AuthUser,questionId:string):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden('Soru medyasını yalnız Süper Admin mühürleyebilir.');
 const question=await one<any>(env.DB.prepare(`SELECT id,review_status FROM question_bank WHERE id=? AND review_status<>'ARCHIVED'`).bind(questionId));
 if(!question)return notFound('Soru bulunamadı.');
 const assets=await all<AssetRow>(env.DB.prepare(`SELECT id,question_id,r2_key,external_url,mime_type,byte_sha256,byte_size,sealed_at
   FROM question_assets WHERE question_id=? ORDER BY id LIMIT ?`).bind(questionId,maxAssets+1));
 if(assets.length>maxAssets)return json({ok:false,error:{code:'QUESTION_MEDIA_LIMIT',message:'Bir soruda en fazla 20 medya varlığı mühürlenebilir.'}},400);
 const updates:D1PreparedStatement[]=[];const sealed:any[]=[];
 for(const asset of assets){
  if(asset.external_url)return json({ok:false,error:{code:'QUESTION_MEDIA_EXTERNAL_MUTABLE',message:'Harici medya bağlantıları mühürlenemez. Dosyayı platform depolamasına yükleyin.'}},409);
  if(!asset.r2_key)return json({ok:false,error:{code:'QUESTION_MEDIA_SOURCE_MISSING',message:'Soru medyasının kaynak dosyası bulunamadı.'}},409);
  if(asset.r2_key.startsWith(immutablePrefix)&&asset.byte_sha256&&asset.sealed_at){
   const verified=await env.FILES.head(asset.r2_key);
   if(verified&&Number(verified.size)===Number(asset.byte_size)&&String(verified.customMetadata?.sha256||'')===asset.byte_sha256){sealed.push({id:asset.id,sha256:asset.byte_sha256,size:asset.byte_size,reused:true});continue;}
  }
  const object=await env.FILES.get(asset.r2_key);if(!object)return json({ok:false,error:{code:'QUESTION_MEDIA_MISSING',message:'Soru medyası depolamada bulunamadı.'}},409);
  if(Number(object.size)>maxAssetBytes)return json({ok:false,error:{code:'QUESTION_MEDIA_TOO_LARGE',message:'Tek bir soru medya dosyası 20 MB sınırını aşamaz.'}},413);
  const bytes=await object.arrayBuffer();const hash=await sha256(bytes);const key=immutableKey(hash);
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:object.httpMetadata?.contentType||asset.mime_type||'application/octet-stream'},customMetadata:{sha256:hash,sourceAssetId:asset.id}});
  const head=await env.FILES.head(key);if(!head||Number(head.size)!==bytes.byteLength||String(head.customMetadata?.sha256||'')!==hash)
   return json({ok:false,error:{code:'QUESTION_MEDIA_SEAL_FAILED',message:'Mühürlü medya doğrulaması tamamlanamadı; soru değişmedi.'}},503);
  updates.push(env.DB.prepare(`UPDATE question_assets SET r2_key=?,external_url=NULL,byte_sha256=?,byte_size=?,sealed_at=CURRENT_TIMESTAMP WHERE id=? AND question_id=?`).bind(key,hash,bytes.byteLength,asset.id,questionId));
  sealed.push({id:asset.id,sha256:hash,size:bytes.byteLength,reused:false});
 }
 if(updates.length){
  if(question.review_status==='APPROVED')updates.push(env.DB.prepare(`UPDATE question_bank SET review_status='REVIEW',reviewed_by=NULL,reviewed_at=NULL,review_checks_json=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(questionId));
  await env.DB.batch(updates);
 }
 const revision=await one<any>(env.DB.prepare(`SELECT review_revision FROM question_bank WHERE id=?`).bind(questionId));
 return json({ok:true,questionId,sealed,reviewRevision:revision?.review_revision??null,requiresReview:question.review_status==='APPROVED'&&updates.length>0});
}
