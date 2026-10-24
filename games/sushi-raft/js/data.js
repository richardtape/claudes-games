// Everything Sushi Raft is made of: ingredients, dishes, customers, kitchens, nights, the
// morning market and the twists. Pure data (plus a few lookups); the rules live in engine.js.

/** How a raw ingredient is prepared: where, what it becomes, and (pan/fryer) what it burns to. */
export const PREP = {
  salmon: { at: 'board', to: 'salmon_s' },
  tuna: { at: 'board', to: 'tuna_s' },
  cucumber: { at: 'board', to: 'cucumber_s' },
  avocado: { at: 'board', to: 'avocado_s' },
  egg: { at: 'pan', to: 'egg_c', burn: 'egg_b' },
  shrimp: { at: 'fryer', to: 'shrimp_f', burn: 'shrimp_b' },
};

/** What can sit on a plate. */
export const PARTS = ['rice', 'nori', 'salmon_s', 'tuna_s', 'cucumber_s', 'avocado_s', 'egg_c', 'shrimp_f'];

export const ING_NAMES = {
  rice: 'rice',
  nori: 'nori',
  salmon: 'salmon',
  salmon_s: 'sliced salmon',
  tuna: 'tuna',
  tuna_s: 'sliced tuna',
  cucumber: 'cucumber',
  cucumber_s: 'sliced cucumber',
  avocado: 'avocado',
  avocado_s: 'sliced avocado',
  egg: 'egg',
  egg_c: 'tamagoyaki',
  egg_b: 'burnt egg',
  shrimp: 'shrimp',
  shrimp_f: 'tempura shrimp',
  shrimp_b: 'burnt shrimp',
};

/** Plate rims by price, as at a real kaiten-zushi bar. */
export const RIMS = { 2: '#5fa8d3', 3: '#6cb35f', 4: '#efb23a', 6: '#de4b3a', 8: '#8a5cc2' };

/** The menu, in the order it unlocks. `parts` is the exact set of things on the plate. */
export const DISHES = {
  salmon_nigiri: { name: 'Salmon nigiri', parts: ['rice', 'salmon_s'], price: 2, cost: 0 },
  tuna_nigiri: { name: 'Tuna nigiri', parts: ['rice', 'tuna_s'], price: 3, cost: 10 },
  kappa_maki: { name: 'Cucumber maki', parts: ['rice', 'nori', 'cucumber_s'], price: 3, cost: 12 },
  tamago: { name: 'Tamago', parts: ['rice', 'nori', 'egg_c'], price: 4, cost: 16, needs: ['kappa_maki'] },
  ebi: { name: 'Ebi tempura', parts: ['rice', 'shrimp_f'], price: 4, cost: 18 },
  salmon_roll: { name: 'Salmon avocado roll', parts: ['rice', 'nori', 'salmon_s', 'avocado_s'], price: 6, cost: 22, needs: ['kappa_maki'] },
  dragon_roll: { name: 'Dragon roll', parts: ['rice', 'nori', 'shrimp_f', 'avocado_s', 'tuna_s'], price: 8, cost: 28, needs: ['ebi', 'salmon_roll', 'tuna_nigiri'] },
};
export const DISH_ORDER = Object.keys(DISHES);

export const rimOf = (dish) => RIMS[DISHES[dish].price] || '#ffffff';

/**
 * Customers. `patience` multiplies the base wait, `orders` is [min, max] dishes, `fav` earns a heart
 * in the Regulars book, `weight` is how often they come.
 */
export const SPECIES = {
  seal: { name: 'Seal', patience: 1.0, orders: [1, 2], fav: 'salmon_nigiri', weight: 5, note: 'Claps for salmon.' },
  cat: { name: 'Harbour cat', patience: 0.95, orders: [1, 2], fav: 'tuna_nigiri', weight: 4, note: 'Has opinions about tuna.' },
  turtle: { name: 'Sea turtle', patience: 1.5, orders: [1, 1], fav: 'kappa_maki', weight: 3, note: 'Will wait. And wait.' },
  penguin: { name: 'Penguin', patience: 1.0, orders: [1, 2], fav: 'ebi', weight: 4, note: 'Never comes alone on school trips.' },
  crab: { name: 'Crab', patience: 0.9, orders: [1, 2], fav: 'tamago', weight: 4, note: 'Claps with both claws.' },
  octopus: { name: 'Octopus', patience: 1.15, orders: [2, 3], fav: 'salmon_roll', weight: 3, note: 'Eight arms, three plates.' },
  puffer: { name: 'Pufferfish', patience: 0.7, orders: [1, 2], fav: 'dragon_roll', weight: 3, note: 'Puffs up when kept waiting.' },
  walrus: { name: 'Walrus', patience: 1.7, orders: [4, 5], fav: 'dragon_roll', weight: 0, vip: true, note: 'Comes for the festival. Tips like royalty.' },
};
export const SPECIES_ORDER = Object.keys(SPECIES);

/**
 * Kitchens: 6 columns by 6 rows; row 0 runs along the canal. Letters:
 *   .  floor        C counter     D dock        R rice cooker   P plates     X bin
 *   B  board        b second board (an upgrade; a counter until bought)
 *   p  pan          f fryer
 *   S salmon  T tuna  U cucumber  N nori  E egg  H shrimp  A avocado   (crates)
 * A crate, pan or fryer only appears once a dish on the menu needs it; until then it is a counter.
 */
export const LAYOUTS = {
  open: {
    name: 'The open kitchen',
    rows: ['SCDXRP', '......', 'B.CC.T', 'b.CC.U', '......', 'NEpfHA'],
    start: [
      [1, 1],
      [4, 1],
    ],
  },
  split: {
    name: 'The pass',
    rows: ['SBCDRP', '..C...', 'T.C.XA', 'b.C..p', '..C...', 'NUCEHf'],
    start: [
      [1, 1],
      [4, 1],
    ],
  },
};
export const COLS = 6;
export const ROWS = 6;

export const CRATES = { S: 'salmon', T: 'tuna', U: 'cucumber', N: 'nori', E: 'egg', H: 'shrimp', A: 'avocado' };

/** The canal: rafts go right along the near lane, round, and left along the far lane past the seats. */
export const CANAL = {
  near: -0.45, // y of the lane beside the kitchen (tile units; the kitchen is 0..6)
  far: -1.35, // y of the lane beside the seats
  left: 0,
  right: 6,
  rafts: 12,
  speed: 1.45, // tiles a second: about 10 s a lap
  grab: 0.22, // how close a raft must be to a seat for its customer to reach it
  laps: 2, // a plate nobody takes goes soggy after this many laps
};
export const SEATS = 6;

/** Seconds, unless said otherwise. */
export const TIMES = {
  open: 150, // arrivals stop
  lastOrders: 50, // then everyone still here leaves as the lights go down
  walk: 4.6, // otter tiles a second
  slice: 1.5,
  pan: 4,
  panBurn: 7,
  fryer: 5,
  fryerBurn: 7,
  rice: 5,
  riceServings: 5,
  busy: 0.16, // a quick pick-up or put-down
  sit: 1.2,
  eat: 2.2,
  pay: 0.8,
  leave: 1.0,
  patience: 40,
  patiencePerDish: 15,
  patienceBack: 0.35, // share of patience a served plate gives back
  lineup: 3, // customers who will wait for a seat
  rush: 12,
  lanterns: 5,
};

export const TIP_RATE = 0.5;
export const QUEUE_MAX = 4;

/** The week. Rent is taken from the purse after each night. */
export const NIGHTS = [
  { name: 'Monday', guests: 8, rent: 17, maxOrder: 2, patience: 1.5 },
  { name: 'Tuesday', guests: 10, rent: 33, maxOrder: 2, patience: 1.25 },
  { name: 'Wednesday', guests: 12, rent: 52, maxOrder: 3, patience: 1.1 },
  { name: 'Thursday', guests: 13, rent: 81, maxOrder: 3, patience: 1.0 },
  { name: 'Friday', guests: 15, rent: 119, maxOrder: 3, patience: 1.0, festival: true },
];

/** How often a dish is ordered: the simple ones stay common as the menu grows. */
export const orderWeight = (parts) => ({ 2: 1, 3: 0.8, 4: 0.55, 5: 0.4 })[parts] ?? 0.4;

/** Harder summers once you've survived one. */
export const summerRent = (summer) => 1 + 0.12 * (summer - 1);
export const summerPatience = (summer) => Math.max(0.6, 1 - 0.05 * (summer - 1));

/** Twists: one is announced at the market for each of Tuesday to Thursday. Friday is the festival. */
export const TWISTS = {
  gulls: { name: 'Gull night', text: 'Seagulls swoop for plates on the rafts. Tap a gull to shoo it.' },
  split: { name: 'The pass', text: 'The kitchen is split down the middle. Each otter keeps to their side: pass things over the counter.' },
  penguins: { name: 'School trip', text: 'Penguins arrive in threes, and all want the same thing.' },
  slowtide: { name: 'Slack tide', text: 'The canal runs slow tonight. Plates take longer to arrive.' },
  smallrice: { name: 'Old rice cooker', text: 'The spare cooker only holds three servings.' },
  puffers: { name: 'Puffer parade', text: 'Pufferfish everywhere, and they are not patient.' },
};
export const FESTIVAL = { name: 'Lantern Festival', text: 'A crowd, gulls, and the walrus orders five plates. He tips like royalty.' };

/** The morning market's upgrades. Dishes are offered too (DISHES[].cost). */
export const UPGRADES = {
  board2: { name: 'Second board', cost: 14, text: 'Another cutting board in the kitchen.' },
  knife: { name: 'Sharp knife', cost: 16, text: 'Slicing takes a third less time.' },
  cooker: { name: 'Big rice cooker', cost: 12, text: 'Nine servings a batch, and it cooks faster.' },
  sandals: { name: 'Flipper sandals', cost: 18, text: 'Both otters scamper a quarter faster.' },
  cat: { name: 'Lucky cat', cost: 20, text: 'A beckoning cat by the door: customers wait 20% longer.' },
  jar: { name: 'Tip jar', cost: 14, text: 'Tips are half as big again.' },
  lanterns: { name: 'Paper lanterns', cost: 14, text: 'Lantern Rush lights after four plates, not five.' },
  timer: { name: 'Kitchen timer', cost: 10, text: 'The pan and fryer take twice as long to burn.' },
};

export const OTTERS = [
  { id: 'pebble', name: 'Pebble', color: '#24335a', light: '#8fa3d6' },
  { id: 'kelp', name: 'Kelp', color: '#3f7d4a', light: '#9fd08a' },
];
