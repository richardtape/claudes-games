// Big Eater: every number the engine plays with. Pure data, no DOM.

export const DT = 1 / 60;
export const DROP_R = 1500; // radius of the drop on the slide (world units)
export const SPAWN_R = 540; // germs arrive this far from the cell (just outside the view)
export const SEGMENT = 25; // seconds per announced wave
export const BOSS_TIMES = [150, 300, 450];
export const MAX_ENEMIES = 400;
export const WEAPON_SLOTS = 5;
export const ORGANELLE_SLOTS = 5;
export const BURST_NEED = 36;

// gram: 'p' Gram-positive (violet), 'n' Gram-negative (pink), 'v' virus, 's' spore/other
export const GERMS = {
  coccus: { name: 'Staph', latin: 'Staphylococcus', gram: 'p', hp: 9, spd: 52, r: 9, dmg: 6, xp: 1, ai: 'seek', group: 3, from: 0, note: 'Round, slow and never alone.' },
  bacillus: { name: 'E. coli', latin: 'Escherichia coli', gram: 'n', hp: 13, spd: 66, r: 10, dmg: 7, xp: 1, ai: 'seek', group: 2, from: 25, note: 'A pink rod in a hurry.' },
  vibrio: { name: 'Vibrio', latin: 'Vibrio cholerae', gram: 'n', hp: 7, spd: 58, r: 8, dmg: 6, xp: 1, ai: 'dart', group: 3, from: 50, note: 'Rests, then darts. Watch the comma.' },
  diplo: { name: 'Diplococcus', latin: 'Streptococcus pneumoniae', gram: 'p', hp: 20, spd: 48, r: 12, dmg: 8, xp: 2, ai: 'seek', group: 2, split: 'coccus', from: 75, note: 'Break one and you have two.' },
  virus: { name: 'Phage', latin: 'Bacteriophage T4', gram: 'v', hp: 4, spd: 104, r: 6, dmg: 4, xp: 1, ai: 'seek', group: 9, from: 100, note: 'Tiny, fast, and in a crowd.' },
  spiro: { name: 'Spirochete', latin: 'Borrelia', gram: 'n', hp: 18, spd: 84, r: 9, dmg: 8, xp: 2, ai: 'weave', group: 2, from: 125, note: 'A corkscrew that never swims straight.' },
  clost: { name: 'Clostridium', latin: 'Clostridium', gram: 'p', hp: 30, spd: 46, r: 11, dmg: 8, xp: 3, ai: 'shoot', group: 1, from: 175, note: 'Keeps its distance and lobs toxin.' },
  yeast: { name: 'Yeast', latin: 'Candida', gram: 'p', hp: 60, spd: 36, r: 16, dmg: 10, xp: 5, ai: 'bud', group: 1, from: 200, note: 'Big, slow, and it buds.' },
  bud: { name: 'Bud', latin: '', gram: 'p', hp: 8, spd: 70, r: 7, dmg: 5, xp: 1, ai: 'seek', group: 1, from: 1e9, hidden: true },
  spore: { name: 'Spore', latin: 'Bacillus anthracis', gram: 's', hp: 110, spd: 30, r: 13, dmg: 12, xp: 6, ai: 'seek', group: 2, from: 250, note: 'A green shell that shrugs things off.' },
  biofilm: { name: 'The Biofilm', latin: 'Pseudomonas, mostly', gram: 'n', hp: 1100, spd: 26, r: 62, dmg: 16, xp: 60, ai: 'biofilm', boss: true, from: 1e9, note: 'A city of slime. It sheds citizens.' },
  waterbear: { name: 'The Water Bear', latin: 'Tardigrada', gram: 's', hp: 2600, spd: 44, r: 46, dmg: 20, xp: 120, ai: 'charger', boss: true, from: 1e9, note: 'Not a germ. Not sorry. It charges.' },
  superbug: { name: 'The Superbug', latin: 'MRSA', gram: 'p', hp: 5200, spd: 34, r: 56, dmg: 22, xp: 300, ai: 'superbug', boss: true, from: 1e9, note: 'Changes its stain. Spits rings of toxin.' },
};
export const BOSSES = ['biofilm', 'waterbear', 'superbug'];
export const GRAM_NAME = { p: 'Gram-positive', n: 'Gram-negative', v: 'Virus', s: 'Spore' };

// Per-level stats are arrays indexed by level - 1 (six levels); `evo` replaces them all.
export const WEAPONS = {
  antibody: {
    name: 'Antibodies', blurb: 'Homing Ys that tag a germ as edible.',
    cd: [1.0, 1.0, 0.95, 0.9, 0.85, 0.78], n: [2, 2, 3, 3, 4, 4], dmg: [6, 8, 9, 11, 12, 15],
    speed: 340, mark: 5, steps: ['', 'More damage', '+1 antibody', 'More damage', '+1 antibody', 'More damage, faster'],
    evo: { name: 'Memory Cells', with: 'receptor', blurb: 'Antibodies pass through three germs and the tag never fades.', cd: 0.55, n: 6, dmg: 17, pierce: 3, mark: 999 },
  },
  lysozyme: {
    name: 'Lysozyme', blurb: 'A spray of enzyme. Double on violet (Gram-positive).', bonus: 'p',
    cd: [1.25, 1.2, 1.1, 1.05, 0.95, 0.9], n: [4, 5, 5, 6, 7, 8], dmg: [6, 6, 8, 9, 10, 12], pierce: [1, 1, 1, 2, 2, 2],
    speed: 400, life: 0.62, spread: 0.55, steps: ['', '+1 droplet', 'More damage', '+1 droplet, pierces 2', '+1 droplet', '+1 droplet, more damage'],
    evo: { name: 'Enzyme Jet', with: 'ribosome', blurb: 'A near-constant jet that cuts through four germs.', cd: 0.3, n: 5, dmg: 13, pierce: 4 },
  },
  complement: {
    name: 'Complement', blurb: 'Pore-punching rings orbit you. Double on pink (Gram-negative).', bonus: 'n',
    n: [3, 3, 4, 4, 5, 6], dmg: [10, 12, 14, 16, 18, 21], orbit: [78, 82, 88, 94, 100, 108], spin: 2.7,
    steps: ['', 'More damage', '+1 ring', 'More damage, wider', '+1 ring', '+1 ring, more damage'],
    evo: { name: 'Attack Complex', with: 'golgi', blurb: 'A second, inner ring spins the other way.', n: 7, dmg: 26, orbit: 122, inner: 4 },
  },
  cytokine: {
    name: 'Cytokines', blurb: 'A pulse that shoves germs back and slows them.',
    cd: [4.4, 4.1, 3.8, 3.5, 3.2, 2.9], dmg: [11, 14, 18, 22, 27, 32], rmax: [150, 165, 180, 200, 220, 240], knock: 150,
    steps: ['', 'More damage, wider', 'Faster', 'More damage, wider', 'Faster', 'More damage, wider'],
    evo: { name: 'Cytokine Storm', with: 'mito', blurb: 'Pulses twice as often and each one pulls in every ATP on the slide.', cd: 1.5, dmg: 38, rmax: 300, vacuum: true },
  },
  net: {
    name: 'NETs', blurb: 'Sticky traps of DNA that slow and dissolve.',
    cd: [4.8, 4.5, 4.2, 3.9, 3.6, 3.3], n: [1, 1, 2, 2, 3, 3], zr: [62, 70, 70, 80, 80, 90], dps: [5, 6, 8, 9, 11, 13], dur: 3.6,
    steps: ['', 'Wider, stronger', '+1 net', 'Wider, stronger', '+1 net', 'Wider, stronger'],
    evo: { name: 'Dragnet', with: 'granule', blurb: 'Huge nets that drag germs to the middle.', cd: 2.8, n: 3, zr: 135, dps: 20, pull: 70 },
  },
  peroxide: {
    name: 'Peroxide', blurb: 'A bleaching wake behind you. Keep moving.',
    zr: [20, 22, 24, 26, 28, 31], dps: [8, 10, 13, 16, 19, 23], dur: [2.0, 2.3, 2.6, 3.0, 3.4, 3.8],
    steps: ['', 'Stronger, lasts longer', 'Stronger, wider', 'Stronger, lasts longer', 'Stronger, wider', 'Stronger, lasts longer'],
    evo: { name: 'Bleach Wake', with: 'pseudopod', blurb: 'The wake doubles in width and strength.', zr: 46, dps: 42, dur: 5 },
  },
  interferon: {
    name: 'Interferon', blurb: 'A signal that leaps from germ to germ. Double on viruses.', bonus: 'v',
    cd: [1.5, 1.45, 1.4, 1.3, 1.2, 1.1], n: [4, 5, 6, 7, 8, 9], dmg: [12, 14, 17, 20, 23, 27],
    steps: ['', '+1 leap', '+1 leap, more damage', '+1 leap', '+1 leap, more damage', '+1 leap, faster'],
    evo: { name: 'Cascade', with: 'lysosome', blurb: 'Sixteen leaps, and germs it kills burst on their neighbours.', cd: 0.8, n: 16, dmg: 34, pop: true },
  },
  fever: {
    name: 'Fever', blurb: 'Heat around you cooks whatever comes close.',
    zr: [82, 90, 98, 108, 118, 128], dps: [9, 12, 15, 18, 21, 25],
    steps: ['', 'Hotter, wider', 'Hotter, wider', 'Hotter, wider', 'Hotter, wider', 'Hotter, wider'],
    evo: { name: 'Hyperthermia', with: 'membrane', blurb: 'A furnace. Germs inside it crawl.', zr: 175, dps: 48, slow: true },
  },
};

export const ORGANELLES = {
  mito: { name: 'Mitochondria', max: 5, blurb: 'Weapons fire 8% faster.' },
  membrane: { name: 'Membrane', max: 5, blurb: '+20 health and faster healing.' },
  pseudopod: { name: 'Pseudopods', max: 5, blurb: 'Move 9% faster.' },
  receptor: { name: 'Receptors', max: 5, blurb: 'Collect ATP from 35% further.' },
  lysosome: { name: 'Lysosomes', max: 5, blurb: 'Engulf healthier germs; each gulp heals more.' },
  golgi: { name: 'Golgi', max: 5, blurb: 'Everything you make is 12% bigger.' },
  ribosome: { name: 'Ribosomes', max: 5, blurb: '+12% damage.' },
  granule: { name: 'Granules', max: 3, blurb: '+1 to every volley, ring and net.' },
};

export const CELLS = {
  macro: { name: 'Macrophage', nick: 'the big eater', weapon: 'antibody', hp: 100, spd: 150, blurb: 'Starts with Antibodies. Heals double from every gulp.', gulpHeal: 2, unlock: null },
  neutro: { name: 'Neutrophil', nick: 'first on the scene', weapon: 'net', hp: 75, spd: 176, blurb: 'Starts with NETs. Fast and fragile; the Burst charges a third faster.', burst: 0.67, unlock: 'Engulf or destroy the Biofilm' },
  eosino: { name: 'Eosinophil', nick: 'the bleacher', weapon: 'peroxide', hp: 90, spd: 158, blurb: 'Starts with Peroxide. Everything it makes is 20% bigger.', area: 1.2, unlock: 'Beat the Water Bear' },
  dendri: { name: 'Dendritic cell', nick: 'the messenger', weapon: 'interferon', hp: 85, spd: 150, blurb: 'Starts with Interferon. Every level offers four slides.', offers: 4, unlock: 'Clear a culture' },
};

export const STRAINS = ['1', '2', '3', '4', '5'];
export const strainMul = (s) => ({ hp: 1 + 0.4 * s, spd: 1 + 0.045 * s, rate: 1 + 0.14 * s, dmg: 1 + 0.15 * s });

/** ATP needed to go from `level` to the next. */
export const xpFor = (level) => Math.round(5 + level * 8 + level ** 2 * 1.1);

export const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
