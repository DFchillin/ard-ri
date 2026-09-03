// Placeable buildings. footprint is [width, height] in tiles. role drives the
// economy logic in game.js. icon/desc feed the build menu and inspect popup.
export const BUILDINGS = {
  roundhouse: { label: 'Dwelling', sprite: 'roundhouse', art: 'roundhouse', states: 4, icon: '🛖', footprint: [2, 2], cost: 20, role: 'dwelling', folk: 4,
    desc: 'A ráth — a round wattle-and-daub home. Draws folk when fed and watered.' },
  field: { label: 'Field', sprite: 'fields', art: 'field', states: 4, icon: '🌾', footprint: [2, 2], cost: 15, role: 'farm', produce: 'barley', rate: 5, load: 4,
    desc: 'Barley for bread and ale. Sends a grain-carrier to a nearby store.' },
  orchard: { label: 'Orchard', sprite: 'fields', art: 'orchard', states: 4, icon: '🍎', footprint: [2, 2], cost: 18, role: 'farm', produce: 'apples', rate: 5, load: 4, unlockLevel: 4,
    desc: 'An úllghort of apple-trees, grown from grafting-shoots won on your raids. A second harvest — its pickers run the fruit to a nearby store, like a field.' },
  granary: { label: 'Grain Store', sprite: 'grain_store', icon: '🏚️', footprint: [2, 2], cost: 18, role: 'granary',
    desc: 'Holds the harvest. Markets draw grain from here along the roads.' },
  sciobolmor: { label: 'Great Granary', sprite: 'grain_store', icon: '🏛️', footprint: [2, 2], cost: 26, role: 'granary', unlockLevel: 6,
    desc: 'A sciobol mór of dressed stone, learned from foreign masons. Holds the harvest against the longest winter or siege.' },
  market: { label: 'Market', sprite: 'market', art: 'market', states: 4, icon: '🏪', footprint: [2, 2], cost: 16, role: 'market',
    desc: 'Restocks from road-connected stores and feeds the dwellings on its route.' },
  aonach: { label: 'Fair-green', sprite: 'market', icon: '🎪', footprint: [2, 2], cost: 22, role: 'market', unlockLevel: 7,
    desc: 'An aonach — the great fair-green where the whole túath gathers to trade. Restocks from your stores and feeds the dwellings on its route.' },
  well: { label: 'Well', sprite: 'well', icon: '💧', footprint: [1, 1], cost: 8, role: 'well', upkeep: 2,
    desc: 'Clean water for the settlement. Its water-carrier is paid from your treasury.' },
  altar: { label: 'Shrine', sprite: 'altar', icon: '🗿', footprint: [1, 1], cost: 12, role: 'altar', upkeep: 3,
    desc: 'A standing-stone shrine to the old powers. Its druid is kept by your treasury, and a hero is far likelier to answer a túath that keeps one.' },
  homestead: { label: 'Leader’s Homestead', sprite: 'roundhouse', icon: '🐄', footprint: [3, 3], cost: 30, role: 'homestead', unique: true, folk: 2, unlockLevel: 2,
    desc: 'Your own ráth and the seat of your rule. Cattle — the true measure of a king — graze the open pasture around it and multiply. Wealth to send in tribute or trade for what Ériu cannot make, and the prize a raider drives off.' },
};

// Build-menu categories (Zeus-style tabs). 'road' and 'cros' are special items.
export const CATEGORIES = [
  { id: 'infra', icon: '🛣️', label: 'Roads', items: ['road', 'cros'] },
  { id: 'homes', icon: '🏠', label: 'Homes', items: ['homestead', 'roundhouse'] },
  { id: 'farming', icon: '🌾', label: 'Farming', items: ['field', 'orchard', 'granary', 'sciobolmor'] },
  { id: 'services', icon: '🏛️', label: 'Services', items: ['market', 'aonach', 'well', 'altar'] },
];

export const ROAD_ITEM = { key: 'road', label: 'Road', icon: '🛣️', cost: 0,
  desc: 'A tóchar worthy of Midir. Walkers travel only on roads — drag to lay Deaglán’s path between two points.' };
export const CROS_ITEM = { key: 'cros', label: 'Cros', icon: '✝️', cost: 0,
  desc: 'A wayside cros. Folk skirt it rather than cross — tap a road to steer your walkers onto the routes you choose. It never strands an errand.' };
// Special (non-building) placeables, looked up by key alongside BUILDINGS.
export const SPECIAL_ITEMS = { road: ROAD_ITEM, cros: CROS_ITEM };
