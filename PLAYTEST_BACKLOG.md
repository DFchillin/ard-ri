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
- [ ] **"Across the sea" for Irish colonies** [bug] — Ireland is one island; a colony
  within Ériu should say *land*, not "across the water." (Ties to overseas, Phase 3.)
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

- [ ] **Ard Rí comes too early** [tweak][?] — proclaimed after ~2 raids; should require
  holding ~half the country. *Decision: how is "half" measured (N of M Irish kingdoms/
  regions held), and what's the target?* (Lives in `data/levels.js`.)
- [ ] **Colonies lost on their own** [feat] — beyond ransack-loss, colonies should
  sometimes revolt/throw off rule spontaneously over time.
- [ ] **Colonies need 4× culture** [tweak] — a colony dwelling should need 4× the
  culture of a native one, pushing you to courts & late-game culture buildings.
- [ ] **Overseas expansion after Ard Rí** [feat] — once High King, sail for France,
  England and the Nordic countries (truly "across the sea" targets). Ties to the
  Irish-vs-overseas wording fix and the boat mechanic.

## Phase 4 — Economy (make winning harder)

- [ ] **Pay per delivery** [feat] — 1 silver per delivery; **5 silver** if the route
  crosses an *unpaved* pass — forcing efficient, paved delivery lines.
- [ ] **Boat for sea crossings** [feat] — a delivery/building unit crossing ocean gets
  a little wooden boat drawn under it and costs 5 silver. (Shares plumbing with
  overseas expansion.)

## Phase 5 — City life & simulation

- [ ] **Eviction penalty** [feat][bug] — folk get evicted when capacity rises then
  falls; they should say so as they leave, and take value with them (some silver,
  or steal a cow) so you work to avoid it.
- [ ] **One Deaglán, housed** [tweak] — only one Deaglán at a time; he lives in
  Somhairlín's house, and he + Finn walk the road out to build.
- [ ] **Walkthrough / street-view mode** [feat] — a "little man" button above the
  compass (Google-Maps style): drop onto a path and stroll your city, buildings
  billboarding to face you, click folk as they pass. A screensaver-ish victory lap
  once a city is built.

## Art integration (ongoing / external)

- [ ] **Chopped buildings** [art] — some newer buildings are sliced wrong: a piece
  missing from the bottom + an overhang of the sprite above on the sheet. User is
  redoing these in PixelAI and will bring them in a **single clean commit**. *Also
  worth checking: is the slice offset a code bug in the building-chip cutter we can
  fix directly?*
- [ ] **Hurling player sprites** [art][feat] — use the dedicated hurler sprites and
  colour their kit in the visitors' colours.

## Phase 6 — Big new system

- [ ] **Sparring stadium** [feat][?] — repurpose the wrestling stadium into a
  sparring arena with staged championship fights. A roaming champion shows up; you
  pick a townsperson (drawn with **warrior sprites** for the attack animations). Turn-
  based over 3 rounds, you as the **corner-person**:
  - Round: choose primary attack + primary defence (e.g. lance forward / cautious
    attack; head-guard defence).
  - Corner advice: *be ruthless / cautious / balanced / technical*.
  - Score the round boxing-style (10–9, 10–8 knockdown, 10–7 dominance), dramatic
    Rocky-style flavour. Win the bout → another monument.

---

### Open decisions to resolve before building
1. Builders' company: buff, extra warrior, or both?
2. Ollphéist "accumulate": ramp within a fight, or across attempts? Which late beasts?
3. Ard Rí: how to measure "half the country", and the target number?
4. Chopped buildings: want me to investigate the slicer now, or wait for the PixelAI commit?
