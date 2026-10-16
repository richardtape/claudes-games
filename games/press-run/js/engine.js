// Press Run game rules. Pure state + functions, no DOM: the UI calls these and renders `run`.
// `run` is plain JSON (including the RNG position) so it can be saved and resumed at any point.
import { createRng } from '../../../shared/rng.js';
import {
  BASE_HAND, BASE_PRINTS, BASE_REDRAWS, DINGBATS, DINGBAT_BY_ID, DINGBAT_SLOTS, EDITIONS_TO_WIN,
  EDITORS, LENGTHS, LETTER_INK, MIN_WORD, RARITY_WEIGHT, REROLL_COST, ROUND_REWARD, START_MONEY,
  STARTING_CASE, SUPPLIES, UPGRADE_COST, VOWELS, lengthKey, roundTarget,
} from './data.js';

// ── randomness kept inside run.rngState ─────────────────────────────────────
const rng = createRng(0);
function rnd(run) {
  rng.state = run.rngState;
  const v = rng.next();
  run.rngState = rng.state;
  return v;
}
const rint = (run, n) => Math.floor(rnd(run) * n);
const rpick = (run, arr) => arr[rint(run, arr.length)];
function rshuffle(run, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(run, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function rweighted(run, items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let x = rnd(run) * total;
  for (const it of items) if ((x -= weightOf(it)) < 0) return it;
  return items[items.length - 1];
}

export function randomSeed() {
  const A = 'BCDFGHJKLMNPRSTVWXZ';
  const V = 'AEIOU';
  const r = (s) => s[Math.floor(Math.random() * s.length)];
  return `${r(A)}${r(V)}${r(A)}${r(V)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ── setup ───────────────────────────────────────────────────────────────────
export function createRun(seed = randomSeed()) {
  const run = {
    version: 1,
    seed,
    rngState: createRng(seed).state,
    edition: 1,
    roundIndex: 0,
    money: START_MONEY,
    endless: false,
    nextUid: 1,
    tiles: {},
    caseIds: [],
    levels: { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 },
    dingbats: [],
    editorQueue: [],
    editionEditor: null,
    phase: 'starter',
    starter: [],
    round: null,
    shop: null,
    stats: { words: [], lettersPrinted: [], wordsSeen: {}, best: null, total: 0 },
  };
  for (const [letter, n] of Object.entries(STARTING_CASE)) for (let i = 0; i < n; i++) addTile(run, letter);
  const commons = DINGBATS.filter((d) => d.rarity === 'common' && !d.passive && !d.money);
  run.starter = rshuffle(run, commons).slice(0, 3).map((d) => d.id);
  return run;
}

export function addTile(run, letter, ink = null) {
  const uid = run.nextUid++;
  run.tiles[uid] = { uid, letter, ink };
  run.caseIds.push(uid);
  return uid;
}

export function chooseStarter(run, id) {
  if (run.phase !== 'starter' || !run.starter.includes(id)) return false;
  run.dingbats.push(newDingbat(run, id));
  run.starter = [];
  startRound(run);
  return true;
}

function newDingbat(run, id) {
  return { uid: run.nextUid++, id, counter: 0 };
}

// ── rounds ──────────────────────────────────────────────────────────────────
export function activeDingbats(run) {
  const blot = run.round?.editor === 'blotter';
  return run.dingbats.filter((_, i) => !(blot && i === 0));
}

function passiveSum(run, key) {
  return activeDingbats(run).reduce((s, d) => s + (DINGBAT_BY_ID[d.id].passive?.[key] || 0), 0);
}

function nextEditor(run) {
  if (!run.editorQueue.length) run.editorQueue = rshuffle(run, EDITORS.map((e) => e.id));
  return run.editorQueue.shift();
}

export function startRound(run) {
  // The edition's editor is drawn at its first round so the player can see it coming.
  if (run.roundIndex === 0 || !run.editionEditor) run.editionEditor = nextEditor(run);
  const editor = run.roundIndex === 2 ? run.editionEditor : null;
  run.round = {
    target: roundTarget(run.edition, run.roundIndex),
    score: 0,
    editor,
    banned: null,
    handSize: 0,
    printsLeft: 0,
    redrawsLeft: 0,
    bag: [],
    hand: [],
    words: [],
    prevWord: null,
    missed: null,
    payout: null,
  };
  const r = run.round;
  if (editor === 'censor') {
    const counts = {};
    for (const id of run.caseIds) {
      const l = run.tiles[id].letter;
      if (l !== '?' && !VOWELS.has(l)) counts[l] = (counts[l] || 0) + 1;
    }
    const common = rshuffle(run, Object.keys(counts).filter((l) => counts[l] >= 2));
    r.banned = (common.length >= 2 ? common : Object.keys(counts)).slice(0, 2);
  }
  r.handSize = Math.max(4, BASE_HAND + passiveSum(run, 'hand') - (editor === 'cramped' ? 1 : 0));
  r.printsLeft = BASE_PRINTS + passiveSum(run, 'prints');
  r.redrawsLeft = BASE_REDRAWS + passiveSum(run, 'redraws');
  r.bag = rshuffle(run, run.caseIds);
  run.phase = 'round';
  draw(run);
}

const isVowelTile = (t) => VOWELS.has(t.letter);
const isConsonantTile = (t) => t.letter !== '?' && !VOWELS.has(t.letter);

/** Refill the hand. Gently fixes vowel droughts/floods among the newly drawn tiles only. */
function draw(run) {
  const r = run.round;
  const drawn = [];
  while (r.hand.length < r.handSize && r.bag.length) {
    const id = r.bag.pop();
    r.hand.push(id);
    drawn.push(id);
  }
  const T = (id) => run.tiles[id];
  const fix = (tooFew, wantInHand, giveBack) => {
    const swapOut = drawn.find((id) => r.hand.includes(id) && giveBack(T(id)));
    const bagIdx = r.bag.findIndex((id) => wantInHand(T(id)));
    if (swapOut === undefined || bagIdx < 0) return false;
    const incoming = r.bag.splice(bagIdx, 1)[0];
    r.hand[r.hand.indexOf(swapOut)] = incoming;
    drawn[drawn.indexOf(swapOut)] = incoming;
    r.bag.splice(rint(run, r.bag.length + 1), 0, swapOut);
    return true;
  };
  for (let guard = 0; guard < 4; guard++) {
    const v = r.hand.filter((id) => isVowelTile(T(id))).length;
    const min = r.hand.length >= 6 ? 2 : 1;
    if (v < min && fix(true, isVowelTile, isConsonantTile)) continue;
    if (v > r.hand.length - 3 && fix(false, isConsonantTile, isVowelTile)) continue;
    break;
  }
  return drawn;
}

export function handTiles(run) {
  return run.round.hand.map((id) => run.tiles[id]);
}

export function shuffleHand(run) {
  run.round.hand = rshuffle(run, run.round.hand);
}

// ── words ───────────────────────────────────────────────────────────────────
const BLANK_LETTERS = 'abcdefghijklmnoprstuvwxyz'.split(''); // no q

/** Why a word of `len` letters can't be printed right now, or null if it can. */
export function lengthProblem(run, len) {
  const editor = run.round?.editor;
  if (len < MIN_WORD) return `At least ${MIN_WORD} letters`;
  if (editor === 'minimalist' && len > 5) return 'The Minimalist allows 5 letters at most';
  if (editor === 'wordy' && len < 5) return 'The Wordsmith wants 5 letters or more';
  return null;
}

/**
 * Is this sequence of tiles a playable word? `assigned[i]` is the chosen letter for a blank
 * at position i (or undefined to let the game find one).
 * Returns { ok, word, letters, reason }.
 */
export function checkWord(run, uids, assigned, dict) {
  const tiles = uids.map((id) => run.tiles[id]);
  const letters = tiles.map((t, i) => (t.letter === '?' ? assigned?.[i] || null : t.letter));
  const len = letters.reduce((s, l) => s + (l ? l.length : 1), 0);
  const lenProblem = lengthProblem(run, len);
  if (lenProblem) return { ok: false, letters, reason: lenProblem };
  const open = letters.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
  if (!open.length) {
    const word = letters.join('');
    return dict.has(word) ? { ok: true, word, letters } : { ok: false, word, letters, reason: 'Not in the dictionary' };
  }
  if (open.length > 3) return { ok: false, letters, reason: 'Too many blanks' };
  const trial = letters.slice();
  const search = (k) => {
    if (k === open.length) return dict.has(trial.join(''));
    for (const l of BLANK_LETTERS) {
      trial[open[k]] = l;
      if (search(k + 1)) return true;
    }
    return false;
  };
  if (search(0)) return { ok: true, word: trial.join(''), letters: trial.slice() };
  return { ok: false, letters, reason: 'No word fits the blank' };
}

function makeCtx(run, tiles, letters) {
  const word = letters.join('');
  const r = run.round;
  const vowels = letters.filter((l) => VOWELS.has(l)).length;
  return {
    word,
    len: word.length,
    letters,
    vowels,
    consonants: letters.length - vowels,
    distinctVowels: new Set([...word].filter((c) => VOWELS.has(c))).size,
    hasDouble: /(.)\1/.test(word),
    isIsogram: new Set(word).size === word.length,
    prevWord: r?.prevWord || null,
    printsLeft: r?.printsLeft ?? 0,
    redrawsLeft: r?.redrawsLeft ?? 0,
    isNewWord: !run.stats.wordsSeen[word],
  };
}

export function baseFor(run, len) {
  const k = lengthKey(len);
  const L = LENGTHS[k];
  const lv = run.levels[k] || 1;
  return { key: k, level: lv, ink: L.ink + (lv - 1) * L.step.ink, pressure: L.pressure + (lv - 1) * L.step.pressure };
}

export function isDebuffed(run, letter) {
  const r = run.round;
  return !!r && r.editor === 'censor' && (r.banned || []).includes(letter);
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Scores a word without changing anything. Returns the final numbers plus `steps`, the
 * sequence the UI animates: each step says what changed and the running totals after it.
 */
export function scorePlay(run, uids, letters) {
  const tiles = uids.map((id, i) => ({ ...run.tiles[id], letter: letters[i], isBlank: run.tiles[id].letter === '?' }));
  const ctx = makeCtx(run, tiles, letters);
  const base = baseFor(run, ctx.len);
  let ink = base.ink;
  let pressure = base.pressure;
  const steps = [{ kind: 'base', ink, pressure, level: base.level, len: ctx.len }];
  const push = (step, eff) => {
    if (eff.ink) ink += eff.ink;
    if (eff.pressure) pressure += eff.pressure;
    if (eff.xPressure) pressure = round2(pressure * eff.xPressure);
    steps.push({ ...step, ...eff, totalInk: ink, totalPressure: pressure });
  };
  const rack = activeDingbats(run).map((d) => ({ inst: d, def: DINGBAT_BY_ID[d.id] }));

  tiles.forEach((t, i) => {
    if (isDebuffed(run, t.letter)) {
      steps.push({ kind: 'tile', tile: i, debuffed: true, totalInk: ink, totalPressure: pressure });
      return;
    }
    let times = 1 + (t.ink === 'emboss' ? 1 : 0);
    for (const { def } of rack) times += def.retrigger?.(ctx, t, i) || 0;
    for (let n = 0; n < times; n++) {
      const value = t.isBlank ? 0 : LETTER_INK[t.letter] ?? 0;
      push({ kind: 'tile', tile: i, retrigger: n > 0 }, { ink: value });
      if (run.round?.editor === 'smudger' && VOWELS.has(t.letter) && pressure > 1) {
        push({ kind: 'smudge', tile: i }, { pressure: -Math.min(1, pressure - 1) });
      }
      if (t.ink === 'cyan') push({ kind: 'ink', tile: i, ink_: 'cyan' }, { ink: 20 });
      if (t.ink === 'magenta') push({ kind: 'ink', tile: i, ink_: 'magenta' }, { pressure: 4 });
      if (t.ink === 'gold') push({ kind: 'ink', tile: i, ink_: 'gold' }, { xPressure: 1.5 });
      for (const { inst, def } of rack) {
        const eff = def.onTile?.(ctx, t, i);
        if (eff) push({ kind: 'dingbat', tile: i, dingbat: inst.uid }, eff);
      }
    }
  });
  for (const { inst, def } of rack) {
    const eff = def.onWord?.(ctx, inst);
    if (eff) push({ kind: 'dingbat', dingbat: inst.uid }, eff);
  }
  const score = Math.floor(ink * pressure);
  steps.push({ kind: 'total', totalInk: ink, totalPressure: pressure, score });
  return { word: ctx.word, ink, pressure, score, steps, ctx };
}

// ── actions during a round ──────────────────────────────────────────────────
/** Print a word. Returns { ok, reason } or { ok, result, money } and updates run.phase. */
export function print(run, uids, assigned, dict) {
  const r = run.round;
  if (run.phase !== 'round' || r.printsLeft <= 0) return { ok: false, reason: 'No prints left' };
  if (new Set(uids).size !== uids.length || !uids.every((id) => r.hand.includes(id))) {
    return { ok: false, reason: 'Tiles must come from your hand' };
  }
  const chk = checkWord(run, uids, assigned, dict);
  if (!chk.ok) return chk;
  const result = scorePlay(run, uids, chk.letters);
  const { ctx } = result;

  r.score += result.score;
  let money = 0;
  for (const d of activeDingbats(run)) money += DINGBAT_BY_ID[d.id].money?.(ctx) || 0;
  if (r.editor === 'miser') money -= 2;
  run.money = Math.max(0, run.money + money);

  for (const l of chk.letters) for (const c of l) run.stats.lettersPrinted.includes(c) || run.stats.lettersPrinted.push(c);
  for (const d of activeDingbats(run)) DINGBAT_BY_ID[d.id].afterPrint?.(ctx, d, run);
  run.stats.wordsSeen[ctx.word] = (run.stats.wordsSeen[ctx.word] || 0) + 1;

  const entry = { word: ctx.word, score: result.score, edition: run.edition, round: run.roundIndex };
  r.words.push(entry);
  run.stats.words.push(entry);
  run.stats.total += result.score;
  if (!run.stats.best || result.score > run.stats.best.score) run.stats.best = entry;

  r.prevWord = ctx.word;
  r.printsLeft--;
  r.hand = r.hand.filter((id) => !uids.includes(id));
  draw(run);
  settle(run);
  return { ok: true, result, money };
}

/** Throw away tiles from the hand and draw replacements. */
export function redraw(run, uids) {
  const r = run.round;
  if (run.phase !== 'round' || r.redrawsLeft <= 0 || !uids.length) return null;
  if (!uids.every((id) => r.hand.includes(id))) return null;
  r.redrawsLeft--;
  r.hand = r.hand.filter((id) => !uids.includes(id));
  for (const d of activeDingbats(run)) DINGBAT_BY_ID[d.id].onRedraw?.(d);
  return draw(run);
}

/** Lose a print without scoring (Rush Job timer ran out, or the player is stuck). */
export function forfeit(run) {
  const r = run.round;
  if (run.phase !== 'round') return;
  r.printsLeft--;
  r.prevWord = null;
  settle(run);
}

function settle(run) {
  const r = run.round;
  if (r.score >= r.target) {
    run.phase = 'cleared';
    r.payout = computePayout(run);
  } else if (r.printsLeft <= 0) {
    run.phase = 'over';
  }
}

export function computePayout(run) {
  const r = run.round;
  const lines = [{ label: 'Deadline met', amount: ROUND_REWARD[run.roundIndex] }];
  if (r.printsLeft > 0) lines.push({ label: `Unused prints (${r.printsLeft})`, amount: r.printsLeft });
  const interest = Math.min(5, Math.floor(run.money / 5));
  if (interest > 0) lines.push({ label: `Interest ($1 per $5 saved)`, amount: interest });
  for (const d of activeDingbats(run)) {
    const def = DINGBAT_BY_ID[d.id];
    const amt = def.roundEnd?.() || 0;
    if (amt) lines.push({ label: def.name, amount: amt });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** After the cleared screen: bank the payout and go to the shop (or the win screen). */
export function collect(run) {
  if (run.phase !== 'cleared') return;
  run.money += run.round.payout.total;
  if (run.roundIndex === 2 && run.edition === EDITIONS_TO_WIN && !run.endless) {
    run.phase = 'won';
    return;
  }
  openShop(run);
}

export function continueEndless(run) {
  if (run.phase !== 'won') return;
  run.endless = true;
  openShop(run);
}

// ── shop ────────────────────────────────────────────────────────────────────
function openShop(run) {
  run.phase = 'shop';
  run.shop = { offers: [], rerollCost: REROLL_COST };
  stockShop(run);
}

function dingbatOffer(run, exclude) {
  const owned = new Set(run.dingbats.map((d) => d.id));
  const pool = DINGBATS.filter((d) => !owned.has(d.id) && !exclude.has(d.id));
  if (!pool.length) return null;
  const rarity = rweighted(run, Object.keys(RARITY_WEIGHT).filter((k) => pool.some((d) => d.rarity === k)), (k) => RARITY_WEIGHT[k]);
  const def = rpick(run, pool.filter((d) => d.rarity === rarity));
  exclude.add(def.id);
  return { type: 'dingbat', id: def.id, cost: def.cost, sold: false };
}

function supplyOffer(run, exclude) {
  const pool = SUPPLIES.filter((s) => !exclude.has(s.id));
  const s = rweighted(run, pool, (x) => x.weight);
  exclude.add(s.id);
  const offer = { type: 'supply', id: s.id, cost: s.cost, sold: false };
  if (s.kind === 'sort') {
    const letters = Object.keys(STARTING_CASE);
    offer.letter = rweighted(run, letters, (l) => STARTING_CASE[l]);
    if (rnd(run) < 0.3) {
      offer.ink = rpick(run, ['cyan', 'magenta', 'emboss', 'gold']);
      offer.cost += 2;
    }
  }
  return offer;
}

const UPGRADE_WEIGHTS = { 3: 2, 4: 4, 5: 5, 6: 4, 7: 3, 8: 1, 9: 1 };
function upgradeOffer(run) {
  const k = Number(rweighted(run, Object.keys(UPGRADE_WEIGHTS), (x) => UPGRADE_WEIGHTS[x]));
  return { type: 'upgrade', length: k, cost: UPGRADE_COST, sold: false };
}

function stockShop(run) {
  const dEx = new Set();
  const sEx = new Set();
  run.shop.offers = [dingbatOffer(run, dEx), dingbatOffer(run, dEx), supplyOffer(run, sEx), supplyOffer(run, sEx), upgradeOffer(run)].filter(Boolean);
}

export function reroll(run) {
  if (run.phase !== 'shop' || run.money < run.shop.rerollCost) return false;
  run.money -= run.shop.rerollCost;
  run.shop.rerollCost++;
  stockShop(run);
  return true;
}

export const MIN_CASE = 24;

/** How many tiles the player must pick from their case for this offer (0 = none). */
export function picksFor(offer) {
  if (offer.type !== 'supply') return 0;
  return SUPPLIES.find((s) => s.id === offer.id)?.picks || 0;
}

/** Buy shop offer `index`. `picks` = tile uids chosen for inks/shredder. */
export function buy(run, index, picks = []) {
  const offer = run.shop?.offers[index];
  if (!offer || offer.sold) return { ok: false, reason: 'Already sold' };
  if (run.money < offer.cost) return { ok: false, reason: 'Not enough money' };
  if (offer.type === 'dingbat') {
    if (run.dingbats.length >= DINGBAT_SLOTS) return { ok: false, reason: 'Dingbat rack is full. Sell one first.' };
    run.dingbats.push(newDingbat(run, offer.id));
  } else if (offer.type === 'upgrade') {
    run.levels[offer.length]++;
  } else {
    const s = SUPPLIES.find((x) => x.id === offer.id);
    const valid = picks.filter((id) => run.caseIds.includes(id));
    if (s.kind === 'ink') {
      if (!valid.length || valid.length > s.picks) return { ok: false, reason: `Pick up to ${s.picks} tile(s)` };
      for (const id of valid) run.tiles[id].ink = s.ink;
    } else if (s.kind === 'shred') {
      if (!valid.length || valid.length > s.picks) return { ok: false, reason: `Pick up to ${s.picks} tile(s)` };
      if (run.caseIds.length - valid.length < MIN_CASE) return { ok: false, reason: `Your case can't go below ${MIN_CASE} tiles` };
      run.caseIds = run.caseIds.filter((id) => !valid.includes(id));
    } else if (s.kind === 'sort') {
      addTile(run, offer.letter, offer.ink || null);
    } else if (s.kind === 'blank') {
      addTile(run, '?');
    }
  }
  run.money -= offer.cost;
  offer.sold = true;
  return { ok: true };
}

export function sellValue(inst) {
  return Math.max(1, Math.floor(DINGBAT_BY_ID[inst.id].cost / 2));
}

export function sell(run, uid) {
  if (run.phase !== 'shop') return false;
  const i = run.dingbats.findIndex((d) => d.uid === uid);
  if (i < 0) return false;
  run.money += sellValue(run.dingbats[i]);
  run.dingbats.splice(i, 1);
  return true;
}

export function moveDingbat(run, uid, dir) {
  const i = run.dingbats.findIndex((d) => d.uid === uid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= run.dingbats.length) return false;
  [run.dingbats[i], run.dingbats[j]] = [run.dingbats[j], run.dingbats[i]];
  return true;
}

export function leaveShop(run) {
  if (run.phase !== 'shop') return;
  run.shop = null;
  run.roundIndex++;
  if (run.roundIndex > 2) {
    run.roundIndex = 0;
    run.edition++;
  }
  startRound(run);
}
