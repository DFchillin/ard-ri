// The campaign told in chapters. Each level sets the mission checklist and, on
// completion, an illuminated narrative page carries you to the next — Zeus-style.
// Objective checks receive (game, campaign).
export const LEVELS = [
  {
    id: 1, title: 'First Steps', ga: 'Na Chéad Chéimeanna',
    objectives: [
      { text: 'Build 4 dwellings', check: (g) => g.count('dwelling') >= 4 },
      { text: 'Sow a barley field', check: (g) => g.count('farm') >= 1 },
      { text: 'Store grain', check: (g) => g.anyStock('granary') },
      { text: 'Stock a market', check: (g) => g.anyStock('market') },
      { text: 'Feed a dwelling', check: (g) => g.buildings.some((b) => b.def.role === 'dwelling' && b.food > 0) },
      { text: 'Raise a shrine', check: (g) => g.count('altar') >= 1 },
    ],
    // On finishing, the next chapter's story is shown:
    next: {
      emoji: '🐄', motif: 'linear-gradient(160deg,#3a5a2e,#6b8f3a)',
      title: 'The Cattle-Lord', ga: 'An Bó-Aire',
      body: [
        'Your folk are housed and fed, and the smoke of hearths rises over the ráth. Word of your steading spreads across the túath.',
        'A king in Ériu is measured not in silver but in cattle. Raise your own Leader’s Homestead — your seat — and a herd will graze the pasture around it, the true wealth of a Gaelic rí.',
        'But a settled people must also have a soul. Raise shrines, let the druids walk your streets, and make your túath one the old powers themselves might favour.',
      ],
    },
  },
  {
    id: 2, title: 'The Cultured Túath', ga: 'An Túath Chultúrtha',
    objectives: [
      { text: 'Raise your Leader’s Homestead', check: (g) => g.count('homestead') >= 1 },
      { text: 'Keep two shrines', check: (g) => g.count('altar') >= 2 },
      { text: 'Cultivate three cultured homes', check: (g) => g.buildings.filter((b) => b.def.role === 'dwelling' && b.culture > 0).length >= 3 },
      { text: 'Host a hero or god', check: (g, c) => Object.keys(c.hosted || {}).length >= 1 },
    ],
    next: {
      emoji: '☠️', motif: 'linear-gradient(160deg,#2a1c2e,#5a2a30)',
      title: 'A Shadow from the Sea', ga: 'Scáth ón Fharraige',
      body: [
        'Your túath is renowned; poets sing of it, and a hero has answered your hearth. Yet renown draws darkness as surely as light.',
        'Out of the northern mist comes a thing of the Fomhóraigh — a giant that levels all in its path, hearth and hall and standing-stone alike, as Balor’s brood once harrowed Ériu.',
        'No walls will hold it. Muster your folk and your summoned champion, and stand between the menace and your people. Hold the ráth, or lose everything you have raised.',
      ],
    },
  },
  {
    id: 3, title: 'The Menace', ga: 'An Sceimhle',
    objectives: [
      { text: 'Muster a war-band to meet the menace', check: (g, c) => (c.roster && Object.values(c.roster).reduce((a, b) => a + b, 0) >= 4) },
      { text: 'Repel the Fomorian menace', check: (g, c) => c._menaceRepelled === true },
    ],
    next: {
      emoji: '👑', motif: 'linear-gradient(160deg,#3a2f10,#7a5a1e)',
      title: 'Toward the High Kingship', ga: 'I dTreo na hArd-Ríochta',
      body: [
        'The menace is broken, and your name is spoken with awe from Ailech to the far south.',
        'Now the whole island lies before you — kingdoms to raid, colonies to plant across the water, heroes to host and gods to summon. Rise from this lone ráth to High King of Ériu.',
        'The campaign map is yours to command.',
      ],
    },
  },
];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
