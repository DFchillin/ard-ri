// Placeable buildings. footprint is [width, height] in tiles. role drives the
// economy logic in game.js. icon/desc feed the build menu and inspect popup.
export const BUILDINGS = {
  roundhouse: { label: 'Dwelling', sprite: 'roundhouse', icon: '🛖', footprint: [2, 2], cost: 20, role: 'dwelling', folk: 4,
    desc: 'A ráth — a round wattle-and-daub home. Draws folk when fed and watered.' },
  field: { label: 'Field', sprite: 'fields', icon: '🌾', footprint: [2, 2], cost: 15, role: 'farm', produce: 'barley', rate: 5, load: 4,
    desc: 'Barley for bread and ale. Sends a grain-carrier to a nearby store.' },
  granary: { label: 'Grain Store', sprite: 'grain_store', icon: '🏚️', footprint: [2, 2], cost: 18, role: 'granary',
    desc: 'Holds the harvest. Markets draw grain from here along the roads.' },
  market: { label: 'Market', sprite: 'market', icon: '🏪', footprint: [2, 2], cost: 16, role: 'market',
    desc: 'Restocks from road-connected stores and feeds the dwellings on its route.' },
  well: { label: 'Well', sprite: 'well', icon: '💧', footprint: [1, 1], cost: 8, role: 'well', upkeep: 2,
    desc: 'Clean water for the settlement. Its water-carrier is paid from your treasury.' },
  altar: { label: 'Altar', sprite: 'altar', icon: '🗿', footprint: [1, 1], cost: 12, role: 'altar', upkeep: 3,
    desc: 'A standing-stone shrine. Its druid is kept by your treasury.' },
};

// Build-menu categories (Zeus-style tabs). 'road' and 'cros' are special items.
export const CATEGORIES = [
  { id: 'infra', icon: '🛣️', label: 'Roads', items: ['road', 'cros'] },
  { id: 'homes', icon: '🏠', label: 'Homes', items: ['roundhouse'] },
  { id: 'farming', icon: '🌾', label: 'Farming', items: ['field', 'granary'] },
  { id: 'services', icon: '🏛️', label: 'Services', items: ['market', 'well', 'altar'] },
];

export const ROAD_ITEM = { key: 'road', label: 'Road', icon: '🛣️', cost: 0,
  desc: 'A tóchar worthy of Midir. Walkers travel only on roads — drag to lay Deaglán’s path between two points.' };
export const CROS_ITEM = { key: 'cros', label: 'Cros', icon: '✝️', cost: 0,
  desc: 'A wayside cros. Folk turn back rather than cross it — tap a road to pen your walkers onto the routes you choose.' };
// Special (non-building) placeables, looked up by key alongside BUILDINGS.
export const SPECIAL_ITEMS = { road: ROAD_ITEM, cros: CROS_ITEM };
