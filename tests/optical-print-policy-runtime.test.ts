import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createOpticalPrintPolicyEntry} from '../worker/optical-print-policy-entry';
import {getAuthUser} from '../worker/lib/auth';
vi.mock('../worker/lib/auth',()=>({getAuthUser:vi.fn()}));
const manager={id:'manager',role:'INSTITUTION_MANAGER',institution_id:'school-a'} as any;
function fixture(owner_type='INSTITUTION',owner_id:string|null='school-a',template_status='READY'){
 const delegated=vi.fn(async()=>Response.json({delegated:true}));const studentRead=vi.fn();const r2get=vi.fn(async()=>({body:'image',writeHttpMetadata:()=>{}}));
 const prepare=(sql:string)=>({bind:(..._args:any[])=>({first:async()=>sql.includes('FROM classes')?{id:'class',institution_id:'school-a'}:sql.includes('FROM optical_template_versions')?{id:'v',owner_type,owner_id,template_status,print_fields:'[]',page_width_mm:210,page_height_mm:297,name:'Form'}:sql.includes('FROM optical_template_assets')?{object_key:'blank',file_name:'blank.png',content_type:'image/png'}:sql.includes('FROM exams')?{id:'exam'}:{id:'school-a'},all:async()=>{if(sql.includes('FROM student_enrollments'))studentRead();return{results:sql.includes('FROM exam_booklets')?[{code:'A'}]:[]}}})});
 const env={DB:{prepare},FILES:{get:r2get}} as any;const app=createOpticalPrintPolicyEntry({fetch:delegated} as any);const call=(path:string)=>app.fetch!(new Request(`https://app.anunex.com${path}`),env,{} as any);return{call,studentRead,r2get,delegated};
}
beforeEach(()=>vi.mocked(getAuthUser).mockResolvedValue(manager));
describe('Deimos tenant-safe outer policy',()=>{
 it('rejects foreign prepare templates before student reads',async()=>{const f=fixture('INSTITUTION','school-b');expect((await f.call('/api/optical-prepare?classId=class&templateVersionId=v')).status).toBe(403);expect(f.studentRead).not.toHaveBeenCalled();});
 it('rejects unpublished central prepare templates',async()=>{const f=fixture('CENTRAL',null,'NEEDS_DEFINITION');expect((await f.call('/api/optical-prepare?classId=class&templateVersionId=v')).status).toBe(403);expect(f.studentRead).not.toHaveBeenCalled();});
 it('prepares permitted central templates and validates booklet membership before student reads',async()=>{const ok=fixture('CENTRAL',null);expect((await ok.call('/api/optical-prepare?classId=class&templateVersionId=v')).status).toBe(200);expect(ok.studentRead).toHaveBeenCalledOnce();const bad=fixture();expect((await bad.call('/api/optical-prepare?classId=class&templateVersionId=v&examId=exam&bookletSet=B')).status).toBe(400);expect(bad.studentRead).not.toHaveBeenCalled();});
 it('rejects another institution print base before R2 read',async()=>{const f=fixture('INSTITUTION','school-b');expect((await f.call('/api/v2/optical-print-base?versionId=v')).status).toBe(403);expect(f.r2get).not.toHaveBeenCalled();});
 it('allows own and READY central print bases, but not unpublished central for institution manager',async()=>{const own=fixture();expect((await own.call('/api/v2/optical-print-base?versionId=v')).status).toBe(200);expect(own.r2get).toHaveBeenCalledOnce();const central=fixture('CENTRAL',null);expect((await central.call('/api/v2/optical-print-base?versionId=v')).status).toBe(200);const draft=fixture('CENTRAL',null,'NEEDS_DEFINITION');expect((await draft.call('/api/v2/optical-print-base?versionId=v')).status).toBe(403);expect(draft.r2get).not.toHaveBeenCalled();});
 it('lets super admin inspect an unpublished central print base',async()=>{vi.mocked(getAuthUser).mockResolvedValue({...manager,role:'SUPER_ADMIN'});const f=fixture('CENTRAL',null,'NEEDS_DEFINITION');expect((await f.call('/api/v2/optical-print-base?versionId=v')).status).toBe(200);});
});
