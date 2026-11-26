/**
 * Застосунок відкривається без зв'язку (26.11, випадок Вови в полі).
 * 1) бібліотеки недоступні з першого разу → сторінка однаково стартує (заглушка d3);
 * 2) один запуск онлайн → офлайн-перезапуск: оболонка й бібліотеки з кешу service worker, без помилок.
 * Запуск: node tests/offline-boot.test.js
 */
'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const D3 = fs.readFileSync('/opt/npm-tools/node_modules/d3/dist/d3.min.js');
const XL = fs.readFileSync('/tmp/npm/node_modules/xlsx/dist/xlsx.full.min.js');
let passed = 0, failed = 0;
const ok = m => { console.log('  ✓ ' + m); passed++; }, bad = m => { console.log('  ✗ ' + m); failed++; };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p.replace(/^\/dolynske-app/, ''));
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.json') || f.endsWith('webmanifest') ? 'application/json' : 'application/octet-stream';
  s.writeHead(200, { 'Content-Type': t + '; charset=utf-8' }); s.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const URL = 'http://localhost:8765/dolynske-app/';
  const br = await chromium.launch();
  // 1) CDN недоступний
  {
    const ctx = await br.newContext({ serviceWorkers: 'block' }); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await ctx.route(/cdnjs|fonts\.g|api\.github|open-meteo/, r => r.abort());
    await pg.goto(URL); await pg.waitForTimeout(2500);
    const tabs = await pg.$$eval('button, .tab', a => a.length);
    errs.length === 0 ? ok('без бібліотек: жодної помилки скрипта') : bad('помилки: ' + errs.slice(0, 3).join(' | '));
    tabs > 5 ? ok('без бібліотек: інтерфейс намальовано (' + tabs + ' кнопок)') : bad('інтерфейс порожній');
    await ctx.close();
  }
  // 2) онлайн один раз → офлайн
  {
    const ctx = await br.newContext(); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await ctx.route(/cdnjs\.cloudflare\.com\/.*d3/, r => r.fulfill({ body: D3, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/cdnjs\.cloudflare\.com\/.*xlsx/, r => r.fulfill({ body: XL, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/fonts\.g/, r => r.fulfill({ body: '/* f */', contentType: 'text/css', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/api\.github|open-meteo/, r => r.abort());
    await pg.goto(URL);
    await pg.evaluate(() => navigator.serviceWorker.ready); await pg.waitForTimeout(1500);
    const cached = await pg.evaluate(async () => { const c = await caches.open('libs-v2'); return (await c.keys()).map(k => k.url); });
    cached.some(u => u.includes('d3')) && cached.some(u => u.includes('xlsx')) ? ok('після першого запуску бібліотеки в кеші (' + cached.length + ')') : bad('бібліотек у кеші немає: ' + cached);
    await ctx.unroute(/cdnjs\.cloudflare\.com\/.*d3/); await ctx.unroute(/cdnjs\.cloudflare\.com\/.*xlsx/); await ctx.unroute(/fonts\.g/);
    await ctx.setOffline(true); srv.close();
    errs.length = 0;
    await pg.reload(); await pg.waitForTimeout(3000);
    const real = await pg.evaluate(() => !!(window.d3 && !window.d3._stub && window.d3.select));
    const tabs = await pg.$$eval('button, .tab', a => a.length);
    tabs > 5 ? ok('офлайн-перезапуск: сторінка відкрилась (' + tabs + ' кнопок)') : bad('офлайн: сторінка не відкрилась');
    real ? ok('офлайн: справжня d3 з кешу') : bad('офлайн: d3 не з кешу');
    errs.length === 0 ? ok('офлайн: без помилок скрипта') : bad('офлайн помилки: ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await br.close(); try { srv.close(); } catch (e) {}
  console.log(`\n${passed} пройдено, ${failed} не пройдено`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
