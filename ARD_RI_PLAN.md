# Ard Rí — Design & Build Plan

*(working title — "High King")*

A real-time isometric **city-builder in the Zeus / Pharaoh (Impressions) tradition**,
set in a mythic-historical **Celtic Ireland**. Rendered in **Three.js** with
hand-drawn **isometric pixel-art billboard sprites**, driven by an **HTML UI
overlay**. Brand-new codebase (not wired into 7PXL Rugby, but borrows its scene /
sprite / mobile-UI instincts).

---

## 1. Pillars

1. **The walker economy.** Services don't have a static radius — buildings spawn
   *walkers* who wander the roads and apply their effect to whatever they pass.
   Roads are the circulatory system. This is the heart of the game.
2. **Real time with time control.** Continuous simulation, `⏸ / 1× / 2× / 3×`,
   like Zeus. Fixed-timestep sim decoupled from render.
3. **Mythic-historical Ireland.** A grounded early-medieval Gaelic túath on the
   ground; the Tuatha Dé Danann, festivals, heroes and Fomorians in the sky.
4. **Clients, not just citizens.** Growth comes from drawing *clients* (célsine)
   with cattle and food security — your dwelling becomes a clan becomes a túath.
5. **Draw-it-yourself art.** Flat iso pixel sprites, 8 compass directions. No 3D
   modelling. The engine only places and orients quads.
6. **Mobile-first UI.** All interface is HTML/CSS over the WebGL world.

---

## 2. Setting & tone

- **Period backbone:** early-medieval Gaelic Ireland, ~500–900 AD — the era of
  ringforts (*ráth*), Brehon law, clientship, and túatha, kept late enough to be
  documented and early enough to keep druids and the old gods.
- **Tone:** pre-Christian / pagan-mythic (default). Druids, sacred groves,
  Samhain, the Tuatha Dé. (Lever: could later play the Christian *transition*
  with monasteries competing for favour — deferred.)
- **The mythic layer floats over the history:** gods manifest, heroes are
  summoned, Fomorians raid from the sea.

---

## 3. Story & historical grounding

You are the head of a *fine* (kin-group) with a herd and a dream. The player's
arc, and its real historical basis:

| Story beat | History | System |
|---|---|---|
| Coinage + a dream | Head of a kin-group with cattle & silver | Starting cattle + silver, empty land |
| Build a dwelling, people lodge | The **ráth** — defended farmstead; kin settle | Dwelling draws population |
| Work the farms, store food | Mixed farming; **granary**; cattle = wealth | Farm → food walker → granary |
| We cook, more come | **Hospitality** as duty; the feasting hall (*bruiden*) | Feasting hall raises appeal |
| They want to join us | **Clientship (célsine)** — cattle for food-render & loyalty | Clients pledge → tribute + labour |
| Multiple clans in an area | ~150 **túatha**, each a petty kingdom under a *rí* | Neighbouring AI túatha grow |
| Feud or flourish | Cattle-raids vs. marriage / fosterage / clientship | Diplomacy: bind allies **or** raid |
| The dream | *rí túaithe* → over-king (*ruirí*) → **Ard Rí at Tara** | Long-game victory |

Spine: **cattle and full grain-stores draw clients; clients make you a túath; the
túatha around you bow to your generosity or bleed you in cattle-raids — all under
the eye of the Tuatha Dé.**

---

## 4. The walker model (core mechanic)

A building spawns a walker on a timer. The walker performs a **random walk along
connected roads** up to a max distance, then returns home. Every eligible building
within *N* tiles of the walker's path receives the service this tick.

- **Well** → water-carrier → houses on the route get **water**
- **Sacred grove / altar** → **druid walker** → **religious favour**
- **Granary / farm** → food-carrier → **food**
- **Feasting hall** → server walker → **appeal / hospitality**
- **Bard's hall (filí)** → poet walker → **culture**
- **Steward's house** → tribute collector → gathers **wealth** back home

Take the road away and the service stops. Laying roads so walkers actually reach
everyone *is* the puzzle.

### Housing / clientship evolution
Dwellings evolve up tiers as more services reach them, raising population and
tribute; lose a service and they devolve.

`bothy → house → prosperous house → chieftain's hall`

Higher tiers demand more services (water + food + favour + goods…), the classic
Impressions growth ladder, reskinned as attracting and keeping clients.

---

## 5. Systems

- **Economy.** Cattle (wealth & prestige), food (tillage + dairy + meat), and
  crafted goods via chains: wool→cloth, hides→leather, bog-iron→tools/weapons,
  stream-gold→torcs, grain→mead. Storage in granary + storehouse. Market walkers
  distribute goods to houses.
- **Population / clients.** Houses draw settlers when appeal is high; settlers
  become workers; prosperous houses pledge as clients (tribute income).
- **Religion & the Tuatha Dé.** Build sanctuaries to gods (the Dagda, Lugh,
  Brigid, the Morrígan, Manannán). Favour accrues via druid walkers, festivals
  and monuments. Gods manifest to bless (bountiful harvest, victory) or smite
  (blight, storms) — and can war on your behalf or against you.
- **Festivals (wheel of the year).** Imbolc, Bealtaine, **Lughnasadh** (Lugh's own
  feast), **Samhain**. Hold a festival for a god → favour surge + boons. At Samhain
  the veil thins: Otherworld events and raids spike.
- **Monuments.** Long communal builds with wandering builder-carts (Impressions
  style): a **stone circle, dolmen, or passage tomb** (a Newgrange, solstice-
  aligned). Big favour rewards; the "celebrate Samhain → build a monument" beat.
- **Military & the Fomorians.** War-bands defend and raid; **Fomorians** and
  Otherworld beasts raid from the sea as the shared antagonist. **Heroes**
  (Cú Chulainn, Fionn) summoned to a hero's hall to fight monsters.
- **Diplomacy / clans.** Neighbouring túatha you can bind (marriage, fosterage,
  clientship) or fight (cattle-raids for wealth & honour-price).

---

## 6. Tech & architecture

- **Three.js**, no bundler — vendored `three.module.js` + **importmap** in
  `index.html` (keeps the script-tag, offline-friendly style).
- **OrthographicCamera** at a fixed isometric angle (~35° tilt, 45° azimuth).
  Optional **4-way rotate** later.
- **Billboard sprites** — flat iso quads for buildings, 8-direction upright-ish
  billboards for walkers. `SpriteMaterial` / textured planes. Pixel-art, nearest
  filtering, no mipmaps.
- **Tile grid** — a 2D data model (terrain, roads, footprints); the 3D is a view
  over it. Placement via raycast from screen → tile.
- **Fixed-timestep simulation** decoupled from render, scaled by the speed
  multiplier.
- **HTML UI overlay** — all interface is DOM over the WebGL canvas. `pointer-
  events` discipline: UI taps never reach the world; world taps only place/select
  when in the matching mode.

### Sprite spec
- 8 iso directions, named suffixes `_N _NE _E _SE _S _SW _W _NW` (or an 8-cell
  strip). Buildings may ship a single iso frame; walkers ship all 8.
- Loader picks the frame from the walker's heading relative to camera azimuth.

### File layout
```
index.html            importmap + world canvas + #ui-overlay
src/
  main.js             render loop + sim loop (fixed timestep × speed)
  iso_camera.js       ortho iso camera (+ optional rotate)
  grid.js             tile model: terrain, roads, footprints
  render/
    sprites.js        billboard atlas + placement + 8-dir pick
    terrain.js        ground mesh / tiles
  sim/
    walkers.js        ★ spawn, road random-walk, service application
    buildings.js      building types, spawn timers, service ranges
    housing.js        tier evolve / devolve (clientship)
    economy.js        cattle / food / goods production & distribution
    religion.js       gods, favour, festivals, manifestations
    military.js       war-bands, Fomorian raids, heroes
    diplomacy.js      neighbouring túatha: bind or raid
  data/
    buildings.js      every placeable + its walker + costs
    gods.js           Tuatha Dé Danann + boons / wraths
    events.js         festival & Otherworld event tables
  ui/
    overlay.js        DOM UI: resource bar, build menu, speed, advisors
    build_mode.js     DOM→world bridge (selected building → raycast place)
    coverage.js       service overlays (water / religion views)
```

---

## 7. Vertical slice (prove the fun first)

The single loop that *is* the game:

> Lay a road. Place a few **bothies** → they populate. Place a **well** → a
> **water-carrier** spawns and random-walks the roads; houses her path touches
> turn *watered*. Place a **druid's altar** → a druid walker spreads *favour*. A
> watered + blessed house **evolves** to the next tier, raising population — all
> in real time with `⏸ / 1× / 2× / 3×`, driven entirely from the HTML UI.

If wandering a walker down a road and watching a house upgrade feels good,
everything else is content on top.

---

## 8. Phasing

1. **Engine spike** — Three.js iso ortho camera + flat tile grid + place one
   billboard sprite. Prove the look.
2. **Roads + one walker** — road drawing, a walker that random-walks and services
   adjacent tiles; HTML build menu + speed controls.
3. **Vertical slice** — well/water + altar/favour + housing evolution (§7).
4. **Economy** — farms, granary, cattle, goods chains, market walkers, clients.
5. **Religion & festivals** — Tuatha Dé favour, sanctuaries, **Samhain**, first
   **monument**.
6. **Conflict** — war-bands, Fomorian sea-raids, summonable heroes.
7. **Meta** — sandbox map generation → campaign of episodes; save/load; audio;
   mobile polish.

---

## 9. Open questions

- Camera: ship fixed-iso first, add 4-way rotate later? (assumed yes)
- Christian transition as a later tone option? (deferred; pagan-mythic for now)
- Sandbox-first, campaign later? (assumed yes)
- Final title (Ard Rí / Ráth / Danu / …).
