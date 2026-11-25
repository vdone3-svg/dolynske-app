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
  const br = await chromium.launch(); const ctx = await br.newContext({serviceWorkers:'block', timezoneId:'Europe/Kiev', viewport:{width:390, height:844}, isMobile:true, hasTouch:true});
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
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  await run('o', {'ref/owner.enc.json':null}, '2026-12-04T13:00:00+02:00', async pg => {
    ok(await pg.isVisible('#view-as'), 'у власника є перемикач');
    const tabsO = await pg.$$eval('#tabs a', a => a.length);
    await pg.selectOption('#view-as', 'k'); await pg.waitForLoadState(); await pg.waitForFunction(() => /завантажено/.test((document.querySelector('#sync')||{}).textContent||''), null, {timeout:60000});
    const tk = await pg.$$eval('#tabs a', a => a.map(x => x.textContent.trim()));
    ok(await pg.isVisible('#view-bar') && (await pg.textContent('#view-bar')).includes('Каріна'), 'смуга «як Каріна»');
    ok(!tk.some(t => /Звіт дня|Завдання|Огляди|Агрозвіт|Довідники|^Поля$|Склад/.test(t)) && tk.some(t => t==='День'), 'вкладки Каріни: '+tk.join(', '));
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(500); ok(!(await pg.isVisible('#tech-year')) && await pg.isVisible('#to-section'), 'Техніка: без «за календарний рік», ТО є'); ok(!(await pg.isVisible('#years')), 'у Каріни немає вибору року'); ok(!(await pg.evaluate(() => toReminders().some(r => /ХТА/.test(r.refName)))), 'ХТА без нагадування мотогодин'); await pg.evaluate(() => { location.hash = 'day'; }); await pg.waitForTimeout(300);
    ok((await pg.evaluate(() => TAB))==='day', 'стартова — День');
    ok((await pg.evaluate(() => whoName())).includes('перегляд: обліковець'), 'підпис записів: '+await pg.evaluate(() => whoName()));
    ok(!(await pg.isVisible('#btn-reopen')) && !(await pg.isVisible('#alerts')) && !(await pg.isVisible('#btn-xlsx')), 'у Каріни немає «Виправити день», тривог, Excel'); await pg.screenshot({path:require('os').tmpdir()+'/pv.png'});
    await pg.selectOption('#view-as', 'a'); await pg.waitForLoadState(); await pg.waitForFunction(() => /завантажено/.test((document.querySelector('#sync')||{}).textContent||''), null, {timeout:60000});
    const ta = await pg.$$eval('#tabs a', a => a.map(x => x.textContent.trim()));
    ok(!(await pg.isVisible('#years')), 'у Вови немає вибору року');
    ok((await pg.evaluate(() => Object.keys(SCOUTS).length))===0, 'у Вови немає оглядів з Viber');
    await pg.evaluate(() => { location.hash = 'journal'; }); await pg.waitForTimeout(500);
    ok(!(await pg.isVisible('#jr-day-card')) && !(await pg.isVisible('#jr-card')) && await pg.isVisible('#zzr-card'), 'Журнал у Вови — лише ЗЗР');
    await pg.screenshot({path:require('os').tmpdir()+'/jr.png'});
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(300); ok(!ta.some(t => /^День$|Пальне|Склад|АКБ|Звіт дня|^Поля$|Гібриди/.test(t)) && (await pg.evaluate(() => TAB))==='tasks', 'вкладки Вови: '+ta.join(', '));
    ok((await pg.evaluate(() => document.documentElement.scrollWidth)) <= 391, 'сторінка не ширша за екран телефону'); await pg.screenshot({path:require('os').tmpdir()+'/pv.png'});
    await pg.click('#view-bar button'); await pg.waitForLoadState(); await pg.waitForFunction(() => /завантажено/.test((document.querySelector('#sync')||{}).textContent||''), null, {timeout:60000});
    ok(!(await pg.$('#view-bar')) && (await pg.$$eval('#tabs a', a => a.length))===tabsO, 'повернення до власника — усі вкладки ('+tabsO+')');
  });
  await run('k', {}, '2026-12-04T13:00:00+02:00', async pg => { ok(!(await pg.$('#view-as')), 'у Каріни перемикача немає'); ok((await pg.evaluate(() => whoName()))==='Обліковець (Каріна Козлова)' && (await pg.textContent('#role-name'))==='Обліковець (Каріна Козлова)', 'підпис Каріни'); });
  await run('a', {}, '2026-12-04T13:00:00+02:00', async pg => { ok((await pg.evaluate(() => whoName()))==='Керуючий (Володимир Зінько)', 'підпис Вови'); });
  await run('o', {'ref/owner.enc.json':null}, '2026-12-04T13:00:00+02:00', async pg => { const w = await pg.evaluate(() => whoName()); ok(w==='Власник (Денис Олександрович Котов)', 'підпис власника: '+w); });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
