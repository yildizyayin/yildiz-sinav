import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const out='docs/design/approved-question-team';await mkdir(out,{recursive:true});
const cases=[...[1440,1180,1024,768,390,360].map(width=>({width,state:'data',theme:'ANUNEX_STANDARD'})),...['ANUNEX_FOCUS','ANUNEX_STUDIO','ANUNEX_COSMIC','ANUNEX_NEON'].flatMap(theme=>[1440,390].map(width=>({width,state:'data',theme}))),...['empty','error','loading','busy','success','control-error','paused','questions','media','history','year','long','reduced-motion'].map(state=>({width:390,state,theme:'ANUNEX_STANDARD'}))];
const selected=process.env.ANUNEX_TEAM_CASE?cases.filter(c=>JSON.stringify(c).includes(process.env.ANUNEX_TEAM_CASE)):cases,results=[];
const fixture=state=>({ok:true,environment:'staging',asOf:'2026-11-02T08:00:00Z',controlsEnabled:true,control:{paused:state==='paused',revision:7},
 roster:[{key:'GENERATOR',name:'Soru yazarı',status:state==='paused'?'PAUSED':'READY',model:'Sentetik üretici',activeJobs:0,paused:state==='paused',controlRevision:2},{key:'VERIFIER',name:'Bağımsız denetçi',status:'READY',model:'Sentetik denetçi',activeJobs:0,paused:false,controlRevision:3},{key:'ORIGINALITY',name:'Özgünlük incelemesi',status:'READY',model:'Benzerlik kontrolü',activeJobs:0,paused:false,controlRevision:1},{key:'VIDEO',name:'Video üretimi',status:'CONFIG_ERROR',model:'Sağlayıcı yapılandırılmamış',activeJobs:0,paused:false,controlRevision:1,limitation:'Öğrenciye açık video üretilmiyor.'}],
 budget:{mode:'LIMITED',cap:50,reserved:45,remaining:5},usage:{reportedTokens:500},questionCounts:{REVIEW:10,APPROVED:0},
 scheduler:{academicYear:'2027-2028',executionEnabled:false,ready:false,reasons:['EXECUTION_NOT_ENABLED','REVIEW_CAPACITY_REQUIRED'],queuedReviewCount:10,availableReviewSlots:0,lastTick:{at:'2026-11-02T08:00:00Z',outcome:'IDLE_REVIEW_QUEUE_FULL'},generatorComparison:[{model:'UNRECORDED',jobs:3,screened:0,outputInvalid:2,qualityRejected:1,otherFailed:0,humanApproved:0,humanRejected:0}]},
 productionTarget:{approved:0,dailyAcceptedRequired:10000,hourlyAcceptedRequired:417,scenarios:[{}, {dailyRawRequired:12500}],throughputVerified:false},
 jobs:state==='empty'?[]:[{id:'qa-job',context:{outcomeCode:'QA-01',outcomeTitle:state==='long'?'Sentetik kapsam açıklaması '.repeat(18):'Sentetik kontrol kaydı — resmî kazanım değildir'},status:'REQUESTED',qualityProfile:'EDITORIAL_V1',presentation:'TABLE',taskFocus:'GENERIC',priority:1,generatedCount:0,questionCount:1,attemptCount:0,instructionNote:'Yalnız görsel doğrulama verisi.'},{id:'qa-failed',context:{outcomeCode:'QA-02',outcomeTitle:'Sentetik başarısız iş'},status:'FAILED',qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'GENERIC',priority:1,generatedCount:0,questionCount:1,attemptCount:3,errorCode:'QA_FAILURE',editorialRepairCount:1,editorialVerifyRetryCount:1}],
 questions:[{id:'qa-question',stem_text:'Sentetik inceleme kaydı; öğrenci içeriği değildir.',grade_level:5,review_status:'REVIEW',copyright_status:'RESTRICTED',review_revision:2}],activity:[{id:'qa-event',created_at:'2026-11-02T08:00:00Z',action:'QA_CHECK',entity_id:'qa-job'}],controlEvents:[{created_at:'2026-11-02T08:00:00Z',agent_key:'TEAM',paused:1,revision:7,actor_id:'Sentetik yetkili'}],videoProof:{technicalVerified:false,studentVideoCount:0}});
try{for(const c of selected){console.log('START',c);const context=await browser.newContext({viewport:{width:c.width,height:1000},serviceWorkers:'block'}),errors=[],writes=[],requests=[],held=[];
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();requests.push(u.pathname);let body={ok:true},status=200;
  if(req.method()!=='GET'){
   writes.push({path:u.pathname,method:req.method(),body:req.postDataJSON()});
   if(u.pathname!=='/api/question-bank-standard/team/control')throw Error('Unexpected write '+u.pathname);
   if(c.state==='busy'){held.push(route);return;}
   if(c.state==='control-error'){status=409;body={ok:false,error:{code:'QA_CONFLICT',message:'Sentetik kontrol çakışması.'}};}
  }else if(u.pathname==='/api/auth/me')body={ok:true,user:{id:'qa-user',role:'SUPER_ADMIN',display_name:'Örnek Yetkili'}};
  else if(u.pathname==='/api/config')body={ok:true,productName:'ANUNEX',turnstileSiteKey:''};
  else if(u.pathname==='/api/panel-experience')body={ok:true,defaultTheme:c.theme,allowedThemes:[]};
  else if(u.pathname==='/api/question-bank-standard/team'){
   if(c.state==='loading'){held.push(route);return;}
   if(c.state==='error'){status=503;body={ok:false,error:{code:'QA_UNAVAILABLE',message:'Sentetik ekip verisi hatası.'}};}else body=fixture(c.state);
  }else if(u.pathname==='/api/question-bank-standard/media-jobs')body={ok:true,rendererEnabled:false,narrationConfigured:false,jobs:[{id:'qa-video',questionId:'qa-question',sourceRevision:2,outputSha256:'qa-hash',status:'REVIEW',attemptCount:0,narrationMode:'CAPTIONS',synthetic:false,previewUrl:'data:video/mp4;base64,'}]};
  else if(u.pathname==='/api/question-bank-standard/coverage')body={ok:true,items:[{id:'qa-outcome',academicYear:u.searchParams.get('academicYear'),gradeLevel:5,code:'QA-01',title:'Sentetik kayıt — resmî kazanım değildir',subjectId:'qa-math',curriculumVersionId:'qa-version',programVersion:'QA'}]};
  else if(u.pathname==='/api/question-bank-standard/team/branch-readiness')body={ok:true,academicYear:u.searchParams.get('academicYear'),targetAcademicYear:'2027-2028',environment:'staging',summary:{importedVersions:1,expectedVersions:2,observedOutcomes:1,expectedOutcomes:2},subjects:[{subject:'MAT',grade:5,observedOutcomes:1,expectedOutcomes:2,approvedQuestions:0,imported:true}],sourceIssues:[],note:'Yalnız sentetik görünüm kontrolü; resmî müfredat aktarımı değildir.'};
  else if(u.pathname==='/api/open-ended-jobs')body={ok:true,jobs:[],enabled:false};
  else if(u.pathname==='/api/written-scenarios/subjects')body={ok:true,subjects:[{id:'qa-math',name:'Matematik'}]};
  else {status=503;body={ok:false,error:{code:'QA_OUTSIDE_SCOPE',message:'Sentetik kapsam dışında.'}};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin+'/question-team');await page.getByRole('heading',{name:'Soru havuzu ekibi',exact:true}).waitFor();const root=page.locator('.approved-question-team');
 if(c.state==='error')await page.getByText('Sentetik ekip verisi hatası.',{exact:true}).waitFor();else if(c.state==='loading')await page.getByText('Gerçek ekip kayıtları yükleniyor…',{exact:true}).waitFor();else{
  await page.getByRole('heading',{name:'Ekip ve yürütme',exact:true}).waitFor();assert(await root.getByText('45 / 50',{exact:true}).isVisible());assert.equal(await root.getByRole('button',{name:'Görevi kaydet',exact:true}).isDisabled(),true);
  assert.equal(await root.getByRole('button',{name:'Üret ve kontrol et',exact:true}).isDisabled(),true);
  if(c.state==='empty')await page.getByText('Bu yılda üretim işi bulunmuyor.',{exact:true}).waitFor();
  if(['busy','success','control-error'].includes(c.state)){
   await root.getByRole('button',{name:'Ekibi duraklat',exact:true}).click();
   if(c.state==='busy'){await page.waitForFunction(()=>document.querySelector('.qt-tools select')?.disabled);assert(await root.getByRole('button',{name:'Ekibi duraklat',exact:true}).isDisabled());}
   else await page.getByText(c.state==='success'?'Duraklatma kaydedildi.':'Sentetik kontrol çakışması.',{exact:true}).waitFor();
   assert.deepEqual(writes[0],{path:'/api/question-bank-standard/team/control',method:'PATCH',body:{agentKey:'TEAM',paused:true,expectedRevision:7}});
  }
  if(c.state==='paused'){assert(await root.getByRole('button',{name:'Ekibi sürdür',exact:true}).isVisible());for(const b of await root.getByRole('button',{name:'Çalıştır',exact:true}).all())assert(await b.isDisabled());}
  if(['questions','media','history'].includes(c.state)){
   await root.getByRole('button',{name:({questions:'Soru incelemesi',media:'Medya ve video',history:'İşlem geçmişi'})[c.state],exact:true}).click();
   if(c.state==='questions'){await page.getByText('RESTRICTED',{exact:true}).waitFor();assert.equal(await root.getByRole('button',{name:'Onayla',exact:true}).count(),0);}
   if(c.state==='history')await page.getByRole('heading',{name:'İşlem ve kontrol geçmişi',exact:true}).waitFor();
   if(c.state==='media'){
    assert(await root.getByRole('button',{name:'Video işi oluştur',exact:true}).isDisabled());await root.getByRole('button',{name:'İzle / incele',exact:true}).click();
    const approve=root.getByRole('button',{name:'İncelemeyi kaydet ve soruya bağla',exact:true});assert(await approve.isDisabled());
    const checks=root.locator('input[type=checkbox]');for(const check of await checks.all())await check.check();assert(await approve.isDisabled());
    await root.locator('fieldset select').selectOption('OWNED');assert(await approve.isEnabled());
   }
  }
  if(c.state==='year'){await root.locator('.qt-tools select').selectOption('2026-2027');await page.getByRole('heading',{name:'Branş ve müfredat kapsamı · 2026-2027',exact:true}).waitFor();assert.equal(await root.getByRole('button',{name:'Görevi kaydet',exact:true}).isDisabled(),true);}
 }
 assert.deepEqual(errors,[]);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Page overflow '+JSON.stringify(c));
 if(c.theme==='ANUNEX_STANDARD'){
  for(const ctl of await root.locator('button,input:not([type=checkbox]),select').all())if(await ctl.isVisible())assert((await ctl.boundingBox()).height>=40,'Target below40 '+await ctl.textContent());
  const focus=root.getByRole('button',{name:'Yenile',exact:true});if(await focus.isEnabled()){await page.keyboard.press('Tab');await focus.focus();assert.equal(await focus.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');}
  if(c.state==='reduced-motion'){await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await root.getByRole('button',{name:'Yenile',exact:true}).evaluate(e=>getComputedStyle(e).transitionDuration),'0s');}
  if(c.width===1440){
   const samples=await root.evaluate(r=>[...r.querySelectorAll('h1,h2,p,label,small,strong,button,a,th,td,span.qt-status')].filter(e=>e.checkVisibility()&&e.textContent.trim()&&!e.matches(':disabled')&&!e.closest('button:disabled')).map(e=>{let bg=e;while(bg&&['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(bg).backgroundColor))bg=bg.parentElement;return{text:e.textContent.trim().slice(0,60),fg:getComputedStyle(e).color,bg:bg?getComputedStyle(bg).backgroundColor:'rgb(255, 255, 255)'}}));
   const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const ratios=samples.map(x=>{const a=lum(x.fg),b=lum(x.bg);return{...x,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});assert(ratios.every(x=>x.ratio>=4.5),JSON.stringify(ratios.filter(x=>x.ratio<4.5)));console.log('Minimum contrast',Math.min(...ratios.map(x=>x.ratio)));
  }
 }
 if(c.theme==='ANUNEX_STANDARD'&&[1440,390].includes(c.width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${c.state}-${c.width}.png`,fullPage:true,animations:'disabled'});if(c.state==='data')await page.screenshot({path:`${out}/overview-${c.width}.png`,animations:'disabled'});}
 if(c.width===390&&c.state==='data'&&c.theme==='ANUNEX_STANDARD'){await page.getByRole('button',{name:'Menüyü aç',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().x>=-1);await page.locator('.mobile-nav-close').click();}
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sidebar').evaluate(e=>getComputedStyle(e).display),'none');for(const r of held)await r.abort().catch(()=>{});assert.equal(writes.length,['busy','success','control-error'].includes(c.state)?1:0);results.push({...c,passed:true,writes});await context.close();console.log('PASS',c);
}await writeFile(out+(process.env.ANUNEX_TEAM_CASE?'/verification-subset.json':'/verification.json'),JSON.stringify(results,null,2));}finally{await browser.close();await server.close();}
