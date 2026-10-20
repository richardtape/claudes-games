// Phase 4's screens as HTML (js/loop-ui.js): the one that got away on the round result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefingHTML, caseFileHTML, coachHTML, dailyBestHTML, dailyOutcome, dailySlipHTML, dailySub, dayWords, evidenceSlips, featuredHTML, gotAwayHTML, sharedMissedOf, sharedSafe, slipLine } from '../js/loop-ui.js';
import { TUTORIAL } from '../js/tutorial.js';
import { dailyOperation } from '../js/daily.js';
import { gotAwayText } from '../js/replay.js';
import { briefSVG } from '../js/art.js';

const CITY_IDS = ['moscow', 'monaco', 'berlin'];
/** The late swing's line (replay.test.mjs): the same Heavy, Berlin instead of Moscow. */
const CITY_ONLY = { turn: 6, was: { uid: 'a0.k3', city: 0, kind: 'heavy' }, instead: { uid: 'a0.k3', city: 2, kind: 'heavy' }, held: 2 };
const OTHER_CARD = { turn: 2, was: { uid: 'a0.k3', city: 2, kind: 'heavy' }, instead: { uid: 'a0.m1', city: 2, kind: 'mole' }, held: 2 };
const NEW_PARTNER = { turn: 3, was: { uid: 'a0.c1', city: 1, kind: 'accomplice' }, instead: { uid: 'a0.c1', city: 1, partner: 'a0.m1', kind: 'accomplice', partnerKind: 'mole' }, held: 2 };
const SAME_PARTNER = { turn: 3, was: { uid: 'a0.c1', city: 1, partner: 'a0.m1', kind: 'accomplice', partnerKind: 'mole' }, instead: { uid: 'a0.c1', city: 2, partner: 'a0.m1', kind: 'accomplice', partnerKind: 'mole' }, held: 2 };
const FACE_ONLY = { turn: 4, was: { uid: 'a0.s1', city: 1, down: true, kind: 'sleeper' }, instead: { uid: 'a0.s1', city: 1, down: false, kind: 'sleeper' }, held: 2 };

test('the got-away slip is one button naming the city it lights, with its stamp and the line typed on it', () => {
  const html = gotAwayHTML(CITY_ONLY, CITY_IDS);
  assert.equal(
    html,
    '<button class="got-away" data-action="got-away" data-city="2"><i class="ga-stamp" aria-hidden="true">The one that got away</i><span>Turn 6: Heavy to Berlin instead of Moscow would have won the round.</span></button>',
  );
  // A button holding no other interactive element (nested buttons or links split in the browser).
  assert.equal((html.match(/<(button|a)\b/g) || []).length, 1);
  assert.ok(!/data-action=/.test(html.slice(html.indexOf('>') + 1)), 'no other action inside the slip');
});

test('the slip says gotAwayText, with the player’s name before it in pass and play, escaped', () => {
  const plain = gotAwayHTML(OTHER_CARD, CITY_IDS);
  assert.ok(plain.includes(`<span>${gotAwayText(OTHER_CARD, CITY_IDS)}</span>`));
  assert.ok(gotAwayHTML(CITY_ONLY, CITY_IDS, { who: 'Teal' }).includes('<span>Teal: Turn 6: Heavy to Berlin instead of Moscow would have won the round.</span>'));
  const odd = gotAwayHTML(CITY_ONLY, CITY_IDS, { who: 'A<b>&"' });
  assert.ok(odd.includes('<span>A&lt;b&gt;&amp;&quot;: Turn 6') && !odd.includes('<b>'));
});

test('a shared screen shows a line only when it names no card the loser held back: the same card, the same partner', () => {
  assert.equal(sharedSafe(CITY_ONLY), true, 'the city alone');
  assert.equal(sharedSafe(FACE_ONLY), true, 'Casablanca’s face alone');
  assert.equal(sharedSafe(SAME_PARTNER), true, 'the same pair to another city');
  assert.equal(sharedSafe(OTHER_CARD), false, 'another card');
  assert.equal(sharedSafe(NEW_PARTNER), false, 'the same card with a partner it never played (a held card)');
  assert.equal(sharedSafe({ ...SAME_PARTNER, instead: { ...SAME_PARTNER.instead, partner: undefined, partnerKind: undefined } }), false, 'the pair without its partner');
  assert.equal(sharedSafe(null), false);
  assert.equal(sharedSafe(undefined), false);
});

// ── the daily (Task 4): the title's slip, the best margin, the roster card's line, the result in words ──
const OP = dailyOperation('2026-11-03'); // Operation Hollow Sextant, the Magpie's day: the Turncoat and the Decoy, Tokyo

test('the shared case file\'s lines: at two seats each loser\'s safe lines, named; none that names a held card, and none at three seats', () => {
  const two = { scores: [3, 10], names: ['Red', 'Teal'] };
  const seats = [
    [{ no: 0, ...CITY_ONLY }, { no: 1, ...OTHER_CARD }, { no: 2, ...NEW_PARTNER }],
    [{ no: 3, ...SAME_PARTNER }, { no: 4, ...FACE_ONLY }],
  ];
  assert.deepEqual(sharedMissedOf(two, seats), [
    { no: 0, ...CITY_ONLY, who: 'Red' },
    { no: 3, ...SAME_PARTNER, who: 'Teal' },
    { no: 4, ...FACE_ONLY, who: 'Teal' },
  ]);
  // Every line kept names only the card its seat played, so the board (face up by the result) already showed it.
  assert.ok(sharedMissedOf(two, seats).every((m) => m.instead.uid === m.was.uid && (m.instead.partner ?? null) === (m.was.partner ?? null)));
  assert.deepEqual(sharedMissedOf(two, [[{ no: 1, ...OTHER_CARD }], [{ no: 2, ...NEW_PARTNER }]]), [], 'another card, a new partner: none');
  assert.deepEqual(sharedMissedOf({ scores: [1, 2, 3], names: ['Red', 'Teal', 'Cobalt'] }, [[{ no: 0, ...CITY_ONLY }], [], []]), [], 'three seats: none');
  assert.deepEqual(sharedMissedOf(two, undefined), [], 'no lists (no table): none');
  assert.deepEqual(sharedMissedOf(two, [null, [{ no: 0, ...CITY_ONLY }]]), [{ no: 0, ...CITY_ONLY, who: 'Teal' }], 'a seat with no list is skipped');
});

test('a day key in words: the day and the month', () => {
  assert.equal(dayWords('2026-11-03'), '3 November');
  assert.equal(dayWords('2027-01-31'), '31 January');
  assert.equal(dayWords('2026-12-09'), '9 December');
});

test('the daily slip offers the day, names its operation and rival, and continues a saved one', () => {
  const html = dailySlipHTML(OP, { played: null, saved: false });
  assert.equal(
    html,
    '<button class="slip daily" data-action="daily"><span>Today’s operation</span><small>Operation Hollow Sextant · The Magpie’s day · 3 November</small><i class="daily-stamp" aria-hidden="true">3 Nov</i></button>',
  );
  assert.ok(dailySlipHTML(OP, { played: null, saved: true }).includes('<span>Continue today’s operation</span>'));
  // One button, holding no other interactive element.
  assert.equal((html.match(/<(button|a)\b/g) || []).length, 1);
});

test('a played day: the slip is disabled and says how it went, with a check stamp', () => {
  const won = dailySlipHTML(OP, { played: { margin: 4, won: true, by: 'points', rounds: 5, rival: 'magpie' }, saved: false });
  assert.equal(
    won,
    '<button class="slip daily" data-action="daily" disabled><span>Today’s operation: won by 4</span><small>Tomorrow brings another.</small><i class="daily-stamp" aria-hidden="true">\u2713\uFE0E</i></button>',
  );
  assert.ok(dailySlipHTML(OP, { played: { margin: -3, won: false, by: 'points', rounds: 4, rival: 'magpie' } }).includes('<span>Today’s operation: lost by 3</span>'));
  assert.ok(dailySlipHTML(OP, { played: { margin: 2, won: true, by: 'reel', rounds: 3, rival: 'magpie' } }).includes('<span>Today’s operation: won by 2, by the reel</span>'));
  // A played day never offers to continue, even with a save left over.
  assert.ok(!dailySlipHTML(OP, { played: { margin: 1, won: true, by: 'points', rounds: 6, rival: 'magpie' }, saved: true }).includes('Continue'));
});

test('the result in words: a full reel taken from behind (or level) on points has no margin to win by', () => {
  assert.equal(dailyOutcome({ margin: 30, won: true, by: 'points' }), 'won by 30');
  assert.equal(dailyOutcome({ margin: -3, won: false, by: 'points' }), 'lost by 3');
  assert.equal(dailyOutcome({ margin: 2, won: true, by: 'reel' }), 'won by 2, by the reel');
  assert.equal(dailyOutcome({ margin: -2, won: true, by: 'reel' }), 'won by the reel');
  assert.equal(dailyOutcome({ margin: 0, won: true, by: 'reel' }), 'won by the reel');
  assert.equal(dailyOutcome({ margin: 1, won: false, by: 'reel' }), 'lost by the reel');
  assert.equal(dailyOutcome({ margin: -4, won: false, by: 'reel' }), 'lost by 4, by the reel');
});

test('the dossier’s sub for a daily: who beat whom by how much, after the reel when it decided', () => {
  assert.equal(dailySub({ margin: 4, won: true, by: 'points' }, 'Mr Heron'), 'You beat Mr Heron by 4.');
  assert.equal(dailySub({ margin: -3, won: false, by: 'points' }, 'Mr Heron'), 'Mr Heron beat you by 3.');
  assert.equal(dailySub({ margin: 2, won: true, by: 'reel' }, 'Mr Heron'), 'You took the full reel. You beat Mr Heron by 2.');
  assert.equal(dailySub({ margin: -1, won: true, by: 'reel' }, 'Mr Heron'), 'You took the full reel.');
  assert.equal(dailySub({ margin: 2, won: false, by: 'reel' }, 'Control'), 'Control took the full reel.');
});

test('the best daily on the title: signed margin, the day, the rival; nothing before a day is played', () => {
  assert.equal(dailyBestHTML({ margin: 30, key: '2026-11-03', rival: 'magpie' }), '<p class="daily-best">Best daily: <b>+30</b> (3 November, against The Magpie)</p>');
  assert.equal(dailyBestHTML({ margin: -2, key: '2026-10-21', rival: 'heron' }), '<p class="daily-best">Best daily: <b>-2</b> (21 October, against Mr Heron)</p>');
  assert.equal(dailyBestHTML({ margin: 0, key: '2026-10-21', rival: 'control' }).includes('<b>0</b>'), true);
  assert.equal(dailyBestHTML(null), '');
});

test('the roster card’s line names the day’s two agents and its city', () => {
  assert.equal(
    featuredHTML(OP.featured),
    '<p class="featured">Featured today: Turncoat and Decoy, with Tokyo among the cities. They’re a taste of the ladder: playing them recruits nobody.</p>',
  );
});

// ── the case file ───────────────────────────────────────────────────────────
/** A two-seat case file's data, as main.js builds it from posterData: you (seat 0) beat Agent Wren 10 to 4 in three rounds. */
const caseData = (o = {}) => ({
  title: 'Mission accomplished',
  names: ['Agent Fox', 'Agent Wren'],
  labels: ['You', 'Agent Wren'],
  order: [0, 1],
  scores: [10, 4],
  strips: [0, 1],
  reel: 3,
  winner: 0,
  won: true,
  by: 'points',
  rounds: [
    { no: 1, operation: 'Copper Steeple', cities: ['moscow', 'monaco', 'berlin'], winner: 0, points: 4, how: '2 of 3 cities', strip: 1, film: 2, missed: null },
    { no: 2, operation: 'Gilded Lagoon', cities: ['moscow', 'monaco', 'berlin'], winner: 1, points: 4, how: '2 of 3 cities', strip: null, film: 1, missed: { no: 1, ...CITY_ONLY } },
    { no: 3, operation: 'Eastern Tapestry', cities: ['lisbon', 'vienna', 'istanbul'], winner: 0, points: 6, how: 'Agent Wren folded', strip: null, film: 0, missed: null },
  ],
  highlights: { takedown: { round: 0, by: 'assassin', victim: 'heavy', power: 6, city: 'berlin' }, escalations: { called: 3, won: 2 }, mvp: { kind: 'sleeper', held: 2, power: 8 }, biggest: { round: 2, points: 6 } },
  focus: 0,
  date: '20 October 2026',
  label: 'CASE FILE · Agent Fox vs Agent Wren · 20 October 2026',
  sub: 'You beat Agent Wren 10 to 4.',
  coda: null,
  ...o,
});
const svg = (id) => `<svg data-id="${id}"></svg>`;

test('the evidence slips say the highlights in the brief’s words, in order', () => {
  assert.deepEqual(evidenceSlips(caseData()).map(slipLine), [
    'Best takedown: your Assassin took out a Heavy (6) in Berlin, round 1.',
    'Escalations: 2 of 3 won.',
    'Agent of the match: the Sleeper, held 2 cities.',
    'Biggest round: +6 in round 3.',
  ]);
  const quiet = caseData({ highlights: { takedown: { round: 3, by: 'tripwire', victim: 'assassin', power: 1, city: 'hongkong' }, escalations: { called: 0, won: 0 }, mvp: { kind: 'heavy', held: 1, power: 6 }, biggest: null } });
  assert.deepEqual(evidenceSlips(quiet).map(slipLine), ['Best takedown: your Tripwire took out an Assassin (1) in Hong Kong, round 4.', 'You never went loud.', 'Agent of the match: the Heavy, held 1 city.']);
  // A neutral screen (pass and play, a spectator) names the focus seat.
  const neutral = caseData({ labels: ['Red', 'Teal'], focus: 1, highlights: { ...caseData().highlights, escalations: { called: 0, won: 0 } } });
  assert.deepEqual(evidenceSlips(neutral, { neutral: true }).map(slipLine).slice(0, 2), ['Best takedown: Teal’s Assassin took out a Heavy (6) in Berlin, round 1.', 'Teal never went loud.']);
  // Nothing at all to file: escalations alone.
  assert.deepEqual(evidenceSlips(caseData({ highlights: { takedown: null, escalations: { called: 0, won: 0 }, mvp: null, biggest: null } })).map(slipLine), ['You never went loud.']);
  assert.deepEqual(evidenceSlips(caseData({ highlights: null })), []);
});

test('the case file: label, stamp, heading, score line, one row a round, evidence; no buttons or links inside', () => {
  const html = caseFileHTML(caseData(), { agentSVG: svg });
  assert.ok(html.includes('<p class="label">CASE FILE · Agent Fox vs Agent Wren · 20 October 2026</p>'));
  assert.ok(html.includes('<i class="cf-stamp won" aria-hidden="true">Closed</i>'));
  assert.ok(html.includes('<h2>Mission accomplished</h2>'));
  assert.ok(html.includes('<p class="sub">You beat Agent Wren 10 to 4.</p>'));
  assert.equal((html.match(/<li /g) || []).length, 3);
  assert.equal((html.match(/class="seat /g) || []).length, 2);
  assert.ok(/<p class="score-line"><span class="seat own-0 lead"><span class="nm">You<\/span><span class="score-film"><b>10<\/b><span class="reel own-0" role="img" aria-label="0 of 3 film strips">/.test(html));
  assert.ok(html.includes('<i class="to">to</i>'));
  // The winner's colour on each row; the film frame beside the city the strip came from, in the taker's colour.
  assert.ok(html.includes('<li class="w-me own-0"><span class="n">1</span>'));
  assert.ok(html.includes('<li class="w-them own-1"><span class="n">2</span>'));
  assert.ok(html.includes('Berlin<i class="fr got own-1" role="img" aria-label="Agent Wren took a strip of film from Berlin"'));
  // The one that got away: a pin on its round, the line in its title.
  assert.ok(html.includes('<i class="ga-pin" role="img" aria-label="The one that got away. Turn 6: Heavy to Berlin instead of Moscow would have won the round." title="Turn 6: Heavy to Berlin instead of Moscow would have won the round."></i>'));
  assert.equal((html.match(/ga-pin/g) || []).length, 1);
  assert.ok(html.includes('<span class="how">Agent Wren folded</span>'));
  // The slips: the victim's silhouette on the takedown, the MVP's in the focus seat's colour.
  assert.ok(html.includes('<p class="slip-ev takedown"><span class="ev-art" aria-hidden="true"><svg data-id="heavy"></svg></span><span class="ev-text"><b>Best takedown:</b> your Assassin took out a Heavy (6) in Berlin, round 1.</span></p>'));
  assert.ok(html.includes('<span class="ev-art own-0" aria-hidden="true"><svg data-id="sleeper"></svg></span>'));
  assert.equal((html.match(/class="slip-ev /g) || []).length, 4);
  assert.equal((html.match(/<(button|a)\b/g) || []).length, 0);
});

test('the case file when lost, neutral, without a recap, at four seats, and escaped', () => {
  const lost = caseFileHTML(caseData({ title: 'Burned', won: false, winner: 1 }), { agentSVG: svg, land: true });
  assert.ok(lost.includes('<i class="cf-stamp lost land" aria-hidden="true">Burned</i>'));
  const neutral = caseFileHTML(caseData({ title: 'Red wins', labels: ['Red', 'Teal'] }), { neutral: true, agentSVG: svg });
  assert.ok(neutral.includes('<i class="cf-stamp won" aria-hidden="true">Closed</i>'));
  // No recap (an older host's view): no highlights, so no evidence block, and the rest of the file stands.
  const none = caseFileHTML(caseData({ highlights: null }), { agentSVG: svg });
  assert.ok(!none.includes('evidence') && none.includes('round-strip') && none.includes('score-line'));
  // Four seats: every seat in table order from the bottom seat, no "to".
  const four = caseFileHTML(caseData({ names: ['A', 'B', 'C', 'D'], labels: ['You', 'B', 'C', 'D'], order: [0, 1, 2, 3], scores: [4, 11, 3, 2], strips: [0, 0, 1, 0], winner: 1, won: false }), { agentSVG: svg });
  assert.equal((four.match(/class="seat /g) || []).length, 4);
  assert.ok(four.includes('<p class="score-line many">') && four.includes('class="case-file many n4"') && !four.includes('class="to"'));
  // A coda line, and names escaped everywhere.
  const odd = caseFileHTML(caseData({ labels: ['You', '<b>Wren</b>'], coda: 'You beat Control. There is nobody left to fool.' }), { agentSVG: svg });
  assert.ok(!odd.includes('<b>Wren</b>') && odd.includes('&lt;b&gt;Wren&lt;/b&gt;'));
  assert.ok(odd.includes('<p class="sub coda">You beat Control. There is nobody left to fool.</p>'));
  // Pass and play's pin names its loser.
  const pass = caseFileHTML(caseData({ rounds: [{ ...caseData().rounds[1], missed: { ...CITY_ONLY, no: 1, who: 'Red' } }] }), { neutral: true, agentSVG: svg });
  assert.ok(pass.includes('title="Red: Turn 6: Heavy to Berlin instead of Moscow would have won the round."'));
});

test('the coach: C’s slip with the lesson stamped on it, the text as given (typed or plain), and nothing to press', () => {
  const coach = { title: 'The drop', text: TUTORIAL.turns[0].text };
  const html = coachHTML(coach, { step: 1, total: 6, textHTML: 'Each turn <i>you</i> drop.' });
  assert.equal(html, '<aside class="coach" role="status"><i class="lesson">Briefing 1 of 6 · The drop</i><p>Each turn <i>you</i> drop.</p></aside>');
  // The title is escaped; the text HTML is main.js's own (typedHTML, or esc), so it goes in as it comes.
  const odd = coachHTML({ title: '<b>Odd</b> & co' }, { step: 4, total: 6, textHTML: '&lt;x&gt;' });
  assert.ok(odd.includes('Briefing 4 of 6 · &lt;b&gt;Odd&lt;/b&gt; &amp; co</i>') && odd.includes('<p>&lt;x&gt;</p>'));
  assert.ok(!/<(button|a)\b/.test(html), 'a status slip holds nothing interactive');
  // C's last word (the turn just flipped, or a correction) as a note above the lesson, escaped; none when empty.
  const noted = coachHTML(coach, { step: 2, total: 6, textHTML: 'Tricks fire.', note: 'The <b>Veteran</b> is gone.' });
  assert.equal(noted, '<aside class="coach" role="status"><i class="lesson">Briefing 2 of 6 · The drop</i><p class="note">The &lt;b&gt;Veteran&lt;/b&gt; is gone.</p><p>Tricks fire.</p></aside>');
  assert.equal(coachHTML(coach, { step: 1, total: 6, textHTML: 'x', note: '' }), coachHTML(coach, { step: 1, total: 6, textHTML: 'x' }));
});

// ── how a turn works (the guest's briefing in the lobby) ────────────────────
const TURN_LINES = [
  'Each turn, pick one agent and a city. Your drop is secret until everyone’s is in.',
  'The drops flip together. Tricks fire as the cards turn, First flip first.',
  'After six drops, hold the most cities to take the round: two of three.',
  'Escalate to double the stake; the others fold or play on. The final flip doubles it again.',
];

test('how a turn works: a labelled section, its heading, four lines in order, each with its picture hidden from screen readers', () => {
  const html = briefingHTML();
  assert.ok(html.startsWith('<section class="turn-guide" aria-label="How a turn works"><h3>How a turn works</h3><ol>'), html.slice(0, 120));
  assert.ok(html.endsWith('</ol></section>'));
  const items = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 4);
  items.forEach((li, i) => {
    assert.equal(li, `<span class="art" aria-hidden="true">${briefSVG(i)}</span><p>${TURN_LINES[i]}</p>`);
  });
  // Nothing to press (a friend reads it while the host sets the table), and no em-dashes in the copy.
  assert.ok(!/<(button|a|input)\b|data-action=/.test(html));
  assert.ok(!html.includes('\u2014'));
  // The entrance plays once (main.js asks for it on the first render only); otherwise the same markup.
  assert.equal(briefingHTML({ enter: true }), html.replace('class="turn-guide"', 'class="turn-guide enter"'));
});

test('the four pictures: 160 × 100, cut paper in ink with one accent, distinct, and no text but the drawn "?" and "×2"', () => {
  const svgs = [0, 1, 2, 3].map((i) => briefSVG(i));
  assert.equal(new Set(svgs).size, 4);
  for (const s of svgs) {
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 160 100" fill="currentColor" aria-hidden="true" focusable="false">/);
    // Paths only (ink, and the accent class), so no font or <text> is ever needed.
    const tags = [...s.matchAll(/<(\w+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(tags)].sort(), ['path', 'svg']);
    assert.match(s, /<path class="ac" d="M/);
    assert.match(s, /<path d="M/);
    assert.ok(![...s.matchAll(/class="([^"]+)"/g)].some((m) => m[1] !== 'ac'), 'one accent class only');
    // Every coordinate inside the box (a little jitter aside).
    const nums = [...s.matchAll(/d="([^"]+)"/g)].flatMap((m) => m[1].replace(/[MZ]/g, ' ').trim().split(/\s+/).map(Number));
    assert.ok(nums.every((v, k) => Number.isFinite(v) && v >= -3 && v <= (k % 2 ? 103 : 163)), 'coordinates inside the 160 × 100 box');
  }
  // Seeded: the same drawing every time.
  assert.equal(briefSVG(2), svgs[2]);
});
