# ⚔ RIFTBRAWL

A browser-native platform fighter in the spirit of Super Smash Bros — 60Hz
realtime multiplayer, percent-based knockback, 3-stock deathmatches, five
legends, one beautiful floating arena.

![stack](https://img.shields.io/badge/stack-vanilla%20ESM%20%2B%20node-blueviolet)
![netcode](https://img.shields.io/badge/netcode-prediction%20%2B%20rollback%20reconciliation-cyan)

## Quick start

```bash
npm install
npm start          # → http://localhost:3000
```

Open two browsers (or a friend opens yours over LAN/internet), create fighter
tags, add each other as friends, hit **DUEL** — or just queue **QUICK MATCH**.
**VS CPU** works solo.

## The game

- **Exact smash-style mechanics** — percent damage, knockback growth
  (`kb = bkb + %·kbg·200/(100+weight)`), hitstun, hitlag freeze-frames,
  launch decay, blast zones on all four sides, 3 stocks, respawn platform
  with invincibility.
- **Movement** — walk, dash (smash the stick), run, full/short hops (hold vs
  tap), double jump, air drift, fast-fall, crouch, recovery up-special with
  exhaustion until landing. Slow walks teeter at the edge instead of falling.
- **Ledge play** — falling near the edge snaps you to a **ledge grab** with
  invulnerability frames; it restores your double jump and up-special. Climb,
  ledge-jump, drop, or getup-attack. The stage body is solid: no flying
  through it from below.
- **Crouch cancel** — crouching when hit takes reduced knockback (Melee
  style), with a smaller hurtbox while crouched.
- **Body push** — grounded fighters shove each other; walk a statue off the
  edge.
- **Pause** — Esc / Start pauses for everyone; resuming runs a fair 3·2·1
  countdown for both players.
- **Kits** — every character has jab / f-tilt / up-tilt / d-tilt, five
  aerials (nair/fair/bair/uair/dair), and four specials (neutral B
  projectile, side B rush, up B recovery, down B burst). Direction + button,
  exactly like you expect.
- **Defense** — hold shield (it shrinks, breaks, and regenerates),
  shield-stun, shield-break stun.

### The legends

| | | |
|---|---|---|
| **AEGIS** | The Bastion | colossal armor, citadel-weight hammer swings |
| **VOLT** | The Storm Dancer | blinding speed, featherweight, endless combos |
| **EMBER** | The Cinder Witch | space control with wildfire orbs |
| **TIDE** | The Wave Duelist | the honest all-rounder, deadly at every range |
| **NOVA** | The Void Sentinel | floaty cosmic drift, enormous hits |

### Controls

| | Keyboard | Controller (standard mapping) |
|---|---|---|
| Move | A/D or ←/→ | left stick / d-pad |
| Jump | Space (tap = short hop) | X / Y |
| Attack | J | A |
| Special | K | B |
| Shield | Shift | bumpers / triggers |
| Fast-fall | S / ↓ while falling | stick down |
| Crouch | hold S / ↓ on the ground | hold stick down |
| Pause | Esc / P | Start |

Menus are fully controller-navigable: d-pad or stick to move the focus ring,
**A** to select, **B** to back out. Controllers rumble on hits and KOs.
(Browsers only expose a gamepad after you press any button on it with the
page focused — the 🎮 icon in the top bar lights up when it's detected.)

## Architecture

```
shared/     deterministic 60Hz simulation — runs on BOTH sides
  sim.js          step(state, inputs) → events; serialization
  characters.js   pure data: stats + full movesets for all five
  constants.js    physics, stage geometry, input bitmask

server/     node + express + ws (no build step, no native deps)
  index.js        static hosting + one websocket: auth, social, matches
  store.js        JSON-file user store, scrypt passwords, HMAC tokens
  game.js         authoritative rooms @60Hz, matchmaking queue, CPU bot

public/     vanilla ES modules served as-is
  js/game.js      netplay: client prediction + reconciliation of the local
                  player, ~70ms interpolation for remotes
  js/renderer.js  dynamic camera, stage, particles, HUD, announcements
  js/fighters.js  procedural vector fighters — no sprite assets
  js/sfx.js       all sound synthesized with WebAudio
```

**Netcode**: the server simulates authoritatively at 60Hz and broadcasts
snapshots at 30Hz with per-client input acks. Clients run the same
deterministic sim: your own fighter is predicted instantly from local input
and re-played on top of every server snapshot (reconciliation, with visual
error smoothing), while remote fighters and projectiles interpolate a
~70ms buffer. Result: zero perceived input latency, server-authoritative
truth.

**Auth/social**: username + password (scrypt), signed session tokens,
friends with live presence, match invites, quick-match queue, W/L records —
all over the same websocket.

## Tests

```bash
npm test                 # sim mechanics (ledge, dash, crouch cancel, body
                         # push, stage collision) + end-to-end websockets:
                         # auth → friends → invite → select → full match
                         # with KOs → pause/resume → rematch
node test/visual.js      # drives two real headless-Chrome clients through
                         # the entire flow and screenshots every screen
```
