import {expect,it,vi} from 'vitest';
import {diagnoseEditorProtocol} from '../worker/lib/question-editor-diagnostic';
it('never invokes a model outside staging super-admin access',async()=>{
 const run=vi.fn(),prepare=vi.fn();
 for(const [environment,role] of [['production','SUPER_ADMIN'],['staging','STUDENT']]){
  const r=await diagnoseEditorProtocol({ENVIRONMENT:environment,DB:{prepare},AI:{run}} as any,{role} as any);
  expect(r.status).toBe(403);
 }
 expect(run).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
});
it('returns the immutable existing diagnostic without another provider call',async()=>{
 const run=vi.fn(),prior={id:'editor-transport-20261015-v1',status:'BLOCKED',verification_json:'{"error":"EDITOR_OUTPUT_INCOMPLETE"}'};
 const env:any={ENVIRONMENT:'staging',AI:{run},DB:{prepare:()=>({bind:()=>({first:async()=>prior})})}};
 const result:any=await (await diagnoseEditorProtocol(env,{role:'SUPER_ADMIN'} as any)).json();
 expect(result).toMatchObject({reused:true,diagnostic:prior});expect(run).not.toHaveBeenCalled();
});
