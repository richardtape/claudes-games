// Card counting (Phase 2b-ii, spec 2.7). Every match deals one public roster, so each rival's strip lists
// the agents of its deck list you haven't seen yet this round. Pure: reads views only, no DOM.

const known = (v) => v !== null && v !== undefined;

/**
 * Every card whose identity `view` shows: [{ uid, origin, id0 }], each uid once. Its sources are the
 * board, `gone` (taken-out cards are turned face up), the turned assets in your hand (cards from a rival's
 * deck), and this turn's `drop` and `reveal` events that carry a kind. A rival's face-down card never
 * counts: its view hides its id0, and the events hide its kind. Your own cards count where they are
 * shown, so a turned asset you drop face down stays seen; filter by origin for a rival's strip.
 *
 * A view holds only the latest turn's events, so the caller merges sightings by uid across a round's
 * views. An event's card that has left the view (sent home under a fresh uid) takes its seat as origin.
 */
export function sightings(view) {
  const R = view.round;
  const out = [];
  const taken = new Set();
  const cards = new Map();
  const add = (uid, origin, id0) => {
    if (!known(uid) || !known(origin) || !known(id0) || taken.has(uid)) return;
    taken.add(uid);
    out.push({ uid, origin, id0 });
  };
  const shown = (c) => {
    cards.set(c.uid, c);
    add(c.uid, c.origin, c.id0);
  };
  for (const city of R.cities) for (const side of city.sides) for (const c of side) shown(c);
  for (const side of R.gone) for (const c of side) shown(c);
  for (const c of R.hand) {
    cards.set(c.uid, c);
    if (c.origin !== view.seat) add(c.uid, c.origin, c.id0);
  }
  for (const e of R.events) {
    if ((e.t !== 'drop' && e.t !== 'reveal') || !known(e.kind)) continue;
    // The card as the view shows it now wins: a card that has since gone face down to a rival stays hidden.
    const c = cards.get(e.uid);
    if (c) add(c.uid, c.origin, c.id0);
    else add(e.uid, e.seat, e.kind);
  }
  return out;
}

/**
 * `list` (a deck list, e.g. engine.deckList(view, seat)) minus one copy per sighting, in list order.
 * A sighting removes at most the copies `list` has of its kind; kinds not in `list` change nothing.
 */
export function unseen(list, seenId0s) {
  const left = new Map();
  for (const id of seenId0s) left.set(id, (left.get(id) || 0) + 1);
  const out = [];
  for (const id of list) {
    const n = left.get(id);
    if (n) left.set(id, n - 1);
    else out.push(id);
  }
  return out;
}
