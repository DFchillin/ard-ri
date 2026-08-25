// The wheel of the year. Four Celtic seasons, each a festival at its start.
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const SEASONS = {
  earrach:    { en: 'Spring', ga: 'Earrach',    icon: '🌱',
    light: { sky: 0xe6f7df, ground: 0x5a7a44, sun: 0xeaffdc, intensity: 1.9 } },
  samhradh:   { en: 'Summer', ga: 'Samhradh',   icon: '☀️',
    light: { sky: 0xfff6db, ground: 0x66723a, sun: 0xffeeb8, intensity: 2.3 } },
  fomhar:     { en: 'Autumn', ga: 'Fómhar',     icon: '🍂',
    light: { sky: 0xffecc0, ground: 0x6e5a34, sun: 0xffd07e, intensity: 2.0 } },
  geimhreadh: { en: 'Winter', ga: 'Geimhreadh', icon: '❄️',
    light: { sky: 0xdce8ff, ground: 0x4a5461, sun: 0xdcebff, intensity: 1.55 } },
};

// month index (0=Jan) -> season key
export function seasonOfMonth(m) {
  if (m >= 1 && m <= 3) return 'earrach';     // Feb–Apr
  if (m >= 4 && m <= 6) return 'samhradh';    // May–Jul
  if (m >= 7 && m <= 9) return 'fomhar';      // Aug–Oct
  return 'geimhreadh';                        // Nov–Jan
}

// month index -> festival that opens it (day 1)
export const FESTIVALS = {
  1: { name: 'Imbolc', emoji: '🕯️', sub: 'Brigid’s feast — the first stirrings of spring.' },
  4: { name: 'Bealtaine', emoji: '🔥', sub: 'Fires of summer — cattle driven to the high pastures.' },
  7: { name: 'Lughnasadh', emoji: '🌾', sub: 'Lugh’s feast — the first harvest is gathered.' },
  10: { name: 'Samhain', emoji: '🎃', sub: 'The veil thins — winter comes, and the dead walk.' },
};
