// The kitchen's reading aids: where the thing in your paws goes next (the station glow) and which
// plates are already sailing to which customer (the ticks in the order bubbles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { createBot } from '../js/bot.js';

const DT = 1 / 60;
const run = (st, secs, each) => {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    E.step(st, DT);
    if (each?.(st) === true) return true;
  }
  return false;
};
const events = (st, type) => st.events.filter((e) => e.type === type);
const night = (seed = 'h1', opts = {}) => {
  const st = E.newWeek({ seed });
  if (opts.split) st.twists[0] = 'split';
  if (opts.menu) st.menu = opts.menu.slice();
  E.openNight(st);
  st.svc.arrivals = [];
  return st;
};
const tile = (st, c, r) => E.tileAt(st.svc, c, r);
function find(st, k, ing) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if (tile(st, c, r).k === k && (!ing || tile(st, c, r).ing === ing)) return [c, r];
  throw new Error(`no ${k} ${ing || ''}`);
}
const keys = (list) => list.map((p) => `${p.c},${p.r}`).sort();
const at = (...tiles) => tiles.map(([c, r]) => `${c},${r}`).sort();
function sit(st, seat, order, sp = 'seal') {
  const cu = { id: st.svc.nextId++, sp, seat, phase: 'wait', t: 0, order: order.slice(), ate: [], pat: 60, patMax: 60, huff: false };
  st.svc.seats[seat] = cu.id;
  st.svc.customers.push(cu);
  return cu;
}
const SALMON = () => ({ plate: true, parts: ['rice', 'salmon_s'] });

// ── nextStops: the glow ──

test('raw salmon in your paws glows the cutting board, and nothing else', () => {
  const st = night();
  st.svc.otters[0].hold = { k: 'salmon' };
  assert.deepEqual(keys(E.nextStops(st, 0)), at(find(st, 'board')));
});

test('a busy board does not glow for raw fish', () => {
  const st = night();
  const [c, r] = find(st, 'board');
  tile(st, c, r).item = { k: 'tuna', prog: 0.2 };
  st.svc.otters[0].hold = { k: 'salmon' };
  assert.deepEqual(E.nextStops(st, 0), []);
});

test('sliced salmon glows the plate stack and any plate on a counter it can join', () => {
  const st = night();
  tile(st, 2, 2).item = { plate: true, parts: [] };
  tile(st, 3, 2).item = { plate: true, parts: ['rice', 'salmon_s'] }; // already has salmon
  st.svc.otters[0].hold = { k: 'salmon_s' };
  assert.deepEqual(keys(E.nextStops(st, 0)), at(find(st, 'plates'), [2, 2]));
});

test('a finished dish glows the dock, unless a plate is already waiting there', () => {
  const st = night();
  st.svc.otters[0].hold = SALMON();
  assert.deepEqual(keys(E.nextStops(st, 0)), at(find(st, 'dock')));
  tile(st, ...find(st, 'dock')).item = SALMON();
  assert.deepEqual(E.nextStops(st, 0), []);
});

test('a plate in progress glows what it still needs: rice from the cooker, a slice waiting on the board', () => {
  const st = night('h1', { menu: ['salmon_nigiri', 'tuna_nigiri'] });
  const board = find(st, 'board');
  tile(st, ...board).item = { k: 'tuna_s', prog: 1 };
  st.svc.otters[0].hold = { plate: true, parts: [] };
  assert.deepEqual(keys(E.nextStops(st, 0)), at(find(st, 'cooker'), board));
  st.svc.otters[0].hold = { plate: true, parts: ['rice'] };
  assert.deepEqual(keys(E.nextStops(st, 0)), at(board), 'rice is on: only the tuna is left');
  tile(st, ...find(st, 'cooker')).servings = 0;
  st.svc.otters[0].hold = { plate: true, parts: ['tuna_s'] };
  assert.deepEqual(E.nextStops(st, 0), [], 'an empty cooker has no rice to give');
});

test('in the split kitchen, a slice for the far side glows the empty pass counters', () => {
  const st = night('hs', { split: true });
  st.svc.otters[0].hold = { k: 'salmon_s' };
  const pass = [];
  st.svc.grid.forEach((t, i) => {
    const c = i % 6;
    const r = Math.floor(i / 6);
    if (t.k === 'counter' && !t.item && E.canReach(st.svc, 0, c, r) && E.canReach(st.svc, 1, c, r)) pass.push([c, r]);
  });
  assert.ok(pass.length >= 3, 'the layout has a pass');
  assert.deepEqual(keys(E.nextStops(st, 0)), at(...pass));
  // On the other side, a slice set on the pass glows for the otter holding the plate.
  tile(st, 2, 2).item = { k: 'salmon_s' };
  st.svc.otters[1].hold = { plate: true, parts: ['rice'] };
  assert.deepEqual(keys(E.nextStops(st, 1)), at([2, 2]));
});

test('burnt food glows the bin', () => {
  const st = night('h1', { menu: ['salmon_nigiri', 'kappa_maki', 'tamago'] });
  st.svc.otters[0].hold = { k: 'egg_b' };
  assert.deepEqual(keys(E.nextStops(st, 0)), at(find(st, 'bin')));
});

test('empty paws glow nothing', () => {
  const st = night();
  assert.deepEqual(E.nextStops(st, 0), []);
});

test('every glowing station is a tap that moves the dish on (random bot nights)', () => {
  const PROGRESS = new Set(['add', 'plate', 'launch', 'cook']);
  let checked = 0;
  for (let s = 0; s < 4; s++) {
    const st = E.newWeek({ seed: `glow${s}` });
    st.menu = ['salmon_nigiri', 'tuna_nigiri', 'kappa_maki', 'tamago', 'ebi'];
    if (s % 2) st.twists[0] = 'split';
    E.openNight(st);
    const bot = createBot({ otters: [0, 1], skill: 0.8, seed: s + 1, fumbles: true });
    for (let i = 0; st.phase === 'service' && i < 60 * 120; i++) {
      bot.tick(st, DT);
      E.step(st, DT);
      if (i % 37) continue;
      for (const oi of [0, 1]) {
        for (const p of E.nextStops(st, oi)) {
          const copy = JSON.parse(JSON.stringify(st));
          for (const o of copy.svc.otters) Object.assign(o, { queue: [], goal: null, act: null });
          copy.svc.otters.forEach((o) => (o.path = o.path.slice(0, 1)));
          const from = copy.eventSeq;
          assert.ok(E.tap(copy, oi, p.c, p.r).ok, 'the stop is reachable');
          let out = null;
          run(copy, 8, (x) => {
            out = x.events.find((e) => e.id > from && e.o === oi && ['do', 'fail', 'slice'].includes(e.type) && e.c === p.c && e.r === p.r);
            return !!out;
          });
          const pass = tile(copy, p.c, p.r).k === 'counter' && out?.type === 'do' && out.what === 'put';
          assert.ok(out && (out.type === 'slice' || PROGRESS.has(out.what) || pass), `otter ${oi} holding ${JSON.stringify(st.svc.otters[oi].hold)} at ${p.c},${p.r}: ${JSON.stringify(out)}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100, `checked ${checked} glows`);
});

// ── onTheWay: the ticks ──

test('a plate sailing toward a customer who wants it is theirs, and they grab it', () => {
  const st = night();
  const cu = sit(st, 2, ['salmon_nigiri', 'tuna_nigiri']);
  st.svc.rafts[0].plate = SALMON();
  assert.deepEqual(E.onTheWay(st), { [cu.id]: ['salmon_nigiri'] });
  assert.ok(run(st, 20, (s) => events(s, 'grab').length > 0));
  assert.equal(events(st, 'grab')[0].cu, cu.id);
});

test('one plate for two customers who both want it goes to the one it reaches first', () => {
  for (const raft of [0, 3, 6, 9]) {
    const st = night();
    const a = sit(st, 1, ['salmon_nigiri']);
    const b = sit(st, 4, ['salmon_nigiri']);
    st.svc.rafts[raft].plate = SALMON();
    const ways = E.onTheWay(st);
    const who = Object.keys(ways).map(Number);
    assert.equal(who.length, 1, `raft ${raft}: one customer is ticked`);
    assert.ok(run(st, 20, (s) => events(s, 'grab').length > 0));
    assert.equal(events(st, 'grab')[0].cu, who[0], `raft ${raft}: the ticked customer grabbed it`);
    assert.ok([a.id, b.id].includes(who[0]));
  }
});

test('a customer busy eating lets the next plate sail on to someone further along', () => {
  const st = night();
  st.svc.canal = 0;
  const a = sit(st, 4, ['salmon_nigiri', 'salmon_nigiri']);
  const b = sit(st, 1, ['salmon_nigiri']);
  // Two salmon plates on neighbouring rafts, under a second apart: the first reaches seat 4,
  // the second arrives while that customer is still eating.
  st.svc.rafts[0].plate = SALMON();
  st.svc.rafts[1].plate = SALMON();
  assert.deepEqual(E.onTheWay(st), { [a.id]: ['salmon_nigiri'], [b.id]: ['salmon_nigiri'] });
  assert.ok(run(st, 20, (s) => events(s, 'grab').length >= 2));
  assert.deepEqual(events(st, 'grab').map((e) => e.cu).sort(), [a.id, b.id].sort());
});

test('a plate waiting at the dock counts as on its way; a plate nobody wants counts for no one', () => {
  const st = night();
  const cu = sit(st, 3, ['salmon_nigiri']);
  tile(st, ...find(st, 'dock')).item = SALMON();
  assert.deepEqual(E.onTheWay(st), { [cu.id]: ['salmon_nigiri'] });
  tile(st, ...find(st, 'dock')).item = null;
  st.svc.rafts[2].plate = { plate: true, parts: ['rice', 'tuna_s'] };
  assert.deepEqual(E.onTheWay(st), {});
});

test('ticked plates are grabbed by the ticked customer (random bot nights)', () => {
  let said = 0;
  let true_ = 0;
  for (let s = 0; s < 4; s++) {
    const st = E.newWeek({ seed: `way${s}` });
    st.menu = ['salmon_nigiri', 'tuna_nigiri', 'kappa_maki'];
    st.night = 2;
    E.openNight(st);
    const bot = createBot({ otters: [0, 1], skill: 0.9, seed: s + 7, fumbles: false });
    for (let i = 0; st.phase === 'service' && i < 60 * 140; i++) {
      bot.tick(st, DT);
      E.step(st, DT);
      if (i % 120 || i < 60 * 20) continue;
      const ways = E.onTheWay(st);
      if (!Object.keys(ways).length) continue;
      // Play on with no new plates and no gulls (the ticks don't foresee a theft) and see who grabs what.
      const copy = JSON.parse(JSON.stringify(st));
      for (const o of copy.svc.otters) Object.assign(o, { queue: [], goal: null, act: null, path: [] });
      copy.svc.arrivals = [];
      copy.svc.gulls = [];
      copy.svc.gullAt = Infinity;
      let last = copy.eventSeq;
      const got = {};
      run(copy, 30, (x) => {
        for (const e of x.events) {
          if (e.id <= last) continue;
          last = e.id;
          if (e.type === 'grab') (got[e.cu] ||= []).push(e.dish);
        }
      });
      for (const [id, dishes] of Object.entries(ways))
        for (const d of dishes) {
          said++;
          const g = got[id] || [];
          const k = g.indexOf(d);
          if (k >= 0) {
            g.splice(k, 1);
            true_++;
          }
        }
    }
  }
  assert.ok(said > 60, `${said} ticks checked`);
  assert.equal(true_, said, `${true_} of ${said} ticks came true`);
});
