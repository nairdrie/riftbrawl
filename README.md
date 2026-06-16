# ⚔ RIFTBRAWL

A browser-native platform fighter in the spirit of Super Smash Bros — 60Hz
realtime multiplayer, percent-based knockback, 3-stock deathmatches, five
legends, one beautiful floating arena.

![stack](https://img.shields.io/badge/stack-vanilla%20ESM%20%2B%20node-blueviolet)
![netcode](https://img.shields.io/badge/netcode-prediction%20%2B%20rollback%20reconciliation-cyan)

## Quick start

Requires **Node 22+** (`nvm install 22 && nvm use 22`) — better-sqlite3 ships
prebuilt binaries for Node 22, so there's nothing to compile on any OS.

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
- **Reconnect grace** — if a player's connection drops mid-match, the game
  auto-pauses and holds their seat for 30 seconds; reconnecting (even after
  a page refresh) resyncs the full match state and resumes with a countdown.
- **Kits** — every character has jab / f-tilt / up-tilt / d-tilt (the low
  attack, usable straight out of a crouch), five aerials
  (nair/fair/bair/uair/dair), and four specials (neutral B projectile,
  side B rush, up B recovery, down B burst). Direction + button, exactly
  like you expect.
- **Charge shots** — hold neutral-B to charge it (bigger, faster, harder
  knockback; auto-fires at max). Getting hit drops your charge.
- **Charge smashes** — hold the attack button on a directional tilt
  (f/u/d) to wind up a smash attack; release (or hit max charge) to swing
  for scaled damage + knockback. Getting hit drops the charge.
- **Grab & throw** — grab (L, or shield+attack) beats shield. Hold a
  direction to throw four ways (f/b/u/d), tap attack to pummel, or mash
  the stick to wriggle free — escapes get harder the higher your percent.
- **Defense** — hold shield (it shrinks, breaks, and regenerates),
  shield-stun, shield-break stun. Flick the stick left/right while shielding
  to **roll** that way through danger — a quick dodge with intangibility
  frames that stops at the ledge instead of rolling off.

### The legends

| | | |
|---|---|---|
| **AEGIS** | The Bastion | colossal armor, citadel-weight hammer swings |
| **VOLT** | The Storm Dancer | blinding speed, featherweight, endless combos |
| **EMBER** | The Cinder Witch | space control with wildfire orbs |
| **TIDE** | The Wave Duelist | the honest all-rounder, deadly at every range |
| **NOVA** | The Void Sentinel | floaty cosmic drift, enormous hits |

A sixth fighter, **REED** "The Blank Slate", is the reference **data rig** — a
fully-animated stick fencer described as pure data. It isn't in the roster; it's
the base the character designer builds new fighters from. See *Custom characters*.

### Controls

| | Keyboard | Controller (standard mapping) |
|---|---|---|
| Move | A/D or ←/→ | left stick / d-pad |
| Jump | Space (tap = short hop) | X / Y |
| Attack | J | A |
| Special | K | B |
| Shield | Shift | bumpers / triggers |
| Roll | shield + ←/→ | shield + left stick L/R |
| Grab | L | shield + A |
| Fast-fall | S / ↓ while falling | stick down |
| Crouch | hold S / ↓ on the ground | hold stick down |
| Pause | Esc / P | Start |

Menus are fully controller-navigable: d-pad or stick to move the focus ring,
**A** to select, **B** to back out. Text fields open an on-screen keyboard
when selected with the pad (B = backspace), so sign-in and adding friends
work without ever touching the keyboard. Controllers rumble on hits and KOs.
(Browsers only expose a gamepad after you press any button on it with the
page focused — the 🎮 icon in the top bar lights up when it's detected.
If your pad reports its face buttons swapped — common with Nintendo-layout
and some 8BitDo pads — flip **SWAP A/B** in the How To Fight screen.)

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
  js/rigs/        per-character art: bespoke rigs + the data-rig engine
    common.js       shared toolkit (IK, cloth, inked plate, FX, faces)
    data/           importable characters (see Custom characters)
  js/sfx.js       all sound synthesized with WebAudio
```

## Custom characters (importable rigs)

Fighters are **procedural vector art** — a skeleton posed every frame with IK,
cloth physics, squash & stretch and a per-move performance — so a new character
is **not** a sprite sheet. It's a **declarative rig spec** (pure data: skeleton +
skin + weapon + projectile) that one shared engine animates exactly like the
built-in legends. Stats and movesets stay in `shared/characters.js` (sim data);
the spec is presentation only.

- **Format & workflow**: `public/js/rigs/data/RIG_FORMAT.md`
- **Worked example**: `reed.rig.js` (the stick fencer REED)
- **Blank to copy**: `template.rig.js`
- **Art template**: open `/dev/rig.html` — the **rig map**: a labelled rest
  skeleton on a measured grid to draw your design over, plus the live rig in
  motion. `/dev/poses.html` shows every state of every character on one sheet.
- **Character designer**: open `/dev/tuner.html`. Open any character to tweak,
  or build a new one on the REED base. **Edit** mode: skeleton + pose sliders,
  **image-skinned body parts** (head/torso/limbs/hand/foot/weapon, each follows
  its bone), a reference overlay and a bones underlay. **Play** mode drives the
  rig with the **real game controls** in the real engine (walk/jump/attack/
  shield) so you see it move. Then **Export** a complete `<id>.rig.js`. (The five
  legends are hand-coded rigs, so they're view/play-only in the designer; data
  rigs — REED and ones you build — are fully editable.)

Pipeline: *draw on the rig map → fill in a spec → register it in `fighters.js`.*

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

## Deploying

The whole game is one stateful Node process (sessions, rooms, and the
matchmaking queue live in memory; accounts live in SQLite on disk), so run
**exactly one instance** with a persistent volume — that's it.

```bash
# Fly.io (config in fly.toml — set app name & region first)
fly launch --no-deploy
fly volumes create smash_data --size 1
fly deploy
```

Or any Docker host:

```bash
docker build -t riftbrawl .
docker run -d -p 3000:3000 -v riftbrawl-data:/data riftbrawl
```

Notes:
- TLS/`wss://` is handled by your platform's proxy (the client picks
  `ws://` or `wss://` automatically from the page protocol).
- `SMASH_DATA_DIR` (default `/data` in the container) holds `smash.db`;
  a legacy `db.json` found there is migrated automatically on boot.
- `/healthz` reports `{ok, uptime, sessions, rooms}` for health checks.
- Websocket traffic is rate-limited per connection (general + a stricter
  budget for auth/social ops) with an 8KB payload cap.
- One shared-cpu instance comfortably runs hundreds of concurrent rooms;
  scale vertically before thinking about anything fancier.

## Tests

```bash
npm test                 # sim mechanics (ledge, dash, crouch cancel, body
                         # push, stage collision) + end-to-end websockets:
                         # auth → friends → invite → select → full match
                         # with KOs → pause/resume → rematch
node test/visual.js      # drives two real headless-Chrome clients through
                         # the entire flow and screenshots every screen
```
