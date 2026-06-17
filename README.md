# ⚔ RIFTBRAWL

A browser-native platform fighter in the spirit of Super Smash Bros — 60Hz
realtime multiplayer, percent-based knockback, 3-stock deathmatches, five
legends, one beautiful floating arena.

![stack](https://img.shields.io/badge/stack-vanilla%20ESM%20%2B%20node-blueviolet)
![netcode](https://img.shields.io/badge/netcode-prediction%20%2B%20rollback%20reconciliation-cyan)

## Quick start

Requires **Node 22+** (`nvm install 22 && nvm use 22`). Accounts, the social
graph, and authentication all live in **Supabase** — there are no native deps
and nothing on disk.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql)
   in its SQL Editor (creates `profiles` / `friendships` / `friend_requests`,
   the sign-up trigger, and helper RPCs).
2. Enable **Auth → Providers → Email**. For zero-friction sign-up, turn **off**
   "Confirm email" so new accounts get a session immediately.
3. Copy [`.env.example`](.env.example) to `.env` and fill in your project's URL,
   anon key, and service-role key.

```bash
npm install
npm run dev        # loads .env if present → http://localhost:3000
# prod: `npm start` (expects the vars already in the environment)
```

Open two browsers (or a friend opens yours over LAN/internet), create your
**Archway account** (email + a fighter tag), add each other as friends, hit
**DUEL** — or just queue **QUICK MATCH**. **VS CPU** works solo.

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
  store.js        Supabase data layer: token verify + profiles/friends/W-L
  game.js         authoritative rooms @60Hz, matchmaking queue, CPU bot
  skins.js        global character skins store (palette + part images), admin writes

supabase/   schema.sql — tables, sign-up trigger, and RPCs to run once

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

**Auth/social**: "Sign in with Archway" — the browser authenticates directly
against **Supabase Auth** (your Archway account) and passes its access token
over the websocket; the server verifies it and resolves your fighter-tag
profile. Friends with live presence, match invites, quick-match queue, and W/L
records all ride the same socket, with the social graph stored in Supabase.

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

Access is gated to **admins**: the editor requires an Archway account whose
`profiles.is_admin` flag is `true`. Grant it once in Supabase (SQL editor):

```sql
update public.profiles set is_admin = true where username = 'YourTag';
```

Then sign in with that same Archway account and open `/design`; everyone else
just plays the game. The `/design` page reuses the browser's Supabase session,
so if you're already signed into the game you're in. Uploaded images and the
`skins.json` document live in `SMASH_DATA_DIR` and are served read-only at
`/skins/…`.

## Deploying

The Node process is stateless apart from in-memory sessions/rooms/queue (all of
which are fine to lose on restart) — accounts and the social graph live in
Supabase. No volume needed; just supply the three Supabase env vars.

```bash
# Fly.io (config in fly.toml — set app name & region first)
fly launch --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
fly deploy
```

Or any Docker host:

```bash
docker build -t riftbrawl .
docker run -d -p 3000:3000 \
  -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  riftbrawl
```

Notes:
- TLS/`wss://` is handled by your platform's proxy (the client picks
  `ws://` or `wss://` automatically from the page protocol).
- The browser fetches the public Supabase config (URL + anon key) from
  `GET /config`; the service-role key never leaves the server.
- `SMASH_DATA_DIR` (default `/data` in the container) holds the `/design` Skin
  Forge data — the `skins.json` document and the uploaded `skins/` part images.
  Keep a small volume mounted there so reskins survive restarts.
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

The sim tests are pure and always run. The end-to-end test creates real Archway
accounts, so it only runs when `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are set (it cleans up the accounts afterward) —
otherwise it skips.
