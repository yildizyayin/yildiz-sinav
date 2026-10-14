import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
// Public, unauthenticated deployment verification. No users, questions or settings are changed.
const base='https://app.anunex.com';
const get=path=>fetch(base+path,{signal:AbortSignal.timeout(30000),headers:{'cache-control':'no-cache'}});
const health=await get('/api/health');assert.equal(health.status,200);assert.equal((await health.json()).environment,'production');
const team=await get('/api/question-bank-standard/team');assert.equal(team.status,401);assert.equal((await team.json()).error.code,'UNAUTHENTICATED');
const media=await get('/api/question-bank-standard/media-jobs');assert.equal(media.status,401);
const page=await get('/question-team');assert.equal(page.status,200);const html=await page.text();assert.match(html,/<div id="root">/);
const src=html.match(/<script[^>]+src="([^"]+)"/)?.[1];assert(src?.startsWith('/assets/'));const entry=await get(src);assert.equal(entry.status,200);const js=await entry.text();const chunk=js.match(/(?:\.\/|\/assets\/)(QuestionTeam-[A-Za-z0-9_-]+\.js)/)?.[1]||js.match(/(QuestionTeam-[A-Za-z0-9_-]+\.js)/)?.[1];assert(chunk,'New question-team lazy bundle is absent');const bundle=await get('/assets/'+chunk);assert.equal(bundle.status,200);assert.match(await bundle.text(),/Soru havuzu ekibi/);
const proof={environment:'production',result:'PASS',authenticatedAccessRequired:true,questionTeamRoute:true,newQuestionTeamBundle:chunk,mediaProtected:true,writeOperations:0,asOf:new Date().toISOString()};await mkdir('tmp/question-team-production',{recursive:true});await writeFile('tmp/question-team-production/evidence.json',JSON.stringify(proof,null,2));console.log('QUESTION_TEAM_PRODUCTION '+JSON.stringify(proof));
