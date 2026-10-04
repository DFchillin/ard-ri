# Ard Rí — Playtest Backlog

From a full play-through. Grouped into phases, smallest/most-broken first. Tags:
**[bug]** broken, **[tweak]** works but change it, **[feat]** new, **[art]** sprite/asset,
**[?]** needs a decision before building.

---

## Phase 1 — Quick bugs & copy (day of small wins)

- [ ] **Warriors not replaced after battle** [bug] — once the first crop of warriors
  dies you're left with only gods/demigods/Deaglán/Somhairlín/ghosts, yet the
  ledger shows plenty of fighting folk. Muster pool isn't drawing the replacements
  the roster says you have. *Highest-impact bug — investigate roster→pool flow.*
- [ ] **Delivery-man flickering** [bug] — carriers still flicker; we just want "the
  man with the bag." Likely a frame/gender-variant swap per spawn. (`grain_carrier`.)
- [ ] **Gods' walk is wonky** [bug] — when gods visit, their walk animation is off;
  confirm they have walk frames and use them (same class of issue as the walkers).
- [ ] **Hurling monument spam** [tweak] — can keep building victory monuments without
  new wins; gate each monument on a fresh win.
- [ ] **Morrigan spelling** [bug] — currently "An Mhórríon"; verify against correct
  Irish and fix everywhere (`units.js`, `trade.js`, codex).
- [ ] **"Across the sea" for Irish colonies** [bug] — Ireland is one island; a colony
  within Ériu should say *land*, not "across the water." (Ties to overseas, Phase 3.)
- [ ] **Orchards only yield wheat** [tweak] — orchards are defined to produce apples
  but the economy only trades grain. Track & show apples separately: 🌾 grain and
  bushels of 🍎 / 🍏.

## Phase 2 — Battle balance & feel

- [ ] **Builders' company too fragile** [tweak][?] — Lucht Ceirde dies fast. Options:
  buff the bond's toughness, allow an extra warrior slot, or both. *Decision needed.*
- [ ] **Ollphéist too hard / escalation** [feat][?] — his damage should *accumulate*;
  and later in the game other beasts should attack similarly, at random. *Decision:
  does "accumulate" mean his damage ramps the longer a fight runs, or he grows across
  attempts? Which beasts, how often?*
- [ ] **God/demigod spacing** [tweak] — big sprites bunch up so you can't see what
  they're doing; add visual separation (wider slots for large units).

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
