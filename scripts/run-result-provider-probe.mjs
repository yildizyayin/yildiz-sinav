const url = new URL(process.env.RESULT_PROBE_URL || 'http://invalid');
const token = process.env.RESULT_PROBE_TOKEN;
if (url.protocol !== 'https:' || !/^anunex-result-provider-probe(?:-[a-z0-9-]+)?\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password || !token) throw new Error('An isolated probe workers.dev origin and token are required');
const headers = { Authorization: `Bearer ${token}` };
let start;
const startDeadline=Date.now()+20_000;
while(Date.now()<startDeadline){
  start=await fetch(new URL('/start',url),{method:'POST',headers,redirect:'error'});
  if(start.status===202)break;
  // wrangler secret put publishes a new Worker version. A just-deployed route can
  // briefly serve the previous version without PROBE_TOKEN, so retry only the
  // bounded propagation window. Never print the token or response body.
  if(![403,404,429,500,502,503,504].includes(start.status))throw new Error(`Provider probe start failed with status ${start.status}`);
  await new Promise(resolve=>setTimeout(resolve,1000));
}
if (!start || start.status !== 202) throw new Error(`Provider probe start failed after propagation window (status ${start?.status || 0})`);
const result = await start.json();
if (!result.ok || !result.conditionalWritePassed || !/^[a-f0-9-]{36}$/.test(result.probeId)) throw new Error('Conditional R2 write was not verified');
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const response = await fetch(new URL(`/status?probeId=${result.probeId}`, url), { headers, redirect: 'error' });
  if (!response.ok) throw new Error('Provider probe status failed');
  const status = await response.json();
  if (status.ok && status.complete && status.artifactConsumed && status.retentionConsumed) {
    console.log('PASS: conditional R2 writes and both isolated queue deliveries');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
throw new Error('Both queue deliveries were not confirmed within 60 seconds');
