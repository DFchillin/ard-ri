// The Tuatha Dé Danann. Build a sanctuary to a god, keep their favour with
// druid walkers and festivals, and they may manifest to walk the settlement —
// to bless, warn, trade, or challenge. `boon` text is from the concept sheet;
// `domain` is the gameplay hook the favour system will read.
export const GODS = {
  dagda:     { name: 'The Dagda',        title: 'The Good God',                 domain: 'abundance',   boon: 'Blesses your people with wisdom and abundance.' },
  brigid:    { name: 'Brígid',           title: 'Poetry, Healing & Smithcraft', domain: 'craft',       boon: 'Inspires crafting, healing and fertile harvests.' },
  lugh:      { name: 'Lugh',             title: 'Skill & Light',                domain: 'skill',       boon: 'Shares knowledge and enhances skills.' },
  morrigan:  { name: 'The Morrígan',     title: 'War & Fate',                   domain: 'war',         boon: 'Brings warnings, omens or challenges.', dual: true },
  manannan:  { name: 'Manannán Mac Lir', title: 'Lord of the Sea',              domain: 'trade',       boon: 'Brings trade, safe seas and hidden treasures.' },
  tailtiu:   { name: 'Tailtiu',          title: 'Land & Prosperity',            domain: 'prosperity',  boon: 'Blesses the land and increases prosperity.' },
  cernunnos: { name: 'Cernunnos',        title: 'Lord of the Wild',             domain: 'nature',      boon: 'Protects wildlife and restores balance.' },
  nuada:     { name: 'Nuada',            title: 'King of the Tuatha Dé',        domain: 'leadership',  boon: 'Grants leadership, justice and protection.' },
  aengus:    { name: 'Aengus',           title: 'Youth, Love & Inspiration',    domain: 'inspiration', boon: 'Inspires love, joy and creativity.' },
};

// The wheel of the year → the god honoured at each festival.
export const FESTIVAL_PATRON = {
  Imbolc: 'brigid',
  Bealtaine: 'cernunnos',
  Lughnasadh: 'lugh',
  Samhain: 'morrigan',
};
