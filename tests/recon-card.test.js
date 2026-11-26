// 🛰 Звірка Fort ↔ облік: картка в «Техніці» — лише власнику (Fort етап 2, 26.11). Дані — fort/recon.json з клону dolynske-data (гілка fort-stage2 або main).
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
  const R = JSON.parse(fs.readFileSync(path.join(DATA, 'fort/recon.json'), 'utf8'));
  for(const [vw, vh, shot] of [[1200, 900, '/tmp/recon.png'], [390, 844, '/tmp/recon-m.png']]){
    await run('o', {'ref/owner.enc.json':null}, '2026-11-26T18:50+02:00', async pg => {
      await pg.setViewportSize({width:vw, height:vh});
      await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1500);
      ok(await pg.isVisible('#recon-card'), vw+'px: власник бачить картку «Звірка Fort»');
      const t = await pg.textContent('#recon-body');
      ok(t.includes('облік Карини: роботи до 19.11'), 'покриття обліку');
      ok((await pg.$$eval('#recon-day option', o => o.length))===R.days.length, 'вибір доби: '+R.days.length+' діб');
      await pg.selectOption('#recon-day', '2026-11-10'); await pg.waitForTimeout(400);
      const t2 = await pg.textContent('#recon-body');
      ok(/Т-150: працював без запису/.test(t2) && /заправка в обліку 0 л, за ДУТ 123 л/.test(t2), '10.11: розбіжності Т-150 і заправка Deutz');
      ok(/Кабаняче 10:59–20:40/.test(t2), '10.11: поле за GPS у плитці Deutz');
      ok((await pg.$eval('#recon-day', e => e.value))==='2026-11-10' && /вт 10\.11/.test(await pg.$eval('#recon-day', e => e.selectedOptions[0].textContent)), 'обрана доба лишається у списку');
      ok(/Мотогодини → ТО/.test(t2) && /внесіть показник/.test(t2), 'блок мотогодини → ТО');
      const sw0 = await pg.evaluate(() => { const c = document.querySelector('#recon-card'); c.hidden = true; const w = document.documentElement.scrollWidth; c.hidden = false; return w; });
      console.log('  без картки звірки ширина', sw0, '| ширина .grid', await pg.evaluate(() => Math.round(document.querySelector('#pane-tech .grid').getBoundingClientRect().width)));
      const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
      if(sw > vw + 1) console.log('  ширші за екран:', await pg.evaluate(w => [...document.querySelectorAll('#pane-tech *')].filter(e => e.getBoundingClientRect().right > w + 1 && e.offsetParent && !e.closest('.tablewrap')).slice(0, 6).map(e => e.tagName+'#'+e.id+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right)), vw));
      ok(sw <= vw + 1, 'сторінка не ширша за екран ('+vw+', '+sw+')');
      await (await pg.$('#recon-card')).screenshot({path:shot});
    });
  }
  await run('k', {}, '2026-11-26T18:50+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1200);
    ok(!(await pg.isVisible('#recon-card')), 'у Каріни картки звірки немає');
  });
  await run('o', {'ref/owner.enc.json':null, 'fort/recon.json':null}, '2026-11-26T18:50+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1200);
    ok(/Звірки ще немає/.test(await pg.textContent('#recon-body')), 'без fort/recon.json — підказка, без помилок');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
