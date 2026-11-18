// Source of truth: build/icon.svg. Requires installed Playwright Chromium or Google Chrome.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
(async () => {
  const root = path.join(__dirname, '..');
  const out = path.join(root, 'build/icon.iconset');
  fs.mkdirSync(out, { recursive: true });
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
  const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8');
  const sizes = [16,32,128,256,512];
  try {
    for (const size of sizes) for (const scale of [1,2]) {
      const px = size * scale;
      const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
      const image = await page.screenshot({ omitBackground: true });
      fs.writeFileSync(path.join(out, `icon_${size}x${size}${scale===2?'@2x':''}.png`), image);
      if (px === 1024) fs.writeFileSync(path.join(root, 'build/icon.png'), image);
      await page.close();
    }
  } finally { await browser.close(); }
  execFileSync('iconutil', ['-c','icns',out,'-o',path.join(root,'build/icon.icns')]);
  console.log('Generated build/icon.png and build/icon.icns from build/icon.svg');
})().catch(error => { console.error(error); process.exitCode = 1; });
