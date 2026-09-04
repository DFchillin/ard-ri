# Ard Rí — Asset Brief

Copy-ready pixel-art prompts for **every sprite the current build needs**, for
any image generator (ChatGPT image gen, Pixellab, diffusion tools). Scoped to
what's actually in the game today, not the wishlist.

A designed, shareable version of this brief is published as an Artifact.

**Pipelines & projection.** Buildings/tiles come from ChatGPT image-gen;
characters come from Pixellab. The game renders a **2:1 dimetric** ground
(tile diamond twice as wide as tall — set in `src/iso_camera.js`, ISO_Y). So
every building and ground tile MUST be drawn 2:1 (as the style block below
says); a true-isometric (1.73:1) building will sit at the wrong angle on the
grid. Characters are upright billboards with no ground plane, so their angle
is forgiving.

**Counts:** 6 buildings × 2 states · 5 walkers × 8 directions · 5 ground tiles ·
2 scatter props + gate.

## How to use
1. **Prepend the STYLE BLOCK to every prompt** — it's what keeps separate
   generations looking like one set.
2. Where possible, attach an already-approved sprite and add *"match the style,
   palette, scale and perspective of the attached image."*
3. Hold a fixed seed per set. Generate on transparent background (or flat
   neutral grey-green to key out).

## STYLE BLOCK (prepend to everything)
> Isometric pixel-art game asset, 2:1 dimetric ¾ top-down city-builder view at
> ~30° elevation. Hand-crafted HD pixel art: soft painterly shading, a single
> thin dark outline, one soft light from the upper-left, a small soft contact
> shadow. Mythic Iron-Age / early-medieval Gaelic Ireland. Muted earthy palette
> — olive and moss green, thatch straw-gold, weathered oak brown, grey
> fieldstone, cream, with occasional Celtic gold and woad-blue accents. Clean
> readable silhouette, centred, consistent scale. Fully transparent background
> (PNG alpha). No ground tile, no text, no frame, no UI.

## Technical rules
- **Projection** — one fixed iso view per building. The camera rotates in 90°
  steps but buildings are billboards, so a single view reads at every rotation.
- **Background** — transparent PNG alpha.
- **Anchor** — base-centre. Footprint ground-centre on the horizontal middle;
  front ground edge on the bottom margin (~8% pad); head-room above for roof/smoke.
- **Scale** — author at **128 px per map tile**; hold it across the whole set.
- **Canvas** — `1×1 → 256×256`, `2×2 → 512×448`, `3×2 field → 640×384`.
- **Two states** — each building drawn twice on one sheet, identical scale &
  anchor: **left = empty/unoccupied**, **right = occupied/operational**. The
  engine shows a half-height placeholder until occupied, then swaps to full.

---

## BUILDINGS — two states each
Files: `assets/buildings/<name>_empty.png` and `<name>_full.png`.

### roundhouse — Dwelling (2×2)
Empty: freshly built, plain, dark doorway, no smoke. Occupied: smoke, warm glow,
pots, a worn path.
> A Celtic roundhouse home: circular wattle-and-daub wall, tall conical thatched
> roof with a central smoke-hole, a low timber doorway. Draw TWO frames at
> identical scale on one transparent sheet, evenly spaced. LEFT (empty): freshly
> built, plain, dark empty doorway, no smoke, muted and still. RIGHT (occupied):
> lived-in and warm — thin smoke rising from the smoke-hole, a warm glow in the
> doorway, a drying rack and a few pots, a worn path at the door.

### field — Barley Field (3×2)
> An isometric tilled barley field bordered by a low woven-timber fence. Draw TWO
> frames at identical scale on one transparent sheet, evenly spaced. LEFT
> (fallow): bare brown ploughed furrows, empty soil. RIGHT (in crop): tall ripe
> golden barley filling the plot, lush and heavy, ready to harvest. Wider than it
> is deep (3×2 footprint).

### granary — Grain Store (2×2)
> A raised Gaelic granary: a thatched timber grain-store lifted on flat
> staddle-stones to keep out vermin, with a small ladder. Draw TWO frames at
> identical scale on one transparent sheet, evenly spaced. LEFT (empty): bare,
> doors open, nothing stored. RIGHT (stocked): full — grain sacks and woven
> baskets stacked around and beneath it, doors shut, tidy and well-kept.

### market (2×2)
> An open Celtic market stall: timber posts under a striped woollen awning with
> trestle boards. Draw TWO frames at identical scale on one transparent sheet,
> evenly spaced. LEFT (idle): bare empty boards, no goods, quiet. RIGHT
> (trading): boards laden with baskets of grain, loaves, clay pots and folded
> cloth — colourful, abundant and busy.

### well (1×1)
> A round drystone well with a timber winch, rope and wooden bucket, under a small
> pitched shingle roof. Draw TWO frames at identical scale on one transparent
> sheet, evenly spaced. LEFT (still): plain, the bucket resting on the rim, no
> activity. RIGHT (in use): rope lowered into the shaft, water glistening at the
> brim, a filled bucket, wet stones and a small puddle. Small footprint (1×1).

### altar (1×1)
> A pagan standing-stone altar carved with ogham strokes and Celtic knotwork, a
> small offering bowl at its foot. Draw TWO frames at identical scale on one
> transparent sheet, evenly spaced. LEFT (dormant): bare weathered grey stone,
> empty bowl, quiet. RIGHT (venerated): greenery and offerings laid around it, a
> lit votive flame in the bowl, cloth tied on, a faint warm golden glow. Small
> footprint (1×1).

---

## WALKERS — 8 directions, single frame
Files: `assets/walkers/<name>/<name>_<DIR>.png`, DIR ∈ `S SE E NE N NW W SW`.
The engine adds the hop and shadow. E/W, NE/NW, SE/SW are mirror pairs — five
drawings, three flipped.

**Shared instruction (add to each):** A single small full-body character in
isometric ¾ view, mid-stride walking pose, clean readable silhouette, base-centre
anchored. Generate EIGHT directional frames on one transparent sheet, evenly
spaced at identical scale, facing the compass in this order: S (toward camera),
SE, E, NE, N (away), NW, W, SW. Keep the character identical across all eight —
only the facing changes. No baked shadow.

- **villager** — a common Gaelic villager: belted léine (linen tunic) in undyed
  cream or muted earth-brown, bare-headed or a simple hood, plain leather shoes.
- **grain_carrier** — a farm labourer carrying a woven basket/sack of golden
  barley on the shoulder, léine with a rough apron, sleeves rolled.
- **market_trader** — a trader in a finer dyed tunic (woad-blue or madder-red
  trim), woollen cloak pinned by a bronze penannular brooch, a laden basket.
- **water_carrier** — balances a wooden yoke with two pails, splashed and wet,
  plain léine, barefoot or simple shoes.
- **druid** — a long hooded robe of natural wool or soft green, a carved staff,
  bearded, a sprig of oak or a small bronze sickle at the belt; dignified,
  otherworldly.

---

## GROUND & TILES
Two kinds: seamless **ground textures** that tile across the grid, and **scatter
props** (tree, boulder) that sit on top as billboards. Texture pasture first,
then bog/water; rock and woodland already read through their props.

**Shared tile instruction:** A seamless, tileable top-down ground texture,
square, that repeats edge-to-edge with no visible seam. Flat even lighting (no
baked directional shadow/highlight) so copies tile cleanly. Subtle, muted,
low-contrast so buildings/units read on top. Pixel-art. Ground only — no props.

Files: `assets/terrain/tiles/<name>.png`
- **pasture** — lush Irish grazing grass, olive & moss green, faint tufts and
  clover, a few tiny daisies, evenly grazed. *(build ground; do this first)*
- **bog** — dark waterlogged peat, sphagnum moss, bog-cotton tufts, small black
  pools, sedge.
- **water** — shallow lough, deep teal-blue, gentle ripples and faint reflections.
- **shore** — pale gold sand and small pebbles, faint ripple lines.
- **rock** — bare grey fieldstone, cracked stone, lichen, scattered pebbles.
  *(optional; rock also carries a boulder prop)*

Scatter props & gate (each transparent, base-centre anchored):
- `assets/terrain/tree.png` — a single Irish oak/hazel tree, full leafy canopy.
- `assets/terrain/rock.png` — a cluster of grey moss-covered fieldstone boulders.
- `assets/props/gate.png` — a carved oak threshold gateway (two posts + a
  knotwork lintel, a worn path through) marking the settlement entrance; replaces
  the placeholder gold post.

---

## BATTLE UNITS — 8 directions × animated frames
These are the ceremonial-battle sprites (a different, taller ¾ *character* view
than the tiny top-down walkers). Each `art` key is a folder of frames the engine
slices at runtime.

Files: `assets/battle/<art>/<DIR>_<FRAME>.png`
- `DIR` ∈ `s se e ne n nw w sw` (S faces the camera, N faces away).
- `FRAME` currently in the engine: `idle`, `step1`, `step2`, `windup`, `strike`.
  → walk cycle is `step1 · idle · step2 · idle`; an attack plays `windup → strike`.
- **Death (new):** add `hurt`, `fall`, `dead`. *(These need a small engine change
  to play — the art can be generated first; until then they sit unused and cost
  nothing.)* `dead` is the frame a corpse rests on.

**Art keys and who they are** (your existing sprites map straight on):
| key | who | your sprite |
|---|---|---|
| `warrior` | Warrior / Fénnid (shared) | "A common Gaelic warrior" |
| `curadh` | Curadh / Seasoned (shared) | "An elite Gaelic warrior" |
| `cuchulainn` | Cú Chulainn (hero) | Cú Chulainn |
| `fionn` | Fionn mac Cumhaill (hero) | Fionn mac Cumhaill |
| `dagda` | An Dagda (god, ~2× tall) | The Dagda |
| `morrigan` | An Mhórrígan (god, ~2× tall) | The Morrígan |
| `fomor` / `fuath` | the menace & its brood (foes) | "an isometric armoured" figure |

### The time-saving workflow (do NOT hand-prompt 40 frames)
Pixellab is built for exactly this — lean on rotate + animate, not one-off prompts:
1. **Approve ONE base pose** per character (the S-facing idle you already have).
2. **Rotate** → generate the 8 directions from that single base (keeps identity).
3. **Animate across the rotations** → feed the action prompt once; it produces the
   frames for every facing. Do walk, then attack, then death as three passes.
4. **Slice & name** into `assets/battle/<art>/<dir>_<frame>.png`. Missing frames
   fall back to the nearest that loaded, so you can ship partial sets safely.
   Death can share a single collapse across all facings if you want to save time —
   a crumpling body reads loosely at this scale.

### BATTLE STYLE ADDENDUM (prepend the top STYLE BLOCK, then add this)
> Full-body character in a ¾ battlefield view, standing roughly head-to-toe in
> frame, heroic readable silhouette, base-of-feet anchored to the bottom edge.
> Iron-Age Gaelic: léine and brat (cloak) with a penannular brooch, leather and
> bronze, lime-washed round shield, spear or sword; mail only on the great. Keep
> the SAME character, palette, weapon and proportions across every direction and
> every frame — only the pose and facing change. No baked ground shadow.

### Action prompts (apply to every character)
- **idle** > a settled ready stance, weight even, weapon lowered, shield up, a faint breathing sway.
- **walk (step1/step2)** > a mid-stride advance, opposite frames of one walk cycle — spear/sword arm swinging, shield tracking.
- **attack (windup → strike)** > windup: weapon drawn back, weight loaded onto the back foot, shield braced. strike: a full committed thrust/overhead cut, lunging onto the front foot, shield flung wide — the peak of the blow.
- **death (hurt → fall → dead)** > hurt: snapped back by a blow, arms flailing, shield dropping. fall: buckling to the knees, weapon slipping from the grip. dead: collapsed prone on the ground, shield and weapon fallen beside — still.

### Per-character base (only if you need to re-derive a base)
Attach the approved sprite and say *"match this exactly."* Otherwise:
- **warrior** > a common Gaelic fighter: undyed léine, a moss-green brat pinned at the shoulder, boiled-leather chest guard, a lime-washed round shield with a bronze boss, a leaf-blade spear, a simple leather cap. Weathered, lean, dependable.
- **curadh** > an elite champion: a fine dyed tunic, a knee-length mail shirt, an ornamented round shield, a long sword, an engraved bronze belt and arm-rings, a proud bearded bearing. Richer than the common warrior, same palette.
- **cuchulainn** > Cú Chulainn, a beardless dark-haired youth blazing with battle-fury: bronze scale over a red tunic, a crimson brat streaming, the great spear Gáe Bolg and a bossed round shield, a hero's light about the brow. Twice a mortal's presence.
- **fionn** > Fionn mac Cumhaill, a tall fair-haired chieftain of the Fianna: hunting greens and browns, a heavy travelling cloak, a long spear and a hunting knife, calm and commanding. A leader men rally to.
- **dagda** > An Dagda, the Good God: a stout grey-bearded giant, a green cloak too short for him, a colossal club/mace slung over the shoulder, a cauldron at the belt, bare shins and heavy boots. Draw ~2× a mortal's height, comic-heroic and immense.
- **morrigan** > An Mhórrígan, the Phantom Queen: a tall pale death-goddess, long black gown, a ragged cloak of crow feathers, black hair on the wind, a spear or a crow perched near, an aura of dread. Spectral, desaturated, ~2× height.
- **fomor / fuath** > a Fomorian foe: a hulking, mis-shapen sea-giant in scavenged plate and a horned helm, one baleful eye, grey-green corpse-flesh, a crude heavy weapon. Menacing, asymmetric, clearly not of the Gael. *(fuath = a smaller water-fiend of the same brood.)*

---

## Palette anchors (already in the build)
If the tool takes hex, match the *mood* not the flat colour — these are the
placeholder chip colours: dwelling `#c98a3a`, field `#8ea63a`, granary `#b0894a`,
market `#a8663a`, well `#5a8aa0`, altar `#7a6a9a` · gold `#e8c96b` · woad `#2c6b76`.

## BUILDING REDO — corrective batch (2:1, footprint-sized)

Some early buildings were drawn near-square or over-scaled in their cell, so
they render too big or at the wrong angle. Regenerate these four to the rule
below; the rest of the sheets are fine.

### THE SCALE RULE (add to every building prompt)
> Draw in **2:1 dimetric** (tile diamond twice as wide as tall). Size the
> building so its **ground base exactly fills its footprint** — a 2×2 building
> sits on a ground diamond two tiles across; a 1×1 on a single tile. Keep the
> structure **no taller than ~1.3× its footprint width** (low and grounded, not
> a tower). Leave an **even, small ground margin** all around so the sprite
> trims to clean transparent edges. If a row of 4 states, hold **identical
> scale, footprint and base position** across all four — only prosperity changes.
> Transparent background, no separate ground tile, no text.

### Grain store — Sciobol (2×2, 4 states)
> A raised Gaelic grain-store on stone staddle-mushrooms with a small ladder,
> low and wide, thatched. States: bare with doors open · a few sacks · full,
> sacks and baskets stacked, tidy · a stone-based, well-kept store with a
> weather-porch. Keep it low — a store, not a tower.

### Well — Tobar (1×1, 2 states OR 4)
> A round drystone well with a low timber winch and a small shingle roof,
> compact, sitting on a single tile. Still (bucket resting) → in use (rope
> lowered, wet stones, a filled pail). Small and low.

### Shrine — Scrín (1×1, 2 states OR 4)
> A single standing-stone carved with ogham and spirals, a low offering-bowl at
> its foot, on a single grassy tile. Dormant (bare grey stone) → venerated
> (greenery, a lit bowl, tied cloth, a faint gold glow). Low and simple.

### Field — Gort (2×2, 4 states) — REDO
> A tilled barley plot bordered by a low woven fence, wider than deep. The
> **lean-to / store hut must be small** — a modest corner shelter, not a house
> (the old one was far too large). States: bare furrows → green shoots →
> tall ripe gold → gold with a hand-cart. Keep the plot flat and the shelter tiny.
