// Scripted play-through for `npm run check` (desktop, then phone with ctx.phone): title, help,
// album, today's flight (the burner held through the real button), first light, a cross approached
// on the autopilot and dropped with the Drop button, a photo through the Photo button, pause and
// resume, the landing and certificate, the album with a photo, and resuming a saved flight after a
// reload. Time runs on the manual clock (__game.advance), so nothing depends on wall-clock speed.
export default async function smoke(page, { log, shot, audit, phone }) {
  const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
  const settle = () => page.waitForTimeout(450);
  const g = (fn, arg) => page.evaluate(fn, arg);

  // Start clean, so the album and Continue start empty.
  await g(() => Object.keys(localStorage).filter((k) => k.startsWith('cg:first-light:')).forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  await until(() => document.documentElement.dataset.ready === '1');
  await g(() => (window.__game.loop.manual = true));
  await settle();
  await shot('title');
  await audit('title');

  // Help and album sheets.
  await page.click('.title-card [data-action="help"]');
  await until(() => document.querySelector('#help').open);
  await settle();
  await shot('help');
  await audit('help');
  await page.click('#help [data-action="close"]');
  await page.click('.title-card [data-action="album"]');
  await until(() => document.querySelector('#album').open);
  await shot('album-empty');
  await page.click('#album [data-action="close"]');

  // Today's flight: standing on the launch field.
  await page.click('[data-action="daily"]');
  await until(() => window.__game.state.screen === 'play');
  await g(() => window.__game.advance(0.5));
  await settle();
  await shot('launch-field');
  await audit('launch field');
  if ((await g(() => window.__game.state.flight.phase)) !== 'ready') throw new Error('flight did not start on the launch field');

  // Hold the burner through the button itself (pointer events, as a thumb or mouse would).
  await g(() => {
    const b = document.querySelector('#burn');
    const r = b.getBoundingClientRect();
    const o = { pointerId: 7, bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'touch', isPrimary: true };
    b.dispatchEvent(new PointerEvent('pointerdown', o));
    window.__game.advance(12);
    b.dispatchEvent(new PointerEvent('pointerup', o));
    window.__game.advance(0.1);
  });
  const up = await g(() => ({ phase: window.__game.state.flight.phase, y: window.__game.state.flight.b.y - window.__game.state.flight.launch.y, burning: window.__game.state.flight.b.burning }));
  if (up.phase !== 'flying' || up.y < 15) throw new Error(`burner did not lift off: ${JSON.stringify(up)}`);
  if (up.burning) throw new Error('burner still on after release');
  log(`lifted off, ${Math.round(up.y)} m up after 12 s of burner`);

  // Keep climbing to first light.
  await g(() => {
    const G = window.__game;
    for (let i = 0; i < 40 && !G.state.flight.sun.lit; i++) G.fly(1, { burn: G.state.flight.b.vy < 2.5 });
  });
  if (!(await g(() => window.__game.state.flight.sun.lit))) throw new Error('no first light after climbing');
  await g(() => window.__game.advance(1.2));
  await shot('first-light');
  log('first light');

  // The autopilot flies to the first cross; then the Drop button drops the marker.
  const inRange = await g(() => {
    const G = window.__game;
    G.autopilot(true, 0.95);
    G.flyUntil((f) => f.crosses.some((c) => !c.dropped && Math.hypot(c.x - f.b.x, c.z - f.b.z) < 90), 200);
    G.autopilot(false);
    G.advance(1.5);
    return !document.querySelector('#drop').hidden;
  });
  if (!inRange) throw new Error('never came in range of a cross (or the Drop button stayed hidden)');
  await settle();
  await shot('approach');
  await audit('approach');
  await page.click('#drop');
  await g(() => window.__game.advance(9));
  const landed = await g(() => window.__game.state.flight.crosses.filter((c) => c.result).map((c) => c.result.d.toFixed(1)));
  if (!landed.length) throw new Error('marker did not land');
  await settle();
  await shot('marker-landed');
  log(`marker landed ${landed[0]} m from the cross`);

  // A photo of Castle Rock: set up near it, face it, then the Photo button.
  await g(() => {
    const G = window.__game;
    const f = G.state.flight;
    Object.assign(f.b, { x: -470 + 360, z: -560 + 150, y: 300, vx: 0, vz: 0, vy: 0, heat: 0, pend: 0 });
    G.faceAt(-470, -560);
    G.fly(0.3, { burn: true });
    G.advance(0.3);
  });
  await until(() => !document.querySelector('#photo').hidden);
  await page.click('#photo');
  await until(() => !!window.__game.state.album.castle);
  await g(() => window.__game.advance(0.2));
  await settle();
  await shot('photo');
  log('photographed Castle Rock');

  // Pause and resume.
  await g(() => window.__game.pause());
  await until(() => !document.querySelector('#pause').hidden);
  await settle();
  await shot('pause');
  await audit('pause');
  await page.click('#pause [data-action="resume"]');
  await until(() => !window.__game.state.paused);

  // Come down and land; the certificate counts the flight out.
  await g(() => {
    const G = window.__game;
    G.autopilot(false);
    const T = () => G.state.flight;
    for (let i = 0; i < 400 && T().phase !== 'landed'; i++) {
      const f = T();
      const ground = f.b.y - (f.track.length ? 0 : 0);
      void ground;
      G.fly(0.5, { vent: f.b.vy > -2.5 && f.b.y > 160, burn: f.b.vy < -1.4 });
    }
  });
  if ((await g(() => window.__game.state.flight.phase)) !== 'landed') throw new Error('did not land');
  await until(() => window.__game.state.screen === 'cert', null, 6000);
  await until(() => document.querySelector('#cert-total')?.textContent !== '0', null, 8000);
  await page.waitForTimeout(1300);
  await shot('certificate');
  await audit('certificate');
  const total = await g(() => window.__game.state.score.total);
  log(`landed; certificate total ${total}`);

  // The album now holds the photo.
  await page.click('#cert [data-action="album"]');
  await until(() => document.querySelector('#album').open && !!document.querySelector('#album .page.got img'));
  await settle();
  await shot('album');
  await audit('album');
  await page.click('#album [data-action="close"]');

  // Back to the title, start a free flight, reload, and continue it.
  await page.click('#cert [data-action="menu"]');
  await until(() => window.__game.state.screen === 'title');
  await page.click('.title-card [data-action="free"]');
  await until(() => window.__game.state.screen === 'play');
  await g(() => {
    window.__game.fly(8, { burn: true });
    window.__game.pause(); // saves
  });
  const t0 = await g(() => window.__game.state.flight.t);
  await page.reload();
  await until(() => document.documentElement.dataset.ready === '1');
  await until(() => !document.querySelector('[data-action="continue"]').hidden);
  await g(() => (window.__game.loop.manual = true));
  await page.click('[data-action="continue"]');
  await until(() => window.__game.state.screen === 'play');
  const t1 = await g(() => window.__game.state.flight.t);
  // The same flight, from where it was saved (a frame or two of real time may slip in first).
  if (t1 < t0 - 0.01 || t1 - t0 > 0.5) throw new Error(`continued at ${t1}, saved at ${t0}`);
  log(`continued a saved flight at ${t1.toFixed(1)} s${phone ? ' (phone)' : ''}`);

  // Leave Rich's browser clean.
  await g(() => Object.keys(localStorage).filter((k) => k.startsWith('cg:first-light:')).forEach((k) => localStorage.removeItem(k)));
}
