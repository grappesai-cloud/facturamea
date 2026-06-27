// Compose marketing store screenshots: branded background + Romanian caption +
// phone frame containing the real app screenshot, rendered at the EXACT store
// dimensions. Outputs into store-assets/<store>/.
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RAW = 'store-assets/raw';

const slides = [
  { file: 'acasa', title: 'Tot ce-ți trebuie, într-un loc', subtitle: 'Facturi, încasări, cheltuieli și ANAF' },
  { file: 'emite', title: 'Emiți o factură în 30 de secunde', subtitle: 'Direct de pe telefon, oriunde ești' },
  { file: 'declaratii', title: 'Declarații ANAF, automat', subtitle: 'D300, D394 și SAF-T generate din datele tale' },
  { file: 'rapoarte', title: 'Vânzări și TVA, în timp real', subtitle: 'Încasat, de încasat și top clienți dintr-o privire' },
  { file: 'cheltuieli', title: 'Cheltuielile, sub control', subtitle: 'Facturi de la furnizori, clasificate automat' },
  { file: 'facturi', title: 'Toate facturile tale', subtitle: 'Emise, plătite, stornate, mereu la zi' },
];

// Each store device size: exact pixel canvas.
const sizes = [
  { key: 'ios-6.9', w: 1320, h: 2868 },
  { key: 'ios-6.5', w: 1242, h: 2688 },
  { key: 'android', w: 1080, h: 1920 },
];

const b64 = (f) => `data:image/png;base64,${readFileSync(`${RAW}/${f}.png`).toString('base64')}`;

function html(slide, w, h) {
  const img = b64(slide.file);
  const titleSize = Math.round(w * 0.058);
  const subSize = Math.round(w * 0.032);
  const padX = Math.round(w * 0.08);
  const capTop = Math.round(h * 0.06);
  const phoneTop = Math.round(h * 0.27);
  const phoneW = Math.round(w * 0.78);
  const bezel = Math.round(phoneW * 0.028);
  const radius = Math.round(phoneW * 0.115);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${w}px;height:${h}px;overflow:hidden}
    .bg{position:relative;width:${w}px;height:${h}px;
      background:radial-gradient(120% 80% at 50% 0%, #143a5e 0%, #0a2238 38%, #061018 100%);
      font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;overflow:hidden}
    .glow{position:absolute;top:-12%;left:50%;transform:translateX(-50%);width:${Math.round(w*0.9)}px;height:${Math.round(w*0.9)}px;
      background:radial-gradient(circle, rgba(225,251,21,0.18) 0%, rgba(225,251,21,0) 60%);pointer-events:none}
    .cap{position:absolute;top:${capTop}px;left:${padX}px;right:${padX}px;text-align:center}
    .title{color:#fff;font-size:${titleSize}px;font-weight:800;line-height:1.08;letter-spacing:-0.02em}
    .sub{color:#9FB8CC;font-size:${subSize}px;font-weight:500;margin-top:${Math.round(h*0.014)}px;line-height:1.3}
    .accent{display:inline-block;width:${Math.round(w*0.12)}px;height:${Math.round(w*0.011)}px;background:#E1FB15;border-radius:99px;margin-top:${Math.round(h*0.02)}px}
    .phone{position:absolute;top:${phoneTop}px;left:50%;transform:translateX(-50%);
      width:${phoneW}px;padding:${bezel}px;background:linear-gradient(160deg,#2a2f37,#15181d);
      border-radius:${radius}px;box-shadow:0 ${Math.round(h*0.02)}px ${Math.round(h*0.05)}px rgba(0,0,0,0.55), inset 0 0 2px rgba(255,255,255,0.3)}
    .screen{position:relative;width:100%;border-radius:${Math.round(radius*0.78)}px;overflow:hidden;background:#0a0d12;display:block}
    .screen img{width:100%;display:block}
    .notch{position:absolute;top:${Math.round(bezel*0.6)}px;left:50%;transform:translateX(-50%);width:${Math.round(phoneW*0.34)}px;height:${Math.round(phoneW*0.055)}px;background:#0a0d12;border-radius:99px;z-index:2}
    .wm{position:absolute;bottom:${Math.round(h*0.03)}px;left:0;right:0;text-align:center;color:#5b7790;font-size:${Math.round(w*0.026)}px;font-weight:700;letter-spacing:0.04em}
  </style></head><body>
    <div class="bg">
      <div class="glow"></div>
      <div class="cap"><div class="title">${slide.title}</div><div class="sub">${slide.subtitle}</div><div class="accent"></div></div>
      <div class="phone"><div class="notch"></div><div class="screen"><img src="${img}"/></div></div>
      <div class="wm">facturamea</div>
    </div>
  </body></html>`;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
for (const s of sizes) {
  const dir = `store-assets/${s.key}`;
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
  let i = 0;
  for (const slide of slides) {
    i++;
    await page.setContent(html(slide, s.w, s.h), { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 500));
    const name = `${dir}/${String(i).padStart(2, '0')}-${slide.file}.png`;
    await page.screenshot({ path: name, clip: { x: 0, y: 0, width: s.w, height: s.h } });
    console.log('rendered', name);
  }
  await page.close();
}
await browser.close();
console.log('compose done');
