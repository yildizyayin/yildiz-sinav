import {expect,it} from 'vitest';
import {encodeResultArtifact,storeResultArtifact,prepareResultArtifacts} from '../worker/lib/result-artifacts';
const row={exam_id:'e',participant_id:'p',institution_id:'school',snapshot_version:1,national_rank:2,national_count:50,payload_json:JSON.stringify({schemaVersion:1,exam:{exam_id:'e',net:3,title:'Original'},participant:{name_snapshot:'Sensitive name'},subjects:[{subject_name:'Math',net:3}],outcomes:[],wrongQuestionIds:['q']})};
it('creates deterministic scoped content keys without copying participant names',async()=>{
 const a=await encodeResultArtifact('admin',row),b=await encodeResultArtifact('admin',row);
 expect(a).toEqual(b);expect(a.body).not.toContain('Sensitive name');expect(JSON.parse(a.body).summary.net).toBe(3);expect(JSON.parse(a.body).detail.subjects[0].net).toBe(3);
 for(const variant of [{...row,participant_id:'other'},{...row,institution_id:'foreign'},{...row,snapshot_version:2}])expect((await encodeResultArtifact('admin',variant)).key).not.toBe(a.key);
 expect((await encodeResultArtifact('other-admin',row)).key).not.toBe(a.key);
});
it('does not overwrite existing content and checks bytes on conditional-put retries',async()=>{
 const a=await encodeResultArtifact('admin',row);let bytes:string|undefined;
 const bucket={put:async(_key:string,body:string,options:any)=>{expect(options.onlyIf.get('If-None-Match')).toBe('*');expect(options.httpMetadata.cacheControl).toBe('private, no-store');if(bytes)return null;bytes=body;return {}},get:async()=>({text:async()=>bytes})} as any;
 await storeResultArtifact(bucket,a);await storeResultArtifact(bucket,a);expect(bytes).toBe(a.body);
 bytes='corrupted';await expect(storeResultArtifact(bucket,a)).rejects.toThrow('RESULT_ARTIFACT_CONTENT_CONFLICT');
});
it('rejects missing and unsupported snapshot sources',async()=>{for(const variant of [{...row,payload_json:null},{...row,snapshot_version:0},{...row,institution_id:null}])await expect(encodeResultArtifact('admin',variant)).rejects.toThrow('RESULT_ARTIFACT_SOURCE_INVALID')});
it('checks Super Admin and private rollout settings before any database or bucket operation',async()=>{
 const env={DB:{prepare:()=>{throw Error('UNEXPECTED_DB')}},FILES:{put:()=>{throw Error('PUBLIC_BUCKET_USED')}}} as any;
 expect((await prepareResultArtifacts(new Request('https://test'),env,{role:'TEACHER'} as any,'admin')).status).toBe(403);
 expect((await prepareResultArtifacts(new Request('https://test'),env,{role:'SUPER_ADMIN'} as any,'admin')).status).toBe(400);
 env.RESULT_ARTIFACTS_ENABLED='true';expect((await prepareResultArtifacts(new Request('https://test'),env,{role:'SUPER_ADMIN'} as any,'admin')).status).toBe(400);
});
