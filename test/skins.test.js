// Skin store tests: image upload validation + the server-side sanitization that
// protects skins.json. Pure module — no server, no Supabase. (Admin gating is an
// auth concern enforced in server/index.js, covered by the integration test.)
// Run: node test/skins.test.js

import fs from 'fs';
import os from 'os';
import path from 'path';

// isolate storage BEFORE importing the module
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-test-'));
process.env.SMASH_DATA_DIR = dir;

let failures = 0;
function check(name, cond, info = '') {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${cond ? '' : ` — ${info}`}`);
  if (!cond) failures++;
}

const skins = await import('../server/skins.js');

// ── image upload validation ───────────────────────────────────────────────────
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const url = skins.saveImage('aegis', 'head', PNG);
check('saveImage returns a served /skins path', /^\/skins\/aegis-head-[0-9a-f]+\.png$/.test(url), url);
check('saveImage wrote the file to disk', fs.existsSync(path.join(skins.SKINS_DIR, path.basename(url))));

function throws(fn) { try { fn(); return false; } catch { return true; } }
check('saveImage rejects non-image data', throws(() => skins.saveImage('aegis', 'head', 'data:text/plain;base64,aGk=')));
check('saveImage rejects unknown character', throws(() => skins.saveImage('ghost', 'head', PNG)));
check('saveImage rejects unknown slot', throws(() => skins.saveImage('aegis', 'nose', PNG)));

// ── document sanitization on save ────────────────────────────────────────────
const saved = skins.saveDoc({
  aegis: {
    colors: { primary: '#ABCDEF', secondary: 'not-a-hex', bogusKey: '#112233' },
    slots: {
      head: { img: url, x: 9999, scale: 999, rot: 45, opacity: 5, flip: true, hideBase: true },
      torso: { img: 'http://evil.example/x.png' },   // external URL → dropped
      nose: { img: url },                             // unknown slot → dropped
    },
  },
  ghost: { colors: { primary: '#123456' } },          // unknown character → dropped
});

const a = saved.skins.aegis;
check('keeps a valid hex colour (lowercased)', a.colors.primary === '#abcdef', a.colors.primary);
check('drops an invalid hex colour', a.colors.secondary === undefined);
check('drops an unknown colour key', a.colors.bogusKey === undefined);
check('keeps a slot bound to an uploaded image', a.slots.head.img === url);
check('clamps an out-of-range offset', a.slots.head.x === 400, String(a.slots.head.x));
check('clamps an out-of-range scale', a.slots.head.scale === 20, String(a.slots.head.scale));
check('clamps an out-of-range opacity', a.slots.head.opacity === 1, String(a.slots.head.opacity));
check('preserves the hideBase flag', a.slots.head.hideBase === true);
check('drops a slot pointing at an external URL', a.slots.torso === undefined);
check('drops an unknown slot name', a.slots.nose === undefined);
check('drops an unknown character entry', saved.skins.ghost === undefined);
check('persisted skins.json on disk', fs.existsSync(path.join(dir, 'skins.json')));

// ── unreferenced uploads are garbage-collected on the next save ───────────────
const orphan = skins.saveImage('volt', 'weapon', PNG);
check('orphan image written', fs.existsSync(path.join(skins.SKINS_DIR, path.basename(orphan))));
skins.saveDoc({ aegis: { slots: { head: { img: url } } } });   // doesn't reference the orphan
check('GC removes the unreferenced image', !fs.existsSync(path.join(skins.SKINS_DIR, path.basename(orphan))));
check('GC keeps the referenced image', fs.existsSync(path.join(skins.SKINS_DIR, path.basename(url))));

console.log(failures ? `\n${failures} skins test(s) failed` : '\nskins tests passed ✓');
process.exit(failures ? 1 : 0);
