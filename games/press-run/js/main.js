import { homeLink, markReady, recordBest, recordPlay, reducedMotion, store } from '../../../shared/arcade.js';
import { createSfx } from '../../../shared/sfx.js';
import { dailySeed } from '../../../shared/rng.js';
import { countUp, floatText, pulse, shake, toast as cgToast } from '../../../shared/juice.js';
import { loadCommon, loadDictionary } from '../../../shared/words.js';
import * as D from './data.js';
import * as E from './engine.js';
import { bestPlays, formable, prepareCandidates } from './solver.js';

const SLUG = 'press-run';
const sfx = createSfx(SLUG);
const saved = store(SLUG);

const $ = (sel, root = document) => root.querySelector(sel);
const screenEl = $('#screen');
const overlayRoot = $('#overlay-root');
const topbar = $('#topbar');

let dict = null;
let hintCands = null;
let fullCands = null;
let run = null;

const ui = {
  screen: 'title',
  stick: [],
  assigned: {},
  busy: false,
  skip: false,
  lastKeyQu: false,
  modal: null, // 'help' | 'case' | 'pick'
  pick: null, // { index, max, picked: [] }
  dealt: new Set(),
  freshWord: false,
  stuck: false,
  timerStart: 0,
  timerLeft: D.HURRY_SECONDS * 1000,
};

const meta = Object.assign(
  { runs: 0, wins: 0, bestEdition: 0, bestPrint: null, longest: '' },
  saved.get('meta', {}),
);

// ── formatting helpers ──────────────────────────────────────────────────────
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtP = (p) => (Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ui.skip ? 0 : ms));
const upper = (w) => w.toUpperCase();

// ── sound palette ───────────────────────────────────────────────────────────
const S = {
  tock(p = 1) {
    sfx.noise({ dur: 0.045, vol: 0.32, freq: 1900 * p, type: 'bandpass', q: 4 });
    sfx.tone({ freq: 540 * p, to: 380 * p, type: 'triangle', dur: 0.06, vol: 0.12 });
  },
  bad: () => sfx.tone({ freq: 150, to: 105, type: 'square', dur: 0.16, vol: 0.07 }),
  roller: () => sfx.noise({ dur: 0.28, vol: 0.12, freq: 500, to: 2600, type: 'bandpass', q: 1.2 }),
  slam() {
    sfx.noise({ dur: 0.32, vol: 0.55, freq: 240, type: 'lowpass' });
    sfx.tone({ freq: 95, to: 40, type: 'sine', dur: 0.3, vol: 0.5 });
    sfx.tone({ freq: 1700, type: 'square', dur: 0.04, vol: 0.025, delay: 0.015 });
  },
  tick: (n) => sfx.tone({ freq: 392 * 2 ** (Math.min(n, 24) / 12), type: 'triangle', dur: 0.06, vol: 0.12 }),
  ptick: (n) => sfx.tone({ freq: 587 * 2 ** (Math.min(n, 24) / 12), type: 'square', dur: 0.05, vol: 0.05 }),
  fire: () => sfx.tone({ freq: 880, to: 1320, type: 'sine', dur: 0.09, vol: 0.08 }),
  stamp(big) {
    sfx.noise({ dur: 0.2, vol: 0.5, freq: 700, type: 'lowpass' });
    sfx.arp(big ? [523, 659, 784, 1047] : [523, 784], { step: 0.05, type: 'triangle', vol: 0.13 });
  },
  cash: () => sfx.arp([1318, 1760], { step: 0.06, type: 'square', dur: 0.08, vol: 0.05 }),
  sell: () => sfx.arp([1760, 1318], { step: 0.06, type: 'square', dur: 0.08, vol: 0.05 }),
  clear: () => sfx.arp([392, 523, 659, 784, 1047], { step: 0.08, type: 'triangle', dur: 0.22, vol: 0.15 }),
  lose: () => sfx.arp([392, 330, 262, 196], { step: 0.15, type: 'sawtooth', dur: 0.26, vol: 0.06 }),
  shuffle() {
    for (let i = 0; i < 4; i++) sfx.noise({ dur: 0.03, vol: 0.14, freq: 1400 + i * 350, type: 'bandpass', q: 5, delay: i * 0.035 });
  },
};

// ── persistence & lifetime stats ────────────────────────────────────────────
function save() {
  if (run && run.phase !== 'over') saved.set('run', run);
  else saved.remove('run');
  saved.set('meta', meta);
}

function noteFound() {
  meta.found = [...new Set([...(meta.found || []), ...run.dingbats.map((d) => d.id)])];
}

function noteProgress() {
  if (!run) return;
  noteFound();
  if (run.daily) {
    const today = run.seed.replace('DAILY-', '');
    const prev = meta.daily?.date === today ? meta.daily : { date: today, edition: 0, won: false };
    const won = prev.won || run.phase === 'won' || run.endless;
    meta.daily = { date: today, edition: Math.max(prev.edition, run.edition), won };
  }
  meta.bestEdition = Math.max(meta.bestEdition, run.edition);
  const won = run.phase === 'won' || run.endless;
  recordBest(SLUG, run.edition * 10 + run.roundIndex + (won ? 1000 : 0), won ? `Won a run${run.endless ? `, edition ${run.edition}` : ''}` : `Edition ${run.edition}`);
}

// ── derived state ───────────────────────────────────────────────────────────
const tileOf = (uid) => run.tiles[uid];
const handLeft = () => run.round.hand.filter((id) => !ui.stick.includes(id));
const stickAssigned = () => ui.stick.map((id) => ui.assigned[id]);
const verdict = () => (ui.stick.length && dict ? E.checkWord(run, ui.stick, stickAssigned(), dict) : null);
const editorDef = () => (run.round?.editor ? D.EDITOR_BY_ID[run.round.editor] : null);
/** "Morning edition", "Evening edition", or the editor's name for the boss round. */
const roundName = () => (run.roundIndex === 2 && run.round?.editor ? D.EDITOR_BY_ID[run.round.editor].name : D.ROUND_NAMES[run.roundIndex]);
const deadlineName = () => (run.roundIndex === 2 && run.round?.editor ? `${roundName()}'s deadline` : `${roundName()} deadline`);

function updateStuck() {
  ui.stuck = false;
  if (run?.phase !== 'round') return;
  const r = run.round;
  if (!r.hand.length) {
    ui.stuck = true;
    return;
  }
  if (r.redrawsLeft > 0 || !fullCands) return;
  const plays = formable(E.handTiles(run), fullCands).filter((p) => !E.lengthProblem(run, p.word.length));
  ui.stuck = plays.length === 0;
}

// ── rendering ───────────────────────────────────────────────────────────────
function tileHTML(t, { action = '', cls = '', assigned = null } = {}) {
  const blank = t.letter === '?';
  const shown = blank ? assigned || '?' : t.letter;
  const label = shown === 'qu' ? 'Q<small>u</small>' : esc(upper(shown));
  const censored = run?.round?.editor === 'censor' && run.round.banned?.includes(t.letter);
  const classes = [
    'tile',
    cls,
    t.ink && `ink-${t.ink}`,
    blank && 'blank',
    blank && assigned && 'assigned',
    t.letter === 'qu' && 'qu',
    censored && 'censored',
    ui.dealt.has(t.uid) && 'enter',
  ].filter(Boolean);
  const aria = `${blank ? 'Blank tile' : upper(t.letter)}${t.ink ? `, ${D.INKS[t.ink].name}` : ''}`;
  const tag = action ? 'button' : 'div';
  return `<${tag} class="${classes.join(' ')}" ${action ? `data-action="${action}"` : ''} data-uid="${t.uid}" aria-label="${aria}">${t.ink ? '<i class="inkdot"></i>' : ''}<span class="ch">${label}</span><span class="val">${blank ? '' : D.LETTER_INK[t.letter]}</span></${tag}>`;
}

function dingbatCounter(inst) {
  const c = inst.counter || 0;
  if (!c) return '';
  switch (inst.id) {
    case 'recycler':
    case 'alphabet':
      return `+${c}`;
    case 'snowball':
      return `+${c}`;
    case 'comet':
      return `×${D.fmtX(1 + c * 0.25)}`;
    case 'gutenberg':
      return `×${D.fmtX(1 + c * 0.1)}`;
    default:
      return '';
  }
}

function dingbatHTML(inst, { action = 'dingbat', off = false } = {}) {
  const def = D.DINGBAT_BY_ID[inst.id];
  const counter = dingbatCounter(inst);
  // Decorative copies (inside cards, which may themselves be buttons) must not be buttons.
  const tag = action ? 'button' : 'div';
  return `<${tag} class="dingbat ${def.rarity}${off ? ' off' : ''}" ${action ? `data-action="${action}"` : ''} data-db="${inst.uid}" aria-label="${esc(def.name)}: ${esc(def.text(inst))}">${def.glyph}\uFE0E${counter ? `<span class="counter">${counter}</span>` : ''}</${tag}>`;
}

function renderTopbar() {
  let info = '';
  if (run && ui.screen === 'game' && run.phase !== 'starter') {
    const round = run.phase === 'shop' ? 'The Foundry' : roundName();
    const total = run.endless ? '' : `<span class="of"> of ${D.EDITIONS_TO_WIN}</span>`;
    info = `<span class="where">Edition ${run.edition}${total}<small>${round}</small></span>
      <span class="spacer"></span>
      <span class="money" title="Money">$${run.money}</span>
      <button class="icon-btn" data-action="case">Case</button>`;
  } else {
    info = '<span class="spacer"></span>';
  }
  $('#topbar-info').innerHTML = `${info}
    <button class="icon-btn" data-action="help" aria-label="How to play"><span class="long">How to play</span><span class="short">?</span></button>
    <button class="icon-btn${sfx.muted ? ' muted' : ''}" data-action="mute" aria-label="Sound" aria-pressed="${!sfx.muted}"><span class="long">${sfx.muted ? 'Sound off' : 'Sound on'}</span><span class="short">♪</span></button>`;
}

function titleHTML() {
  const logo = 'PRESS RUN'
    .split('')
    .map((c, i) => (c === ' ' ? '<span class="gap"></span>' : `<button class="tile" data-action="logo" style="animation-delay:${i * 60}ms" aria-hidden="true" tabindex="-1"><span class="ch">${c}</span><span class="val">${D.LETTER_INK[c.toLowerCase()]}</span></button>`))
    .join('');
  const resume = saved.get('run', null);
  const canResume = resume && resume.version === 1 && resume.phase !== 'over';
  const ready = !!dict;
  const best = meta.bestPrint ? `<span>Best print <b>${esc(upper(meta.bestPrint.word))}</b> ${fmt(meta.bestPrint.score)}</span>` : '';
  return `<section class="title">
    <div class="logo">${logo}</div>
    <p class="lede">Set words in wood type. Letters lay down ink, dingbats pile on pressure. Beat six editions of deadlines before the Editor shuts the press down.</p>
    <div class="actions">
      ${canResume ? `<button class="btn primary" data-action="continue" ${ready ? '' : 'disabled'}>Continue, edition ${resume.edition}</button>` : ''}
      <button class="btn ${canResume ? '' : 'primary'}" data-action="new-run" ${ready ? '' : 'disabled'}>${ready ? 'New run' : 'Setting type…'}</button>
      <button class="btn" data-action="help">How to play</button>
    </div>
    ${meta.runs ? `<div class="lifetime"><span>Runs <b>${meta.runs}</b></span><span>Wins <b>${meta.wins}</b></span>${meta.bestEdition ? `<span>Furthest <b>Edition ${meta.bestEdition}</b></span>` : ''}${best}<span>Dingbats found <b>${(meta.found || []).length}/${D.DINGBATS.length}</b></span></div>` : ''}
    ${dailyHTML()}
  </section>`;
}

function dailyHTML() {
  if (!dict) return '';
  const today = dailySeed();
  const d = meta.daily?.date === today ? meta.daily : null;
  return `<div class="daily">
    <button class="btn" data-action="daily">Today's run</button>
    <span>Same tiles and shop for everyone today.${d ? ` Your best today: edition ${d.edition}${d.won ? ', won' : ''}.` : ''}</span>
  </div>`;
}

function starterHTML() {
  const cards = run.starter
    .map((id) => {
      const def = D.DINGBAT_BY_ID[id];
      return `<button class="card" data-action="starter" data-id="${id}">
        <div class="art">${dingbatHTML({ uid: 0, id, counter: 0 }, { action: '' })}</div>
        <h4>${esc(def.name)}</h4>
        <p>${esc(def.text())}</p>
      </button>`;
    })
    .join('');
  return `<section class="starter">
    <h2>Pick your first dingbat</h2>
    <p>Dingbats are printer's ornaments that bend the scoring. You can hold five, and buy more in the Foundry between rounds.</p>
    <div class="cards">${cards}</div>
    <p class="seed">Seed ${esc(run.seed)}${run.daily ? ", today's run" : ''}</p>
  </section>`;
}

function editorCardHTML() {
  const r = run.round;
  const ed = editorDef();
  if (ed) {
    const timer = r.editor === 'hurry' ? `<div class="timer"><span id="timer-bar"></span></div>` : '';
    return `<div class="panel editor-card"><div class="when">This round's editor</div><h3>${esc(ed.name)}</h3><p>${esc(ed.text(r))}</p>${timer}</div>`;
  }
  const up = run.editionEditor && D.EDITOR_BY_ID[run.editionEditor];
  if (!up) return '';
  return `<div class="panel editor-card upcoming"><div class="when">Third deadline this edition</div><h3>${esc(up.name)}</h3><p>${esc(up.text({}))}</p></div>`;
}

function calcState() {
  const v = verdict();
  if (!v) return { ink: '–', pressure: '–', note: 'Longer words start with more of both', dim: true };
  const len = v.letters.reduce((s, l) => s + (l ? l.length : 1), 0);
  if (len < D.MIN_WORD) return { ink: '–', pressure: '–', note: `Words need ${D.MIN_WORD}+ letters`, dim: true };
  const b = E.baseFor(run, len);
  return { ink: b.ink, pressure: b.pressure, note: `${D.lengthLabel(b.key)}, level ${b.level}`, dim: !v.ok };
}

function verdictHTML() {
  const v = verdict();
  const r = run.round;
  if (!v) {
    const hint = r.editor === 'hurry' ? 'The clock is running.' : 'Tap tiles or type to set a word.';
    return `<span>${hint} Put tiles you don't want in the stick and press Redraw to swap them.</span>`;
  }
  if (v.ok) {
    const shown = v.letters.map((l, i) => (tileOf(ui.stick[i]).letter === '?' ? `<u>${upper(l)}</u>` : upper(l))).join('');
    return `<span class="ok">✓</span><span class="word">${shown}</span><span>is a word</span>`;
  }
  return `<span class="bad">${esc(v.reason)}</span>`;
}

function roundHTML() {
  const r = run.round;
  const pct = Math.min(100, (r.score / r.target) * 100);
  const calc = calcState();
  const v = verdict();
  const blot = r.editor === 'blotter';
  const rack =
    run.dingbats.map((d, i) => dingbatHTML(d, { off: blot && i === 0 })).join('') +
    Array.from({ length: Math.max(0, D.DINGBAT_SLOTS - run.dingbats.length) }, () => '<div class="slot"></div>').join('') +
    (run.dingbats.length ? '' : '<span class="rack-note">Your dingbats go here</span>');
  const words = r.words
    .map((w, i) => `<li class="${ui.freshWord && i === r.words.length - 1 ? 'fresh' : ''}"><span class="w">${esc(upper(w.word))}</span><span class="s">${fmt(w.score)}</span></li>`)
    .join('');
  const pips = (n, total) => `<div class="pips">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
  const maxPrints = D.BASE_PRINTS + run.dingbats.reduce((s, d) => s + (D.DINGBAT_BY_ID[d.id].passive?.prints || 0), 0);
  const maxRedraws = D.BASE_REDRAWS + run.dingbats.reduce((s, d) => s + (D.DINGBAT_BY_ID[d.id].passive?.redraws || 0), 0);
  const canPrint = v?.ok && !ui.busy && run.phase === 'round';
  const canRedraw = ui.stick.length > 0 && r.redrawsLeft > 0 && !ui.busy && run.phase === 'round';

  return `<div class="table">
    <aside class="ledger">
      <div class="panel deadline">
        <div class="row"><span class="name">${esc(deadlineName())}</span></div>
        <div class="target">${fmt(r.target)}</div>
        <div class="bar"><span id="bar" style="width:${pct}%"></span></div>
        <div class="scored"><b id="round-score">${fmt(r.score)}</b> printed so far</div>
      </div>
      <div class="panel calc-panel">
        <div class="calc ${calc.dim ? 'dim' : ''}" id="calc">
          <div class="pad ink"><span id="pad-ink">${calc.ink}</span><small>Ink</small></div>
          <div class="times">×</div>
          <div class="pad pressure"><span id="pad-pressure">${calc.pressure}</span><small>Pressure</small></div>
        </div>
        <div class="calc-note" id="calc-note">${esc(calc.note)}</div>
      </div>
      <div class="panel counts">
        <div class="count">Prints <b>${r.printsLeft}</b>${pips(r.printsLeft, Math.max(maxPrints, r.printsLeft))}</div>
        <div class="count">Redraws <b>${r.redrawsLeft}</b>${pips(r.redrawsLeft, Math.max(maxRedraws, r.redrawsLeft))}</div>
      </div>
      ${editorCardHTML()}
    </aside>
    <section class="press" id="press">
      <div class="rack" id="rack">${rack}</div>
      <div class="proof">
        <div class="head"><span>Proof sheet</span><span>${r.words.length ? `${r.words.length} printed` : ''}</span></div>
        ${words ? `<ol>${words}</ol>` : '<div class="empty">Nothing on the sheet yet.</div>'}
      </div>
      <div class="stick-wrap">
        <div class="stick" id="stick">
          ${ui.stick.length ? ui.stick.map((id) => tileHTML(tileOf(id), { action: 'stick-tile', assigned: ui.assigned[id] })).join('') : '<span class="hint">Composing stick</span>'}
          <div class="roller"></div><div class="platen"></div>
        </div>
        <div class="verdict" id="verdict" role="status">${verdictHTML()}</div>
      </div>
      <div class="hand" id="hand">${handLeft().map((id) => tileHTML(tileOf(id), { action: 'hand-tile' })).join('')}</div>
      <div class="actions">
        <button class="btn primary" data-action="print" ${canPrint ? '' : 'disabled'}>Print<kbd>Enter</kbd></button>
        <button class="btn" data-action="redraw" ${canRedraw ? '' : 'disabled'}>Redraw${ui.stick.length ? ` ${ui.stick.length}` : ''}<kbd>Shift Enter</kbd></button>
        <button class="btn" data-action="clear" ${ui.stick.length && !ui.busy ? '' : 'disabled'}>Clear<kbd>Esc</kbd></button>
        <button class="btn" data-action="shuffle" ${ui.busy ? 'disabled' : ''}>Shuffle<kbd>Space</kbd></button>
        ${ui.stuck && run.phase === 'round' ? '<button class="btn" data-action="pass">No words left: pass this print</button>' : ''}
      </div>
    </section>
  </div>`;
}

function offerHTML(offer, index) {
  const afford = run.money >= offer.cost;
  const btn = `<button class="btn money-btn buy" data-action="buy" data-index="${index}" ${afford && !offer.sold ? '' : 'disabled'}>Buy <b>$${offer.cost}</b></button>`;
  let art = '';
  let name = '';
  let rarity = '';
  let text = '';
  if (offer.type === 'dingbat') {
    const def = D.DINGBAT_BY_ID[offer.id];
    art = dingbatHTML({ uid: 0, id: offer.id, counter: 0 }, { action: '' });
    name = def.name;
    rarity = `<span class="rarity ${def.rarity}">${def.rarity[0].toUpperCase() + def.rarity.slice(1)} dingbat</span>`;
    text = def.text({ counter: 0 });
  } else if (offer.type === 'upgrade') {
    const now = E.baseFor(run, offer.length);
    const L = D.LENGTHS[offer.length];
    art = `<div class="tile"><span class="ch">${offer.length >= 9 ? '9+' : offer.length}</span></div>`;
    name = `Level up ${D.lengthLabel(offer.length)}`;
    rarity = `<span class="rarity">Upgrade</span>`;
    text = `Level ${now.level} → ${now.level + 1}. Base becomes ${now.ink + L.step.ink} Ink × ${now.pressure + L.step.pressure} Pressure.`;
  } else {
    const s = D.SUPPLIES.find((x) => x.id === offer.id);
    name = s.name;
    rarity = `<span class="rarity">Supply</span>`;
    text = s.text;
    if (s.kind === 'ink') art = tileHTML({ uid: 0, letter: 'e', ink: s.ink });
    else if (s.kind === 'sort') {
      art = tileHTML({ uid: 0, letter: offer.letter, ink: offer.ink || null });
      name = `New ${offer.letter === 'qu' ? 'Qu' : upper(offer.letter)} tile`;
      text = offer.ink ? `Add it to your case, already inked: ${D.INKS[offer.ink].text.toLowerCase()}` : 'Add it to your case';
    } else if (s.kind === 'blank') art = tileHTML({ uid: 0, letter: '?', ink: null });
    else if (s.kind === 'shred') art = `<div class="tile censored"><span class="ch">X</span></div>`;
  }
  return `<div class="card ${offer.sold ? 'sold' : ''}">
    <div class="art">${art}</div>
    <div><h4>${esc(name)}</h4>${rarity}</div>
    <p>${esc(text)}</p>
    ${btn}
  </div>`;
}

function shopHTML() {
  const nextIdx = (run.roundIndex + 1) % 3;
  const nextEd = run.roundIndex === 2 ? run.edition + 1 : run.edition;
  const nextTarget = D.roundTarget(nextEd, nextIdx);
  const upcomingEditor = nextIdx === 2 && run.editionEditor ? D.EDITOR_BY_ID[run.editionEditor] : null;
  const rack = run.dingbats.length
    ? run.dingbats
        .map(
          (d, i) => `<div class="item">${dingbatHTML(d)}<div class="ops">
            <button data-action="move" data-db="${d.uid}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move left">‹</button>
            <button data-action="sell" data-db="${d.uid}">Sell $${E.sellValue(d)}</button>
            <button data-action="move" data-db="${d.uid}" data-dir="1" ${i === run.dingbats.length - 1 ? 'disabled' : ''} aria-label="Move right">›</button>
          </div></div>`,
        )
        .join('')
    : '<p class="loading">No dingbats yet. Buy one above.</p>';
  return `<section class="shop">
    <div class="shop-head">
      <div>
        <h2>The Foundry</h2>
        <p>Next: ${nextIdx === 0 ? `Edition ${nextEd}, ` : ''}${upcomingEditor ? `${esc(upcomingEditor.name)}'s deadline` : D.ROUND_NAMES[nextIdx].toLowerCase()} of ${fmt(nextTarget)}${upcomingEditor ? `. ${esc(upcomingEditor.text({}))}` : ''}.</p>
        <p>Every $5 you keep earns $1 interest after each round, up to $5.</p>
      </div>
      <div class="grow"></div>
      <button class="btn money-btn" data-action="reroll" ${run.money >= run.shop.rerollCost ? '' : 'disabled'}>Restock <b>$${run.shop.rerollCost}</b></button>
      <button class="btn primary" data-action="leave-shop">Next round</button>
    </div>
    <div class="cards">${run.shop.offers.map(offerHTML).join('')}</div>
    <div class="shop-bottom">
      <h3>Your dingbats (${run.dingbats.length}/${D.DINGBAT_SLOTS}). They score left to right.</h3>
      <div class="rack-edit">${rack}</div>
      <div class="actions"><button class="btn" data-action="case">Your case: ${run.caseIds.length} tiles, and word levels</button></div>
    </div>
  </section>`;
}

function broadsideHTML(words) {
  if (!words.length) return '';
  const scores = words.map((w) => w.score);
  const lo = Math.log(Math.max(1, Math.min(...scores)));
  const hi = Math.log(Math.max(2, Math.max(...scores)));
  const top = [...scores].sort((a, b) => b - a);
  return `<div class="broadside">${words
    .map((w) => {
      const t = hi > lo ? (Math.log(Math.max(1, w.score)) - lo) / (hi - lo) : 0.5;
      const size = Math.round(15 + t * 40);
      const cls = w.score >= top[0] ? 'm' : w.score >= (top[2] ?? Infinity) ? 'c' : '';
      return `<span class="${cls}" style="font-size:${size}px" title="${fmt(w.score)}">${esc(upper(w.word))}</span>`;
    })
    .join('')}</div>`;
}

function runStatsHTML() {
  const words = run.stats.words;
  const longest = words.reduce((a, w) => (w.word.length > a.length ? w.word : a), '');
  return `<div class="run-stats">
    <div>Reached<b>Edition ${run.edition}</b></div>
    <div>Words printed<b>${words.length}</b></div>
    <div>Best print<b>${run.stats.best ? `${esc(run.stats.best.word)}` : '–'}</b>${run.stats.best ? fmt(run.stats.best.score) : ''}</div>
    <div>Longest word<b>${esc(longest || '–')}</b></div>
  </div>`;
}

function gotAwayHTML() {
  const r = run.round;
  const bestHere = Math.max(0, ...r.words.map((w) => w.score));
  if (!r.missed || r.missed.score <= bestHere * 1.15) return '';
  return `<div class="got-away">The one that got away: <span class="word">${esc(r.missed.word)}</span> would have scored ${fmt(r.missed.score)}.</div>`;
}

function overlayHTML() {
  if (ui.modal === 'help') return helpHTML();
  if (ui.modal === 'case') return caseHTML();
  if (ui.modal === 'pick') return pickHTML();
  if (!run || ui.screen !== 'game' || ui.busy) return '';
  const r = run.round;
  if (run.phase === 'cleared') {
    const lines = r.payout.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>$${l.amount}</td></tr>`).join('');
    const isBoss = run.roundIndex === 2;
    return `<div class="overlay"><div class="sheet" role="dialog" aria-label="Deadline met">
      <span class="stamp-mark">Deadline met</span>
      <h2>${isBoss ? `${esc(D.EDITOR_BY_ID[r.editor].name)} approves` : `${D.ROUND_NAMES[run.roundIndex]} printed`}</h2>
      <p class="sub">${fmt(r.score)} printed against a deadline of ${fmt(r.target)}.</p>
      <table class="ledger-lines">${lines}<tr class="total"><td>Payday</td><td>$${r.payout.total}</td></tr></table>
      ${gotAwayHTML()}
      <div class="actions"><button class="btn primary" data-action="collect">${isBoss && run.edition === D.EDITIONS_TO_WIN && !run.endless ? 'Go to print' : 'To the Foundry'}<kbd>Enter</kbd></button></div>
    </div></div>`;
  }
  if (run.phase === 'over') {
    return `<div class="overlay"><div class="sheet wide" role="dialog" aria-label="Run over">
      <span class="stamp-mark red">Missed the deadline</span>
      <h2>The presses stopped</h2>
      <p class="sub">Edition ${run.edition}, ${esc(deadlineName())}: ${fmt(r.score)} of ${fmt(r.target)}. Seed ${esc(run.seed)}.</p>
      ${runStatsHTML()}
      ${broadsideHTML(run.stats.words)}
      ${gotAwayHTML()}
      <div class="actions"><button class="btn primary" data-action="new-run">New run<kbd>Enter</kbd></button><button class="btn" data-action="copy">Copy summary</button><button class="btn" data-action="title">Title screen</button></div>
    </div></div>`;
  }
  if (run.phase === 'won') {
    return `<div class="overlay"><div class="sheet wide" role="dialog" aria-label="You won">
      <span class="stamp-mark">Gone to print</span>
      <h2>Six editions, every deadline met</h2>
      <p class="sub">The broadside of your run. Seed ${esc(run.seed)}.</p>
      ${runStatsHTML()}
      ${broadsideHTML(run.stats.words)}
      <div class="actions"><button class="btn primary" data-action="endless">Keep printing (endless)</button><button class="btn" data-action="copy">Copy summary</button><button class="btn" data-action="new-run">New run</button></div>
    </div></div>`;
  }
  return '';
}

function helpHTML() {
  return `<div class="overlay" data-action="close-modal"><div class="sheet" role="dialog" aria-label="How to play" data-stop>
    <h2>How to play</h2>
    <p class="sub">Print words to beat each deadline. Survive six editions.</p>
    <p><b>Set a word</b> by tapping tiles or typing. Words need 3+ letters. Every tile adds its Ink; the word's length sets a base of Ink and Pressure, so long words hit far harder.</p>
    <p><b>Score = Ink × Pressure.</b> Dingbats (your five ornament slots) add Ink, add Pressure or multiply Pressure. They trigger left to right, so order matters: add before you multiply.</p>
    <p><b>Each round</b> you get 4 prints and 3 redraws. To redraw, put the tiles you don't want into the stick and press Redraw. Used tiles are gone until the next round.</p>
    <p><b>Each edition</b> has three deadlines. The third is set by an Editor with a nasty rule, shown ahead of time.</p>
    <p><b>The Foundry</b> opens after every round: buy dingbats, ink your tiles (cyan +20 Ink, magenta +4 Pressure, gold ×1.5 Pressure, emboss scores twice), level up word lengths, or shred tiles you hate. Save money: every $5 you hold earns $1 interest.</p>
    <p><b>Special tiles:</b> Qu counts as two letters. Blanks play as any letter except Q.</p>
    <p><b>Keys:</b> letters to set, Backspace to unset, Enter to print, Shift+Enter to redraw, Esc to clear, Space to shuffle.</p>
    <div class="actions"><button class="btn primary" data-action="close-modal">Back to the press</button></div>
  </div></div>`;
}

function caseHTML() {
  const tiles = run.caseIds.map(tileOf).sort((a, b) => (a.letter === '?') - (b.letter === '?') || a.letter.localeCompare(b.letter));
  const rows = Object.keys(D.LENGTHS)
    .map((k) => {
      const b = E.baseFor(run, Number(k));
      return `<tr><td>${D.lengthLabel(Number(k))}</td><td class="n">${b.level}</td><td class="n c">${b.ink}</td><td class="n m">${b.pressure}</td></tr>`;
    })
    .join('');
  return `<div class="overlay" data-action="close-modal"><div class="sheet wide" role="dialog" aria-label="Your case" data-stop>
    <h2>Your case</h2>
    <p class="sub">${tiles.length} tiles. Each round you draw from all of them.</p>
    <div class="case-grid">${tiles.map((t) => tileHTML(t)).join('')}</div>
    <h3>Word levels</h3>
    <table class="levels"><tr><th>Length</th><th>Level</th><th>Base Ink</th><th>Base Pressure</th></tr>${rows}</table>
    <div class="actions"><button class="btn primary" data-action="close-modal">Close</button></div>
  </div></div>`;
}

function pickHTML() {
  const offer = run.shop.offers[ui.pick.index];
  const s = D.SUPPLIES.find((x) => x.id === offer.id);
  const tiles = run.caseIds.map(tileOf).sort((a, b) => a.letter.localeCompare(b.letter));
  const n = ui.pick.picked.length;
  const verb = s.kind === 'shred' ? 'Shred' : 'Apply to';
  return `<div class="overlay"><div class="sheet wide" role="dialog" aria-label="${esc(s.name)}">
    <h2>${esc(s.name)}</h2>
    <p class="sub">${esc(s.text)}. Pick up to ${ui.pick.max} tile${ui.pick.max > 1 ? 's' : ''}.</p>
    <div class="case-grid">${tiles.map((t) => tileHTML(t, { action: 'pick-tile', cls: ui.pick.picked.includes(t.uid) ? 'picked' : '' })).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-action="confirm-pick" ${n ? '' : 'disabled'}>${verb} ${n || ''} tile${n === 1 ? '' : 's'} for $${offer.cost}</button>
      <button class="btn" data-action="close-modal">Cancel</button>
    </div>
  </div></div>`;
}

function render() {
  renderTopbar();
  if (ui.screen === 'title' || !run) {
    screenEl.innerHTML = titleHTML();
  } else if (run.phase === 'starter') {
    screenEl.innerHTML = starterHTML();
  } else if (run.phase === 'shop') {
    screenEl.innerHTML = shopHTML();
  } else {
    screenEl.innerHTML = roundHTML();
  }
  overlayRoot.innerHTML = overlayHTML();
  ui.dealt.clear();
  ui.freshWord = false;
  hideTip();
}

// ── effects ─────────────────────────────────────────────────────────────────
const floatAt = (el, text, cls = '') => floatText(el, text, { className: `float ${cls}` });
const bump = (el) => pulse(el, 'bump');
const toast = (msg) => cgToast(msg, { className: 'toast' });

let tipEl = null;
function showTip(el) {
  const uid = Number(el.dataset.db);
  const inst = run?.dingbats.find((d) => d.uid === uid) || (el.closest('.card') ? null : null);
  if (!inst) return;
  const def = D.DINGBAT_BY_ID[inst.id];
  hideTip();
  tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.innerHTML = `<b>${esc(def.name)}</b><span class="r">${def.rarity} dingbat</span><div>${esc(def.text(inst))}</div>`;
  document.body.append(tipEl);
  const r = el.getBoundingClientRect();
  const tr = tipEl.getBoundingClientRect();
  tipEl.style.left = `${Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2))}px`;
  tipEl.style.top = `${r.bottom + 8 + tr.height > window.innerHeight ? r.top - tr.height - 8 : r.bottom + 8}px`;
}
function hideTip() {
  tipEl?.remove();
  tipEl = null;
}

/** The press: ink roller, platen slam, then each scoring step, then the total. */
async function animatePrint(result, uids, prevScore) {
  const stick = $('#stick');
  const tiles = uids.map((id) => stick.querySelector(`[data-uid="${id}"]`));
  const inkEl = $('#pad-ink');
  const prEl = $('#pad-pressure');
  const quick = reducedMotion();
  $('#calc').classList.remove('dim');

  if (!quick) {
    const roller = stick.querySelector('.roller');
    S.roller();
    roller.animate(
      [{ left: '-40px', opacity: 1 }, { left: 'calc(100% + 10px)', opacity: 1 }],
      { duration: ui.skip ? 1 : 260, easing: 'ease-in-out' },
    );
    await wait(240);
    const platen = stick.querySelector('.platen');
    platen.animate(
      [{ transform: 'translateY(-105%)' }, { transform: 'translateY(0)', offset: 0.45 }, { transform: 'translateY(0)', offset: 0.6 }, { transform: 'translateY(-105%)' }],
      { duration: ui.skip ? 1 : 320, easing: 'cubic-bezier(.5,0,.5,1)' },
    );
    await wait(140);
    S.slam();
    shake($('#press'));
    await wait(200);
  }

  const base = result.steps[0];
  inkEl.textContent = base.ink;
  prEl.textContent = base.pressure;
  const steps = result.steps.slice(1, -1);
  const dt = Math.max(70, Math.min(190, 1500 / Math.max(1, steps.length)));
  let n = 0;
  let lastTile = null;
  for (const s of steps) {
    const tileEl = s.tile !== undefined ? tiles[s.tile] : null;
    if (tileEl && tileEl !== lastTile) {
      lastTile?.classList.remove('scoring');
      tileEl.classList.add('scoring');
      lastTile = tileEl;
    }
    if (s.debuffed) {
      tileEl?.classList.add('dud');
      floatAt(tileEl, 'blacked out', 'bad');
      S.bad();
    } else if (s.kind === 'smudge') {
      floatAt(tileEl, '−1 Pressure', 'bad');
      S.bad();
    } else {
      const target = s.kind === 'dingbat' ? $(`#rack [data-db="${s.dingbat}"]`) : tileEl;
      if (s.kind === 'dingbat' && target) {
        target.classList.remove('fire');
        void target.offsetWidth;
        target.classList.add('fire');
        S.fire();
      }
      if (s.ink) {
        floatAt(target, `+${s.ink}`, 'ink');
        S.tick(n);
        bump(inkEl.parentElement);
      }
      if (s.pressure) {
        floatAt(target, `+${s.pressure} Pressure`, 'pressure');
        S.ptick(n);
        bump(prEl.parentElement);
      }
      if (s.xPressure) {
        floatAt(target, `×${fmtP(s.xPressure)} Pressure`, 'pressure');
        S.ptick(n + 4);
        bump(prEl.parentElement);
      }
    }
    inkEl.textContent = fmt(s.totalInk);
    prEl.textContent = fmtP(s.totalPressure);
    n++;
    await wait(dt);
  }
  lastTile?.classList.remove('scoring');

  const r = run.round;
  const big = result.score >= r.target * 0.5;
  floatAt(stick, fmt(result.score), 'big');
  S.stamp(big);
  shake($('#press'), big ? 2 : 1);
  countUp($('#round-score'), prevScore, r.score, { ms: ui.skip ? 1 : 600, format: fmt });
  $('#bar').style.width = `${Math.min(100, (r.score / r.target) * 100)}%`;
  await wait(750);
}

// ── actions ─────────────────────────────────────────────────────────────────
function newRun(seed, { daily = false } = {}) {
  run = E.createRun(seed);
  if (daily) run.daily = true;
  ui.screen = 'game';
  ui.stick = [];
  ui.assigned = {};
  ui.modal = null;
  meta.runs++;
  recordPlay(SLUG);
  save();
  render();
}

function continueRun() {
  const s = saved.get('run', null);
  if (!s) return newRun();
  run = s;
  ui.screen = 'game';
  ui.stick = [];
  ui.assigned = {};
  updateStuck();
  resetTimer();
  render();
}

function addToStick(uid, letter) {
  if (ui.busy || run.phase !== 'round' || ui.stick.includes(uid)) return;
  ui.stick.push(uid);
  if (letter) ui.assigned[uid] = letter;
  S.tock(1 + ui.stick.length * 0.03);
  render();
}

function removeFromStick(uid) {
  if (ui.busy) return;
  ui.stick = ui.stick.filter((id) => id !== uid);
  delete ui.assigned[uid];
  S.tock(0.8);
  render();
}

const INK_ORDER = { gold: 4, emboss: 3, magenta: 2, cyan: 1 };
function typeLetter(k) {
  if (k === 'u' && ui.lastKeyQu) {
    ui.lastKeyQu = false;
    return;
  }
  const want = k === 'q' ? 'qu' : k;
  const avail = handLeft().map(tileOf).sort((a, b) => (INK_ORDER[b.ink] || 0) - (INK_ORDER[a.ink] || 0));
  let t = avail.find((x) => x.letter === want);
  let assign = null;
  if (!t && k !== 'q') {
    t = avail.find((x) => x.letter === '?');
    assign = k;
  }
  if (!t) {
    S.bad();
    shake($('#hand'));
    return;
  }
  ui.lastKeyQu = t.letter === 'qu';
  addToStick(t.uid, assign);
}

async function doPrint() {
  if (ui.busy || run.phase !== 'round') return;
  const chk = verdict();
  if (!chk?.ok) {
    S.bad();
    shake($('#verdict'));
    return;
  }
  const r = run.round;
  // Remember the best word available in this hand, for "the one that got away".
  if (hintCands) {
    const [best] = bestPlays(run, E.handTiles(run), hintCands, { limit: 1 });
    if (best && (!r.missed || best.score > r.missed.score)) r.missed = { word: best.word, score: best.score };
  }
  const before = new Set(r.hand);
  const prevScore = r.score;
  const uids = ui.stick.slice();
  const res = E.print(run, uids, stickAssigned(), dict);
  if (!res.ok) {
    toast(res.reason);
    return;
  }
  ui.busy = true;
  ui.skip = false;
  stopTimer();
  for (const b of document.querySelectorAll('.actions .btn')) b.disabled = true;
  await animatePrint(res.result, uids, prevScore);
  if (res.money > 0) {
    floatAt($('.money'), `+$${res.money}`, 'money');
    S.cash();
  } else if (res.money < 0) floatAt($('.money'), `−$${-res.money}`, 'bad');

  const w = res.result.word;
  if (!meta.bestPrint || res.result.score > meta.bestPrint.score) meta.bestPrint = { word: w, score: res.result.score };
  if (w.length > meta.longest.length) meta.longest = w;

  ui.busy = false;
  ui.stick = [];
  ui.assigned = {};
  ui.freshWord = true;
  for (const id of run.round.hand) if (!before.has(id)) ui.dealt.add(id);
  afterTurn();
}

function afterTurn() {
  if (run.phase === 'cleared') S.clear();
  if (run.phase === 'over') {
    S.lose();
    noteProgress();
  }
  updateStuck();
  resetTimer();
  save();
  render();
}

function doRedraw() {
  if (ui.busy || run.phase !== 'round' || !ui.stick.length || run.round.redrawsLeft <= 0) return;
  const drawn = E.redraw(run, ui.stick);
  if (!drawn) return;
  ui.stick = [];
  ui.assigned = {};
  drawn.forEach((id) => ui.dealt.add(id));
  S.shuffle();
  updateStuck();
  save();
  render();
}

function doPass(reason) {
  E.forfeit(run);
  ui.stick = [];
  ui.assigned = {};
  if (reason) toast(reason);
  S.bad();
  afterTurn();
}

// Rush Job timer
let timerRaf = 0;
function resetTimer() {
  stopTimer();
  if (run?.phase === 'round' && run.round.editor === 'hurry') {
    ui.timerStart = performance.now();
    timerRaf = requestAnimationFrame(tickTimer);
  }
}
function stopTimer() {
  cancelAnimationFrame(timerRaf);
}
function tickTimer(now) {
  if (run?.phase !== 'round' || run.round.editor !== 'hurry') return;
  if (ui.modal || ui.busy) {
    ui.timerStart += 16; // paused while reading the rules or animating
  }
  const left = D.HURRY_SECONDS * 1000 - (now - ui.timerStart);
  const bar = $('#timer-bar');
  if (bar) bar.style.transform = `scaleX(${Math.max(0, left / (D.HURRY_SECONDS * 1000))})`;
  if (left <= 0) {
    doPass('Too slow! The Rush Job took that print.');
    return;
  }
  timerRaf = requestAnimationFrame(tickTimer);
}

function openPick(index) {
  const offer = run.shop.offers[index];
  ui.pick = { index, max: E.picksFor(offer), picked: [] };
  ui.modal = 'pick';
  render();
}

function buy(index) {
  const offer = run.shop.offers[index];
  if (!offer || offer.sold || run.money < offer.cost) return;
  if (E.picksFor(offer)) return openPick(index);
  const res = E.buy(run, index);
  if (!res.ok) {
    toast(res.reason);
    S.bad();
    return;
  }
  S.cash();
  noteFound();
  save();
  render();
}

function summaryText() {
  const best = run.stats.best;
  return [
    `Press Run (seed ${run.seed})`,
    run.phase === 'won' || run.endless ? `Won! Reached edition ${run.edition}` : `Reached edition ${run.edition}`,
    `${run.stats.words.length} words printed${best ? `, best: ${upper(best.word)} for ${fmt(best.score)}` : ''}`,
    run.stats.words.map((w) => upper(w.word)).join(' '),
  ].join('\n');
}

// ── input ───────────────────────────────────────────────────────────────────
const handlers = {
  'new-run': () => newRun(),
  daily: () => newRun(`DAILY-${dailySeed()}`, { daily: true }),
  continue: () => continueRun(),
  title: () => {
    ui.screen = 'title';
    render();
  },
  help: () => {
    ui.modal = 'help';
    render();
  },
  case: () => {
    if (!run) return;
    ui.modal = 'case';
    render();
  },
  'close-modal': () => {
    ui.modal = null;
    ui.pick = null;
    render();
  },
  mute: () => {
    sfx.toggleMute();
    renderTopbar();
  },
  logo: (el) => {
    S.tock(0.8 + Math.random() * 0.4);
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) rotate(-4deg)' }, { transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' });
  },
  starter: (el) => {
    E.chooseStarter(run, el.dataset.id);
    ui.dealt = new Set(run.round.hand);
    S.clear();
    noteProgress();
    resetTimer();
    save();
    render();
  },
  'hand-tile': (el) => addToStick(Number(el.dataset.uid)),
  'stick-tile': (el) => removeFromStick(Number(el.dataset.uid)),
  print: () => doPrint(),
  redraw: () => doRedraw(),
  clear: () => {
    ui.stick = [];
    ui.assigned = {};
    render();
  },
  shuffle: () => {
    if (ui.busy) return;
    E.shuffleHand(run);
    S.shuffle();
    save();
    render();
  },
  pass: () => doPass(),
  dingbat: (el) => (tipEl ? hideTip() : showTip(el)),
  collect: () => {
    E.collect(run);
    if (run.phase === 'won') {
      meta.wins++;
      S.clear();
    }
    noteProgress();
    save();
    render();
  },
  endless: () => {
    E.continueEndless(run);
    save();
    render();
  },
  buy: (el) => buy(Number(el.dataset.index)),
  reroll: () => {
    if (E.reroll(run)) {
      S.shuffle();
      save();
      render();
    }
  },
  'leave-shop': () => {
    E.leaveShop(run);
    ui.dealt = new Set(run.round.hand);
    noteProgress();
    updateStuck();
    resetTimer();
    save();
    render();
  },
  sell: (el) => {
    if (E.sell(run, Number(el.dataset.db))) {
      S.sell();
      save();
      render();
    }
  },
  move: (el) => {
    if (E.moveDingbat(run, Number(el.dataset.db), Number(el.dataset.dir))) {
      S.tock();
      save();
      render();
    }
  },
  'pick-tile': (el) => {
    const uid = Number(el.dataset.uid);
    const p = ui.pick;
    if (p.picked.includes(uid)) p.picked = p.picked.filter((x) => x !== uid);
    else if (p.picked.length < p.max) p.picked.push(uid);
    else p.picked = [...p.picked.slice(1), uid];
    S.tock();
    render();
  },
  'confirm-pick': () => {
    const res = E.buy(run, ui.pick.index, ui.pick.picked);
    if (!res.ok) {
      toast(res.reason);
      S.bad();
      return;
    }
    S.cash();
    ui.modal = null;
    ui.pick = null;
    save();
    render();
  },
  copy: async () => {
    try {
      await navigator.clipboard.writeText(summaryText());
      toast('Summary copied');
    } catch {
      toast('Could not reach the clipboard');
    }
  },
};

document.addEventListener('click', (e) => {
  if (ui.busy) {
    ui.skip = true;
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) {
    hideTip();
    return;
  }
  // Clicking inside a modal sheet shouldn't trigger the backdrop's close action.
  if (el.dataset.action === 'close-modal' && el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  if (el.disabled) return;
  handlers[el.dataset.action]?.(el, e);
});

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('.rack .dingbat, .rack-edit .dingbat');
  if (el && matchMedia('(hover: hover)').matches) showTip(el);
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.dingbat')) hideTip();
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key;
  if (ui.busy) {
    if (key === 'Enter' || key === ' ') {
      ui.skip = true;
      e.preventDefault();
    }
    return;
  }
  if (ui.modal) {
    if (key === 'Escape') handlers['close-modal']();
    return;
  }
  if (ui.screen === 'title' || !run) {
    if (key === 'Enter' && dict) {
      e.preventDefault();
      saved.get('run', null) ? continueRun() : newRun();
    }
    return;
  }
  if (run.phase === 'cleared' && key === 'Enter') return handlers.collect();
  if (run.phase === 'over' && key === 'Enter') return newRun();
  if (run.phase !== 'round' || !dict) return;
  if (/^[a-zA-Z]$/.test(key)) {
    e.preventDefault();
    typeLetter(key.toLowerCase());
    return;
  }
  ui.lastKeyQu = false;
  if (key === 'Backspace') {
    e.preventDefault();
    const last = ui.stick.at(-1);
    if (last !== undefined) removeFromStick(last);
  } else if (key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) doRedraw();
    else doPrint();
  } else if (key === 'Escape') {
    handlers.clear();
  } else if (key === ' ') {
    e.preventDefault();
    handlers.shuffle();
  }
});

// ── boot ────────────────────────────────────────────────────────────────────
topbar.innerHTML = '<span id="home-slot"></span><span id="topbar-info" style="display:contents"></span>';
homeLink({ parent: $('#home-slot') });
render();

async function boot() {
  const [words, common] = await Promise.all([loadDictionary(), loadCommon(30000, { min: 3, max: 10 })]);
  dict = words;
  hintCands = prepareCandidates(common);
  render();
  markReady(debugApi);
  // The full list is only needed to detect a hand with no words at all; build it when idle.
  setTimeout(() => {
    fullCands = prepareCandidates([...dict]);
    updateStuck();
    if (run?.phase === 'round' && ui.stuck && !ui.busy) render();
  }, 1200);
}

// Test and debug hooks: window.__game (see CLAUDE.md "Testing").
const debugApi = {
  get run() {
    return run;
  },
  ui,
  get dict() {
    return dict;
  },
  newRun: (seed) => newRun(seed),
  /** Replace the hand with fresh tiles, e.g. setHand(['q','u','i','t'...]) or setHand('quartzes'). */
  setHand(letters) {
    const list = typeof letters === 'string' ? letters.replace(/qu/g, 'Q').split('').map((c) => (c === 'Q' ? 'qu' : c)) : letters;
    run.round.hand = list.map((l) => E.addTile(run, l.toLowerCase()));
    run.caseIds = run.caseIds.filter((id) => !run.round.hand.includes(id));
    ui.stick = [];
    ui.assigned = {};
    render();
    return run.round.hand;
  },
  give(id) {
    run.dingbats.push({ uid: run.nextUid++, id, counter: 0 });
    render();
  },
  cash(n) {
    run.money += n;
    render();
  },
  /** Jump to a phase quickly: 'round' of an edition, or force a cleared round. */
  /** Jump to a round. Pass `editor` to force this edition's editor (e.g. 'hurry'). */
  goto(edition, roundIndex = 0, editor = null) {
    run.edition = edition;
    run.roundIndex = roundIndex;
    run.shop = null;
    if (editor) run.editionEditor = editor; // kept by startRound unless roundIndex is 0
    E.startRound(run);
    if (editor) run.editionEditor = editor;
    ui.screen = 'game';
    ui.stick = [];
    ui.assigned = {};
    updateStuck();
    resetTimer();
    render();
  },
  winRound() {
    run.round.score = run.round.target;
    E.forfeit(run);
    run.round.printsLeft++;
    render();
  },
  solve: (limit = 5) => bestPlays(run, E.handTiles(run), hintCands, { limit }).map((p) => `${p.word} ${p.score}`),
  async prepareThumbnail() {
    newRun('THUMB-0001');
    E.chooseStarter(run, run.starter[0]);
    run.dingbats = ['fleuron', 'hedera', 'comet', 'dropcap'].map((id, i) => ({ uid: 9000 + i, id, counter: i === 2 ? 3 : 0 }));
    run.edition = 3;
    run.round.target = 2600;
    run.round.score = 1760;
    run.round.words = [
      { word: 'quartz', score: 1240 },
      { word: 'inked', score: 520 },
    ];
    run.round.printsLeft = 2;
    debugApi.setHand('printedso');
    const [p, r, i, n, t, e, d] = run.round.hand;
    run.tiles[e].ink = 'magenta';
    run.tiles[t].ink = 'gold';
    ui.stick = [p, r, i, n, t, e, d];
    render();
  },
};

boot().catch((err) => {
  console.error(err);
  screenEl.innerHTML = `<p class="loading">Couldn't load the word lists (${esc(err.message)}). Serve the arcade with <code>npm start</code> and reload.</p>`;
});
