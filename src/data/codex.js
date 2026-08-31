// An Cheilteapaeid — the Celtapedia. Who's who on the field and in the ráth,
// and how each is drawn on screen, so the pixel stand-ins read clearly.
export const CODEX = [
  {
    title: 'The Folk of the Túath',
    blurb: 'Your own villagers, who take up arms when the horn sounds. On the field they wear the same sprites that walk your streets.',
    entries: [
      { icon: '🧑‍🌾', name: 'Villager', ga: 'aos na túaithe', repr: 'the walking villager sprite', lore: 'The common folk. Weak alone, but a line of them holds ground — and by surviving won battles they grow into warriors.' },
      { icon: '🏺', name: 'Water-carrier', ga: 'iompróir uisce', repr: 'the water-carrier walker', lore: 'Keeps the wells flowing. A city-paid hand: if they fall in battle, it takes two seasons to replace them.' },
      { icon: '🌾', name: 'Grain-carrier', ga: 'iompróir arbhair', repr: 'the grain-carrier walker', lore: 'Runs grain from field to granary. Also a paid hand, slow to replace once lost.' },
      { icon: '🛤️', name: 'Deaglán', ga: 'the path-maker', repr: 'the market-trader walker', lore: 'A wandering builder of togher and road. Hardier and quicker than the common folk.' },
      { icon: '🌿', name: 'Druid', ga: 'draoi', repr: 'the druid walker', lore: 'Raised at a shrine. Lifts the culture and heart of those near, and steadies a company’s courage.' },
    ],
  },
  {
    title: 'Trained Warriors',
    blurb: 'Folk who have learned war. Drawn with the spear-and-shield laoch sprites, mortal-sized.',
    entries: [
      { icon: '🛡️', name: 'Warrior', ga: 'laoch', repr: 'the warrior sprite (8 facings, strike animation)', lore: 'A trained fighter. Three won battles may season them further.' },
      { icon: '⚔️', name: 'Seasoned Warrior', ga: 'óglach', repr: 'the champion sprite, borrowed until its own art lands', lore: 'A veteran of many musters — tougher, and a natural leader of a company.' },
      { icon: '🏆', name: 'Curadh', ga: 'the champion', repr: 'the champion sprite', lore: 'The túath’s single greatest warrior. Rare, and worth a dozen levy.' },
    ],
  },
  {
    title: 'Summoned Heroes',
    blurb: 'Called from the tales of the Fianna and the Red Branch. They stand twice a mortal’s height.',
    entries: [
      { icon: '🐕', name: 'Cú Chulainn', ga: 'the Hound of Ulster', repr: 'a hero sprite at twice mortal height', lore: 'The warp-spasm champion of Ulster. Summoned only if the altars favour you — and even then, rarely.' },
      { icon: '🦌', name: 'Fionn mac Cumhaill', ga: 'lord of the Fianna', repr: 'a hero sprite at twice mortal height', lore: 'Leader of the Fianna. His presence heartens a whole war-band around him.' },
    ],
  },
  {
    title: 'Summoned Gods',
    blurb: 'The Túatha Dé themselves — giants who stand across four squares of the field.',
    entries: [
      { icon: '🍲', name: 'An Dagda', ga: 'the Good God', repr: 'a god-sized giant on a 2×2 footprint', lore: 'The Good God, with his club and cauldron. A walking siege-engine that shrugs off mortal blows.' },
      { icon: '🐦‍⬛', name: 'An Mhórrígan', ga: 'phantom queen of war', repr: 'a god-sized giant on a 2×2 footprint', lore: 'The phantom queen, crow of the slaughter. Where she walks, courage breaks.' },
    ],
  },
  {
    title: 'The Returned Dead',
    blurb: 'Those who fall in your service are remembered on the altar’s roll. Pray over them and one may rise again to fight.',
    entries: [
      { icon: '🕯️', name: 'The War-dead', ga: 'na mairbh chogaidh', repr: 'a roll of names on any altar', lore: 'Every villager, warrior or champion who falls is written into the roll — named, not merely tallied.' },
      { icon: '👻', name: 'Ghost Warrior', ga: 'laoch taibhse', repr: 'a pale, translucent warrior sprite', lore: 'A fallen fighter prayed back at an altar. Knows no fear and never breaks — but if banished on the field, it is gone for good.' },
    ],
  },
  {
    title: 'The Ráth',
    blurb: 'What you raise at home. Each building is a single billboarded chip that swaps art when it is working.',
    entries: [
      { icon: '🛖', name: 'Dwelling', ga: 'teach', repr: 'a roundhouse chip', lore: 'Homes the folk. A cultured, happy home sends two to the muster — a mother and father both.' },
      { icon: '🌾', name: 'Field', ga: 'gort', repr: 'a field chip that ripens then empties', lore: 'Grows the grain that feeds the túath.' },
      { icon: '🏚️', name: 'Granary', ga: 'sciobol', repr: 'a granary chip', lore: 'Stores the harvest against winter and siege.' },
      { icon: '⚖️', name: 'Market', ga: 'margadh', repr: 'a market chip', lore: 'Turns goods to silver, and silver keeps your paid folk fed.' },
      { icon: '💧', name: 'Well', ga: 'tobar', repr: 'a well chip', lore: 'Water for the streets; a water-carrier’s round.' },
      { icon: '🗿', name: 'Altar / Shrine', ga: 'altóir', repr: 'an altar chip', lore: 'Each altar is a one-in-four chance to summon a hero or god to your muster — and a place to pray to the war-dead.' },
    ],
  },
  {
    title: 'On the Field',
    blurb: 'The ceremony of battle.',
    entries: [
      { icon: '🚩', name: 'Company', ga: 'buíon', repr: 'a group under one two-colour standard', lore: 'Up to six units mustered together, led by the highest-ranked among them, sharing one collective Misneach (courage).' },
      { icon: '🔷', name: 'Formation', ga: 'cóiriú', repr: 'Líne, Colún, Rinn, Fáinne', lore: 'A shape and a stance: broad line, fast column, hard-hitting wedge, or all-round diamond.' },
      { icon: '🕊️', name: 'The Parley', ga: 'an idirbheartaíocht', repr: 'captains ride out to meet', lore: 'Before blood: fight, pay tribute in cattle, or accept a foe’s surrender when they are outnumbered.' },
    ],
  },
];
