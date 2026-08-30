// The battle roster. Regulars are your own village folk taking up arms — they
// render with the walker sprites from the settlement. Seasoned/special warriors,
// summoned heroes and gods are rarer and stronger. `cat` drives the matchup
// table; `rank` decides a company's leader (highest rank leads).
export const CAT = { regular: 1, seasoned: 2, special: 3, hero: 4, god: 5 };

// sprite = a walker-sheet base (billboarded); else piece:{color,tall} draws a chess-piece.
export const UNIT_TYPES = {
  // --- regulars: the folk of the túath ---
  villager:     { label: 'Villager',       ga: 'aos na túaithe',    cat: 'regular', rank: 1, atk: 1.3, hp: 3, build: 0.4, speed: 3.6, morale: 50, aura: 0, sprite: 'villager' },
  water:        { label: 'Water-carrier',  ga: 'iompróir uisce',    cat: 'regular', rank: 1, atk: 1.1, hp: 3, build: 0.3, speed: 3.9, morale: 48, aura: 0, sprite: 'water_carrier' },
  grain:        { label: 'Grain-carrier',  ga: 'iompróir arbhair',  cat: 'regular', rank: 1, atk: 1.2, hp: 3, build: 0.3, speed: 3.5, morale: 50, aura: 0, sprite: 'grain_carrier' },
  deaglan:      { label: 'Deaglán',        ga: 'the path-maker',    cat: 'regular', rank: 1, atk: 1.5, hp: 4, build: 0.4, speed: 4.4, morale: 62, aura: 0, sprite: 'market_trader' },
  druid:        { label: 'Druid',          ga: 'draoi',             cat: 'regular', rank: 1, atk: 1.8, hp: 4, build: 0.3, speed: 3.2, morale: 72, aura: 8, sprite: 'druid' },
  // --- trained tiers: folk grow into these by surviving won battles ---
  warrior:      { label: 'Warrior',        ga: 'laoch',             cat: 'warrior', rank: 2, atk: 2.0, hp: 5, build: 0.6, speed: 3.2, morale: 66, aura: 0, piece: { color: 0xb0763a, tall: 0.9 } },
  seasoned:     { label: 'Seasoned Warrior', ga: 'óglach',          cat: 'seasoned', rank: 3, atk: 2.7, hp: 8, build: 0.9, speed: 2.8, morale: 80, aura: 0, piece: { color: 0x4a6fae, tall: 1.05 } },
  curadh:       { label: 'Curadh',         ga: 'champion',          cat: 'special', rank: 4, atk: 4.4, hp: 16, build: 1.3, speed: 3.2, morale: 90, aura: 12, piece: { color: 0xe0c060, tall: 1.2 } },
  // --- summoned heroes of the Fianna & the Red Branch ---
  cuchulainn:   { label: 'Cú Chulainn',    ga: 'the Hound of Ulster', cat: 'hero', rank: 5, atk: 6.5, hp: 24, build: 1.8, speed: 3.4, morale: 96, aura: 14, piece: { color: 0xe8a030, tall: 1.35 } },
  fionn:        { label: 'Fionn mac Cumhaill', ga: 'lord of the Fianna', cat: 'hero', rank: 5, atk: 5.2, hp: 22, build: 1.6, speed: 3.2, morale: 95, aura: 22, piece: { color: 0xe8c86b, tall: 1.35 } },
  // --- summoned gods of the Túatha Dé ---
  dagda:        { label: 'An Dagda',       ga: 'the Good God',      cat: 'god', rank: 6, atk: 9.0, hp: 40, build: 3.4, speed: 2.8, morale: 100, aura: 24, piece: { color: 0xf2ead6, tall: 1.7 } },
  morrigan:     { label: 'An Mhórríon',    ga: 'phantom queen of war', cat: 'god', rank: 6, atk: 8.0, hp: 32, build: 2.4, speed: 3.4, morale: 100, aura: 24, piece: { color: 0xc86a8a, tall: 1.6 } },
};

// Promotion path: a regular who survives a won battle may grow into a warrior,
// a warrior into a seasoned óglach — about three wins to climb a tier.
export const UPSKILL = { villager: 'warrior', water: 'warrior', grain: 'warrior', deaglan: 'warrior', druid: 'warrior', warrior: 'seasoned' };
// City-paid folk: if they fall they take two seasons to replace.
export const EMPLOYEES = ['water', 'grain', 'druid'];

// Formations are shapes with a stance. line/column/wedge/diamond drive both the
// slot layout (see formationSlots) and the stat profile.
export const FORMATIONS = {
  line:    { label: 'Líne',   ga: 'rows abreast',  atk: 1.0, tough: 1.1, speed: 1.0, hold: 1.15 },
  column:  { label: 'Colún',  ga: 'deep column',   atk: 1.0, tough: 0.9, speed: 1.25, hold: 1.0 },
  wedge:   { label: 'Rinn',   ga: 'a V / spear-point', atk: 1.35, tough: 0.85, speed: 1.1, hold: 0.9 },
  diamond: { label: 'Fáinne', ga: 'diamond, all-round', atk: 0.9, tough: 1.45, speed: 0.72, hold: 1.5 },
};
export const FORMATION_KEYS = ['line', 'column', 'wedge', 'diamond'];

// Matchup by category: gods crush mortals and shrug off their blows; heroes
// bridge; a company of levy is dust before a god unless it is a great many.
const CM = {
  god:      { regular: 3.0, warrior: 3.0, seasoned: 3.0, special: 2.4, hero: 2.0, god: 1.0 },
  hero:     { regular: 2.2, warrior: 1.9, seasoned: 1.6, special: 1.2, hero: 1.0, god: 0.6 },
  special:  { regular: 1.6, warrior: 1.35, seasoned: 1.2, special: 1.0, hero: 0.7, god: 0.4 },
  seasoned: { regular: 1.3, warrior: 1.1, seasoned: 1.0, special: 0.8, hero: 0.6, god: 0.3 },
  warrior:  { regular: 1.15, warrior: 1.0, seasoned: 0.85, special: 0.6, hero: 0.4, god: 0.25 },
  regular:  { regular: 1.0, warrior: 0.85, seasoned: 0.7, special: 0.5, hero: 0.35, god: 0.2 },
};
export function matchup(attType, defType) {
  const a = UNIT_TYPES[attType], d = UNIT_TYPES[defType];
  if (!a || !d) return 1.0;
  return (CM[a.cat] && CM[a.cat][d.cat]) || 1.0;
}

export const ROUT_MISNEACH = 20;

// Company names for the muster — a Gaelic bank with an English gloss.
export const NICKNAMES = [
  ['Na Toirnigh', 'the Thunderers'], ['An Chraobh Rua', 'the Red Branch'],
  ['Clann na Fola', 'kin of blood'], ['Faolchúnna an Átha', 'wolves of the ford'],
  ['Mic na Tuaithe', 'sons of the túath'], ['Na Tuirc', 'the Boars'],
  ['Sciath Iarainn', 'iron shields'], ['Lucht na Tine', 'folk of the fire'],
  ['Gáir Bhán', 'the white war-cry'], ['An Dord', 'the war-horn'],
  ['Cú na Life', 'hounds of the Liffey'], ['Béir an tSléibhe', 'bears of the mountain'],
  ['Claímhte Solais', 'swords of light'], ['Fir na gCloch', 'men of the stones'],
  ['Ruaig na Toinne', 'the tide-rout'],
];
let _nn = Math.floor(Math.random() * NICKNAMES.length);
export function nextNickname() { _nn = (_nn + 1 + Math.floor(Math.random() * 3)) % NICKNAMES.length; return NICKNAMES[_nn]; }
