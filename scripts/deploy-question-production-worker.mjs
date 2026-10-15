import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
async function cf(path){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{headers:{Authorization:`Bearer ${token}`}}),p=await r.json();if(!r.ok||!p.success)throw Error('Cannot resolve staging production-worker database');return p.result;}
const versions=await cf('/workers/scripts/yildiz-sinav-v1/versions'),id=versions.items?.[0]?.id||versions[0]?.id,version=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+id),binding=version.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!binding)throw Error('Missing staging DB');
const cfg=JSON.parse(await readFile('wrangler.question-production.jsonc','utf8'));cfg.d1_databases[0].database_id=binding.id||binding.database_id;const file='wrangler.question-production.resolved.json';await writeFile(file,JSON.stringify(cfg));
execFileSync('npx',['wrangler','deploy','--config',file],{stdio:'inherit'});
