import v2App from './v2-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { one } from './lib/db';

function fail(status:number,code:string,message:string){return Response.json({ok:false,error:{code,message}},{status})}

export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 if(url.pathname!=='/api/v2/optical-print-base')return v2App.fetch(request,env);
 if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 if(!['SUPER_ADMIN','INSTITUTION_MANAGER'].includes(user.role))return fail(403,'FORBIDDEN','Optik baskı tabanına erişim yetkiniz yok.');
 const versionId=url.searchParams.get('versionId');if(!versionId)return fail(400,'VERSION_REQUIRED','Optik sürümü gereklidir.');
 const version=await one<any>(env.DB.prepare(`SELECT v.id FROM optical_template_versions v WHERE v.id=? AND v.active=1`).bind(versionId));if(!version)return fail(404,'NOT_FOUND','Optik sürümü bulunamadı.');
 const asset=await one<any>(env.DB.prepare(`SELECT object_key,file_name,content_type FROM optical_template_assets WHERE optical_template_version_id=? AND asset_type IN ('PRINT_BASE','BLANK_FORM') ORDER BY CASE asset_type WHEN 'PRINT_BASE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`).bind(versionId));
 if(!asset)return new Response('',{status:204});
 const object=await env.FILES.get(asset.object_key);if(!object)return fail(404,'ASSET_NOT_FOUND','Optik baskı tabanı R2 üzerinde bulunamadı.');
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Content-Type',asset.content_type||headers.get('Content-Type')||'image/png');headers.set('Cache-Control','private, max-age=300');headers.set('Content-Disposition',`inline; filename="${String(asset.file_name||'optik').replace(/"/g,'')}"`);
 return new Response(object.body,{headers});
}} satisfies ExportedHandler<Env>;
