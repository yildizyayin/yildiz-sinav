import assert from 'node:assert/strict';
const base='https://yildiz-sinav-qpool-pr-227.rtsgida.workers.dev';
const account='daae7254acbfe5218c52665daaacbd96';
const database='8db26532-eb50-42c9-99f3-00f097127c11';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,account);
const config=await fetch(base+'/api/config');assert.equal((await config.json()).environment,'staging');
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'super',password:'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);console.log('::add-mask::'+cookie);
const sampleText='student_number,name,class,booklet,answers_MAT,answers_TUR,answers_FEN\n1001,Aktif1 Öğrenci1,7/A,A,ABCDEABCDE,ABCDEABCDE,ABCDEABCDE\n';
const test=await fetch(base+'/api/optical-definition-versions/optv_demo/test-parser',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({sampleText,fileName:'synthetic-parser-proof.csv'})});
assert.equal(test.status,200);const proof=await test.json();assert.equal(proof.passed,true);assert.equal(proof.recordCount,1);assert(proof.confidence>=.8);
for(const booklet of ['A','B']){
 const sql=`INSERT INTO exam_optical_bindings(id,exam_id,booklet_code,optical_template_version_id,input_modes_json,active,created_by) VALUES (?,'exam_demo_active',?,'optv_demo','["TXT","DAT","CAMERA"]',1,'usr_super') ON CONFLICT(exam_id,booklet_code) DO UPDATE SET optical_template_version_id='optv_demo',active=1`;
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params:['acceptance_optical_'+booklet,booklet]})});assert.equal(r.status,200);assert.equal((await r.json()).success,true);
}
console.log(JSON.stringify({status:'passed',scope:'actual synthetic parser acceptance and explicit demo A/B optical binding',productionData:false}));
