import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
// @ts-ignore JavaScript test infrastructure.
import {startBrowserSmokeServer} from '../scripts/browser-smoke-server.mjs';

it('serves SPA routes and JavaScript without disguising missing assets or backend APIs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'anunex-browser-'));await mkdir(join(root,'assets'));await writeFile(join(root,'index.html'),'<h1>Synthetic app</h1>');await writeFile(join(root,'assets/page.js'),'export const ready=true');const server=await startBrowserSmokeServer(root);
 try{
  const spa=await fetch(server.origin+'/reports');expect(spa.status).toBe(200);expect(await spa.text()).toContain('Synthetic app');
  const js=await fetch(server.origin+'/assets/page.js');expect(js.headers.get('content-type')).toBe('text/javascript');expect(await js.text()).toContain('ready');
  const missing=await fetch(server.origin+'/assets/missing.js');expect(missing.status).toBe(404);expect(await missing.text()).not.toContain('Synthetic app');
  const api=await fetch(server.origin+'/api/auth/login',{method:'POST'});expect(api.status).toBe(501);expect(await api.json()).toMatchObject({ok:false,error:{code:'FIXTURE_REQUIRED'}});
  expect((await fetch(server.origin+'/%2e%2e%2foutside.txt')).status).toBe(403);
 }finally{await server.close();await rm(root,{recursive:true,force:true})}
});
