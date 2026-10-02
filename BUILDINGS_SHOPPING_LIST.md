# Ard Rí — Building Art Shopping List

A running list of the building art to make in PixelAI before the big code changes.
Tick things off as they land in `assets/buildings/`. Two of us edit this — add rows freely.

## How building art drops in clean

- **View / style:** isometric 2:1 dimetric (same angle as the existing buildings),
  transparent background, authored around **128 px per tile** so a 2×2 reads ~256 px wide.
- **Finished art — 4 growth states:** `assets/buildings/<art>_s1.png` → `_s4.png`.
  s1 is the humblest/newest, s4 the grandest. The building visibly grows as the ráth
  prospers. (A few simple ones use `_empty`/`_full` instead — field, granary, altar.)
- **NEW — construction stages (for Somhairlín):** `<art>_build1.png` → `_build3.png`
  (bare foundation → timber frame → roofing/near-done). Shown while she hammers; on
  completion it flips to `_s1`. Only the **momentous** buildings (★ below) need these —
  the house + construction stages you've already drawn are exactly this.
- **Footprint** is in tiles `[w,h]`; `drawW` (world-widths) lets art overhang its footprint.

Sizes used here: **S** = 1×1, **M** = 2×2, **L** = 3×3, **XL** = 4×4.

---

## 1. Current buildings — nextgen art to replace

★ = momentous (built by Somhairlín, needs `_build1..3` construction art).

| Key | Building | Size | Role | ★ | Nextgen art |
|---|---|---|---|---|---|
| roundhouse | Dwelling | M | dwelling | | ☐ (you've drawn a house + stages — slot here or as a new tier) |
| field | Field | M | farm | | ☐ |
| orchard | Orchard | M | farm | | ☐ |
| granary | Grain Store | M | granary | | ☐ |
| sciobolmor | Great Granary | M | granary | | ☐ |
| market | Market | M | market | | ☐ |
| aonach | Fair-green | M | market | | ☐ |
| well | Well | S | well | | ☐ |
| altar | Shrine | S | altar | | ☐ |
| gallan | Gallán | L | gallan | ★ | ☐ |
| nemeton | Stone Circle | L | culture | ★ | ☐ |
| hurling_field | Hurling Field | XL | culture | ★ | ☐ |
| feast_hall | Feast Hall | XL | culture | ★ | ☐ |
| wrestling_ring | Wrestling Green | XL | culture | ★ | ☐ |
| brehon_court | Brehon Court | XL | culture | ★ | ☐ |
| healer_well | Healer's Well | XL | culture | ★ | ☐ |
| hosting_hall | Hall of the Gods | XL | hall | ★ | ☐ (big gallán, altar in each corner) |
| monument | Hurling Monument | M | monument | ★ | ☐ |
| homestead | Leader's Homestead | L | homestead | ★ | ☐ |

---

## 2. New buildings — the wish list

### Death, Samhain & the spirit world  (ties to the dead-walk / Sluagh)
- ☐ **Passage Tomb / Cairn** (Newgrange-style) — **XL** ★ — where the fallen are laid; the Sluagh could rise from here at Samhain. A true monument.
- ☐ **Barrow / Burial Mound** — **M** — a grassed mound for the honoured dead; small culture/remembrance.
- ☐ **Ogham Stone** — **S** — a carved boundary/memorial pillar; cheap culture marker.
- ☐ **High Cross** — **S** — later-era standing cross.

### War & the wider world  (ties to raids / the overseas invasion #6)
- ☐ **Round Tower (Cloigtheach)** — **M**, tall ★ — landmark & refuge; a striking skyline piece.
- ☐ **Cashel Wall / Rampart** — enclosure segments + a **Gate** — ring the ráth in stone.
- ☐ **Watchtower** — **S/M** — gives warning of raiders (could extend the raid countdown).
- ☐ **Harbour / Quay** — **L** ★ — needed to *sail further afield*; the launch point for the overseas campaign.
- ☐ **Dún / Hillfort seat** — **XL** ★ — a grander fortified seat beyond the Homestead.

### Craft & economy
- ☐ **Smith's Forge (Ceárta)** — **M** — arms & tools; could feed the muster.
- ☐ **Water Mill (Muileann)** — **M**, on water — grinds grain faster / boosts a granary.
- ☐ **Crannóg** — **M**, on stilts over water — a defensible dwelling/store.
- ☐ **Souterrain** — **S** — underground store that survives a raid.
- ☐ **Corn-Drying Kiln** — **S** — small farm adjunct.

### Dwellings in different sizes  (you asked for size variety)
- ☐ **Beehive Hut (Clochán)** — **S** — a humble starter dwelling (holds fewer folk).
- ☐ **Longhouse** — **3×2** — a bigger family dwelling (holds more).
- ☐ **Chieftain's Hall** — **L** ★ — a prestige home above the roundhouse.

### Culture & special
- ☐ **Somhairlín's House (Teach Shomhairlín)** — **M**, unique — the builder's home; she walks out from here. (Required before any ★ building can be finished.)
- ☐ **Bruiden (Hostel)** — **L** ★ — hall of hospitality; a culture/renown boost.
- ☐ **Bardic School** — **M** ★ — trains the seanchaí; lifts culture.
- ☐ **Sweat House (Teach Allais)** — **S** — a small healing adjunct.

---

## 3. Construction stages checklist (Somhairlín)

Each ★ building needs `_build1` / `_build2` / `_build3` (foundation → frame → roofing).
Your shared set (house + stages) is the template. Priority order for stages:

1. ☐ Homestead  2. ☐ Gallán  3. ☐ Hall of the Gods  4. ☐ Feast Hall  5. ☐ the rest of culture

---

## 4. Suggested build order (art)

1. **Finished nextgen art for what exists** (dwellings, farms, stores, market) — biggest visual lift.
2. **Somhairlín's House** + **construction stages** for Homestead & the gallán — unlocks the builder mechanic.
3. **Passage Tomb** + **Round Tower** — signature Celtic landmarks, tie into Samhain & defence.
4. **Harbour/Quay** — gates the overseas endgame (#6).
5. Everything else as the mood takes you.
