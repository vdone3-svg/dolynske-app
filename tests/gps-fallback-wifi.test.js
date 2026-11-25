// Перевірка ролей, етап 2: нагадування «день не закрито», підтвердження гектарів керуючим.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
let GEO = null; const fs = require('fs'), path = require('path');
const DATA = process.env.DATA || '/home/claude/dolynske-data', APP = require('path').join(__dirname, '..', 'index.html');   // DATA — клон dolynske-data; бібліотеки — npm i d3 xlsx leaflet у /tmp/npm
const LIB = {'d3.min.js':'/tmp/npm/node_modules/d3/dist/d3.min.js', 'xlsx.full.min.js':'/tmp/npm/node_modules/xlsx/dist/xlsx.full.min.js', 'leaflet.js':'/tmp/npm/node_modules/leaflet/dist/leaflet.js', 'leaflet.css':'/tmp/npm/node_modules/leaflet/dist/leaflet.css'};
const day = (d, rows) => ({kind:'day', date:d, saved_at:d+'T09:00:00Z', by:'Козлова К.', ui:{rows:[], appl:[], own:[], ship:[], gm:[], zav:[]}, rows:{'Роботи':rows, 'Внесення':[], 'Урожай':[], 'Відвантаження':[], 'Рух зерна':[]}, fuel:{date:d, cells:[]}});
const W = (f, op, m, p, q) => ({'Дата':46000, 'Поле':f, 'Операція':op, 'Техніка':m, 'Працівник':p, 'Обсяг':q, 'Од.':'га', 'Джерело':'додаток'});
function vfs(extra){
  const V = {};
  const walk = d => { for(const n of fs.readdirSync(path.join(DATA, d))){ const p = d ? d+'/'+n : n; if(p.startsWith('.git')) continue; const st = fs.statSync(path.join(DATA, p)); if(st.isDirectory()) walk(p); else if(st.size < 30e6) V[p] = () => fs.readFileSync(path.join(DATA, p)); } };
  walk(''); V['bundle/bundle.json'] = () => '{"docs":{}}';
  Object.entries(extra).forEach(([p, o]) => { if(o===null) delete V[p]; else V[p] = () => JSON.stringify(o); });
  return V;
}
async function run(role, extra, fake, fn){
  const V = vfs(extra), puts = [];
  const br = await chromium.launch(); const ctx = await br.newContext({serviceWorkers:'block', timezoneId:'Europe/Kiev', viewport:{width:390, height:844}, isMobile:true, hasTouch:true, ...(GEO ? {geolocation:GEO, permissions:['geolocation']} : {})});
  await ctx.addInitScript(([role, fake]) => { localStorage.setItem('dl_token', 't'); localStorage.setItem('dl_role', role); localStorage.setItem('dl_name', role==='a' ? 'Вова' : role==='k' ? 'Каріна' : 'Денис');
    const off = new Date(fake) - Date.now(), D0 = Date; class FD extends D0{ constructor(...a){ if(a.length) super(...a); else super(D0.now()+off); } static now(){ return D0.now()+off; } } window.Date = FD; }, [role, fake]);
  await ctx.route('**/*', async r => { const u = new URL(r.request().url());
    if(u.host==='app.test') return r.fulfill({body:fs.readFileSync(APP), contentType:'text/html'});
    const lib = Object.keys(LIB).find(k => u.pathname.endsWith(k)); if(lib) return r.fulfill({body:fs.readFileSync(LIB[lib]), contentType: lib.endsWith('.css') ? 'text/css' : 'application/javascript'});
    if(u.host==='api.github.com'){ const m = u.pathname.match(/\/contents\/?(.*)$/), p = m ? decodeURIComponent(m[1]) : '';
      if(r.request().method()==='PUT'){ const b = JSON.parse(r.request().postData()); const raw = Buffer.from(b.content, 'base64'); let doc; try{ doc = JSON.parse(raw.toString('utf8')); }catch(e){ doc = {bin:raw.length}; } puts.push([p, doc]); V[p] = () => doc.bin!=null ? raw : JSON.stringify(doc); return r.fulfill({body:'{"content":{}}', contentType:'application/json'}); }
      if(V[p]){ if((r.request().headers().accept || '').includes('raw')) return r.fulfill({body:V[p]()}); return r.fulfill({body:JSON.stringify({type:'file', path:p, sha:'x'}), contentType:'application/json'}); }
      const kids = Object.keys(V).filter(k => k.startsWith(p+'/')); if(kids.length){ const seen = new Map(); kids.forEach(k => { const rest = k.slice(p.length+1), n = rest.split('/')[0]; seen.set(n, rest.includes('/') ? 'dir' : 'file'); });
        return r.fulfill({body:JSON.stringify([...seen].map(([n, t]) => ({name:n, path:p+'/'+n, type:t, sha:'s-'+p+'/'+n}))), contentType:'application/json'}); }
      return r.fulfill({status:404, body:'{}'}); }
    return r.fulfill({body:''}); });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('https://app.test/'); await pg.waitForTimeout(500);
  if(role==='o'){ await pg.fill('#owner-gate input[autocomplete="name"]', 'Денис'); const pw = await pg.$$('#owner-gate input[type=password]'); for(const i of pw) await i.fill('testpassword123'); await pg.click('#owner-gate .btn.primary'); await pg.waitForTimeout(4000); await pg.screenshot({path:require('os').tmpdir()+'/shot.png'}); console.log('SYNC', await pg.evaluate(() => (document.querySelector('#sync')||{}).textContent + ' | ' + ((document.querySelector('#owner-gate')||{}).textContent||''))); }
  await pg.waitForFunction(() => document.querySelector('#sync') && /завантажено|Без зв/.test(document.querySelector('#sync').textContent), null, {timeout:60000});
  await fn(pg, puts); if(errs.length) console.log('  ПОМИЛКИ JS:', errs.slice(0, 5));
  await br.close(); return errs;
}
(async () => {
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  const PUTS = []; 
  GEO = null;   // GPS відмовлено
  await run('a', {}, '2026-11-25T11:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(2000);
    ok(!/Запасний режим/.test(await pg.textContent('#sc-form')), 'до 60 с запасного режиму немає');
    await pg.evaluate(() => { SC.gpsStart -= 61000; renderScForm(); }); await pg.waitForTimeout(200);
    ok(/Немає GPS у полі\? Запасний режим/.test(await pg.textContent('#sc-form')), 'після 60 с — запасний режим');
    await pg.click('#sc-form button.chip:text("РЕБ / глушіння")'); await pg.waitForTimeout(200);
    await pg.selectOption('#sc-form select[aria-label="На якому ви полі?"]', '75'); await pg.waitForTimeout(300);
    ok(!(await pg.$eval('#sc-form .sc-bigbtn', b => b.disabled)), 'після причини й поля — кнопки працюють');
    await pg.click('#sc-form button.chip:text("Написати текстом")'); await pg.fill('#sc-form textarea', 'РЕБ, огляд вручну'); await pg.click('#sc-save'); await pg.waitForTimeout(2500);
    const p = puts.find(x => /^scouts\//.test(x[0])); ok(p && p[1].nogps && p[1].nogps.reason==='reb' && p[1].field==='75' && !p[1].gps, 'огляд збережено з позначкою «без GPS: РЕБ»');
  });
  GEO = {latitude:50.45, longitude:30.52, accuracy:10};   // РЕБ-підміна: точка за сотні км
  await run('a', {}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(2500);
    const t = await pg.textContent('#sc-form'); ok(/неправдиве місце/.test(t) && /Запасний режим/.test(t), 'підміна GPS — попередження й запасний режим одразу');
  });
  // відео чекає Wi-Fi
  await run('a', {}, '2026-11-25T11:00:00+02:00', async (pg, puts) => {
    await pg.waitForTimeout(500);
    await pg.evaluate(async () => {
      const doc = {kind:'scout', v:2, id:'w-1', date:'2026-11-25', at:'2026-11-25T10:00:00Z', by:'x', author:'x', field:'75', season:2027, problems:[], comment:'', gps:{lat:48.712, lon:33.62, acc:5},
        photos:[{k:0, path:'media/2026/w-1-1.jpg'}], voice:[], videos:[{mime:'video/mp4', dur:20, parts:[{k:1, vpart:true, wifi:true, path:'media/2026/w-1-video1.mp4.part1'}], status:'pending'}]};
      await OUTBOX.put({id:'w-1', path:'scouts/2026/w-1.json', doc, blobs:[new Blob(['p']), new Blob([new Uint8Array(3e6)])], urls:[], vurls:[]});
      OUTQ = await OUTBOX.all(); await flushScouts();
    });
    let names = puts.map(x => x[0]); ok(names.some(n => n.endsWith('w-1-1.jpg')) && names.includes('scouts/2026/w-1.json') && !names.some(n => /part1/.test(n)), 'фото й огляд пішли, відео — ні');
    ok(/Відео чекає Wi-Fi: 1 \(3 МБ\)/.test(await pg.textContent('#outq')), 'смуга «Відео чекає Wi-Fi» з кнопкою');
    await pg.evaluate(async () => { await flushScouts(); }); ok(puts.filter(x => x[0]==='scouts/2026/w-1.json').length===1, 'автоповтор не перезаписує огляд');
    await pg.click('#outq button'); await pg.waitForTimeout(1500);
    names = puts.map(x => x[0]); const js = puts.filter(x => x[0]==='scouts/2026/w-1.json');
    ok(names.some(n => /part1/.test(n)) && js.length===2 && js[1][1].video_sent, 'кнопка «Я на Wi-Fi» — відео пішло, огляд позначено');
    ok((await pg.evaluate(async () => (await OUTBOX.all()).length))===0, 'черга порожня');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
