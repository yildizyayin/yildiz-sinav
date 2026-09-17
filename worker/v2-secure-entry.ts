import v2App from './v2-final-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { one } from './lib/db';

function fail(status:number,code:string,message:string){return Response.json({ok:false,error:{code,message}},{status})}

export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 const protectedV2=url.pathname==='/api/optical-prepare'||url.pathname.startsWith('/api/v2/');
 if(!protectedV2)return v2App.fetch(request,env);
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 if(user.role!=='SUPER_ADMIN'&&user.institution_id){const institution=await one<{status:string}>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));if(institution?.status==='PASSIVE')return fail(403,'INSTITUTION_PASSIVE','Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.');}
 return v2App.fetch(request,env);
}} satisfies ExportedHandler<Env>;
