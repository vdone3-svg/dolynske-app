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
  const sc = {kind:'scout', v:2, id:'t-1', date:'2026-11-20', at:'2026-11-20T10:00:00Z', by:'Керуючий (Володимир Зінько)', author:'Керуючий (Володимир Зінько)', field:'75', season:2027, crop:'Пшениця озима', phase:'', state:'', problems:[], comment:'тест',
    gps:{lat:48.7120, lon:33.6205, acc:6, auto:'75', inside:true, m:0}, photos:[{k:0, path:'media/2026/t-1-1.jpg', lat:48.7121, lon:33.6207, acc:5, src:'phone', field:'75'}, {k:1, path:'media/2026/t-1-2.jpg', lat:48.7300, lon:33.6500, acc:5, src:'phone', field:'75'}], voice:[], videos:[]};
  await run('o', {'ref/owner.enc.json':null, 'scouts/2026/t-1.json':sc}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'history'; }); await pg.waitForTimeout(800);
    await pg.selectOption('#h-field', '75'); await pg.waitForTimeout(400);
    await pg.selectOption('#h-year', 'all'); await pg.waitForTimeout(1500);
    const t = await pg.textContent('#h-body');
    console.log('  2026:', (t.match(/Сезон — урожай 2026[^С]{0,40}/) || [''])[0]);
    ok(/Висновок по сезону/.test(t), 'є висновок по сезону');
    const m = t.match(/Поле «75»: сезон під урожай 2026[^]*?(?=Сезон — урожай|$)/); console.log('  ', (m ? m[0] : t.slice(0, 300)).replace(/\s+/g, ' ').slice(0, 400));
    ok(/Знято на полі «75»/.test(t) && /поза полем 1/.test(t), 'огляд: на полі, 1 фото поза полем');
    ok(await pg.$('#h-body svg[aria-label^="Поле «75»"]'), 'мініатюра поля з точками');
    await pg.evaluate(() => document.querySelector('#h-body svg[aria-label^="Поле «75»"]').scrollIntoView({block:'center'})); await pg.screenshot({path:'/tmp/h_scout.png'});
    await pg.locator('#h-body .card', {hasText:'Висновок по сезону'}).first().scrollIntoViewIfNeeded(); await pg.screenshot({path:'/tmp/h_close.png'});
  });
  GEO = null;
  await run('a', {}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(2500);
    const t = await pg.textContent('#sc-form');
    ok(!(await pg.$('#sc-form select')) && !/З галереї/.test(t), 'без GPS: немає вибору поля й галереї');
    ok(await pg.$eval('#sc-form .sc-bigbtn', b => b.disabled), 'кнопка Фото заблокована без GPS');
    await pg.screenshot({path:'/tmp/sc_nogps.png'});
  });
  GEO = {latitude:48.7120, longitude:33.6205, accuracy:6};
  await run('a', {}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(3000);
    const t = await pg.textContent('#sc-form'); ok(/Поле:\s*75/.test(t) && /за GPS/.test(t) && !/інше поле/.test(t), 'з GPS: поле 75 за GPS, без «інше поле»');
    ok(!(await pg.$eval('#sc-form .sc-bigbtn', b => b.disabled)), 'кнопки активні');
  });
  await run('o', {'ref/owner.enc.json':null}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(2500);
    ok(/З галереї/.test(await pg.textContent('#sc-form')), 'власнику галерея й вибір поля лишаються');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
