// «Різне» — пальне не під працівника з обов'язковим коментарем; мотогодини: + CASE 5088, без генератора (25.11).
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
  await run('k', {}, '2026-11-25T15:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'day'; }); await pg.waitForTimeout(1000);
    ok(!(await pg.isVisible('#appl')), 'у Каріни немає «Інше внесення»');
    ok(await pg.isVisible('#misc'), 'у Каріни є «Різне — пальне не під працівника»');
    await pg.click('#add-misc'); await pg.waitForTimeout(200);
    await pg.fill('#misc-list input[aria-label="Літрів"]', '20'); await pg.press('#misc-list input[aria-label="Літрів"]', 'Tab'); await pg.waitForTimeout(200);
    ok(/день не закриється/i.test(await pg.textContent('#misc-list')), 'без «кому» і коментаря — попередження');
    const blk = await pg.evaluate(() => checks().filter(c => c[0]==='block').map(c => c[1]).join(' | ')); ok(/Різне/.test(blk), 'перевірка дня блокує закриття: '+blk.slice(0, 80));
    await pg.fill('#misc-list input[aria-label="Кому"]', 'Петренко (сусід)'); await pg.press('#misc-list input[aria-label="Кому"]', 'Tab');
    await pg.fill('#misc-list input[aria-label="Коментар"]', 'у каністру на агрегат, за домовленістю з Д.О.'); await pg.press('#misc-list input[aria-label="Коментар"]', 'Tab'); await pg.waitForTimeout(200);
    const blk2 = await pg.evaluate(() => checks().filter(c => c[0]==='block' && /Різне/.test(c[1])).length); ok(blk2===0, 'з коментарем — блок знято');
    const doc = await pg.evaluate(() => buildDayDoc());
    const c1 = doc.fuel.cells.find(c => c[1]==='Різне (ДП)'), c2 = doc.fuel.cells.find(c => c[0]==='Примітка');
    ok(c1 && c1[2]===20, 'у пальне пішло 20 л у «Різне (ДП)»'); ok(c2 && /Петренко/.test(c2[2]) && /каністру/.test(c2[2]), 'розшифровка в «Примітка»: '+(c2||[])[2]);
    ok(await pg.evaluate(() => dayTotals().dp) >= 20, 'ДП за день враховує «Різне»');
    // застосування до таблиці пального
    const note = await pg.evaluate(d => { const raw = JSON.parse(JSON.stringify(BASE)); applyDoc(raw, d); const fp = parseFuel(raw); return fp.notes.filter(n => n.d.n===toSerial('2026-11-25')).map(n => n.t).join(';') + ' / ' + fp.fuel.filter(f => f.d.n===toSerial('2026-11-25') && f.m==='Різне (ДП)').map(f => f.l).join(','); }, doc);
    ok(/Петренко/.test(note) && /20/.test(note.split(' / ')[1]), 'у таблиці пального: '+note);
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1500);
    const opts = await pg.$$eval('#mh-m option', o => o.map(x => x.value));
    ok(opts.includes('CASE 5088'), 'мотогодини: є CASE 5088 ('+opts.join(', ')+')'); ok(!opts.some(x => /генератор/i.test(x)), 'мотогодини: генератора немає');
    const toTxt = await pg.evaluate(() => { const c = document.querySelector('#pane-tech').cloneNode(true); c.querySelector('#rp-m').remove(); const g = c.querySelector('#gen-card'); if(g) g.remove(); return c.textContent; }); const mm = toTxt.replace(/\s+/g,' ').match(/.{0,80}(Estar|генератор).{0,80}/i); console.log('  >>', mm && mm[0]); ok(!/Estar|генератор/i.test(toTxt.replace('Deutz великий, Deutz малий, JCB 541-70, CASE 5088.', '')), 'генератора немає ні в графіку ТО, ні в мотогодинах');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
