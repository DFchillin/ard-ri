# Ard Rí — Asset Brief

Copy-ready pixel-art prompts for **every sprite the current build needs**, for
any image generator (ChatGPT image gen, Pixellab, diffusion tools). Scoped to
what's actually in the game today, not the wishlist.

A designed, shareable version of this brief is published as an Artifact.

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

## Palette anchors (already in the build)
If the tool takes hex, match the *mood* not the flat colour — these are the
placeholder chip colours: dwelling `#c98a3a`, field `#8ea63a`, granary `#b0894a`,
market `#a8663a`, well `#5a8aa0`, altar `#7a6a9a` · gold `#e8c96b` · woad `#2c6b76`.
