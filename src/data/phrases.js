// Role labels and spoken lines, in Irish (ga) with English (en). Keyed by walker
// type. Grow mission by mission, unit by unit. Irish welcome to be refined.
export const ROLE_LABELS = {
  grain_carrier: { en: 'Farm Hand', ga: 'Oibrí Feirme' },
  market_trader: { en: 'Trader', ga: 'Ceannaí' },
  water_carrier: { en: 'Water Carrier', ga: 'Iompróir Uisce' },
  druid: { en: 'Druid', ga: 'Draoi' },
  villager: { en: 'Villager', ga: 'Áitritheoir' },
  hurler: { en: 'Hurler', ga: 'Iománaí' },
  risen: { en: 'Risen Dead', ga: 'Marbh Éirithe' },
};

// A by-name shown after the given name for personas that earn one — e.g. Michael ‘Hurler’.
export const NICKS = { hurler: 'Hurler' };

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
  hurler: [
    { ga: 'Choinnigh mé mo dhuine amuigh as an gcluiche inniu.', en: 'Marked my man out of the game today.' },
    { ga: 'Cúilín ón daichead a cúig — bhuail mé an sliotar go binn.', en: 'A point from the forty-five — struck the sliotar sweetly.' },
    { ga: 'Tharraing mé air den chéad iarraidh, díreach thar an trasnán.', en: 'Pulled on it first time — straight over the bar.' },
    { ga: 'Rug mé glan air faoin liathróid ag titim.', en: 'Caught it clean under the dropping ball.' },
    { ga: 'Camán im’ láimh is fód faoi mo bhróg — sin sonas.', en: 'A hurl in my hand and sod underfoot — that’s contentment.' },
  ],
  risen: [
    { ga: 'Is cuimhin liom na cosáin seo is na tithe — ach ní fios dom an cuimhin leo mise.', en: 'I remember these paths and these houses — but I do not know if they remember me.' },
    { ga: 'Shiúil mé an bóthar seo is mo chroí fós ag preabadh.', en: 'I walked this road when my heart still beat.' },
    { ga: 'Cé leis an teallach sin anois? Ba liomsa tráth é.', en: 'Whose hearth is that now? It was mine once.' },
    { ga: 'Ní fheiceann na beo mé, ach siúlaim abhaile mar sin féin.', en: 'The living do not see me, yet I walk home all the same.' },
    { ga: 'Ag Samhain amháin atá an fial tanaí go leor le filleadh.', en: 'Only at Samhain is the veil thin enough to return.' },
    { ga: 'Tá m’ainm dearmadta, ach ní dhearmadaim an áit seo.', en: 'My name is forgotten, but I do not forget this place.' },
  ],
};

export function personFor(type) {
  const role = ROLE_LABELS[type] || ROLE_LABELS.villager;
  const lines = PHRASES[type] || PHRASES.villager;
  const line = lines[(Math.random() * lines.length) | 0];
  return { roleEn: role.en, roleGa: role.ga, phraseGa: line.ga, phraseEn: line.en, nick: NICKS[type] || null };
}
