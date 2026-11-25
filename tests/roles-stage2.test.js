// Перевірка ролей, етап 2: нагадування «день не закрито», підтвердження гектарів керуючим.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
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
  const br = await chromium.launch(); const ctx = await br.newContext({serviceWorkers:'block', timezoneId:'Europe/Kiev', viewport:{width:1200, height:900}});
  await ctx.addInitScript(([role, fake]) => { localStorage.setItem('dl_token', 't'); localStorage.setItem('dl_role', role); localStorage.setItem('dl_name', role==='a' ? 'Вова' : role==='k' ? 'Каріна' : 'Денис');
    const off = new Date(fake) - Date.now(), D0 = Date; class FD extends D0{ constructor(...a){ if(a.length) super(...a); else super(D0.now()+off); } static now(){ return D0.now()+off; } } window.Date = FD; }, [role, fake]);
  await ctx.route('**/*', async r => { const u = new URL(r.request().url());
    if(u.host==='app.test') return r.fulfill({body:fs.readFileSync(APP), contentType:'text/html'});
    const lib = Object.keys(LIB).find(k => u.pathname.endsWith(k)); if(lib) return r.fulfill({body:fs.readFileSync(LIB[lib]), contentType: lib.endsWith('.css') ? 'text/css' : 'application/javascript'});
    if(u.host==='api.github.com'){ const m = u.pathname.match(/\/contents\/?(.*)$/), p = m ? decodeURIComponent(m[1]) : '';
      if(r.request().method()==='PUT'){ const b = JSON.parse(r.request().postData()); const doc = JSON.parse(Buffer.from(b.content, 'base64').toString('utf8')); puts.push([p, doc]); V[p] = () => JSON.stringify(doc); return r.fulfill({body:'{"content":{}}', contentType:'application/json'}); }
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
  const extra = {'days/2026/2026-12-01.json': day('2026-12-01', [W('75', 'Оранка', 'Deutz великий', 'Прунян В.', 12), W('75', 'Оранка', 'Deutz великий', 'Козлов Н.', 12), W('Тік', 'Дискування', 'ХТА 200', 'Мазур В.', 20)]),
    'days/2026/2026-12-03.json': day('2026-12-03', [W('Пленного', 'Культивація', 'ХТА 200', 'Мазур В.', 15)])};
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  console.log('— Власник звіряє гектари, 04.12 13:00');
  await run('o', {...extra, 'ref/owner.enc.json':null}, '2026-12-04T13:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(800);
    await pg.waitForSelector('#hc-card:not([hidden])'); const t = await pg.textContent('#hc-card');
    ok(t.includes('75 · Оранка · Deutz великий — 12 га') && !t.includes('24 га'), 'оранка 75: 12 га (тракторист і помічник не дублюються)');
    ok(t.includes('Тік · Дискування') && t.includes('Пленного'), 'обидва закриті дні в списку');
    ok(!/Прунян|Козлов Н|Мазур/.test(t), 'імен з табеля не видно');
    const badge = await pg.textContent('#tabs a[href="#tasks"]'); ok(/2/.test(badge), 'бейдж «Завдання» власника рахує 2 незвірені дні: '+badge);
    // «Не так» по Тіку
    const rows = await pg.$$('#hc-card button:text("Не так")'); await rows[2].click();
    await pg.fill('#hc-card input[placeholder="Скільки було, га"]:visible', '18'); await pg.fill('#hc-card input[placeholder^="Чому"]:visible', 'там 18 га');
    await pg.click('#hc-card button:text("Зберегти"):visible'); await pg.waitForTimeout(400);
    const p1 = puts.find(x => x[0]==='confirm/2026/2026-12-01.json'); ok(p1 && p1[1].items['Тік|Дискування|ХТА 200'].ok===false && p1[1].items['Тік|Дискування|ХТА 200'].fact===18, '«не так» збережено з фактом 18 га');
    { const bs = await pg.$$('#hc-card button:text("✓ Решта все вірно")'); await bs[bs.length-1].click(); } await pg.waitForTimeout(400);
    const last = puts.filter(x => x[0]==='confirm/2026/2026-12-01.json').pop()[1];
    ok(last.items['75|Оранка|Deutz великий'].ok===true && last.items['Тік|Дискування|ХТА 200'].ok===false, '«решта вірно» не перетирає «не так»');
    const t2 = await pg.textContent('#hc-card'); ok(t2.includes('✕ не так') && t2.includes('«там 18 га»'), 'статус «не так» з коментарем показано');
    await pg.screenshot({path:require('os').tmpdir()+'/shot.png', fullPage:false});
  });
  console.log('— Обліковець, 04.12 13:00');
  await run('k', {...extra, 'confirm/2026/2026-12-01.json': {kind:'confirm', date:'2026-12-01', items:{'Тік|Дискування|ХТА 200':{ok:false, ha:20, fact:18, c:'там 18 га', by:'Вова'}}}}, '2026-12-04T13:00:00+02:00', async pg => {
    await pg.waitForSelector('#day-remind:not([hidden])'); const t = await pg.textContent('#day-remind'); ok(t.includes('02.12') && !t.includes('01.12') && !t.includes('03.12'), 'нагадування: не закрито лише 02.12 (03.12 ще до 12:00 05.12) — '+t.replace(/\s+/g, ' ').slice(0, 90));
    await pg.click('#day-remind button'); ok(await pg.inputValue('#date')==='2026-12-02', 'кнопка відкриває 02.12');
    await pg.fill('#date', '2026-12-01'); await pg.dispatchEvent('#date', 'change'); await pg.waitForTimeout(300);
    const h = await pg.textContent('#ha-conf'); ok(h.includes('«не так»') && h.includes('18'), 'у закритому дні — «гектари не так» ( погодився»');
    ok(!(await pg.$('#ha-conf button:text("✓")')), 'кнопок підтвердження в обліковця немає');
    ok(!(await pg.isVisible('#hc-card')), 'картки підтвердження в «Завданнях» в обліковця немає');
    await pg.screenshot({path:require('os').tmpdir()+'/shot.png', fullPage:false});
  });
  console.log('— Обліковець, 02.12 11:00 (ще до 12:00)');
  await run('k', extra, '2026-12-02T11:00:00+02:00', async pg => { await pg.waitForTimeout(300); console.log('R:', await pg.evaluate(() => [document.querySelector('#day-remind').hidden, document.querySelector('#day-remind').textContent, isoToday(), new Date().toString()])); ok(!(await pg.isVisible('#day-remind')), 'до 12:00 наступного дня нагадування немає'); });
  console.log('— Обліковець, 25.11 18:00 (до 1.12)');
  await run('k', {}, '2026-11-25T18:00:00+02:00', async pg => { await pg.waitForTimeout(300); ok(!(await pg.isVisible('#day-remind')), 'до 1.12 нагадувань немає'); });
  console.log('— Власник, 04.12 13:00');
  await run('o', {...extra, 'ref/owner.enc.json':null}, '2026-12-04T13:00:00+02:00', async pg => {
    await pg.goto('https://app.test/#tasks'); await pg.waitForTimeout(800);
    const t = await pg.textContent('#hc-card'); ok(t.includes('не звірено') && !!(await pg.$('#hc-card button:text("Не так")')), 'власник бачить стан без кнопок');
    await pg.goto('https://app.test/#day'); await pg.waitForTimeout(800);
    ok(await pg.isVisible('#day-remind'), 'власнику нагадування в «Дні» теж');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
