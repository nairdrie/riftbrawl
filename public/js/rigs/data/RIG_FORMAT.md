# Importable characters — the rig spec format

This is how you bring a **custom character design** into RIFTBRAWL: its look, its
weapon, its projectile, and (through `characters.js`) its movement and moveset —
all from data, no bespoke draw code.

## "What format should I hand you the art in — a sprite sheet?"

**No — not a sprite sheet.** RIFTBRAWL fighters are *procedural vector art*: the
renderer poses a skeleton every frame with two-bone IK, cloth physics, squash &
stretch, and a per-move anticipation→strike→follow-through performance, all crisp
at any zoom and reactive to the live sim. A sprite sheet would throw every bit of
that away — you'd get a flipbook that can't lean into a hit, trail a cape, scale
with the camera, or share the animation system the five legends use.

So the "standard, importable format" here is a **declarative rig spec** (this
doc) plus one shared interpreter. You describe the character's *anatomy and skin*
as data; the engine supplies the *motion*. Every imported character then animates
exactly as well as the built-ins, for free.

### The art you actually hand over

A **single, front-facing, neutral-stance reference drawing** (a "T/A-pose
turnaround"), ideally traced over the rig map so the proportions already line up:

1. Open **`/dev/rig.html`** — the **RIG MAP**. It shows REED's rest skeleton on a
   measured grid with every *socket* labelled (head, shoulder, hip, knee, elbow,
   hand→weapon grip, foot) in the engine's units: **feet at `(0,0)`, +x faces
   right, y up = negative**.
2. Draw your design over the right-hand grid at those proportions. PNG/SVG/sketch
   — anything readable. Note where the armor plates, cloth, and weapon sit
   relative to the labelled sockets.
3. Hand that drawing over (e.g. to Claude: *"rig this at these proportions"*) — or
   translate it yourself into a spec by copying `template.rig.js`.

That's the whole pipeline: **draw on the rig map → fill in a spec → register it.**

## It's a side view — pose without the guesswork

These fighters are drawn in **profile** (the character faces +x, the way it
moves), not facing the camera. Two consequences the format bakes in:

- **Depth, not width.** Near/far limbs are separated mostly in *depth*, so
  `depth` (default `0.55`) compresses the frontal hip/shoulder width into a 3/4
  silhouette. Knees bend *forward* (sagittal plane), never toward each other.
- **The resting stance + weapon hold are authored data** (`idleSettle`,
  `idlePose`), not magic numbers — so you can dial them in by eye instead of
  guessing coordinates.

**Use the Pose Tuner — `/dev/tuner.html`.** It renders the *real* engine and
gives you sliders for the whole idle stance (foot stagger, hip sink, lead-hand
position, blade angle, off-hand, lean) and the weapon dimensions. You can drop a
**reference photo/drawing behind the rig** and match it. When it looks right, hit
**Copy spec** and paste the block into your `.rig.js` (`depth`, `idleSettle`,
`idlePose`, `weapon`). This is the intended loop for getting hands and stances
*correct* rather than approximate.

## Anatomy of a spec

See `template.rig.js` for the annotated blank and `reed.rig.js` for the worked
example (the stick fencer REED). The shape:

| Block | What it controls |
|---|---|
| `skel` | Proportions + bone lengths the engine poses (hip/shoulder/head heights, limb lengths, stance width). |
| `limb` | Limb look: `stick` (inked strokes) or `plated` (forged armor), widths, color, joints, hands, feet. |
| `torso` / `head` | Trunk shape (`spine`/`capsule`/`plate`) and head (`disc`/`helm`) + face. |
| `cloth` | Optional verlet ribbons (capes, scarves) that trail as you move. |
| `weapon` | The thing in the front hand (`sword`/`staff`/`none`) — length, colors, one/two-handed, idle carry. |
| `projectile` | The look of this character's neutral-B shot (optional; defaults to a tinted bolt). |

Everything is JSON-able and every field has a default, so a minimal spec (`{}`)
still draws a valid figure. Colors are palette keys — `primary`, `secondary`,
`accent`, `glow`, `trail` (from the character's `colors` block in
`characters.js`), plus derived tones `priD/priL/secD/secL/accD/ink` — or a literal
`#hex`.

## Where movement, weapons & projectiles live

- **Movement & feel** (run speed, weight, jumps, gravity, recovery) and the
  **moveset** (every tilt/aerial/special: damage, angles, knockback, timing) are
  *sim data* in `shared/characters.js` — identical to how the built-in legends are
  defined, because the sim is deterministic and shared by client + server. The rig
  spec is *presentation only* and never touches the sim.
- **Weapons** are part of the rig spec (drawn in the front hand, swung by the
  shared per-move performance).
- **Projectiles**: the *behavior* (speed, life, damage, charging) is a special in
  `characters.js` using an existing `type` (`projectile`, `dash`, `recovery`,
  `burst`, …); the *look* is the spec's `projectile` block, drawn by the rig.

## Adding a character (checklist)

1. **Spec** — copy `template.rig.js` → `mychar.rig.js`, fill it in against the rig
   map, set `id` to your character's id.
2. **Stats + moveset** — add a `mychar: { … }` entry to `CHARACTERS` in
   `shared/characters.js` (stats, `ui` bars, `colors`, `moves`, `specials`). Reuse
   special `type`s the sim already supports: `projectile`, `dash`, `recovery`,
   `burst`, `boom`, `teleport`, `zip`, `hopback`, `trap`, `pull`, `orbit`,
   `counter`, `quake`. Add the id to `CHARACTER_LIST`.
3. **Register the rig** — in `public/js/fighters.js`:
   ```js
   import { mycharSpec } from './rigs/data/mychar.rig.js';
   const RIGS = { …, mychar: buildDataRig(mycharSpec) };
   ```
4. **Verify** — `/dev/rig.html` (your rig in motion), `/dev/poses.html` (every
   state on one sheet), `npm test` (sim still green). The character now shows up
   in character select, quick match, and CPU games automatically.

## Extending the format

The interpreter (`runtime.js`) is small and readable. New limb styles, torso
shapes, weapon types (`axe`, `bow`, `gun`…), or projectile shapes are added there
once and become available to every spec via a new enum value — keep the spec pure
data so characters stay importable.
