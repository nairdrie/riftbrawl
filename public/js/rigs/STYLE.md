# Rig style guide — "less stick figure, more forged"

How the fighter rigs are built, and the bar every legend should hit. AEGIS
(`aegis.js`) is the reference implementation; the other four are next in line.

The whole renderer is **procedural vector art** — no sprite assets, crisp at any
zoom, deterministic-presentation-only (the rigs never touch the sim). That is a
feature, not a limitation: it just means craft comes from *layering and motion*,
not texture.

## The three reasons a rig reads as a "stick figure"

1. **Constant-width noodle limbs.** A single `limbIK` capsule of uniform width
   stuck on a bulky torso. → Build limbs out of **plated segments** with taper,
   joints, and form-shading (`platedSeg` + `jointCap`). The dark understructure
   peeks at the joints; a bright rim-lit plate is the dominant read.
2. **No volume / flat fills.** One color field per shape. → Every plate gets an
   ink outline **+ a cel shadow on the unlit flank + a rim highlight on the lit
   edge**. Pick one key-light side for the whole character and stay consistent.
3. **No weight.** Upright, symmetric, snaps between poses. → **Contrapposto**
   idle (weight on one leg, hips one way / shoulders the other, slow breathing
   sway), **overlapping action** (hips lead → torso → head settles last; cloth
   and pauldrons lag), and **anticipation → strike → follow-through** on every
   attack instead of a pose snap.

## The volumetric armor toolkit (in `common.js`)

- `ikSolve(x0,y0,x1,y1,l1,l2,dir)` → `{jx,jy,ex,ey}` — two-bone IK **solver**
  (no drawing) so you can layer plates around the bones.
- `platedSeg(ctx, ax,ay,bx,by, w, C, {fill,light,rim,under,shadow})` — one armor
  segment: dark structural capsule → cel-shadow sliver → bright plate face →
  sheen + rim. This single primitive is what turns a stick limb into armor.
- `jointCap(ctx, x,y, r, C, {fill})` — chunky knee poleyn / elbow couter /
  shoulder ball: shaded underside, rim-lit crown.
- `gauntlet(ctx, x,y, r, ang, C, {fill,accent})` — a heavy fist (cuff + knuckles
  + rim + optional glow stone). Hands must read as a real mass, never a dot.
- `groundImpact(ctx, x,y, k, phase, C)` — short-lived dust + ground-crack burst
  under a heavy grounded hit, synced to the strike.

Existing helpers still in play: `chain`/`chainLocal`/`ribbon` (verlet cloth —
capes, plumes, sashes give you free secondary motion), `swingTrail`, `chargeOrb`,
`shade`/`mixc`/`palette` (always derive tones from the character's color block).

## Proportions: design the silhouette, not the man

Push proportions toward the fantasy. AEGIS is deliberately **not** human: a small
crowned helm sunk between **colossal pauldrons**, a deep breastplate, thick
plated limbs, an oversized hammer. The silhouette should read in one glance, in
black, at thumbnail size. Keep overall height roughly aligned with the hurtbox
(`hurtR` around `y = -40*scale`) so hits land where the body is.

## Per-move performance (the `M` object from `deriveAnim`)

`M.ph` is `'wind' | 'hit' | 'rec'`; `M.wk/hk/rk` are eased 0..1 progress within
each phase; `M.swing`/`M.aim`/`M.lunge` drive the weapon and the step-in. Use
them to **coil** in wind-up, **commit the whole body** through the strike (lean +
lunge + weapon lead), and **carry momentum out** in recovery — don't teleport
back to idle. Give signature moves signature FX (AEGIS: ground-crack on grounded
power hits, a rune-pillar on Up-B, a watching ward on the counter).

## Game feel (sim — touch carefully, it's netcoded & deterministic)

Heavy hits can land with extra **hit-stop**: hitboxes carry an optional `hl`
freeze-frame multiplier (`hb(...,hl)` / `spec.hl`), scaled into both attacker and
victim `hitlag` in `sim.js`. It runs identically on client and server, so it's
safe — but more hitlag slightly eases the victim's DI/reaction window, so keep it
to genuinely heavy blows and call out anything that shifts balance.

## Checklist for elevating a legend

- [ ] Limbs rebuilt with `platedSeg` + `jointCap`; hands are `gauntlet`-class masses.
- [ ] One consistent key light; every plate has cel shadow + rim.
- [ ] Silhouette exaggerated to the character's fantasy; reads at thumbnail size.
- [ ] Contrapposto idle with breathing, weight-shift, an occasional fidget.
- [ ] Overlapping action + anticipation/follow-through on locomotion and attacks.
- [ ] Each special has a signature FX beat; heavy hits feel weighty (FX + `hl`).
- [ ] Verify with `/dev/poses.html` (pose sheet) and an in-stage scene at game scale.
