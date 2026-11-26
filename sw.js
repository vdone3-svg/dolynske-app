// Робота без інтернету: оболонка застосунку, бібліотеки, дані зі сховища (останні завантажені) і плитки карти
const SHELL = 'shell-v2', LIBS = 'libs-v2', API = 'api-v1', TILES = 'tiles-v1', MAX_TILES = 5000;
// 26.11: бібліотеки старту (d3, xlsx, шрифти) зберігаються одразу при встановленні — інакше без зв'язку застосунок не відкривався
const PRE_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@500;600&display=swap'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil((async () => {
  try{ await (await caches.open(SHELL)).add(self.registration.scope); }catch(x){}
  const c = await caches.open(LIBS);
  await Promise.all(PRE_LIBS.map(async u => { try{ if(await c.match(u)) return; const r = await fetch(u, {mode:'cors', credentials:'omit'}); if(r.ok) await c.put(u, r); }catch(x){} }));
})()); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = [SHELL, LIBS, API, TILES]; for(const k of await caches.keys()) if(!keep.includes(k)) await caches.delete(k);
  await self.clients.claim(); })()));

const isTile = u => /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//.test(u) || /tile\.openstreetmap\.org\//.test(u);
const isLib = u => /^https:\/\/(cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(u);
const isApi = u => u.startsWith('https://api.github.com/repos/');
const wait = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const r = e.request; if(r.method!=='GET') return;
  const u = r.url;
  if(r.mode==='navigate' && u.startsWith(self.registration.scope)) e.respondWith(shell(r));
  else if(isLib(u)) e.respondWith(cacheFirst(r, LIBS));
  else if(isTile(u)) e.respondWith(tile(r));
  else if(isApi(u)) e.respondWith(api(r));
});

// сторінка: спершу мережа (щоб приходили оновлення), без зв'язку — збережена копія
async function shell(r){
  const c = await caches.open(SHELL), key = self.registration.scope;
  try{ const res = await wait(fetch(r), 5000); if(res.ok) c.put(key, res.clone()); return res; }
  catch(e){ return (await c.match(key)) || Response.error(); }
}
async function cacheFirst(r, name){
  const c = await caches.open(name), hit = (await c.match(r)) || (await c.match(r.url)); if(hit) return hit;
  const res = await wait(fetch(r), 15000); if(res.ok || res.type==='opaque') c.put(r, res.clone()); return res;
}
let puts = 0;
async function tile(r){
  const c = await caches.open(TILES), hit = await c.match(r.url); if(hit) return hit;
  try{ const res = await fetch(r.url, {mode:'cors', credentials:'omit'}); if(res.ok){ await c.put(r.url, res.clone()); if(++puts % 100===0) trim(c); } return res; }
  catch(e){ return new Response('', {status:504, statusText:'offline tile'}); }
}
async function trim(c){ const keys = await c.keys(); if(keys.length > MAX_TILES) for(const k of keys.slice(0, keys.length - MAX_TILES + 300)) await c.delete(k); }

// дані сховища: мережа з тайм-аутом, без зв'язку — остання збережена відповідь (позначена заголовком x-cache-date)
async function api(r){
  const raw = (r.headers.get('accept') || '').includes('raw'), key = r.url+(r.url.includes('?') ? '&' : '?')+'__a='+(raw ? 'raw' : 'json');
  const c = await caches.open(API);
  try{
    const res = await wait(fetch(r), 8000);
    if(res.ok){ const h = new Headers(res.headers); h.set('x-cache-date', new Date().toISOString()); const body = await res.clone().blob();
      await c.put(key, new Response(body, {status:200, headers:h})); }
    else if(res.status===404) await c.delete(key);
    return res;
  }catch(e){
    const hit = await c.match(key); if(!hit) return new Response('', {status:404, headers:{'x-offline':'1'}});
    const h = new Headers(hit.headers); h.set('x-offline', '1'); return new Response(await hit.blob(), {status:200, headers:h});
  }
}
self.addEventListener('message', e => { if(e.data==='clear-api') e.waitUntil(caches.delete(API)); });

// Push-сповіщення (25.11; розсилка — tools/push.py у dolynske-data). Натискання — відкриває потрібну вкладку.
self.addEventListener('push', e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(x){ d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Щоденне господарство', {body:d.body || '', tag:d.tag || undefined, data:{url:d.url || ''}, icon:'icon-192.png', badge:'icon-192.png'}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = (e.notification.data || {}).url || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const c = all.find(w => w.url.startsWith(self.registration.scope));
    if(c){ await c.focus(); c.postMessage({go}); return; }
    await self.clients.openWindow(self.registration.scope + go);
  })());
});
