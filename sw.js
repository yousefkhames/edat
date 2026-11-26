// Offline shell: precache app files, then serve cache first and refresh in the background.
const CACHE='edat-v1';
const FILES=["./", "assets/css/style.css", "assets/fonts/arabic-400-normal.woff2", "assets/fonts/arabic-700-normal.woff2", "assets/fonts/arabic-800-normal.woff2", "assets/fonts/latin-400-normal.woff2", "assets/fonts/latin-700-normal.woff2", "assets/fonts/latin-800-normal.woff2", "assets/img/logo.svg", "assets/js/app.js?v=11", "assets/js/core.js?v=11", "assets/js/i18n.js?v=11", "icon-192.png", "index.html", "manifest.webmanifest", "vendor/jszip.min.js", "vendor/pdf-lib.min.js", "vendor/pdf.min.js", "vendor/pdf.worker.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(e.request,{ignoreSearch:false});
    const net=fetch(e.request).then(r=>{if(r&&r.ok)c.put(e.request,r.clone());return r}).catch(()=>null);
    return hit||(await net)||(await c.match('index.html'))||Response.error();
  }));
});
