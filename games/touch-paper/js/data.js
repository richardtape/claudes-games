// Static data for Touch Paper: suits, layouts, named shells, chemistry (perks), conditions.

export const SUITS = [
  { id: 'hearts', colour: 'red', salt: 'Strontium', name: 'red' },
  { id: 'diamonds', colour: 'gold', salt: 'Sodium', name: 'gold' },
  { id: 'clubs', colour: 'green', salt: 'Barium', name: 'green' },
  { id: 'spades', colour: 'blue', salt: 'Copper', name: 'blue' },
];

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Layouts are drawn in half-card units: each character is half a card wide and each line is
 * half a card tall, and an `x` marks a card's top-left corner. A card covers the cards in the
 * line above it that it overlaps (one line up, at most one character to either side).
 */
export const LAYOUTS = [
  {
    id: 'bonfire',
    name: 'The Bonfire',
    art: [
      '   x x x x',
      '  x x x x x',
      ' x x x x x x',
      'x x x x x x x',
    ],
  },
  {
    id: 'fence',
    name: 'The Fence',
    art: [
      'x   x   x   x',
      'x x x x x x x',
      ' x x x x x x',
      'x x x x x x x',
      ' x       x',
    ],
  },
  {
    id: 'rockets',
    name: 'Twin Rockets',
    art: [
      '  x       x',
      ' x x     x x',
      'x x x   x x x',
      ' x x x x x x',
      'x x x x x x x',
    ],
  },
  {
    id: 'wheel',
    name: 'The Catherine Wheel',
    art: [
      '   x x x x',
      '  x x   x x',
      ' x x     x x',
      'x x x x x x x',
      ' x x x x x x',
    ],
  },
  {
    id: 'finale',
    name: 'Grand Finale',
    art: [
      ' x    x    x',
      'x x  x x  x x',
      ' x x x x x x',
      'x x x x x x x',
      ' x x x x x x',
    ],
  },
];

export const ACT_TIMES = ['7:00', '7:30', '8:00', '8:30', '9:00'];

/**
 * Named shells. Families: only the highest member of a family found in a volley counts.
 * `bonus` adds to the volley's lift (which starts at 1). The order here is the Pattern
 * Book's order.
 */
export const SHELLS = [
  { id: 'peony', name: 'Peony', family: 'colour', bonus: 1, rule: 'Three shells of one colour.' },
  { id: 'palm', name: 'Palm', family: 'rise', bonus: 1, rule: 'Four shells rising in a row, like 5 6 7 8.' },
  { id: 'willow', name: 'Willow', family: 'fall', bonus: 1, rule: 'Four shells falling in a row, like 9 8 7 6.' },
  { id: 'strobe', name: 'Strobe', family: 'strobe', bonus: 1, rule: 'Four shells zigzagging: up, down, up (or down, up, down).' },
  { id: 'brocade', name: 'Brocade', family: 'brocade', bonus: 1, rule: 'Turn the corner between King and Ace.' },
  { id: 'crossette', name: 'Crossette', family: 'crossette', bonus: 1, rule: 'All four colours in one volley.' },
  { id: 'ring', name: 'Ring', family: 'ring', bonus: 2, rule: 'Five shells or more that end on the rank they began.' },
  { id: 'comet', name: 'Comet', family: 'length', bonus: 1, rule: 'A volley of six shells.' },
  { id: 'chrysanthemum', name: 'Chrysanthemum', family: 'colour', bonus: 2, rule: 'Five shells of one colour.' },
  { id: 'tourbillion', name: 'Tourbillion', family: 'rise', bonus: 2, rule: 'Six shells rising in a row.' },
  { id: 'waterfall', name: 'Waterfall', family: 'fall', bonus: 2, rule: 'Six shells falling in a row.' },
  { id: 'kamuro', name: 'Kamuro', family: 'length', bonus: 3, rule: 'Fill the rack: ten shells in one volley.' },
];
export const SHELL = Object.fromEntries(SHELLS.map((s) => [s.id, s]));

/** Chemistry from the shed between acts: pick one of three. */
export const PERKS = [
  { id: 'strontium', name: 'Strontium salts', text: 'Red shells score 2 more.', suit: 0 },
  { id: 'sodium', name: 'Sodium salts', text: 'Gold shells score 2 more.', suit: 1 },
  { id: 'barium', name: 'Barium salts', text: 'Green shells score 2 more.', suit: 2 },
  { id: 'copper', name: 'Copper salts', text: 'Blue shells score 2 more.', suit: 3 },
  { id: 'sparklers', name: 'Sparklers', text: 'Two sparklers go in the box each act. Any card can follow a sparkler.' },
  { id: 'slowmatch', name: 'Slow match', text: 'Once an act, strike a new card without lighting the volley.' },
  { id: 'clearsky', name: 'Clear sky', text: 'Covered cards lie face up, so you can plan ahead.' },
  { id: 'crackle', name: 'Crackle', text: 'From the seventh shell on, every shell scores double.' },
  { id: 'starmine', name: 'Star mine', text: 'Every shell scores 1 more.' },
  { id: 'blackpowder', name: 'Black powder', text: 'Volleys of four shells or more get +1 lift.' },
  { id: 'peonymould', name: 'Peony moulds', text: 'Peonies and Chrysanthemums give +1 more lift.' },
  { id: 'willowmould', name: 'Willow moulds', text: 'Willows, Waterfalls, Palms and Tourbillions give +1 more lift.' },
  { id: 'showman', name: 'Showman', text: 'Finale rockets score double.' },
  { id: 'sparebox', name: 'Spare box', text: 'Three extra cards in the box each act.' },
];
export const PERK = Object.fromEntries(PERKS.map((p) => [p.id, p]));

/** Conditions announced for acts 2 to 5. */
export const TWISTS = [
  { id: 'wind', name: 'A stiff wind', text: 'Kings and Aces don’t join tonight.' },
  { id: 'drizzle', name: 'Drizzle', text: 'Four cards in the box are too damp to light.' },
  { id: 'damp', name: 'Damp shells', text: 'One colour’s shells score nothing (they still keep the chain going).' },
  { id: 'gusty', name: 'Gusts', text: 'Volleys of one or two shells fizzle out and score nothing.' },
  { id: 'clear', name: 'A clear night', text: 'The whole layout lies face up.' },
  { id: 'crowd', name: 'A big crowd', text: 'The crowd wants more, but every volley gets +1 lift.' },
];
export const TWIST = Object.fromEntries(TWISTS.map((t) => [t.id, t]));
