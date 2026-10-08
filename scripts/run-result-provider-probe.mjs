const url = new URL(process.env.RESULT_PROBE_URL || 'http://invalid');
const token = process.env.RESULT_PROBE_TOKEN;
if (url.protocol !== 'https:' || !/^anunex-result-provider-probe(?:-[a-z0-9-]+)?\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password || !token) throw new Error('An isolated probe workers.dev origin and token are required');
const headers = { Authorization: `Bearer ${token}` };
const transient = new Set([403,404,429,500,502,503,504]);
let start;
const startDeadline=Date.now()+90_000;
while(Date.now()<startDeadline){
  start=await fetch(new URL('/start',url),{method:'POST',headers,redirect:'error'});
  if(start.status===202)break;
  // wrangler secret put publishes a new Worker version. A freshly deployed
  // workers.dev route can temporarily serve the version that predates the
  // secret. Keep this bounded and never expose the token or response body.
  if(!transient.has(start.status))throw new Error(`Provider probe start failed with status ${start.status}`);
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if (!start || start.status !== 202) throw new Error(`Provider probe start failed after 90 second propagation window (status ${start?.status || 0})`);
const result = await start.json();
if (!result.ok || !result.conditionalWritePassed || !/^[a-f0-9-]{36}$/.test(result.probeId)) throw new Error('Conditional R2 write was not verified');
const deadline = Date.now() + 90_000;
let lastStatus=0;
while (Date.now() < deadline) {
  const response = await fetch(new URL(`/status?probeId=${result.probeId}`, url), { headers, redirect: 'error' });
  lastStatus=response.status;
  if (!response.ok) {
    if(!transient.has(response.status))throw new Error(`Provider probe status failed with status ${response.status}`);
    await new Promise(resolve=>setTimeout(resolve,2000));
    continue;
  }
  const status = await response.json();
  if (status.ok && status.complete && status.artifactConsumed && status.retentionConsumed) {
    console.log('PASS: conditional R2 writes and both isolated queue deliveries');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
throw new Error(`Both queue deliveries were not confirmed within 90 seconds (last HTTP status ${lastStatus})`);
