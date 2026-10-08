const CACHE='anunex-shell-v1';
const SHELL=['/','/manifest.webmanifest','/app-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
function cacheable(request,response){
 if(!response.ok)return false;
 if(request.destination==='script')return /^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(response.headers.get('content-type')||'');
 return true;
}
function store(event,key,response){
 const copy=response.clone();
 event.waitUntil(caches.open(CACHE).then(cache=>cache.put(key,copy)).catch(()=>{}));
}
function respond(event,promise){
 event.waitUntil(promise.then(()=>{}).catch(()=>{}));
 event.respondWith(promise);
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  respond(event,fetch(request).then(response=>{if(response.ok)store(event,'/',response);return response}).catch(async()=>{const cached=await caches.match('/');return cached?.ok?cached:Response.error()}));
  return;
 }
 if(url.pathname.startsWith('/assets/')||url.pathname.endsWith('.svg')||url.pathname.endsWith('.webmanifest')){
  respond(event,caches.open(CACHE).then(async cache=>{
   const cached=await cache.match(request);
   if(cached&&cacheable(request,cached))return cached;
   if(cached)await cache.delete(request);
   const response=await fetch(request);
   if(cacheable(request,response))store(event,request,response);
   return response;
  }));
 }
});
