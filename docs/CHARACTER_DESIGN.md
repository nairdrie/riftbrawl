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

### The cast — KayKit Adventurers (`public/adventurers.html`)

| | Bastion — The Bulwark | Korga — The Avalanche | Elara — The Tempest | Whisper — The Phantom Blade |
|---|---|---|---|---|
| **Model** | Knight | Barbarian | Mage | Rogue (hooded) |
| **Fantasy** | immovable wall | reckless berserker | untouchable artillery | in-and-out assassin |
| **Movement verb** | none — slowest run, shortest jumps | armored forward momentum | blink-teleport replaces her dodge | i-frame dash, fastest run |
| **Signature** | Block stance: no flinch, no knockback; Shield Bash is the only attack that works mid-block | Rage: damage taken powers her next swing; Whirlwind travels while it hits | chargeable bolts — tap for a poke, hold for a screen-crossing blast | Smoke bomb: vanish for a second; backstabs hit double |
| **Weakness** | can be out-spaced forever | everything is honest and reactable | helpless up close | paper weight, weak single hits |
| **Loadout (visible props)** | `1H_Sword` + `Badge_Shield` | `2H_Axe` | `2H_Staff` | `Knife` ×2 (+ `Throwable`) |
| **Key clips** | `1H_Melee_Attack_Slice_Diagonal`, `Block_Attack`, `Blocking` | `2H_Melee_Attack_Chop`, `2H_Melee_Attack_Spinning` | `Spellcast_Shoot`, `Spellcast_Long` | `Dualwield_Melee_Attack_Slice`, `Throw`, `Dodge_*` |

Every GLB ships the same ~76 clips (idle, run, a three-phase jump, four dodges,
block/block-hit, hit reactions, deaths, full melee/ranged/spellcast families) and
*every weapon variant already rigged to the hands* — a kit is defined by which props
it leaves visible. Distinctness comes from clip choice, per-character timing
(`setEffectiveTimeScale`), and the verbs above; the skeleton is shared.

The earlier procedural prototypes (`public/characters.html`) carried the same role
DNA — Korga inherits Magnus's tempo, Elara inherits Wisp's, and Whisper plays at
Puff's speed. Plain `Rogue.glb` is kept as an alternate costume for Whisper.

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

**Decision: Option B — KayKit Adventurers (CC0).** Assets live in
`public/assets/kaykit/` (from the official GitHub mirror, license file included).
`public/adventurers.html` is the living kit sheet, and the in-game `Player` loads
the Knight via `GLTFLoader` + `AnimationMixer`, with idle/run/jump clips driven by
the existing input code.

## Combat (implemented)

Movesets live in `public/characters.js` and run in `Player.js`:

- **Knockback** is Smash-flavored: `(baseKb + targetDamage% * kbGrowth) / targetWeight`,
  launched at the move's angle. Damage resets on KO (falling off and respawning).
- **F = attack, G = special.** Melee moves have startup/active windows; bolts spawn
  real projectiles owned by the attacker's client.
- **Kit verbs**: Bastion holds G to block (no flinch; chip damage only; F mid-block =
  Shield Bash). Korga's knockback grows with her own damage (rage) and Whirlwind
  travels while hitting. Elara's two bolts trade speed for power. Whisper's hits from
  behind do double (backstab) and Smoke Bomb makes him briefly intangible.
- **Netplay**: each client simulates its own fighter and publishes position + clip +
  damage; hits are relayed peer-to-peer through the server (`attackHit` → `hitReceived`),
  with the receiver applying its own block/intangibility rules.
- **Physics are delta-time scaled** — same game speed at any refresh rate.

## Running it

```
node server.js
  → http://localhost:3000              the game: character select, then fight
  → http://localhost:3000/?training    same, plus a practice dummy that takes real hits
  → http://localhost:3000/adventurers.html   roster & kit showcase
  → http://localhost:3000/characters.html    earlier procedural prototypes
```

In-game: `←→`/`AD` move · `Space` jump (×2) · `F` attack · `G` special (hold to
block as Bastion). Showcase: `1`-`4` select · `R` run · `Space` jump · `F` attack ·
`G` special · `H` hit reaction · `K` KO (and get back up) · `X` idle.
