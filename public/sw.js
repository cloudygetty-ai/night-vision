// NVS-13 service worker — offline-first shell cache
const CACHE="nvs-v15";
self.addEventListener("install",e=>{self.skipWaiting();});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin&&!url.hostname.includes("fonts.g"))return;
  e.respondWith(
    caches.match(req).then(hit=>{
      const net=fetch(req).then(res=>{
        if(res&&res.status===200)caches.open(CACHE).then(c=>c.put(req,res.clone()));
        return res;
      }).catch(()=>hit);
      return hit||net;
    })
  );
});
