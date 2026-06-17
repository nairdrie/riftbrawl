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
  index.js        static hosting, the design/skins HTTP API, one websocket
  store.js        JSON-file user store, scrypt passwords, HMAC tokens
  game.js         authoritative rooms @60Hz, matchmaking queue, CPU bot
  skins.js        global character skins store (palette + part images), gated writes

public/     vanilla ES modules served as-is
  js/game.js      netplay: client prediction + reconciliation of the local
                  player, ~70ms interpolation for remotes
  js/renderer.js  dynamic camera, stage, particles, HUD, announcements
  js/fighters.js  procedural vector fighters — no sprite assets
  js/skins.js     loads global skins; recolour + part-image decals per rig
  js/sfx.js       all sound synthesized with WebAudio
  design/         the /design Skin Forge editor (dev-gated)
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

## Reskinning — the Skin Forge

Visit **`/design`** to reskin any legend in the browser. Because every fighter is
drawn procedurally from a small colour palette, recolouring propagates to *every*
part, pose and animation for free; on top of that you can upload images and bind
them to body-part **slots** (head, torso, hands, weapon/focus, feet, or the whole
body) that ride the existing animation. Skins are **global and live** — saving
publishes them to every client, in char-select and in real matches (looks are
pure presentation, so reskins touch none of the netcode).

- **Palette** — repaint `primary / secondary / accent / glow / trail`; reset any
  colour back to the legend's default.
- **Part images** — drag/drop or upload a PNG/WebP, then tune offset, scale,
  rotation, opacity and flip live across every pose. **Replace base art** hides
  the built-in part (head, hands, weapon and whole-body) so the image fully
  stands in; otherwise it overlays on top of the procedural art.
- **Live preview** — scrub every state (idle, run, all attacks, specials, shield,
  ledge…) with a facing flip and auto state-cycling.

Access is gated to **designers**: list the allowed fighter tags in `DESIGN_ROLES`.
The easiest cross-platform way (Windows included) is a **`.env` file** in the
project root — copy `.env.example` to `.env` and set it there; real environment
variables still override the file. Anyone signed in with a listed tag can open
`/design` and save; everyone else just plays the game. Uploaded images and the
`skins.json` document live in `SMASH_DATA_DIR` (the persistent volume) and are
served read-only at `/skins/…`.

```bash
cp .env.example .env        # then set DESIGN_ROLES=yourtag inside it
npm start                   # open http://localhost:3000/design

# …or pass it inline on macOS/Linux/git bash:
DESIGN_ROLES="yourtag" npm start
```

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
- `SMASH_DATA_DIR` (default `/data` in the container) holds `smash.db`, the
  `skins.json` skin document and the uploaded `skins/` part images; a legacy
  `db.json` found there is migrated automatically on boot.
- `DESIGN_ROLES` (comma-separated fighter tags) unlocks the `/design` Skin Forge
  for those accounts; unset = locked for everyone.
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
