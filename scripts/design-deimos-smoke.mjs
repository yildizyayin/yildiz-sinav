import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const out='docs/design/approved-deimos';await mkdir(out,{recursive:true});
const cases=[...[1440,1024,768,390,360].map(width=>({width,state:'ready',theme:'ANUNEX_STANDARD'})),...['empty','error','busy','uncalibrated'].flatMap(state=>[1440,390].map(width=>({width,state,theme:'ANUNEX_STANDARD'}))),...['ANUNEX_FOCUS','ANUNEX_STUDIO','ANUNEX_COSMIC','ANUNEX_NEON'].map(theme=>({width:390,state:'ready',theme}))];
const results=[];
try{for(const c of cases){
 const context=await browser.newContext({viewport:{width:c.width,height:1000},serviceWorkers:'block'}),errors=[],writes=[],held=[];
 await context.addInitScript(()=>{window.print=()=>{window.__qaPrints=(window.__qaPrints||0)+1;};});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==server.origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(req.method()!=='GET'){writes.push(u.pathname);return route.abort();}
  let body={ok:true},status=200;
  if(u.pathname==='/api/auth/me')body={ok:true,user:{id:'qa',role:'SUPER_ADMIN',display_name:'Örnek Yetkili'}};
  else if(u.pathname==='/api/config')body={ok:true,productName:'ANUNEX',turnstileSiteKey:''};
  else if(u.pathname==='/api/panel-experience')body={ok:true,defaultTheme:c.theme,allowedThemes:[]};
  else if(u.pathname==='/api/institutions')body={ok:true,institutions:[{id:'school',name:'Örnek Kurum'}]};
  else if(u.pathname==='/api/classes')body={ok:true,classes:[{id:'class',name:'8 / A',student_count:2}]};
  else if(u.pathname==='/api/exams')body={ok:true,exams:[{id:'exam',title:'Örnek Deneme'}]};
  else if(u.pathname==='/api/printer-profiles')body={ok:true,profiles:c.state==='empty'?[]:[{id:'printer',name:'Örnek Yazıcı'}]};
  else if(u.pathname==='/api/calibrations')body={ok:true,calibrations:c.state==='uncalibrated'?[]:[{printer_profile_id:'printer',optical_template_version_id:'version',status:'READY',offset_x_mm:1,offset_y_mm:2,scale_x:1,scale_y:1,rotation_deg:0}]};
  else if(u.pathname==='/api/optical-templates')body={ok:true,templates:c.state==='empty'?[]:[{id:'optic',version_id:'version',name:'Örnek Optik',has_print:true}]};
  else if(u.pathname==='/api/optical-prepare'){
   if(c.state==='busy'){held.push(route);return;}
   if(c.state==='error'){status=503;body={ok:false,error:{code:'QA',message:'Sentetik baskı hazırlama hatası.'}};}
   else body={ok:true,class:{name:'8 / A'},students:[{id:'one',student_number:'101',first_name:'Örnek',last_name:'Öğrenci 1',grade_level:8,section:'A',booklet_code:'A'},{id:'two',student_number:'102',first_name:'Örnek',last_name:'Öğrenci 2',grade_level:8,section:'A',booklet_code:'B'}],bookletCodes:['A','B'],institution:{code:'QA'},template:{id:'version',pageWidthMm:210,pageHeightMm:297,printFields:{fields:[{key:'studentName',xMm:15,yMm:15,fontSizePt:9}]}}};
  }else if(u.pathname==='/api/v2/optical-print-base')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="white"/><text x="55" y="100" fill="black">SENTETİK BASKI KONTROLÜ</text></svg>'});
  else{status=503;body={ok:false,error:{code:'QA_UNAVAILABLE',message:'Sentetik kapsam dışında.'}};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin+'/optical-prepare');await page.getByRole('heading',{name:'Optik Basma',exact:true}).waitFor();
 const prepare=page.getByRole('button',{name:'Baskıyı Hazırla',exact:true});
 if(c.state==='empty'){await page.getByText('Henüz baskı alanı tanımlanmış optik yok.',{exact:true}).waitFor();assert(await prepare.isDisabled());}
 else{await page.waitForFunction(()=>!document.querySelector('.approved-deimos-settings > button')?.disabled);await prepare.click();
  if(c.state==='busy'){await page.getByRole('button',{name:'Hazırlanıyor…',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Hazırlanıyor…',exact:true}).isDisabled());}
  else if(c.state==='error')await page.getByText('Sentetik baskı hazırlama hatası.',{exact:true}).waitFor();
  else{await page.locator('.approved-deimos-students').waitFor();const print=page.getByRole('button',{name:'Seçilenleri Yazdır',exact:true});assert.equal(await page.locator('.print-optical-page').count(),2);
   if(c.state==='uncalibrated')assert(await print.isDisabled());else{assert(await print.isEnabled());await print.click();assert.equal(await page.evaluate(()=>window.__qaPrints),1);}
   const check=page.getByLabel('Tümünü seç',{exact:true});await check.uncheck();assert(await print.isDisabled());assert.equal(await page.locator('.print-optical-page').count(),0);await check.check();
   const geometry=e=>({width:getComputedStyle(e).width,height:getComputedStyle(e).height,transform:getComputedStyle(e.firstElementChild).transform});const before=await page.locator('.print-optical-page').first().evaluate(geometry);await page.emulateMedia({media:'print'});assert.deepEqual(before,await page.locator('.print-optical-page').first().evaluate(geometry));assert.equal(await page.locator('.optical-controls').first().evaluate(e=>getComputedStyle(e).display),'none');await page.emulateMedia({media:'screen'});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Page overflow '+JSON.stringify(c));
 if(c.theme==='ANUNEX_STANDARD'){
  const root=page.locator('.approved-deimos');for(const control of await root.locator('button,a,input,select').all())if(await control.isVisible())assert((await control.boundingBox()).height>=40,'Touch target under40 '+await control.textContent());
  await page.keyboard.press('Tab');await page.getByRole('button',{name:'Yenile',exact:true}).focus();assert.equal(await page.getByRole('button',{name:'Yenile',exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
  if(c.width===1440){const colors=await root.evaluate(root=>[...root.querySelectorAll('h1,h2,p,label,th,td,strong,.status,button,a,.success-box span')].filter(e=>e.checkVisibility()&&!e.matches(':disabled')&&!e.closest('button:disabled')&&e.textContent.trim()).map(e=>{let bg=e;while(bg&&['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(bg).backgroundColor))bg=bg.parentElement;return{text:e.textContent.trim().slice(0,40),fg:getComputedStyle(e).color,bg:bg?getComputedStyle(bg).backgroundColor:'rgb(255, 255, 255)'}}));const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const samples=colors.map(s=>{const a=lum(s.fg),b=lum(s.bg);return{...s,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});assert(samples.every(s=>s.ratio>=4.5),JSON.stringify(samples.filter(s=>s.ratio<4.5)));console.log('Min contrast',Math.min(...samples.map(s=>s.ratio)));}
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await root.locator('button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  if(c.width===390&&c.state==='ready'){await page.getByRole('button',{name:'Menüyü aç',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().x>=-1);await page.locator('.mobile-nav-close').click();}
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${c.state}-${c.width}.png`,fullPage:true,animations:'disabled'});
 }
 for(const route of held)await route.abort().catch(()=>{});results.push({...c,passed:true});console.log('PASS',c);await context.close();
}await writeFile(out+'/verification.json',JSON.stringify(results,null,2));}finally{await browser.close();await server.close();}
