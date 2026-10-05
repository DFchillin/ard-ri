# Ard Rí — Playtest Backlog

From a full play-through. Grouped into phases, smallest/most-broken first. Tags:
**[bug]** broken, **[tweak]** works but change it, **[feat]** new, **[art]** sprite/asset,
**[?]** needs a decision before building.

---

## Phase 1 — Quick bugs & copy (day of small wins)

- [x] **Warriors not replaced after battle** [bug] — ROOT CAUSE: no replenishment;
  the war-band only shrank. The ledger's "folk" is settlement population, which the
  player read as fighting folk. FIXED (`1ba443f`): `replenishWarband()` each season
  raises levy toward a pop-scaled 6–16 cap and retrains paid hands; veterans still
  come only from wins.
- [x] **Delivery-man flickering** [bug] — ROOT CAUSE found by data-capture: the
  carrier cycled its 6 walk frames, which for `grain_carrier` are *separate files
  byte-identical to the idle* — 12 distinct texture objects that look the same and
  flicker while each async-loads. FIXED (`<this batch>`): only roles with a real
  stride (`hasWalkCycle`) cycle frames; everyone else holds the stand frame and
  moves on the step-bob. Carrier now shows one stable "man with the bag" (distinct
  textures 12 → 2, and those 2 are just facings at a corner).
- [ ] **Gods' walk is wonky** [bug] — gods DO have step1/step2 walk frames, well-
  packed (feet planted), and the bless-walk calls `animate(dt,true)`. So it's not the
  Somhairlín-class packaging bug. NEEDS A VISUAL DIAGNOSIS — deferred.
- [x] **Hurling monument spam** [tweak] — FIXED (`dbc2e5e`): the win flag is consumed
  when a monument is raised; win again to raise another.
- [x] **Morrigan spelling** [bug] — FIXED (`dbc2e5e`): unit label corrected to
  "An Mhórrígan" to match the codex/god-data/summon banner.
- [x] **"Across the sea" for Irish colonies** [bug] — DONE (`<Phase 3>`): all 9 map
  regions are within Ireland, so colonies now read as distant provinces/kingdoms of
  Ériu held "across the island", not "across the water"/Alba (codex, both level
  narratives, and the new-colony banner reworded). True sea wording is reserved for
  the future overseas content.
- [x] **Orchards only yield wheat** [tweak] — DONE (`<this batch>`): rather than split
  the goods, once an orchard stands barley+apples pool as one "food" (🍲). Carrier
  labels, the ledger ("Food in store"), and granary/market inspect all say *food*
  when `hasOrchard()`, else *grain*. (Per your call to keep it simple.)

## Phase 2 — Battle balance & feel

- [x] **Builders' company too fragile** [tweak] — DECISION: add a warrior slot.
  DONE (`<this batch>`): Lucht Ceirde now marches with a free forge-guard (a
  warrior, who leads the company). The guard is signature — never drawn from or
  returned to the war-band roster.
- [x] **Ollphéist persists his wounds** [feat] — DECISION: you wound him, withdraw,
  and finish him later. DONE (`<this batch>`): the Ollphéist's HP carries between
  menace battles (campaign.menaceHp), so he enters already hurt and you wear him
  down; slaying him resets it. His bar still scales to full so the damage shows.
  *(Still open: other beasts raiding at random late-game — separate item below.)*
- [ ] **Random late-game beast raids** [feat] — other beasts should attack at random
  later in the game, like the menace. (Split from the Ollphéist item.)
- [x] **God/demigod spacing** [tweak] — DONE (`<this batch>`): formation slot spacing
  now scales with the largest figure in the company, so a company of heroes/gods
  spreads out (min gap ~0.95 → ~2.66 for a god company) while mortals are unchanged.
  *(If separate lone-god companies still cluster when converging, a battle-time
  separation pass is the follow-up.)*

## Phase 3 — Progression, map & conquest

- [x] **Ard Rí is now a loseable crown** [feat] — DECISION: 4 won raids = Ard Rí, but
  a defeat reopens the contest. DONE (`<this batch>`): `campaign.ardRi` holds the crown
  at 4 raids; a loss in a raid or home defence sets `crownContested` and flashes "the
  battle for the crown is back"; winning a raid while contested reclaims it. The title-
  screen Continue button shows the status (👑 Ard Rí / crown contested).
- [x] **Colonies lost on their own** [feat] — DONE (`<this batch>`): each turn of the
  year a distant Dál may throw off your rule on its own (12% thinly-held, 5% if it's
  a thriving 10+ folk colony); one you hold in person that season never revolts.
- [x] **Colonies need 4× culture** [tweak] — DONE (`<this batch>`): a colony's dwellings
  drain culture 4× as fast as native ones (10→2 per day vs 10→8), so you must pour in
  4× the upkeep — courts, halls and other culture buildings — to win the folk over. The
  sim learns it's in a colony via `game.isColony` (set on every settlement load); the
  colony map info spells out the 4× cost.
- [x] **Overseas raids after Ard Rí (Thar Sáile)** [feat] — DONE (`<this batch>`):
  a "⛵ Thar Sáile — beyond Ériu" button on the war map (shown once you've been Ard
  Rí) opens a sea-choice — North → Lochlann (Norse), East → Saxony, South → Gaul.
  Each is a tougher host than any kingdom of Ériu, costs 8 cattle to launch a fleet,
  and pays big plunder + themed spoils (Lochlann→iron, Saxony→silver+marble,
  Gaul→gold+wine). Overseas wins count as raids (crown).
  *v2 (not yet): planting overseas Dála — needs offshore map/colony support; for now
  they're plunder raids, not settled colonies. Boat-under-unit art is the Phase-4 item.*

## Phase 4 — Economy (make winning harder)

- [x] **Pay per delivery** [feat] — DONE (`<this batch>`): every food/restock carrier
  costs 1 silver from the treasury if the whole run is on your roads, 5 silver if it
  has to cut across open ground (no road path between the two buildings). A one-time
  advisor hint fires on the first unpaved run. Pushes you to pave complete lines.
- [ ] **Boat for sea crossings** [feat] — BLOCKED: settlement maps are landlocked —
  there is no water/ocean terrain for a delivery/building unit to cross, so there's
  nothing to draw a boat under yet. Needs coastal/water terrain in settlements first
  (a bigger map change). Deferred pending that, or a decision to add water tiles.

## Phase 5 — City life & simulation

- [x] **Eviction penalty** [feat][bug] — DONE (`<this batch>`): a tier drop now actually
  turns out the folk over the home's new capacity (they used to linger over-cap), and
  every departing family — evicted or starved out — takes 10 silver and, 40% of the
  time, drives off a cow, with a named notice. Keeping homes prosperous now pays.
- [x] **One Deaglán, housed** [tweak] — DONE (`<this batch>`): only one road-crew at a
  time (a further road is laid but Deaglán doesn't come out again until the first is
  done); and when Somhairlín's House stands he and Finn emerge from it and walk out to
  the head of the new road before digging. No house → they appear at the road as before.
- [x] **Walkthrough / street-view mode (Siúlóid)** [feat] — DONE (`<this batch>`): a
  🚶 pegman above the compass (shown once you're in a settlement with roads) drops you
  into a first-person stroll. A `PerspectiveCamera` auto-wanders the road network at
  eye level (0.85), easing its turn at junctions and preferring not to double back;
  billboard buildings and folk turn to face you, and a tap inspects whoever you pass
  (the raycast picks from the eye-level camera). The clock and economy freeze while you
  stroll — a non-destructive living screensaver — though walkers and ambient fx keep
  moving. "✕ Leave the stroll" returns you to the iso view. DECISIONS: 1st-person
  camera; auto-wander + tap-to-inspect.

## Art integration (ongoing / external)

- [ ] **Chopped buildings** [art] — some newer buildings are sliced wrong: a piece
  missing from the bottom + an overhang of the sprite above on the sheet. User is
  redoing these in PixelAI and will bring them in a **single clean commit**. *Also
  worth checking: is the slice offset a code bug in the building-chip cutter we can
  fix directly?*
- [ ] **Hurling player sprites** [art][feat] — use the dedicated hurler sprites and
  colour their kit in the visitors' colours.

## Phase 6 — Big new system

- [x] **Sparring stadium (Babhta Sparála)** [feat] — DONE (`<this batch>`): the
  wrestling green now draws a roaming champion (one-in-three each season, like the
  hurling band). Tap the green to answer: you name a fighter from your roster — any
  soul, for in the ring they all take the warrior's stance and strike frames (gods
  and heroes use their own battle art) — and corner them over 3 rounds. Each round you
  call **attack** (Sá dhíreach thrust / Trombhuille heavy / Buille cuirp body),
  **guard** (Garda ard high / Garda íseal low / Cor coise footwork-evade) and a word of
  **corner advice** (Ruthless / Cautious / Balanced / Technical — damage/defence/accuracy
  swings). The two fighters trade blows on an isometric sand ring (crowd, posts, camera
  shake + recoil on a clean blow) and the round is scored boxing-style: 10–9 edge, 10–8
  knockdown, 10–7 mauling, with Rocky-style flavour. A knockout ends it there. Win the
  bout → raise a monument (shares the hurling monument prize). Difficulty scales with
  raids won (`grit`). Balance (neutral corner, probed headlessly): early champions —
  villager ~22% → warrior ~27% → seasoned ~48% → curadh ~53% → hero ~68% → god ~80%;
  late (Ard-Rí-era) champions shift that down so you must field your best. Files:
  `src/sparring.js`, `#sparring-screen` overlay, `game.wrestlingGreen()`/`setSparChallenge()`.

---

### Open decisions to resolve before building
1. Builders' company: buff, extra warrior, or both?
2. Ollphéist "accumulate": ramp within a fight, or across attempts? Which late beasts?
3. Ard Rí: how to measure "half the country", and the target number?
4. Chopped buildings: want me to investigate the slicer now, or wait for the PixelAI commit?
