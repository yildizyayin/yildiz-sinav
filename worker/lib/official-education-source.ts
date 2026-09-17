import type { Env } from '../types';
import { all,one,uuid } from './db';

export type OfficialSourceKind=
 | 'MEB_GENERAL'|'MEB_TYMM'|'MEB_MUFREDAT'|'TTKB'|'MEB_EBA'
 | 'MEB_ROTA_MAARIF'|'MEB_EOKUL'|'OSYM'|'YOK_ATLAS';

type SourcePolicy={kind:OfficialSourceKind;authority:string;title:string;baseUrl:string;roots:string[]};

export const OFFICIAL_SOURCE_POLICIES:ReadonlyArray<SourcePolicy>=[
 {kind:'MEB_GENERAL',authority:'MEB',title:'Millî Eğitim Bakanlığı',baseUrl:'https://www.meb.gov.tr/',roots:['meb.gov.tr']},
 {kind:'MEB_TYMM',authority:'MEB',title:'Türkiye Yüzyılı Maarif Modeli',baseUrl:'https://tymm.meb.gov.tr/',roots:['tymm.meb.gov.tr']},
 {kind:'MEB_MUFREDAT',authority:'TTKB',title:'TTKB Öğretim Programları',baseUrl:'https://mufredat.meb.gov.tr/',roots:['mufredat.meb.gov.tr']},
 {kind:'TTKB',authority:'TTKB',title:'Talim ve Terbiye Kurulu Başkanlığı',baseUrl:'https://ttkb.meb.gov.tr/',roots:['ttkb.meb.gov.tr']},
 {kind:'MEB_EBA',authority:'MEB',title:'MEB EBA / OGM Materyal',baseUrl:'https://www.eba.gov.tr/',roots:['eba.gov.tr']},
 {kind:'MEB_ROTA_MAARIF',authority:'MEB',title:'MEB Rota Maarif',baseUrl:'https://rotamaarif.meb.gov.tr/',roots:['rotamaarif.meb.gov.tr']},
 {kind:'MEB_EOKUL',authority:'MEB',title:'MEB e-Okul',baseUrl:'https://e-okul.meb.gov.tr/',roots:['e-okul.meb.gov.tr']},
 {kind:'OSYM',authority:'ÖSYM',title:'Ölçme, Seçme ve Yerleştirme Merkezi',baseUrl:'https://www.osym.gov.tr/',roots:['osym.gov.tr']},
 {kind:'YOK_ATLAS',authority:'YÖK',title:'YÖK Atlas',baseUrl:'https://yokatlas.yok.gov.tr/',roots:['yokatlas.yok.gov.tr']},
] as const;

function hostMatchesRoot(host:string,root:string){return host===root||host.endsWith(`.${root}`)}
function normalizedAuthority(value:string){const v=String(value||'').trim().toLocaleUpperCase('tr-TR');return v==='OSYM'?'ÖSYM':v==='YOK'?'YÖK':v}

export function inferOfficialSourceKind(authority:string,sourceUrl:string):OfficialSourceKind|null{
 let host='';try{const parsed=new URL(sourceUrl);if(parsed.protocol!=='https:')return null;host=parsed.hostname.toLowerCase()}catch{return null}
 const a=normalizedAuthority(authority);
 if(host==='tymm.meb.gov.tr'&&a==='MEB')return 'MEB_TYMM';
 if(host==='mufredat.meb.gov.tr'&&(a==='MEB'||a==='TTKB'))return 'MEB_MUFREDAT';
 if(host==='ttkb.meb.gov.tr'&&(a==='MEB'||a==='TTKB'))return 'TTKB';
 if(hostMatchesRoot(host,'eba.gov.tr')&&a==='MEB')return 'MEB_EBA';
 if(host==='rotamaarif.meb.gov.tr'&&a==='MEB')return 'MEB_ROTA_MAARIF';
 if(host==='e-okul.meb.gov.tr'&&a==='MEB')return 'MEB_EOKUL';
 if(hostMatchesRoot(host,'osym.gov.tr')&&a==='ÖSYM')return 'OSYM';
 if(host==='yokatlas.yok.gov.tr'&&a==='YÖK')return 'YOK_ATLAS';
 if(hostMatchesRoot(host,'meb.gov.tr')&&a==='MEB')return 'MEB_GENERAL';
 return null;
}

export function validateOfficialSource(input:{sourceKind?:string|null;authority?:string|null;sourceUrl?:string|null;sourceTitle?:string|null;sourceVerifiedAt?:string|null}){
 const sourceUrl=String(input.sourceUrl||'').trim(),sourceTitle=String(input.sourceTitle||'').trim();const authority=normalizedAuthority(String(input.authority||''));
 let parsed:URL;try{parsed=new URL(sourceUrl)}catch{return {valid:false as const,code:'OFFICIAL_SOURCE_URL_INVALID',message:'Resmî kaynak URL geçerli değil.',sourceKind:null}};
 if(parsed.protocol!=='https:')return {valid:false as const,code:'OFFICIAL_SOURCE_HTTPS_REQUIRED',message:'Resmî kaynak HTTPS olmalıdır.',sourceKind:null};
 const explicit=(input.sourceKind||'') as OfficialSourceKind;let policy=OFFICIAL_SOURCE_POLICIES.find(x=>x.kind===explicit)||null;
 const inferred=inferOfficialSourceKind(authority||policy?.authority||'',sourceUrl);if(!policy&&inferred)policy=OFFICIAL_SOURCE_POLICIES.find(x=>x.kind===inferred)||null;
 if(!policy)return {valid:false as const,code:'OFFICIAL_SOURCE_NOT_ALLOWED',message:'Kaynak izin verilen resmî eğitim kaynaklarından biri değil.',sourceKind:null};
 const host=parsed.hostname.toLowerCase();if(!policy.roots.some(root=>hostMatchesRoot(host,root)))return {valid:false as const,code:'OFFICIAL_SOURCE_DOMAIN_MISMATCH',message:'Kaynak adresi seçilen resmî kaynak alan adıyla eşleşmiyor.',sourceKind:policy.kind};
 if(authority&&authority!==policy.authority&&!(policy.kind==='MEB_MUFREDAT'&&authority==='MEB')&&!(policy.kind==='TTKB'&&authority==='MEB'))return {valid:false as const,code:'OFFICIAL_SOURCE_AUTHORITY_MISMATCH',message:'Kaynak adresi ile yetkili kurum eşleşmiyor.',sourceKind:policy.kind};
 if(sourceTitle.length>500)return {valid:false as const,code:'OFFICIAL_SOURCE_TITLE_TOO_LONG',message:'Resmî kaynak başlığı çok uzun.',sourceKind:policy.kind};
 let verifiedAt:string|null=null;if(input.sourceVerifiedAt){const d=new Date(String(input.sourceVerifiedAt));if(Number.isNaN(d.getTime()))return {valid:false as const,code:'OFFICIAL_SOURCE_VERIFIED_AT_INVALID',message:'Kaynak doğrulama tarihi geçerli değil.',sourceKind:policy.kind};if(d.getTime()>Date.now()+24*60*60*1000)return {valid:false as const,code:'OFFICIAL_SOURCE_VERIFIED_AT_FUTURE',message:'Kaynak doğrulama tarihi gelecekte olamaz.',sourceKind:policy.kind};verifiedAt=d.toISOString()}
 return {valid:true as const,code:'OFFICIAL_SOURCE_VERIFIED',message:'Resmî kaynak alan adı doğrulandı.',sourceKind:policy.kind,authority:policy.authority,title:policy.title,baseUrl:policy.baseUrl,host,sourceUrl:parsed.toString(),sourceTitle,sourceVerifiedAt:verifiedAt};
}

export async function recordOfficialKnowledgeEvent(env:Env,input:{sourceKind:OfficialSourceKind;authority:string;entityType:string;entityId?:string|null;academicYear?:string|null;dataYear?:number|null;sourceUrl:string;sourceTitle:string;sourcePublishedAt?:string|null;sourceVerifiedAt?:string|null;contentHash?:string|null;rowCount?:number;createdBy?:string|null}){
 const verdict=validateOfficialSource({sourceKind:input.sourceKind,authority:input.authority,sourceUrl:input.sourceUrl,sourceTitle:input.sourceTitle,sourceVerifiedAt:input.sourceVerifiedAt||new Date().toISOString()});
 if(!verdict.valid)throw new Error(verdict.code);
 const id=uuid('oke');await env.DB.prepare(`INSERT INTO official_knowledge_events(id,source_kind,authority,entity_type,entity_id,academic_year,data_year,source_url,source_title,source_published_at,source_verified_at,content_hash,row_count,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.sourceKind,verdict.authority,input.entityType,input.entityId||null,input.academicYear||null,input.dataYear??null,verdict.sourceUrl,input.sourceTitle||verdict.title,input.sourcePublishedAt||null,verdict.sourceVerifiedAt||new Date().toISOString(),input.contentHash||null,Math.max(0,Number(input.rowCount||0)),input.createdBy||null).run();return id;
}

export async function officialKnowledgeStatus(env:Env){
 const sources=await all<any>(env.DB.prepare(`SELECT s.*,(SELECT count(*) FROM official_knowledge_events e WHERE e.source_kind=s.source_kind) event_count,(SELECT max(e.created_at) FROM official_knowledge_events e WHERE e.source_kind=s.source_kind) last_event_at,(SELECT max(e.source_verified_at) FROM official_knowledge_events e WHERE e.source_kind=s.source_kind) last_verified_at FROM official_knowledge_sources s WHERE s.active=1 ORDER BY s.authority,s.source_kind`));
 const curriculum=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM curriculum_versions WHERE verified=1`));const targets=await one<{c:number}>(env.DB.prepare(`SELECT (SELECT count(*) FROM secondary_school_targets WHERE active=1)+(SELECT count(*) FROM university_program_targets WHERE active=1) c`));const events=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM official_knowledge_events`));
 return {sources:sources.map(s=>({...s,allowed_hosts:JSON.parse(s.allowed_hosts_json||'[]'),domains:JSON.parse(s.domains_json||'[]')})),summary:{verifiedCurriculumVersions:Number(curriculum?.c||0),activeOfficialTargets:Number(targets?.c||0),provenanceEvents:Number(events?.c||0)}};
}
