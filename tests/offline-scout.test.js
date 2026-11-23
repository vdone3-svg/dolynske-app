/**
 * Офлайн-огляди (Етап 7) — E2E перевірка
 * Запуск: node tests/offline-scout.test.js
 *
 * Перевіряє:
 *  1) saveScout() офлайн → IndexedDB OUTBOX → event 'online' → PUT до GitHub API
 *  2) flushScouts() без TOKEN нічого не відправляє
 *  3) renderScQueue() показує правильний лічильник
 */

'use strict';
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const fs   = require('fs');

const DATA_REPO = path.join(__dirname, '../../dolynske-data');
const APP_HTML  = path.join(__dirname, '../index.html');

const G = s => `\x1b[32m${s}\x1b[0m`;
const R = s => `\x1b[31m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const B = s => `\x1b[34m${s}\x1b[0m`;

let passed = 0, failed = 0;
function ok(label)   { console.log(G('  ✓ ' + label)); passed++; }
function fail(label) { console.log(R('  ✗ ' + label)); failed++; }

// ── GitHub API мок ──────────────────────────────────────────────────────────
function ghContentsJSON(filePath) {
  const full = path.join(DATA_REPO, filePath);
  if (!fs.existsSync(full)) return null;
  if (fs.statSync(full).isDirectory()) {
    return fs.readdirSync(full).map(name => {
      const fp = path.join(full, name);
      return { name, path: filePath + '/' + name,
               type: fs.statSync(fp).isDirectory() ? 'dir' : 'file', sha: 'abc' };
    });
  }
  const content = fs.readFileSync(full);
  return { path: filePath, sha: 'abc123',
           content: content.toString('base64'), encoding: 'base64', size: content.length };
}

// ── d3 / XLSX / Leaflet mock (ES5-сумісно, без шаблонних рядків) ─────────
const MOCK_JS = fs.readFileSync(path.join(__dirname, 'mocks.js'), 'utf8');

// ── Маршрутизація ──────────────────────────────────────────────────────────
async function setupRoutes(page, capturedPuts) {
  for (const p of ['https://cdnjs.cloudflare.com/**','https://unpkg.com/**',
                    'https://cdn.jsdelivr.net/**','https://fonts.googleapis.com/**',
                    'https://fonts.gstatic.com/**','https://maps.googleapis.com/**']) {
    await page.route(p, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: ';' }));
  }
  await page.route('https://tile.openstreetmap.org/**',      r => r.fulfill({ status: 200, body: Buffer.alloc(68) }));
  await page.route('https://api.maptiler.com/**',            r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('https://api.open-meteo.com/**',          r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, body: '[]' }));

  await page.route('https://api.github.com/**', async (route, request) => {
    const url = new URL(request.url());
    const m   = url.pathname.match(/^\/repos\/vdone3-svg\/dolynske-data\/contents\/(.+)$/);
    if (!m) { await route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not Found' }) }); return; }
    const filePath = decodeURIComponent(m[1].split('?')[0]);
    if (request.method() === 'GET') {
      const data = ghContentsJSON(filePath);
      if (!data) { await route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not Found' }) }); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      return;
    }
    if (request.method() === 'PUT') {
      const body = JSON.parse(request.postData() || '{}');
      capturedPuts.push({ path: filePath, message: body.message || '', content: body.content || '' });
      await route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ content: { path: filePath, sha: 'newsha' } }) });
      return;
    }
    await route.fulfill({ status: 405, body: '{}' });
  });
}

// ── Відкрити застосунок ─────────────────────────────────────────────────────
async function openApp(page, { withToken = true } = {}) {
  await page.addInitScript({ content: MOCK_JS });
  await page.addInitScript((token) => {
    if (token) localStorage.setItem('dl_token', token);
    localStorage.setItem('dl_name', 'Тест Агроном');
    localStorage.setItem('dl_role', 'agr');
    localStorage.setItem('dl_test', '1');   // ← вмикає window._DL_TEST
  }, withToken ? 'test-gh-token-mock' : null);

  await page.goto('file://' + APP_HTML, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Чекаємо тест-хук
  await page.waitForFunction(() => typeof window._DL_TEST !== 'undefined', { timeout: 20000 });

  // Очищаємо OUTBOX і скидаємо OUTQ
  await page.evaluate(async () => {
    const all = await window._DL_TEST.OUTBOX.all();
    for (const it of all) await window._DL_TEST.OUTBOX.del(it.id);
    window._DL_TEST.OUTQ = [];
    window._DL_TEST.renderScQueue();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ТЕСТ 1: офлайн → OUTBOX → online → PUT
// ═══════════════════════════════════════════════════════════════════════════
async function test1(browser) {
  console.log(Y('\n[Тест 1] saveScout офлайн → OUTBOX → online → PUT'));
  const context = await browser.newContext();
  const page    = await context.newPage();
  const puts    = [];
  try {
    await setupRoutes(page, puts);
    await openApp(page);

    // Офлайн
    await context.setOffline(true);
    const isOff = await page.evaluate(() => !navigator.onLine);
    if (!isOff) throw new Error('Не вдалось перейти офлайн');
    ok('navigator.onLine = false після setOffline(true)');

    // saveScout()
    const scoutId = 'test-' + Date.now() + '-bez';
    const today   = new Date().toISOString().slice(0, 10);
    const year    = +today.slice(0, 4);

    const saveErr = await page.evaluate(async ({ id, date, year }) => {
      window._DL_TEST.setSC({
        id, date, field: 'Безсмертне', season: year, crop: 'Пшениця озима',
        phase: 'кущення', state: '', problems: {}, density: '', forecast: '',
        comment: 'E2E-тест офлайн', gps: null, photos: [], voice: [], videos: [],
        author: localStorage.getItem('dl_name') || 'Тест',
        dc: { on: false, len: '', counts: [] }, sow: {},
      });
      try { await window._DL_TEST.saveScout(); return null; }
      catch (e) { return e.message; }
    }, { id: scoutId, date: today, year });

    if (saveErr) throw new Error('saveScout() кинув: ' + saveErr);
    ok('saveScout() виконано без помилок');

    // Перевіряємо OUTBOX
    const outbox = await page.evaluate(async () => window._DL_TEST.OUTBOX.all());
    const item   = outbox.find(x => x.id === scoutId);
    if (!item)                        throw new Error('Огляд НЕ в OUTBOX. Є: ' + JSON.stringify(outbox.map(x=>x.id)));
    ok('Огляд знайдено в OUTBOX');
    if (item.doc.kind !== 'scout')    throw new Error('doc.kind = ' + item.doc.kind);
    ok('doc.kind = scout');
    if (item.doc.field !== 'Безсмертне') throw new Error('doc.field = ' + item.doc.field);
    ok('doc.field = Безсмертне');
    if (!item.doc.comment.includes('E2E')) throw new Error('doc.comment = ' + item.doc.comment);
    ok('doc.comment містить E2E');

    // Черга UI
    const qText = await page.evaluate(() => (document.querySelector('#sc-queue')?.textContent || '').trim());
    console.log(B('  #sc-queue: «' + qText + '»'));
    if (!qText.includes('Очікують')) throw new Error('#sc-queue не має «Очікують»: «' + qText + '»');
    ok('Текст черги містить «Очікують»');
    if (!qText.match(/[1-9]/))       throw new Error('#sc-queue не має числа: «' + qText + '»');
    ok('Черга показує кількість огляд(ів)');

    // Online → flush
    const flushPromise = page.evaluate(() => new Promise((resolve) => {
      const orig = window._DL_TEST.renderScQueue;
      let calls = 0;
      // monkey-patch renderScQueue через _DL_TEST не допоможе бо IIFE закрита
      // тому перевішуємо функцію на window щоб js коду достукатись
      // але renderScQueue — локальна. Опитуємо через OUTQ.
      const id = setInterval(async () => {
        const q = window._DL_TEST.OUTQ || [];
        calls++;
        if (q.length === 0) { clearInterval(id); resolve({ remaining: 0, calls }); }
        if (calls > 60)     { clearInterval(id); resolve({ remaining: q.length, calls, timeout: true }); }
      }, 250);
    }));

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const flushResult = await flushPromise;

    console.log(B('  flush result: ' + JSON.stringify(flushResult)));
    if (flushResult.remaining !== 0) throw new Error('OUTBOX не очистився. Залишилось: ' + flushResult.remaining);
    ok('OUTBOX порожній після flush');

    // PUT до API
    console.log(B('  PUT зафіксовано: ' + puts.length + ' шт.'));
    const scoutPut = puts.find(p => p.path.startsWith('scouts/') && p.path.endsWith('.json'));
    if (!scoutPut) throw new Error('PUT scouts/*.json не знайдено. Усі PUT: ' + JSON.stringify(puts.map(p=>p.path)));
    ok('PUT scouts/YYYY/...json відправлено до API');
    if (!scoutPut.path.match(/^scouts\/\d{4}\//)) throw new Error('Шлях: ' + scoutPut.path);
    ok('Шлях: scouts/<рік>/');
    if (!scoutPut.message.includes('Огляд'))      throw new Error('message: ' + scoutPut.message);
    ok('Commit message містить «Огляд»');
    if (!scoutPut.message.includes('Безсмертне')) throw new Error('message: ' + scoutPut.message);
    ok('Commit message містить «Безсмертне»');

    const doc = JSON.parse(Buffer.from(scoutPut.content, 'base64').toString('utf8'));
    if (doc.kind !== 'scout') throw new Error('PUT doc.kind = ' + doc.kind);
    ok('PUT doc.kind = scout');
    if (doc.v !== 2)          throw new Error('PUT doc.v = ' + doc.v);
    ok('PUT doc.v = 2');

    console.log(G('  Тест 1 ПРОЙШОВ ✓'));
  } catch (e) {
    fail(e.message);
  } finally {
    await context.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ТЕСТ 2: без TOKEN нічого не відправляється
// ═══════════════════════════════════════════════════════════════════════════
async function test2(browser) {
  console.log(Y('\n[Тест 2] flushScouts без TOKEN — не відправляє'));
  const context = await browser.newContext();
  const page    = await context.newPage();
  const puts    = [];
  try {
    await setupRoutes(page, puts);
    await openApp(page, { withToken: false });

    await page.evaluate(async () => {
      await window._DL_TEST.OUTBOX.put({
        id: 'no-token-test', path: 'scouts/2026/no-token-test.json',
        doc: { kind:'scout', v:2, id:'no-token-test', field:'Тік', date:'2026-11-23',
               photos:[], voice:[], videos:[] },
        blobs: [], urls: [],
      });
      window._DL_TEST.setTOKEN(null);
      window._DL_TEST.OUTQ = await window._DL_TEST.OUTBOX.all();
      await window._DL_TEST.flushScouts();
    });

    if (puts.length !== 0) throw new Error('Відправлено ' + puts.length + ' PUT без TOKEN');
    ok('Жодного PUT без TOKEN');

    const remaining = await page.evaluate(async () => window._DL_TEST.OUTBOX.all());
    if (!remaining.some(x => x.id === 'no-token-test')) throw new Error('Запис зник з OUTBOX');
    ok('Запис залишився в OUTBOX');

    console.log(G('  Тест 2 ПРОЙШОВ ✓'));
  } catch (e) {
    fail(e.message);
  } finally {
    await context.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ТЕСТ 3: лічильник черги
// ═══════════════════════════════════════════════════════════════════════════
async function test3(browser) {
  console.log(Y('\n[Тест 3] renderScQueue — правильний лічильник'));
  const context = await browser.newContext();
  const page    = await context.newPage();
  try {
    await setupRoutes(page, []);
    await openApp(page);

    await page.evaluate(async () => {
      for (let i = 1; i <= 3; i++) {
        await window._DL_TEST.OUTBOX.put({
          id: 'cnt-' + i, path: 'scouts/2026/cnt-' + i + '.json',
          doc: { kind:'scout', v:2, id:'cnt-'+i, field:'Малаківка', date:'2026-11-23',
                 photos:[], voice:[], videos:[] },
          blobs: [], urls: [],
        });
      }
      window._DL_TEST.OUTQ = await window._DL_TEST.OUTBOX.all();
      window._DL_TEST.renderScQueue();
    });

    const qText = await page.evaluate(() => (document.querySelector('#sc-queue')?.textContent || '').trim());
    console.log(B('  #sc-queue: «' + qText + '»'));
    if (!qText.includes('3'))        throw new Error('Лічильник не показує 3: «' + qText + '»');
    ok('Лічильник показує 3');
    if (!qText.includes('Очікують')) throw new Error('Текст не містить «Очікують»: «' + qText + '»');
    ok('Текст містить «Очікують»');

    console.log(G('  Тест 3 ПРОЙШОВ ✓'));
  } catch (e) {
    fail(e.message);
  } finally {
    await context.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(B('Запускаю Chromium…'));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
           '--disable-web-security','--allow-file-access-from-files'],
    headless: true,
  });
  try {
    await test1(browser);
    await test2(browser);
    await test3(browser);
  } finally {
    await browser.close();
  }

  console.log('\n' + '═'.repeat(50));
  if (failed === 0) {
    console.log(G(`✓ Усі ${passed} перевірок пройшли`));
    process.exit(0);
  } else {
    console.log(R(`✗ ${failed} з ${passed + failed} перевірок НЕ ПРОЙШЛИ`));
    process.exit(1);
  }
})();
