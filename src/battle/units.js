// Battle data: buíon (warband) types, formations, relic talismans, and the
// matchup table that makes mismatches decisive. Balance lives here, not in code.

// atk/tough scale power; count is bodies; speed is march pace; morale is starting
// Misneach; aura raises the Misneach of friendly buíonna standing nearby.
export const UNIT_TYPES = {
  ceithern:    { label: 'Ceithern',   ga: 'kerns (levy)',       glyph: '⚔', atk: 1.0, tough: 1.0, speed: 3.4, count: 40, morale: 55, aura: 0 },
  galloglaigh: { label: 'Gallóglaigh', ga: 'gallowglass',        glyph: '🛡', atk: 1.7, tough: 1.9, speed: 2.6, count: 20, morale: 78, aura: 0 },
  curadh:      { label: 'Curadh',     ga: 'champion-hero',       glyph: '★', atk: 3.2, tough: 2.6, speed: 3.2, count: 5,  morale: 90, aura: 12 },
  dia:         { label: 'Túatha Dé',  ga: 'a god',               glyph: '☀', atk: 8.0, tough: 6.0, speed: 3.0, count: 1,  morale: 100, aura: 20 },
};

// Formation (córú) modifiers.
export const FORMATIONS = {
  wall:  { label: 'Claí Sciath', ga: 'shield-wall', atk: 0.9, tough: 1.5, speed: 0.7, hold: 1.6 }, // holds Misneach
  wedge: { label: 'Rinn',        ga: 'spear-point', atk: 1.4, tough: 0.85, speed: 1.15, hold: 0.9 },
  loose: { label: 'Scaoilte',    ga: 'skirmish',    atk: 0.85, tough: 0.9, speed: 1.4, hold: 1.0 },
};

// Relic talismans (ortha) — one per buíon, chosen at the muster.
export const TALISMANS = {
  none:      { label: 'No relic',        morale: 0,  atk: 1.0,  tough: 1.0,  regen: 0 },
  dord:      { label: 'Dord Fiann',      ga: 'war-horn of the Fianna', morale: 15, atk: 1.0, tough: 1.0, regen: 2 },
  gaebulg:   { label: 'Gáe Bulg',        ga: "Cú Chulainn's spear",    morale: 5,  atk: 1.25, tough: 1.0, regen: 0 },
  bratachsi: { label: 'Bratach na Sí',   ga: 'banner of the sí',       morale: 10, atk: 1.0, tough: 1.2, regen: 1 },
};
export const TALISMAN_KEYS = ['none', 'dord', 'gaebulg', 'bratachsi'];

// Matchup multiplier: attacker type vs defender type. Default 1. Gods crush
// mortals and shrug off their blows; only a god (or, dearly, champions) answers one.
const M = {
  dia: { ceithern: 3.0, galloglaigh: 3.0, curadh: 2.2, dia: 1.0 },
  curadh: { ceithern: 1.6, galloglaigh: 1.2, curadh: 1.0, dia: 0.8 },
  galloglaigh: { ceithern: 1.3, galloglaigh: 1.0, curadh: 0.8, dia: 0.3 },
  ceithern: { ceithern: 1.0, galloglaigh: 0.8, curadh: 0.5, dia: 0.4 },
};
export function matchup(attType, defType) {
  return (M[attType] && M[attType][defType]) || 1.0;
}

export const ROUT_MISNEACH = 20; // below this, a buíon breaks and flees
