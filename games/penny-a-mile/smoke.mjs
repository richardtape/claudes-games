// Scripted play-through for `npm run check` (desktop, then phone with ctx.phone): the title, help,
// a new shire with the coach, a route laid by tapping both ends on the real canvas, the plan card,
// trains earning, adding a train, the services and books sheets, closing a station (cancelled),
// a Board meeting passed, a Board meeting failed, the end screen with the company map, and a saved
// railway resumed after a reload. Time runs on the manual clock, so nothing depends on speed.
export default async function smoke(page, { log, shot, audit, phone }) {
  const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
  const settle = () => page.waitForTimeout(450);
  const g = (fn, arg) => page.evaluate(fn, arg);

  await g(() => Object.keys(localStorage).filter((k) => k.startsWith('cg:penny-a-mile:')).forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  await until(() => document.documentElement.dataset.ready === '1');
  await g(() => {
    window.__game.loop.manual = true;
    window.__game.skipAnimations(true);
  });
  await g(() => window.__game.advance(0.5));
  await settle();
  await shot('title');
  await audit('title');

  // Help from the title.
  await page.click('.title-actions [data-action="help"]');
  await until(() => document.querySelector('#help').open);
  await settle();
  await shot('help');
  await audit('help');
  await page.click('#help [data-action="close"]');

  // A new shire through the button, then a fixed one (a random opening line can be two tiles long,
  // or far enough that the first delivery takes months), so every run checks the same railway.
  await page.click('.title-actions [data-action="new"]');
  await until(() => window.__game.app.screen === 'play');
  await g(() => {
    window.__game.newGame('chrome-test');
    window.__game.advance(0.3);
  });
  await settle();
  if (await g(() => document.querySelector('#coach').hidden)) throw new Error('the coach did not appear on a first game');
  await shot('new-shire');
  await audit('new shire');
  if (phone) {
    const fit = await g(() => {
      const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const bar = r('#bar');
      const tools = r('#tools');
      return { bar: bar && bar.bottom, tools: tools && tools.bottom, h: innerHeight, w: innerWidth, toolsW: tools && tools.width };
    });
    if (fit.bar == null || fit.tools == null || fit.tools > fit.h + 1 || fit.bar > fit.h * 0.25) throw new Error(`phone layout does not fit: ${JSON.stringify(fit)}`);
  }

  // Lay the subsidy route by tapping both ends on the canvas, through the Build button.
  await page.click('.tool[data-tool="build"]');
  const spots = await g(() => window.__game.subsidySpots());
  if (!spots) throw new Error('no subsidy spots on this shire');
  // Phones tap with a finger (tap one end, tap the other, then Build); a mouse previews the line
  // on hover and the second click builds it.
  const at = (x, y) => g(([x, y]) => window.__game.tilePoint(x, y), [x, y]);
  const tapTile = async (x, y) => {
    const p = await at(x, y);
    if (phone) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await g(() => window.__game.advance(0.05));
  };
  // Make sure both ends are on screen: centre between them at a zoom that fits.
  await g((sp) => {
    const R = window.__game.renderer;
    R.cam.z = 0.75;
    R.centreOn((sp.ax + sp.bx) / 2 + 0.5, (sp.ay + sp.by) / 2 + 0.5);
  }, spots);
  await tapTile(spots.ax, spots.ay);
  if ((await g(() => window.__game.app.planMode)) !== 'tap') throw new Error('tapping a spot did not start a line');
  if (phone) {
    await tapTile(spots.bx, spots.by);
    await until(() => document.querySelector('[data-action="build-plan"]'));
    await settle();
    await shot('plan');
    await audit('plan');
    await page.click('[data-action="build-plan"]');
  } else {
    const b = await at(spots.bx, spots.by);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await g(() => window.__game.advance(0.05));
    await until(() => window.__game.app.plan?.ok && document.querySelector('[data-card="plan"]'));
    await settle();
    await shot('plan');
    await audit('plan');
    await page.mouse.click(b.x, b.y);
  }
  await until(() => window.__game.state.services.length === 1);
  log(`route built by ${phone ? 'tapping both ends and Build' : 'clicking one end and then the other'}`);

  // Run five months (the longest opening line is about 26 tiles: a hundred days each way):
  // the train delivers and money floats up.
  await g(() => {
    window.__game.run(150);
    window.__game.advance(0.4);
  });
  const paid = await g(() => window.__game.state.year.income);
  if (!(paid > 0)) throw new Error('no income after five months');
  await until(() => document.querySelector('[data-card="service"]'));
  await page.click('[data-action="add-train"]');
  await until(() => window.__game.state.trains.length === 2);
  await g(() => window.__game.advance(0.3));
  await settle();
  await shot('service-card');
  await audit('service card');
  log(`earned £${Math.round(paid)} in five months; a second train bought`);

  // A station's card, then closing it (cancelled at the confirm).
  const stId = await g(() => window.__game.state.stations[0].id);
  await g((id) => window.__game.select({ kind: 'station', id }), stId);
  await until(() => document.querySelector('[data-card="station"]'));
  await settle();
  await shot('station-card');
  await page.click('[data-card="station"] [data-action="clear-station"]');
  await until(() => document.querySelector('#confirm').open);
  await settle();
  await shot('confirm');
  await audit('confirm');
  await page.click('#confirm [data-action="confirm-no"]');
  if ((await g(() => window.__game.state.stations.length)) !== 2) throw new Error('cancelling the close removed the station');

  // The sheets.
  await page.click('.tool[data-action="services"]');
  await until(() => document.querySelector('#services').open);
  await settle();
  await shot('services');
  await audit('services');
  await page.click('#services [data-action="close"]');
  await page.click('.tool[data-action="ledger"]');
  await until(() => document.querySelector('#ledger').open);
  await page.click('#ledger [data-action="borrow"]');
  await until(() => window.__game.state.loan === 10000);
  await settle();
  await shot('books');
  await audit('books');
  await page.click('#ledger [data-action="close"]');

  // A Board meeting passed.
  await g(() => {
    window.__game.toBoard(400000);
    window.__game.run(5);
  });
  await until(() => window.__game.app.screen === 'board' && document.querySelector('[data-action="board-close"]'));
  await settle();
  await shot('board-pass');
  await audit('board pass');
  await page.click('[data-action="board-close"]');
  await until(() => window.__game.app.screen === 'play' && !window.__game.state.hold);

  // Save and reload: the railway resumes.
  await g(() => window.__game.run(40));
  const before = await g(() => ({ services: window.__game.state.services.length, day: window.__game.state.day }));
  await page.reload();
  await until(() => document.documentElement.dataset.ready === '1');
  await g(() => {
    window.__game.loop.manual = true;
    window.__game.skipAnimations(true);
  });
  await until(() => document.querySelector('[data-action="continue"]'));
  await page.click('[data-action="continue"]');
  await until(() => window.__game.app.screen === 'play');
  const after = await g(() => ({ services: window.__game.state.services.length, day: window.__game.state.day }));
  if (after.services !== before.services || Math.abs(after.day - before.day) > 31) throw new Error(`resume lost the railway: ${JSON.stringify({ before, after })}`);
  log('a reload resumed the saved railway');

  // A Board meeting failed, then the end screen and its map.
  await g(() => {
    window.__game.toBoard(1000);
    window.__game.run(5);
  });
  await until(() => document.querySelector('[data-action="board-end"]'));
  await settle();
  await shot('board-fail');
  await page.click('[data-action="board-end"]');
  await until(() => window.__game.app.screen === 'end');
  await settle();
  await shot('end');
  await audit('end');
  const mapInk = await g(() => {
    const c = document.querySelector('#poster');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    // The track's red core is antialiased, so count reddish pixels, not pure company red.
    for (let i = 0; i < d.length; i += 4) if (d[i] > 140 && d[i] - d[i + 1] > 60 && d[i + 2] < 100) red++;
    return red;
  });
  if (mapInk < 40) throw new Error(`the company map shows no track (${mapInk} reddish pixels)`);
  await page.click('#end [data-action="to-title"]');
  await until(() => window.__game.app.screen === 'title');
  if (await g(() => !!document.querySelector('[data-action="continue"]'))) throw new Error('a finished railway is still offered to carry on');
  log('board passed and failed; end screen and map drawn');

  await g(() => Object.keys(localStorage).filter((k) => k.startsWith('cg:penny-a-mile:')).forEach((k) => localStorage.removeItem(k)));
}
