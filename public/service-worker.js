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
// Nibiru bildirimleri (owner, 24 Nov 2026): the push carries no data; the phone shows a fixed, name-free line and
// opening it goes straight to the conversation.
self.addEventListener('push',event=>{
 event.waitUntil(Promise.all([
  self.registration.showNotification('Nibiru',{body:'Yeni bir mesajınız var.',icon:'/nibiru-icon-192.png',badge:'/nibiru-icon-192.png',tag:'nibiru',renotify:true,data:{url:'/nibiru'}}),
  (self.navigator&&self.navigator.setAppBadge?self.navigator.setAppBadge().catch(()=>{}):Promise.resolve())
 ]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL((event.notification.data&&event.notification.data.url)||'/nibiru',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  for(const c of list){if(c.url.startsWith(self.location.origin)&&'focus' in c){c.navigate&&c.navigate(target);return c.focus()}}
  return self.clients.openWindow(target);
 }));
});
