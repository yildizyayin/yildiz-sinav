import { validateOfficialSource,type OfficialSourceKind } from './official-education-source';

const RESTRICTED_OFFICIAL_FIELDS=['questionText','stemText','stem','options','choices','correctAnswer','answerText','solutionText','fullText','questionHtml','contentHtml'];

export function hasRestrictedOfficialQuestionPayload(row:Record<string,unknown>){
 return RESTRICTED_OFFICIAL_FIELDS.some(key=>{
  const value=row?.[key];if(value===undefined||value===null)return false;if(Array.isArray(value))return value.length>0;if(typeof value==='object')return Object.keys(value as object).length>0;return String(value).trim().length>0;
 });
}

export function restrictedOfficialPayloadFields(row:Record<string,unknown>){return RESTRICTED_OFFICIAL_FIELDS.filter(key=>{const value=row?.[key];if(value===undefined||value===null)return false;if(Array.isArray(value))return value.length>0;if(typeof value==='object')return Object.keys(value as object).length>0;return String(value).trim().length>0;});}

export function validateOfficialQuestionUrl(input:{sourceKind:string;authority:string;url:string}){
 const verdict=validateOfficialSource({sourceKind:input.sourceKind,authority:input.authority,sourceUrl:input.url,sourceVerifiedAt:new Date().toISOString()});
 return verdict.valid?{valid:true as const,url:verdict.sourceUrl,sourceKind:verdict.sourceKind as OfficialSourceKind}:{valid:false as const,code:verdict.code,message:verdict.message};
}

export type CopyrightStatus='OWNED'|'LICENSED'|'PUBLIC_DOMAIN'|'USER_PROVIDED'|'RESTRICTED';
export type RightsBasis='OWNED'|'WRITTEN_LICENSE'|'PUBLIC_DOMAIN'|'USER_PROVIDED'|'RESTRICTED_REFERENCE';

export function rightsBasisForCopyright(status:string):RightsBasis{
 const s=String(status||'').toUpperCase() as CopyrightStatus;
 if(s==='LICENSED')return 'WRITTEN_LICENSE';if(s==='PUBLIC_DOMAIN')return 'PUBLIC_DOMAIN';if(s==='USER_PROVIDED')return 'USER_PROVIDED';if(s==='RESTRICTED')return 'RESTRICTED_REFERENCE';return 'OWNED';
}

export function requiresVerifiedRightsBeforeApproval(status:string){return ['LICENSED','PUBLIC_DOMAIN'].includes(String(status||'').toUpperCase())}
export function isAutomaticallyPrintableCopyright(status:string){return ['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(String(status||'').toUpperCase())}
