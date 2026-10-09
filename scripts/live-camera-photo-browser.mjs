import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const base='https://yildiz-sinav-qpool-pr-227.rtsgida.workers.dev';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1400},acceptDownloads:true});
 try{
  const config=await context.request.get(base+'/api/config');assert.equal((await config.json()).environment,'staging');
  const login=await context.request.post(base+'/api/auth/login',{data:{identifier:'manager',password:'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(login.status(),200);
  const page=await context.newPage();page.setDefaultTimeout(30_000);
  await mkdir('tmp/camera-photo-browser',{recursive:true});
  await page.goto(base+'/camera-test');await page.getByRole('heading',{name:'Sentetik Demo Optiği',exact:true}).waitFor();
  const image='tmp/camera-photo-browser/synthetic-optical-sheet.png';await page.locator('.camera-test-sheet').screenshot({path:image});
  await page.goto(base+'/exams/exam_demo_active/evaluate');await page.getByRole('heading',{name:'Sınav Değerlendir',exact:true}).waitFor();
  const source=page.locator('.source-card').filter({has:page.getByRole('heading',{name:'Fotoğraf Toplu Oku',exact:true})});
  await source.locator('input[type="file"]').setInputFiles(image);await source.getByRole('button',{name:'Fotoğrafları Oku',exact:true}).click();
  const result=page.waitForEvent('download');await source.getByRole('button',{name:'TXT olarak indir',exact:true}).click();const download=await result;
  const output='tmp/camera-photo-browser/synthetic-read.txt';await download.saveAs(output);const text=(await readFile(output,'utf8')).replace(/^\ufeff/,'').trim();
  const lines=text.split(/\r?\n/),columns=lines[0].split(';'),cells=lines[1].split(';');assert.equal(lines.length,2);
  const row=Object.fromEntries(columns.map((key,index)=>[key,cells[index]]));
  assert.equal(row.student_number,'1001');assert.equal(row.booklet,'A');for(const subject of ['MAT','TUR','FEN'])assert.equal(row['answers_'+subject],'ABCDEABCDE');
  const logout=await context.request.post(base+'/api/auth/logout');assert.equal(logout.status(),200);
  console.log(JSON.stringify({status:'passed',scope:'actual Chromium photo upload, template selection, fiducial/bubble reading and TXT export',expectedStudentNumber:'1001',expectedBooklet:'A',correctAnswerFields:3,productionTraffic:false,physicalPhone:false}));
 }finally{await context.close()}
}finally{await browser.close()}
