// Strictly scoped cleanup for synthetic Result Provider Isolation Probe resources.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function validateProbeQueue(q, key, expectedId) {
 if(!/^\d+$/.test(String(key)))throw Error('Invalid probe key');
 const worker=`anunex-result-provider-probe-${key}`;
 const names=['artifacts','retention','artifacts-dlq','retention-dlq'].map(n=>`anunex-result-probe-${n}-${key}`);
 if(!names.includes(q.queue_name)||!q.queue_id||(expectedId&&q.queue_id!==expectedId))throw Error('Queue identity mismatch');
 for(const kind of ['producers','consumers']) {
  if(!Array.isArray(q[kind])||q[`${kind}_total_count`]!==q[kind].length)throw Error('Incomplete dependency inventory');
  for(const ref of q[kind])if(ref.type!=='worker'||ref.script!==worker||(ref.dead_letter_queue&&!names.includes(ref.dead_letter_queue)))throw Error('Unexpected resource dependency');
 }
 return true;
}
async function main(){
 const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,GITHUB_TOKEN}=process.env;
 if(!token||!account)throw Error('Missing staging credentials');
 const api=`https://api.cloudflare.com/client/v4/accounts/${account}`;
 async function cf(path,method='GET',allowMissing=false){
  const r=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`}});
  if(allowMissing&&r.status===404)return null;
  const d=await r.json();if(!r.ok||!d.success)throw Error(`Cloudflare ${method} failed (${r.status}, codes ${d.errors?.map(e=>e.code).join(',')})`);
  return d.result;
 }
 let plans;
 if(process.argv[2]){
  plans=JSON.parse(await readFile(process.argv[2],'utf8'));
  if(!GITHUB_TOKEN||plans.some(p=>![252,253].includes(p.pr)))throw Error('Only audited merged PR252/253 cleanup is allowed');
  for(const p of plans){
   const r=await fetch(`https://api.github.com/repos/yildizyayin/yildiz-sinav/pulls/${p.pr}`,{headers:{Authorization:`Bearer ${GITHUB_TOKEN}`,Accept:'application/json'}});
   if(!r.ok)throw Error('Cannot verify closed PR');const pr=await r.json();
   if(pr.state!=='closed'||!pr.merged_at)throw Error('PR is still active');
  }
 }else{
  const key=process.env.PR_KEY;if(!/^\d+$/.test(key??''))throw Error('Invalid probe key');
  const all=await cf('/queues?per_page=100');
  const names=['artifacts','retention','artifacts-dlq','retention-dlq'].map(n=>`anunex-result-probe-${n}-${key}`);
  plans=[{pr:key,queues:all.filter(q=>names.includes(q.queue_name))}];
 }
 // Validate ALL dependencies before the first deletion. Frozen plans also pin queue IDs.
 const checked=[];
 for(const p of plans)for(const q of p.queues){
  const live=await cf(`/queues/${q.queue_id}`,'GET',true);if(!live)continue;
  validateProbeQueue(live,p.pr,q.queue_id);
  if(live.queue_name!==q.queue_name)throw Error('Queue renamed since audit');
  checked.push({key:p.pr,q:live});
 }
 console.log('PROBE_CLEANUP_PLAN',JSON.stringify(checked.map(({key,q})=>({key,id:q.queue_id,name:q.queue_name}))));
 for(const {q} of checked)for(const c of q.consumers)await cf(`/queues/${q.queue_id}/consumers/${c.consumer_id}`,'DELETE');
 for(const p of plans)await cf(`/workers/scripts/anunex-result-provider-probe-${p.pr}`,'DELETE',true);
 // Recheck that no unexpected producer/consumer has attached since preflight.
 for(const {key,q} of checked){
  const live=await cf(`/queues/${q.queue_id}`);validateProbeQueue(live,key,q.queue_id);
  if(live.consumers_total_count||live.producers_total_count)throw Error('Queue is still attached; deletion stopped');
  await cf(`/queues/${q.queue_id}`,'DELETE');
  console.log('PROBE_QUEUE_REMOVED',q.queue_name);
 }
 console.log('PROBE_CLEANUP_COMPLETE',checked.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
