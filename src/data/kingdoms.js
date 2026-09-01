// The over-kingdoms of Ériu, c.1150 — a stylised map (not to scale). Each is a
// translucent region over a parchment island; pick your home, and later raid a
// neighbour or strike further afield.
export const ISLAND = 'M 175 38 C 140 40 108 55 96 84 C 74 96 58 128 62 160 C 44 182 44 222 64 244 C 52 276 60 320 86 348 C 96 388 128 430 168 440 C 206 452 250 436 268 400 C 300 384 314 340 306 300 C 322 268 320 220 300 196 C 312 160 300 116 268 96 C 258 60 216 38 175 38 Z';

// Clickable hotspots over the parchment map of Ériu (assets/ui/eire_map.jpg),
// in its 1000×800 coordinate space. label is the region centre, for markers.
export const KINGDOMS = [
  { id: 'ailech',    en: 'Ailech',    ga: 'Cenél nEógain', color: '#d8c24a', pts: '400,95 545,105 545,215 445,225 385,150', label: [462, 155], seat: 'Tír Chonaill, the north-west' },
  { id: 'ulaid',     en: 'Ulaid',     ga: 'the Ulstermen', color: '#e390a8', pts: '600,105 700,115 762,200 690,265 610,185', label: [672, 180], seat: 'Tír Eoghain, the north-east' },
  { id: 'airgialla', en: 'Airgialla', ga: 'the hostage-givers', color: '#dfa262', pts: '448,225 600,215 610,295 475,308 452,240', label: [525, 262], seat: 'the middle north' },
  { id: 'connacht',  en: 'Connacht',  ga: 'Síl Muiredaig', color: '#7bbf68', pts: '275,270 395,345 405,475 310,520 255,385', label: [332, 390], seat: 'the west' },
  { id: 'breifne',   en: 'Bréifne',   ga: 'Uí Briúin', color: '#9d80c8', pts: '405,300 490,290 505,395 425,430 385,360', label: [445, 355], seat: 'the lakelands' },
  { id: 'mide',      en: 'Mide',      ga: 'the middle kingdom', color: '#6fc3ce', pts: '505,305 610,298 648,430 515,458 495,345', label: [560, 378], seat: 'An Mhí, the centre' },
  { id: 'laigin',    en: 'Laigin',    ga: 'the Leinstermen', color: '#90b566', pts: '648,300 762,325 786,530 668,600 632,445', label: [706, 445], seat: 'Laighin, the east' },
  { id: 'tuadmumu',  en: 'Tuadmumu',  ga: 'Dál gCais · Thomond', color: '#6d8fce', pts: '405,435 505,458 525,565 435,598 360,510', label: [445, 512], seat: 'the lower Shannon' },
  { id: 'desmumu',   en: 'Desmumu',   ga: 'Eóganacht · Desmond', color: '#d16a58', pts: '315,560 525,565 668,605 555,722 360,700', label: [460, 640], seat: 'Munster, the far south' },
];

export const NEIGHBOURS = {
  ailech: ['ulaid', 'airgialla', 'breifne', 'connacht'],
  ulaid: ['ailech', 'airgialla'],
  airgialla: ['ailech', 'ulaid', 'breifne', 'mide'],
  breifne: ['ailech', 'airgialla', 'connacht', 'mide'],
  connacht: ['ailech', 'breifne', 'mide', 'tuadmumu'],
  mide: ['airgialla', 'breifne', 'connacht', 'laigin', 'tuadmumu'],
  laigin: ['mide', 'tuadmumu', 'desmumu'],
  tuadmumu: ['connacht', 'mide', 'laigin', 'desmumu'],
  desmumu: ['tuadmumu', 'laigin'],
};
export const kingdomById = (id) => KINGDOMS.find((k) => k.id === id);
