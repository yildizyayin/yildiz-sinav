import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const source=readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
function fixture(){
 const handlers=new Map<string,Function>(),entries=new Map<string,Response>();
 const key=(request:any)=>typeof request==='string'?new URL(request,'https://test').href:request.url;
 const match=vi.fn(async(request:any)=>entries.get(key(request))?.clone());
 const cache={match,put:vi.fn(async(request:any,response:Response)=>{entries.set(key(request),response.clone())}),delete:vi.fn(async(request:any)=>entries.delete(key(request)))};
 const fetch=vi.fn();
 runInNewContext(source,{self:{location:{origin:'https://test'},addEventListener:(name:string,handler:Function)=>handlers.set(name,handler)},caches:{open:async()=>cache,match},fetch,URL,Response});
 function start(path:string,options:any={}){
  const pending:Promise<any>[]=[];let response:Promise<Response>|undefined;
  const request={url:new URL(path,'https://test').href,method:'GET',mode:'cors',destination:'script',...options};
  handlers.get('fetch')!({request,waitUntil:(p:Promise<any>)=>pending.push(p),respondWith:(p:Promise<Response>)=>{response=p}});
  const initialWaitCount=pending.length;
  return {response,initialWaitCount,flush:async()=>{for(let i=0;i<pending.length;i++)await pending[i]}};
 }
 return {entries,cache,fetch,start};
}
const javascript=(body='export const ready=true')=>new Response(body,{headers:{'content-type':'text/javascript; charset=utf-8'}});

it('does not cache a missing chunk and recovers on a later successful request',async()=>{
 const f=fixture();f.fetch.mockResolvedValueOnce(new Response('missing',{status:404})).mockResolvedValueOnce(javascript());
 let event=f.start('/assets/page.js');expect(event.initialWaitCount).toBeGreaterThan(0);expect((await event.response)!.status).toBe(404);await event.flush();expect(f.entries.size).toBe(0);
 event=f.start('/assets/page.js');expect(await (await event.response)!.text()).toContain('ready');await event.flush();expect(f.cache.put).toHaveBeenCalledTimes(1);expect(f.fetch).toHaveBeenCalledTimes(2);
});
it('removes an old cached error and fetches the corrected chunk',async()=>{
 const f=fixture();f.entries.set('https://test/assets/page.js',new Response('old missing',{status:404}));f.fetch.mockResolvedValue(javascript());
 const event=f.start('/assets/page.js');expect((await event.response)!.status).toBe(200);await event.flush();expect(f.cache.delete).toHaveBeenCalledTimes(1);expect(await f.entries.get('https://test/assets/page.js')!.text()).toContain('ready');
});
it('rejects HTML masquerading as a script in both stored and fresh responses',async()=>{
 const f=fixture();f.entries.set('https://test/assets/page.js',new Response('<html>old</html>',{headers:{'content-type':'text/html'}}));f.fetch.mockResolvedValue(new Response('<html>new</html>',{headers:{'content-type':'text/html'}}));
 const event=f.start('/assets/page.js');expect(await (await event.response)!.text()).toContain('new');await event.flush();expect(f.entries.size).toBe(0);expect(f.cache.put).not.toHaveBeenCalled();
});
it('serves a valid cached script while the network is unavailable',async()=>{
 const f=fixture();f.entries.set('https://test/assets/page.js',javascript());f.fetch.mockRejectedValue(new Error('offline'));
 const event=f.start('/assets/page.js');expect(await (await event.response)!.text()).toContain('ready');await event.flush();expect(f.fetch).not.toHaveBeenCalled();
});
it('does not replace the valid shell with a failed navigation response',async()=>{
 const f=fixture();f.entries.set('https://test/',new Response('valid shell'));f.fetch.mockResolvedValue(new Response('unavailable',{status:503}));
 const event=f.start('/reports',{mode:'navigate',destination:'document'});expect((await event.response)!.status).toBe(503);await event.flush();expect(await f.entries.get('https://test/')!.text()).toBe('valid shell');expect(f.cache.put).not.toHaveBeenCalled();
});
it('returns the cached shell offline and an explicit network error if none exists',async()=>{
 const f=fixture();f.fetch.mockRejectedValue(new Error('offline'));f.entries.set('https://test/',new Response('valid shell'));
 let event=f.start('/reports',{mode:'navigate',destination:'document'});expect(await (await event.response)!.text()).toBe('valid shell');await event.flush();
 f.entries.clear();event=f.start('/reports',{mode:'navigate',destination:'document'});expect((await event.response)!.type).toBe('error');await event.flush();
});
it('returns the network response even when writing the cache fails',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(javascript());f.cache.put.mockRejectedValue(new Error('quota'));
 const event=f.start('/assets/page.js');expect((await event.response)!.status).toBe(200);await expect(event.flush()).resolves.toBeUndefined();
});
it.each([['/api/private-rubric-exports',{destination:'document'}],['/assets/page.js',{method:'POST'}],['https://foreign.test/assets/page.js',{}]])('never intercepts private APIs, mutations or other origins: %s',async(path,options)=>{
 const f=fixture(),event=f.start(path,options);expect(event.response).toBeUndefined();expect(event.initialWaitCount).toBe(0);expect(f.fetch).not.toHaveBeenCalled();expect(f.cache.match).not.toHaveBeenCalled();
});
