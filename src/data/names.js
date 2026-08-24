// Gaelic given names. A unit keeps its name for life. Grow this over time.
export const NAMES = [
  'Deaglán', 'Cormac', 'Niamh', 'Aoife', 'Oisín', 'Tadhg', 'Ciarán', 'Saoirse',
  'Bríd', 'Fionn', 'Rónán', 'Éabha', 'Cillian', 'Aoibhinn', 'Diarmuid', 'Gráinne',
  'Lorcán', 'Sadhbh', 'Eoin', 'Méabh', 'Conchobhar', 'Órlaith', 'Cathal', 'Nuala',
  'Ruairí', 'Sorcha', 'Fiachra', 'Étaín', 'Colm', 'Muireann',
];

export function randomName() {
  return NAMES[(Math.random() * NAMES.length) | 0];
}
