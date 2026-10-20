// Phase 4's screens as HTML: template strings from views and lines, no DOM (main.js puts them on screen).
// The one that got away, on the round result; today's operation, on the title and at the table.
import { AGENT, CITY, RIVALS } from './data.js';
import { esc } from './board.js';
import { gotAwayText } from './replay.js';
import { briefSVG } from './art.js';

/** The line as the slip and the ticker say it: gotAwayText, after "{who}: " in pass and play. */
export const gotAwayLine = (g, cityIds, { who = null } = {}) => `${who ? `${who}: ` : ''}${gotAwayText(g, cityIds)}`;

/**
 * The one that got away on a lost round's result: a telegram slip with its red stamp and the line typed on it
 * (gotAwayText, for the round's `cityIds`). A tap on it lights the city the change names (`data-city`) on the
 * board (main.js, the `got-away` action). In pass and play `who`, the loser's name, heads the line. A <button>
 * holding no other interactive element: the stamp is an <i>, hidden from screen readers (the line says it all).
 */
export function gotAwayHTML(g, cityIds, { who = null } = {}) {
  const text = gotAwayLine(g, cityIds, { who });
  return `<button class="got-away" data-action="got-away" data-city="${esc(g.instead.city)}"><i class="ga-stamp" aria-hidden="true">The one that got away</i><span>${esc(text)}</span></button>`;
}

/**
 * Can line `g` go on a screen every player sees (pass and play at two seats)? Only when it names no card its seat
 * held back: the card it played, with the partner it played (or none), so only the city or Casablanca's face
 * changes, and the board is face up by the result. Another card, or a new partner for the same card, would name
 * a card still in that player's hand.
 */
export const sharedSafe = (g) => !!g && g.instead.uid === g.was.uid && (g.instead.partner ?? null) === (g.was.partner ?? null);

/**
 * Pass and play's lines for the shared case file, from `seats` (the table's missed lists, one per seat): at two seats
 * each loser's one that got away that names no card they held back (sharedSafe), with their name (`view.names`) before
 * it, as the shared result shows them; at three and four seats, or with no lists, none.
 */
export const sharedMissedOf = (view, seats) =>
  Array.isArray(seats) && view?.scores?.length === 2
    ? seats.flatMap((list, s) => (Array.isArray(list) ? list : []).filter(sharedSafe).map((m) => ({ ...m, who: view.names[s] })))
    : [];

// ── today's operation (the daily) ───────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayParts = (key) => key.split('-').map(Number);
/** A day key ('2026-11-03') in words: "3 November". */
export const dayWords = (key) => {
  const [, m, d] = dayParts(key);
  return `${d} ${MONTHS[m - 1]}`;
};
/** The day as the slip's date stamp has it: "3 Nov". */
const dayStamp = (key) => {
  const [, m, d] = dayParts(key);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
};
/** The played slip's stamp: a check, with the text variation selector so macOS doesn't draw it as an emoji. */
const CHECK = '\u2713\uFE0E';

/**
 * How a day went, as the played slip says it: "won by 4", "lost by 3", and ", by the reel" when a full reel
 * decided it. A reel taken from behind (or level) on points has no margin to win by: "won by the reel".
 */
export function dailyOutcome(r) {
  const word = r.won ? 'won' : 'lost';
  const by = r.won ? r.margin : -r.margin;
  const reel = r.by === 'reel';
  if (by > 0) return `${word} by ${by}${reel ? ', by the reel' : ''}`;
  return reel ? `${word} by the reel` : word;
}

/** The dossier's sub for a daily: "You beat Mr Heron by 4." or "Mr Heron beat you by 3.", after the reel when it decided. */
export function dailySub(r, rival) {
  const by = r.won ? r.margin : -r.margin;
  const beat = by > 0 ? (r.won ? `You beat ${rival} by ${by}.` : `${rival} beat you by ${by}.`) : '';
  const reel = r.by === 'reel' ? (r.won ? 'You took the full reel.' : `${rival} took the full reel.`) : '';
  return [reel, beat].filter(Boolean).join(' ');
}

/**
 * The title's slip for today's operation `op` (dailyOperation): a telegram on paper with a red date stamp. It
 * starts the day, continues it while today's save exists (`saved`), and once the day is `played` (its recorded
 * result) it stays on the title, disabled, saying how it went. One button; the stamp is an <i> hidden from screen
 * readers (the words say it all).
 */
export function dailySlipHTML(op, { played = null, saved = false } = {}) {
  if (played) {
    return `<button class="slip daily" data-action="daily" disabled><span>Today’s operation: ${esc(dailyOutcome(played))}</span><small>Tomorrow brings another.</small><i class="daily-stamp" aria-hidden="true">${CHECK}</i></button>`;
  }
  const line = `Operation ${op.operation.name} · ${op.rival.name}’s day · ${dayWords(op.key)}`;
  return `<button class="slip daily" data-action="daily"><span>${saved ? 'Continue today’s operation' : 'Today’s operation'}</span><small>${esc(line)}</small><i class="daily-stamp" aria-hidden="true">${esc(dayStamp(op.key))}</i></button>`;
}

/** The best daily margin under the title's network line ({ margin, key, rival } from dailyBest), or '' before any day is played. */
export function dailyBestHTML(best) {
  if (!best) return '';
  const rival = RIVALS.find((r) => r.id === best.rival)?.name ?? 'the computer';
  return `<p class="daily-best">Best daily: <b>${best.margin > 0 ? '+' : ''}${best.margin}</b> (${esc(dayWords(best.key))}, against ${esc(rival)})</p>`;
}

/** The roster card's line on a daily, in words: the day's two featured agents and its city ({ agents, city } from dailyOperation). */
export function featuredLine(featured) {
  const agents = featured.agents.map((id) => AGENT[id]?.name ?? id).join(' and ');
  const city = CITY[featured.city]?.name ?? featured.city;
  return `Featured today: ${agents}, with ${city} among the cities. They’re a taste of the ladder: playing them recruits nobody.`;
}
/** That line as the roster card types it, under its subtitle. */
export const featuredHTML = (featured) => `<p class="featured">${esc(featuredLine(featured))}</p>`;

// ── the case file (the end screen) ──────────────────────────────────────────
/** "a Heavy", "an Assassin". */
const aOr = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
const cityCount = (n) => `${n} ${n === 1 ? 'city' : 'cities'}`;
/** A seat as the case file names it: `data.labels` ("You" for the bottom seat), else its name. */
const seatName = (data, s) => data.labels?.[s] ?? data.names[s];

/**
 * The evidence slips for the case file's focus seat, from posterData's highlights, in the order they're filed:
 * [{ kind, lead, text, art, accent }], `art` an agent id for its silhouette (or null), `accent` the seat whose colour
 * its accent takes (or null). A highlight that is null has no slip; with no highlights at all (a view with no recap),
 * none. On a neutral screen (pass and play, a spectator) the slips name the focus seat instead of "your".
 */
export function evidenceSlips(data, { neutral = false } = {}) {
  const h = data.highlights;
  if (!h) return [];
  const who = neutral ? seatName(data, data.focus) : null;
  const out = [];
  if (h.takedown) {
    const t = h.takedown;
    const victim = AGENT[t.victim]?.name ?? t.victim;
    out.push({ kind: 'takedown', lead: 'Best takedown:', text: `${who ? `${who}’s` : 'your'} ${AGENT[t.by]?.name ?? t.by} took out ${aOr(victim)} (${t.power}) in ${CITY[t.city]?.name ?? t.city}, round ${t.round + 1}.`, art: t.victim, accent: null });
  }
  if (h.escalations) {
    const e = h.escalations;
    out.push(e.called > 0 ? { kind: 'escalations', lead: 'Escalations:', text: `${e.won} of ${e.called} won.`, art: null, accent: null } : { kind: 'escalations quiet', lead: '', text: `${who ?? 'You'} never went loud.`, art: null, accent: null });
  }
  if (h.mvp) out.push({ kind: 'mvp', lead: 'Agent of the match:', text: `the ${AGENT[h.mvp.kind]?.name ?? h.mvp.kind}, held ${cityCount(h.mvp.held)}.`, art: h.mvp.kind, accent: data.focus });
  if (h.biggest) out.push({ kind: 'biggest', lead: 'Biggest round:', text: `+${h.biggest.points} in round ${h.biggest.round + 1}.`, art: null, accent: null });
  return out;
}
/** A slip's whole line, as the screen and the poster say it. */
export const slipLine = (e) => (e.lead ? `${e.lead} ${e.text}` : e.text);

/**
 * The case file: the end screen's manila folder, from posterData's `data` plus what main.js adds to it (`label`, the
 * typed label; `sub`; `labels`, each seat as the screen names it; `coda`, a last line or null). A typed label, the red
 * stamp (Closed when the focus seat won or on a neutral screen, Burned when it lost; `land` drops it on, once), the
 * heading in cut type (`jitter`), the score line (every seat in `data.order`, its score over its strips of film), the
 * round strip (one row per round in the winner's colour, a film frame beside the city a strip came from, and a pin on
 * a round with the one that got away), and the evidence slips (omitted with no highlights: a view with no recap).
 * The stamp and the slips' art are hidden from screen readers: the heading and the lines say it all.
 */
export function caseFileHTML(data, { neutral = false, agentSVG = () => '', jitter = esc, land = false } = {}) {
  const name = (s) => seatName(data, s);
  const closed = neutral || data.won;
  const stamp = `<i class="cf-stamp ${closed ? 'won' : 'lost'}${land ? ' land' : ''}" aria-hidden="true">${closed ? 'Closed' : 'Burned'}</i>`;
  const reel = (s) =>
    data.reel > 0
      ? `<span class="reel own-${s}" role="img" aria-label="${data.strips[s]} of ${data.reel} film strips">${Array.from({ length: data.reel }, (_, i) => `<i class="fr${i < data.strips[s] ? ' got' : ''}"></i>`).join('')}</span>`
      : '';
  const seat = (s) => `<span class="seat own-${s}${s === data.winner ? ' lead' : ''}"><span class="nm">${esc(name(s))}</span><span class="score-film"><b>${jitter(String(data.scores[s]), 3 + s)}</b>${reel(s)}</span></span>`;
  const n = data.order.length;
  const scores = n === 2 ? `${seat(data.order[0])}<i class="to">to</i>${seat(data.order[1])}` : data.order.map(seat).join('');
  const rows = data.rounds
    .map((r) => {
      const cls = r.winner === null ? 'w-none' : `${r.winner === data.focus ? 'w-me' : 'w-them'} own-${r.winner}`;
      // A round that gave a strip of film: a frame in the taker's colour, beside the film city.
      const strip = r.strip !== null && r.strip !== undefined && r.film !== null && r.film !== undefined;
      const frame = (ci) => {
        if (!strip || ci !== r.film) return '';
        const said = `${name(r.strip)} took a strip of film from ${CITY[r.cities[ci]].name}`;
        return `<i class="fr got own-${r.strip}" role="img" aria-label="${esc(said)}" title="${esc(said)}"></i>`;
      };
      const line = r.missed ? gotAwayLine(r.missed, r.cities, { who: r.missed.who ?? null }) : '';
      const pin = line ? `<i class="ga-pin" role="img" aria-label="${esc(`The one that got away. ${line}`)}" title="${esc(line)}"></i>` : '';
      return `<li class="${cls}"><span class="n">${r.no}</span><span class="where"><span class="op">${esc(r.operation)}</span>${r.cities.map((c, ci) => `${esc(CITY[c].name)}${frame(ci)}`).join(', ')}</span><span class="how">${esc(r.how)}</span><b>${r.winner === null ? 'nobody' : `+${r.points} ${esc(name(r.winner))}`}</b>${pin}</li>`;
    })
    .join('');
  const slips = evidenceSlips(data, { neutral });
  const glyph = (e) => (e.kind === 'biggest' ? `+${data.highlights.biggest.points}` : '×2');
  const art = (e) =>
    e.art
      ? `<span class="ev-art${e.accent === null ? '' : ` own-${e.accent}`}" aria-hidden="true">${agentSVG(e.art)}</span>`
      : `<span class="ev-art glyph" aria-hidden="true">${glyph(e)}</span>`;
  const evidence = data.highlights
    ? `<div class="evidence">${slips.map((e) => `<p class="slip-ev ${e.kind}">${art(e)}<span class="ev-text">${e.lead ? `<b>${esc(e.lead)}</b> ` : ''}${esc(e.text)}</span></p>`).join('')}</div>`
    : '';
  return `<div class="case-file${n > 2 ? ` many n${n}` : ''}">
      <div class="cf-head"><p class="label">${esc(data.label ?? '')}</p>${stamp}</div>
      <h2>${jitter(data.title, 9)}</h2>
      <p class="sub">${esc(data.sub ?? '')}</p>
      <p class="score-line${n > 2 ? ' many' : ''}">${scores}</p>
      <ol class="round-strip">${rows}</ol>
      ${evidence}
      ${data.coda ? `<p class="sub coda">${esc(data.coda)}</p>` : ''}
    </div>`;
}

// ── the briefing (a scripted first round against Agent Wren) ────────────────
/**
 * C's coach slip, pinned above the hand while you plan a briefing turn: the lesson stamped in red ("Briefing 2 of 6 ·
 * The flip trick") over the text typed on the slip. `coach` is coachFor's ({ title, ... }); `textHTML` is main.js's
 * own HTML for the text (typedHTML the first time a lesson shows, esc after), put in as it comes. `note`, when given,
 * is C's last word above the lesson (what the turn just flipped showed, or a correction): style.css shows it only on
 * the narrowest phones, where it stands in for the ticker. A status: it holds nothing to press.
 */
export function coachHTML(coach, { step, total, textHTML, note = '' }) {
  return `<aside class="coach" role="status"><i class="lesson">Briefing ${step} of ${total} · ${esc(coach.title)}</i>${note ? `<p class="note">${esc(note)}</p>` : ''}<p>${textHTML}</p></aside>`;
}

// ── how a turn works (for a friend waiting in the lobby) ────────────────────
const TURN_LINES = [
  'Each turn, pick one agent and a city. Your drop is secret until everyone’s is in.',
  'The drops flip together. Tricks fire as the cards turn, First flip first.',
  'After six drops, hold the most cities to take the round: two of three.',
  'Escalate to double the stake; the others fold or play on. The final flip doubles it again.',
];
/**
 * Four illustrated lines on how a turn works, for a guest waiting for the host to start (main.js's lobby): the drop,
 * the flip, the cities, the stake, each a paper slip with its picture (briefSVG, hidden from screen readers: the
 * line says it all). Nothing in it to press. The class is turn-guide, apart from the scripted briefing's .briefing.
 * `enter`: the slips drop in (main.js sets it on the first render only, so a redrawn lobby never replays it).
 */
export const briefingHTML = ({ enter = false } = {}) =>
  `<section class="turn-guide${enter ? ' enter' : ''}" aria-label="How a turn works"><h3>How a turn works</h3><ol>${TURN_LINES.map((line, i) => `<li><span class="art" aria-hidden="true">${briefSVG(i)}</span><p>${esc(line)}</p></li>`).join('')}</ol></section>`;
