# Character Design Brainstorm

## The core problem

"Same abilities, slightly different stats" produces the same character at different
speeds. Players don't feel stats — a 10% faster run speed is invisible. What they feel
is **verbs**: things one character can do that another simply can't. Differentiation
should be built in this order:

1. **Verbs** — a unique movement mechanic and a unique signature move per character
2. **Animation personality** — the *same* action (jump, walk, attack) animated with
   different timing and easing per character
3. **Silhouette** — recognizable as a black outline at gameplay distance
4. **Stats** — last, as seasoning. Stats tune a design; they are not a design.

A useful test for every character: *if I covered the screen and you only described
what your hands were doing on the controller, could I tell who you were playing?*

## Design pillars

- **One signature mechanic each.** Not three. One mechanic that changes how you
  approach the whole match (Smash examples: Little Mac's terrible air game, Villager's
  pocket, Peach's float).
- **Weaknesses are character design too.** Magnus being slow and Wisp being helpless
  up close create the moments where the opponent feels smart.
- **Animation timing = game feel.** Heavy characters get long anticipation and long
  recovery; the risk/reward *is* the animation. Fast characters get overshoot easing
  and instant startup.

## The roster

### Implemented in the showcase (`public/characters.html`)

| | Puff — The Acrobat | Magnus — The Juggernaut | Wisp — The Phantom Zoner |
|---|---|---|---|
| **Fantasy** | bouncy rush-down pest | unstoppable wall of stone | untouchable trickster |
| **Silhouette** | small round ball | huge blocky shoulders, tiny head | tapered floating cone, no legs |
| **Movement verb** | 5 mid-air jumps, somersaults | none — he's the anvil | hovers, *teleports* instead of jumping |
| **Signature move** | spin-slap (multi-hit, weak) | haymaker with super-armor during wind-up | chargeable orb projectile |
| **Stats lean** | light, fast, weak hits | heavy, slow, huge knockback | lightest, floaty, terrible up close |
| **Animation personality** | overshoot easing, everything bounces | heavy anticipation, sharp strikes, screen shake | pure sine motion, never touches the ground |

Moveset sketches once combat exists:

- **Puff** — jab: rapid slap flurry · side: rolling spin dash · up: corkscrew somersault
  (also the recovery) · weakness: dies early, no kill power except off-stage gimps
- **Magnus** — jab: slow backhand · side: the haymaker (armored frames 8–20) · up:
  double-fist uppercut · down: quake stomp that trips grounded opponents · weakness:
  everything is reactable; he gets juggled forever
- **Wisp** — jab: weak swipe · side: orb (hold to charge size/speed) · up: blink
  teleport (brief sparkle telegraphs where he'll appear — counterplay) · down: phase
  (0.4 s intangible, long cooldown) · weakness: lowest weight, no answer to shields

### Future concepts (each adds a *new verb*, not a stat remix)

- **Hook — The Grappler.** A frog. Tongue is both a command grab (ignores shields,
  drags opponents in) and a tether recovery (latches the ledge). Movement verb: he
  doesn't run — he *hops* in discrete arcs, so spacing against him feels totally
  different. Weakness: whiffed grabs are hugely punishable.
- **Volt — The Speedster.** No double jump at all; instead an 8-direction air dash.
  Builds static charge while moving fast; his next hit spends it for bonus damage.
  Forces constant motion. Weakness: paper weight, and standing still drains charge.
- **Anchor — The Stage Controller.** Plants one persistent gadget (turret or mine) and
  fires a slow orb he can *re-hit* to redirect. Controls space instead of taking it.
  Weakness: setup time; lose the gadget and he's half a character.

Three to five characters with this much contrast beats ten stat-clones.

## Wiring it into the game

Combat doesn't exist yet, so the highest-leverage step is a data-driven character
definition that the (future) combat system and the renderer both read:

```js
// characters/magnus.js
export default {
  id: 'magnus',
  stats: { weight: 130, runSpeed: 1.25, airSpeed: 0.7, jumps: 1, jumpPower: 8.2, gravity: 24 },
  movementVerb: 'none',            // puff: 'multiJump', wisp: 'teleport', volt: 'airDash'
  moves: {
    side: {
      damage: 14, baseKnockback: 6, knockbackGrowth: 1.4, angle: 35,
      startup: 0.38, active: 0.09, recovery: 0.35,       // the haymaker timings from the showcase
      hitbox: { r: 0.45, offset: [0.9, 1.2] },
      armor: { from: 0.08, to: 0.38 },                   // the signature mechanic lives here
    },
    // jab, up, down...
  },
  rig: MagnusRig,                  // visuals + animation, swappable independently of the data above
};
```

The `startup / active / recovery` triple plus knockback angle is where Smash-style
game feel lives — it's also exactly what the showcase animations already encode.

## Art & animation: how to get past "primitive JS shapes"

**Option A — procedural rigs, done properly (what the showcase does).**
The showcase characters are still built from spheres/boxes/cones, but composed with
silhouettes, faces, blinking, squash-and-stretch, anticipation/follow-through, and
particle effects. Zero assets, zero pipeline, works with the existing three.js setup,
and every animation is a few lines of easing code. This is the Crossy Road / vector-y
aesthetic, and it can absolutely ship.

**Option B — free rigged & animated glTF models.** When you want "real" art:
- [Quaternius](https://quaternius.com) — Ultimate Animated Character Pack (CC0, rigged,
  comes with idle/run/jump/punch clips)
- [KayKit](https://kaylousberg.itch.io) — character packs (CC0, rigged + animated)
- [Kenney](https://kenney.nl) — props/stages to match
Load with `GLTFLoader`, play clips with `THREE.AnimationMixer`. Worth bumping three.js
from the r128 script tag to a modern ES-module build at the same time. Animations come
for free with the packs, but you lose the per-character timing control unless you blend
clips carefully — and every character that shares a pack shares a skeleton-feel.

**Option C — custom Blender models / commissions / AI mesh generators.** The
end-game once designs are locked. Don't start here; iterate on designs in A or B first.

**Recommendation:** A now — build the moveset system against it, keep each rig behind a
tiny interface (`build()`, `setState(s)`, `update(dt, t)` — exactly the showcase shape)
so swapping a procedural rig for a glTF model later touches nothing but the rig file.

## Running the showcase

```
node server.js   →   http://localhost:3000/characters.html
```

Click a character (or `1`/`2`/`3`), then `R` walk · `Space` jump · `F` attack · `X` idle.
