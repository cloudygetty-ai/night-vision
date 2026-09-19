// NVS service worker — network-first for HTML, cache-first for hashed assets
const VERSION="nvs-v16";
const SHELL=VERSION+"-shell";

self.addEventListener("install",()=>self.skipWaiting());

self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>!k.startsWith(VERSION)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message",e=>{if(e.data==="SKIP_WAITING")self.skipWaiting();});

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  const sameOrigin=url.origin===location.origin;
  const isDoc=req.mode==="navigate"||req.destination==="document";

  // HTML: always network-first so asset hashes are never stale
  if(isDoc){
    e.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:"no-store"});
        const c=await caches.open(SHELL);c.put(req,fresh.clone());
        return fresh;
      }catch{
        return(await caches.match(req))||(await caches.match("/"))||Response.error();
      }
    })());
    return;
  }

  // Hashed build assets: cache-first (content-addressed, safe forever)
  if(sameOrigin&&url.pathname.startsWith("/assets/")){
    e.respondWith((async()=>{
      const hit=await caches.match(req);
      if(hit)return hit;
      const res=await fetch(req);
      if(res&&res.status===200){const c=await caches.open(SHELL);c.put(req,res.clone());}
      return res;
    })());
    return;
  }

  // Fonts + other same-origin statics: stale-while-revalidate
  if(sameOrigin||url.hostname.includes("fonts.g")){
    e.respondWith((async()=>{
      const hit=await caches.match(req);
      const net=fetch(req).then(res=>{
        if(res&&res.status===200)caches.open(SHELL).then(c=>c.put(req,res.clone()));
        return res;
      }).catch(()=>hit);
      return hit||net;
    })());
  }
});
