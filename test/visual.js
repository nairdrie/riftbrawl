// Visual verification: drives the real client in headless Chrome.
// Two browser pages register, befriend, invite, pick characters and fight.
// Saves screenshots to /tmp/shots. Run: node test/visual.js

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3108;
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newPage(browser) {
  // each player gets an isolated context — separate localStorage, like
  // two different machines
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
  // sandbox has no outside network — block external (font) requests so they
  // fail fast instead of stalling page lifecycle events
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    // our own server, plus the two externals sign-in needs: the Supabase JS SDK
    // (esm.sh) and the Supabase project itself. Everything else (fonts) is cut.
    if (url.startsWith(`http://localhost:${PORT}`) ||
        url.includes('esm.sh') || url.includes('supabase')) req.continue();
    else req.abort();
  });
  page.on('pageerror', e => console.log('[page exception]', e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('net::')) console.log('[console]', t.slice(0, 300));
  });
  return page;
}

async function click(page, sel, tries = 4) {
  // dispatch via DOM: headless background pages don't render, which breaks
  // puppeteer's clickable-point resolution
  for (let i = 0; i < tries; i++) {
    try {
      await page.$eval(sel, el => el.click());
      return;
    } catch (e) { if (i === tries - 1) throw new Error(`click ${sel}: ${e.message}`); await sleep(400); }
  }
}

async function register(page, name) {
  console.log('registering', name);
  await page.bringToFront();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(900);   // let Archway sign-in (Supabase SDK) initialise
  await click(page, '#auth-tabs button[data-mode="register"]');
  // a fresh Archway account per run so reruns don't collide
  const email = `${name.toLowerCase()}.${Date.now()}@riftbrawl.test`;
  await page.type('#auth-email', email);
  await page.type('#auth-password', 'password1');
  await page.type('#auth-username', name);
  await click(page, '#auth-submit');
  await page.waitForSelector('#screen-menu.active', { timeout: 8000 });
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('visual.js needs a Supabase project (SUPABASE_URL, ' +
      'SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) and network access for ' +
      'Archway sign-in. Skipping.');
    process.exit(0);
  }
  const server = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise(res => server.stdout.on('data', d => String(d).includes('live') && res()));

  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio',
      // keep rAF + timers alive in non-focused tabs (both clients must run)
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
    headless: 'new',
  });

  try {
    const log = (s) => console.log('step:', s);
    const a = await newPage(browser);
    const b = await newPage(browser);

    // 1. auth screen
    log('1. auth screen');
    await a.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(900);
    await a.screenshot({ path: `${OUT}/1-auth.png` });

    await register(a, 'SKYBREAKER');
    await register(b, 'NIGHTFALL');

    // 2. friends: a adds b, b accepts, then main menu shot with friend online
    log('2. friends: a adds b, b accepts, then main menu shot with friend online');
    await a.bringToFront();
    await a.type('#friend-input', 'NIGHTFALL');
    await click(a, '#add-friend-form .btn-mini');
    await b.waitForSelector('#requests-list .accept', { timeout: 5000 });
    await b.bringToFront();
    await click(b, '#requests-list .accept');
    await a.bringToFront();
    await a.waitForSelector('#friends-list .friend .dot.on', { timeout: 5000 });
    await sleep(600);
    await a.screenshot({ path: `${OUT}/2-menu.png` });

    // 3. invite → char select
    log('3. invite → char select');
    await click(a, '#friends-list .friend .invite');
    await b.waitForSelector('#invite-modal.open', { timeout: 5000 });
    await b.bringToFront();
    await b.screenshot({ path: `${OUT}/3-invite.png` });
    await click(b, '#btn-invite-accept');
    await a.waitForSelector('#screen-select.active', { timeout: 5000 });
    await b.waitForSelector('#screen-select.active', { timeout: 5000 });
    await sleep(700);
    // a picks volt, b picks aegis
    await click(b, '.char-card[data-char="aegis"]');
    await click(b, '#btn-ready');
    await a.bringToFront();
    await click(a, '.char-card[data-char="volt"]');
    await sleep(500);
    await a.screenshot({ path: `${OUT}/4-select.png` });
    await click(a, '#btn-ready');
    await a.waitForSelector('#screen-game.active', { timeout: 5000 });
    await b.waitForSelector('#screen-game.active', { timeout: 5000 });

    // 4. countdown
    log('4. countdown');
    await sleep(1200);
    const dbg = await a.evaluate(() => {
      const m = window.__match;
      if (!m) return 'NO MATCH';
      return JSON.stringify({
        myIdx: m.myIdx, players: m.pred?.players?.length, frame: m.pred?.frame,
        phase: m.pred?.phase, snaps: m.snaps.length, running: m.running,
        meta: m.meta?.length, p0: m.pred?.players?.[0] ? {x: m.pred.players[0].x, y: m.pred.players[0].y, act: m.pred.players[0].act, char: m.pred.players[0].charId} : null,
      });
    });
    console.log('match state:', dbg);
    await a.screenshot({ path: `${OUT}/5-countdown.png` });

    // 5. fight! drive both with keyboard
    log('5. fight! drive both with keyboard');
    await sleep(2400);
    const fightUntil = Date.now() + 9000;
    await a.bringToFront();
    // a (left spawn if idx0) runs right and attacks; b runs left and jumps/attacks
    const driveA = (async () => {
      await a.keyboard.down('KeyD');
      while (Date.now() < fightUntil) {
        await a.keyboard.down('KeyJ'); await sleep(60); await a.keyboard.up('KeyJ');
        await sleep(260);
      }
      await a.keyboard.up('KeyD');
    })();
    const driveB = (async () => {
      let bDir = 'KeyA';
      await b.keyboard.down(bDir);
      let i = 0;
      while (Date.now() < fightUntil) {
        if (i % 3 === 0) { await b.keyboard.down('Space'); await sleep(70); await b.keyboard.up('Space'); }
        await b.keyboard.down('KeyK'); await sleep(60); await b.keyboard.up('KeyK');
        await sleep(300);
        if (i % 4 === 3) { // ping-pong so he doesn't just walk off
          await b.keyboard.up(bDir);
          bDir = bDir === 'KeyA' ? 'KeyD' : 'KeyA';
          await b.keyboard.down(bDir);
        }
        i++;
      }
      await b.keyboard.up(bDir);
    })();
    await sleep(2600);
    await a.screenshot({ path: `${OUT}/6-fight.png` });
    await sleep(2600);
    await a.screenshot({ path: `${OUT}/7-fight2.png` });
    await driveA; await driveB;

    // 6. let the match run with a one-sided beatdown until someone dies
    log('6. let the match run with a one-sided beatdown until someone dies');
    const endShot = (async () => {
      try {
        await a.waitForSelector('#screen-results.active', { timeout: 180000 });
        await sleep(900);
        await a.screenshot({ path: `${OUT}/8-results.png` });
        return true;
      } catch { return false; }
    })();
    // b walks left forever (self-destructs his remaining stocks)
    await b.keyboard.down('KeyA');
    // a sweeps back and forth across the stage attacking
    let dirKey = 'KeyD';
    await a.keyboard.down(dirKey);
    const flip = setInterval(async () => {
      try {
        await a.keyboard.up(dirKey);
        dirKey = dirKey === 'KeyD' ? 'KeyA' : 'KeyD';
        await a.keyboard.down(dirKey);
      } catch {}
    }, 2200);
    const hop = setInterval(async () => {
      try { await a.keyboard.down('Space'); await sleep(80); await a.keyboard.up('Space'); } catch {}
    }, 1300);
    const beat = setInterval(async () => {
      try { await a.keyboard.down('KeyJ'); await sleep(60); await a.keyboard.up('KeyJ'); } catch {}
    }, 280);
    const ok = await endShot;
    clearInterval(beat); clearInterval(flip); clearInterval(hop);
    await b.keyboard.up('KeyA').catch(() => {});
    await a.keyboard.up(dirKey).catch(() => {});
    console.log(ok ? 'match completed → results captured' : 'WARN: match did not finish in time');

    console.log('screenshots saved to', OUT);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
