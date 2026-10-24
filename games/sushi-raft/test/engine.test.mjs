import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { CANAL, DISHES, TIMES, LAYOUTS } from '../js/data.js';

const DT = 1 / 60;
const run = (st, secs, each) => {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    E.step(st, DT);
    if (each?.(st) === true) return true;
  }
  return false;
};
const until = (st, pred, secs = 30) => run(st, secs, pred);
const events = (st, type) => st.events.filter((e) => e.type === type);
const night = (seed = 't1', opts = {}) => {
  const st = E.newWeek({ seed, ...opts });
  E.openNight(st);
  st.svc.arrivals = []; // tests seat their own customers
  return st;
};
/** Seat a customer wanting `order` at `seat`, ready to grab. */
function sit(st, seat, order, sp = 'seal') {
  const cu = { id: st.svc.nextId++, sp, seat, phase: 'wait', t: 0, order: order.slice(), ate: [], pat: 60, patMax: 60, huff: false };
  st.svc.seats[seat] = cu.id;
  st.svc.customers.push(cu);
  return cu;
}
const tile = (st, c, r) => E.tileAt(st.svc, c, r);
/** Walk the open kitchen's stations by letter. */
function find(st, k, ing) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if (tile(st, c, r).k === k && (!ing || tile(st, c, r).ing === ing)) return [c, r];
  throw new Error(`no ${k} ${ing || ''}`);
}

test('a week is dealt the same from the same seed, with the split kitchen midweek and the festival on Friday', () => {
  const a = E.newWeek({ seed: 'abc' });
  const b = E.newWeek({ seed: 'abc' });
  assert.deepEqual(a.twists, b.twists);
  for (let s = 0; s < 40; s++) {
    const w = E.newWeek({ seed: `s${s}` });
    assert.equal(w.twists[0], null);
    assert.equal(w.twists[4], 'festival');
    assert.equal(w.twists.slice(1, 4).filter((t) => t === 'split').length, 1);
    assert.equal(new Set(w.twists.slice(1, 4)).size, 3);
  }
});

test('the canal is one continuous loop that passes the dock on the near lane and the seats on the far lane', () => {
  let prev = E.canalPoint(0);
  for (let s = 0.01; s <= E.CANAL_LENGTH + 0.001; s += 0.01) {
    const p = E.canalPoint(s);
    assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 0.02, `jump at s=${s.toFixed(2)}`);
    prev = p;
  }
  const d = E.canalPoint(E.sNear(2.5));
  assert.equal(d.lane, 'near');
  assert.ok(Math.abs(d.x - 2.5) < 1e-9 && d.y === CANAL.near);
  for (let i = 0; i < 6; i++) {
    const p = E.canalPoint(E.sFar(E.seatX(i)));
    assert.equal(p.lane, 'far');
    assert.ok(Math.abs(p.x - E.seatX(i)) < 1e-9);
  }
});

test('plates only take parts that lead to a dish on the menu', () => {
  const st = E.newWeek({ seed: 'x' });
  const plate = { plate: true, parts: [] };
  assert.ok(E.canAdd(st, plate, 'rice'));
  assert.ok(E.canAdd(st, plate, 'salmon_s'));
  assert.ok(!E.canAdd(st, plate, 'tuna_s'), 'tuna is not on the menu yet');
  assert.ok(!E.canAdd(st, plate, 'nori'));
  assert.ok(!E.canAdd(st, plate, 'salmon'), 'raw salmon is not a plate part');
  st.menu.push('tuna_nigiri');
  assert.ok(E.canAdd(st, plate, 'tuna_s'));
  assert.ok(!E.canAdd(st, { plate: true, parts: ['salmon_s'] }, 'tuna_s'));
  assert.equal(E.dishOf(st, { plate: true, parts: ['salmon_s', 'rice'] }), 'salmon_nigiri');
  assert.equal(E.dishOf(st, { plate: true, parts: ['rice'] }), null);
});

test('stations for dishes not on the menu are counters until the dish is bought', () => {
  const g1 = E.buildGrid('open', ['salmon_nigiri']);
  assert.equal(g1.filter((t) => t.k === 'crate').length, 1);
  assert.ok(!g1.some((t) => t.k === 'pan' || t.k === 'fryer'));
  assert.equal(g1.filter((t) => t.k === 'board').length, 1);
  const all = Object.keys(DISHES);
  for (const layout of Object.keys(LAYOUTS)) {
    const g = E.buildGrid(layout, all, { board2: true });
    assert.equal(g.filter((t) => t.k === 'crate').length, 7, layout);
    assert.ok(g.some((t) => t.k === 'pan') && g.some((t) => t.k === 'fryer'), layout);
    assert.equal(g.filter((t) => t.k === 'board').length, 2, layout);
  }
});

test('every station in every kitchen can be used by some otter', () => {
  const all = Object.keys(DISHES);
  for (const layout of Object.keys(LAYOUTS)) {
    const st = E.newWeek({ seed: 'r' });
    st.menu = all.slice();
    st.up.board2 = true;
    st.twists[0] = layout === 'split' ? 'split' : null;
    E.openNight(st);
    assert.equal(st.svc.layout, layout);
    st.svc.grid.forEach((t, i) => {
      if (t.k === 'floor' || t.k === 'counter') return;
      const c = i % 6;
      const r = Math.floor(i / 6);
      assert.ok(E.canReach(st.svc, 0, c, r) || E.canReach(st.svc, 1, c, r), `${layout}: ${t.k} at ${c},${r}`);
    });
  }
});

test('an otter makes salmon nigiri from taps and launches it onto a raft', () => {
  const st = night();
  const steps = [find(st, 'crate', 'salmon'), find(st, 'board'), find(st, 'plates'), find(st, 'board'), find(st, 'cooker'), find(st, 'dock')];
  for (const [c, r] of steps.slice(0, 4)) assert.ok(E.tap(st, 0, c, r).ok);
  assert.equal(E.tap(st, 0, ...steps[4]).ok, false, 'the queue holds four');
  assert.ok(until(st, (s) => s.svc.otters[0].queue.length === 0 && !s.svc.otters[0].goal && !s.svc.otters[0].path.length && s.svc.otters[0].busy <= 0 && !s.svc.otters[0].act, 20));
  for (const [c, r] of steps.slice(4)) assert.ok(E.tap(st, 0, c, r).ok);
  assert.ok(until(st, (s) => events(s, 'load').length > 0, 30), 'the plate sailed');
  assert.equal(events(st, 'load')[0].dish, 'salmon_nigiri');
  assert.equal(events(st, 'sliced').length, 1);
  assert.equal(events(st, 'fail').length, 0);
  assert.equal(tile(st, ...find(st, 'cooker')).servings, TIMES.riceServings - 1);
});

test('a customer grabs the dish they want from a passing raft, eats, and pays with a tip', () => {
  const st = night();
  const cu = sit(st, 2, ['salmon_nigiri']);
  st.svc.rafts[0].plate = { plate: true, parts: ['rice', 'salmon_s'] };
  st.svc.rafts[1].plate = { plate: true, parts: ['rice'] }; // not a dish: never taken
  assert.ok(until(st, (s) => events(s, 'grab').length > 0, 20));
  assert.equal(cu.phase, 'eat');
  assert.ok(until(st, (s) => events(s, 'pay').length > 0, 10));
  const pay = events(st, 'pay')[0];
  assert.equal(pay.base, 2);
  assert.ok(pay.tip >= 0 && pay.amount === pay.base + pay.tip);
  assert.equal(st.svc.takings, pay.amount);
  assert.ok(st.svc.rafts[1].plate, 'the unfinished plate is still sailing');
});

test('unclaimed plates go soggy after two laps', () => {
  const st = night();
  st.svc.rafts[3].plate = { plate: true, parts: ['rice', 'salmon_s'] };
  assert.ok(until(st, (s) => events(s, 'soggy').length > 0, (E.CANAL_LENGTH / CANAL.speed) * 2.2));
  assert.equal(st.svc.rafts[3].plate, null);
});

test('in the split kitchen each otter keeps to its side and auto taps go to the one who can reach', () => {
  const st = E.newWeek({ seed: 'split' });
  st.twists[0] = 'split';
  E.openNight(st);
  const dock = find(st, 'dock');
  const salmon = find(st, 'crate', 'salmon');
  assert.ok(!E.canReach(st.svc, 0, ...dock));
  assert.ok(E.canReach(st.svc, 1, ...dock));
  assert.ok(!E.canReach(st.svc, 1, ...salmon));
  assert.equal(E.tap(st, 0, ...dock).ok, false);
  assert.equal(events(st, 'cantReach').length, 1);
  assert.equal(E.tap(st, 'auto', ...dock).otter, 1);
  assert.equal(E.tap(st, 'auto', ...salmon).otter, 0);
  // The pass counters are shared: the selected otter takes them.
  st.sel = 1;
  assert.equal(E.tap(st, 'auto', 2, 2).otter, 1);
  st.sel = 0;
  assert.equal(E.tap(st, 'auto', 2, 2).otter, 0);
});

test('passing over the counter: one otter slices, the other plates it', () => {
  const st = E.newWeek({ seed: 'pass' });
  st.twists[0] = 'split';
  E.openNight(st);
  st.svc.arrivals = [];
  const [L, R] = [0, 1];
  for (const t of [find(st, 'crate', 'salmon'), find(st, 'board'), find(st, 'board'), [2, 2]]) E.tap(st, L, ...t);
  for (const t of [find(st, 'plates'), find(st, 'cooker')]) E.tap(st, R, ...t);
  assert.ok(until(st, (s) => tile(s, 2, 2).item?.k === 'salmon_s', 20), 'salmon passed');
  for (const t of [[2, 2], find(st, 'dock')]) E.tap(st, R, ...t);
  assert.ok(until(st, (s) => events(s, 'load').length > 0, 20));
});

test('the pan cooks, then burns; the kitchen timer doubles the grace', () => {
  for (const timer of [false, true]) {
    const st = E.newWeek({ seed: 'pan' });
    st.menu.push('kappa_maki', 'tamago');
    if (timer) st.up.timer = true;
    E.openNight(st);
    st.svc.arrivals = [];
    const pan = find(st, 'pan');
    tile(st, ...pan).item = { k: 'egg', cook: 0 };
    run(st, TIMES.pan + 0.1);
    assert.equal(tile(st, ...pan).item.k, 'egg_c');
    run(st, TIMES.panBurn - 0.3);
    assert.equal(tile(st, ...pan).item.k, 'egg_c');
    run(st, 0.5);
    assert.equal(tile(st, ...pan).item.k, timer ? 'egg_c' : 'egg_b');
  }
});

test('the rice cooker runs out and an otter has to start it again', () => {
  const st = night();
  const ck = find(st, 'cooker');
  tile(st, ...ck).servings = 0;
  E.tap(st, 0, ...ck);
  assert.ok(until(st, (s) => events(s, 'riceStart').length > 0, 5));
  assert.ok(until(st, (s) => events(s, 'riceDone').length > 0, 10));
  assert.equal(tile(st, ...ck).servings, TIMES.riceServings);
});

test('a customer left waiting huffs off, pays only for what they ate, and the lanterns go out', () => {
  const st = night();
  const cu = sit(st, 0, ['salmon_nigiri', 'salmon_nigiri']);
  cu.ate.push({ dish: 'salmon_nigiri', price: 2 });
  cu.pat = 1;
  st.svc.lanterns = 3;
  run(st, 1.2);
  assert.equal(events(st, 'huff').length, 1);
  assert.equal(events(st, 'pay')[0].amount, 2);
  assert.equal(st.svc.lanterns, 0);
});

test('five plates light the lanterns; plates in the Rush count double', () => {
  const st = night();
  for (let s = 0; s < 6; s++) sit(st, s, ['salmon_nigiri', 'salmon_nigiri']);
  st.svc.rafts.forEach((r, i) => (r.plate = i < 11 ? { plate: true, parts: ['rice', 'salmon_s'] } : null));
  assert.ok(until(st, (s) => events(s, 'rush').length > 0, 20));
  assert.equal(events(st, 'lantern').length, 5);
  assert.ok(until(st, (s) => events(s, 'grab').length > 5, 20));
  const after = events(st, 'grab').slice(5);
  assert.ok(after.every((g) => g.rush && g.price === 4));
});

test('closing a night pays rent from the purse; a purse that cannot cover it closes the pier', () => {
  const st = night();
  st.svc.takings = 30;
  E.closeNight(st);
  assert.equal(st.purse, 30 - E.rentFor(st));
  assert.equal(st.result, null);
  assert.ok(E.toMorning(st));
  assert.equal(st.phase, 'morning');
  assert.equal(st.night, 1);
  assert.ok(st.offers.length >= 3);
  E.openNight(st);
  st.svc.arrivals = [];
  st.svc.takings = 0;
  E.closeNight(st);
  assert.equal(st.result, 'closed');
  E.toMorning(st);
  assert.equal(st.phase, 'over');
});

test('the market sells what the purse can afford, once', () => {
  const st = E.newWeek({ seed: 'm' });
  st.night = 1;
  E.makeOffers(st);
  const i = st.offers.findIndex((o) => o.kind === 'dish');
  const cost = E.offerCost(st.offers[i]);
  st.purse = cost - 1;
  assert.equal(E.buy(st, i), false);
  st.purse = cost + 5;
  assert.ok(E.buy(st, i));
  assert.equal(st.purse, 5);
  assert.equal(E.buy(st, i), false);
  assert.ok(st.menu.includes(st.offers[i].id));
});

test('random tapping through a whole night never breaks the kitchen, and the night always closes', () => {
  for (let s = 0; s < 6; s++) {
    const st = E.newWeek({ seed: `rand${s}` });
    st.menu = Object.keys(DISHES);
    st.up.board2 = true;
    if (s % 2) st.twists[0] = 'split';
    E.openNight(st);
    let r = s * 7919 + 1;
    const rand = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
    let ticks = 0;
    while (st.phase === 'service') {
      if (ticks++ % 20 === 0) E.tap(st, rand() < 0.5 ? 0 : 'auto', Math.floor(rand() * 6), Math.floor(rand() * 6));
      E.step(st, DT);
      for (const o of st.svc.otters) {
        assert.ok(!o.hold || o.hold.plate || o.hold.k, 'held things are items');
        const t = E.tileAt(st.svc, o.c, o.r);
        assert.equal(t.k, 'floor', 'otters stand on the floor');
      }
      assert.ok(ticks < (TIMES.open + TIMES.lastOrders + 2) * 60, 'the night ended');
    }
    assert.equal(st.phase, 'closed');
  }
});

test('the same seed and the same taps replay the same night exactly', () => {
  const play = () => {
    const st = E.newWeek({ seed: 'replay' });
    E.openNight(st);
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 90 === 0) E.tap(st, 'auto', i % 6, (i / 90) % 6 | 0);
      E.step(st, DT);
    }
    return JSON.stringify(st);
  };
  assert.equal(play(), play());
});
