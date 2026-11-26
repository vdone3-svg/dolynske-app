/**
 * Пам'ять на телефоні (26.11c): ліміт карти 1500, копії даних >30 днів видаляються, панель «💾 Пам'ять», очищення не чіпає невідправлені огляди.
 * Запуск: node tests/phone-storage.test.js
 */
'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0; const ok = m => { console.log('  ✓ ' + m); passed++; }, bad = m => { console.log('  ✗ ' + m); failed++; };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p.replace(/^\/dolynske-app/, '')); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': (f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/json') + '; charset=utf-8' }); s.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => srv.listen(8766, r)); const URL = 'http://localhost:8766/dolynske-app/';
  const br = await chromium.launch(); const ctx = await br.newContext(); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await ctx.route(/cdnjs|fonts\.g|api\.github|open-meteo/, r => r.abort());
  await pg.goto(URL); await pg.evaluate(() => navigator.serviceWorker.ready); await pg.waitForTimeout(800);
  // наповнюємо кеші: 1700 шматків карти, 2 копії даних (свіжа й 45-денна), 1 невідправлений огляд
  await pg.evaluate(async () => {
    const t = await caches.open('tiles-v1'); for (let i = 0; i < 1700; i++) await t.put('https://tile.openstreetmap.org/z/' + i + '.png', new Response('x'));
    const a = await caches.open('api-v1'), old = new Date(Date.now() - 45 * 864e5).toISOString(), now = new Date().toISOString();
    await a.put('https://api.github.com/repos/x/old?__a=raw', new Response('{}', { headers: { 'x-cache-date': old } }));
    await a.put('https://api.github.com/repos/x/new?__a=raw', new Response('{}', { headers: { 'x-cache-date': now } }));
    await new Promise((ok, no) => { const r = indexedDB.open('dl_outbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('scouts', { keyPath: 'id' });
      r.onsuccess = () => { const tx = r.result.transaction('scouts', 'readwrite'); tx.objectStore('scouts').put({ id: 'test1', doc: { field: 'X', date: '2026-11-26' }, blobs: {} }); tx.oncomplete = ok; tx.onerror = no; }; });
  });
  // новий service worker (активація) — імітуємо оновлення: перереєстрація з іншим URL
  await pg.evaluate(async () => { const r = await navigator.serviceWorker.register('sw.js?v=test'); await new Promise(ok => { const w = r.installing || r.waiting || r.active; if (w.state === 'activated') return ok(); w.addEventListener('statechange', () => w.state === 'activated' && ok()); }); });
  await pg.waitForTimeout(1500);
  const st = await pg.evaluate(async () => ({ tiles: (await (await caches.open('tiles-v1')).keys()).length, api: (await (await caches.open('api-v1')).keys()).map(k => k.url) }));
  st.tiles <= 1500 ? ok('карта обрізана до ' + st.tiles + ' (≤1500)') : bad('карта: ' + st.tiles);
  !st.api.some(u => u.includes('/old')) && st.api.some(u => u.includes('/new')) ? ok('копія даних 45 днів видалена, свіжа лишилась') : bad('копії даних: ' + st.api);
  await pg.evaluate(() => document.getElementById('btn-mem').click()); await pg.waitForTimeout(800);
  const txt = await pg.textContent('#mem-box');
  /Застосунок займає/.test(txt) && /Ще не відправлено оглядів: 1/.test(txt) ? ok('панель «Пам\'ять»: обсяг і 1 невідправлений огляд') : bad('панель: ' + txt);
  await pg.evaluate(() => document.querySelector('#mem-box button').click()); await pg.waitForTimeout(1200);
  const after = await pg.evaluate(async () => ({ tiles: (await (await caches.open('tiles-v1')).keys()).length, api: (await (await caches.open('api-v1')).keys()).length,
    out: await new Promise(ok => { const r = indexedDB.open('dl_outbox', 1); r.onsuccess = () => { const q = r.result.transaction('scouts').objectStore('scouts').getAll(); q.onsuccess = () => ok(q.result.length); }; }),
    libs: (await caches.keys()).includes('shell-v2') }));
  after.tiles === 0 && after.api === 0 ? ok('«Очистити кеш»: копії даних і карта видалені') : bad('після очищення: ' + JSON.stringify(after));
  after.out === 1 ? ok('невідправлений огляд залишився') : bad('огляд зник!');
  after.libs ? ok('оболонка застосунку для офлайн-старту на місці') : bad('оболонку видалено');
  errs.length === 0 ? ok('без помилок скрипта') : bad('помилки: ' + errs.slice(0, 3).join(' | '));
  await br.close(); srv.close(); console.log(`\n${passed} пройдено, ${failed} не пройдено`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
