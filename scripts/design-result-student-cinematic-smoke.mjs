import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const out='docs/design/result-student-cinematic';await mkdir(out,{recursive:true});
const server=await startBrowserSmokeServer('dist/client');
let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});}catch(error){await server.close();throw error;}
const school={id:'synthetic-school',code:'123456',name:'Örnek Kurum',city:'Örnek İl',district:'Örnek İlçe'};
const results=[];
const scenarios=[{name:'young-desktop',grade:5,width:1440},{name:'senior-desktop',grade:12,width:1440},{name:'young-mobile',grade:6,width:390},{name:'senior-small',grade:8,width:360},{name:'neutral',grade:4,width:390},{name:'graduate',grade:'mezun',width:390},{name:'skip',grade:12,width:390,action:'skip'},{name:'escape',grade:12,width:390,action:'escape'},{name:'reduced',grade:5,width:390,reduced:true},{name:'motion-change',grade:12,width:390,action:'motion-change'},{name:'restored',grade:5,width:390,restore:true}];
try{for(const test of scenarios){
 const context=await browser.newContext({viewport:{width:test.width,height:900},serviceWorkers:'block',reducedMotion:test.reduced?'reduce':'no-preference',...(test.name==='young-mobile'&&process.env.ANUNEX_RECORD_ENTRANCE_VIDEO==='1'?{recordVideo:{dir:out+'/video',size:{width:390,height:900}}}:{})});
 let signedIn=!!test.restore;const errors=[],writes=[],requests=[];
 await context.addInitScript(()=>{window.turnstile={render(_el,options){queueMicrotask(()=>options.callback('SYNTHETIC-TOKEN'));return 'synthetic';},remove(){},reset(){}};});
 if(test.restore)await context.addInitScript(()=>sessionStorage.setItem('anunex_result_role','STUDENT'));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==server.origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  requests.push(url.pathname);if(request.method()!=='GET')writes.push(url.pathname);
  let status=200,data={ok:true};
  if(url.pathname==='/api/auth/me'){status=401;data={ok:false,error:{code:'UNAUTHENTICATED',message:'Sentetik oturum yok.'}};}
  else if(url.pathname==='/api/public/results/config')data={ok:true,turnstileSiteKey:'synthetic-key',copy:{}};
  else if(url.pathname==='/api/public/results/locations')data=url.searchParams.has('city')?{ok:true,districts:[school.district]}:{ok:true,cities:[school.city]};
  else if(url.pathname==='/api/public/results/institutions')data={ok:true,institutions:[school]};
  else if(url.pathname==='/api/public/results/login'){signedIn=true;}
  else if(url.pathname==='/api/public/results/student'){
   if(!signedIn){status=401;data={ok:false,error:{code:'UNAUTHENTICATED',message:'Sentetik oturum yok.'}};}
   else data={ok:true,student:{name:'Örnek Öğrenci',institution:school.name,gradeLevel:test.grade},countdown:{code:'LGS',title:'LGS',status:'PENDING',date:null},exams:[],tips:[],unavailableSnapshotExamIds:[]};
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.origin+'/?site=results');
 if(!test.restore){
  await page.locator('.result-role-grid button').filter({hasText:'Öğrenci Sonuç'}).click();
  const location=page.locator('.student-login .sl-group').first().locator('select');
  await location.nth(0).selectOption(school.city);await location.nth(1).selectOption(school.district);await location.nth(2).selectOption(school.code);
  await page.locator('.student-login .sl-group').nth(1).locator('select').first().selectOption('8');
  await page.getByLabel('Öğrenci numarası',{exact:true}).fill('1001');await page.getByLabel('Adının ilk 3 harfi',{exact:true}).fill('ÖRN');
  await page.getByRole('button',{name:'Sonucumu göster',exact:true}).click();
 }
 if(test.restore||test.reduced){await page.locator('.result-dashboard').waitFor();assert.equal(await page.locator('.rsp-entrance').count(),0);}
 else{
  const intro=page.getByRole('dialog',{name:'ANUNEX karşılama',exact:true});await intro.waitFor();
  const shownAt=Date.now(),tone=[5,6,7].includes(test.grade)?'young':test.grade===4?'neutral':'senior';
  assert(await intro.evaluate((e,tone)=>e.classList.contains('rsp-entrance-'+tone),tone));
  assert(await intro.evaluate(e=>e.open));assert(await intro.getByRole('button',{name:/Atla/}).evaluate(e=>e===document.activeElement));
  assert((await intro.getByRole('button',{name:/Atla/}).boundingBox()).height>=40);
  assert.equal(await intro.getByRole('button',{name:/Atla/}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
  assert.equal(await intro.getByRole('button',{name:/Atla/}).evaluate(e=>getComputedStyle(e).outlineColor),'rgb(160, 221, 255)');
  if(test.action==='skip')await intro.getByRole('button',{name:/Atla/}).click();
  else if(test.action==='escape')await page.keyboard.press('Escape');
  else if(test.action==='motion-change')await page.emulateMedia({reducedMotion:'reduce'});
  else{
   await page.waitForTimeout(650);
   assert(await intro.locator('canvas').evaluate(e=>e.width>0&&e.height>0&&e.getContext('2d').getImageData(0,0,e.width,e.height).data.some((v,i)=>i%4===3&&v>0)),'Particle canvas has no pixels');
   await page.screenshot({path:`${out}/${test.name}.png`});
  }
  await intro.waitFor({state:'detached'});
  const elapsed=Date.now()-shownAt;assert(elapsed<2300,`Entrance too long: ${elapsed} ms`);
  assert(await page.evaluate(()=>!document.activeElement?.closest('.rsp-entrance')));
  results.push({name:test.name,elapsedMs:elapsed,tone});
  await page.reload();await page.locator('.result-dashboard').waitFor();assert.equal(await page.locator('.rsp-entrance').count(),0);
 }
 assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Page horizontal overflow');
 assert.deepEqual(errors,[]);assert(writes.every(path=>path==='/api/public/results/login'));
 if(test.restore||test.reduced)results.push({name:test.name,entranceShown:false});
 const video=page.video();await context.close();if(video)await video.saveAs(out+'/young-mobile.webm');
 console.log('PASS',test.name);
}
 await writeFile(out+'/verification.json',JSON.stringify({synthetic:true,base:'8eac120',scenarios:results},null,2));
}finally{await browser.close();await server.close();}
