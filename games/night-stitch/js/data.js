// Tuning tables for Night Stitch. Distances are engine units (hoop radius 500), times seconds.
// Set from tools/sim.mjs runs; see DESIGN.md "Tuning notes".

export const HOOP_R = 500;
export const HOUR_LEN = 40;
export const THREAD_LEN = 900; // starting thread length
export const NEEDLE_SPEED = 1300; // pointer-follow cap, units/s
export const KEY_SPEED = 640; // keyboard steering speed
export const SEG = 6; // a new thread point every SEG units of travel
export const CLOSE_TOL = 14; // needle this close to old thread closes the loop
export const CLOSE_GAP = 110; // ...but only thread at least this far back along the thread
export const MIN_LOOP_AREA = 2600; // smaller loops are ignored (jitter)
export const LOSS_AREA = 28000; // total open-hole area that tears the sampler
export const DAWN_BONUS = 50; // points per % of fabric left at dawn
export const DARN_POINTS = 5;
export const GILDED_CHANCE = 0.012;
export const GILDED_MULT = 5;
export const BOSS_DECAY = 7; // seconds without a loop before a boss loses one tally

// Embroidery floss, cycled per successful loop. Gold is kept for score text.
export const FLOSS = ['#b5362f', '#33478c', '#6c8d5c', '#7a3a62', '#c9822b', '#2f7c7a', '#8e4a2b', '#5a4a8a'];

/**
 * Species. size = half wingspan (catch radius is the centre point), speed = cruise speed,
 * eat = hole radius growth per second, holeMax = hole radius when it moves on,
 * startle = needle distance that makes a settled moth take off, flee = flying moths steer
 * away from the needle inside this radius, fly = seconds of flight before settling.
 * Colours drive both the live moth and its embroidered version.
 */
export const SPECIES = {
  clothes: {
    name: 'Common clothes moth', latin: 'Tineola bisselliella', points: 10,
    size: 13, speed: 90, eat: 4.2, holeMax: 19, startle: 55, flee: 0, fly: [2.5, 4.5],
    fore: '#c9a560', hind: '#b89a6a', body: '#8d6f3e', accent: '#e8cf8f', pattern: 'plain', wing: 'narrow',
    note: 'The one that started it all. Small, golden and always hungry.',
  },
  house: {
    name: 'Brown house moth', latin: 'Hofmannophila pseudospretella', points: 15,
    size: 16, speed: 105, eat: 3.8, holeMax: 23, startle: 65, flee: 0, fly: [3, 5],
    fore: '#7d5a33', hind: '#a88a62', body: '#5a3f22', accent: '#2e1f12', pattern: 'spots', wing: 'narrow',
    note: 'Bronze with dark freckles. Lands in the corners.',
  },
  tiger: {
    name: 'Garden tiger', latin: 'Arctia caja', points: 25,
    size: 22, speed: 150, eat: 3.4, holeMax: 25, startle: 80, flee: 70, fly: [3.5, 5.5],
    fore: '#efe3c8', hind: '#e2622b', body: '#7a3020', accent: '#4b2e1c', pattern: 'tiger', wing: 'broad',
    note: 'Cream and chocolate on top, flame underneath. Darts when you get close.',
  },
  rosy: {
    name: 'Rosy maple moth', latin: 'Dryocampa rubicunda', points: 30,
    size: 18, speed: 115, eat: 4.4, holeMax: 21, startle: 115, flee: 60, fly: [3, 5],
    fore: '#e98aa6', hind: '#f4dc6a', body: '#f2d45c', accent: '#f6e7a0', pattern: 'band', wing: 'broad',
    note: 'Pink and lemon and very skittish. Give it a wide berth.',
  },
  luna: {
    name: 'Luna moth', latin: 'Actias luna', points: 40,
    size: 26, speed: 80, eat: 0, holeMax: 0, startle: 0, flee: 0, fly: [99, 99], lands: false,
    fore: '#b9dca0', hind: '#a6d08c', body: '#f0efe0', accent: '#d9a441', pattern: 'eyes', wing: 'tails',
    note: 'Never eats. Adults have no mouths. It just circles the lamp, worth a lot.',
  },
  hawk: {
    name: 'Elephant hawk-moth', latin: 'Deilephila elpenor', points: 50,
    size: 20, speed: 220, eat: 4.8, holeMax: 21, startle: 90, flee: 110, fly: [2.5, 4],
    fore: '#8a8a4a', hind: '#d9577f', body: '#c95a7c', accent: '#e58aa6', pattern: 'stripe', wing: 'swept',
    note: 'Olive and hot pink, and the fastest thing in the room.',
  },
  atlas: {
    name: 'Atlas moth', latin: 'Attacus atlas', points: 400, boss: true, hp: 3,
    size: 58, speed: 55, eat: 0, holeMax: 0, startle: 0, flee: 0, fly: [99, 99], lands: false,
    gustEvery: 4.6, gustWindup: 1.1, gustRadius: 190,
    fore: '#b4532a', hind: '#9b4424', body: '#6f2c16', accent: '#f3e6cf', pattern: 'windows', wing: 'atlas',
    note: 'Wingspan of a dinner plate. Each wingbeat snaps the thread near it. Three loops to stitch.',
  },
  deathshead: {
    name: "Death's-head hawkmoth", latin: 'Acherontia atropos', points: 600, boss: true, hp: 3,
    size: 34, speed: 175, eat: 0, holeMax: 0, startle: 0, flee: 150, fly: [99, 99], lands: false, aura: 1.35,
    fore: '#3a2f2a', hind: '#d9a32c', body: '#d9a32c', accent: '#efe0b0', pattern: 'skull', wing: 'hawkbig',
    note: 'It squeaks. While it is here every other moth eats faster. Three loops, and it runs.',
  },
  beetle: {
    name: 'Varied carpet beetle', latin: 'Anthrenus verbasci', points: 20, crawler: true,
    size: 10, speed: 36, eat: 0, holeMax: 0, startle: 0, flee: 0, fly: [0, 0], lands: false,
    fore: '#2b2420', hind: '#2b2420', body: '#2b2420', accent: '#e9dcc0', pattern: 'mottle', wing: 'beetle',
    note: 'Crawls straight across and bites through any thread in its way.',
  },
};

export const KINDS = Object.keys(SPECIES);
/** Order shown in the specimen case. */
export const CASE_ORDER = ['clothes', 'house', 'beetle', 'tiger', 'rosy', 'luna', 'hawk', 'atlas', 'deathshead'];

/**
 * The night, one row per hour. every = seconds between arrivals, cap = most moths in the
 * room at once, beetleEvery = seconds between beetles (0 = none), boss = arrives at the start
 * of the hour, swarm = this many clothes moths arrive together at the start, hunger = eating
 * speed multiplier (moths get hungrier toward dawn).
 */
export const HOURS = [
  { label: '10 PM', every: 2.0, cap: 8, beetleEvery: 0, mix: { clothes: 1 } },
  { label: '11 PM', every: 1.6, cap: 11, beetleEvery: 16, mix: { clothes: 3, house: 2 }, intro: ['house', 'beetle'] },
  { label: 'Midnight', every: 1.5, cap: 13, beetleEvery: 14, mix: { clothes: 3, house: 2 }, boss: 'atlas' },
  { label: '1 AM', every: 1.25, cap: 16, beetleEvery: 12, mix: { clothes: 3, house: 2, tiger: 1, rosy: 1 }, intro: ['tiger', 'rosy'] },
  { label: '2 AM', every: 1.0, cap: 20, beetleEvery: 10, mix: { clothes: 3, house: 2, tiger: 1, rosy: 1 }, swarm: 22 },
  { label: '3 AM', every: 0.8, cap: 24, beetleEvery: 8, hunger: 1.1, mix: { clothes: 3, house: 2, tiger: 2, rosy: 1, luna: 1, hawk: 1 }, intro: ['luna', 'hawk'] },
  { label: '4 AM', every: 0.7, cap: 28, beetleEvery: 7, hunger: 1.15, mix: { clothes: 3, house: 2, tiger: 2, rosy: 1, luna: 1, hawk: 1 }, boss: 'deathshead' },
  { label: '5 AM', every: 0.5, cap: 36, beetleEvery: 6, hunger: 1.3, mix: { clothes: 4, house: 3, tiger: 2, rosy: 2, luna: 1, hawk: 2 } },
];
export const DAWN_LABEL = '6 AM';

/** Sewing notions offered at each chime. max = how many times one can be taken. */
export const NOTIONS = [
  { id: 'spool', name: 'Spool of cotton', text: 'Thread 20% longer.', max: 4 },
  { id: 'needle', name: 'Sharp needle', text: 'Needle moves 15% faster.', max: 3 },
  { id: 'lavender', name: 'Lavender sachet', text: 'Moths eat 20% slower.', max: 3 },
  { id: 'beeswax', name: 'Beeswax', text: 'Each hour, your thread shrugs off one more snap.', max: 3 },
  { id: 'thimble', name: 'Thimble', text: 'Settled moths let the needle 25% closer.', max: 2 },
  { id: 'gold', name: 'Gold thread', text: 'Loops of 4 or more moths score 50% more.', max: 3 },
  { id: 'cedar', name: 'Cedar block', text: 'Beetles crawl 30% slower.', max: 2 },
  { id: 'mushroom', name: 'Darning mushroom', text: 'Every loop that catches a moth also darns the biggest open hole.', max: 1 },
  { id: 'wick', name: 'Trimmed wick', text: 'Moths drift toward the lamp and bunch up.', max: 2 },
  { id: 'pins', name: 'Pincushion', text: 'Every moth is worth 5 more points.', max: 3 },
];
