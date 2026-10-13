import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
// Synthetic fixtures only; no real student records or deployment mutations.
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true});
await mkdir('tmp/exam-workspace-browser',{recursive:true});
const exam={id:'workspace-exam',title:'Sentetik kabul sınavı',exam_type:'LGS',grade_level:8,academic_year:'2026-2027',owner_type:'CENTRAL',status:'ACTIVE',publisher_name:'Sentetik yayınevi',participant_count:3,booklet_codes:'A,B'};
const state={ok:true,examId:exam.id,title:exam.title,definition:{title:exam.title},savedRevision:4,trashedAt:null,resultPortalAvailable:true,channels:[{channel:'LICENSED',status:'CURRENT',publishedRevision:4,definition:{title:exam.title}},{channel:'RESULT_NETWORK',status:'PENDING_UPDATE',publishedRevision:3,definition:{title:'Eski sentetik başlık'}}]};
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
const unknown=[],errors=[],writes=[];let revision=0;
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin!==server.origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
 const p=url.pathname;let payload;
 if(p==='/api/auth/me')payload={ok:true,user:{id:'synthetic-admin',role:'SUPER_ADMIN',display_name:'Sentetik kullanıcı',must_change_password:false}};
 if(p==='/api/config')payload={ok:true,turnstileSiteKey:''};
 if(p==='/api/platform/features')payload={ok:true,features:[]};
 if(p==='/api/panel-experience')payload={ok:true,defaultTheme:'ANUNEX_STANDARD',allowedThemes:[]};
 if(p==='/api/license/status')payload={ok:true,license:{locked:false,planCode:'LEGACY'}};
 if(p==='/api/nibiru/voice/status')payload={ok:true,providers:{}};
 if(p==='/api/platform/exam-center/catalog')payload={ok:true,exams:[exam]};
 if(p==='/api/admin/exam-channels')payload={ok:true,exams:[state]};
 if(p===`/api/admin/exams/${exam.id}/channels`)payload=state;
 if(p===`/api/exam-definitions/${exam.id}`)payload={ok:true,exam,booklets:[{code:'A'},{code:'B'}],subjects:[],readiness:{ready_to_publish:true,blockers:[]}};
 if(p===`/api/platform/exam-center/${exam.id}/schedule`)payload={ok:true,schedule:{result_freeze_status:'PUBLISHED',snapshot_version:1}};
 if(p===`/api/exam-definitions/${exam.id}/outcome-catalog`)payload={ok:true,outcomes:[{id:'o1',subject_id:'math',code:'SYN.8',title:'Sentetik kazanım'}]};
 if(p===`/api/exam-definitions/${exam.id}/outcome-mappings`){payload={ok:true,revision,outcomeMode:'OPTIONAL',questions:[{id:'q1',subject_id:'math',subject_name:'Matematik',question_no:1,outcome_ids:revision?['o1']:[],references:[{title:'Sentetik kazanım'}]}]};if(req.method()==='PUT'){const b=req.postDataJSON();assert.equal(b.expectedRevision,0);assert.deepEqual(b.mappings,[{questionId:'q1',outcomeIds:['o1']}]);writes.push(p);revision++;payload={ok:true}}}
 if(p===`/api/exam-definitions/${exam.id}/outcome-match-preview`)payload={ok:true,matches:[{subjectId:'math',questionNo:1,outcomeId:'o1',reason:'TITLE'}]};
 if(!payload){unknown.push(p);return route.abort()}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
try{
 await page.goto(server.origin+'/exam-center');await page.getByRole('link',{name:exam.title,exact:true}).waitFor();assert.equal(await page.locator('.exam-workspace table tbody tr').count(),1);assert.equal(await page.locator('.exam-workspace img').count(),0);await page.screenshot({path:'tmp/exam-workspace-browser/compact-list.png',fullPage:true});
 await page.getByRole('link',{name:exam.title,exact:true}).click();await page.getByText('Sonuç yayını güncel değil',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Kazanımlar',exact:true}).click();await page.getByRole('button',{name:'Otomatik eşleştir',exact:true}).click();await page.getByText('1 seçili',{exact:true}).waitFor();await page.getByRole('button',{name:'Kazanımları kaydet',exact:true}).click();await page.getByText('Kazanım eşleştirmeleri kaydedildi.',{exact:true}).waitFor();assert.equal(writes.length,1);await page.screenshot({path:'tmp/exam-workspace-browser/outcomes.png',fullPage:true});
 await page.goto(server.origin+'/exam-channels');await page.getByRole('cell',{name:/Güncelleme bekliyor/}).waitFor();await page.getByRole('button',{name:'Önizle',exact:true}).last().click();await page.getByRole('dialog',{name:'Yayın önizlemesi'}).waitFor();await page.getByRole('cell',{name:'Eski sentetik başlık',exact:true}).waitFor();await page.screenshot({path:'tmp/exam-workspace-browser/publication-preview.png',fullPage:true});
 assert.deepEqual(unknown,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',scenarios:['compact-list','retroactive-outcome-editor','separate-publication-preview'],scope:'Synthetic API fixtures only; no live exam changes.'}));
}catch(error){await page.screenshot({path:'tmp/exam-workspace-browser/failure.png',fullPage:true});console.error(JSON.stringify({unknown,errors,body:(await page.locator('body').innerText()).slice(0,3000)}));throw error}finally{await browser.close();await server.close()}
