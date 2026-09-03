// Gaelic given names, kept by gender so a name matches its sprite. A unit keeps
// its name for life. Grow these over time.
export const MALE_NAMES = [
  'Deaglán', 'Cormac', 'Oisín', 'Tadhg', 'Ciarán', 'Fionn', 'Rónán', 'Cillian',
  'Diarmuid', 'Lorcán', 'Eoin', 'Conchobhar', 'Cathal', 'Ruairí', 'Fiachra', 'Colm',
];
export const FEMALE_NAMES = [
  'Niamh', 'Aoife', 'Saoirse', 'Bríd', 'Éabha', 'Aoibhinn', 'Gráinne', 'Sadhbh',
  'Méabh', 'Órlaith', 'Nuala', 'Sorcha', 'Étaín', 'Muireann',
];
// Kept for anything that still wants the whole bank.
export const NAMES = [...MALE_NAMES, ...FEMALE_NAMES];

// Pass female=true/false to match a sprite's gender; omit for a random pick.
export function randomName(female) {
  const list = female === undefined ? NAMES : (female ? FEMALE_NAMES : MALE_NAMES);
  return list[(Math.random() * list.length) | 0];
}
