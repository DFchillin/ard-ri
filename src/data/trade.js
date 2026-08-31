// An Domhan Mór — the wider world. Cattle is Ériu's coin abroad: send it to
// foreign merchants for what the island cannot make, or take it by raiding.
// Those goods let you host a hero or god, who then musters with your war-band.
export const GOODS = {
  wine:   { label: 'Wine',        ga: 'fíon',      icon: '🍷', price: 6,  from: 'the vineyards of Gaul', desc: 'For the feasting-hall that draws a hero to your side.' },
  iron:   { label: 'Fine Iron',   ga: 'iarann',    icon: '⚔️', price: 8,  from: 'the smiths of Britain', desc: 'Sword-steel finer than any bog-iron.' },
  salt:   { label: 'Salt',        ga: 'salann',    icon: '🧂', price: 5,  from: 'the salt-roads', desc: 'To keep the winter meat — and honour the old gods.' },
  gold:   { label: 'Gold',        ga: 'ór',        icon: '🪙', price: 12, from: 'the goldsmiths of the south', desc: 'Torcs and offerings fit for the Túatha Dé.' },
  marble: { label: 'Marble',      ga: 'marmar',    icon: '🏛️', price: 16, from: 'the quarries of Rome', desc: 'White stone for a champion’s hall — a wonder in a land of wattle.' },
};

// What it takes to host each hero or god so they will answer your muster.
export const HOSTING = {
  curadh:     { req: { iron: 1 },            title: 'a hall of fine arms' },
  cuchulainn: { req: { marble: 2, wine: 1 }, title: 'a champion’s marble hall and a feast' },
  fionn:      { req: { wine: 2, salt: 1 },   title: 'a Fian feast that never runs dry' },
  morrigan:   { req: { iron: 2, gold: 1 },   title: 'weapons and gold for the war-goddess' },
  dagda:      { req: { gold: 2, salt: 1 },   title: 'gold and salt for the Good God’s cauldron' },
};

export const HOST_ORDER = ['curadh', 'cuchulainn', 'fionn', 'morrigan', 'dagda'];

// Can the given goods bag meet a requirement?
export function canHost(goods, key) {
  const r = HOSTING[key]; if (!r) return false;
  return Object.entries(r.req).every(([g, n]) => (goods[g] || 0) >= n);
}
export function reqText(key) {
  const r = HOSTING[key]; if (!r) return '';
  return Object.entries(r.req).map(([g, n]) => `${GOODS[g].icon}${n}`).join(' ');
}
