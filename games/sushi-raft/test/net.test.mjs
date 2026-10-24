import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHub } from '../../../shared/net.js';
import { guestSession, hostSession, roomToken } from '../js/net-play.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function host(room) {
  const log = { acts: [], status: [] };
  const S = hostSession({ room, onAct: (a) => log.acts.push(a), onStatus: (s) => log.status.push(s) });
  return { S, log };
}
function guest(room, token) {
  const log = { snaps: [], status: [] };
  const G = guestSession({ room, token, onSnap: (s) => log.snaps.push(s), onStatus: (s) => log.status.push(s) });
  return { G, log };
}

test('a guest is welcomed to Kelp, sends actions, and receives snapshots', async () => {
  const hub = createMemoryHub(2);
  const h = host(hub.rooms[0]);
  const g = guest(hub.rooms[1], await roomToken('tok-a', 'CODE'));
  hub.connect();
  await tick(20);
  assert.deepEqual(g.log.status, ['welcome']);
  assert.deepEqual(h.log.status, ['joined']);
  g.G.act('tap', { c: 3, r: 0 });
  h.S.snap({ n: 1 });
  await tick(20);
  assert.deepEqual(h.log.acts, [{ type: 'tap', c: 3, r: 0 }]);
  assert.deepEqual(g.log.snaps, [{ n: 1 }]);
  h.S.close();
  g.G.leave();
});

test('a third browser is turned away while Kelp is taken, and a reload gets Kelp back', async () => {
  const hub = createMemoryHub(2);
  const h = host(hub.rooms[0]);
  const tokA = await roomToken('tok-a', 'CODE');
  const g = guest(hub.rooms[1], tokA);
  hub.connect();
  await tick(20);
  const third = guest(hub.add(), await roomToken('tok-b', 'CODE'));
  hub.connect();
  await tick(20);
  assert.deepEqual(third.log.status, ['nope:full']);
  // The guest reloads: its old room leaves, a new one joins with the same token.
  g.G.leave();
  await tick(20);
  const again = guest(hub.add(), tokA);
  hub.connect();
  await tick(20);
  assert.deepEqual(again.log.status, ['welcome']);
  assert.equal(h.log.status.at(-1), 'back');
  h.S.close();
  again.G.leave();
  third.G.leave();
});

test('the token on the wire is a per-room hash, never the browser token', async () => {
  const hub = createMemoryHub(2);
  const heard = [];
  const deliver = hub.rooms[0]._deliver;
  hub.rooms[0]._deliver = (type, data, from) => {
    heard.push(JSON.stringify(data));
    deliver(type, data, from);
  };
  const h = host(hub.rooms[0]);
  const g = guest(hub.rooms[1], await roomToken('secret-token', 'ROOM1'));
  hub.connect();
  await tick(20);
  assert.ok(!heard.some((m) => m.includes('secret-token')));
  assert.notEqual(await roomToken('secret-token', 'ROOM1'), await roomToken('secret-token', 'ROOM2'));
  h.S.close();
  g.G.leave();
});

test('the host hears when the guest hides its tab and comes back', async () => {
  const hub = createMemoryHub(2);
  const h = host(hub.rooms[0]);
  const g = guest(hub.rooms[1], 'x');
  hub.connect();
  await tick(20);
  g.G.hidden(true);
  await tick(20);
  assert.ok(h.S.away);
  g.G.hidden(false);
  await tick(20);
  assert.ok(!h.S.away);
  assert.deepEqual(h.log.status, ['joined', 'away', 'here']);
  h.S.close();
  g.G.leave();
});
