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
 * Every agent in the game: the Classic 12 first (in DECK's order), then the eight Phase 2b-ii agents.
 * A match deals one of each agent in its roster to every player (mirror decks). `flip` tricks fire once
 * when the card is revealed; the others are ongoing and handled by the engine. `text` fits on a card;
 * `note` (optional) states a rule reading plainly for Help. The new agents' powers are the spec's: on Mixed
 * rosters every agent wins 44–56% of the rounds it is played in (tools/SIMLOG.md B28 screen, B29 confirm).
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
  { id: 'wiretap', name: 'Wiretap', power: 1, flip: true, text: 'Flip: next turn, you hear which city your rival picks once they lock in.', note: 'You hear their city, not the agent. If they take it back, you lose it until they lock in again.' },
  { id: 'interrogator', name: 'Interrogator', power: 2, flip: true, text: 'Flip: every face-down rival agent here turns face up.', note: 'Revealed agents keep no tricks if they dropped face down. A revealed Tripwire is disarmed.' },
  { id: 'bodyguard', name: 'Bodyguard', power: 2, text: 'Your other agents here can’t be taken out or turned.', note: 'It stops Assassins, Tripwires, Tangier and Turncoats, not Havana’s or Glienicke Bridge’s change of sides. It doesn’t guard itself.' },
  { id: 'accomplice', name: 'Accomplice', power: 1, partner: true, text: 'Drop a partner with it: a second card from your hand, face down.', note: 'You can also drop it alone. The partner has no tricks, except a Tripwire or a Decoy.' },
  { id: 'turncoat', name: 'Turncoat', power: 0, flip: true, text: 'Flip: swaps sides with the weakest face-up rival agent here.', note: 'Ties go to the latest arrival. Nothing happens in Moscow. An agent turned before its own flip loses it.' },
  { id: 'courier', name: 'Courier', power: 2, flip: true, text: 'Flip: your strongest face-up agent in another city moves here.', note: 'The move counts as an arrival (Tokyo, Prague and Tripwires). Never out of Moscow.' },
  { id: 'blackmailer', name: 'Blackmailer', power: 2, flip: true, text: 'Flip: escalates for free if nobody has yet. No folding in answer.', note: 'No token is spent, and it uses up the round’s one escalation.' },
  { id: 'decoy', name: 'Decoy', power: 0, faceDown: true, text: 'Drops face down. Takes the hit for your next agent here to be taken out or turned.', note: 'Only while face down, and only once. It covers what a Bodyguard does: Assassins, Tripwires, Turncoats and Tangier (where it stays face down until Tangier strikes). It covers your Bodyguard too, and an agent a Bodyguard already guards never uses it up. Not against Havana or Glienicke Bridge.' },
];
export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
/** The Classic roster: the original 12 agents, in this order (a Classic match shuffles exactly this list). */
export const DECK = ['heavy', 'sleeper', 'veteran', 'double', 'jammer', 'handler', 'mole', 'getaway', 'lookout', 'assassin', 'tripwire', 'impostor'];

/**
 * Mixed rosters (js/roster.js): `size` agents drawn from a pool, always with `always`, and redrawn
 * while none of `takedowns` is in.
 */
export const ROSTER = { size: 12, always: ['heavy'], takedowns: ['assassin', 'tripwire'] };

/**
 * Every city: the Classic 11 first (CLASSIC_CITIES), then the nine Phase 2b-ii cities. A match deals three
 * a round from its pool. `rule` fits on a plate; `note` (optional) states a rule reading plainly for Help.
 * Knobs the rules read (and the simulator can patch): Rome's `factor`, Tokyo's `bonus`, Macau's `times`
 * (the stake scored once more per time) and Glienicke Bridge's `turn` (the crossing comes after it).
 * The knobs are as first written: every city's winner takes the round 55–80% of the time on Mixed
 * (tools/SIMLOG.md B28–B29).
 */
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
  { id: 'reykjavik', name: 'Reykjavik', rule: 'Most agents holds it, not most power.', note: 'A tie on agents goes to the higher total.' },
  { id: 'casablanca', name: 'Casablanca', rule: 'Drop here face up or face down: your choice.', note: 'Any agent, Sleepers included. A face-down drop has no tricks, except a Tripwire or a Decoy; face up, those two have none.' },
  { id: 'rome', name: 'Rome', factor: 2, rule: 'Each side’s strongest agent here counts double.' },
  { id: 'tokyo', name: 'Tokyo', bonus: 3, rule: 'The last agents to arrive here get +3.', note: 'Of the agents still here, every one that arrived on the latest turn gets it, a Courier and the agent it brings included. A card placed before the round began never does.' },
  { id: 'zurich', name: 'Zurich', rule: 'A round tied on cities goes to whoever holds Zurich.' },
  { id: 'macau', name: 'Macau', times: 1, rule: 'Win the round holding Macau to score the stake once more.', note: 'Only at the final flip, not after a fold.' },
  { id: 'glienicke', name: 'Glienicke Bridge', turn: 3, rule: 'After turn 3, each side’s strongest agent here crosses over.', note: 'It passes to the next player round the table (two players swap), face up. A Bodyguard or a Decoy doesn’t stop it.' },
  { id: 'prague', name: 'Prague', rule: 'Each arrival turns every other face-down agent here face up.', note: 'A newcomer keeps its face until the next arrival, but two arrivals on one turn reveal each other: an Accomplice and its partner count as two, so the partner turns face up. A Tripwire still springs first.' },
  { id: 'geneva', name: 'Geneva', rule: 'A tie here goes to whoever is behind in the match.', note: 'If both are level on points, nobody holds it. A 0–0 tie holds nothing either.' },
];
export const CITY = Object.fromEntries(CITIES.map((c) => [c.id, c]));
/** The Classic pool: the original 11 cities, in this order (a Classic round shuffles exactly this list). */
export const CLASSIC_CITIES = ['lisbon', 'vienna', 'istanbul', 'berlin', 'havana', 'monaco', 'hongkong', 'helsinki', 'moscow', 'venice', 'tangier'];

/**
 * The computer ladder. `samples` is Monte Carlo playouts per candidate drop (skill);
 * `noise` blurs its estimates; `bluff` is the chance of escalating on a weak hand;
 * `nerve` shifts its fold/escalate thresholds (positive = braver). `pack` is the new content the
 * rival brings to the ladder (and adds to your network when beaten); it is not a bot setting.
 */
export const RIVALS = [
  { id: 'wren', name: 'Agent Wren', blurb: 'Fresh from training. Plays it by the book.', samples: 6, noise: 0.35, bluff: 0, nerve: -0.1, pack: { agents: [], cities: [] } },
  { id: 'magpie', name: 'The Magpie', blurb: 'Grabs whatever glitters. Escalates on a whim.', samples: 12, noise: 0.25, bluff: 0.25, nerve: 0.15, pack: { agents: ['courier', 'blackmailer'], cities: ['tokyo', 'macau'] } },
  { id: 'heron', name: 'Mr Heron', blurb: 'Patient. Folds early, strikes late.', samples: 24, noise: 0.15, bluff: 0.05, nerve: -0.05, pack: { agents: ['bodyguard', 'decoy'], cities: ['reykjavik', 'zurich'] } },
  { id: 'countess', name: 'The Countess', blurb: 'Bluffs with a smile. Never blinks first.', samples: 40, noise: 0.08, bluff: 0.3, nerve: 0.1, pack: { agents: ['wiretap', 'accomplice'], cities: ['casablanca', 'rome'] } },
  { id: 'control', name: 'Control', blurb: 'Nobody has seen Control. Control has seen you.', samples: 80, noise: 0.02, bluff: 0.15, nerve: 0, pack: { agents: ['interrogator', 'turncoat'], cities: ['prague', 'glienicke', 'geneva'] } },
];

/**
 * Each ladder rival's announced rule twist (Decision 1). extra: a 13th agent of `kind` in the rival's deck;
 * placed: an agent of `kind` already in place, face down, every round; tap: a built-in Wiretap from turn
 * `from`; seen: the rival sees `count` card(s) of your hand each round. A match stores its twist with the
 * `seat` it belongs to.
 * Tuned on the ladder in tools/SIMLOG.md (B31–B33: a steady Heron against each rival's setup): Control's
 * `count` is 3 (first written as 1). At 1 and 2 Control was not measurably harder than the Countess, since
 * without twists the two play alike; 3 is the closest after two retunes (a 4.1-point step against a 4.2
 * margin) and one step past the plan's notches, so 2 is the fallback. The other three are as first
 * written: their steps hold (B31).
 */
export const TWISTS = { magpie: { id: 'extra', kind: 'lookout' }, heron: { id: 'placed', kind: 'sleeper' }, countess: { id: 'tap', from: 6 }, control: { id: 'seen', count: 3 } };

/** Codenames players pick from (no free text goes over the wire). */
export const CODENAMES = [
  'Agent Fox', 'Agent Lynx', 'Agent Otter', 'Agent Raven', 'Agent Viper', 'Agent Moth', 'Agent Falcon',
  'Agent Stoat', 'Agent Badger', 'Agent Ibis', 'Agent Hare', 'Agent Pike', 'Agent Swift', 'Agent Gecko',
  'Agent Marten', 'Agent Owl', 'Agent Crane', 'Agent Jackal', 'Agent Puma', 'Agent Kite',
];
