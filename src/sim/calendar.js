// The wheel of the year. Four Celtic seasons, each a festival at its start.
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const SEASONS = {
  earrach:    { en: 'Spring', ga: 'Earrach',    icon: '🌱',
    light: { sky: 0xd6f0cf, ground: 0x40602f, sun: 0xdfffcf, intensity: 1.0 } },
  samhradh:   { en: 'Summer', ga: 'Samhradh',   icon: '☀️',
    light: { sky: 0xfff2cf, ground: 0x4c5a2c, sun: 0xffe6a8, intensity: 1.2 } },
  fomhar:     { en: 'Autumn', ga: 'Fómhar',     icon: '🍂',
    light: { sky: 0xffe2ac, ground: 0x5a4a2a, sun: 0xffc46b, intensity: 1.05 } },
  geimhreadh: { en: 'Winter', ga: 'Geimhreadh', icon: '❄️',
    light: { sky: 0xcadcff, ground: 0x39434f, sun: 0xcfe0ff, intensity: 0.8 } },
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
