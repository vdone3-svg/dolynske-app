// 26.11d: GPS огляду — стара збережена точка iPhone не приймається; далі 150 м від поля поле не підставляється.
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

const FAKE_GEO = (lat0, lon0, lat1, lon1) => `(() => { const g = navigator.geolocation; g.watchPosition = (ok) => {
  const mk = (la, lo, ts) => ({coords:{latitude:la, longitude:lo, accuracy:12}, timestamp:ts});
  setTimeout(() => ok(mk(${lat0}, ${lon0}, Date.now() - 600000)), 50);       // стара збережена (10 хв тому)
  ${lat1!=null ? `setTimeout(() => ok(mk(${lat1}, ${lon1}, Date.now())), 400);` : ''}  // свіжа
  return 1; }; g.clearWatch = () => {}; })();`;
(async () => {
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  const newScout = async pg => { await pg.evaluate(() => { location.hash = 'scout'; }); await pg.waitForTimeout(500); await pg.click('#sc-new'); await pg.waitForTimeout(2500); return pg.textContent('#sc-form'); };
  // A) свіжа точка за 317 м від Молоківки 47 (як 26.11 у Вови)
  GEO = {latitude:48.702775, longitude:33.631478, accuracy:12};
  await run('a', {}, '2026-11-26T15:30:00+02:00', async pg => { const t = await newScout(pg);
    ok(/поза полями/.test(t) && /317 м/.test(t), 'точка за 317 м: попередження, а не «Поле: Молоківка 47»');
    ok(!/📍 Поле:/.test(t), 'поле не підставлено автоматично');
    ok(await pg.$eval('#sc-form .sc-bigbtn', b => b.disabled), 'Фото заблоковано, доки GPS не підтвердить поле (або запасний режим)'); });
  // B) на полі 75
  GEO = {latitude:48.7120, longitude:33.6205, accuracy:6};
  await run('a', {}, '2026-11-26T15:30:00+02:00', async pg => { const t = await newScout(pg);
    ok(/📍 Поле:\s*75/.test(t), 'на полі 75 — поле за GPS'); });
  // C) спершу стара точка біля бригади, потім свіжа на полі 75 → береться свіжа
  GEO = null;
  const orig = run;
  await (async () => { const { chromium } = require('/opt/npm-tools/node_modules/playwright'); })();
  GEO = {latitude:0, longitude:0, accuracy:1};
  const _newCtx = chromium.launch;
  chromium.launch = async (...a) => { const br = await _newCtx.apply(chromium, a); const nc = br.newContext.bind(br);
    br.newContext = async o => { const c = await nc(o); await c.addInitScript(FAKE_GEO(48.702775, 33.631478, 48.7120, 33.6205)); return c; }; return br; };
  await run('a', {}, '2026-11-26T15:30:00+02:00', async pg => { const t = await newScout(pg);
    ok(/📍 Поле:\s*75/.test(t), 'стара збережена точка відкинута, взято свіжу (поле 75)'); });
  chromium.launch = async (...a) => { const br = await _newCtx.apply(chromium, a); const nc = br.newContext.bind(br);
    br.newContext = async o => { const c = await nc(o); await c.addInitScript(FAKE_GEO(48.7120, 33.6205, null, null)); return c; }; return br; };
  await run('a', {}, '2026-11-26T15:30:00+02:00', async pg => { const t = await newScout(pg);
    ok(!/📍 Поле:/.test(t), 'лише стара точка (навіть на полі) — не приймається, GPS шукає далі'); });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО'); process.exit(bad ? 1 : 0);
})();
