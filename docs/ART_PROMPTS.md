# Ard Rí — Sprite Prompt Pack

Prompts for generating the settlement sprites (ChatGPT image gen, Pixellab, or
any diffusion tool). Built to match the **Celtic / Brehon Settlement Sprite
Sheet** reference so every new asset stays consistent with it.

## How to use

1. **Always prepend the STYLE BLOCK** below to every prompt. It's what keeps
   separate generations looking like one set.
2. When you can, **attach the reference sheet as an image** and add
   *"match the style, palette, scale and perspective of the attached sheet"* —
   that locks consistency harder than words alone.
3. Generate on a **transparent background**. If a tool bakes a background,
   generate on flat neutral grey/green and we key it out later.
4. Keep a **fixed seed** per set where the tool allows, so re-rolls stay on model.

## STYLE BLOCK (prepend to everything)

> Isometric pixel-art game asset, 2:1 dimetric / classic city-builder ¾ top-down
> view, ~30° elevation. Detailed HD pixel art with soft painterly shading and a
> thin dark outline. Single soft light source from the upper-left, small soft
> contact shadow only. Muted earthy Celtic Iron-Age / early-medieval Gaelic
> palette: olive green, thatch straw-gold, weathered timber brown, grey
> fieldstone, cream, moss. Clean readable silhouette. Centred, consistent scale,
> fully transparent background (PNG alpha). No ground tile, no text, no frame,
> no UI.

## Output → asset mapping

- Single building: `assets/buildings/<name>.png`
- Upgrade stages: `assets/buildings/<name>_1.png` … `_5.png` (1 = humblest,
  5 = grandest). The loader will read these once building upgrades are wired.
- Walker: `assets/walkers/<name>/<name>_<DIR>.png` for the 8 compass dirs.

---

## DWELLINGS  (5 upgrade stages each)

Add to each: *"Show 5 progressive upgrade stages in one row, left to right,
evenly spaced on a shared baseline at identical scale: (1) small and rough,
(2) modest and lived-in, (3) established, (4) prosperous and decorated,
(5) grand. Transparent gaps between each."*

- **roundhouse** — A Celtic roundhouse: circular wattle-and-daub wall, conical
  thatched roof with a smoke hole, low timber doorway. Stage 5 adds a surrounding
  low earthen bank and carved doorposts.
- **longhouse** — A Gaelic timber longhouse: rectangular plan, long pitched
  thatched roof, timber-framed walls, a stone chimney end. Stage 5 adds a porch
  and painted door.
- **stone_house** — A drystone-walled house with a heavy thatched roof and a
  stone chimney, small shuttered windows. Later stages gain a second gable and
  neater masonry.
- **hill_fort_house** — A chieftain's house: stout timber and stone, defensive
  posts, banner poles, a raised stone footing. Later stages gain palisade posts
  and a carved lintel.
- **druids_hut** — A druid's dwelling ringed by small standing stones, a low
  thatched hut with a glowing doorway and hanging charms. Later stages add more
  standing stones and a carved ogham stele.

## FARMING  (5 stages = the seasonal / growth cycle)

Add to each: *"Show 5 stages left to right on a shared baseline at identical
scale, transparent gaps between."*

- **fields** — An isometric tilled crop field bordered by a low timber fence.
  Stages: (1) bare ploughed furrows, (2) green sprouts, (3) growing green crop,
  (4) tall ripe golden barley, (5) harvested with stooked sheaves.
- **vegetable_patch** — A fenced kitchen garden. Stages: (1) bare beds,
  (2) seedlings, (3) leafy rows, (4) full cabbages and greens, (5) ripe with
  roots and gourds.
- **orchard** — Fenced fruit trees. Stages: (1) bare saplings, (2) leafing,
  (3) full green canopy, (4) blossom, (5) heavy with red apples. (One tree unit;
  we tile several.)
- **animal_pen** — A timber-fenced enclosure. Stages: (1) empty pen, (2) a few
  sheep, (3) a small flock, (4) sheep and cattle, (5) a full herd of cattle.
- **grain_store** — Grain storage. Stages: (1) small thatched basket store,
  (2) larger, (3) a raised granary hut, (4) a granary on stone staddle stilts,
  (5) a tall well-built raised granary. (Souterrain/raised-store feel.)

## AMENITIES  (single sprite each, no stages unless noted)

- **well** — A round drystone well with a timber winch and a small pitched roof.
- **market** — An open market stall: timber posts, striped awning, baskets of
  produce and pots.
- **smithy** — A blacksmith's forge: stone hearth with glowing coals, anvil,
  timber lean-to roof, smoke.
- **herbalist** — A herbalist's hut hung with drying herbs, shelves of pots, a
  small garden of plants.
- **bard_circle** — A ceremonial circle of standing stones around a low central
  fire pit, a banner on a pole. (The gathering place for the filí.)
- **rain_shrine** — A carved standing-stone shrine with a small water basin and
  votive offerings, moss and Celtic knotwork.
- **sacred_oak** — A great ancient oak with a low stone ring at its base and
  cloth offerings tied to the branches.
- **training_ground** — A warriors' training yard: timber weapon racks, practice
  posts, hide targets, banner poles.
- **community_fire** — A communal stone fire pit with a crackling fire, log
  seats and a cooking tripod.
- **altar** — A pagan standing-stone altar carved with ogham and knotwork, a
  small offering bowl. (Spawns the druid walker.)

---

## WALKERS  (4 directional frames each: down / left / up / right)

Per the concept sheet, every walker has **4 frames** — down, left, up, right —
saved as `_S _W _N _E`. Add to each prompt: *"A single small character sprite,
full body, mid-stride walking pose, in isometric ¾ view. Generate 4 directional
frames — facing down, left, up, and right — as a consistent character at
identical scale."* (Or draw one and mirror left↔right for two of the four.)

Each walker is spawned by a building and carries a service along the roads
(a few are ambient folk). Files go in `assets/walkers/<name>/<name>_<DIR>.png`.

**Vendors / Merchants** — market & trade
- **trader**, **food_merchant**, **herbalist**, **fishmonger**, **weaponsmith**,
  **jeweler** — market/craft vendors; spread *goods/appeal* from their stalls.

**Resource carriers & laborers** — the core service walkers
- **water_carrier** — pails on a yoke → spreads **water** (from the well).
- **wood_cutter**, **stone_carrier**, **grain_carrier** → carry raw goods to store.
- **pack_mule_handler** — leads a laden mule; long-haul goods.
- **laborer** — general worker (construction, ambient).

**Maintenance & builders** — keep buildings from decaying
- **builder**, **carpenter**, **stone_mason**, **thatcher**, **repairer** →
  spread **upkeep** (prevent devolution).

**Service & civic roles**
- **bard_storyteller**, **bard_musician** → spread **culture** (from the bard circle).
- **herald**, **messenger** → carry orders/announcements.
- **seneschal** — the steward with a tally stick → collects **tribute/tax**.

**Animal handlers**
- **cow_herder** (cattle = wealth), **sheep_herder**, **pig_keeper**,
  **goose_herder**, **horse_handler** → tend the animal pens.

**Utility & support** — the food/craft chain
- **cook**, **brewer**, **baker** → spread **food/hospitality** (feasting hall,
  granary). **tanner**, **fire_keeper** → hides/leather and the community fire.

**Special**
- **druid** — hooded robe and staff → spreads **religious favour** (from the
  altar / druid's hut).
- **warrior** — war-band spearman with a round shield → defence (training ground).

## Consistency tips

- Generate a **whole row of 5 stages in one image** (as the reference sheet did)
  so stages share lighting and scale, then slice. This beats generating stages
  separately.
- Lock the **palette** first (generate one hero building, approve the colours,
  then reference it for everything else).
- Keep the **light from the upper-left** on every asset or shadows will fight
  in-world.
