// Placeable buildings. footprint is [width, height] in tiles. role drives the
// economy logic in game.js. sprite is the asset name under assets/buildings/.
export const BUILDINGS = {
  roundhouse: { label: 'Dwelling',    sprite: 'roundhouse', footprint: [2, 2], cost: 20, role: 'dwelling', folk: 4 },
  field:      { label: 'Field',       sprite: 'fields',     footprint: [3, 2], cost: 15, role: 'farm', produce: 'barley', rate: 5, load: 4 },
  granary:    { label: 'Grain Store', sprite: 'grain_store',footprint: [2, 2], cost: 18, role: 'granary' },
  market:     { label: 'Market',      sprite: 'market',     footprint: [2, 2], cost: 16, role: 'market' },
  well:       { label: 'Well',        sprite: 'well',       footprint: [1, 1], cost: 8,  role: 'well' },
  altar:      { label: 'Altar',       sprite: 'altar',      footprint: [1, 1], cost: 12, role: 'altar' },
};
