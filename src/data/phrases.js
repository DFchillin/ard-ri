// Role labels and spoken lines, in Irish (ga) with English (en). Keyed by walker
// type. Grow mission by mission, unit by unit. Irish welcome to be refined.
export const ROLE_LABELS = {
  grain_carrier: { en: 'Farm Hand', ga: 'Oibrí Feirme' },
  market_trader: { en: 'Trader', ga: 'Ceannaí' },
  water_carrier: { en: 'Water Carrier', ga: 'Iompróir Uisce' },
  druid: { en: 'Druid', ga: 'Draoi' },
  villager: { en: 'Villager', ga: 'Áitritheoir' },
};

export const PHRASES = {
  grain_carrier: [
    { ga: 'Táim ag triall ar mo mhuintir a bheathú.', en: "I'm on my way to feed my kin." },
    { ga: 'Beidh arán againn anocht.', en: "We'll have bread tonight." },
  ],
  market_trader: [
    { ga: 'Earraí úra le díol agam!', en: 'Fresh goods for sale!' },
    { ga: 'Margadh maith duit, a chara.', en: 'A good bargain for you, friend.' },
  ],
  water_carrier: [
    { ga: 'Uisce glan don bhaile.', en: 'Clean water for the settlement.' },
  ],
  druid: [
    { ga: 'Beannacht na ndéithe oraibh.', en: 'The blessing of the gods be upon you.' },
  ],
  villager: [
    { ga: 'Lá breá é, buíochas leis na déithe.', en: 'A fine day, thanks be to the gods.' },
  ],
};

export function personFor(type) {
  const role = ROLE_LABELS[type] || ROLE_LABELS.villager;
  const lines = PHRASES[type] || PHRASES.villager;
  const line = lines[(Math.random() * lines.length) | 0];
  return { roleEn: role.en, roleGa: role.ga, phraseGa: line.ga, phraseEn: line.en };
}
