// Очищення запису людини у відкритому дні; закритий день змінює лише власник (25.11).
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
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  const closedDay = d => { const x = day(d, [W('75', 'Оранка', 'Deutz великий', 'Зінько В.', 12)]); x.ui.rows = [{id:1, p:'Зінько В.', st:'працює', op:'Оранка', f:'75', m:'Deutz великий', q:'12', u:'га', fuel:'', oil:'', oilq:''}]; return x; };
  const extra = {'days/2026/2026-11-24.json': closedDay('2026-11-24')};
  await run('k', extra, '2026-11-25T15:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'day'; }); await pg.waitForTimeout(1000);
    const p = await pg.evaluate(() => { const r = DS.rows[0]; Object.assign(r, {st:'працює', op:'Оранка', f:'75', q:'5', u:'га'}); renderDay(); return r.p; });
    const n0 = await pg.evaluate(() => DS.rows.length);
    const btn = await pg.$('#rows button[aria-label="Очистити запис '+p+'"]'); ok(!!btn, 'у заповненому рядку є ✕ «Очистити запис»');
    await btn.click(); await pg.waitForTimeout(200);
    const r = await pg.evaluate(() => ({n:DS.rows.length, p:DS.rows[0].p, op:DS.rows[0].op, st:DS.rows[0].st}));
    ok(r.n===n0 && r.p===p && !r.op && !r.st, 'роботу очищено, людина лишилась ('+r.p+')');
    ok(!(await pg.$('#rows button[aria-label="Очистити запис '+p+'"]')), 'у порожньому рядку ✕ немає');
    await pg.click('button:text("↶ Повернути")'); await pg.waitForTimeout(200);
    ok(await pg.evaluate(() => DS.rows[0].op)==='Оранка', '«Повернути» відновлює запис');
    await pg.click('#prev-day'); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => isClosed(DAY)), 'відкрито закритий 24.11');
    ok(!(await pg.$('#rows button[aria-label^="Очистити запис"]')), 'у закритому дні ✕ немає');
    ok(await pg.evaluate(() => document.querySelector('#pane-day').classList.contains('daylock')), 'закритий день заблоковано');
    ok(!(await pg.isVisible('#btn-reopen')), 'у Каріни немає «Виправити день»');
    ok(/лише через власника/.test(await pg.textContent('#closesum')), 'підказка: змінити — лише через власника');
  });
  await run('o', {...extra, 'ref/owner.enc.json':null}, '2026-11-25T15:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'day'; DAY = '2026-11-24'; openDay(); renderDay(); }); await pg.waitForTimeout(800);
    ok(await pg.isVisible('#btn-reopen'), 'власник бачить «Виправити день»');
    await pg.click('#btn-reopen'); await pg.waitForTimeout(300);
    ok(!(await pg.evaluate(() => document.querySelector('#pane-day').classList.contains('daylock'))), 'після «Виправити» — розблоковано');
    ok(!!(await pg.$('#rows button[aria-label^="Очистити запис"]')), 'власник може очистити запис у виправленні');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
