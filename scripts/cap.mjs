// Capture real /app screens at phone size, authenticated via a session token.
// Usage: TH_TOKEN=<token> node scripts/cap.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const TOKEN = process.env.TH_TOKEN;
if (!TOKEN) { console.error('TH_TOKEN missing'); process.exit(1); }
const OUT = 'store-assets/raw';
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = 'https://facturamea.com';

const pages = [
  { name: 'acasa', url: '/app' },
  { name: 'facturi', url: '/app/facturare' },
  { name: 'emite', url: '/app/facturare/emite' },
  { name: 'cheltuieli', url: '/app/cheltuieli' },
  { name: 'cockpit', url: '/app/cockpit' },
  { name: 'banca', url: '/app/banca' },
  { name: 'rapoarte', url: '/app/facturare/rapoarte' },
  { name: 'verificari', url: '/app/verificari' },
  { name: 'declaratii', url: '/app/rapoarte/declaratii' },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3 });
await page.setCookie({ name: 'th_session', value: TOKEN, domain: 'facturamea.com', path: '/', httpOnly: true, secure: true });

// Dismiss the cookie consent banner once — it persists across navigations.
await page.goto(ORIGIN + '/app', { waitUntil: 'networkidle2', timeout: 40000 });
await new Promise((r) => setTimeout(r, 1500));
try {
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a')];
    const b = els.find((e) => /accept(ă| toate)/i.test(e.textContent || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('cookie accept clicked:', clicked);
  await new Promise((r) => setTimeout(r, 1200));
} catch (e) { console.log('cookie accept failed', e.message); }

for (const p of pages) {
  try {
    await page.goto(ORIGIN + p.url, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 2200));
    await page.screenshot({ path: `${OUT}/${p.name}.png` });
    console.log('captured', p.name, '→', page.url());
  } catch (e) { console.log('FAIL', p.name, e.message); }
}

// One real invoice detail (best-looking screen) — grab the first invoice link.
try {
  await page.goto(ORIGIN + '/app/facturare', { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise((r) => setTimeout(r, 1500));
  const href = await page.evaluate(() => {
    const known = ['emite', 'clienti', 'produse', 'proforme', 'avize', 'chitante', 'recurente', 'efactura', 'rapoarte', 'primite'];
    const a = [...document.querySelectorAll('a[href^="/app/facturare/"]')].find((el) => {
      const rest = (el.getAttribute('href') || '').replace('/app/facturare/', '').split(/[?#]/)[0];
      return rest && !known.includes(rest) && /^[A-Za-z0-9_-]{6,}$/.test(rest);
    });
    return a ? a.getAttribute('href') : null;
  });
  if (href) {
    await page.goto(ORIGIN + href, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: `${OUT}/factura.png` });
    console.log('captured factura →', href);
  } else { console.log('no invoice link found'); }
} catch (e) { console.log('FAIL factura', e.message); }

await browser.close();
console.log('done');
