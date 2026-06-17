# Rig upgrade playbook — bring a legend up to the Aegis bar

A step-by-step runbook for an agent upgrading one of the remaining fighters
(**VOLT, EMBER, TIDE, NOVA**) to the craft and detail level of the rebuilt
`aegis.js`, **without erasing what makes that fighter that fighter.**

> **The golden rule.** Align the *craft*, preserve the *character*.
> Same rendering craft for everyone — real volume, one consistent key light
> (cel shadow on the dark flank + rim highlight on the lit edge), weight-correct
> motion, a signature FX beat per special, clean code.
> Everything else stays **different** — proportions, build, weapon, palette,
> cloth, personality, and game-feel. Do **not** make them all look like Aegis.
> If your upgraded Volt could be mistaken for a small Aegis, you went wrong.

Read first: [`STYLE.md`](./STYLE.md) (the art bible + toolkit), `aegis.js` (the
worked reference), `common.js` (the toolkit), then the target's own rig file and
its entry in `shared/characters.js`.

---

## 1. Identity guardrails — what to KEEP for each fighter

Pull the personality straight from the top-of-file comment in each rig and the
`desc`/stats in `characters.js`. Upgrade the *execution*, never the *idea*.

| Fighter | Build / silhouette to KEEP | Motion personality | Game-feel | Watch out |
|---|---|---|---|---|
| **VOLT** — Storm Dancer | Pint-sized, **lean & light** (weight 80, scale 0.92). Crackling energy hair, goggle visor, bolt-scarf, reverse-grip dagger. | **Kinetic** — bounces on his toes, full-lean sprint with speed streaks, snappy electric attacks. | Featherweight & fast: **short anticipation, fast recovery, NO extra hit-stop.** | Do **not** plate him like a tank. Give limbs taper/sinew + better hands, not heavy armor. Keep him whippy. |
| **EMBER** — Cinder Witch | Bent witch hat (sprung tip), long hair, bell dress with flame-trimmed hem, pyre staff + floating orb. | **Smouldering** — glides rather than runs, embers rise, the orb pulses. | Floaty caster; light, graceful, no hit-stop. | She's **cloth, not plate**: lean on `ribbon`/`chain` for the dress/hair/hat. Volume comes from layered fabric + form-shadow, not armor segments. |
| **TIDE** — Wave Duelist | Fin-crest helm, high-collar duelist jacket, water-sash, shell-guard rapier. Medium build. | **Elegant** — true side-profile fencing stance, wave-rock idle, full-extension lunges. | Honest all-rounder; crisp, not heavy. | Already the most detailed rig — mostly add limb/jacket **volume** and a real gloved hand, refine the lunge weight, keep the fencing elegance. |
| **NOVA** — Void Sentinel | Hooded void helm with star-eye, crescent pauldrons, **NO legs — a stardust wisp tail**, three orbiting shards, telekinetic orb. | **Weightless & slow** — everything drifts. | Floaty heavyweight (big hits) but **never lumbering**; hovers. | **Special case: no legs.** `platedSeg`/`jointCap` apply to her arms + crescent pauldrons; the lower body is a `ribbon`/`chain` wisp, not greaves. Keep the drift — don't stomp. |

Cross-check: each fighter's `weight`/`runSpeed`/`scale`/`colors` in
`characters.js` already encodes its feel — let the animation match the data
(heavy = deep anticipation + hit-stop; light = snappy + airy).

---

## 2. Stand up the visual feedback loop FIRST

You cannot do this work blind. The single biggest force-multiplier is rendering
the rig large and frame-by-frame and *looking* after every change.

```bash
npm install                              # project deps (node 22+)
npm install --no-save puppeteer-core     # driver only; do NOT add to package.json
# locate the preinstalled chromium (version number varies between sessions):
ls /opt/pw-browsers/chromium-*/chrome-linux/chrome
```

Start the server in the background (it serves the ES modules + `/dev` pages):

```bash
# the /dev pages don't sign in, so placeholder Supabase config is fine here
PORT=3210 SUPABASE_URL=https://placeholder.supabase.co \
  SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
  node server/index.js   # run detached/background
```

Then drop this harness in the repo root and run it (`CHAR=volt node rig-shots.mjs`).
It serves a viewer from `public/dev/` (same-origin — avoids the CORS trap of
`page.setContent`, whose origin is `null`), lets the verlet cloth settle, and
screenshots a states sheet + per-attack filmstrips to `/tmp/shots`.

```js
// rig-shots.mjs — TEMP dev tool; delete before committing.
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';
const PORT = process.env.PORT || 3210, CHAR = process.env.CHAR || 'aegis', OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH ||
  execSync('ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1').toString().trim();
const VIEW = 'public/dev/_viewer.html';
fs.writeFileSync(VIEW, `<!DOCTYPE html><meta charset=utf-8><body style="margin:0;background:#0d1020">
<canvas id=c></canvas><script type=module>
import { ACT } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { drawFighter } from '/js/fighters.js';
const CH = new URLSearchParams(location.search).get('char'), char = CHARACTERS[CH];
const ctx = document.getElementById('c').getContext('2d');
const mid = m => Math.floor((m.hitboxes[0].from + m.hitboxes[0].to)/2)+1;
const P = o => ({charId:CH,idx:0,uid:o.uid||'x',facing:1,grounded:true,vx:0,vy:0,percent:0,
  act:ACT.FREE,actFrame:0,moveId:'',stun:0,hitlag:0,shield:60,invuln:0,jumpsLeft:1,
  fastFalling:false,charge:0,x:0,y:0,stocks:3,lastIn:{b:0,x:0,y:0},...o});
function states(){const m=char.moves,s=char.specials,c=[],a=(l,o)=>c.push([l,t=>P(typeof o=='function'?o(t):{uid:l,...o})]);
  a('idle',{});a('run',t=>({uid:'run',vx:char.runSpeed,x:t*char.runSpeed*22}));a('crouch',{lastIn:{b:0,x:0,y:1}});
  a('jumpsquat',{act:ACT.JUMPSQUAT});a('rise',{grounded:false,vy:-11});a('fall',{grounded:false,vy:9});
  a('shield',{act:ACT.SHIELD});a('ledge',{act:ACT.LEDGE,grounded:false});a('reel',{act:ACT.HITSTUN,vx:2,stun:20});
  a('dizzy',{act:ACT.SHIELDBREAK});a('grab',{act:ACT.GRAB,grabbing:-1});
  for(const id of ['jab','ftilt','utilt','dtilt'])a(id,{act:ACT.ATTACK,moveId:id,actFrame:mid(m[id])});
  for(const id of ['nair','fair','bair','uair','dair'])a(id,{act:ACT.ATTACK,moveId:id,actFrame:mid(m[id]),grounded:false,vy:id==='dair'?5:-3});
  a('nb',{act:ACT.ATTACK,moveId:'nb',actFrame:(s.nb.fire??10)-1,charge:55});
  for(const id of ['sb','ub','db'])a(id,{act:ACT.ATTACK,moveId:id,actFrame:Math.floor(((s[id].from??8)+(s[id].to??20))/2),grounded:id!=='ub'});
  return c;}
function film(id){const sp=['nb','sb','ub','db'].includes(id),d=sp?char.specials[id]:char.moves[id],air=['nair','fair','bair','uair','dair','ub'].includes(id),c=[];
  for(let i=0;i<9;i++){const f=Math.round(i/8*(d.total-1));c.push([id+f,()=>P({uid:id+f,act:ACT.ATTACK,moveId:id,actFrame:f,grounded:!air,vy:air?-4:0,charge:id==='nb'?55:0})]);}return c;}
let CELLS=states(),COLS=6;
window.set=(k,a)=>{if(k=='states'){CELLS=states();COLS=6;}else{CELLS=film(a);COLS=9;}};
function draw(t){const CW=200,CH=264,P0=20,S=1.95,rows=Math.ceil(CELLS.length/COLS);
  ctx.canvas.width=COLS*CW;ctx.canvas.height=rows*CH+P0;ctx.fillStyle='#0d1020';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  CELLS.forEach(([l,mk],i)=>{const col=i%COLS,row=(i/COLS)|0,cx=col*CW+CW/2,by=P0+row*CH+CH-44;
    ctx.save();ctx.beginPath();ctx.rect(col*CW,P0+row*CH,CW,CH);ctx.clip();ctx.strokeStyle='#1d2342';ctx.strokeRect(col*CW+.5,P0+row*CH+.5,CW-1,CH-1);
    ctx.translate(cx,by);ctx.scale(S,S);drawFighter(ctx,mk(t),t);ctx.restore();
    ctx.fillStyle='#9fb0d8';ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.fillText(l.toUpperCase(),cx,P0+row*CH+14);});}
let t=0;(function loop(){t+=1/60;draw(t);requestAnimationFrame(loop);})();window.__ready=1;
</script>`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--mute-audio','--force-color-profile=srgb'] });
const pg = await b.newPage();
pg.on('pageerror', e => console.log('[pageerror]', e.message));
await pg.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
await pg.goto(`http://localhost:${PORT}/dev/_viewer.html?char=${CHAR}`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction('window.__ready===1');
async function shot(kind, arg, name) {
  await pg.evaluate((k, a) => window.set(k, a), kind, arg);
  await sleep(1700);                                  // let cloth settle & idle advance
  await (await pg.$('#c')).screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}
await shot('states', null, `${CHAR}_states`);
for (const id of (process.env.FILMS || 'ftilt,fair,utilt,sb,ub,db').split(',')) await shot('film', id, `${CHAR}_${id}`);
await b.close();
fs.rmSync(VIEW, { force: true });
```

Also render the **roster sheet** (`/dev/poses.html`, screenshot `#sheet`) to see
the fighter beside the others, and an **in-stage scene** (`new Renderer(canvas)`,
lock `cam`, feed `view = {players, projectiles:[], meta, myIdx:0, phase:1}`) so you
judge it at real game scale with the aura/stage — the dark dev background lies and
makes everything look muddier than it is in game.

Gotchas: the `favicon.ico 404` is harmless; serve viewer pages from `public/dev/`
(never `setContent`); **delete every temp file** (`rig-shots.mjs`, any
`public/dev/_*.html`) before committing.

---

## 3. The upgrade process (the exact sequence used on Aegis)

1. **Baseline & critique.** Render the current rig (states + filmstrips). Name the
   stick-figure tells (see `STYLE.md`): noodle limbs? flat fills? no weight? Write
   the target silhouette in one sentence ("a lithe storm dancer," not "a tank").
2. **Silhouette / proportions.** Exaggerate toward the fantasy while keeping the
   build the data implies. Set the metric variables (`hipY/shY/headY`, widths)
   first; keep overall height aligned with `hurtR` (~`y=-40*scale`).
3. **Limbs.** Rebuild with `ikSolve` → `platedSeg` (or, for cloth fighters,
   layered `ribbon`/segments) + `jointCap` + `gauntlet`-class hands. Pick the key
   light (`light:-1` = top/front) and use it for the **whole** character.
4. **Core/torso.** Segment it (collar/chest/midriff), one cel shadow, a rim sliver,
   and break up any big dark cloth mass with the accent color (trim/seam).
5. **Head.** Make it read at thumbnail size: strong value contrast, a glowing eye.
6. **Weapon/signature prop.** Give it heft and detail appropriate to the character
   (Aegis: banded haft + rune head; Volt: a crackling dagger; Ember: living orb).
7. **Idle + locomotion.** Weight-appropriate contrapposto, breathing, an occasional
   fidget; overlapping action (hips lead → torso → head settles; cloth lags).
   Heavy = stomp + bob; light = bounce; floaty = drift.
8. **Per-move performances.** Use the `M` object (`ph`, `wk/hk/rk`, `swing`, `lunge`):
   coil in wind-up, commit the whole body through the strike, carry momentum out in
   recovery. Match wind-up length to weight (Aegis deep, Volt almost none).
9. **Signature FX.** One memorable beat per special (Aegis: ground-crack, Up-B
   pillar, counter ward). Reuse `swingTrail`/`flame`/`bolt`/`chargeOrb`/`groundImpact`.
10. **Feel (heavy hitters only).** Add the optional `hl` hit-stop multiplier in
    `characters.js` for genuinely heavy blows; leave light fighters at 1. See
    `STYLE.md` for the determinism note.
11. **Iterate.** Re-render after each change; fix the readability problems below.
12. **Verify & commit** (sections 5–6).

---

## 4. Pitfalls hit on Aegis — don't repeat them

- **Too dark / murky.** The understructure was eating the plate. Fixes that
  worked: keep the bright plate face dominant (`platedSeg` already does this),
  set `under` to a *light* darken of the fill (~`shade(fill,0.66)`, not the global
  navy), push the rim, and **break big dark cloth masses with accent trim**.
- **Knobbly robot joints.** Oversized `jointCap` radii. Keep them modest.
- **Legs/limbs merging into one blob.** Widen the stance and give the near/far
  limbs different tones (front = `primary`, back = `secondary`).
- **Head/face illegible small.** Needs value contrast + a glowing eye, not detail.
- **FX in the wrong place.** Feet are at `y=0` in rig space; ground effects draw at
  `y≈0`, not at the hip.
- **Code hygiene.** Trim unused imports, no placeholder/dead code — the source is
  part of "looks like an artist did it."
- **Scope discipline.** The rigs are presentation-only; never change hitbox geometry
  or knockback for looks. Only `hl` (hit-stop) is fair game, and only for heavy hits.

---

## 5. Verify

```bash
node test/sim.test.js && node test/integration.test.js     # must print ALL PASS
```

The deterministic sim is netcode-critical — if you touched `characters.js`/`sim.js`
(e.g. `hl`), these prove client/server still agree. Then render and eyeball:

- States sheet — every state poses correctly (idle/run/crouch/air/shield/ledge/
  hit/dizzy/grab + all attacks). No throws (watch the page console).
- Filmstrips — each attack shows anticipation → commit → follow-through.
- Roster sheet + in-stage scene — the fighter clearly out-reads its old self,
  **sits at Aegis's craft level, and still looks unmistakably like itself.**
- `drawPortrait` still works (it's the HUD/select idle pose).

---

## 6. Commit

Work on branch `claude/relaxed-mayer-v1q6eu` (**PR #7**); pushing updates it.
One fighter per commit; presentation + conservative feel only. Mention tests pass
and call out anything that shifts balance (hit-stop widens the victim's reaction
window slightly). Add any new reusable primitive to `common.js`, not the rig, so
the next fighter benefits too — and update `STYLE.md`/this file if the process
changes.
