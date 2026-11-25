// Push-сповіщення (25.11): картка «🔔 Сповіщення» у «Завданнях» (керуючий, власник), підписка → push/subs/, вимкнення → DELETE; iPhone не з «Додому» — інструкція.
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
async function run(role, extra, fake, fn, opt={}){
  const V = vfs(extra), puts = [];
  const br = await chromium.launch(); const ctx = await br.newContext({serviceWorkers:'block', timezoneId:'Europe/Kiev', viewport:{width:390, height:844}, isMobile:true, ...(opt.ua ? {userAgent:opt.ua} : {})});
  await ctx.addInitScript(FAKE_PUSH, !!opt.standalone);
  await ctx.addInitScript(([role, fake]) => { localStorage.setItem('dl_token', 't'); localStorage.setItem('dl_role', role); localStorage.setItem('dl_name', role==='a' ? 'Вова' : role==='k' ? 'Каріна' : 'Денис');
    const off = new Date(fake) - Date.now(), D0 = Date; class FD extends D0{ constructor(...a){ if(a.length) super(...a); else super(D0.now()+off); } static now(){ return D0.now()+off; } } window.Date = FD; }, [role, fake]);
  await ctx.route('**/*', async r => { const u = new URL(r.request().url());
    if(u.host==='app.test') return r.fulfill({body:fs.readFileSync(APP), contentType:'text/html'});
    const lib = Object.keys(LIB).find(k => u.pathname.endsWith(k)); if(lib) return r.fulfill({body:fs.readFileSync(LIB[lib]), contentType: lib.endsWith('.css') ? 'text/css' : 'application/javascript'});
    if(u.host==='api.github.com'){ const m = u.pathname.match(/\/contents\/?(.*)$/), p = m ? decodeURIComponent(m[1]) : '';
      if(r.request().method()==='DELETE'){ puts.push(['DELETE '+p, JSON.parse(r.request().postData())]); delete V[p]; return r.fulfill({body:'{}', contentType:'application/json'}); }
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
// підробка Push API: Notification, PushManager, serviceWorker.ready
const FAKE_PUSH = standalone => {
  let sub = null; window.__push = {subscribeKey:null};
  window.Notification = {permission:'default', requestPermission: async () => (window.Notification.permission = 'granted')};
  window.PushManager = function(){};
  if(standalone) Object.defineProperty(navigator, 'standalone', {get:() => true});
  const pm = {getSubscription: async () => sub,
    subscribe: async o => { window.__push.subscribeKey = o.applicationServerKey.length; sub = {toJSON:() => ({endpoint:'https://web.push.apple.com/QWERTY', keys:{p256dh:'BPk', auth:'au'}}), unsubscribe: async () => { sub = null; return true; }}; return sub; }};
  Object.defineProperty(navigator, 'serviceWorker', {get:() => ({ready:Promise.resolve({pushManager:pm}), register: async () => ({}), addEventListener(){}, controller:null})});
};
(async () => {
  let bad = 0; const ok = (c, t) => { console.log((c ? '✓ ' : '✗ ')+t); if(!c) bad++; };
  const PUB = {'ref/push.json':{kind:'push', vapid_pub:'BFVOk4JlaVWxQ0DLb1Lr0sYkXgM5w6nN8eq5d7Zb2Rk6eV1j8mXz9HqW1n2bC3dE4fG5hI6jK7lM8nO9pQ0rS1t'}};
  await run('a', PUB, '2026-11-25T15:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(800);
    ok(await pg.isVisible('#push-card'), 'керуючий: картка сповіщень у «Завданнях»');
    ok(/нові завдання/.test(await pg.textContent('#push-card')), 'керуючому — «нові завдання від власника»');
    await pg.click('#push-card .btn.primary'); await pg.waitForTimeout(1200);
    const put = puts.find(x => x[0].startsWith('push/subs/a-'));
    ok(!!put && put[1].role==='a' && put[1].endpoint.includes('apple') && put[1].keys.auth==='au', 'підписка записана: '+(put ? put[0] : '—'));
    ok(put && /Керуючий/.test(put[1].who), 'підпис: '+(put ? put[1].who : ''));
    ok(await pg.evaluate(() => window.__push.subscribeKey)===65, 'ключ сервера переданий як 65 байт');
    ok(/✓ Увімкнено/.test(await pg.textContent('#push-card')), 'стан «Увімкнено»');
    ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 390), 'сторінка в ширину телефона');
    await pg.screenshot({path:'/tmp/push-on.png'});
    await pg.click('#push-card .btn.ghost'); await pg.waitForTimeout(1000);
    ok(puts.some(x => x[0]==='DELETE '+put[0]), 'вимкнення — файл підписки видалено');
    ok(/Увімкнути сповіщення/.test(await pg.textContent('#push-card')), 'після вимкнення — знову кнопка «Увімкнути»');
  }, {standalone:true});
  await run('a', PUB, '2026-11-25T15:00:00+02:00', async pg => {
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(800);
    const t = await pg.textContent('#push-card');
    ok(/На екран "Додому"/.test(t) && !(await pg.$('#push-card .btn.primary')), 'iPhone у Safari (не з «Додому») — інструкція, без кнопки');
    await pg.screenshot({path:'/tmp/push-ios.png'});
  }, {ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'});
  await run('a', {}, '2026-11-25T15:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(800);
    await pg.click('#push-card .btn.primary'); await pg.waitForTimeout(1000);
    ok(/немає ключа/.test(await pg.textContent('#push-card')) && !puts.some(x => x[0].startsWith('push/')), 'без ref/push.json — зрозуміла помилка, нічого не записано');
  }, {standalone:true});
  await run('k', PUB, '2026-11-25T15:00:00+02:00', async pg => {
    ok(!(await pg.isVisible('#push-card')), 'Каріні картки немає (вкладки «Завдання» в неї нема)');
  });
  await run('o', {...PUB, 'ref/owner.enc.json':null}, '2026-11-25T15:00:00+02:00', async (pg, puts) => {
    await pg.evaluate(() => { location.hash = 'tasks'; }); await pg.waitForTimeout(800);
    ok(/чернетки завдань/.test(await pg.textContent('#push-card')), 'власнику — свій перелік');
    await pg.click('#push-card .btn.primary'); await pg.waitForTimeout(1200);
    const put = puts.find(x => x[0].startsWith('push/subs/o-')); ok(!!put && put[1].role==='o', 'власник: підписка з роллю o');
  }, {standalone:true});
  // sw.js: push і натискання
  const vm = require('vm'), L = {}, shown = [], msgs = [], opened = [];
  const self = {addEventListener:(t, f) => L[t] = f, registration:{scope:'https://x.test/app/', showNotification:(t, o) => { shown.push([t, o]); return Promise.resolve(); }},
    clients:{matchAll: async () => self._wins, openWindow: async u => opened.push(u), claim: async () => {}}, skipWaiting(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), {self, caches:{}, fetch(){}, URL, Headers, Response, setTimeout, Promise, console});
  let w; L.push({data:{json:() => ({title:'🎯 Нове завдання: 75', body:'b', url:'#tasks', tag:'t1'})}, waitUntil:p => w = p}); await w;
  ok(shown[0] && shown[0][0]==='🎯 Нове завдання: 75' && shown[0][1].data.url==='#tasks', 'sw.js показує сповіщення');
  self._wins = []; L.notificationclick({notification:{data:{url:'#tasks'}, close(){}}, waitUntil:p => w = p}); await w;
  ok(opened[0]==='https://x.test/app/#tasks', 'натискання без відкритого вікна — відкриває «Завдання»');
  self._wins = [{url:'https://x.test/app/#day', focus: async () => {}, postMessage:m => msgs.push(m)}];
  L.notificationclick({notification:{data:{url:'#tasks'}, close(){}}, waitUntil:p => w = p}); await w;
  ok(msgs[0] && msgs[0].go==='#tasks', 'відкрите вікно — фокус і перехід на вкладку');
  console.log(bad ? 'НЕ ПРОЙДЕНО: '+bad : 'УСЕ ПРОЙДЕНО');
})();
