import {expect,it} from 'vitest';
import {encodeResultArtifact,storeResultArtifact,prepareResultArtifacts,readResultArtifact,sweepRetiredResultArtifactVersion} from '../worker/lib/result-artifacts';
const row={exam_id:'e',participant_id:'p',institution_id:'school',snapshot_version:1,national_rank:2,national_count:50,payload_json:JSON.stringify({schemaVersion:1,exam:{exam_id:'e',net:3,title:'Original'},participant:{name_snapshot:'Sensitive name'},subjects:[{subject_name:'Math',net:3}],outcomes:[],wrongQuestionIds:['q']})};
it('bounds version cleanup and preserves newer versions and other administrations across retries',async()=>{
 const prefix='private-results/admin/v1/';
 const keys=new Set([...Array.from({length:101},(_,i)=>prefix+i),'private-results/admin/v2/new','private-results/admin/v10/new','private-results/other/v1/new']);
 const bucket={list:async(options:any)=>{expect(options).toEqual({prefix,limit:51});const matches=[...keys].filter(k=>k.startsWith(options.prefix));return {objects:matches.slice(0,51).map(key=>({key})),truncated:matches.length>51}},delete:async(batch:string[])=>{expect(batch.length).toBeLessThanOrEqual(50);batch.forEach(key=>keys.delete(key))}} as any;
 expect(await sweepRetiredResultArtifactVersion(bucket,'admin',1)).toEqual({deleted:50,hasMore:true});
 expect(await sweepRetiredResultArtifactVersion(bucket,'admin',1)).toEqual({deleted:50,hasMore:true});
 expect(await sweepRetiredResultArtifactVersion(bucket,'admin',1)).toEqual({deleted:1,hasMore:false});
 keys.add(prefix+'late-write');expect((await sweepRetiredResultArtifactVersion(bucket,'admin',1)).deleted).toBe(1);
 expect([...keys]).toEqual(['private-results/admin/v2/new','private-results/admin/v10/new','private-results/other/v1/new']);
});
it('fails closed before deletion on invalid scope, foreign listed keys or bucket failure',async()=>{
 let deletes=0;const bucket={list:async()=>({objects:[{key:'private-results/admin/v2/foreign'}],truncated:false}),delete:async()=>{deletes++}} as any;
 for(const version of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])await expect(sweepRetiredResultArtifactVersion(bucket,'admin',version)).rejects.toThrow('RESULT_ARTIFACT_CLEANUP_SCOPE_INVALID');
 await expect(sweepRetiredResultArtifactVersion(bucket,' ',1)).rejects.toThrow('RESULT_ARTIFACT_CLEANUP_SCOPE_INVALID');
 await expect(sweepRetiredResultArtifactVersion(bucket,'admin',1)).rejects.toThrow('RESULT_ARTIFACT_CLEANUP_SCOPE_FAILED');expect(deletes).toBe(0);
 const failing={list:async()=>({objects:[{key:'private-results/admin/v1/file'}],truncated:false}),delete:async()=>{throw Error('R2_UNAVAILABLE')}} as any;
 await expect(sweepRetiredResultArtifactVersion(failing,'admin',1)).rejects.toThrow('R2_UNAVAILABLE');
});
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

it('validates digest and exact institution/participant/version before returning artifact content',async()=>{
 const artifact=await encodeResultArtifact('admin',row);
 const access={administration_id:'admin',exam_id:'e',participant_id:'p',institution_id:'school',snapshot_version:1,object_key:artifact.key,content_sha256:artifact.digest};
 let reads=0;const bucket={get:async()=>{reads++;return {text:async()=>artifact.body}}} as any;
 expect((await readResultArtifact(bucket,access)).detail.subjects[0].net).toBe(3);
 await expect(readResultArtifact(bucket,{...access,institution_id:'foreign'})).rejects.toThrow('RESULT_ARTIFACT_SCOPE_FAILED');
 const before=reads;await expect(readResultArtifact(bucket,{...access,participant_id:'other'})).rejects.toThrow('RESULT_ARTIFACT_SCOPE_FAILED');expect(reads).toBe(before);
 await expect(readResultArtifact({get:async()=>({text:async()=>artifact.body+' '})} as any,access)).rejects.toThrow('RESULT_ARTIFACT_INTEGRITY_FAILED');
 expect(await readResultArtifact({get:async()=>null} as any,access)).toBeNull();
});
