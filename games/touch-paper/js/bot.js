// A human-ish player for the simulator and the title demo.
//
//   const move = chooseMove(state, { skill: 0.7, rng });
//   // { kind: 'play', slot } | { kind: 'hand', k } | { kind: 'strike', pick, slow }
//
// It plans chains only through cards it can see (face up), like a person looking at the
// layout, and values a line by the volley it would make plus the cards it would turn over.
// Hand cards can join a line too, at a cost (each one spent is a strike you no longer have).
// Lower skill looks fewer cards ahead, ignores colour and shape, and fumbles now and then.
import { fits, isWild, layoutInfo, legalPlays, legalHandPlays, scoreChain, stepBetween, wraps, canSlow, has, hand } from './engine.js';

export let HAND_COST = 3;
export const setHandCost = (v) => (HAND_COST = v);

export function chooseMove(state, { skill = 0.7, rng = Math.random } = {}) {
  const plays = legalPlays(state);
  const handPlays = legalHandPlays(state);
  if (!plays.length && !handPlays.length) {
    const slow = canSlow(state) && state.volley.length >= 3 && skill > 0.3;
    return { kind: 'strike', slow, pick: pickFromHand(state, { skill, rng, slow }) };
  }
  const options = [...plays.map((slot) => ({ kind: 'play', slot })), ...handPlays.map((k) => ({ kind: 'hand', k }))];
  if (rng() < 0.1 * (1 - skill)) {
    const tableau = options.filter((o) => o.kind === 'play');
    const pool = tableau.length ? tableau : options;
    return pool[Math.floor(rng() * pool.length)];
  }
  const best = evaluate(state, options, { skill, rng });
  // Strike instead of spending the last hand cards on a short volley.
  if (best.option.kind === 'hand' && state.box.length <= 1) return { kind: 'strike', pick: 0 };
  return { ...best.option, value: best.value };
}

function evaluate(state, options, { skill, rng }) {
  const depth = Math.round(1 + skill * 11);
  const info = layoutInfo(state.layoutId);
  const wrap = wraps(state);
  const gone = state.slots.map((s) => s.gone);
  const up = state.slots.map((s) => s.up);
  const allUp = has(state, 'clearsky') || state.twists[state.act] === 'clear';
  const volley = state.volley.slice();
  const handCards = hand(state);
  const handUsed = handCards.map(() => false);
  const shapeAware = skill >= 0.6;
  let budget = 0;

  const value = (seq, reveals, spent) => {
    const len = volley.length + seq.length;
    const scoreTerm = shapeAware ? scoreChain(state, volley.concat(seq)) : (Math.min(len, 10) * (Math.min(len, 10) + 1)) / 2 + Math.max(0, len - 10) * 3;
    return scoreTerm + reveals * (3 + 3 * skill) + seq.length * 2 - spent * HAND_COST;
  };

  // Mark a tableau card gone; return the face-down cards it opened (and flip them on a clear night).
  const take = (i) => {
    gone[i] = true;
    const opened = [];
    let reveals = 0;
    for (let k = 0; k < gone.length; k++) {
      if (gone[k] || up[k]) continue;
      if (info.coveredBy[k].every((j) => gone[j])) {
        if (allUp) {
          up[k] = true;
          opened.push(k);
        } else reveals++;
      }
    }
    return { opened, reveals };
  };
  const untake = (i, opened) => {
    for (const k of opened) up[k] = false;
    gone[i] = false;
  };

  function dfs(fuse, seq, reveals, spent, d) {
    let best = value(seq, reveals, spent);
    if (d >= depth || --budget <= 0) return best;
    for (let i = 0; i < gone.length; i++) {
      if (gone[i] || !up[i] || !info.coveredBy[i].every((j) => gone[j])) continue;
      const card = state.slots[i].card;
      if (!fits(fuse, card, wrap)) continue;
      const t = take(i);
      seq.push({ c: card, s: stepBetween(fuse, card, wrap) });
      const v = dfs(card, seq, reveals + t.reveals, spent, d + 1);
      seq.pop();
      untake(i, t.opened);
      if (v > best) best = v;
    }
    if (skill >= 0.4) {
      for (let k = 0; k < handCards.length; k++) {
        const card = handCards[k];
        if (handUsed[k] || isWild(card) || !fits(fuse, card, wrap)) continue;
        handUsed[k] = true;
        seq.push({ c: card, s: stepBetween(fuse, card, wrap) });
        const v = dfs(card, seq, reveals, spent + 1, d + 1);
        seq.pop();
        handUsed[k] = false;
        if (v > best) best = v;
      }
    }
    return best;
  }

  const last = volley.length ? volley[volley.length - 1].c : null;
  const firstStep = (card) => (last !== null && last === state.fuse ? stepBetween(last, card, wrap) : 0);
  let bestOption = options[0];
  let bestVal = -Infinity;
  for (const option of options) {
    budget = 600 + skill * 2500;
    let v;
    if (option.kind === 'play') {
      const card = state.slots[option.slot].card;
      const t = take(option.slot);
      v = dfs(card, [{ c: card, s: firstStep(card) }], t.reveals, 0, 1);
      untake(option.slot, t.opened);
    } else {
      const card = handCards[option.k];
      handUsed[option.k] = true;
      v = dfs(card, [{ c: card, s: firstStep(card) }], 0, 1, 1);
      handUsed[option.k] = false;
    }
    v += (rng() - 0.5) * 8 * (1 - skill);
    if (v > bestVal) {
      bestVal = v;
      bestOption = option;
    }
  }
  return { option: bestOption, value: bestVal };
}

/** Which hand card to strike: the one whose best visible line is worth most. */
export function pickFromHand(state, { skill = 0.7, rng = Math.random, slow = false } = {}) {
  const cards = hand(state);
  if (cards.length <= 1 || rng() > 0.3 + skill) return 0;
  let best = 0;
  let bestVal = -Infinity;
  for (let k = 0; k < cards.length; k++) {
    const rest = state.box.slice();
    rest.splice(k, 1);
    const trial = { ...state, fuse: cards[k], box: rest, volley: slow ? state.volley : [], phase: 'play' };
    const options = legalPlays(trial).map((slot) => ({ kind: 'play', slot }));
    let v = isWild(cards[k]) ? 30 : -20;
    if (options.length) v = evaluate(trial, options, { skill: Math.min(skill, 0.8), rng: () => 0.5 }).value;
    v += (rng() - 0.5) * 6 * (1 - skill);
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

/** Perk preference for the simulator: skilled bots pick the stronger chemistry. */
export const PERK_RANK = [
  'sparklers',
  'crackle',
  'starmine',
  'blackpowder',
  'slowmatch',
  'clearsky',
  'willowmould',
  'peonymould',
  'sparebox',
  'showman',
  'strontium',
  'sodium',
  'barium',
  'copper',
];

export function choosePerkFor(state, { skill = 0.7, rng = Math.random } = {}) {
  if (rng() > skill) return state.offers[Math.floor(rng() * state.offers.length)];
  return state.offers.slice().sort((a, b) => PERK_RANK.indexOf(a) - PERK_RANK.indexOf(b))[0];
}
