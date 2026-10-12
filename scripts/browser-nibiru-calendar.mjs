import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';

const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE||undefined});
const passed=[];
await mkdir('tmp/nibiru-calendar-browser',{recursive:true});
async function scenario(name,role,run,mobile=false){
 const context=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
 const errors=[],unknown=[],posts=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==server.origin){await route.abort();return}if(!url.pathname.startsWith('/api/')){await route.continue();return}
  if(route.request().method()==='POST')posts.push({path:url.pathname,body:route.request().postDataJSON()});
  const user=role?{id:'synthetic',role,institution_id:role==='SUPER_ADMIN'?null:'school',student_id:role==='STUDENT'?'student-one':null,display_name:'Sentetik Kullanıcı',must_change_password:false}:null;
  const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const event={id:'synthetic-plan',occurrenceId:'synthetic-plan:one',title:'Matematik çalışma planı',kind:'STUDY',scope:'PERSONAL',source:'CALENDAR',starts_at:`${now}T15:00:00+03:00`,ends_at:`${now}T16:00:00+03:00`,status:'PLANNED',reminder_minutes:30,revision:1,recurrence:'NONE',editable:true,url:'/calendar'};
  const fixtures={
   '/api/auth/me':role?[200,{ok:true,user,institution:role==='SUPER_ADMIN'?null:{name:'Sentetik Kurum',status:'ACTIVE'}}]:[401,{ok:false,error:{code:'UNAUTHENTICATED',message:'Hesabınızı doğrulayın.'}}],
   '/api/config':[200,{ok:true,productName:'ANUNEX',turnstileSiteKey:''}],
   '/api/auth/login':[401,{ok:false,error:{code:'INVALID_CREDENTIALS',message:'Sentetik doğrulama reddi'}}],
   '/api/nibiru/public-chat':[200,{ok:true,answer:'Kişisel bilgileri açmadan önce hesabınızı doğrulayın.',mode:'GUEST_INFORMATION'}],
   '/api/platform/features':[200,{ok:true,features:[]}],
   '/api/panel-experience':[200,{ok:true,defaultTheme:'ANUNEX_STANDARD',allowedThemes:[]}],
   '/api/license/status':[200,{ok:true,license:{locked:false,planCode:'LEGACY'}}],
   '/api/calendar/options':[200,{ok:true,classes:[],subjects:[],scopes:['PERSONAL'],institutions:[],students:[],timezone:'Europe/Istanbul'}],
   '/api/calendar':route.request().method()==='POST'?[201,{ok:true,id:'created'}]:[200,{ok:true,events:[event],truncated:false}],
   '/api/nibiru/identity':[200,{ok:true,students:role==='PARENT'?[{id:'student-one',name:'Birinci Öğrenci',grade_level:7},{id:'student-two',name:'İkinci Öğrenci',grade_level:9}]:[]}],
   '/api/nibiru/voice/status':[200,{ok:true,providers:{}}],
   '/api/auth/passkeys':[200,{ok:true,passkeys:[]}],
   '/api/nibiru/chat':[200,{ok:true,answer:'Seçili öğrencinin yetkili gelişim bilgileri.',orchestration:{label:'Veli desteği'}}],
   '/api/dashboard':[200,{ok:true,cards:[{label:'Aktif kurumlar',value:12},{label:'Öğrenciler',value:250}],pending:{},institutionSummary:{},systemHealth:[],recentActivity:[]}]
  };
  const fixture=fixtures[url.pathname];if(!fixture){unknown.push(url.pathname);await route.abort();return}await route.fulfill({status:fixture[0],contentType:'application/json',body:JSON.stringify(fixture[1])});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 try{await run(page,posts);assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);await page.screenshot({path:`tmp/nibiru-calendar-browser/${name}.png`,fullPage:true});passed.push(name)}catch(error){await page.screenshot({path:`tmp/nibiru-calendar-browser/failure-${name}.png`,fullPage:true});console.error(JSON.stringify({scenario:name,errors,unknown,body:(await page.locator('body').innerText()).slice(0,1500)}));throw error}finally{await context.close()}
}
try{
 await scenario('guest-mobile',null,async(page)=>{await page.goto(server.origin+'/nibiru');await page.getByRole('heading',{name:'Hesabımı tanı'}).waitFor();assert.equal(new URL(page.url()).pathname,'/nibiru');await page.getByLabel('Nibiru hakkında ne öğrenmek istersiniz?').fill('Çocuğumun sonucunu göster');await page.getByRole('button',{name:'Sor',exact:true}).click();await page.getByText('Kişisel bilgileri açmadan önce hesabınızı doğrulayın.',{exact:true}).waitFor();assert.equal(await page.locator('.sidebar').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))},true);
 await scenario('parent-selection','PARENT',async(page,posts)=>{await page.goto(server.origin+'/nibiru-direct');await page.getByText('Hangi öğrencimiz hakkında konuşalım?').waitFor();await page.getByRole('button',{name:'Öğrencim nasıl?',exact:true}).click();await page.getByText('Önce hakkında konuşacağınız öğrenciyi seçin.').waitFor();await page.locator('.nibiru-student-select select').selectOption('student-two');await page.getByRole('button',{name:'Öğrencim nasıl?',exact:true}).click();await page.getByText('Seçili öğrencinin yetkili gelişim bilgileri.').waitFor();assert.equal(posts.find(x=>x.path==='/api/nibiru/chat').body.studentId,'student-two')});
 for(const role of ['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT']){
  await scenario(`calendar-${role.toLowerCase()}`,role,async(page)=>{await page.goto(server.origin+'/calendar');await page.getByRole('heading',{name:'Takvim Merkezi'}).waitFor();await page.getByRole('heading',{name:'Matematik çalışma planı'}).waitFor();await page.getByRole('button',{name:'Gün',exact:true}).click();await page.getByRole('button',{name:'Plan ekle',exact:true}).click();await page.getByLabel('Başlık',{exact:true}).fill('Sentetik plan');await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();await page.getByText('Plan kaydedildi.',{exact:true}).waitFor();assert.equal(await page.locator('.app-shell').getAttribute('data-panel-theme'),'ANUNEX_STANDARD');if(role==='STUDENT'){await page.getByRole('button',{name:'Menüyü aç',exact:true}).click();await page.locator('.sidebar').waitFor();assert.equal(await page.locator('.app-shell').getAttribute('class').then(x=>x.includes('nav-open')),true);await page.locator('.mobile-nav-close').click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}},role==='STUDENT');
 }
 await scenario('astra-super-admin','SUPER_ADMIN',async(page)=>{await page.goto(server.origin+'/');await page.getByRole('heading',{name:'Yönetim özeti'}).waitFor();await page.getByText('250',{exact:true}).waitFor();const background=await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(background,'rgb(245, 247, 243)')});
 console.log(JSON.stringify({status:'passed',scenarios:passed,scope:'production assets with synthetic API fixtures; independent runtime tests verify actual SQL and WebAuthn; screenshots in artifact'},null,2));
}finally{await browser.close();await server.close()}
