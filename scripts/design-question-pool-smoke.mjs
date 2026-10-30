import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startBrowserSmokeServer} from './browser-smoke-server.mjs';
const server=await startBrowserSmokeServer('dist/client');
const browser=await chromium.launch({headless:true,executablePath:process.env.ANUNEX_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const out='docs/design/approved-question-pool';await mkdir(out,{recursive:true});
const normal={id:'qa-approved',stem_text:'Bir kitaplıkta 4 rafta 18 kitap vardır. 12 kitap daha eklenince toplam kaç kitap olur?',options:[{label:'A',text:'72'},{label:'B',text:'76'},{label:'C',text:'84'},{label:'D',text:'90'}],correct_answer:'C',solution_text:'4 × 18 + 12 = 84 kitap.',grade_level:5,subject_id:'sub_math',subject_name:'Matematik',difficulty_level:3,content_mode:'TEXT',question_type:'MULTIPLE_CHOICE',review_status:'APPROVED',copyright_status:'OWNED',review_revision:1,origin_kind:'MANUAL',has_learning_link:0,assets:[],contentBlocks:[]};
const ai={...normal,id:'qa-review',stem_text:'İnceleme örneği: tabloda verilen kitap sayıları arasındaki farkı bulunuz.',review_status:'REVIEW',origin_kind:'AI_GENERATED',copyright_status:'RESTRICTED',difficulty_level:6};
const chart={...normal,id:'qa-chart',stem_text:'Grafiğe göre en çok ve en az kitap okunan gün arasındaki fark kaçtır?',contentBlocks:[{id:'qa-block',block_type:'DIAGRAM',placement:'STEM',payload_json:JSON.stringify({schemaVersion:1,kind:'BAR_CHART',title:'Kitap sayısı',unit:'kitap',categories:['Pazartesi','Salı','Çarşamba','Perşembe'],values:[8,12,6,10]})}]};
const written={...normal,id:'qa-written',stem_text:'Verilen sayı örüntüsünün kuralını açıklayınız.',question_type:'OPEN_ENDED',written_format:'SHORT_ANSWER',review_status:'REVIEW',rubric:[{sort_order:1,points:2,criterion:'Kuralı doğru açıklar.'}]};
const cases=[...[1440,1180,1024,768,390,360].map(width=>({width,theme:'ANUNEX_STANDARD',state:'data'})),...['ANUNEX_FOCUS','ANUNEX_STUDIO','ANUNEX_COSMIC','ANUNEX_NEON'].flatMap(theme=>[1440,390].map(width=>({width,theme,state:'data'}))),...['empty','review','batch','chart','written','error','success','import-busy','import-error','studio','long'].map(state=>({width:390,theme:'ANUNEX_STANDARD',state})),{width:1440,theme:'ANUNEX_STANDARD',state:'review'},{width:390,theme:'ANUNEX_STANDARD',state:'data',role:'TEACHER'}];
const selected=process.env.ANUNEX_POOL_CASE?cases.filter(c=>JSON.stringify(c).includes(process.env.ANUNEX_POOL_CASE)):cases;const results=[];
try{for(const c of selected){console.log('START',c);const role=c.role||'SUPER_ADMIN',context=await browser.newContext({viewport:{width:c.width,height:1000},serviceWorkers:'block'}),errors=[],writes=[],held=[];
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();let body={ok:true},status=200;
  if(req.method()!=='GET'){
   writes.push(u.pathname);if(u.pathname==='/api/platform/questions'&&c.state==='success')body={ok:true,id:'qa-created',assetCount:0};
   else if(u.pathname==='/api/admin/question-import/preview'&&['import-busy','import-error'].includes(c.state)){if(c.state==='import-busy'){held.push(route);return;}status=503;body={ok:false,error:{code:'QA_ERROR',message:'Sentetik aktarım hatası.'}};}
   else throw new Error('Unexpected synthetic write '+u.pathname);
  }else if(u.pathname==='/api/auth/me')body={ok:true,user:{id:'qa-user',role,display_name:'Örnek Yetkili',institution_id:role==='SUPER_ADMIN'?null:'qa-school'}};
  else if(u.pathname==='/api/config')body={ok:true,productName:'ANUNEX',turnstileSiteKey:''};
  else if(u.pathname==='/api/panel-experience')body={ok:true,defaultTheme:c.theme,allowedThemes:[]};
  else if(u.pathname==='/api/platform/features')body={ok:true,features:[{feature_key:'STUDIO',effective_enabled:1},{feature_key:'QUESTION_BANK',effective_enabled:1},{feature_key:'VIDEO_LIBRARY',effective_enabled:1}]};
  else if(u.pathname==='/api/institutions')body={ok:true,institutions:[{id:'qa-school',name:'Örnek Kurum'}]};
  else if(u.pathname==='/api/platform/questions'){
   let questions=c.state==='empty'?[]:[{...normal,stem_text:c.state==='long'?normal.stem_text.repeat(18):normal.stem_text},ai,chart,written];
   if(u.searchParams.get('q'))questions=questions.filter(q=>q.stem_text.includes(u.searchParams.get('q')));if(u.searchParams.get('gradeLevel'))questions=questions.filter(q=>q.grade_level===Number(u.searchParams.get('gradeLevel')));if(u.searchParams.get('reviewStatus'))questions=questions.filter(q=>q.review_status===u.searchParams.get('reviewStatus'));
   body={ok:true,questions};
  }else if(u.pathname==='/api/platform/studio')body={ok:true,documents:[]};
  else if(u.pathname==='/api/platform/videos')body={ok:true,videos:[]};
  else if(u.pathname==='/api/question-bank-standard/stats')body={ok:true,total:c.state==='empty'?0:4,approved:2,printable:2};
  else if(/^\/api\/question-bank-standard\/[^/]+\/intelligence$/.test(u.pathname))body={ok:true,revision:1,outcomes:[],priorLearning:{references:[],note:'Sentetik veride ön öğrenme kaydı yok.'},difficulty:{level:3},history:{fromYear:2021,toYear:2025,families:[{family:'LGS',observedQuestionCount:null,perYear:[]}],facts:[],note:'Doğrulanmış sınav kaydı yok.'},prediction:{note:'Doğrulanmış veri olmadığı için olasılık verilmez.'}};
  else{status=503;body={ok:false,error:{code:'QA_UNAVAILABLE',message:'Sentetik kapsam dışında.'}};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin+'/content-center');await page.getByRole('heading',{name:'Soru havuzu',level:1,exact:true}).waitFor();const root=page.locator('.approved-question-pool');
 if(c.state==='empty')await page.getByText('Filtrelere uyan soru bulunamadı.',{exact:true}).waitFor();else await page.locator('.question-row').filter({hasText:'Bir kitaplıkta'}).waitFor();
 if(['review','batch'].includes(c.state)){await page.locator('.question-row').filter({hasText:'İnceleme örneği:'}).click();assert(await page.getByRole('button',{name:'Onayla',exact:true}).isDisabled());await page.getByText('Kullanım hakkı henüz doğrulanmadı.',{exact:false}).waitFor();if(c.state==='batch'){await page.getByRole('button',{name:'İncelemedekilerin tümünü seç',exact:true}).click();assert(await page.getByRole('button',{name:'Seçilen 2 soruyu onayla',exact:true}).isDisabled());}}
 if(c.state==='chart')await page.locator('.question-row').filter({hasText:'Grafiğe göre'}).click();
 if(c.state==='written'){await page.locator('.question-row').filter({hasText:'Verilen sayı örüntüsünün'}).click();await page.getByText('Kuralı doğru açıklar.',{exact:false}).waitFor();}
 if(['error','success'].includes(c.state)){
  const form=page.locator('.question-create-card');await form.locator('textarea').first().fill('Sentetik kayıt sorusu.');
  if(c.state==='success')for(const [i,input]of(await form.locator('.option-input-grid input').all()).entries())await input.fill(String(i+1));
  await form.getByRole('button',{name:'Soruyu kaydet',exact:true}).click();await page.getByText(c.state==='error'?'Seçeneklerin tamamını doldurun.':'Soru havuza kaydedildi · qa-created · 0 medya',{exact:true}).waitFor();
 }
 if(['import-busy','import-error'].includes(c.state)){const details=root.locator('details').filter({hasText:'Toplu soru aktar (Excel / CSV / JSON)'});await details.locator('summary').click();await details.locator('input[type=file]').setInputFiles({name:'qa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{Soru:'Sentetik soru'}]))});if(c.state==='import-busy')await page.waitForFunction(()=>document.querySelector('.question-list-column details input[type=file]')?.disabled);else await page.getByText('Sentetik aktarım hatası.',{exact:true}).waitFor();}
 if(c.state==='studio'){await root.getByRole('button',{name:/^Studio/}).click();assert.equal(await root.getAttribute('data-design-tab'),'studio');await page.getByRole('link',{name:/Hızlı Test/}).waitFor();}
 if(role==='TEACHER'){assert.equal(await page.locator('.question-create-card').count(),0);assert.equal(await page.locator('.batch-review').count(),0);}
 if(c.state==='data'&&c.theme==='ANUNEX_STANDARD'&&c.width===1440){await page.getByPlaceholder('Soru, konu veya alt konu ara').fill('bulunmayan-sentetik');await page.getByRole('button',{name:'Filtrele',exact:true}).click();await page.getByText('Filtrelere uyan soru bulunamadı.',{exact:true}).waitFor();await page.getByPlaceholder('Soru, konu veya alt konu ara').fill('');await page.getByRole('button',{name:'Filtrele',exact:true}).click();await page.locator('.question-row').filter({hasText:'Bir kitaplıkta'}).waitFor();}
 await root.evaluate(async r=>await Promise.all(r.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{}))));
 assert.deepEqual(errors,[]);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Page overflow '+JSON.stringify(c));
 if(c.theme==='ANUNEX_STANDARD'&&role==='SUPER_ADMIN'&&c.state!=='studio'){
  for(const ctl of await root.locator('button,input:not([type=checkbox]),select,summary').all())if(await ctl.isVisible())assert((await ctl.boundingBox()).height>=40,'Target under40 '+await ctl.textContent());
  await page.keyboard.press('Tab');await root.getByRole('button',{name:'Yenile',exact:true}).focus();assert.equal(await root.getByRole('button',{name:'Yenile',exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
  if(c.width===1440){const samples=await root.evaluate(r=>[...r.querySelectorAll('h1,h2,h3,p,label,small,strong,button,a,em,th,td')].filter(e=>e.checkVisibility()&&e.textContent.trim()&&!e.matches(':disabled')&&!e.closest('button:disabled')).map(e=>{let bg=e;while(bg&&['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(bg).backgroundColor))bg=bg.parentElement;return{text:e.textContent.trim().slice(0,60),fg:getComputedStyle(e).color,bg:bg?getComputedStyle(bg).backgroundColor:'rgb(255, 255, 255)'}}));const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const ratios=samples.map(x=>{const a=lum(x.fg),b=lum(x.bg);return{...x,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});assert(ratios.every(x=>x.ratio>=4.5),JSON.stringify(ratios.filter(x=>x.ratio<4.5)));console.log('Minimum contrast',Math.min(...ratios.map(x=>x.ratio)));}
  await page.emulateMedia({reducedMotion:'reduce'});
 }
 if(c.theme==='ANUNEX_STANDARD'&&role==='SUPER_ADMIN'&&[1440,390].includes(c.width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${c.state}-${c.width}.png`,fullPage:true,animations:'disabled'});}
 if(c.width===390&&c.state==='data'&&c.theme==='ANUNEX_STANDARD'&&role==='SUPER_ADMIN'){await page.getByRole('button',{name:'Menüyü aç',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().x>=-1);await page.locator('.mobile-nav-close').click();}
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sidebar').evaluate(e=>getComputedStyle(e).display),'none');for(const route of held)await route.abort().catch(()=>{});assert.equal(writes.length,['success','import-busy','import-error'].includes(c.state)?1:0);results.push({...c,role,passed:true,writes});await context.close();console.log('PASS',c);
}await writeFile(out+(process.env.ANUNEX_POOL_CASE?'/verification-subset.json':'/verification.json'),JSON.stringify(results,null,2));}finally{await browser.close();await server.close();}
