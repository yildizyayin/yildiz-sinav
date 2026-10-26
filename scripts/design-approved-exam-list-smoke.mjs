import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const out='docs/design/approved-exam-list';await mkdir(out,{recursive:true});
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[
 {id:'synthetic-1',title:'LGS Deneme 01',exam_type:'LGS',grade_level:8,academic_year:'2026-2027',publisher_name:'Örnek Yayınevi',participant_count:1240,booklet_codes:'A,B',status:'ACTIVE',app_channel_status:'ACTIVE'},
 {id:'synthetic-2',title:'TYT Türkiye Geneli 02',exam_type:'TYT',grade_level:12,academic_year:'2026-2027',publisher_name:'Örnek Yayınevi',participant_count:0,booklet_codes:'A,B',status:'DRAFT'},
 {id:'synthetic-3',title:'6. Sınıf Kazanım Denemesi',exam_type:'CUSTOM',grade_level:6,academic_year:'2026-2027',publisher_name:null,participant_count:120,booklet_codes:'A',status:'ACTIVE',app_channel_status:'ARCHIVED'},
 {id:'synthetic-4',title:'AYT Deneme 01',exam_type:'AYT',grade_level:12,academic_year:'2026-2027',publisher_name:'Örnek Yayınevi',participant_count:80,booklet_codes:'A,B,C,D',status:'CLOSED'},
 {id:'synthetic-5',title:'7. Sınıf Gelişim Sınavı',exam_type:'CUSTOM',grade_level:7,academic_year:'2026-2027',publisher_name:'Örnek Kurum',participant_count:130,booklet_codes:'A,B',status:'ACTIVE',app_channel_status:'ACTIVE'}];
const scenarios=[...[1440,1180,1024,768,390,360].map(width=>({theme:'ANUNEX_STANDARD',width,state:'data'})),...['ANUNEX_FOCUS','ANUNEX_STUDIO','ANUNEX_COSMIC','ANUNEX_NEON'].flatMap(theme=>[1440,390].map(width=>({theme,width,state:'data'}))),...['empty','error','loading','long'].flatMap(state=>[1440,390].map(width=>({theme:'ANUNEX_STANDARD',width,state}))),{theme:'ANUNEX_STANDARD',width:390,state:'institution'}];
const results=[];
const luminance=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
try{for(const scenario of scenarios){console.log('START',scenario);const {theme,width,state}=scenario;const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',timezoneId:'Europe/Istanbul'});const errors=[],apiCalls=[],held=[];
await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();apiCalls.push({method:req.method(),path:u.pathname+u.search});let value,status=200;
if(u.pathname==='/api/auth/me')value={ok:true,user:{id:'synthetic-design-user',role:state==='institution'?'INSTITUTION_MANAGER':'SUPER_ADMIN',display_name:'Örnek Yönetici',institution_id:state==='institution'?'synthetic-institution':null},institution:state==='institution'?{id:'synthetic-institution',name:'Örnek Kurum'}:null};
else if(u.pathname==='/api/panel-experience')value={ok:true,defaultTheme:theme,allowedThemes:[]};
else if(u.pathname==='/api/config')value={ok:true,productName:'ANUNEX',turnstileSiteKey:''};
else if(u.pathname==='/api/platform/exam-center/catalog'){
 if(state==='loading'){held.push(route);return;}
 if(state==='error'){status=503;value={ok:false,error:{code:'DESIGN_FIXTURE',message:'Sentetik katalog hatası.'}};}
 else value={ok:true,exams:state==='empty'?[]:u.searchParams.has('archived')?[{...rows[0],id:'synthetic-archive',title:'Arşivdeki Deneme',status:'ARCHIVED'}]:state==='long'?[{...rows[0],title:'Çok uzun sınav başlığı '.repeat(12),publisher_name:'Uzun yayınevi adı '.repeat(10)},...rows.slice(1)]:rows};
}else{status=503;value={ok:false,error:{code:'DESIGN_FIXTURE',message:'Bu sentetik içerik tanımlanmadı.'}};}
await route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});});
const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin+'/exam-center');await page.getByRole('heading',{name:'Kayıtlı sınavlar',exact:true}).waitFor().catch(async e=>{console.log('DIAGNOSTIC',await page.locator('body').innerText(),apiCalls,errors);throw e});
if(state==='loading'){await page.getByText('Sınavlar yükleniyor…',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Yenile',exact:true}).isDisabled());}
else if(state==='error')await page.locator('.approved-exam-list .alert.error').filter({hasText:'Sentetik katalog hatası.'}).waitFor();
else if(state==='empty')await page.getByText('Henüz eklenmiş sınav yok',{exact:true}).waitFor();
else{await page.locator('.approved-exam-list tbody tr').first().waitFor();assert.equal(await page.locator('.approved-exam-list tbody tr').count(),5);assert.equal(await page.locator('.approved-exam-view').count(),5);assert.equal(await page.locator('.approved-exam-title').first().getAttribute('href'),'/exam-center/synthetic-1');assert.equal(await page.locator('.approved-exam-view').first().getAttribute('href'),'/exam-center/synthetic-1');
assert.equal(await page.locator('.approved-exam-list a[href="/exam-channels"]').count(),state==='institution'?0:1);
if(theme==='ANUNEX_STANDARD'&&state==='data'){
 await page.getByLabel('Sınav ara',{exact:true}).fill('türkiye');assert.equal(await page.locator('.approved-exam-list tbody tr').count(),1);await page.getByLabel('Sınav ara',{exact:true}).fill('eşleşmeyen');await page.getByText('Aramaya uygun sınav bulunamadı',{exact:true}).waitFor();await page.getByLabel('Sınav ara',{exact:true}).fill('');
 await page.locator('.approved-exam-list .exam-filter-row select').selectOption('CLOSED');assert.equal(await page.locator('.approved-exam-list tbody tr').count(),1);await page.locator('.approved-exam-list .exam-filter-row select').selectOption('ARCHIVED');await page.getByText('Arşivdeki Deneme',{exact:true}).waitFor();assert(apiCalls.some(x=>x.path.endsWith('/catalog?archived=1')));await page.locator('.approved-exam-list .exam-filter-row select').selectOption('');await page.locator('.approved-exam-list tbody tr').nth(4).waitFor();
 const table=page.locator('.approved-exam-list .table-card');assert.equal(await table.evaluate(e=>getComputedStyle(e).overflowX),'auto');if(width<900)assert(await table.evaluate(e=>e.scrollWidth>e.clientWidth));
 await page.locator('.approved-exam-title').first().focus();assert.equal(await page.locator('.approved-exam-title').first().evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
 if(width===390){await page.getByRole('button',{name:'Menüyü aç',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().x>=-1);await page.locator('.mobile-nav-close').click();assert.equal(await page.getByRole('button',{name:'Menüyü aç',exact:true}).getAttribute('aria-expanded'),'false');}
 if(width===1440){const selectors=['h1','.eyebrow','.exam-center-simple-head p','label','th','td','.approved-exam-title','td small','.status','.primary','.secondary','.ghost'];const samples=await page.locator('.approved-exam-list').evaluate((root,selectors)=>selectors.flatMap(selector=>[...root.querySelectorAll(selector)].filter(e=>e.textContent.trim()).map(e=>{let bg=e;while(bg&&['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(bg).backgroundColor))bg=bg.parentElement;return{selector,fg:getComputedStyle(e).color,bg:bg?getComputedStyle(bg).backgroundColor:'rgb(255, 255, 255)'};})),selectors);const ratios=samples.map(s=>{const a=luminance(s.fg),b=luminance(s.bg);return{...s,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});assert(ratios.every(s=>s.ratio>=4.5),JSON.stringify(ratios.filter(s=>s.ratio<4.5)));console.log('minimum sampled contrast',Math.min(...ratios.map(s=>s.ratio)));for(const c of await page.locator('.approved-exam-list :is(a,button,input,select)').all())assert((await c.boundingBox()).height>=40);await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.approved-exam-title').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');}
}
}
assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),`Page overflow ${JSON.stringify(scenario)}`);assert.deepEqual(errors,[]);assert(apiCalls.every(x=>x.method==='GET'),'Unexpected data mutation');
if(theme==='ANUNEX_STANDARD'&&state!=='institution'&&([1440,390].includes(width))){await page.getByRole('heading',{name:'Kayıtlı sınavlar',exact:true}).click();await page.mouse.move(width-1,1);await page.screenshot({path:`${out}/${state}-${width}.png`,fullPage:true,animations:'disabled',timeout:45000});await page.emulateMedia({media:'print',reducedMotion:'reduce'});assert.equal(await page.locator('.sidebar').evaluate(e=>getComputedStyle(e).display),'none');}
results.push({...scenario,passed:true,renderErrors:errors});for(const route of held)await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exams:rows})}).catch(()=>{});await context.close();}
await writeFile(`${out}/verification.json`,JSON.stringify(results,null,2));console.log('PASSED',results.length);
}finally{await browser.close();await server.close();}
