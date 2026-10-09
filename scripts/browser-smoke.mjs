import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';

const server=await startBrowserSmokeServer('dist/client');
let browser;
const passed=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE||undefined});
 const manifest=JSON.parse(await readFile('dist/client/.vite/manifest.json','utf8'));
 async function scenario(name,run,{mobile=false,failedLoginChunk=false}={}){
  const context=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1440,height:900}});
  let page; const unknown=[],errors=[],assets=[];
  try{
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==server.origin){await route.abort();return}
    if(!url.pathname.startsWith('/api/')){await route.continue();return}
    const values={
     '/api/auth/me':[401,{ok:false,error:{code:'UNAUTHORIZED',message:'Synthetic unauthenticated session'}}],
     '/api/config':[200,{ok:true,productName:'Synthetic acceptance',turnstileSiteKey:''}],
     '/api/auth/login':[401,{ok:false,error:{code:'INVALID_CREDENTIALS',message:'Sentetik giriş reddi'}}],
     '/api/public/results/config':[200,{ok:true,turnstileSiteKey:''}]
    };
    const result=values[url.pathname];if(!result){unknown.push(url.pathname);await route.abort();return}
    await route.fulfill({status:result[0],contentType:'application/json',body:JSON.stringify(result[1])});
   });
   page=await context.newPage();page.setDefaultTimeout(15_000);
   page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())});page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.resourceType()==='script')assets.push(new URL(request.url()).pathname)});
   if(failedLoginChunk)await page.route(server.origin+'/'+manifest['src/pages/Login.tsx'].file,route=>route.fulfill({status:404,contentType:'text/javascript',body:'missing'}));
   await run(page,assets);
   assert.deepEqual(unknown,[],'Unexpected API calls need explicit fixtures.');
   if(!failedLoginChunk)assert.deepEqual(errors,[],'Unexpected browser rendering errors.');
   passed.push(name);
  }catch(error){console.error(JSON.stringify({scenario:name,url:page?.url(),errors,unknown,body:page?await page.locator('body').innerText().catch(()=>'<unavailable>'):'<no page>'}));throw error}finally{await context.close()}
 }
 await scenario('login controls and rejected credentials',async(page,assets)=>{
  await page.goto(server.origin+'/login');await page.getByRole('heading',{name:'Synthetic acceptance',exact:true}).waitFor();
  const password=page.locator('input[autocomplete="current-password"]');await page.locator('input[autocomplete="username"]').fill('synthetic-user');await password.fill('synthetic-password');
  await page.getByRole('button',{name:'Şifreyi göster',exact:true}).click();assert.equal(await password.getAttribute('type'),'text');await page.getByRole('button',{name:'Şifreyi gizle',exact:true}).click();assert.equal(await password.getAttribute('type'),'password');
  assert.equal(await page.getByLabel('Beni hatırla').isChecked(),true);await page.getByRole('button',{name:'Giriş Yap',exact:true}).click();await page.getByText('Sentetik giriş reddi',{exact:true}).waitFor();
  assert(!assets.some(path=>/xlsx|Reports-/.test(path)),'Login should not load Excel or report pages.');
 });
 await scenario('unauthenticated protected route redirects',async page=>{await page.goto(server.origin+'/reports');await page.getByRole('heading',{name:'Synthetic acceptance',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/login')});
 await scenario('mobile demo entry',async page=>{await page.goto(server.origin+'/login?demo=1');await page.getByRole('button',{name:'Öğrenci',exact:true}).click();assert.equal(await page.locator('input[autocomplete="username"]').inputValue(),'student1')},{mobile:true});
 await scenario('marketing entry',async page=>{await page.goto(server.origin+'/?site=marketing');await page.getByRole('heading',{name:/Ölçmenin ötesinde/}).waitFor()});
 await scenario('results role selection',async page=>{await page.goto(server.origin+'/?site=results');await page.getByRole('button',{name:/Öğrenci Sonuç/}).click();await page.locator('input').first().waitFor()},{mobile:true});
 await scenario('missing lazy chunk shows recovery UI',async page=>{await page.goto(server.origin+'/login');await page.getByRole('alert').filter({hasText:'Sayfa açılamadı'}).waitFor();assert.equal(await page.getByRole('button',{name:'Sayfayı yeniden yükle',exact:true}).count(),1)},{failedLoginChunk:true});
 console.log(JSON.stringify({status:'passed',browser:'chromium',scenarioCount:passed.length,scenarios:passed,scope:'local production assets with synthetic API fixtures; service workers blocked'},null,2));
}finally{await browser?.close();await server.close()}
