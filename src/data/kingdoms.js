// The over-kingdoms of Ériu, c.1150 — a stylised map (not to scale). Each is a
// translucent region over a parchment island; pick your home, and later raid a
// neighbour or strike further afield.
export const ISLAND = 'M 175 38 C 140 40 108 55 96 84 C 74 96 58 128 62 160 C 44 182 44 222 64 244 C 52 276 60 320 86 348 C 96 388 128 430 168 440 C 206 452 250 436 268 400 C 300 384 314 340 306 300 C 322 268 320 220 300 196 C 312 160 300 116 268 96 C 258 60 216 38 175 38 Z';

export const KINGDOMS = [
  { id: 'ailech',    en: 'Ailech',    ga: 'Cenél nEógain', color: '#d8c24a', pts: '150,55 205,52 216,112 150,120 120,90', label: [166, 90], seat: 'the north-west' },
  { id: 'ulaid',     en: 'Ulaid',     ga: 'the Ulstermen', color: '#e390a8', pts: '218,58 288,92 262,152 212,122', label: [246, 110], seat: 'the north-east' },
  { id: 'airgialla', en: 'Airgialla', ga: 'the hostage-givers', color: '#dfa262', pts: '150,122 220,130 212,174 150,168', label: [183, 150], seat: 'the middle north' },
  { id: 'breifne',   en: 'Bréifne',   ga: 'Uí Briúin', color: '#9d80c8', pts: '92,112 150,122 150,176 104,192 80,150', label: [116, 152], seat: 'the lakelands' },
  { id: 'connacht',  en: 'Connacht',  ga: 'Síl Muiredaig', color: '#7bbf68', pts: '56,150 106,156 114,276 70,292 46,216', label: [78, 218], seat: 'the west' },
  { id: 'mide',      en: 'Mide',      ga: 'the middle kingdom', color: '#6fc3ce', pts: '155,174 242,180 246,246 160,252', label: [200, 214], seat: 'the centre' },
  { id: 'laigin',    en: 'Laigin',    ga: 'the Leinstermen', color: '#90b566', pts: '246,182 302,210 286,340 236,328 248,252', label: [270, 268], seat: 'the east' },
  { id: 'tuadmumu',  en: 'Tuadmumu',  ga: 'Dál gCais · Thomond', color: '#6d8fce', pts: '112,280 186,272 198,346 118,358 92,314', label: [146, 316], seat: 'the lower Shannon' },
  { id: 'desmumu',   en: 'Desmumu',   ga: 'Eóganacht · Desmond', color: '#d16a58', pts: '100,362 234,348 216,430 122,442 84,400', label: [160, 398], seat: 'the far south' },
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
