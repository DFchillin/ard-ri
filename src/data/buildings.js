// Placeable buildings. footprint is [width, height] in tiles. sprite is the
// asset name under assets/buildings/. Costs are silver for now.
export const BUILDINGS = {
  rath:  { label: 'Ráth',  sprite: 'rath',  footprint: [2, 2], cost: 20, folk: 4 },
  well:  { label: 'Well',  sprite: 'well',  footprint: [1, 1], cost: 8,  folk: 0 },
  altar: { label: 'Altar', sprite: 'altar', footprint: [1, 1], cost: 12, folk: 0 },
};
