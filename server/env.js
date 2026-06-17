// ─────────────────────────────────────────────────────────────────────────────
// Minimal zero-dependency .env loader. Reads KEY=VALUE pairs from a .env file in
// the project root (if it exists) into process.env, WITHOUT overriding anything
// already set in the real environment. This makes config like DESIGN_ROLES work
// the same everywhere (Windows git bash / PowerShell / cmd, macOS, Linux) without
// relying on inline `VAR=value npm start` shell syntax.
//
// Imported FIRST by server/index.js so the values are in place before store.js /
// skins.js read them at module load. A missing .env is fine (no-op).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.SMASH_ENV_FILE || path.join(__dirname, '..', '.env');

try {
  if (fs.existsSync(envPath)) {
    let count = 0;
    for (let line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('export ')) line = line.slice(7).trim();
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) { process.env[key] = val; count++; }
    }
    console.log(`[env] loaded ${count} var(s) from ${path.basename(envPath)}`);
  }
} catch (e) {
  console.error('[env] failed to read .env:', e.message);
}
