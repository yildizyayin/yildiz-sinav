import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';

const base='https://yildiz-sinav-qpool-pr-227.rtsgida.workers.dev';
const roles=[['super','SUPER_ADMIN','Öğrenci karne yönetimi'],['manager','INSTITUTION_MANAGER','Kurum öğrenci karnesi'],['math','TEACHER','Branş gelişim karnesi'],['guidance','GUIDANCE_TEACHER','Rehberlik gelişim karnesi'],['student1','STUDENT','Bireysel gelişim karnem'],['parent1','PARENT','Öğrenci gelişim karnesi']];
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
await mkdir('tmp/live-browser-acceptance',{recursive:true});
let checks=0;
let publicationVersion=null;
const publisher=await browser.newContext();
async function publication(path,data){const response=await publisher.request.post(base+'/api/platform/exam-center/exam_demo_active/'+path,{data});const result=await response.json();assert.equal(response.status(),200,JSON.stringify({path,status:response.status(),error:result.error?.code}));assert(result.ok);return result}
const publicationLogin=await publisher.request.post(base+'/api/auth/login',{data:{identifier:'super',password:'Demo123!',remember:false,turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(publicationLogin.status(),200);assert.equal((await (await publisher.request.get(base+'/api/config')).json()).environment,'staging');
try{
 for(const [identifier,role,heading] of roles){
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera'],acceptDownloads:true});
  let page;
  try{
   const config=await context.request.get(base+'/api/config');assert.equal((await config.json()).environment,'staging');
   const login=await context.request.post(base+'/api/auth/login',{data:{identifier,password:'Demo123!',remember:false,turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(login.status(),200);
   const me=await context.request.get(base+'/api/auth/me');assert.equal((await me.json()).user.role,role);
   page=await context.newPage();page.setDefaultTimeout(30_000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+(role==='STUDENT'?'/student-report':'/reports')+'?studentId=stu_a001');await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   if(role==='SUPER_ADMIN')await page.getByLabel('Kurum',{exact:true}).selectOption('inst_demo');
   const csv=page.getByRole('button',{name:'CSV',exact:true});await csv.waitFor();await csv.click({trial:true});
   const downloadPromise=page.waitForEvent('download');await csv.click();const download=await downloadPromise;
   const output='tmp/live-browser-acceptance/'+identifier+'.csv';await download.saveAs(output);const content=(await readFile(output,'utf8')).replace(/^\ufeff/,'');
   assert(content.startsWith('"Öğrenci";"Sınav";'));assert(content.split('\n').length>1,'CSV must contain positive result rows');
   if(role==='TEACHER')assert(content.split('\n').slice(1).every(row=>row.includes('"Matematik"')),'Teacher export leaked another subject');
   await page.evaluate(()=>{window.__acceptancePrintCalls=0;window.print=()=>{window.__acceptancePrintCalls++}});
   await page.getByRole('button',{name:'Yazdır / PDF',exact:true}).click();assert.equal(await page.evaluate(()=>window.__acceptancePrintCalls),1);
   const pdf=await page.pdf({path:'tmp/live-browser-acceptance/'+identifier+'.pdf',format:'A4',printBackground:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>5000);
   assert.deepEqual(errors,[]);checks++;console.log(JSON.stringify({status:'passed',scope:'real remote report UI, CSV and browser PDF',role}));
   if(role==='INSTITUTION_MANAGER'){
    await page.goto(base+'/exams/exam_demo_active/evaluate');await page.getByRole('heading',{name:'Sınav Değerlendir',exact:true}).waitFor();
    await page.getByRole('button',{name:'Kamerayı Aç',exact:true}).click();await page.locator('video').waitFor();
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.srcObject?.getVideoTracks()[0]?.readyState==='live'});
    checks++;console.log(JSON.stringify({status:'passed',scope:'browser camera permission and live synthetic media stream; physical phone not covered'}));
    const csvText='student_number,name,class,booklet,answers_MAT,answers_TUR,answers_FEN\n1001,Aktif1 Öğrenci1,7/A,,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE\n9999901,Sentetik Eşleşmeyen,7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE\n';
    await page.locator('input[type="file"]').first().setInputFiles({name:'synthetic-booklet-matching.csv',mimeType:'text/csv',buffer:Buffer.from(csvText)});
    await page.getByRole('button',{name:'Dosyayı Analiz Et',exact:true}).click();
    await page.getByRole('heading',{name:/Kitapçık kodunu kontrol edin/}).waitFor();
    await page.getByText('Kitapçık A',{exact:true}).waitFor();await page.getByText('Kitapçık B',{exact:true}).waitFor();
    await page.getByLabel('Doğrulanan kitapçık',{exact:true}).selectOption('A');await page.getByRole('button',{name:'Kitapçığı Onayla',exact:true}).click();
    const unmatched=page.locator('.issue-row').filter({hasText:'Sentetik Eşleşmeyen'});await unmatched.getByRole('button',{name:'Eşleştir',exact:true}).click();
    await page.getByPlaceholder('TCKN, öğrenci no veya ad soyad').fill('1002');await page.getByRole('button',{name:'Ara',exact:true}).click();
    await page.getByRole('button',{name:/Aktif2 Öğrenci2/}).click();
    await page.getByRole('button',{name:'SINAVI DEĞERLENDİR',exact:true}).click();await page.getByText('Değerlendirme tamamlandı',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);checks++;console.log(JSON.stringify({status:'passed',scope:'real file upload, missing A/B booklet comparison, manual unmatched student resolution and evaluation'}));
    const frozen=await publication('freeze');publicationVersion=frozen.version;const published=await publication('publish');assert.equal(published.version,publicationVersion);console.log(JSON.stringify({status:'passed',scope:'real synthetic exam freeze and publication before student/parent report checks',version:publicationVersion}));
   }
  }catch(error){console.error(JSON.stringify({scope:'synthetic browser acceptance failure',role,url:page?.url(),body:page?await page.locator('body').innerText().catch(()=>'<unavailable>'):'<no page>'}));throw error}
  finally{await context.close()}
 }
 console.log(JSON.stringify({status:'passed',checkCount:checks,productionTraffic:false,realStudentData:false,scope:'live synthetic remote acceptance; PDF generated by Chromium, camera uses synthetic stream'}));
}finally{try{if(publicationVersion!==null)await publication('reopen-results',{reason:'Synthetic browser acceptance complete; reopen disposable exam only',expectedSnapshotVersion:publicationVersion})}finally{await publisher.close();await browser.close()}}
