/**
 * Офлайн-огляди з фото й голосом — польові сценарії
 * Запуск: node tests/offline-scout-media.test.js
 *  4) огляд з 2 фото + голосом офлайн → online → 3 файли + json
 *  5) обрив на 2-му файлі → прогрес збережено, повтор не перевідправляє 1-й файл
 *  6) «битий» огляд (сервер завжди 500) не блокує наступний
 *  7) зависла відправка → тайм-аут, черга не «застрягає»
 */
'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const DATA_REPO = path.join(__dirname, '../../dolynske-data'), APP_HTML = path.join(__dirname, '../index.html');
const MOCK_JS = fs.readFileSync(path.join(__dirname, 'mocks.js'), 'utf8');
let passed = 0, failed = 0;
const ok = (c, l) => { if(c){ console.log('\x1b[32m  ✓ '+l+'\x1b[0m'); passed++; } else { console.log('\x1b[31m  ✗ '+l+'\x1b[0m'); failed++; } };

function ghContents(fp){ const f = path.join(DATA_REPO, fp); if(!fs.existsSync(f)) return null;
  if(fs.statSync(f).isDirectory()) return fs.readdirSync(f).map(n => ({name:n, path:fp+'/'+n, type:fs.statSync(path.join(f, n)).isDirectory() ? 'dir' : 'file', sha:'a'}));
  const c = fs.readFileSync(f); return {path:fp, sha:'s', content:c.toString('base64'), encoding:'base64', size:c.length}; }

// srv.rule(path, method) → 'ok' | 500 | 'hang'
async function open(browser, srv){
  const ctx = await browser.newContext({serviceWorkers:'block'}), page = await ctx.newPage();
  for(const p of ['https://cdnjs.cloudflare.com/**','https://unpkg.com/**','https://cdn.jsdelivr.net/**','https://fonts.googleapis.com/**','https://fonts.gstatic.com/**'])
    await page.route(p, r => r.fulfill({status:200, contentType:'application/javascript', body:';'}));
  await page.route('https://api.open-meteo.com/**', r => r.fulfill({status:200, body:'{}'}));
  await page.route('https://api.github.com/**', async (route, req) => {
    const m = new URL(req.url()).pathname.match(/\/contents\/(.+)$/);
    if(!m) return route.fulfill({status:404, body:'{}'});
    const fp = decodeURIComponent(m[1]), meth = req.method(), rule = srv.rule(fp, meth);
    if(rule==='hang') return;   // ніколи не відповідає
    if(typeof rule==='number') return route.fulfill({status:rule, body:'{"message":"boom"}'});
    if(meth==='PUT'){ srv.puts.push(fp); return route.fulfill({status:201, contentType:'application/json', body:JSON.stringify({content:{path:fp, sha:'n'}})}); }
    if(/raw/.test(req.headers()['accept']||'')){ const f = path.join(DATA_REPO, fp); if(!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({status:404, body:'{}'}); return route.fulfill({status:200, body:fs.readFileSync(f)}); }
    const d = ghContents(fp); return route.fulfill({status:d ? 200 : 404, contentType:'application/json', body:JSON.stringify(d || {message:'Not Found'})});
  });
  await page.addInitScript({content:MOCK_JS});
  await page.addInitScript(() => { localStorage.setItem('dl_token', 't'); localStorage.setItem('dl_name', 'Тест'); localStorage.setItem('dl_test', '1'); });
  await page.goto('file://'+APP_HTML, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window._DL_TEST, {timeout:20000});
  await page.evaluate(async () => { for(const it of await window._DL_TEST.OUTBOX.all()) await window._DL_TEST.OUTBOX.del(it.id); window._DL_TEST.OUTQ = []; });
  return {ctx, page};
}
// зберегти огляд з nPh фото і голосом (офлайн)
async function saveOffline(page, field, nPh){
  return page.evaluate(async ({field, nPh}) => {
    const T = window._DL_TEST, now = new Date().toISOString(), date = now.slice(0, 10);
    const ph = i => { const blob = new Blob([new Uint8Array(2000 + i)], {type:'image/jpeg'}); return {blob, url:URL.createObjectURL(blob), w:10, h:10, bytes:blob.size, at:now, src:'manual'}; };
    const vb = new Blob([new Uint8Array(3000)], {type:'audio/webm'});
    T.setSC({id:'t-'+Math.random().toString(36).slice(2, 8), date, field, season:+date.slice(0, 4), crop:'Пшениця озима', phase:'', state:'', problems:{}, density:'', forecast:'', comment:'', gps:null,
      photos:Array.from({length:nPh}, (_, i) => ph(i)), voice:[{blob:vb, url:URL.createObjectURL(vb), mime:'audio/webm', dur:3, at:now}], videos:[], author:'Тест', dc:{on:false, len:'', counts:[]}, sow:{}});
    await T.saveScout(); return (await T.OUTBOX.all()).length; }, {field, nPh});
}
const flush = page => page.evaluate(async () => { const idle = async () => { for(let i = 0; i < 200 && window._DL_TEST.FLUSHING; i++) await new Promise(r => setTimeout(r, 50)); };
  await idle(); await window._DL_TEST.flushScouts(); await idle(); const a = await window._DL_TEST.OUTBOX.all(); return a.map(i => ({f:i.doc.field, err:i.err||null, tries:i.tries||0, done:[...i.doc.photos, ...i.doc.voice].filter(p => p.done).length})); });

(async () => {
  const browser = await chromium.launch();
  try{
    console.log('\n[Тест 4] фото + голос офлайн → online');
    { const srv = {puts:[], rule:() => 'ok'}, {ctx, page} = await open(browser, srv);
      await ctx.setOffline(true); ok(await saveOffline(page, 'Безсмертне', 2)===1, 'огляд у черзі на телефоні');
      ok(srv.puts.length===0, 'офлайн нічого не відправлено');
      await ctx.setOffline(false); const q = await flush(page);
      ok(q.length===0, 'черга порожня після відправки');
      ok(srv.puts.filter(p => p.startsWith('media/')).length===3, '3 файли (2 фото + голос) відправлено: '+srv.puts.filter(p => p.startsWith('media/')).length);
      ok(srv.puts.some(p => /^scouts\/\d{4}\//.test(p)), 'json огляду відправлено');
      ok(srv.puts.findIndex(p => p.startsWith('scouts/')) === srv.puts.length-1, 'json — останнім (після файлів)');
      await ctx.close(); }

    console.log('\n[Тест 5] обрив на 2-му файлі → повтор без дублів');
    { let fail = true; const srv = {puts:[], rule:(fp, m) => m==='PUT' && /-2\.jpg$/.test(fp) && fail ? 500 : 'ok'}, {ctx, page} = await open(browser, srv);
      await ctx.setOffline(true); await saveOffline(page, 'Тік', 2); await ctx.setOffline(false);
      let q = await flush(page);
      ok(q.length===1 && q[0].err && q[0].tries>=1, 'огляд лишився в черзі з помилкою: '+(q[0]||{}).err);
      ok(q[0] && q[0].done===1, '1-й файл позначено відправленим');
      const txt = await page.evaluate(() => { window._DL_TEST.renderScQueue(); return (document.querySelector('#outq')||{}).innerText || ''; });
      ok(/Не відправлено оглядів: 1/.test(txt), 'на екрані видно: '+txt.trim());
      fail = false; const before = srv.puts.filter(p => /-1\.jpg$/.test(p)).length;
      q = await flush(page);
      ok(q.length===0, 'з другої спроби відправлено');
      ok(srv.puts.filter(p => /-1\.jpg$/.test(p)).length===before, '1-й файл повторно не відправлявся');
      await ctx.close(); }

    console.log('\n[Тест 6] «битий» огляд не блокує інші');
    { const srv = {puts:[], rule:(fp, m) => m==='PUT' && fp.startsWith('media/') && srv.bad && fp.includes(srv.bad) ? 500 : 'ok'}, {ctx, page} = await open(browser, srv);
      await ctx.setOffline(true); await saveOffline(page, 'Кабаняче', 1);
      srv.bad = (await page.evaluate(async () => (await window._DL_TEST.OUTBOX.all())[0].id));
      await saveOffline(page, '75', 1); await ctx.setOffline(false);
      const q = await flush(page);
      ok(q.length===1 && q[0].f==='Кабаняче', 'відправлено «75», у черзі лишився лише битий «Кабаняче»');
      await ctx.close(); }

    console.log('\n[Тест 7] зависла відправка → тайм-аут');
    { const srv = {puts:[], rule:(fp, m) => m==='PUT' && fp.startsWith('media/') ? 'hang' : 'ok'}, {ctx, page} = await open(browser, srv);
      await page.evaluate(() => { window._DL_TEST.putTimeout = 1500; });
      await ctx.setOffline(true); await saveOffline(page, 'Ферма', 1); await ctx.setOffline(false);
      const t0 = Date.now(), q = await flush(page);
      ok(Date.now()-t0 < 10000, 'flush завершився за '+(Date.now()-t0)+' мс');
      ok(q.length===1 && /немає відповіді/.test(q[0].err||''), 'помилка: '+(q[0]||{}).err);
      ok(await page.evaluate(() => window._DL_TEST.OUTQ.length===1), 'черга не «застрягла» (можна повторити)');
      await ctx.close(); }
  } finally { await browser.close(); }
  console.log('\n'+(failed ? '\x1b[31m✗ Провалено: '+failed : '\x1b[32m✓ Усі '+passed+' перевірок пройшли')+'\x1b[0m');
  process.exit(failed ? 1 : 0);
})();
