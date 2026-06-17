// Screenshots the rig pose sheet (/dev/poses.html) in headless Chrome.
// Run: node test/poses.js   → saves /tmp/shots/poses.png (+ portraits.png)

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3109;
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // This tool only renders /dev/poses.html — it never signs in or touches the
  // database, so placeholder Supabase config is enough to let the server boot.
  const server = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_ANON_KEY: 'placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder',
      ...process.env,
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise(res => server.stdout.on('data', d => String(d).includes('live') && res()));

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
    headless: 'new',
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('[page exception]', e.message));
    page.on('console', m => {
      if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300));
    });
    await page.setViewport({ width: 2700, height: 1100, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/dev/poses.html`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);   // let cloth chains settle into motion
    const sheet = await page.$('#sheet');
    await sheet.screenshot({ path: `${OUT}/poses.png` });
    console.log('saved', `${OUT}/poses.png`);

    // portraits: render select-card portraits for each character
    await page.setContent(`<body style="margin:0;background:#0c1026;display:flex;align-items:flex-start;gap:8px;padding:10px">
      ${['aegis', 'volt', 'ember', 'tide', 'nova'].map(id => `<canvas id="${id}" width="180" height="200"></canvas>`).join('')}
      <script type="module">
        import { drawPortrait } from 'http://localhost:${PORT}/js/fighters.js';
        const ids = ['aegis','volt','ember','tide','nova'];
        let t = 0;
        function loop() {
          t += 1/60;
          for (const id of ids) drawPortrait(document.getElementById(id), id, t, id === 'volt' ? 1 : 0);
          requestAnimationFrame(loop);
        }
        loop();
        window.__ready = true;
      </script></body>`);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/portraits.png`, clip: { x: 0, y: 0, width: 5 * 188 + 20, height: 220 } });
    console.log('saved', `${OUT}/portraits.png`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
