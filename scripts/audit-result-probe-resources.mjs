// Read-only inventory of exact synthetic resources owned by two completed PRs.
const repo = 'yildizyayin/yildiz-sinav';
const {GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID} = process.env;
if (!GITHUB_TOKEN || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) throw Error('Missing environment credentials');
async function json(url, token) {
 const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
 if(!r.ok) throw Error(`Inventory request failed: ${r.status}`);
 return r.json();
}
const api=`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}`;
const queues=await json(`${api}/queues?per_page=100`,CLOUDFLARE_API_TOKEN);
if(!queues.success||!Array.isArray(queues.result))throw Error('Invalid queue inventory');
for(const pr of [252,253]) {
 const p=await json(`https://api.github.com/repos/${repo}/pulls/${pr}`,GITHUB_TOKEN);
 if(p.state!=='closed'||!p.merged_at)throw Error(`PR ${pr} is not merged and closed`);
 const names=['artifacts','artifacts-dlq','retention','retention-dlq'].map(n=>`anunex-result-probe-${n}-${pr}`);
 const owned=queues.result.filter(q=>names.includes(q.queue_name));
 const details=[];
 for(const q of owned) {
  const d=await json(`${api}/queues/${q.queue_id}`,CLOUDFLARE_API_TOKEN);
  if(!d.success||d.result.queue_name!==q.queue_name)throw Error('Queue changed during audit');
  details.push(d.result);
 }
 console.log(JSON.stringify({pr,merged_at:p.merged_at,worker:`anunex-result-provider-probe-${pr}`,expectedNames:names,queues:details}));
}
