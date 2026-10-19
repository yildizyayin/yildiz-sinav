import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('rejects unknown renderer targets and synthetic production requests before any network or credential use',()=>{
 for(const [target,fixture,message] of [['other','false','Invalid video target'],['production','true','Synthetic production video forbidden']]){
  const r=spawnSync(process.execPath,['scripts/process-question-video-jobs.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,QUESTION_VIDEO_TARGET:target,QUESTION_VIDEO_FIXTURE:fixture}});expect(r.status).not.toBe(0);expect(r.stderr).toContain(message);expect(r.stderr).not.toContain('fetch failed');
 }
});
