// Dead Drop content: the agent deck, the cities, the computer rivals and codenames.
// Rules live in engine.js; this file is plain data so the simulator can tune it.

export const TURNS = 6;
export const START_HAND = 4;
export const MAX_HAND = 7;
export const CAPACITY = 3;
export const TARGET = 10;

/**
 * Every player gets one of each. `flip` tricks fire once when the card is revealed;
 * the others are ongoing and handled by powerOf() in the engine.
 */
export const AGENTS = [
  { id: 'heavy', name: 'Heavy', power: 6, text: 'No tricks. Just big.' },
  { id: 'sleeper', name: 'Sleeper', power: 4, faceDown: true, text: 'Drops face down. Revealed when the round ends.' },
  { id: 'veteran', name: 'Veteran', power: 3, text: '+3 while it’s your only agent here.' },
  { id: 'double', name: 'Double Agent', power: 3, flip: true, text: 'Flip: moves to the city your rival just dropped in.' },
  { id: 'jammer', name: 'Jammer', power: 3, text: 'Rival agents here have no tricks.' },
  { id: 'handler', name: 'Handler', power: 2, text: 'Your other agents here get +1.' },
  { id: 'mole', name: 'Mole', power: 2, text: 'Rival agents here get −1.' },
  { id: 'getaway', name: 'Getaway', power: 2, flip: true, text: 'Flip: your weakest other agent here goes back to your hand.' },
  { id: 'lookout', name: 'Lookout', power: 1, flip: true, text: 'Flip: draw a card.' },
  { id: 'assassin', name: 'Assassin', power: 1, flip: true, text: 'Flip: takes out the strongest face-up rival agent here.' },
  { id: 'tripwire', name: 'Tripwire', power: 0, faceDown: true, text: 'Drops face down. Takes out the next rival agent to arrive.' },
  { id: 'impostor', name: 'Impostor', power: 0, flip: true, text: 'Flip: becomes a copy of your rival’s drop this turn.' },
];
export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
export const DECK = AGENTS.map((a) => a.id);

export const CITIES = [
  { id: 'lisbon', name: 'Lisbon', rule: 'Lowest total wins here.' },
  { id: 'vienna', name: 'Vienna', rule: 'Agents drop here face down, with no tricks.' },
  { id: 'istanbul', name: 'Istanbul', rule: 'The first agent to arrive gets +3.' },
  { id: 'berlin', name: 'Berlin', rule: 'Room for only two agents a side.' },
  { id: 'havana', name: 'Havana', rule: 'After turn 4, everyone here switches sides.' },
  { id: 'monaco', name: 'Monaco', rule: 'Win here for +1 point, whatever else happens.' },
  { id: 'hongkong', name: 'Hong Kong', rule: 'Drop an agent here and draw a card.' },
  { id: 'helsinki', name: 'Helsinki', rule: 'Closes after turn 3.' },
  { id: 'moscow', name: 'Moscow', rule: 'Agents here can’t be taken out or moved.' },
  { id: 'venice', name: 'Venice', rule: 'Boats only on turns 1, 3 and 5.' },
  { id: 'tangier', name: 'Tangier', rule: 'When the round ends, the strongest agent here is taken out.' },
];
export const CITY = Object.fromEntries(CITIES.map((c) => [c.id, c]));

/**
 * The computer ladder. `samples` is Monte Carlo playouts per candidate drop (skill);
 * `noise` blurs its estimates; `bluff` is the chance of escalating on a weak hand;
 * `nerve` shifts its fold/escalate thresholds (positive = braver).
 */
export const RIVALS = [
  { id: 'wren', name: 'Agent Wren', blurb: 'Fresh from training. Plays it by the book.', samples: 6, noise: 0.35, bluff: 0, nerve: -0.1 },
  { id: 'magpie', name: 'The Magpie', blurb: 'Grabs whatever glitters. Escalates on a whim.', samples: 12, noise: 0.25, bluff: 0.25, nerve: 0.15 },
  { id: 'heron', name: 'Mr Heron', blurb: 'Patient. Folds early, strikes late.', samples: 24, noise: 0.15, bluff: 0.05, nerve: -0.05 },
  { id: 'countess', name: 'The Countess', blurb: 'Bluffs with a smile. Never blinks first.', samples: 40, noise: 0.08, bluff: 0.3, nerve: 0.1 },
  { id: 'control', name: 'Control', blurb: 'Nobody has seen Control. Control has seen you.', samples: 80, noise: 0.02, bluff: 0.15, nerve: 0 },
];

/** Codenames players pick from (no free text goes over the wire). */
export const CODENAMES = [
  'Agent Fox', 'Agent Lynx', 'Agent Otter', 'Agent Raven', 'Agent Viper', 'Agent Moth', 'Agent Falcon',
  'Agent Stoat', 'Agent Badger', 'Agent Ibis', 'Agent Hare', 'Agent Pike', 'Agent Swift', 'Agent Gecko',
  'Agent Marten', 'Agent Owl', 'Agent Crane', 'Agent Jackal', 'Agent Puma', 'Agent Kite',
];
