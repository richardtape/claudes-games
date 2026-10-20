// Dead Drop's story (Phase 2b-ii, spec 2.5): the winter of 1963, your station against rival services.
// Each round is an operation; its cable, the rivals' dossiers, twists and ticker remarks, and the
// epilogue. Pure: no DOM, no state. The twist lines read the match's twist (or TWISTS) and AGENT, so tuning changes the words.
import { createRng } from '../../../shared/rng.js';
import { AGENT, CITY, RIVALS, ROSTER, TURNS, TWISTS } from './data.js';

/** Operation names are an adjective and a noun: nothing silly, nothing violent, no agent, city, rival, seat or codename names. */
export const ADJECTIVES = [
  'Amber', 'Ashen', 'Azure', 'Bitter', 'Brass', 'Bronze', 'Copper', 'Crimson', 'Crystal', 'Distant',
  'Eastern', 'Emerald', 'Faded', 'Frozen', 'Gilded', 'Glass', 'Golden', 'Granite', 'Grey', 'Hollow',
  'Indigo', 'Ivory', 'Jade', 'Lunar', 'Marble', 'Midnight', 'Misty', 'Narrow', 'Northern', 'Pale',
  'Paper', 'Patient', 'Pewter', 'Quiet', 'Russet', 'Sable', 'Scarlet', 'Silent', 'Silver', 'Slate',
  'Southern', 'Steel', 'Still', 'Tawny', 'Velvet', 'Violet', 'Western', 'Winter',
];

export const NOUNS = [
  'Almanac', 'Archive', 'Atlas', 'Bishop', 'Carousel', 'Causeway', 'Chapel', 'Chestnut', 'Comet', 'Compass',
  'Ember', 'Equinox', 'Fjord', 'Glacier', 'Gramophone', 'Harbour', 'Hourglass', 'Juniper', 'Keystone', 'Lagoon',
  'Lantern', 'Ledger', 'Lighthouse', 'Locket', 'Lullaby', 'Meridian', 'Metronome', 'Minaret', 'Mirror', 'Monsoon',
  'Nocturne', 'Orchard', 'Overcoat', 'Overture', 'Pendulum', 'Samovar', 'Sextant', 'Snowfall', 'Solstice', 'Sonata',
  'Steeple', 'Sundial', 'Tapestry', 'Telegraph', 'Thistle', 'Umbrella', 'Viaduct', 'Willow',
];

/** What passes through the three dead drops: 28 characters at most, and never the word "film" (the Microfilm is its own thing). */
export const PACKAGES = [
  'Q-7 rocket plans', 'a defector', 'cipher keys', 'a diplomat’s letters', 'a one-time pad',
  'the Admiralty codebook', 'radar blueprints', 'a physicist’s notebook', 'a list of names', 'a tape recording',
  'aerial photographs', 'a rocket fuel formula', 'the embassy guest list', 'Swiss bank numbers', 'submarine sonar charts',
  'a forged passport', 'a minister’s diary', 'an enciphered telegram', 'the reactor drawings', 'a cufflink transmitter',
  'missile guidance tables', 'a hollow sixpence', 'a typewriter ribbon', 'the moon probe telemetry', 'a defecting ballerina',
  'a safe-deposit key', 'satellite tracking data',
];

/**
 * A round's operation: { name, package }, seeded by the match id and the round, so every player of a
 * match reads the same cable (and a resumed match the same names).
 */
export function operation(matchId, roundNo) {
  const rng = createRng(`op:${matchId}:${roundNo}`);
  const adjective = rng.pick(ADJECTIVES);
  const noun = rng.pick(NOUNS);
  return { name: `${adjective} ${noun}`, package: rng.pick(PACKAGES) };
}

const cityName = (id) => (CITY[id] ? CITY[id].name : String(id));

/**
 * The cable that opens a round, in capitals, signed by C. The film sentence is left out when the round
 * carries no Microfilm.
 */
export function cable(view) {
  const R = view.round;
  const { name, package: pkg } = operation(view.matchId, view.roundNo);
  const sites = R.cities.map((c) => cityName(c.id).toUpperCase());
  const film = Number.isInteger(R.film) && sites[R.film] ? ` THE FILM TRAVELS VIA ${sites[R.film]}.` : '';
  return `OPERATION ${name.toUpperCase()}. PACKAGE: ${pkg.toUpperCase()}. SITES: ${sites.join(', ')}.${film} — C`;
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ORDINALS = { 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth' };
const number = (n) => NUMBERS[n] ?? String(n);
const ordinal = (n) => ORDINALS[n] ?? `${n}th`;
const article = (word) => (/^[AEIOU]/i.test(word) ? 'an' : 'a');
/** "The Countess" mid-sentence. */
const inSentence = (name) => name.replace(/^The /, 'the ');

/**
 * The rival's announced rule twist in one sentence, from `twist` (the match's own, as a view carries it;
 * by default the rival's in TWISTS) and the agents' names; null for none.
 */
export function twistText(rivalId, twist = TWISTS[rivalId]) {
  const t = twist;
  const rival = RIVALS.find((r) => r.id === rivalId);
  if (!t || !rival) return null;
  const who = rival.name;
  const kind = AGENT[t.kind]?.name;
  switch (t.id) {
    case 'extra':
      return `${who} carries a ${ordinal(ROSTER.size + 1)} agent: an extra ${kind}.`;
    case 'placed':
      return `${who} starts every round with ${article(kind)} ${kind} already in place, face down.`;
    case 'tap': {
      const hears = `${inSentence(who)} hears which city you pick the moment you lock in.`;
      return t.from < TURNS ? `From turn ${t.from}, ${hears}` : `On the final turn ${hears}`;
    }
    case 'seen':
      return `Each round, ${inSentence(who)} sees ${t.count > 1 ? `${number(t.count)} cards` : 'one card'} in your hand.`;
    default:
      return null;
  }
}

/** Each rival's file: two or three sentences. Control's never says who Control is. */
export const DOSSIERS = {
  wren: 'Eleven weeks out of training school, top of the intake. Works strictly to the manual: punctual, tidy and honest to a fault. Assessed as no threat yet, but learning fast.',
  magpie: 'Takes whatever glitters and asks questions later. Goes loud on a whim and has dropped whole operations over a hunch. Always carries one agent more than the paperwork shows.',
  heron: 'Patient to the point of stillness. Aborts early without regret, then strikes in the final minutes. Has someone in place before you arrive, every time.',
  countess: 'Old money and new allegiances; nobody is certain which service pays for the pearls. Bluffs with a smile and has never been seen to blink first. On the last turn she always seems to know where you are going.',
  control: 'No photograph, no address, no known service. Every lead ends at a telephone that rings in an empty office. Control has read your file, and made notes in the margin.',
};

/**
 * One-line ticker remarks (60 characters at most): `start` after a round card, `escalate` and `fold`
 * after the rival's own, `won` and `lost` for the rival's round.
 */
export const REMARKS = {
  wren: {
    start: ['Agent Wren checks the manual one last time.', 'Agent Wren squares the papers on the desk.', 'Agent Wren synchronises watches. Twice.'],
    escalate: ['Agent Wren goes loud, exactly as the manual says.', 'Agent Wren takes a breath and raises the stakes.'],
    fold: ['Agent Wren aborts, strictly by the book.', 'Agent Wren files a careful report and withdraws.'],
    won: ['Agent Wren allows a small, proper smile.', 'Agent Wren notes the result in neat capitals.'],
    lost: ['Agent Wren makes a note: study this one.', 'Agent Wren nods. Lesson learned.'],
  },
  magpie: {
    start: ['The Magpie eyes your side of the table.', 'The Magpie turns a silver lighter over and over.', 'The Magpie hums something from the wireless.'],
    escalate: ['The Magpie goes loud. Why not?', 'The Magpie grins and doubles the stakes.'],
    fold: ['The Magpie shrugs and wanders off, whistling.', 'The Magpie loses interest. Something shinier, perhaps.'],
    won: ['The Magpie pockets the package with a wink.', 'The Magpie holds the prize up to the light.'],
    lost: ['The Magpie laughs it off. Plenty more where that came from.', 'The Magpie is already eyeing the next one.'],
  },
  heron: {
    start: ['Mr Heron folds his newspaper.', 'Mr Heron settles in to wait.', 'Mr Heron consults his pocket watch.'],
    escalate: ['Mr Heron raises the stakes without looking up.', 'Mr Heron has waited long enough.'],
    fold: ['Mr Heron withdraws. There will be other nights.', 'Mr Heron cuts his losses without a flicker.'],
    won: ['Mr Heron allows himself one sip of tea.', 'Mr Heron makes a small mark in his diary.'],
    lost: ['Mr Heron inclines his head. Well played.', 'Mr Heron returns to his newspaper.'],
  },
  countess: {
    start: ['The Countess smiles.', 'The Countess adjusts her pearls.', 'The Countess orders champagne for the table.'],
    escalate: ['The Countess goes loud, still smiling.', 'The Countess raises an eyebrow, and the stakes.'],
    fold: ['The Countess withdraws, gracious as ever.', 'The Countess lets this one go. For now.'],
    won: ['The Countess accepts the package like a compliment.', 'The Countess raises her glass to you.'],
    lost: ['The Countess applauds, softly.', 'The Countess smiles anyway. She always does.'],
  },
  control: {
    start: ['A cable from Control: PROCEED.', 'Control is watching.', 'Somewhere, a telephone rings once and stops.'],
    escalate: ['Control raises the stakes. No reason is given.', 'A one-word cable from Control: LOUDER.'],
    fold: ['Control aborts. The file is closed.', 'Control withdraws without comment.'],
    won: ['Control files the result. It was expected.', 'A cable from Control: AS FORESEEN.'],
    lost: ['Control makes a note in your file.', 'A cable from Control: NOTED.'],
  },
};

/** After Control is beaten: typed out line by line, like a cable. */
export const EPILOGUE = [
  'EYES ONLY. FOR THE HEAD OF STATION.',
  'CONTROL WAS NEVER A RIVAL. CONTROL WAS ME.',
  'THIS WINTER WAS A TEST. I SIGNED EVERY CABLE YOU READ.',
  'YOU PASSED. COME UP TO THE TOP FLOOR.',
  '— C',
];
