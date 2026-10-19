import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, applyVariant, withPatches, configHash } from '../tools/sim/config.mjs';
import { playMatch, playBatch } from '../tools/sim/play.mjs';
import { emptyStats, mergeStats, margin, summarize, compare } from '../tools/sim/stats.mjs';
import { AGENT, RULES } from '../js/data.js';

const tiny = (o = {}) => resolveConfig({ samples: 2, target: 4, ...o });

test('a match replays exactly from its config and index; odd indices swap seats', () => {
  const c = tiny();
  assert.deepEqual(playMatch(c, 3), playMatch(c, 3));
  assert.notDeepEqual(playMatch(c, 3).rounds, playMatch(c, 4).rounds);
  assert.equal(playMatch(c, 0).swapped, false);
  assert.equal(playMatch(c, 1).swapped, true);
});

test('a match record has what every report line needs', () => {
  const m = playMatch(tiny(), 0);
  assert.ok(m.winner === 0 || m.winner === 1);
  assert.ok(m.scores[m.winner] >= 4);
  for (const r of m.rounds) {
    assert.equal(r.cities.length, 3);
    assert.equal(typeof r.tiebreak, 'boolean');
    assert.ok(r.escalations.length <= 1);
    for (const e of r.escalations) assert.ok(['accept', 'fold'].includes(e.answer));
  }
});

test('pinned cities are dealt in every round', () => {
  assert.ok(playMatch(tiny({ pin: ['lisbon'] }), 0).rounds.every((r) => r.cities.includes('lisbon')));
});

test('batches merge to the same numbers as one long batch', () => {
  const c = tiny();
  assert.deepEqual(mergeStats(playBatch(c, 0, 2).stats, playBatch(c, 2, 2).stats), playBatch(c, 0, 4).stats);
});

test('settings patch the data only inside withPatches', () => {
  const before = AGENT.heavy.power;
  withPatches({ 'heavy.power': 5 }, () => assert.equal(AGENT.heavy.power, 5));
  assert.equal(AGENT.heavy.power, before);
  assert.throws(() => withPatches({ 'nobody.power': 1 }, () => {}), /unknown sim setting: nobody.power/);
  assert.throws(() => withPatches({ 'heavy.power': 5 }, () => { throw new Error('boom'); }), /boom/);
  assert.equal(AGENT.heavy.power, before, 'restored after a throw');
});

test('variants change one thing, and the hash follows play-relevant settings only', () => {
  const base = tiny();
  assert.deepEqual(applyVariant(base, 'heavy.power', 5).set, { 'heavy.power': 5 });
  assert.equal(applyVariant(base, 'b', 'control').bots[1].id, 'control');
  assert.deepEqual(applyVariant(base, 'pin', 'lisbon').pin, ['lisbon']);
  assert.notEqual(configHash(applyVariant(base, 'heavy.power', 5)), configHash(base));
  assert.equal(configHash({ ...tiny(), name: 'other' }), configHash(base));
});

test('margins are 95% intervals in percentage points', () => {
  assert.ok(Math.abs(margin(50, 100) - 9.8) < 0.01);
  assert.ok(Math.abs(margin(5000, 10000) - 0.98) < 0.01);
  assert.equal(margin(0, 0), null);
});

test('summaries compute rates and means; a summary compared with itself shows no change', () => {
  const s = emptyStats();
  Object.assign(s, { rounds: 60, escalated: 30, escalatorWon: 18, pointsHist: { 1: 20, 2: 10, 4: 30 } });
  const sum = summarize(s);
  assert.equal(sum.escalation.pct, 50);
  assert.equal(sum.escalatorWins.pct, 60);
  assert.equal(sum.maxStake.pct, 50);
  assert.equal(sum.pointsPerRound.mean, 160 / 60);
  assert.ok(compare(sum, sum).every((row) => row.delta === 0 && !row.sig));
});

test('a mistyped setting throws; optional fields other entries carry are allowed and restored', () => {
  assert.throws(() => withPatches({ 'heavy.powr': 5 }, () => {}), /unknown sim setting: heavy.powr/);
  assert.throws(() => withPatches({ 'toString.x': 1 }, () => {}), /unknown sim setting: toString.x/);
  assert.equal('faceDown' in AGENT.heavy, false);
  withPatches({ 'heavy.faceDown': true }, () => assert.equal(AGENT.heavy.faceDown, true));
  assert.equal('faceDown' in AGENT.heavy, false, 'added field removed again');
});

test('changing a rival keeps a config-wide samples override', () => {
  const c = resolveConfig({ samples: 2 });
  assert.equal(applyVariant(c, 'b', 'control').bots[1].samples, 2);
  assert.equal(applyVariant(applyVariant(c, 'samples', 5), 'a', 'wren').bots[0].samples, 5);
  assert.equal(applyVariant(resolveConfig({}), 'b', 'control').bots[1].samples, 80);
});

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rmSync, readdirSync } from 'node:fs';
import { after } from 'node:test';
const SIM = fileURLToPath(new URL('../tools/sim.mjs', import.meta.url));
const SIM_TMP = fileURLToPath(new URL('../../../.tmp/dead-drop-sim/', import.meta.url));
after(() => {
  try {
    for (const f of readdirSync(SIM_TMP)) if (f.startsWith('test-sim-')) rmSync(SIM_TMP + f);
  } catch {}
});
const sim = (...args) =>
  JSON.parse(execFileSync(process.execPath, [SIM, '--json', '--samples', '2', '--target', '4', '--rounds', '30', ...args], { encoding: 'utf8' }));

test('the CLI gives identical numbers on one or two workers, and resumes', () => {
  const one = sim('--workers', '1', '--run', 'test-sim-w1');
  const two = sim('--workers', '2', '--run', 'test-sim-w2');
  assert.ok(one.runs.base.rounds >= 30);
  assert.deepEqual(two.runs.base.stats, one.runs.base.stats);
  const again = sim('--workers', '2', '--run', 'test-sim-w2', '--resume');
  assert.ok(again.resumedBatches > 0);
  assert.deepEqual(again.runs.base.stats, one.runs.base.stats);
  const vs = sim('--workers', '1', '--run', 'test-sim-w1b', '--against', '.tmp/dead-drop-sim/test-sim-w1.json');
  assert.ok(vs.against.every((row) => row.delta === 0));
});

test('variants share seeds; probes and the ladder name their runs', () => {
  const ab = sim('--workers', '2', '--run', 'test-sim-ab', '--variant', 'same:target=4', '--variant', 'heavy5:heavy.power=5');
  assert.deepEqual(ab.runs.same.stats, ab.runs.base.stats);
  assert.notDeepEqual(ab.runs.heavy5.stats, ab.runs.base.stats);
  const probe = sim('--workers', '2', '--run', 'test-sim-probe', '--rounds', '10', '--probe', 'agents');
  assert.equal(Object.keys(probe.runs).length, 13);
  assert.equal(probe.runs['heavy+1'].config.set['heavy.power'], 7);
  const ladder = sim('--workers', '2', '--run', 'test-sim-ladder', '--rounds', '10', '--ladder');
  assert.deepEqual(Object.keys(ladder.runs), ['wren-magpie', 'magpie-heron', 'heron-countess', 'countess-control']);
});

test('the CLI rejects bad numbers and unknown options instead of hanging', () => {
  for (const args of [['--rounds', 'abc'], ['--round', '30'], ['--workers', '0'], ['--target', '1.5']]) {
    assert.throws(() => execFileSync(process.execPath, [SIM, ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }), (e) => e.status === 1 && /sim: /.test(e.stderr));
  }
});

test('rules settings patch RULES inside withPatches only', () => {
  assert.equal(RULES.lisbonTiebreak, 'out');
  withPatches({ 'rules.lisbonTiebreak': 'invert' }, () => assert.equal(RULES.lisbonTiebreak, 'invert'));
  assert.equal(RULES.lisbonTiebreak, 'out');
  assert.throws(() => withPatches({ 'rules.lisbonTiebrk': 'x' }, () => {}), /unknown sim setting/);
});
