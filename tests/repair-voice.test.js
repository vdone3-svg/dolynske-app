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
  const ev = {kind:'event', what:'ремонт', id:'rp-x', saved_at:'2026-11-24T10:00:00Z', by:'Керуючий (Володимир Зінько)', typed:'', voice:[{path:'media/2026/rp-x.m4a', status:'done', text:'поміняли фільтр'}],
    rows:{'Ремонти і ТО':[{'Дата':46350, 'Техніка':'Deutz великий', 'Вид':'ТО', 'Що зроблено':'Замінено масляний фільтр.\n🔩 Фільтр масляний — 1 шт', '_id':'rp-x'}]},
    ai:{summary:'Замінено масляний фільтр.', parts:[{name:'Фільтр масляний', qty:1, unit:'шт'}], questions:[{id:'q1', q:'Масло теж міняли?', options:['Так, повністю', 'Долили', 'Ні']}], remarks:['Запишіть мотогодини після ТО.']}};
  const extra = {'events/2026/2026-11-24T10-00-00-000Z-ab12.json':ev};
  await run('a', extra, '2026-11-25T11:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1000);
    ok(await pg.$('textarea#rp-w') && /Надиктувати/.test(await pg.textContent('#rp-voice')), 'поле — багаторядкове, є «🎙 Надиктувати»');
    const t = await pg.textContent('#rp-q'); ok(/Масло теж міняли\?/.test(t) && /Запишіть мотогодини/.test(t), 'Вова бачить питання й зауваження Claude');
    ok(/🔩 Фільтр масляний/.test(await pg.textContent('#rp-table')), 'у таблиці — запчастини');
    await pg.click('#rp-q button.chip:text("Долили")'); await pg.waitForTimeout(800);
    const p = puts.filter(x => x[0].startsWith('events/2026/2026-11-24')).pop(); ok(p && p[1].answers.q1.a==='Долили' && /Масло теж міняли\? — Долили/.test(p[1].rows['Ремонти і ТО'][0]['Що зроблено']), 'відповідь збережено й дописано в запис');
    // новий запис голосом
    await pg.evaluate(() => { RPV.blob = new Blob([new Uint8Array(2000)], {type:'audio/mp4'}); RPV.mime = 'audio/mp4'; RPV.dur = 14; RPV.url = ''; renderRpVoice(); });
    await pg.click('#rp-add'); await pg.waitForTimeout(1500);
    const m = puts.find(x => /media\/2026\/rp-.*\.m4a$/.test(x[0])); const e = puts.filter(x => x[0].startsWith('events/') && x[1].what==='ремонт' && x[1].voice && x[1].voice[0].status==='pending').pop();
    ok(m && e && /розшифровується/.test(e[1].rows['Ремонти і ТО'][0]['Що зроблено']), 'голос відправлено, запис «розшифровується»');
  });
  await run('k', extra, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1000);
    ok(!/Масло теж/.test(await pg.textContent('#rp-q')), 'Карина не бачить питань до чужого запису');
  });
  await run('o', {...extra, 'ref/owner.enc.json':null}, '2026-11-25T11:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'tech'; }); await pg.waitForTimeout(1000);
    ok(/Масло теж міняли/.test(await pg.textContent('#rp-q')), 'власник бачить питання');
  });
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
