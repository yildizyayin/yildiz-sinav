import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';

// Browser acceptance only: every API response is synthetic. This script never
// signs into a deployed account, edits a real exam, or publishes real results.
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE||undefined});
const passed=[];
await mkdir('tmp/exam-readiness-browser',{recursive:true});
const exam={id:'synthetic-exam',title:'Sentetik kabul sınavı',status:'DRAFT',owner_type:'CENTRAL',exam_type:'SCHOOL',grade_level:7,academic_year:'2026-2027',publisher_name:'Sentetik yayınevi'};
const base={
 '/api/config':{ok:true,turnstileSiteKey:''},
 '/api/platform/features':{ok:true,features:[]},
 '/api/panel-experience':{ok:true,defaultTheme:'ANUNEX_STANDARD',allowedThemes:[]},
 '/api/license/status':{ok:true,license:{locked:false,planCode:'LEGACY'}},
 '/api/nibiru/voice/status':{ok:true,providers:{}},
};
async function scenario(name,run,{ready=true,failActivation=false,failEvaluation=false,review=false,chunked=false,role='SUPER_ADMIN'}={}){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const errors=[],unknown=[],requests=[];
 let active=false,committed=false,booklet=false,evaluationCalls=0;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==server.origin){await route.abort();return}
  if(!url.pathname.startsWith('/api/')){await route.continue();return}
  requests.push({path:url.pathname,method:request.method(),body:request.postData()});
  let status=200,payload=base[url.pathname];
  if(url.pathname==='/api/auth/me')payload={ok:true,user:{id:'synthetic-user',role,institution_id:role==='SUPER_ADMIN'?null:'synthetic-school',display_name:'Sentetik kullanıcı',must_change_password:false}};
  if(url.pathname==='/api/institutions')payload={ok:true,institutions:[{id:'synthetic-school',name:'Sentetik kurum',status:'ACTIVE'},{id:'inactive-school',name:'Kapalı kurum',status:'PASSIVE'}]};
  if(url.pathname==='/api/exam-definitions/synthetic-exam')payload={ok:true,exam:{...exam,status:active?'ACTIVE':'DRAFT'},booklets:[{code:'A'},{code:'B'}],subjects:[{subject_id:'math',subject_name:'Matematik',question_count:2,question_start:1,question_end:2,option_count:4,wrong_divisor:3}],readiness:{ready_to_publish:ready,blockers:ready?[]:[{code:'ANSWER_KEY_INCOMPLETE',message:'A kitapçığının cevap anahtarı eksik.'}]}};
  if(url.pathname==='/api/platform/exam-center/synthetic-exam/schedule')payload={ok:true,schedule:{result_freeze_status:'OPEN'}};
  if(url.pathname==='/api/exam-definitions/synthetic-exam/status'){
   assert.equal(request.method(),'PATCH');assert.deepEqual(request.postDataJSON(),{status:'ACTIVE'});
   if(failActivation){status=409;payload={ok:false,error:{code:'EXAM_NOT_READY',message:'Cevap anahtarı değişti; yeniden kontrol edin.'}}}
   else{active=true;payload={ok:true}}
  }
  if(url.pathname==='/api/exams/synthetic-exam/preview-file'){
   assert.equal(request.method(),'POST');assert.match(request.postData(),/name="institutionId"\r\n\r\nsynthetic-school/);
   payload={ok:true,batchId:'synthetic-batch',total:1,counts:{active:1,guest:0},detection:{templateName:'Sentetik TXT optiği',confidence:1}};
  }
  if(url.pathname==='/api/scan-batches/synthetic-batch')payload={ok:true,batch:{status:committed?'COMMITTED':review&&!booklet?'NEEDS_REVIEW':'READY',source_type:'TXT'},counts:{active:1,guest:0,cancelled:0},records:[{id:'synthetic-record',row_no:1,canonical:{name:'Sentetik öğrenci',student_number:'100',booklet:review&&!booklet?'':'A'},issues:review&&!booklet?['Kitapçık kodlanmamış']:[],match_status:'ACTIVE_MATCH',resolution_status:review&&!booklet?'PENDING':'RESOLVED',bookletOptions:review&&!booklet?[{code:'A',available:true,correct:2,wrong:0,blank:0,net:2},{code:'B',available:true,correct:0,wrong:2,blank:0,net:-0.67}]:[]}]};
  if(url.pathname==='/api/scan-batches/synthetic-batch/records/synthetic-record/resolve'){
   assert.deepEqual(request.postDataJSON(),{action:'BOOKLET',bookletCode:'A'});booklet=true;payload={ok:true};
  }
  if(url.pathname==='/api/scan-batches/synthetic-batch/evaluate'){
   assert.equal(request.method(),'POST');assert(!review||booklet,'Unresolved booklet must prevent evaluation');
   if(failEvaluation){status=409;payload={ok:false,error:{code:'EVALUATION_BLOCKED',message:'Değerlendirme kaydedilmedi; kontrol tekrar gerekli.'}}}
   else if(chunked && evaluationCalls++===0){payload={ok:true,done:false,processed:0,total:1}}
   else{committed=true;payload={ok:true,done:true,processed:1,total:1}}
  }
  if(!payload){unknown.push(url.pathname);await route.abort();return}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 try{await run(page,requests);assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);await page.screenshot({path:`tmp/exam-readiness-browser/${name}.png`,fullPage:true});passed.push(name)}
 catch(error){await page.screenshot({path:`tmp/exam-readiness-browser/failure-${name}.png`,fullPage:true});console.error(JSON.stringify({scenario:name,errors,unknown,body:(await page.locator('body').innerText()).slice(0,2500)}));throw error}
 finally{await context.close()}
}
async function upload(page,{selectInstitution=true}={}){
 await page.goto(server.origin+'/exams/synthetic-exam/evaluate');
 await page.getByRole('heading',{name:'Sınav Değerlendir',exact:true}).waitFor();
 if(selectInstitution){
  await page.getByText('Veri yüklemek veya kamera okumak için önce kurum seçin.',{exact:true}).waitFor();
  assert.equal(await page.locator('input[type=file]').count(),0);
  const institution=page.getByRole('combobox',{name:'Değerlendirilecek kurum'});
  assert.equal(await institution.locator('option[value=inactive-school]').count(),0);
  await institution.selectOption('synthetic-school');
  await page.waitForURL('**institutionId=synthetic-school');
 }
 await page.locator('input[type=file]').first().setInputFiles({name:'sentetik.txt',mimeType:'text/plain',buffer:Buffer.from('100 SENTETIK A AB')});
 await page.getByRole('button',{name:'Dosyayı Analiz Et',exact:true}).click();
 await page.getByRole('heading',{name:'Kontrol',exact:true}).waitFor();
}
try{
 await scenario('draft-blockers',async(page,requests)=>{
  await page.goto(server.origin+'/exam-center/synthetic-exam');await page.getByText('A kitapçığının cevap anahtarı eksik.',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Sınavı aktifleştir',exact:true}).isDisabled());
  assert.equal(await page.getByRole('link',{name:'Veri yükle / değerlendir',exact:true}).count(),0);
  assert.equal(requests.filter(r=>r.method==='PATCH').length,0);
 },{ready:false});
 await scenario('draft-activation',async(page,requests)=>{
  await page.goto(server.origin+'/exam-center/synthetic-exam');await page.getByRole('button',{name:'Sınavı aktifleştir',exact:true}).click();
  await page.getByText('Değerlendirmeye açık',{exact:true}).waitFor();
  assert.match(await page.getByRole('link',{name:'Veri yükle / değerlendir',exact:true}).getAttribute('href'),/synthetic-exam/);
  assert.equal(requests.filter(r=>r.path.endsWith('/publish')).length,0,'Activation must not publish student results');
 });
 await scenario('activation-rejected',async page=>{
  await page.goto(server.origin+'/exam-center/synthetic-exam');await page.getByRole('button',{name:'Sınavı aktifleştir',exact:true}).click();
  await page.getByText('Cevap anahtarı değişti; yeniden kontrol edin.',{exact:true}).waitFor();
  assert.equal(await page.getByText('Değerlendirmeye açık',{exact:true}).count(),0);
  assert.equal(await page.getByText('Sınav aktif. Optik veri yükleyip değerlendirebilirsiniz.',{exact:true}).count(),0);
 },{failActivation:true});
 await scenario('institution-upload-evaluate',async(page,requests)=>{
  await upload(page);assert(await page.getByRole('combobox',{name:'Değerlendirilecek kurum'}).isDisabled());
  await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();await page.getByText('Değerlendirme tamamlandı',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Sonuç raporlarını aç',exact:true}).getAttribute('href'),'/reports?examId=synthetic-exam&institutionId=synthetic-school');
  await page.getByRole('button',{name:'Başka dosya değerlendir',exact:true}).click();await page.getByRole('button',{name:'Dosyayı Analiz Et',exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/evaluate')).length,1);
 });
 await scenario('chunked-evaluation-completes',async(page,requests)=>{
  await upload(page);await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();await page.getByText('Değerlendirme tamamlandı',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/evaluate')).length,2);
 },{chunked:true});
 await scenario('booklet-review-before-evaluation',async(page,requests)=>{
  await upload(page);await page.getByText('Kitapçık A',{exact:true}).waitFor();await page.getByText('Kitapçık B',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).count(),0);
  await page.getByLabel('Doğrulanan kitapçık',{exact:true}).selectOption('A');await page.getByRole('button',{name:'Kitapçığı Onayla',exact:true}).click();
  await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();await page.getByText('Değerlendirme tamamlandı',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/resolve')).length,1);
 },{review:true});
 await scenario('evaluation-rejected-no-false-success',async page=>{
  await upload(page);await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();
  await page.getByText('Değerlendirme kaydedilmedi; kontrol tekrar gerekli.',{exact:true}).waitFor();assert.equal(await page.getByText('Değerlendirme tamamlandı',{exact:true}).count(),0);
 },{failEvaluation:true});
 await scenario('manager-institution-scope',async(page,requests)=>{
  await upload(page,{selectInstitution:false});await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();await page.getByText('Değerlendirme tamamlandı',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path==='/api/institutions').length,0,'Manager must not load global institution directory');
 },{role:'INSTITUTION_MANAGER'});
 console.log(JSON.stringify({status:'passed',scenarios:passed,scope:'Built production client with synthetic API fixtures only. Not live database, optical accuracy, scoring, camera hardware or customer-exam evidence.',screenshots:'tmp/exam-readiness-browser'},null,2));
}finally{await browser.close();await server.close()}
