import type { AuthUser,Env } from '../types';
import { json,one } from './db';

const prefixes:Array<[string,string]>=[
  ['/api/platform/questions','QUESTION_BANK'],
  ['/api/platform/learning-','LEARNING_GRAPH'],
  ['/api/platform/recovery','RECOVERY'],
  ['/api/platform/rba','RBA'],
  ['/api/platform/assignments','ASSIGNMENTS'],
  ['/api/platform/membership','MEMBERSHIP'],
  ['/api/platform/ai-guidance','MEMBERSHIP'],
  ['/api/platform/ai-coach','MEMBERSHIP'],
  ['/api/platform/live','LIVE'],
  ['/api/platform/studio','STUDIO'],
  ['/api/platform/personal-book','STUDIO'],
  ['/api/platform/physical','PHYSICAL_BRIDGE'],
  ['/api/platform/videos','VIDEO_LIBRARY'],
  ['/api/platform/games','GAMES'],
  ['/api/platform/campus','CAMPUS'],
  ['/api/platform/networks','ENTERPRISE'],
  ['/api/platform/publishers','PUBLISHER'],
  ['/api/platform/admissions','ADMISSIONS'],
  ['/api/platform/guidance','GUIDANCE_TESTS'],
  ['/api/platform/board','BOARD'],
  ['/api/platform/mobile','MOBILE_API'],
];

export function requiredFeatureForPath(path:string){return prefixes.find(([prefix])=>path.startsWith(prefix))?.[1]||null}

export async function platformFeatureGate(env:Env,user:AuthUser,path:string):Promise<Response|null>{
  if(user.role==='SUPER_ADMIN')return null;
  const key=requiredFeatureForPath(path);if(!key)return null;
  if(!user.institution_id)return json({ok:false,error:{code:'FEATURE_DISABLED',message:'Bu özellik hesabınız için etkin değil.',feature:key}},403);
  const row=await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key=?`).bind(user.institution_id,key));
  if(Number(row?.enabled||0)!==1)return json({ok:false,error:{code:'FEATURE_DISABLED',message:'Bu özellik kurumunuz için henüz etkin değil.',feature:key}},403);
  return null;
}
