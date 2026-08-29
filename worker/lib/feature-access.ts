import type {AuthUser,Env} from '../types';
import {json,one} from './db';

const API_FEATURES:Array<[RegExp,string]>=[
  [/^\/api\/(?:exams|exam-admin|exam-definitions|answer-key|scan-batches|platform\/exam-center)(?:\/|$)/,'EXAM_CENTER'],
  [/^\/api\/(?:optical|opticals|optical-admin|optical-prepare|optical-definitions|optical-definition-versions|printer-profiles|calibrations|camera|v2\/optical-print-base)(?:\/|$)/,'OPTICAL'],
  [/^\/api\/(?:reporting|teacher\/insights)(?:\/|$)/,'REPORTING'],
  [/^\/api\/(?:worksheets|worksheet-admin|worksheet-calendar)(?:\/|$)/,'WORKSHEETS'],
  [/^\/api\/assignment-center(?:\/|$)/,'ASSIGNMENTS'],
  [/^\/api\/attendance(?:\/|$)/,'ATTENDANCE'],
  [/^\/api\/(?:question-bank-standard|platform\/questions|platform\/question-options|platform\/content-options|platform\/studio)(?:\/|$)/,'QUESTION_BANK'],
  [/^\/api\/platform\/networks(?:\/|$)/,'ENTERPRISE'],
];

export function apiFeatureForPath(pathname:string):string|null{
  return API_FEATURES.find(([pattern])=>pattern.test(pathname))?.[1]||null;
}

export async function requireLicensedApiFeature(env:Env,user:AuthUser,pathname:string):Promise<Response|null>{
  if(user.role==='SUPER_ADMIN'||!user.institution_id)return null;
  const feature=apiFeatureForPath(pathname);if(!feature)return null;
  const row=await one<{enabled:number}>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key=?`).bind(user.institution_id,feature));
  if(Number(row?.enabled||0)===1)return null;
  return json({ok:false,error:{code:'FEATURE_DISABLED',message:'Bu modül kurum paketinizde etkin değil.',feature}},403);
}
