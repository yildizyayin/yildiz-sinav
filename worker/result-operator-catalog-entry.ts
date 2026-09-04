import type { Env } from './types';
import { all,json,one } from './lib/db';

const COOKIE='anunex_result_operator';
async function sha256(value:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function rawCookie(request:Request,name:string){for(const part of (request.headers.get('cookie')||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='))}return null}
function clientIp(request:Request){return request.headers.get('CF-Connecting-IP')||'local'}
function safeError(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function currentOperator(request:Request,env:Env){const raw=rawCookie(request,COOKIE);if(!raw)return null;const tokenHash=await sha256(raw),ipHash=await sha256(clientIp(request));return one<any>(env.DB.prepare(`SELECT o.id FROM result_operator_sessions s JOIN result_operators o ON o.id=s.operator_id WHERE s.token_hash=? AND s.ip_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND o.status='ACTIVE' LIMIT 1`).bind(tokenHash,ipHash))}

export async function handleResultOperatorCatalogRequest(request:Request,env:Env):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!=='/api/result-operator/optical-templates'||request.method!=='GET')return null;
 const operator=await currentOperator(request,env);if(!operator)return safeError(401,'RESULT_OPERATOR_SESSION_REQUIRED','Bayi sonuç oturumu gerekli.');
 const rows=await all<any>(env.DB.prepare(`SELECT v.id,t.name,t.vendor,v.version FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1 ORDER BY t.vendor,t.name,v.version`));
 return json({ok:true,templates:rows});
}
