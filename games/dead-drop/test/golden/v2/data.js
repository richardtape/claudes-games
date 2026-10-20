// Frozen copy of the Phase 2b-i rules (commit 086c23d). Never edit: Classic play is compared against it.
// Dead Drop content: the agent deck, the cities, the computer rivals and codenames.
// Rules live in engine.js; this file is plain data so the simulator can tune it.

export const TURNS = 6;
export const START_HAND = 4;
export const MAX_HAND = 7;
export const CAPACITY = 3;
export const TARGET = 10;

/** A table seats 2 to 4 players. Seats are lettered a–d in card uids; these are their default names. */
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;
export const SEAT_NAMES = ['Red', 'Teal', 'Cobalt', 'Plum'];

/**
 * Tunable rule switches (the simulator can patch these as `rules.<field>`).
 * lisbonTiebreak: when cities are level, the tie-break compares total power across cities.
 * 'out' leaves Lisbon out (lowest total wins there, so adding it rewards losing it);
 * 'invert' subtracts each seat's Lisbon total; 'all' is the old behaviour, kept for the A/B.
 * tokens: escalation tokens each player starts the match with (9 is effectively unlimited).
 * reel: strips of Microfilm that win the match outright (0 turns the Microfilm off).
 * film: who takes a Microfilm strip. 'comeback' (the rule): the holder of the film city takes one only if
 * they did not win the round, and a round that ends in folds never awards one. 'holder' (the spec's
 * original rule, kept as a sim switch): the holder always takes it, after a fold too.
 * rollover: 1 rolls a dead heat's stake and pot into the next round's pot; 0 lets nothing carry.
 * Tuned in tools/SIMLOG.md: tokens 3, the spec's default, meet every stake band once the rivals pace
 * them (B16–B22); reel 2, since under the comeback film a reel of 3 decided 3% of matches and a reel of
 * 2 decides about 21%, nearly all of them from behind on points (B20, Decision 12).
 */
export const RULES = { lisbonTiebreak: 'out', tokens: 3, reel: 2, film: 'comeback', rollover: 1 };

/**
 * How the computer rivals bet (the simulator can set these as stakes.<field>). value ≈ P(win) − P(lose)
 * for the round. escalate: value needed from turn 2 with tokens to spare; scarce: added for each token
 * short of one every other round left; roundPoints: the rounds left are counted as the leader's distance
 * to the target divided by roundPoints, so a lower value makes rivals hold their tokens longer; answer:
 * play on above this; bluffTurn: earliest bluff (a bluff also waits until no token is short);
 * lateFold, lateFoldChance: cutting losses on turns 5–6; filmWeight, filmDecisive: what the Microfilm
 * is worth when choosing a drop (decisive when any seat is one strip from the reel).
 * Tuned at the bots' own samples (tools/SIMLOG.md B11–B22; first written as escalate 0.45, scarce 0.3,
 * roundPoints 3, answer −0.6, bluffTurn 3, which escalated in 94% of rounds and folded 10% of answers):
 * - scarce 1 and roundPoints 1 pace the tokens (B15–B16). roundPoints 1 is deliberately low (real
 *   rounds average about 2.4 points): do not "correct" it, it is the pace. A rival holding all 3
 *   tokens keeps them until the leader has 4 points, spends its second from 6 and its third from 8
 *   (a scarce of 1 puts escalating all but out of reach while short), and bluffs keep the same pace
 *   (B22), so the early rounds see no rival escalations rather than only bluffs. The threshold alone
 *   cannot pace them: it only delays escalation to later turns (B14).
 * - escalate 0.1 (B22): with the pace, escalations bunch on turn 2 and the threshold barely matters;
 *   0.1 is the setting that met every band once bluffs kept the pace.
 * - answer −0.29 (B17–B22): sets folds in answer against the escalator's win rate (a fold in answer is
 *   the escalator's win).
 * - bluffTurn 2 (B18, B21): bluffs from turn 2 lower the escalator's win rate. Not 1: value
 *   escalations start on turn 2, so a rival's escalation on turn 1 would always be a bluff.
 */
export const STAKES = { escalate: 0.1, scarce: 1, roundPoints: 1, answer: -0.29, bluffTurn: 2, lateFold: -0.9, lateFoldChance: 0.45, filmWeight: 0.4, filmDecisive: 1.5 };

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
  { id: 'havana', name: 'Havana', rule: 'After turn 4, everyone here switches sides.', note: 'After the switch, a Getaway here can pull a defected rival agent into your hand: a turned asset.' },
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
