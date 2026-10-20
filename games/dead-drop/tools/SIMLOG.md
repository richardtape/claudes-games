# Dead Drop sim log

A dated record of simulator runs: what we asked, the exact command, the numbers and the call we made. Every
later phase measures a rule change against the Phase 1 baseline below (`--against games/dead-drop/tools/baselines/phase1-heron.json`).

Entry template:

```
## <date> · <title>
- Question:
- Configuration: <exact command>, commit <short hash>, seed dd, <rounds> rounds / <matches> matches, <rounds/s>
- Numbers: <table: rate ± margin>
- Decision:
```

To rerun an entry, run its command (every command is `nice -n 19 node games/dead-drop/tools/sim.mjs ...`). The batch
log in `.tmp/dead-drop-sim/<run>.jsonl` is reused only with `--resume`; delete it (or pick a new `--run` name) for a
fresh run. Numbers do not depend on `--workers`. All margins are 95%, in percentage points. The JSON files in
`tools/baselines/` hold full stats.

Note on harness: the sim harness asks for stake calls in initiative order, while the old sim always asked seat 0
first. Numbers here are therefore not comparable with older sim output.

Timing note: rounds/s varies with machine load (other sessions run on this Mac), so the speeds below are not
a benchmark.

## 2026-10-18 · B1 Baseline, Heron x Heron, 20,000 rounds
- Question: With the current rules, what do the bots at their own sample counts show? Is escalation automatic? Which agents and cities are off?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-heron --rounds 20000 --out games/dead-drop/tools/baselines/phase1-heron.json`, commit 7040032, seed dd, 20,017 rounds / 4,420 matches (0 capped), 30 rounds/s (674.8 s, 4 workers). No resume.
- Numbers:

| Rate | Value |
|---|---|
| Rounds per match | 4.5 ±0.03 |
| A wins (match) | 50.7% ±1.5 |
| Seat 0 wins (matches) | 49.5% ±1.5 |
| Seat 0 wins (decided rounds) | 49.7% ±0.8 |
| Folds | 18.3% ±0.5 |
| Dead heats | 2.9% ±0.2 |
| Tie-breaks | 19.4% ±0.5 |
| Half-time leader wins | 73.9% ±1.4 |
| Points per round | 3.40 ±0.02 |
| Stake 4 reached | 78.0% ±0.6 |
| Escalation | 99.0% ±0.1 |
| Escalator won | 66.8% ±0.7 |
| Answered with a fold | 9.6% ±0.4 |
| Bluffs | 180 |

| Agent | played | win% when played | win% when not |
|---|---|---|---|
| Heavy | 23111 | 50.8% ±0.6 | 41.9% ±1.0 |
| Sleeper | 19771 | 50.7% ±0.7 | 44.3% ±0.9 |
| Veteran | 17635 | 47.1% ±0.7 | 49.5% ±0.8 |
| Double Agent | 15102 | 47.7% ±0.8 | 48.7% ±0.7 |
| Jammer | 20190 | 49.5% ±0.7 | 46.1% ±0.9 |
| Handler | 14811 | 48.0% ±0.8 | 48.4% ±0.7 |
| Mole | 16766 | 47.4% ±0.8 | 49.0% ±0.8 |
| Getaway | 11715 | 46.1% ±0.9 | 49.4% ±0.7 |
| Lookout | 9742 | 46.8% ±1.0 | 48.8% ±0.6 |
| Assassin | 18876 | 46.4% ±0.7 | 50.7% ±0.8 |
| Tripwire | 15270 | 50.2% ±0.8 | 46.5% ±0.7 |
| Impostor | 12622 | 45.1% ±0.9 | 50.1% ±0.7 |

| City | rounds | decided | winner took round |
|---|---|---|---|
| Lisbon | 4650 | 85.3% ±1.0 | 75.2% ±1.3 |
| Vienna | 4858 | 89.2% ±0.9 | 68.1% ±1.4 |
| Istanbul | 4171 | 91.9% ±0.8 | 65.0% ±1.5 |
| Berlin | 4513 | 85.7% ±1.0 | 64.1% ±1.5 |
| Havana | 4464 | 86.8% ±1.0 | 63.6% ±1.5 |
| Monaco | 4423 | 90.4% ±0.9 | 61.7% ±1.5 |
| Hong Kong | 4387 | 89.8% ±0.9 | 62.6% ±1.5 |
| Helsinki | 4173 | 84.3% ±1.1 | 70.7% ±1.5 |
| Moscow | 4541 | 89.0% ±0.9 | 61.9% ±1.5 |
| Venice | 4163 | 82.9% ±1.1 | 66.8% ±1.6 |
| Tangier | 4692 | 70.6% ±1.3 | 71.2% ±1.5 |

- Margin expectation (each agent `winPlayed` and each city `decided` within ±1.5): MET. Largest agent `winPlayed` margin is ±1.0 (Lookout), largest city `decided` margin is ±1.1. (The "winner took round" column reaches ±1.6, but the brief does not set a bar for it.)
- Is escalation automatic? Yes, confirmed: 99.0% ±0.1 of rounds escalate (bar was 90%). Stake 4 is reached in 78.0% ±0.6 of rounds, and the escalator wins 66.8% ±0.7 of them. Only 9.6% ±0.4 of escalations are answered with a fold. Players almost always raise, and raising is a good bet (two thirds), which is why the stake changes matter.
- Weak agents (win% when played + margin < 47): only Impostor (45.1 + 0.9 = 46.0). Near misses that do not meet the bar: Getaway (46.1 + 0.9 = 47.0), Assassin (47.1), Lookout (47.8), Veteran (47.8), Mole (48.2), Double Agent (48.5).
- Strong agents (win% when played - margin > 53): none. Heavy 50.8 - 0.6 = 50.2, Sleeper 50.0, Tripwire 49.4, Jammer 48.8.
- Hints (weak Double Agent, Lookout, Veteran; strong Heavy, Sleeper, Mole): none is confirmed by the bar, so all six are DROPPED as stated. Double Agent (47.7 ±0.8), Lookout (46.8 ±1.0) and Veteran (47.1 ±0.7) do lean 2 to 3 points under 50, but each upper bound (48.5, 47.8, 47.8) is above 47. Heavy (50.8 ±0.6) and Sleeper (50.7 ±0.7) lean slightly above 50, nowhere near 53. Mole (47.4 ±0.8) leans weak, not strong, so the strong hint is wrong. Their "win% when not played" column (Heavy 41.9, Sleeper 44.3) shows the same lean from the other side: games where the opponent holds them are better for that opponent, but the played-win rate does not separate them. The real spread is small: the best agent (Heavy, 50.8) is 5.7 points above the worst (Impostor, 45.1), and Impostor is the only agent weak by the bar.
- Other: seat 0 share is balanced (49.7% ±0.8 of decided rounds; 49.5% ±1.5 of matches). Dead heats 2.9% ±0.2. Tie-break rate 19.4% ±0.5 of rounds: this is what bug 8 touches, so roughly one round in five is settled by the tie-break. A match lasts 4.5 ±0.03 rounds, and the half-time leader goes on to win 73.9% ±1.4 of matches. Cities: Tangier is the odd one (70.6% ±1.3 decided against 83 to 92% elsewhere); Lisbon's winner takes the round most often (75.2%), Moscow, Monaco and Hong Kong least (about 62%).
- Decision: Keep this as the Phase 1 reference. Escalation is automatic, so work on stakes belongs to later phases; none of the agent hints is confirmed by the bar (only Impostor is weak), so do not retune agents on the 200-round hints. Bug 8's tie-break fires in about 19% of rounds, so it is worth fixing and worth re-measuring against these numbers.

## 2026-10-18 · B2 Cheap bots, Heron x Heron at 8 samples, 5,000 rounds
- Question: Can later phases tune at 8 samples (about twice as fast) and confirm at the bots' own 24? Compare with B1.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-heron8 --rounds 5000 --samples 8 --out games/dead-drop/tools/baselines/phase1-heron-s8.json`, commit 7040032, seed dd, 5,014 rounds / 1,040 matches (0 capped), 55 rounds/s (91.9 s, 4 workers). No resume.
- Numbers (B2 vs B1):

| Rate | B2 (8 samples) | B1 (24 samples) |
|---|---|---|
| Rounds per match | 4.8 ±0.08 | 4.5 ±0.03 |
| A wins (match) | 51.3% ±3.0 | 50.7% ±1.5 |
| Seat 0 wins (decided rounds) | 49.2% ±1.6 | 49.7% ±0.8 |
| Folds | 26.9% ±1.2 | 18.3% ±0.5 |
| Dead heats | 2.6% ±0.4 | 2.9% ±0.2 |
| Tie-breaks | 17.2% ±1.0 | 19.4% ±0.5 |
| Half-time leader wins | 72.4% ±2.9 | 73.9% ±1.4 |
| Points per round | 3.17 ±0.04 | 3.40 ±0.02 |
| Stake 4 reached | 69.7% ±1.3 | 78.0% ±0.6 |
| Escalation | 98.7% ±0.3 | 99.0% ±0.1 |
| Escalator won | 66.5% ±1.3 | 66.8% ±0.7 |
| Answered with a fold | 16.5% ±1.0 | 9.6% ±0.4 |

Agents at 8 samples (win% when played): Heavy 50.8 ±1.4, Sleeper 51.0 ±1.5, Veteran 46.2 ±1.6, Double Agent 48.0 ±1.7, Jammer 50.3 ±1.5, Handler 47.2 ±1.7, Mole 48.3 ±1.6, Getaway 47.0 ±1.8, Lookout 46.8 ±1.9, Assassin 47.2 ±1.5, Tripwire 48.1 ±1.7, Impostor 45.5 ±1.8. Cities (decided): Lisbon 84.4 ±2.3, Vienna 90.5 ±1.8, Istanbul 93.1 ±1.6, Berlin 87.3 ±2.1, Havana 90.5 ±1.8, Monaco 90.4 ±1.8, Hong Kong 89.2 ±2.0, Helsinki 82.2 ±2.5, Moscow 90.3 ±1.8, Venice 82.0 ±2.4, Tangier 70.4 ±2.7. The full tables are in the JSON.

- Which rates moved: not every rate stays within the combined margin (|diff| > sqrt(m1^2 + m2^2)). Stake game: cheap bots fold more (26.9 vs 18.3) and answer escalations with a fold more (16.5 vs 9.6), so stake 4 is reached less (69.7 vs 78.0), points per round fall (3.17 vs 3.40), matches run longer (4.8 vs 4.5 rounds) and tie-breaks fall (17.2 vs 19.4). Agents and cities, rechecked pair by pair over both JSON files: 2 of 23 crossed. Tripwire `winPlayed` 48.1 ±1.7 at 8 samples vs 50.2 ±0.8 at 24 (diff 2.10, combined margin 1.86), and Havana `decided` 90.5 ±1.8 vs 86.8 ±1.0 (diff 3.74, combined margin 2.08). The other 10 agents and 10 cities are within the combined margin, as are escalation, the escalator's win rate, seat 0 share, dead heats, the half-time leader and A's match win. With 23 comparisons at 95%, one or two crossings are expected by chance.
- Decision: Agent and city numbers broadly carry over from 8 samples to 24, so Phase 2 may screen agents and cities at 8 samples. It must confirm any finding at the bots' own samples, starting with Tripwire and Havana, which are the two that did not agree. Stake numbers (folds, answering a raise with a fold, stake 4, points per round, match length, tie-breaks) must always be confirmed at the bots' own samples, because cheaper bots play a measurably more timid stake game.

## 2026-10-18 · B3 Mixed skill, Wren (A) vs Control (B), 5,000 rounds
- Question: How often does an expert (Control, 80 samples) beat a novice (Wren, 6 samples)? A stand-in for a strong human facing a beginner.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-mixed --rounds 5000 --a wren --b control --out games/dead-drop/tools/baselines/phase1-wren-control.json`, commit 7040032, seed dd, 5,019 rounds / 1,060 matches (0 capped), 10 rounds/s (494.0 s, 4 workers, machine loaded by other sessions). No resume.
- Numbers: Wren (A) wins 14.6% ±2.1 of matches, so Control wins 85.4% ±2.1. Seat 0 wins 50.1% ±3.0 of matches and 50.0% ±1.7 of decided rounds. 4.7 ±0.08 rounds per match. Folds 34.5% ±1.3, dead heats 1.9% ±0.4, tie-breaks 14.1% ±1.0, half-time leader wins 80.0% ±2.5, points per round 3.02 ±0.04, stake 4 in 63.2% ±1.3, escalation 99.2% ±0.2, escalator won 69.8% ±1.3, answered with a fold 20.9% ±1.1.
- Decision: Skill matters a lot here: Control beats Wren in 85.4% of matches, and the half-time leader holds 80% of the time. The game rewards judgement, but a novice is beaten in five matches out of six, so the early-game support for newcomers (and the rival ladder for humans) needs care. Keep this as the novice-versus-expert reference.

## 2026-10-18 · B4 Ladder, adjacent rivals, 2,000 rounds each
- Question: Does each rival beat the one below it?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-ladder --ladder --rounds 2000 --out games/dead-drop/tools/baselines/phase1-ladder.json`, commit 7040032, seed dd, 8,167 rounds across 4 pairs, 12 rounds/s (666.5 s, 4 workers, loaded machine). No resume.
- Numbers (A is the lower rival, so A below 50% means the higher rival wins):

| Pair | A wins | Rounds per match | Rounds |
|---|---|---|---|
| Wren v Magpie | 39.3% ±4.7 | 4.84 | 2033 |
| Magpie v Heron | 33.8% ±4.2 | 4.31 | 2067 |
| Heron v Countess | 41.7% ±4.5 | 4.42 | 2032 |
| Countess v Control | 40.0% ±4.4 | 4.24 | 2035 |

- Decision: Every rival beats the one below it, and every gap clears its margin (the lower rival's win rate plus its margin stays under 50% in all four pairs). The steps are uneven: Magpie over Heron is the widest (66.2% for the higher rival) and Wren over Magpie the narrowest (60.7%). No pair is inverted. The ladder is sound; one step is a lot smaller than the next, but there is no reason to retune.

## 2026-10-18 · B5 Agent probes, power + 1 per agent, 3,000 rounds at 8 samples
- Question: How far does one point of power move each agent's win rate when played? This sizes the sensitivity of any agent rebalance.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-probe --probe agents --rounds 3000 --samples 8 --out games/dead-drop/tools/baselines/phase1-probe-agents.json`, commit 7040032, seed dd, 39,634 rounds across 13 configurations (base 3,022 rounds / 620 matches, 0 capped), 55 rounds/s (718.1 s, 4 workers). No resume. The base in this run is its own 3,000-round Heron x Heron at 8 samples.
- Numbers (win% when played, base to power + 1, with the change and its margin):

| Agent | Power change | Base | Power + 1 | Change |
|---|---|---|---|---|
| Heavy | 6 to 7 | 50.1 | 51.3 | +1.2 ±2.5 |
| Sleeper | 4 to 5 | 51.1 | 51.9 | +0.9 ±2.7 |
| Veteran | 3 to 4 | 46.5 | 49.0 | +2.5 ±2.8 |
| Double Agent | 3 to 4 | 48.3 | 49.3 | +1.0 ±2.9 |
| Jammer | 3 to 4 | 50.7 | 51.5 | +0.8 ±2.7 |
| Handler | 2 to 3 | 47.3 | 48.7 | +1.4 ±3.0 |
| Mole | 2 to 3 | 48.7 | 49.0 | +0.3 ±2.9 |
| Getaway | 2 to 3 | 46.8 | 47.1 | +0.2 ±3.2 |
| Lookout | 1 to 2 | 47.1 | 47.0 | -0.1 ±3.3 |
| Assassin | 1 to 2 | 46.3 | 46.9 | +0.6 ±2.7 |
| Tripwire | 0 to 1 | 48.3 | 48.6 | +0.3 ±3.0 |
| Impostor | 0 to 1 | 45.6 | 47.1 | +1.6 ±3.2 |

(Base powers are from `js/data.js`; the CLI variants are `<id>.power=<base+1>`.) The CLI flagged (`*`) a few match-level shifts: tie-breaks fall 2.1 to 2.9 points for Sleeper, Veteran, Jammer, Mole and Tripwire (each within a point of its margin), dead heats fall 0.8 for Sleeper, Jammer and Tripwire, and Tripwire +1 lifts the half-time leader's win rate by +7.3 ±5.3.
- Decision: One point of power moves an agent's `winPlayed` by about +0.2 to +2.5 points (typically around +1), always inside the 3-point margin at this volume, so a single probe cannot rank agents. To measure a power tweak to ±1 point, use at least 20,000 rounds per variant. Power is a gentle dial: a power change on its own barely moves the spread seen in B1, and high-power and low-power agents respond about alike.

## 2026-10-18 · B6 Lisbon tie-break A/B, out versus all versus invert, 5,000 rounds each at 8 samples
- Question: Lisbon (lowest total wins) used to add its total into the tie-break, which rewards losing it. Does leaving Lisbon out (`out`, the new default) or inverting it (`invert`) change dead heats or fairness compared with the old behaviour (`all`)? Decision rule: keep `out` unless it shows significantly more dead heats than `invert`.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-lisbon --samples 8 --rounds 5000 --variant all:rules.lisbonTiebreak=all --variant invert:rules.lisbonTiebreak=invert --out games/dead-drop/tools/baselines/phase1-lisbon-ab.json`, engine edits on top of commit ecf8ec8 (committed with this entry), seed dd, 15,095 rounds across 3 configurations (base `out` 5,022 rounds / 1,040 matches, 0 capped), 97 rounds/s (155.0 s, 4 workers). No resume.
- Numbers:

| Mode | Dead heats | Tie-breaks | Seat 0 wins (decided rounds) | Points per round |
|---|---|---|---|---|
| out (base) | 2.67% ±0.45 | 17.3% ±1.05 | 49.0% ±1.65 | 3.160 ±0.036 |
| all | 2.63% ±0.44 | 17.2% ±1.04 | 49.2% ±1.65 | 3.174 ±0.036 |
| invert | 2.85% ±0.46 | 17.0% ±1.03 | 49.8% ±1.65 | 3.151 ±0.036 |

  Nothing was flagged significant by the compare rows. Out versus invert directly: dead heats differ by -0.18 points against a combined margin of 0.64.
- Decision: Keep `out`. It has no more dead heats than `invert` (the difference is a third of the margin), and all three modes are statistically indistinguishable at this volume: Lisbon only decides the tie-break in a small share of rounds. The fix is a rules-clarity change (losing Lisbon no longer helps you on a tie) that costs nothing measurable.

## 2026-10-18 · B7 Final check, Phase 1 against the baseline, 5,000 rounds
- Question: Did any Phase 1 fix change play beyond the Lisbon tie-break? Between B1 (7040032) and this run, only 0753329 (the Lisbon tie-break, the hand-size invariant test and Havana's turned-asset note) touched `engine.js`, `bot.js`, `data.js` or `tools/sim/`; every other Phase 1 commit is UI, network or music, and no later commit (up to 832cb9b) touches those files. Expected: nothing significant, except perhaps dead heats, tie-breaks and seat 0 share, which the tie-break could touch.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p1-final --rounds 5000 --against games/dead-drop/tools/baselines/phase1-heron.json --out games/dead-drop/tools/baselines/phase1-final.json`, commit 7ef4cc0, seed dd, 5,052 rounds / 1,120 matches (0 capped), 35 rounds/s (144.4 s, 4 workers). No resume.
- Reduced volume: the plan called for 20,000 rounds. The coordinator cut it to 5,000 because Rich wants Phase 1 to move faster. Phase 1's only rule change is the Lisbon tie-break, and B6 already showed it moves nothing measurable, so 5,000 rounds is enough to catch drift; it is not enough to rank agents (see B5).
- Paired: match seeds are `dd:<index>`, so this run replays the seeds of B1's first 1,120 matches (deck and bots alike): every match starts from the same deal, and any difference comes from the code, not the luck of the draw. The compare margins treat the two runs as independent, so for a paired run they are, if anything, wide.
- Numbers (the CLI's "Against saved base" rows, B1 to B7, with the change and its combined margin):

| Rate | B1 (20,017 rounds) | B7 (5,052 rounds) | Change |
|---|---|---|---|
| Escalation | 99.0% | 98.9% | -0.1 ±0.3 |
| Stake 4 reached | 78.0% | 77.9% | -0.1 ±1.3 |
| Escalator won | 66.8% | 67.6% | +0.8 ±1.5 |
| Answered with a fold | 9.6% | 9.9% | +0.4 ±0.9 |
| Folds | 18.3% | 18.4% | +0.1 ±1.2 |
| Dead heats | 2.9% | 2.8% | -0.2 ±0.5 |
| Tie-breaks | 19.4% | 19.2% | -0.1 ±1.2 |
| Seat 0 wins (decided rounds) | 49.7% | 49.7% | -0.1 ±1.7 |
| A wins (match) | 50.7% | 51.3% | +0.7 ±3.3 |
| Seat 0 wins (matches) | 49.5% | 49.6% | +0.0 ±3.3 |
| Half-time leader wins | 73.9% | 74.5% | +0.6 ±3.2 |
| Points per round | 3.40 | 3.40 | -0.00 ±0.04 |
| Rounds per match | 4.53 | 4.51 | -0.02 ±0.07 |

  None is significant (`*`), including the three rows the tie-break could touch. Agents and cities, checked pair by pair against B1 as in B2 (|diff| > sqrt(m1^2 + m2^2)): no agent's `winPlayed` moved (largest Getaway +1.4 against 2.0, Tripwire -1.3 against 1.8). One of 22 city rates crossed by a hair: Vienna `decided` 89.2 to 91.0 (diff 1.85 against 1.83), a city no Phase 1 change touches; with 34 comparisons at 95%, one or two crossings are expected by chance. Lisbon's own rates stayed inside their margins (decided 85.3 to 86.3, ±2.2; winner took the round 75.2 to 72.7, ±3.1). The full tables are in the JSON.
- Decision: No Phase 1 fix changed play; the Lisbon rule (`out`) stands. Later phases keep measuring against B1 (`phase1-heron.json`), which still describes the game as shipped.

## 2026-10-18 · B8 Phase 2a before: two-player reference for the refactor
- Question: What does the unchanged Phase 1 engine, bot and simulator produce at 2,000 rounds and 8 samples? Phase 2a generalises them to 2-4 seats, and two-player play must not move at all, so this run is the reference to reproduce exactly. Expected: the same numbers, to the digit, after Task 6.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2a-before --rounds 2000 --samples 8 --workers 4 --out games/dead-drop/tools/baselines/phase2a-before.json`, commit c242eac (no engine, bot or sim edits since), seed dd, Heron x Heron, 2,045 rounds / 420 matches (0 capped), 88 rounds/s (23.2 s, 4 workers). No resume.
- Numbers: escalation 98.9% +-0.4, stake 4 in 69.1% +-2.0 of rounds, escalator won 66.0% +-2.1, folds 27.5% +-1.9, dead heats 2.7% +-0.7, tie-breaks 17.5% +-1.6, seat 0 wins 49.8% +-2.6 of decided rounds (49.0% +-4.8 of matches), points per round 3.15 +-0.06, 4.9 rounds per match. Per-agent and per-city tables are in the JSON (too few rounds to rank agents; this is a fingerprint, not a balance run).
- Decision: Task 6 must reproduce this JSON exactly (same seed, same batches, so identical, not merely within margins). The golden replays (`test/golden.test.mjs`, `tools/golden.mjs --check`) cover the engine and bot call by call; this covers the whole simulator path.

## 2026-10-18 · B9 Phase 2a after: two-player play unchanged
- Question: Does the 2-4 seat refactor (engine, bot, session, sim harness) leave two-player play exactly as B8 recorded it?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2a-after --rounds 2000 --samples 8 --against games/dead-drop/tools/baselines/phase2a-before.json`, seed dd, Heron x Heron, 2,045 rounds, 4 workers, 60 rounds/s (34.2 s; machine load 8 to 15 from other sessions). Matches are seated by `rotation = index % 2`, the same seating as Phase 1's swap.
- Numbers: every `against` row is +0.0 (all 13 rows), and `agents`, `cities`, `roundsPerMatch` and `pointsPerRound` compare byte-identical to B8 (JSON.stringify equal).
- Decision: Two-player numbers did not move at all, so the refactor stands. `SIM_VERSION` is now 2 (the MatchRecord has `rotation` where it had `swapped`), which only invalidates old cached batches. Three-seat smoke (200 rounds, 4 samples): no stakes at 3-4 seats, tie-breaks 46% of rounds; too small to judge balance.

## 2026-10-18 · B10 Phase 2a: first look at 3 and 4 seats (stake 1, no escalation), and bot thinking time
- Question: With the N-seat rules of Decision 3 (initiative rotates, stake 1 only), is each seat's share 1/N +- 5 points (Phase 3's bar)? How long does `think` take per move at 2, 3 and 4 seats? Tunes nothing.
- Thinking time (`nice -n 19 node games/dead-drop/tools/think-time.mjs --rivals wren,heron,control`, 30 positions per row, ms on this Mac, load 2.3 before and after):

| Seats | Rival (samples) | mean | p95 | max |
|---|---|---|---|---|
| 2 | wren (6) | 3.0 | 4.8 | 8.8 |
| 2 | heron (24) | 9.5 | 15.9 | 16.8 |
| 2 | control (80) | 31.9 | 49.4 | 58.8 |
| 3 | wren | 5.6 | 8.5 | 8.5 |
| 3 | heron | 21.0 | 31.9 | 33.2 |
| 3 | control | 69.8 | 105.9 | 109.5 |
| 4 | wren | 9.4 | 15.1 | 16.5 |
| 4 | heron | 37.0 | 62.2 | 66.9 |
| 4 | control | 123.5 | 205.4 | 221.2 |

  Cost grows about 2.2x per added seat. Phone bar: ~150 ms at 3-5x slower means 30-50 ms on this Mac. Passing (p95 under 30 ms): wren at 2-4 seats (p95 15) and heron at 2 seats (p95 16). Borderline: heron at 3 seats (p95 31.9, just over the bar, and about 160 ms at 5x). Marginal: heron at 4 seats (mean 37, p95 62: fine at 3x, about 310 ms at 5x p95), control at 2 seats (mean 32, p95 49). Failing: control at 3 seats (p95 106) and 4 seats (p95 205), so those need fewer samples, a time budget or a worker on phones. Magpie and Countess were not measured (between wren/heron and heron/control).
- Timing run (`--rounds 400`, 4 workers, nice 19): 3 seats, target 8: 453 rounds in 40.6 s (11 rounds/s, load about 3-5); 4 seats, target 7: 488 rounds in 250 s (2 rounds/s, load about 4-5). Estimates for 5,000 rounds: 7.6 and 43 minutes. Both were run in full.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2a-seats3 --seats 3 --target 8 --samples 8 --rounds 5000 --out games/dead-drop/tools/baselines/phase2a-seats3.json` and `--run p2a-seats4 --seats 4 --target 7` likewise (`phase2a-seats4.json`); seed dd, Heron-strength bots at 8 samples in every seat, 4 workers, no resume. 3 seats: 5,031 rounds / 660 matches (725 s, 7 rounds/s, load 3-8); 4 seats: 5,019 rounds / 640 matches (1,183 s, 4 rounds/s, load 3-35 from other sessions). 0 capped matches in both. Match seating rotates by index, so "seat" is the in-match seat, and the shares are over seats with bots of equal strength.
- Numbers (95% margins):

| | 3 seats (target 8) | 4 seats (target 7) |
|---|---|---|
| Rounds per match | 7.6 +-0.14 | 7.8 +-0.17 |
| Capped matches | 0 | 0 |
| Dead heats | 6.2% +-0.7 | 8.7% +-0.8 |
| Tie-breaks | 48.4% +-1.4 | 61.4% +-1.3 |
| Half-time leader wins | 62.3% +-4.1 | 54.4% +-4.4 |
| Points per round | 1.88 +-0.01 | 1.83 +-0.02 |
| Seat 0 / 1 / 2 / 3, share of decided rounds | 33.6 / 33.3 / 33.1 +-1.3 | 24.0 / 24.6 / 25.9 / 25.5 +-1.2 to 1.3 |
| Seat 0 / 1 / 2 / 3, share of matches | 34.4 / 34.2 / 31.4 +-3.6 | 24.2 / 25.2 / 25.6 / 25.0 +-3.4 |
| Bot A / B / C / D, matches | 34.1 / 35.3 / 30.6 +-3.6 | 25.0 / 22.8 / 25.5 / 26.7 +-3.4 |

  Seat fairness: every seat is inside 1/N +- 5 points at both counts (3 seats: 31.4 to 34.4 against 28.3 to 38.3; 4 seats: 24.0 to 25.9 against 20 to 30), by rounds and by matches. Decision 3's initiative rule is not contradicted by this run.
- Agents (win% when played; at N seats this sits near 100/N, not 50, so compare with 33.3 and 25): 3 seats: Heavy 36.1, Sleeper 34.6, Jammer 34.3, Veteran 32.0, Handler 31.5, Mole 31.3, Double Agent 30.3, Tripwire 29.0, Assassin 28.7, Impostor 27.2, Getaway 27.1, Lookout 26.4 (margins about 1.0). 4 seats: Heavy 28.1, Sleeper 26.4, Jammer 25.8, Veteran 23.9, Mole 22.9, Double Agent 22.7, Handler 22.3, Getaway 19.8, Assassin 19.6, Impostor 19.0, Tripwire 18.6, Lookout 17.1 (about 0.8). The high-power agents (Heavy, Sleeper, Jammer) and the low-power ones (Lookout, Getaway, Assassin, Tripwire, Impostor) pull further apart than in two-player play (B1), since without stakes there is nothing but power to separate them. Heavy "when not played" is 20.0 / 10.6, so the spread is the strongest signal in the run.
- Cities: Lisbon is decided least often (78.1% at 3 seats, 67.5% at 4) and Tangier next (77.5 / 78.5); Moscow, Hong Kong and Istanbul are decided most (about 89 / 87-91). The winner-took-the-round rate falls at 4 seats to 45-54%: well above the 25% chance baseline at 4 seats (about twice it), though lower than at 2-3 seats, so cities still matter but less to who wins.
- Decision: 2a tunes nothing; these are the starting numbers. For 2b-i: dead heats (6.2 / 8.7%) and tie-breaks (48 / 61% of rounds) are high and rise with seats, so the tie-break decides half of all rounds and is the thing to watch if the comeback levers touch it; the half-time leader wins 62.3% of matches at 3 seats and 54.4% at 4, against a fair share of 33% and 25% (1.9x and 2.2x), so the comeback levers have real work to do at both counts. The 3-seat rate (62.3% +-4.1) is above Phase 3's bar (spec, "Phase 3 tuning": "Whoever leads at the halfway point wins <= 60%"); 4 seats (54.4%) is inside it. For 2b-ii: power dominates agent value at N seats (Heavy +8 over Lookout at 3 seats), so any agent rebalance should be measured at N seats with at least 20,000 rounds per variant; 4-seat sims cost about 4 rounds/s, so batch them. Phase 3: keep controlling samples by seat count for phones (control fails at 3-4 seats; heron at 4 is marginal); rivals with samples under about 24 are safe everywhere.

## 2026-10-18 · B11 Phase 2b-i timing run, Heron x Heron at its own samples
- Question: How fast does the stake game simulate at Heron's own 24 samples on this machine today (Step 1 of the 2b-i tuning)? Under 15 rounds/s would mean the machine is too loaded for the long runs.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-time --rounds 1000 --workers 4`, commit ee3cf6b, seed dd, 1,089 rounds / 240 matches (0 capped), 27 rounds/s (40.9 s, 4 workers), load 2.4 before and 4.2 after. No resume.
- Numbers (a first look only; B12 is the measured run): escalation 93.6% ±1.5, won at stake 2 or more 74.8% ±2.6, escalator won 64.4% ±2.9, answers were folds 9.1% ±1.8, 4.5 ±0.14 rounds per match, reel wins 0.8% ±1.2 of matches (100% of them from behind on points, 2 matches), half-time leader wins 65.5% ±6.6.
- Decision: 27 rounds/s is inside Phase 1's 27-35, so the machine is fine for the long runs: 5,000 rounds take about 3 minutes, a five-configuration run about 16.

## 2026-10-18 · B12 2b-i defaults against B1, 5,000 rounds
- Question: With the 2b-i rules as built (3 tokens, answers, the pot, rollover, the comeback Microfilm with a reel of 3, target 10) and the bots' stake play as first written (`STAKES` escalate 0.45, scarce 0.3, answer -0.6), where does each two-player target (spec 2.8) sit against its band, and what changed from B1?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-defaults --rounds 5000 --workers 4 --against games/dead-drop/tools/baselines/phase1-heron.json --out games/dead-drop/tools/baselines/phase2b1-defaults.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 5,068 rounds / 1,120 matches (0 capped), 24 rounds/s (210.4 s, 4 workers), load 3.7 before and 4.1 after. No resume.
- Numbers:

| Rate | Band | Defaults | Meets? | B1 |
|---|---|---|---|---|
| Escalation | 35-60% | 94.0% ±0.7 | no (far above) | 99.0% |
| Won at the flip with the stake doubled (`maxStake`) | <= 40% | 73.4% ±1.2 | no | 78.0% |
| Escalator won | 55-65% | 66.0% ±1.3 | no (just above) | 66.8% |
| Answered with a fold | 25-35% | 9.5% ±0.8 | no (far below) | 9.6% |
| Rounds per match | 5-7 | 4.53 ±0.07 | no (short) | 4.53 |
| Reel wins (the Microfilm decides) | 5-25% | 1.5% ±0.7 | no (under) | - |
| Reel wins from behind on points (`reelComeback`) | report | 94.1% ±11.2 (16 of 17) | - | - |
| Seat 0 wins (matches) | 45-55% | 49.6% ±2.9 | yes | 49.5% |
| Half-time leader wins | report (lower is better) | 70.1% ±3.0 | - | 73.9% |

  Also: 2.13 ±0.04 tokens spent per player per match (of 3), 15.5% ±1.0 of rounds begin with a seat out of tokens, pot taken 0.35 on average, 2.8% ±0.5 of rounds roll over, 0.98 strips per match, points per round 3.36 ±0.03. Against B1, the CLI flags escalation (-4.9 ±0.7), `maxStake` (-4.5 ±1.3), half-time leader (-3.7 ±3.3) and points per round as significant; nothing else moved. Report only: agents' win% when played runs from Impostor 45.8 to Sleeper 51.8 and cities' "winner took the round" from Berlin 61.1 to Lisbon 74.4, all inside 44-56 and 55-80.
- Decision: Tokens alone barely touch the bots: three tokens a match cover four or five rounds of one escalation each, so they still escalate in 94% of rounds and almost never fold in answer. Every stake target except seat fairness is out of band, so Steps 3-7 tune. The Microfilm decides only 1.5% of matches under the comeback rule (16 of its 17 reel wins came from behind, so it works as a comeback, but rarely).

## 2026-10-19 · B13 Each stake rule alone (probe stakes), 5,000 rounds per configuration
- Question: What does each 2b-i stake rule move on its own, against the defaults (B12)? Tokens 2 or unlimited (9), the Microfilm off (`rules.reel=0`), rollover off (`rules.rollover=0`).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-probe --probe stakes --rounds 5000 --workers 4 --out games/dead-drop/tools/baselines/phase2b1-probe-stakes.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 25,321 rounds across 5 configurations (base 5,068 rounds / 1,120 matches, the same as B12; 0 capped anywhere), 12 rounds/s (2,130 s, 4 workers), load 5.0 before, 8.6-11.4 by the end (other sessions). No resume.
- Numbers (95% margins; `*` = the CLI's significant change against the base):

| Rate | base (3 tokens) | tokens2 | tokens9 | no-film | no-rollover |
|---|---|---|---|---|---|
| Escalation | 94.0 ±0.7 | 76.1 ±1.2 * | 98.7 ±0.3 * | 94.4 ±0.6 | 93.1 ±0.7 |
| `maxStake` | 73.4 ±1.2 | 59.5 ±1.4 * | 76.8 ±1.2 * | 74.4 ±1.2 | 72.7 ±1.2 |
| Escalator won | 66.0 ±1.3 | 67.9 ±1.5 | 66.5 ±1.3 | 65.6 ±1.3 | 65.9 ±1.3 |
| Answered with a fold | 9.5 ±0.8 | 9.6 ±0.9 | 9.7 ±0.8 | 9.7 ±0.8 | 9.5 ±0.8 |
| Rounds per match | 4.53 ±0.07 | 4.81 ±0.09 * | 4.46 ±0.06 | 4.53 ±0.07 | 4.63 ±0.08 * |
| Reel wins | 1.5 ±0.7 | 2.1 ±0.9 | 1.2 ±0.6 | 0 | 2.0 ±0.8 |
| `reelComeback` | 94.1 ±11.2 (16/17) | 95.5 ±8.7 (21/22) | 92.9 ±13.5 (13/14) | - | 95.5 ±8.7 (21/22) |
| Half-time leader wins | 70.1 ±3.0 | 70.1 ±3.1 | 70.2 ±3.0 | 70.9 ±2.9 | 70.7 ±3.0 |
| Seat 0 wins (matches) | 49.6 ±2.9 | 51.4 ±3.0 | 51.8 ±2.9 | 50.1 ±2.9 | 50.4 ±3.0 |
| Out of tokens (rounds) | 15.5 ±1.0 | 45.9 ±1.4 * | 0 * | 15.2 ±1.0 | 17.2 ±1.0 * |
| Tokens spent per player | 2.13 | 1.83 * | 2.20 * | 2.14 | 2.16 |
| Points per round | 3.36 | 3.07 * | 3.43 * | 3.38 | 3.29 * |

- What each rule moves alone: **tokens** are the only rule here that moves the stake rates, and only escalation, `maxStake` and match length: 2 tokens cut escalation by 18 points and `maxStake` by 14 and lengthen matches by 0.3 rounds, while 3 tokens are already close to unlimited (9 tokens adds 4.7 points of escalation). No token count touches the escalator's win rate or folds in answer: those belong to the bots' thresholds (Step 4-5). **The Microfilm** at a reel of 3 decides 1.5% of matches and turning it off moves nothing measurable, not even the half-time leader (70.9 against 70.1, inside the margin). **Rollover** adds a little to the pot and shortens matches by 0.1 rounds; turning it off changes nothing else. Report only: agents and cities stay inside 44-56 and 55-80 in every configuration.
- Decision: Tokens are a lever on escalation but not enough alone (2 tokens still escalate in 76% of rounds), and the escalator's win rate and folds in answer need the bots' thresholds. Go on to Step 4 with 3 tokens (the spec's default), keeping tokens 2 in hand for Step 6.

## 2026-10-19 · B14 Escalation thresholds (Step 4), 5,000 rounds per configuration
- Question: Can the bots' escalation threshold (`stakes.escalate`, default 0.45) and the token-scarcity bump (`stakes.scarce`, default 0.3) bring escalation into 35-60%, `maxStake` to 40% or less and the escalator's win rate into 55-65% at 3 tokens?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-esc --rounds 5000 --workers 4 --variant e35:stakes.escalate=0.35 --variant e55:stakes.escalate=0.55 --variant e65:stakes.escalate=0.65 --variant s0:stakes.scarce=0 --variant s6:stakes.scarce=0.6 --out games/dead-drop/tools/baselines/phase2b1-esc.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 30,337 rounds across 6 configurations (base = B12; 0 capped anywhere), 15 rounds/s (2,079 s, 4 workers), load 6.1 before, 4.7 after. No resume.
- Numbers (95% margins; `*` = significant against the base; "won when called" is the escalator's win rate in rounds where the answer was to play on):

| Rate | e35 | base (0.45) | e55 | e65 | s0 | s6 |
|---|---|---|---|---|---|---|
| Escalation | 96.1 ±0.5 * | 94.0 ±0.7 | 91.2 ±0.8 * | 88.0 ±0.9 * | 94.0 ±0.7 | 94.0 ±0.7 |
| `maxStake` | 76.8 ±1.2 * | 73.4 ±1.2 | 69.4 ±1.3 * | 66.8 ±1.3 * | 73.4 ±1.2 | 73.4 ±1.2 |
| Escalator won | 62.6 ±1.4 * | 66.0 ±1.3 | 70.3 ±1.3 * | 74.2 ±1.3 * | 66.0 ±1.3 | 66.1 ±1.3 |
| Won when called | 59.4 | 62.5 | 66.1 | 69.9 | 62.5 | 62.5 |
| Answered with a fold | 7.9 ±0.8 * | 9.5 ±0.8 | 12.4 ±1.0 * | 14.4 ±1.0 * | 9.5 ±0.8 | 9.5 ±0.8 |
| Rounds per match | 4.41 ±0.06 * | 4.53 ±0.07 | 4.68 ±0.07 * | 4.76 ±0.08 * | 4.52 ±0.07 | 4.53 ±0.07 |
| Reel wins | 0.9 ±0.5 | 1.5 ±0.7 | 0.4 ±0.4 * | 1.3 ±0.7 | 1.5 ±0.7 | 1.5 ±0.7 |
| `reelComeback` | 90.0 ±18.6 (9/10) | 94.1 ±11.2 (16/17) | 75.0 ±42.4 (3/4) | 78.6 ±21.5 (11/14) | 94.1 ±11.2 | 94.1 ±11.2 |
| Half-time leader wins | 70.8 ±2.9 | 70.1 ±3.0 | 72.2 ±2.9 | 70.9 ±3.0 | 70.0 ±3.0 | 70.3 ±3.0 |
| Seat 0 wins (matches) | 50.2 ±2.9 | 49.6 ±2.9 | 48.7 ±3.0 | 50.9 ±3.0 | 49.9 ±2.9 | 49.6 ±2.9 |
| Escalations on turns 2/3/4/5/6 | 1877/1592/865/338/165 | 1225/1507/1127/562/344 | 707/1190/1258/862/595 | 374/821/1148/1081/1012 | as base | as base |

- Findings: The threshold trades the escalator's win rate for almost nothing in escalation: from 0.35 to 0.65 escalation falls only from 96% to 88%, while the escalator's win rate climbs from 62.6% to 74.2%. A higher threshold delays escalation (to turns 5 and 6) rather than preventing it, because by the last turns one of the two seats nearly always sees a won round. `scarce` does nothing at all at 3 tokens and target 10: its "short of one token every other round left" count (`ceil(roundsLeft / 2) - tokens`, with `roundsLeft` from `roundPoints` 3) never goes above zero while a seat still holds a token, so 0, 0.3 and 0.6 play identically. Report only: agents and cities stay inside 44-56 and 55-80 everywhere.
- Decision: No threshold meets the escalation band at 3 tokens, so the threshold cannot be the escalation lever; it sets the escalator's win rate (e35 is the only setting here in 55-65). Escalation has to come from tokens (B13: 2 tokens, -18 points) or from making `scarce` bite (a lower `roundPoints` makes the bots keep tokens back for the rounds ahead). Follow-up 1 (B15) measures both at a lower threshold.

## 2026-10-19 · B15 Step 4 follow-up 1: 2 tokens, lower thresholds, pacing, and a first look at answers
- Question: B14 showed the threshold sets the escalator's win rate but not escalation. At 2 tokens (B13: -18 points of escalation), which threshold puts the escalator's win rate in 55-65%? Does making `scarce` bite (a full point of threshold, with `roundPoints` 2 so a seat keeps one token for every two rounds it expects are left) bring escalation down further? And how far does a higher answer threshold (-0.3) move folds in answer, and with them the escalator's win rate and match length?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-esc2 --rounds 5000 --workers 4 --set rules.tokens=2 --set stakes.escalate=0.35 --variant e25:stakes.escalate=0.25 --variant e15:stakes.escalate=0.15 --variant pace:stakes.scarce=1 --variant pace:stakes.roundPoints=2 --variant a3:stakes.answer=-0.3 --out games/dead-drop/tools/baselines/phase2b1-esc2.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 25,288 rounds across 5 configurations (0 capped), 16 rounds/s (1,593 s, 4 workers), load 2.6 before, 5.6 after. No resume. The base here is 2 tokens with escalate 0.35; each variant changes one thing from it.
- Numbers (95% margins; `*` = significant against this base):

| Rate | Band | base (2 tokens, e 0.35) | e25 | e15 | pace (scarce 1, roundPoints 2) | a3 (answer -0.3) |
|---|---|---|---|---|---|---|
| Escalation | 35-60 | 79.1 ±1.1 | 80.0 ±1.1 | 82.0 ±1.1 * | 64.6 ±1.3 * | 69.1 ±1.3 * |
| `maxStake` | <= 40 | 63.4 ±1.3 | 64.1 ±1.3 | 66.1 ±1.3 * | 51.6 ±1.4 * | 44.5 ±1.4 * |
| Escalator won | 55-65 | 65.0 ±1.5 | 60.8 ±1.5 * | 57.5 ±1.5 * | 60.9 ±1.7 * | 69.9 ±1.5 * |
| Won when called | - | 62.0 | 57.7 | 54.6 | 57.4 | 59.1 |
| Answered with a fold | 25-35 | 7.8 ±0.8 | 7.4 ±0.8 | 6.4 ±0.7 * | 8.0 ±0.9 | 26.4 ±1.5 * |
| Rounds per match | 5-7 | 4.64 ±0.08 | 4.62 ±0.08 | 4.54 ±0.08 | 4.96 ±0.08 * | 5.50 ±0.12 * |
| Reel wins | 5-25 | 1.7 ±0.8 | 1.1 ±0.6 | 0.9 ±0.6 | 2.8 ±1.0 | 1.4 ±0.8 |
| `reelComeback` | report | 88.9 ±14.5 (16/18) | 91.7 ±15.6 (11/12) | 80.0 ±24.8 (8/10) | 89.7 ±11.1 (26/29) | 76.9 ±22.9 (10/13) |
| Half-time leader wins | report | 73.5 ±2.9 | 72.4 ±2.9 | 74.0 ±2.8 | 67.7 ±3.0 * | 73.6 ±3.1 |
| Seat 0 wins (matches) | 45-55 | 48.9 ±3.0 | 50.7 ±3.0 | 48.8 ±2.9 | 48.9 ±3.1 | 46.7 ±3.2 |
| Out of tokens (rounds) | - | 44.3 | 44.8 | 43.6 | 16.1 * | 52.4 * |
| Points per round | - | 3.17 | 3.19 | 3.24 * | 2.92 * | 2.65 * |

- Findings: At 2 tokens the threshold again moves only the escalator's win rate (65.0 at 0.35, 60.8 at 0.25, 57.5 at 0.15), with escalation stuck near 80%. **Pacing works**: when a seat holding 2 tokens keeps one for every two rounds it expects are left, it escalates in 65% of rounds instead of 79%, wins 60.9% of them, and the half-time leader's win rate falls 5.7 points (the leader's opponent still has tokens late). With `roundPoints` 2 a seat holding both tokens waits until someone has 2 points, so the first round is a feeler, and the second token waits until someone has 6. **Answering at -0.3** lifts folds in answer into band (26.4%) and takes 19 points off `maxStake` and 10 off escalation (matches lengthen to 5.5 rounds, so the tokens spread over more rounds), but it adds 4.9 points to the escalator's win rate (a fold in answer is the escalator's win).
- Decision: No single change meets every band, but the effects look close to additive: 2 tokens, escalate 0.25, pacing and answer -0.3 together project to about 55% escalation, 61% escalator wins, 33% `maxStake`, 26% folds in answer and 5.8 rounds per match. Follow-up 2 (B16) measures that combination, with a higher threshold, a higher answer, a softer pace (so a strong hand can still escalate in the first round) and two 3-token pacing variants, since the spec prefers 3 tokens.

## 2026-10-19 · B16 Step 4 follow-up 2: the combination, and pacing at 3 tokens
- Question: Does the combination B15 projected (2 tokens, escalate 0.25, scarce 1, `roundPoints` 2, answer -0.3) meet the stake bands? Around it: a higher threshold (e35), a higher answer (a25), a softer pace (sc5: scarce 0.5, so a strong hand can still escalate while short), and 3 tokens paced the same way (t3: `roundPoints` 1.25, so a seat waits until the leader has 3 points to spend its first token, 5 its second and 8 its third; t3r1: `roundPoints` 1, so 4, 6 and 8).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-esc3 --rounds 5000 --workers 4 --set rules.tokens=2 --set stakes.escalate=0.25 --set stakes.scarce=1 --set stakes.roundPoints=2 --set stakes.answer=-0.3 --variant e35:stakes.escalate=0.35 --variant a25:stakes.answer=-0.25 --variant sc5:stakes.scarce=0.5 --variant t3:rules.tokens=3 --variant t3:stakes.roundPoints=1.25 --variant t3r1:rules.tokens=3 --variant t3r1:stakes.roundPoints=1 --out games/dead-drop/tools/baselines/phase2b1-esc3.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 30,307 rounds across 6 configurations (0 capped), 15 rounds/s (2,036 s, 4 workers), load 3.8 before, 6.7 after (10.4 at its peak). No resume.
- Numbers (95% margins; `*` = significant against this base; bold = in band):

| Rate | Band | base (2 tokens) | e35 | a25 | sc5 | t3 (3 tokens, rp 1.25) | t3r1 (3 tokens, rp 1) |
|---|---|---|---|---|---|---|---|
| Escalation | 35-60 | 60.7 ±1.3 | **59.8** ±1.3 | **59.9** ±1.4 | 66.0 ±1.3 * | **59.6** ±1.3 | **53.2** ±1.4 * |
| `maxStake` | <= 40 | 40.1 ±1.4 | **39.1** ±1.3 | **37.7** ±1.3 * | 41.2 ±1.4 | **39.5** ±1.3 | **34.5** ±1.3 * |
| Escalator won | 55-65 | **64.7** ±1.7 | 66.4 ±1.7 | 66.3 ±1.7 | 74.8 ±1.5 * | **64.5** ±1.7 | 65.3 ±1.8 |
| Won when called | - | 53.9 | 55.2 | 53.6 | 64.1 | 53.4 | 54.1 |
| Answered with a fold | 25-35 | 23.5 ±1.5 | **25.1** ±1.5 | **27.4** ±1.6 * | **29.8** ±1.6 * | 23.7 ±1.5 | 24.6 ±1.6 |
| Rounds per match | 5-7 | **5.59** ±0.11 | **5.67** ±0.11 | **5.71** ±0.12 | **5.72** ±0.12 | **5.81** ±0.09 * | **6.11** ±0.10 * |
| Reel wins | 5-25 | 1.9 ±0.9 | 1.9 ±0.9 | 1.8 ±0.9 | 1.5 ±0.8 | 4.1 ±1.3 * | 3.3 ±1.2 |
| `reelComeback` | report | 100 (17/17) | 100 (17/17) | 100 (16/16) | 92.3 ±14.5 (12/13) | 94.4 ±7.5 (34/36) | 88.9 ±11.9 (24/27) |
| Half-time leader wins | report | 67.6 ±3.2 | 68.3 ±3.2 | 67.6 ±3.2 | 72.1 ±3.2 | 61.9 ±3.5 * | 62.2 ±3.6 * |
| Seat 0 wins (matches) | 45-55 | **49.0** ±3.3 | **48.4** ±3.3 | **49.3** ±3.3 | **52.5** ±3.3 | **50.6** ±3.3 | **47.4** ±3.4 |
| Out of tokens (rounds) | - | 20.9 | 21.0 | 21.3 | 43.3 * | 2.4 * | 2.0 * |
| Tokens spent per player | - | 1.70 | 1.70 | 1.71 | 1.89 * | 1.73 | 1.63 * |
| Points per round | - | 2.60 | 2.57 | 2.53 * | 2.57 | 2.58 | 2.49 * |

- Findings: The combination lands on the edges of four bands at once (escalation 60.7, `maxStake` 40.1, escalator 64.7, folds in answer 23.5), so the effects were close to additive, as hoped. **Three tokens paced the same way do as well as two** (t3: 59.6 / 39.5 / 64.5 / 23.7) and bring the half-time leader's win rate down another 5.7 points to 61.9%: a trailing seat still has tokens for the late rounds. The softer pace (sc5) lets strong first-round hands escalate, which spends tokens early on near-certain wins: the escalator's win rate jumps 10 points. A higher threshold or a higher answer each push the escalator's win rate just over 65 while fixing folds in answer. Report only: agents and cities stay inside 44-56 and 55-80 everywhere (Getaway 44.2 at its lowest, in a25).
- Decision (Step 4's escalation settings): **3 tokens** (the spec's default) with **scarce 1** and **`roundPoints` 1** (t3r1's pace: a rival spends its first token once the leader has 4 points, its second at 6 and its third at 8), since it has the most room inside the escalation and `maxStake` bands (53.2, 34.5) for the answer threshold to work in, and the lowest half-time leader rate with t3. The escalator's win rate (65.3) and folds in answer (24.6) are each just out, and pull against each other through the answer threshold, so Step 5 (B17) tunes the answer and the threshold together at this pace: base escalate 0.15 with answer -0.25 (projected from B15 and B16: about 54% escalation, 34% `maxStake`, 63.5% escalator, 27.5% folds in answer).

## 2026-10-19 · B17 Answers (Step 5) at 3 paced tokens, 5,000 rounds per configuration
- Question: At B16's escalation settings (3 tokens, scarce 1, `roundPoints` 1), which answer threshold puts folds in answer in 25-35% while the escalator's win rate stays in 55-65%? The brief's grid (answer -0.7, -0.5, -0.4) was written for answers below the -0.6 default; B15 and B16 already showed -0.3 gives only 23.5-26.4% folds in answer, and every lower value gives fewer, so that grid cannot reach the band. This run brackets -0.3 to -0.2 instead, with the threshold (0.05, 0.15, 0.25) and the pace (`roundPoints` 1.25) beside it.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ans --rounds 5000 --workers 4 --set rules.tokens=3 --set stakes.scarce=1 --set stakes.roundPoints=1 --set stakes.escalate=0.15 --set stakes.answer=-0.25 --variant a3:stakes.answer=-0.3 --variant a2:stakes.answer=-0.2 --variant e25:stakes.escalate=0.25 --variant e05:stakes.escalate=0.05 --variant rp125:stakes.roundPoints=1.25 --out games/dead-drop/tools/baselines/phase2b1-ans.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 30,415 rounds across 6 configurations (0 capped), 16 rounds/s (1,921 s, 4 workers), load 4.6 before, 4.8 after. No resume.
- Numbers (95% margins; `*` = significant against this base; bold = in band):

| Rate | Band | base (e 0.15, a -0.25) | a3 (-0.3) | a2 (-0.2) | e25 | e05 | rp125 |
|---|---|---|---|---|---|---|---|
| Escalation | 35-60 | **53.8** ±1.4 | **53.4** ±1.4 | **54.4** ±1.4 | **53.7** ±1.4 | **56.4** ±1.4 * | 60.7 ±1.3 * |
| `maxStake` | <= 40 | **32.7** ±1.3 | **34.8** ±1.3 * | **30.7** ±1.3 * | **32.6** ±1.3 | **34.6** ±1.3 * | **38.3** ±1.3 * |
| Escalator won | 55-65 | 65.9 ±1.8 | **64.2** ±1.8 | 68.5 ±1.7 * | 66.8 ±1.8 | 65.7 ±1.7 | **65.0** ±1.7 |
| Won when called | - | 52.2 | 52.9 | 52.3 | 53.2 | 51.5 | 52.1 |
| Answered with a fold | 25-35 | **28.8** ±1.7 | 24.1 ±1.6 * | **34.0** ±1.8 * | **29.1** ±1.7 | **29.4** ±1.7 | **26.9** ±1.6 |
| Rounds per match | 5-7 | **6.21** ±0.10 | **6.05** ±0.10 * | **6.39** ±0.11 * | **6.26** ±0.11 | **6.15** ±0.11 | **5.90** ±0.10 * |
| Reel wins | 5-25 | 4.0 ±1.3 | 3.9 ±1.3 | 3.6 ±1.3 | 3.5 ±1.3 | 3.5 ±1.3 | 3.7 ±1.3 |
| `reelComeback` | report | 87.9 ±11.1 (29/33) | 87.9 ±11.1 (29/33) | 86.2 ±12.6 (25/29) | 89.3 ±11.5 (25/28) | 89.7 ±11.1 (26/29) | 90.6 ±10.1 (29/32) |
| Half-time leader wins | report | 64.3 ±3.5 | 65.0 ±3.5 | 64.6 ±3.6 | 62.9 ±3.6 | 61.5 ±3.6 | 65.2 ±3.4 |
| Seat 0 wins (matches) | 45-55 | **47.9** ±3.4 | **48.1** ±3.4 | **49.9** ±3.5 | **48.4** ±3.5 | **50.6** ±3.4 | **49.7** ±3.3 |
| Tokens spent per player | - | 1.67 | 1.62 | 1.74 * | 1.68 | 1.73 * | 1.79 * |
| Points per round | - | 2.43 | 2.50 * | 2.36 * | 2.42 | 2.46 | 2.54 * |

- Findings: With the pace in place, escalations bunch on the first turn a token is free (turn 2: about two thirds of them), so the threshold barely matters any more: 0.05, 0.15 and 0.25 give the escalator 65.7, 65.9 and 66.8%. The answer threshold now sets a straight trade between the two remaining bands: each 0.05 of answer moves folds in answer about 4.7-5.3 points and the escalator's win rate about 1.7-2.6 points the same way, because a fold in answer is the escalator's win. The window where both are in band is narrow: interpolating a3 and the base, folds in answer reach 25% at about -0.29 and the escalator's win rate passes 65% at about -0.276. `roundPoints` 1.25 lets escalation back up to 60.7%. Report only: agents and cities stay inside 44-56 and 55-80 everywhere.
- Decision: Keep escalate 0.15 (0.05 adds escalation without moving the escalator), scarce 1 and `roundPoints` 1. Answer -0.25 misses the escalator band by 0.9 and -0.3 misses folds in answer by 0.9. Follow-up 1 (B18) scans the window between them (-0.27, -0.28, -0.29), with two small levers for the escalator's win rate beside -0.28: escalate 0.05, and bluffs from turn 2.

## 2026-10-19 · B18 Step 5 follow-up 1: the answer window, 5,000 rounds per configuration
- Question: Between answer -0.3 and -0.25 (B17), is there a threshold where folds in answer (25-35%) and the escalator's win rate (55-65%) are both in band? Beside -0.28: does escalate 0.05, or bluffing from turn 2 (`bluffTurn` 2, default 3), lower the escalator's win rate enough to widen the window?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ans2 --rounds 5000 --workers 4 --set rules.tokens=3 --set stakes.scarce=1 --set stakes.roundPoints=1 --set stakes.escalate=0.15 --set stakes.answer=-0.28 --variant a27:stakes.answer=-0.27 --variant a29:stakes.answer=-0.29 --variant e05:stakes.escalate=0.05 --variant bt2:stakes.bluffTurn=2 --out games/dead-drop/tools/baselines/phase2b1-ans2.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 25,323 rounds across 5 configurations (0 capped), 14 rounds/s (1,855 s, 4 workers), load 3.6 before, 5.8 after (10.7 at its peak). No resume.
- Numbers (95% margins; bold = in band; nothing in the stake rows is significant against the base except e05's escalation and `maxStake`):

| Rate | Band | base (a -0.28) | a27 | a29 | e05 | bt2 |
|---|---|---|---|---|---|---|
| Escalation | 35-60 | **53.5** ±1.4 | **53.6** ±1.4 | **53.4** ±1.4 | **56.2** ±1.4 * | **53.9** ±1.4 |
| `maxStake` | <= 40 | **33.9** ±1.3 | **33.6** ±1.3 | **34.5** ±1.3 | **36.0** ±1.3 * | **34.8** ±1.3 |
| Escalator won | 55-65 | 65.2 ±1.8 | 65.5 ±1.8 | **64.6** ±1.8 | **64.8** ±1.8 | **62.8** ±1.8 |
| Won when called | - | 52.9 | 52.6 | 52.8 | 52.2 | 49.7 |
| Answered with a fold | 25-35 | **26.1** ±1.7 | **27.1** ±1.7 | 24.9 ±1.6 | **26.5** ±1.6 | **26.0** ±1.6 |
| Rounds per match | 5-7 | **6.12** ±0.10 | **6.15** ±0.10 | **6.08** ±0.10 | **6.05** ±0.10 | **6.05** ±0.10 |
| Reel wins | 5-25 | 4.0 ±1.3 | 4.0 ±1.3 | 3.9 ±1.3 | 3.3 ±1.2 | 3.1 ±1.2 |
| `reelComeback` | report | 87.9 ±11.1 (29/33) | 87.9 ±11.1 (29/33) | 87.9 ±11.1 (29/33) | 85.7 ±13.0 (24/28) | 100 (26/26) |
| Half-time leader wins | report | 64.4 ±3.5 | 64.2 ±3.5 | 65.0 ±3.5 | 61.2 ±3.6 | 65.0 ±3.5 |
| Seat 0 wins (matches) | 45-55 | **48.7** ±3.4 | **48.4** ±3.4 | **48.0** ±3.4 | **50.2** ±3.4 | **47.4** ±3.4 |
| Bluffs | - | 79 | 80 | 83 | 79 | 134 |

- Findings: The answer window is too narrow for the answer alone: -0.29 misses folds in answer by 0.1 and -0.28 misses the escalator by 0.2. Two settings meet every stake band: **e05** (escalation 56.2, `maxStake` 36.0, escalator 64.8, folds in answer 26.5) and **bt2** (53.9, 34.8, 62.8, 26.0). Bluffing from turn 2 adds 55 bluffs per 5,000 rounds, and since a bluff is an escalation on a losing hand, the escalator's win when called falls from 52.9 to 49.7%, which opens the window. Report only: agents and cities stay inside 44-56 and 55-80 everywhere.
- Decision: bt2 is the choice for the stake bands (it leaves the escalator 2.2 points inside its band, against e05's 0.2), but its folds in answer sit only 1 point inside theirs. Since the trade between the two runs through the answer (B17: about 0.4 points of escalator per point of folds in answer), follow-up 2 (B19) moves the answer towards the middle of both bands with bluffs from turn 2: -0.27, -0.26 and -0.25.

## 2026-10-19 · B19 Step 5 follow-up 2: the answer with bluffs from turn 2
- Question: With bluffs from turn 2 (B18's bt2), which answer threshold sits most comfortably inside both the folds-in-answer band (25-35%) and the escalator's (55-65%)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ans3 --rounds 5000 --workers 4 --set rules.tokens=3 --set stakes.scarce=1 --set stakes.roundPoints=1 --set stakes.escalate=0.15 --set stakes.bluffTurn=2 --set stakes.answer=-0.27 --variant a26:stakes.answer=-0.26 --variant a25:stakes.answer=-0.25 --out games/dead-drop/tools/baselines/phase2b1-ans3.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 15,143 rounds across 3 configurations (0 capped), 14 rounds/s (1,089 s, 4 workers), load 4.8 before, 5.4 after. No resume.
- Numbers (95% margins; every rate is in band; nothing is significant between the three):

| Rate | Band | base (a -0.27) | a26 | a25 |
|---|---|---|---|---|
| Escalation | 35-60 | 53.9 ±1.4 | 54.1 ±1.4 | 54.0 ±1.4 |
| `maxStake` | <= 40 | 34.6 ±1.3 | 34.1 ±1.3 | 33.9 ±1.3 |
| Escalator won | 55-65 | 63.1 ±1.8 | 63.7 ±1.8 | 63.9 ±1.8 |
| Answered with a fold | 25-35 | 26.6 ±1.7 | 27.6 ±1.7 | 28.2 ±1.7 |
| Rounds per match | 5-7 | 6.08 ±0.10 | 6.12 ±0.10 | 6.12 ±0.10 |
| Reel wins | 5-25 | 3.0 ±1.1 | 3.2 ±1.2 | 3.5 ±1.3 |
| `reelComeback` | report | 100 (25/25) | 100 (26/26) | 100 (29/29) |
| Half-time leader wins | report | 64.3 ±3.5 | 64.3 ±3.5 | 64.1 ±3.5 |
| Seat 0 wins (matches) | 45-55 | 47.6 ±3.4 | 47.4 ±3.4 | 47.1 ±3.4 |
| Bluffs | - | 135 | 133 | 133 |

  Also at -0.27: 1.64 tokens spent per player per match, 2.0% of rounds begin with a seat out of tokens, pot taken 0.32, 2.9% of rounds roll over, 2.48 points per round, escalator's win when called 49.8%. Report only: agents run from Impostor 44.3 to Sleeper 51.2 and cities' "winner took the round" from Moscow 59.6 to Tangier 75.1, all inside 44-56 and 55-80.
- Decision (Steps 4-6): **answer -0.27** with **`bluffTurn` 2**, which leaves both of the tight bands about one margin inside (folds in answer 1.6 points above 25, escalator 1.9 below 65; -0.26 and -0.25 buy folds in answer at the escalator's expense). With escalate 0.15, scarce 1 and `roundPoints` 1 (B16-B17), every two-player stake target meets its band at **3 tokens**. Step 6 needs no run: matches are 6.1 rounds (inside 5-7, so the target stays 10) and escalation is 54%, not near 60, so 2 tokens are not needed (B16 measured them anyway: no better than 3, and the half-time leader wins more often with 2). The Microfilm's reel of 3 decides only 3.0% of matches here, under 5%; Step 7 (B20) measures the reel.

## 2026-10-19 · B20 The Microfilm's reel (Step 7, Decision 12), 5,000 rounds per configuration
- Question: At the chosen stake settings (B19), how often does the Microfilm decide the match under the comeback rule with a reel of 3, 2 or 4, how often are those reel wins comebacks, and does the comeback film bring the half-time leader's win rate down against the spec's original holder rule? `fw0` (`stakes.filmWeight` 0) shows how much of the reel's share comes from the bots chasing the film. The comeback rule is Rich's decision; `holder` is measured only for comparison.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-film --rounds 5000 --workers 4 --set stakes.escalate=0.15 --set stakes.scarce=1 --set stakes.roundPoints=1 --set stakes.answer=-0.27 --set stakes.bluffTurn=2 --variant holder:rules.film=holder --variant comeback2:rules.reel=2 --variant comeback4:rules.reel=4 --variant fw0:stakes.filmWeight=0 --out games/dead-drop/tools/baselines/phase2b1-film.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 3 tokens, 25,350 rounds across 5 configurations (0 capped), 17 rounds/s (1,503 s, 4 workers), load 4.6 before, 4.7 after. No resume. The base (comeback, reel 3) is B19's base configuration, so its numbers repeat B19's exactly.
- Numbers, the five runs (95% margins):

| Run | Reel wins (band 5-25) | `reelComeback` | Half-time leader wins | Rounds per match | Seat 0 wins (matches) | Strips per match |
|---|---|---|---|---|---|---|
| comeback, reel 3 (base) | 3.0 ±1.1 (25 of 840) | 100 (25/25) | 64.3 ±3.5 | 6.08 ±0.10 | 47.6 ±3.4 | 1.30 |
| holder, reel 3 | 82.8 ±2.3 (878 of 1,060) | 23.9 ±2.8 (210/878) | 64.0 ±3.2 | 4.75 ±0.08 | 51.1 ±3.0 | 3.88 |
| comeback, reel 2 | 21.3 ±2.7 (183 of 860) | 94.0 ±3.4 (172/183) | 61.0 ±3.5 | 5.84 ±0.11 | 50.2 ±3.3 | 1.14 |
| comeback, reel 4 | 0.2 ±0.3 (2 of 840) | 100 (2/2) | 64.4 ±3.5 | 6.07 ±0.09 | 48.0 ±3.4 | 1.32 |
| fw0 (comeback, reel 3, film weight 0) | 2.9 ±1.1 (24 of 840) | 100 (24/24) | 64.1 ±3.5 | 6.06 ±0.10 | 48.1 ±3.4 | 1.37 |

  The stake rates in the same runs (bands 35-60 / <= 40 / 55-65 / 25-35; `*` = significant against the base):

| Run | Escalation | `maxStake` | Escalator won | Answered with a fold | Film city's holder took the round |
|---|---|---|---|---|---|
| comeback, reel 3 | 53.9 ±1.4 | 34.6 ±1.3 | 63.1 ±1.8 | 26.6 ±1.7 | 67.9 ±1.6 |
| holder, reel 3 | 42.9 ±1.4 * | 26.7 ±1.2 * | 64.7 ±2.0 | 27.7 ±1.9 | 72.4 ±1.5 * |
| comeback, reel 2 | 52.4 ±1.4 | 32.3 ±1.3 * | **65.1** ±1.8 (out by 0.1) | 27.6 ±1.7 | 69.4 ±1.6 |
| comeback, reel 4 | 54.1 ±1.4 | 35.3 ±1.3 | 62.1 ±1.8 | 25.6 ±1.6 | 67.5 ±1.6 |
| fw0 | 54.8 ±1.4 | 34.5 ±1.3 | 63.9 ±1.8 | 25.8 ±1.6 | 65.3 ±1.6 * |

  Report only: agents and cities stay inside 44-56 and 55-80 in all five.
- Findings: Under the comeback rule a strip goes only to a seat that lost the round, so strips come slowly (about 1.1-1.3 a match, spread over both seats) and a reel of 3 almost never fills: 3.0% of matches, every one of them a comeback. A reel of 2 fills in 21.3% of matches, 94% of them from behind on points, and it ends matches a quarter of a round sooner. At a reel of 3, chasing the film adds almost nothing to the reel's share (fw0: 2.9% against 3.0%); the strips come from losing rounds while holding the film city, not from aiming for it. (Measured at a reel of 3 only; B22 repeats fw0 at a reel of 2.) Under the holder rule the reel decides 83% of matches (3.9 strips a match) and only 24% of those are comebacks: the round's winner usually holds the film city too, so the film would only add to the leader's race. Half-time leader: holder 64.0%, comeback with a reel of 3 64.3% (the same: the reel almost never decides), comeback with a reel of 2 61.0% (3 points lower, inside the margins).
- Decision (Decision 12's ladder, all under comeback): 1. a reel of 3 decides 3.0% of matches, under 5%, so it is not kept; 2. under 5%, so take a reel of 2 if it lands in 5-25%: it does, at 21.3% (the 30% slack is not needed). **The reel is 2: two strips win the match outright.** At a reel of 2 the escalator's win rate reads 65.1%, 0.1 over its band (folds in answer 27.6, escalation 52.4, `maxStake` 32.3 and match length 5.84 stay in band), so, as the brief says, Step 5 is rerun once at the new rule (B21).

## 2026-10-19 · B21 Answers again at a reel of 2 (Step 7's rerun of Step 5), and the chosen settings
- Question: At a reel of 2 the escalator's win rate read 65.1%, 0.1 over its band (B20). Which answer threshold, or which small lever beside it, puts every stake rate back in band at the new rule? One run, as the brief allows.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ans4 --rounds 5000 --workers 4 --set rules.reel=2 --set stakes.escalate=0.15 --set stakes.scarce=1 --set stakes.roundPoints=1 --set stakes.bluffTurn=2 --set stakes.answer=-0.28 --variant a29:stakes.answer=-0.29 --variant e05:stakes.escalate=0.05 --variant bt1:stakes.bluffTurn=1 --variant bt1a27:stakes.bluffTurn=1 --variant bt1a27:stakes.answer=-0.27 --out games/dead-drop/tools/baselines/phase2b1-ans4.json`, commit ee3cf6b, seed dd, Heron x Heron at 24 samples, 3 tokens, comeback film, 25,258 rounds across 5 configurations (0 capped), 17 rounds/s (1,480 s, 4 workers), load 3.4 before, 5.3 after. No resume. (B20's comeback2 is this base with answer -0.27.)
- Numbers (95% margins; every rate below is in band in every configuration; `*` = significant against the base):

| Rate | Band | base (a -0.28) | **a29 (chosen)** | e05 | bt1 | bt1a27 |
|---|---|---|---|---|---|---|
| Escalation | 35-60 | 52.3 ±1.4 | 52.1 ±1.4 | 55.2 ±1.4 * | 52.8 ±1.4 | 53.0 ±1.4 |
| `maxStake` | <= 40 | 32.6 ±1.3 | 32.9 ±1.3 | 34.0 ±1.3 | 32.6 ±1.3 | 32.2 ±1.3 |
| Escalator won | 55-65 | 64.7 ±1.8 | 64.1 ±1.8 | 64.5 ±1.8 | 63.7 ±1.8 | 64.1 ±1.8 |
| Won when called | - | 51.9 | 51.6 | 50.8 | 49.8 | 49.5 |
| Answered with a fold | 25-35 | 26.8 ±1.7 | 25.7 ±1.7 | 27.9 ±1.7 | 27.7 ±1.7 | 28.8 ±1.7 |
| Rounds per match | 5-7 | 5.81 ±0.11 | 5.78 ±0.11 | 5.82 ±0.11 | 5.89 ±0.11 | 5.93 ±0.11 |
| Reel wins | 5-25 | 21.0 ±2.7 (181/860) | 21.5 ±2.7 (189/880) | 19.4 ±2.6 (167/860) | 20.6 ±2.7 (177/860) | 20.9 ±2.7 (180/860) |
| `reelComeback` | report | 93.9 ±3.5 (170/181) | 93.7 ±3.5 (177/189) | 93.4 ±3.8 (156/167) | 85.9 ±5.1 * (152/177) | 85.6 ±5.1 * (154/180) |
| Half-time leader wins | report | 61.1 ±3.5 | 60.7 ±3.5 | 58.0 ±3.5 | 60.0 ±3.6 | 60.0 ±3.6 |
| Seat 0 wins (matches) | 45-55 | 49.8 ±3.3 | 50.2 ±3.3 | 51.3 ±3.3 | 48.5 ±3.3 | 48.4 ±3.3 |
| Bluffs (on turn 1) | - | 128 (0) | 129 (0) | 128 (0) | 182 (40) | 182 (40) |

  Report only: agents and cities stay inside 44-56 and 55-80 in all five (a29: Impostor 44.9 to Sleeper 51.1; Moscow 59.4 to Tangier 74.5).
- Findings: every configuration meets every band; the question is which leaves the most room. The two tight bands still trade through the answer (folds in answer 26.8 to 25.7 and the escalator 64.7 to 64.1 from -0.28 to -0.29). Bluffing from turn 1 gives the most room (63.7 and 27.7) but is rejected on design grounds: the rivals' value escalations start on turn 2, so any rival escalation on turn 1 would be a bluff, a tell a player could learn (and the Countess, bluff 0.3, would show it often); it also lowers the reel's comeback share by 8 points. Escalate 0.05 leaves the escalator only 0.5 inside its band.
- Decision: **answer -0.29**, which leaves the escalator 0.9 inside its band and folds in answer 0.7 inside theirs (the best balance of the bluff-free settings; -0.28 leaves the escalator 0.3). The chosen settings, written into `js/data.js`: `RULES.tokens` 3 (unchanged), `RULES.reel` 2 (was 3), `STAKES` escalate 0.15 (was 0.45), scarce 1 (0.3), roundPoints 1 (3), answer -0.29 (-0.6), bluffTurn 2 (3); lateFold, lateFoldChance, filmWeight and filmDecisive unchanged; `TARGET` 10 (unchanged). Defaults (B12) against the chosen settings (this run's a29):

| Rate | Band | Defaults (B12) | Chosen (B21 a29) | Meets? |
|---|---|---|---|---|
| Escalation | 35-60 | 94.0 ±0.7 | 52.1 ±1.4 | yes |
| `maxStake` | <= 40 | 73.4 ±1.2 | 32.9 ±1.3 | yes |
| Escalator won | 55-65 | 66.0 ±1.3 | 64.1 ±1.8 | yes (0.9 inside) |
| Answered with a fold | 25-35 | 9.5 ±0.8 | 25.7 ±1.7 | yes (0.7 inside) |
| Rounds per match | 5-7 | 4.53 ±0.07 | 5.78 ±0.11 | yes |
| Reel wins | 5-25 | 1.5 ±0.7 (reel 3) | 21.5 ±2.7 (reel 2) | yes |
| `reelComeback` | report | 94.1 ±11.2 | 93.7 ±3.5 | - |
| Seat 0 wins (matches) | 45-55 | 49.6 ±2.9 | 50.2 ±3.3 | yes |
| Half-time leader wins | report | 70.1 ±3.0 | 60.7 ±3.5 | - (B1: 73.9) |
| Agents' win% when played | 44-56 | 45.8 to 51.8 | 44.9 to 51.1 | yes |
| Cities' winner took the round | 55-80 | 61.1 to 74.4 | 59.4 to 74.5 | yes |

  Also at the chosen settings: 1.51 tokens spent per player per match, 1.8% of rounds begin with a seat out of tokens, pot taken 0.33, 3.3% of rounds roll over, 1.14 strips per match, 2.44 points per round. Caution for the 20,000-round final check (Step 9): the escalator's win rate and folds in answer are each within one 5,000-round margin of their edges, and they cannot both move inward: a fold in answer is the escalator's win, so the answer thresholds that keep both in band span only about 0.02 (roughly -0.275 to -0.295 at a reel of 2).

## 2026-10-19 · B22 Bluffs keep the pace (review fix), and answers rerun at the new rule
- Question: The review found that B21's settings made every early rival escalation a bluff: with scarce 1 and `roundPoints` 1, value escalation is out of reach until the leader has 4 points, but the bluff branch of `stakeCall` ignored the pace. Tokens are public, so a player would learn to play on against every early escalation. The ruling: bluffs follow the pace (`stakeCall`'s bluff now also needs `short === 0`), so the early rounds have no rival escalations at all. At that rule, which setting meets every band, with the most room on the escalator's and the folds-in-answer bands? Beside the base: escalate 0.10 and 0.05, answer -0.28 and -0.30, `roundPoints` 1.25, and fw0 at a reel of 2 as a reference.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ans5 --rounds 5000 --workers 4 --variant e10:stakes.escalate=0.1 --variant e05:stakes.escalate=0.05 --variant a28:stakes.answer=-0.28 --variant a30:stakes.answer=-0.3 --variant rp125:stakes.roundPoints=1.25 --variant fw0:stakes.filmWeight=0 --out games/dead-drop/tools/baselines/phase2b1-ans5.json`, on commit 0c7f20e (B21's settings in `data.js`: reel 2, escalate 0.15, scarce 1, `roundPoints` 1, answer -0.29, `bluffTurn` 2) plus the paced bluff in `bot.js` (committed with this entry), seed dd, Heron x Heron at 24 samples, 35,302 rounds across 7 configurations (0 capped), 17 rounds/s (2,074 s, 4 workers), load 2.6 before, 4.6 after. No resume.
- Numbers (95% margins; `*` = significant against this base; bold = in band where the band is tight):

| Rate | Band | base (e 0.15, a -0.29) | **e10 (chosen)** | e05 | a28 | a30 | rp125 | fw0 |
|---|---|---|---|---|---|---|---|---|
| Escalation | 35-60 | 49.2 ±1.4 | 49.4 ±1.4 | 52.4 ±1.4 * | 49.3 ±1.4 | 49.1 ±1.4 | 58.2 ±1.4 * | 48.8 ±1.4 |
| `maxStake` | <= 40 | 29.5 ±1.3 | 30.0 ±1.3 | 31.6 ±1.3 * | 29.2 ±1.3 | 29.9 ±1.3 | 35.1 ±1.3 * | 29.7 ±1.3 |
| Escalator won | 55-65 | 65.3 ±1.9 | **64.8** ±1.9 | 66.6 ±1.8 | 65.6 ±1.9 | 65.2 ±1.9 | 66.3 ±1.7 | 65.3 ±1.9 |
| Won when called | - | 52.4 | 52.1 | 53.7 | 52.3 | 52.9 | 53.3 | 51.8 |
| Answered with a fold | 25-35 | **27.0** ±1.7 | **26.5** ±1.7 | **27.9** ±1.7 | **27.8** ±1.8 | **26.1** ±1.7 | **27.7** ±1.6 | **28.0** ±1.8 |
| Rounds per match | 5-7 | 5.99 ±0.11 | 5.97 ±0.11 | 5.96 ±0.11 | 6.02 ±0.11 | 5.94 ±0.11 | 5.83 ±0.11 * | 5.91 ±0.12 |
| Reel wins | 5-25 | 21.0 ±2.8 (176/840) | 22.1 ±2.8 (186/840) | 20.2 ±2.7 (170/840) | 20.8 ±2.7 (175/840) | 21.0 ±2.7 (181/860) | 18.8 ±2.6 (162/860) | 24.7 ±2.9 (212/860) |
| `reelComeback` | report | 90.3 ±4.4 (159/176) | 90.9 ±4.1 (169/186) | 91.8 ±4.1 (156/170) | 90.3 ±4.4 (158/175) | 90.6 ±4.2 (164/181) | 85.8 ±5.4 (139/162) | 89.2 ±4.2 (189/212) |
| Half-time leader wins | report | 54.0 ±3.6 | 55.4 ±3.6 | 56.5 ±3.6 | 54.0 ±3.6 | 55.3 ±3.6 | 57.1 ±3.5 | 58.1 ±3.6 |
| Seat 0 wins (matches) | 45-55 | 48.1 ±3.4 | 47.6 ±3.4 | 47.9 ±3.4 | 48.1 ±3.4 | 48.4 ±3.3 | 48.7 ±3.3 | 50.8 ±3.3 |
| Bluffs | - | 29 | 27 | 24 | 29 | 29 | 30 | 21 |

  Report only: agents and cities stay inside 44-56 and 55-80 in all seven (e10: Impostor 44.1 to Heavy 50.7; Monaco 60.0 to Lisbon 73.6).
- Findings: Pacing the bluffs cuts them from 129 to 29 per 5,000 rounds (against B21's a29, the same settings with the old bluff rule) and, as expected, lifts the escalator's win rate (64.1 to 65.3) and lowers escalation (52.1 to 49.2) and `maxStake` (32.9 to 29.5); folds in answer rise (25.7 to 27.0) and matches lengthen (5.78 to 5.99). The half-time leader's win rate falls from 60.7 to 54.0, beyond the combined margin (about 5.0): probably because early bluffs were mostly called and lost at a doubled stake, handing early points to whoever already held the better hand. The escalator's win rate now sits at about 65-66% in every configuration; the differences between them (64.8 to 66.6) are no larger than the run-to-run noise, since each variant's play diverges from the base's after its first changed decision. Only e10 reads inside the band. **fw0 at a reel of 2:** `filmDecisive` (1.5) still applies once any seat holds a strip, so at a reel of 2 fw0 only stops the bots chasing the first strip; the reel then decides 24.7% of matches against 21.0% (+3.7, not significant, the opposite way from "chasing makes the reel"). So at either reel the reel's share comes from losing rounds while holding the film city, not from aiming for it.
- Decision: **escalate 0.10**, the one setting that meets every band (escalator 64.8, 0.2 inside; folds in answer 26.5, 1.5 inside). Answer stays -0.29, scarce 1, `roundPoints` 1, `bluffTurn` 2, tokens 3, reel 2, target 10. The escalator's band is met by a hair and sits at about 65-66 across the neighbouring settings, so the 20,000-round final check (Step 9) may well read it just above 65. **Near-miss policy for Step 9 (the coordinator's ruling):** if the 20,000-round check reads a rate outside its band by less than that rate's 95% margin, it is logged as within noise and not retuned. The chosen settings against their bands (this run's e10):

| Rate | Band | Chosen (B22 e10) | Meets? |
|---|---|---|---|
| Escalation | 35-60 | 49.4 ±1.4 | yes |
| `maxStake` | <= 40 | 30.0 ±1.3 | yes |
| Escalator won | 55-65 | 64.8 ±1.9 | yes (0.2 inside) |
| Answered with a fold | 25-35 | 26.5 ±1.7 | yes (1.5 inside) |
| Rounds per match | 5-7 | 5.97 ±0.11 | yes |
| Reel wins | 5-25 | 22.1 ±2.8 | yes |
| `reelComeback` | report | 90.9 ±4.1 | - |
| Seat 0 wins (matches) | 45-55 | 47.6 ±3.4 | yes |
| Half-time leader wins | report | 55.4 ±3.6 | - (B1: 73.9; B12 defaults: 70.1) |
| Agents' win% when played | 44-56 | 44.1 to 50.7 | yes |
| Cities' winner took the round | 55-80 | 60.0 to 73.6 | yes |

  Also at the chosen settings: 1.47 tokens spent per player per match, 1.8% of rounds begin with a seat out of tokens, pot taken 0.34, 3.5% of rounds roll over, 1.16 strips per match, 2.38 points per round.

## 2026-10-19 · B23 The 2b-i final check, 20,000 rounds (Step 9)
- Question: At the chosen settings (reel 2, tokens 3, target 10, escalate 0.10, scarce 1, `roundPoints` 1, answer -0.29, `bluffTurn` 2), does every two-player target hold over 20,000 rounds? Near-miss policy (B22): a rate outside its band by less than its margin is within noise and not retuned.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-final --rounds 20000 --workers 4 --against games/dead-drop/tools/baselines/phase1-heron.json --out games/dead-drop/tools/baselines/phase2b1-final.json`, commit 8c88734, seed dd, Heron x Heron at 24 samples, 20,007 rounds / 3,380 matches (0 capped), 15 rounds/s (1,319.5 s, 4 workers), load 3.9 before, 2.8 after. No resume.
- Numbers (95% margins):

| Rate | Band | Final | Meets? |
|---|---|---|---|
| Escalation | 35-60 | 49.4 ±0.7 | yes |
| `maxStake` | <= 40 | 30.2 ±0.6 | yes |
| Escalator won | 55-65 | **66.0** ±0.9 | **no: 1.0 over the band, more than its 0.9 margin** (not within noise) |
| Answered with a fold | 25-35 | 27.2 ±0.9 | yes |
| Rounds per match | 5-7 | 5.92 ±0.06 | yes |
| Reel wins | 5-25 | 22.3 ±1.4 | yes |
| `reelComeback` | report | 89.1 ±2.2 (673 of 755) | - |
| Seat 0 wins (matches) | 45-55 | 49.2 ±1.7 | yes |
| Half-time leader wins | report | 57.2 ±1.8 | - (B1: 73.9; B22 e10: 55.4) |
| Dead heats / rollovers | report | 3.2 ±0.2 | - |
| Tie-breaks | report | 18.5 ±0.5 | - |
| Folds | report | 24.0 ±0.6 | - |
| Tokens spent per player per match | report | 1.46 ±0.02 | - |
| Rounds begun with a seat out of tokens | report | 1.8 ±0.2 | - |
| Pot taken per round | report | 0.33 ±0.01 | - |
| Strips per match | report | 1.17 | - |
| Film city's holder took the round | report | 69.0 ±0.8 | - |
| Points per round | report | 2.38 ±0.02 | - |
| Bluffs | report | 116 | - |

  Agents (win% when played, band 44-56): all inside: Heavy 50.6, Sleeper 50.6, Jammer 49.6, Tripwire 49.1, Double Agent 47.9, Mole 47.7, Veteran 46.9, Handler 46.9, Assassin 46.2, Lookout 45.7, Getaway 45.4, Impostor 44.7 (0.7 above 44, inside its ±0.9). Cities (winner took the round, band 55-80): all inside, Monaco 61.3 to Lisbon 73.2 (Tangier 70.4, Helsinki 69.9, Vienna 69.5). Nothing outside for 2b-ii; Impostor is the one close to its edge.
- Decision: no retune. The escalator's win rate of 66.0% ±0.9 is outside its band by more than its margin; the coordinator's ruling (claudes-games-fc, for Rich, 2026-10-19) **accepts it as a known one-point miss, with no further sim**. A fold in answer counts as an escalator win, so with folds in answer held at 25% or more the rate can only fall through weaker wins when called; every neighbouring setting read 65-66 at 5,000 rounds (B22); and escalation is now selective (49% against B1's 99%), so the escalator wins a little more, as a selective bettor should.

## 2026-10-19 · B24 Skill still tells: the ladder, and Wren v Control (Step 10)
- Question: Does each rival still beat the one below (B4's bar: outside the margin), and how does the novice-versus-expert gap compare with B3's 85.4%?
- Configuration: ladder `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-ladder --ladder --rounds 2000 --workers 4` (copied from `.tmp/dead-drop-sim/p2b1-ladder.json` to `games/dead-drop/tools/baselines/phase2b1-ladder.json`; I forgot `--out`), 8,104 rounds across 4 pairs, 11 rounds/s (706 s), load 1.7 after. Mixed `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-mixed --a wren --b control --rounds 5000 --workers 4 --out games/dead-drop/tools/baselines/phase2b1-mixed.json --resume`, 5,105 rounds / 860 matches (0 capped), killed partway when Rich's laptop closed, resumed from 28 batches (45 rounds/s for the remainder, 112.6 s), load 5.4. Commit 8c88734, seed dd.
- Numbers (A is the lower rival; B4 in brackets):

| Pair | A wins | Rounds per match | A's upper bound (A wins + margin) under 50%? |
|---|---|---|---|
| Wren v Magpie | 42.4% ±5.3 [39.3] | 5.96 | yes (47.7 < 50) |
| Magpie v Heron | 42.8% ±5.1 [33.8] | 5.56 | yes (47.9 < 50) |
| Heron v Countess | 41.1% ±5.1 [41.7] | 5.67 | yes (46.2 < 50) |
| Countess v Control | 47.4% ±5.0 [40.0] | 5.35 | **no** (52.4) |

  Wren v Control (Wren is A): Wren wins 20.2% ±2.7 of matches, so Control wins 79.8% (B3: 85.4%); 5.9 rounds a match, half-time leader wins 71.8% ±3.2 (B3: 80%), escalator won 67.3, folds in answer 32.1, reel wins 14.4%.
- Decision: no pair is inverted (every lower rival's win rate is under 50%), but Countess v Control is within noise: A wins 47.4% ±5.0, upper bound 52.4, so the higher rival's lead there (52.6% for Control) does not clear its margin, and the step has shrunk from B4's 40.0% for A. The other steps are narrower than in B4 too (Magpie v Heron: A wins 42.8%, was 33.8). The stakes flatten skill somewhat (Control over Wren 79.8%, was 85.4), still a clear gradient end to end. Not retuned. For 2b-ii: Countess v Control is within noise (47.4 ±5.0), so 2b-ii's ladder work with rival twists must restore a clear step there.

## 2026-10-19 · B25 A first look at the stakes at 3 seats (Step 11, informative only)
- Question: What do the stakes do at three seats, on B10's configuration? The pace is tuned for two players at target 10; at target 8 (3 seats) `roundPoints` 1 gives a different pace (short is 1 at 0 points and 0 once the leader has 2 or 1 points). Phase 3 owns these numbers; nothing is tuned.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-seats3 --seats 3 --target 8 --samples 8 --rounds 5000 --workers 4 --against games/dead-drop/tools/baselines/phase2a-seats3.json --out games/dead-drop/tools/baselines/phase2b1-seats3.json`, commit 8c88734, seed dd, 5,014 rounds / 1,180 matches (0 capped), 34 rounds/s (146 s), load 6.1 before and after (under the skip threshold of 10; speed well above B10's 7).
- Numbers (B10 in brackets):

| Rate | Value |
|---|---|
| Half-time leader wins | 51.3% ±3.0 [62.3] (Phase 3's bar <= 60: met) |
| Tie-breaks | 21.4% ±1.1 [48.4] |
| Dead heats | 3.1% ±0.5 [6.2] |
| Reel wins | 6.9% ±1.5 (90.2% from behind) |
| Escalation | 73.9% ±1.2; escalator won 68.8; answers were folds 61.7% |
| Folds | 34.3% ±1.3 |
| Rounds per match | 4.2 ±0.08 [7.6] |
| Seat shares (matches) | 33.3 / 31.7 / 35.0 (each ±2.7) |
| Other | pot taken 1.29, 1.05 tokens spent per player, 1.5% rounds begin with a seat out, 3.28 points per round |

- Decision: informative only. At three seats escalation is far more common (74%) and most answers are folds (62%); matches are 3.4 rounds shorter than B10 and the half-time leader is no longer favoured. Agents run 30.0 (Lookout) to 40.8 (Heavy) win% when played, against a 33% fair share.

## 2026-10-19 · B26 A first look at the stakes at 4 seats (Step 11, informative only)
- Question: The same at four seats, target 7 (the pace caveat of B25 applies).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b1-seats4 --seats 4 --target 7 --samples 8 --rounds 5000 --workers 4 --against games/dead-drop/tools/baselines/phase2a-seats4.json --out games/dead-drop/tools/baselines/phase2b1-seats4.json`, commit 8c88734, seed dd, 5,038 rounds / 1,460 matches (0 capped), 16 rounds/s (316 s), load 6.1 before, 7.0 after (above half of B10's 4).
- Numbers (B10 in brackets):

| Rate | Value |
|---|---|
| Half-time leader wins | 43.9% ±2.7 [54.4] (bar <= 60: met) |
| Tie-breaks | 27.0% ±1.2 [61.4] |
| Dead heats | 4.4% ±0.6 [8.7] |
| Reel wins | 5.1% ±1.1 (94.6% from behind) |
| Escalation | 68.2% ±1.3; escalator won 68.5; answers were folds 73.3% |
| Folds | 31.8% ±1.3 |
| Rounds per match | 3.5 ±0.06 [7.8] |
| Seat shares (matches) | 25.3 / 23.5 / 25.9 / 25.3 (each ±2.2) |
| Other | pot taken 2.06, 0.59 tokens spent per player, 0.4% rounds begin with a seat out, 3.96 points per round |

- Decision: informative only. Matches are short (3.5 rounds, less than half of B10's) and the half-time leader wins 43.9%, so at four seats the pace, not the stakes, is what Phase 3 will have to retune (target 7 with 4 points a round). Seats are fair.

## 2026-10-19 · B27 Phase 2b-ii timing run, Mixed rosters at 8 samples (Task 11 Step 1)
- Question: How fast does the Mixed-roster screen run at 8 samples on this machine today? Under half of 2b-i's 8-sample speed (97 rounds/s, B6) would mean a hot-path problem (`candidates`, a new city branch) to find before the long runs.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-time --roster mixed --samples 8 --rounds 1000 --workers 4`, commit a22ae11, seed dd, Heron x Heron at 8 samples, 1,023 rounds / 180 matches (0 capped), 65 rounds/s (15.7 s, 4 workers), load 1.8 before, 2.7 after. No resume.
- Numbers (a first look only; B28 is the measured run): 5.7 ±0.27 rounds per match, seat 0 wins 52.8% ±7.3 of matches, escalation 50.5% ±3.1, escalator won 69.2% ±4.0, answers were folds 34.6% ±4.1, won at stake 2 or more 40.8% ±3.0, reel wins 18.9% ±5.7, points per round 2.65 ±0.09.
- Decision: 65 rounds/s is two thirds of 97 (above half), so no hot-path hunt: the Mixed rosters' extra candidates (partners, Casablanca's face-down choice) cost about what Task 9 measured. The 20,000-round screen should take about 5 minutes.

## 2026-10-19 · B28 The Mixed screen, 20,000 rounds at 8 samples (Task 11 Step 2)
- Question: With all 20 agents and 20 cities in play (Mixed rosters: 12 of 20 agents a match, always the Heavy and a takedown; all 20 cities in the pool), which agents fall outside 44-56% win when played and which cities outside 55-80% "winner took the round"? Those are the outliers to probe (spec 2.8's screen).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-screen --roster mixed --samples 8 --rounds 20000 --workers 4 --out games/dead-drop/tools/baselines/phase2b2-screen.json`, commit a22ae11, seed dd, Heron x Heron at 8 samples, 20,029 rounds / 3,620 matches (0 capped), 88 rounds/s (228.9 s, 4 workers), load 2.8 before, 5.6 after. No resume.
- Numbers (95% margins; "in roster" is the rounds dealt with the agent in the match's roster):

| Agent | in roster | played | win% when played | win% when not | 44-56? |
|---|---|---|---|---|---|
| Heavy | 20029 | 19868 | 52.7 ±0.7 | 39.1 ±1.0 | yes |
| Sleeper | 11405 | 10119 | 52.0 ±1.0 | 43.3 ±1.2 | yes |
| Veteran | 11401 | 9269 | 48.7 ±1.0 | 48.5 ±1.2 | yes |
| Double Agent | 11621 | 8902 | 48.6 ±1.0 | 48.7 ±1.1 | yes |
| Jammer | 11396 | 9950 | 50.7 ±1.0 | 45.0 ±1.2 | yes |
| Handler | 11669 | 8914 | 48.0 ±1.0 | 49.1 ±1.1 | yes |
| Mole | 11334 | 9305 | 49.0 ±1.0 | 47.8 ±1.2 | yes |
| Getaway | 11177 | 6721 | 46.2 ±1.2 | 50.0 ±1.0 | yes |
| Lookout | 11270 | 6290 | 46.8 ±1.2 | 49.5 ±1.0 | yes |
| Assassin | 13683 | 11100 | 48.6 ±0.9 | 48.6 ±1.1 | yes |
| Tripwire | 14065 | 9990 | 49.1 ±1.0 | 48.0 ±1.0 | yes |
| Impostor | 11279 | 7895 | 47.2 ±1.1 | 49.8 ±1.1 | yes |
| Wiretap | 11557 | 5831 | 46.4 ±1.3 | 49.7 ±1.0 | yes |
| Interrogator | 11267 | 7404 | 46.9 ±1.1 | 50.0 ±1.1 | yes |
| Bodyguard | 11167 | 7723 | 46.4 ±1.1 | 50.7 ±1.1 | yes |
| Accomplice | 11625 | 10091 | 49.4 ±1.0 | 47.3 ±1.2 | yes |
| Turncoat | 11502 | 8636 | 48.4 ±1.1 | 48.8 ±1.1 | yes |
| Courier | 11412 | 8369 | 45.9 ±1.1 | 51.1 ±1.1 | yes |
| Blackmailer | 10133 | 6607 | 47.1 ±1.2 | 49.9 ±1.1 | yes |
| Decoy | 11356 | 5093 | 46.0 ±1.4 | 49.7 ±0.9 | yes |

| City | rounds | decided | winner took round | 55-80? |
|---|---|---|---|---|
| Lisbon | 2278 | 80.9 ±1.6 | 76.7 ±1.9 | yes |
| Vienna | 2161 | 87.6 ±1.4 | 69.7 ±2.1 | yes |
| Istanbul | 2037 | 92.4 ±1.2 | 67.1 ±2.1 | yes |
| Berlin | 2121 | 85.6 ±1.5 | 66.5 ±2.2 | yes |
| Havana | 2099 | 86.9 ±1.4 | 63.0 ±2.2 | yes |
| Monaco | 2063 | 89.6 ±1.3 | 64.8 ±2.2 | yes |
| Hong Kong | 2067 | 88.2 ±1.4 | 63.5 ±2.2 | yes |
| Helsinki | 2040 | 79.3 ±1.8 | 69.0 ±2.3 | yes |
| Moscow | 2109 | 89.9 ±1.3 | 63.4 ±2.2 | yes |
| Venice | 2081 | 81.5 ±1.7 | 67.8 ±2.2 | yes |
| Tangier | 2246 | 71.5 ±1.9 | 69.1 ±2.3 | yes |
| Reykjavik | 2189 | 93.4 ±1.0 | 68.0 ±2.0 | yes |
| Casablanca | 2256 | 87.3 ±1.4 | 69.6 ±2.0 | yes |
| Rome | 2172 | 91.0 ±1.2 | 69.1 ±2.0 | yes |
| Tokyo | 2163 | 92.1 ±1.1 | 65.5 ±2.1 | yes |
| Zurich | 2210 | 87.6 ±1.4 | 71.3 ±2.0 | yes |
| Macau | 2097 | 89.6 ±1.3 | 62.3 ±2.2 | yes |
| Glienicke Bridge | 2087 | 87.4 ±1.4 | 65.1 ±2.2 | yes |
| Prague | 2111 | 87.7 ±1.4 | 62.7 ±2.2 | yes |
| Geneva | 2154 | 95.6 ±0.9 | 67.3 ±2.0 | yes |

  Seat 0 wins 51.1% ±1.6 of matches (band 45-55: yes) and 50.2% ±0.8 of decided rounds; A wins 49.0% ±1.6.

  Stake rates, report only (this run is at 8 samples, B23 at 24, and B2 showed cheap bots play a more timid stake game, so these are not like for like; Step 5 compares at the bots' own samples):

| Rate | B28 Mixed, 8 samples | B23 Classic, 24 samples (2b-i final) |
|---|---|---|
| Escalation | 49.7 ±0.7 | 49.4 ±0.7 |
| Won at stake 2 or more (`maxStake`) | 41.5 ±0.7 | 30.2 ±0.6 |
| Escalator won | 68.6 ±0.9 | 66.0 ±0.9 |
| Answered with a fold | 34.0 ±0.9 | 27.2 ±0.9 |
| Rounds per match | 5.53 ±0.06 | 5.92 ±0.06 |
| Reel wins | 17.4 ±1.2 | 22.3 ±1.4 |
| `reelComeback` | 92.6 ±2.0 | 89.1 ±2.2 |
| Half-time leader wins | 61.4 ±1.7 | 57.2 ±1.8 |
| Points per round | 2.69 ±0.02 | 2.38 ±0.02 |
| Folds / dead heats / tie-breaks | 28.9 / 2.1 / 15.1 | 24.0 / 3.2 / 18.5 |
| Tokens spent per player per match | 1.37 | 1.46 |
| Bluffs | 106 | 116 |

- Outliers: none. Every agent's win% when played is inside 44-56 (Courier 45.9 ±1.1 to Heavy 52.7 ±0.7; the closest to an edge are Courier 45.9, Decoy 46.0, Getaway 46.2, Wiretap and Bodyguard 46.4), and every city's "winner took the round" inside 55-80 (Macau 62.3 ±2.2 to Lisbon 76.7 ±1.9). Of the new content, the Accomplice (49.4) reads strongest and the Courier and Decoy weakest; of the new cities, Zurich (71.3) is the most decisive and Macau and Prague (about 62-63) the least.
- Other: the Blackmailer is in fewer roster rounds than its neighbours (10,133 against about 11,400 for an untargeted agent), but not in fewer rosters: replaying only the roster draws of these 3,620 matches (`matchOptions` on the seeds `dd:<index>:setup`, no play; the roster section of `tools/points-by-roster.mjs --from games/dead-drop/tools/baselines/phase2b2-screen.json`, B30) puts it in 2,035 of them, like any untargeted agent (2,014 to 2,097; the Assassin 2,467 and the Tripwire 2,537 gain from the takedown redraw). So matches holding a Blackmailer are shorter: 4.98 rounds against 6.24 without it (every other agent's matches run 5.48 to 5.63 rounds). Its free escalation (a doubled stake, no fold in answer) pays more points a round; B30 measures it at the bots' own samples (Risk 1). Agents played least: the Decoy (5,093) and the Wiretap (5,831).
- Decision: no outliers, so Step 3 has nothing to probe and no roster constraint is needed (nothing traces to roster composition). `data.js` keeps the spec's powers and city knobs; Step 5 confirms them at the bots' own samples.

## 2026-10-19 · B29 The Mixed confirm, 20,000 rounds at the bots' own samples (Task 11 Step 5)
- Question: With the spec's powers and city knobs unchanged (B28 found no outliers), is every agent inside 44-56% win when played, every city inside 55-80% "winner took the round", and seat 0 inside 45-55%, with Heron x Heron at its own 24 samples on Mixed rosters? Near-miss rule (the brief): a row outside its band by less than its margin is logged and accepted.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-final --roster mixed --rounds 20000 --workers 4 --out games/dead-drop/tools/baselines/phase2b2-final.json`, commit a22ae11, seed dd, Heron x Heron at 24 samples, 20,098 rounds / 3,940 matches (0 capped), 30 rounds/s (674.6 s, 4 workers), load 5.6 before, 8.5 after. No resume.
- Numbers (95% margins):

| Agent | in roster | played | win% when played | win% when not | 44-56? |
|---|---|---|---|---|---|
| Heavy | 20098 | 22859 | 51.8 ±0.6 | 39.3 ±1.0 | yes |
| Sleeper | 11292 | 11655 | 50.9 ±0.9 | 43.7 ±1.2 | yes |
| Veteran | 11397 | 10624 | 48.3 ±1.0 | 48.5 ±1.1 | yes |
| Double Agent | 11552 | 9625 | 48.5 ±1.0 | 48.0 ±1.1 | yes |
| Jammer | 11403 | 11495 | 50.6 ±0.9 | 44.1 ±1.2 | yes |
| Handler | 11738 | 10237 | 48.3 ±1.0 | 48.8 ±1.1 | yes |
| Mole | 11248 | 10695 | 48.6 ±0.9 | 48.1 ±1.2 | yes |
| Getaway | 11277 | 7317 | 47.0 ±1.1 | 49.2 ±1.0 | yes |
| Lookout | 11289 | 6597 | 46.7 ±1.2 | 49.2 ±0.9 | yes |
| Assassin | 13623 | 12498 | 47.7 ±0.9 | 49.4 ±1.0 | yes |
| Tripwire | 14165 | 11614 | 49.0 ±0.9 | 47.7 ±0.9 | yes |
| Impostor | 11312 | 8534 | 46.2 ±1.1 | 50.1 ±1.0 | yes |
| Wiretap | 11607 | 5869 | 46.0 ±1.3 | 49.3 ±0.9 | yes |
| Interrogator | 11424 | 7909 | 46.6 ±1.1 | 49.7 ±1.0 | yes |
| Bodyguard | 11424 | 8784 | 46.8 ±1.0 | 49.5 ±1.0 | yes |
| Accomplice | 11571 | 11458 | 49.1 ±0.9 | 47.2 ±1.2 | yes |
| Turncoat | 11508 | 9979 | 47.9 ±1.0 | 48.7 ±1.1 | yes |
| Courier | 11503 | 9522 | 45.9 ±1.0 | 50.7 ±1.0 | yes |
| Blackmailer | 10284 | 7122 | 46.7 ±1.2 | 49.4 ±1.0 | yes |
| Decoy | 11461 | 4862 | 47.8 ±1.4 | 48.5 ±0.8 | yes |

  ("played" counts each seat's drop, so the Heavy, in every roster and dropped by both players, is played more often than it is in a roster.)

| City | rounds | decided | winner took round | 55-80? |
|---|---|---|---|---|
| Lisbon | 2528 | 77.1 ±1.6 | 75.0 ±1.9 | yes |
| Vienna | 2523 | 86.9 ±1.3 | 69.8 ±1.9 | yes |
| Istanbul | 2215 | 91.2 ±1.2 | 66.0 ±2.1 | yes |
| Berlin | 2365 | 83.7 ±1.5 | 66.3 ±2.1 | yes |
| Havana | 2396 | 86.4 ±1.4 | 63.5 ±2.1 | yes |
| Monaco | 2320 | 89.0 ±1.3 | 65.0 ±2.1 | yes |
| Hong Kong | 2315 | 88.6 ±1.3 | 63.8 ±2.1 | yes |
| Helsinki | 2258 | 81.3 ±1.6 | 72.0 ±2.1 | yes |
| Moscow | 2414 | 87.5 ±1.3 | 65.2 ±2.0 | yes |
| Venice | 2277 | 82.0 ±1.6 | 68.9 ±2.1 | yes |
| Tangier | 2426 | 71.4 ±1.8 | 68.2 ±2.2 | yes |
| Reykjavik | 2325 | 93.9 ±1.0 | 64.5 ±2.0 | yes |
| Casablanca | 2571 | 86.5 ±1.3 | 68.5 ±1.9 | yes |
| Rome | 2425 | 88.3 ±1.3 | 67.2 ±2.0 | yes |
| Tokyo | 2466 | 93.1 ±1.0 | 66.7 ±1.9 | yes |
| Zurich | 2453 | 88.4 ±1.3 | 70.9 ±1.9 | yes |
| Macau | 2342 | 87.8 ±1.3 | 62.2 ±2.1 | yes |
| Glienicke Bridge | 2311 | 86.1 ±1.4 | 63.0 ±2.1 | yes |
| Prague | 2288 | 87.8 ±1.3 | 61.8 ±2.1 | yes |
| Geneva | 2356 | 95.2 ±0.9 | 65.3 ±2.0 | yes |

  Seat 0 wins 49.8% ±1.6 of matches (band 45-55: yes) and 50.2% ±0.8 of decided rounds; A wins 51.3% ±1.6.

  Stake rates beside 2b-i's (report only: the stake settings are 2b-i's and are not retuned here; bands from spec 2.8):

| Rate | 2b-i band | B29 Mixed | B23 Classic (2b-i final) |
|---|---|---|---|
| Escalation | 35-60 | 49.7 ±0.7 | 49.4 ±0.7 |
| Won at stake 2 or more (`maxStake`) | <= 40 | **46.5** ±0.7 | 30.2 ±0.6 |
| Escalator won | 55-65 | 64.9 ±0.9 | 66.0 ±0.9 |
| Answered with a fold | 25-35 | **23.7** ±0.8 | 27.2 ±0.9 |
| Rounds per match | 5-7 | 5.10 ±0.05 | 5.92 ±0.06 |
| Reel wins | 5-25 | 19.5 ±1.2 | 22.3 ±1.4 |
| `reelComeback` | report | 91.9 ±1.9 | 89.1 ±2.2 |
| Half-time leader wins | report | 60.2 ±1.7 | 57.2 ±1.8 |
| Points per round | report | 2.86 ±0.02 | 2.38 ±0.02 |
| Folds / dead heats / tie-breaks | report | 21.1 / 2.7 / 17.7 | 24.0 / 3.2 / 18.5 |
| Tokens spent per player per match | report | 1.27 | 1.46 |
| Film city's holder took the round | report | 69.0 ±0.8 | 69.0 ±0.8 |
| Bluffs | report | 122 | 116 |

  Escalation, Escalator won, Answered with a fold and Bluffs count token escalations only: the Blackmailer's free escalation is not in the sim's `escalations` (its doubled stake does count in `maxStake` and in points), so Mixed's 49.7 against Classic's 49.4 is not like for like.

- Findings: every agent, every city and seat 0 are in band, none near an edge by less than its margin (closest: the Courier at 45.9 ±1.0 and the Wiretap at 46.0 ±1.3, both about 2 points inside 44; Lisbon at 75.0, 5 points inside 80). Against the 8-sample screen (B28), pair by pair (|diff| > the combined margin), only Reykjavik moved (68.0 to 64.5, -3.5 against 2.9); every agent and the other 19 cities carried over, as B2 found. The stake game runs hotter on Mixed than Classic: rounds won at stake 2 or more 46.5% (over 2b-i's 40% bar), folds in answer 23.7% (under its 25%), matches 0.8 rounds shorter and 0.48 more points a round. The Blackmailer explains most of it: replaying the roster draws of these 3,940 matches (`tools/points-by-roster.mjs`, B30) puts it in 2,212, whose matches run 4.65 rounds against 5.68 without it (every other agent's matches: 5.08, the Impostor, to 5.18, the Jammer). Its free escalation doubles the stake without a token and without a fold in answer, so it adds stake-2 rounds and takes answers out of the fold count.
- Decision: no retune of agents or cities: the spec's powers and knobs stand (`data.js` unchanged by Steps 3-5). The Mixed stake overshoot (`maxStake` 46.5, folds in answer 23.7, and matches holding a Blackmailer at 4.65 rounds) is outside this task's bands and knobs (the stakes are 2b-i's, report only), so it goes to the coordinator, with the Risk 1 numbers in B30.

## 2026-10-19 · B30 Risk 1: points with and without the Blackmailer and Macau, at the bots' own samples
- Question: Playouts score rounds, not stakes, so an agent or city that pays in points can read "average" in win% when played or "winner took the round" (plan Risk 1). Do the Blackmailer (a free escalation, no fold in answer) and Macau (its holder scores the stake once more) change points per round, and does either favour its side in points more than in rounds?
- Configuration: `nice -n 19 node games/dead-drop/tools/points-by-roster.mjs --from games/dead-drop/tools/baselines/phase2b2-final.json --rounds 10000 --workers 4` (the tool is committed with this entry, on 6ad70cc; the play code is a22ae11's, since only `data.js`'s `TWISTS` and comments changed in between and a Mixed base deals no twist). It replays B29's configuration (seed dd, Heron x Heron at 24 samples, Mixed rosters) match by match through `playMatch`, so its matches are B29's first ones: the shortest in-order prefix of 20-match batches reaching 10,000 rounds, 10,097 rounds / 1,980 matches, 28 rounds/s (355.8 s, 4 workers), load 4.2 before, 7.2 after. The roster section replays only the roster draws of all 3,940 B29 matches (`matchOptions` on the seeds `dd:<index>:setup`) against B29's `inRoster`; it is where B28's and B29's rounds-per-match figures come from (same tool, `--from` the screen's or the confirm's JSON). A first run of the same method from an uncommitted script (matches 0-2039, 10,395 rounds, a few batches past the prefix) gave the same numbers to within 0.3 points.
- Definitions (the tool's header says the same):
  - A round's points are its `result.points`: what the round's winner scores (twice the stake plus the pot, plus Macau's extra; the pot after a fold; 0 for a dead heat). Monaco's +1 is not in them. Points per round count every round, folds included, as the sim's points per round does.
  - ± on a mean is 1.96 × SD / √n over rounds (as `stats.mjs`'s `histMean`), treating rounds as independent; they cluster in matches, so it is a little narrow. ± on a share is the 95% margin of a proportion.
  - The Blackmailer "played, to the flip": a (round, seat) pair where the seat dropped it (as its drop or as an Accomplice's partner) and no fold ended the round. Its share of the rounds is that seat's round wins over those pairs; its share of the points is the points that seat won over all the points those rounds paid.
  - Macau "held at the flip": a round no fold ended, with Macau dealt and won by one seat (`cityWinners`; a tie or an empty Macau holds nothing). Shares as above, for Macau's winner.
- Numbers:

| Rate | With | Without |
|---|---|---|
| Points per round, Blackmailer in the roster | 3.14 ±0.04 (5,188 rounds) | 2.55 ±0.04 (4,909 rounds) |
| Rounds per match, Blackmailer in the roster (all 3,940 B29 matches; it is in 2,212) | 4.65 | 5.68 |
| Points per round, Macau dealt | 3.37 ±0.09 (1,538 rounds) | 2.76 ±0.03 (8,559 rounds) |

  The Blackmailer played, to the flip: 3,608 seat-rounds; its seat took 46.6% ±1.6 of those rounds and 48.1% of the points they paid. Macau held at the flip: 1,047 rounds; its holder took 61.8% ±2.9 of them (B29: Macau's winner took the round 62.2%) and 73.1% of the points they paid, so about 647 rounds paid Macau's extra stake. Every other agent's matches run 5.08 (Impostor) to 5.18 (Jammer) rounds with it in the roster.
- Findings: the Blackmailer is not strong for its player in points (48.1% of the points against 46.6% of the rounds): the bots flip it without regard to who is ahead, so its free escalation raises the stakes for both sides alike. What it does is speed the match: 0.59 more points a round and a match a whole round shorter (4.65 against 5.68 rounds, under the 5-7 band with it, inside without). Macau is the opposite: its holder takes 73.1% of the points against 61.8% of the rounds, so it is worth more than its "winner took the round" shows, and the bots, which score it as any other city, underrate it. Both are what the rules say; neither is out of a band this task tunes.
- Decision: no change in this task. For the coordinator (Risk 1): matches with a Blackmailer run short (4.65 rounds) and push Mixed's rounds won at stake 2 or more to 46.5% (B29, over 2b-i's 40% bar); if that matters, the lever is the Blackmailer's rule (for instance, its escalation spends a token, or a fold in answer is allowed), a design call outside Task 11's knobs (its power moves round wins, not the stake). Macau's points edge is the design; a bot that weighted Macau by its stake would play it more like a person.

## 2026-10-19 · B31 The ladder: a steady Heron against each rival's setup, with and without its twist (Task 11 Step 6)
- Question: Playing each rival's ladder setup (Classic plus the packs up to it, its pack's agents always in, its cities featured in round 1, its twist on bot B's seat), does a steady player's match-win rate fall strictly from Wren to Control, each step larger than its combined margin, with Control at least 20%? Heron (24 samples, no twist) is bot A and stands in for the steady player; each rival plays at its own samples. The `notwist` variant replays the same seeds without the twist (paired).
- Configuration: for each rival R, `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-ladder-R --a heron --b R --setup R --rounds 5000 --variant notwist:twist=off --workers 4 --out games/dead-drop/tools/baselines/phase2b2-ladder-R.json` (the brief's command plus `--workers 4` and `--out`), commit a22ae11 (`TWISTS` as written: magpie lookout, heron sleeper, countess from 6, control count 1), seed dd. No resume.
- Numbers (Heron's match-win rate is `aMatchWins`; ± is 95%; rows added as each rung finished):

| Rival (samples) | Heron wins, twist on | Heron wins, no twist | Twist's effect | Rounds / matches (each) | Rounds per match (on) | rounds/s, load |
|---|---|---|---|---|---|---|
| Wren (6), Classic, no twist | 70.2 ±3.1 | 70.2 ±3.1 | none (identical: Wren has no twist) | 5,107 / 840 | 6.08 | 60 (169.1 s for both), 3.9 before, 5.3 after |
| Magpie (12), twist: a 13th agent, a Lookout | 63.4 ±2.7 | 59.3 ±2.8 | Heron +4.1 ±3.9 with it (the twist helps Heron) | 5,032 / 1,220 (no twist: 5,084 / 1,220) | 4.12 | 45 (226.4 s), 4.7 before, 5.2 after |
| Heron (24), twist: a Sleeper placed face down each round | 43.3 ±3.2 | 48.2 ±3.1 | Heron -5.0 ±4.4 | 5,015 / 920 (no twist: 5,007 / 1,020) | 5.45 | 32 (315.4 s), 4.7 before, 5.2 after |
| Countess (40), twist: a built-in Wiretap from turn 6 | 38.7 ±2.9 | 41.0 ±3.0 | Heron -2.4 ±4.2 | 5,031 / 1,060 (no twist: 5,043 / 1,060) | 4.75 | 22 (465.9 s), 4.5 before, 5.5 after |
| Control (80), twist: sees 1 card of your hand each round | 40.7 ±3.0 | 39.1 ±3.1 | Heron +1.6 ±4.3 | 5,063 / 1,000 (no twist: 5,029 / 980) | 5.06 | 13 (760.7 s), 5.0 before, 4.0 after |

  Steps (Heron's win rate must fall at each, by more than the two margins combined, `sqrt(m1^2 + m2^2)`):

| Step | Fall | Combined margin | Measurably harder? |
|---|---|---|---|
| Wren to Magpie | 70.2 to 63.4: 6.9 | 4.1 | yes |
| Magpie to Heron | 63.4 to 43.3: 20.1 | 4.2 | yes |
| Heron to Countess | 43.3 to 38.7: 4.6 | 4.3 | yes (by 0.2) |
| Countess to Control | 38.7 to 40.7: -2.0 (a rise) | 4.2 | **no** (inverted, within noise) |

- Findings: three steps hold, and Control (40.7) is well above the 20% floor, but Control is no harder than the Countess: a steady Heron wins 40.7% against Control's setup and 38.7% against the Countess's. Without twists the two read 39.1 and 41.0, the same tie, so it is the rivals themselves (80 samples against 40, as in B24's 47.4% Countess v Control) and not their twists. The twists' own effects: Heron's placed Sleeper is the strongest (-5.0 for Heron, just past its 4.4 margin), the Countess's final-turn tap and Control's one seen card are not measurable (-2.4 and +1.6), and the Magpie's extra Lookout makes her easier (+4.1 for Heron; a hypothesis, untested: a 13th, weak card dilutes her deck). The Magpie's setup always holds the Blackmailer (her pack), so her matches are short (4.12 rounds; B30).
  Without twists the steps are 11.0, 11.0, 7.2 and 2.0 (each against about 4.2): the twists narrow Heron to Countess (Heron's Sleeper makes his own rung harder) and only Countess to Control fails either way.
- Decision: retune Control's twist by one notch, `control.count` 1 to 2, and re-run Control only (B32). The other rungs stand.

## 2026-10-19 · B32 Ladder retune 1: Control sees 2 cards (`control.count` 2)
- Question: B31's Countess-to-Control step failed (Heron won 38.7% against the Countess and 40.7% against Control). With Control's twist one notch stronger (it sees 2 cards of your hand each round, not 1), is Control measurably harder than the Countess (a fall in Heron's win rate larger than the combined margin, about 4.2)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-ladder-control-c2 --a heron --b control --setup control --rounds 5000 --set control.count=2 --workers 4 --out games/dead-drop/tools/baselines/phase2b2-ladder-control-c2.json`, commit a22ae11, seed dd, 5,084 rounds / 1,000 matches (0 capped), 13 rounds/s (396.2 s, 4 workers), load 5.8 before, 5.0 after. No resume. No `notwist` variant: with the twist off, `control.count` is never read, so B31's no-twist Control run (39.1 ±3.1) is exactly what it would replay.
- Numbers: Heron wins 36.0% ±3.0 of matches against Control seeing 2 cards (B31: 40.7 ±3.0 seeing 1; 39.1 ±3.1 with no twist), 5.08 rounds per match. Countess to Control: 38.7 to 36.0, a fall of 2.7 against a combined margin of 4.2. The twist's effect against no twist: -3.1 ±4.3.
- Decision: still not measurably harder (2.7 < 4.2), though now in the right direction. `control.count` 2 is the last notch the brief lists; retune 2 (B33) tries one more step of the same knob, `control.count` 3, before taking the closest.

## 2026-10-19 · B33 Ladder retune 2: Control sees 3 cards (`control.count` 3), and the ladder as taken
- Question: B32's notch (2 cards) moved Control the right way but not past the margin (Countess to Control fell 2.7 against 4.2). One more step of the same knob, the brief's second and last retune round: with Control seeing 3 cards of your hand each round, is the Countess-to-Control step larger than its combined margin?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p2b2-ladder-control-c3 --a heron --b control --setup control --rounds 5000 --set control.count=3 --workers 4 --out games/dead-drop/tools/baselines/phase2b2-ladder-control-c3.json`, commit a22ae11, seed dd, 5,062 rounds / 980 matches (0 capped), 13 rounds/s (393.9 s, 4 workers), load 5.3 before, 5.5 after. No resume; no `notwist` variant (as B32: B31's no-twist Control run stands).
- Numbers: Heron wins 34.6% ±3.0 against Control seeing 3 cards, 5.17 rounds per match; the twist's effect against no twist (39.1 ±3.1) is -4.5 ±4.3. Control's twist at each count (Heron's win rate, and the Countess-to-Control fall against its combined margin):

| `control.count` | Heron wins | Twist's effect (vs 39.1 no twist) | Countess (38.7 ±2.9) to Control | Measurably harder? |
|---|---|---|---|---|
| 1 (B31, as first written) | 40.7 ±3.0 | +1.6 ±4.3 | -2.0 against 4.2 | no (inverted) |
| 2 (B32) | 36.0 ±3.0 | -3.1 ±4.3 | 2.7 against 4.2 | no |
| **3 (this run, taken)** | **34.6** ±3.0 | -4.5 ±4.3 | 4.1 against 4.2 | no, by 0.1 |

  The ladder as taken (Heron's match-win rate against each rival's setup, twist on):

| Rival | Heron wins | Step from the rival below | Combined margin | Measurably harder? |
|---|---|---|---|---|
| Wren | 70.2 ±3.1 | - | - | - |
| Magpie (extra Lookout) | 63.4 ±2.7 | 6.9 | 4.1 | yes |
| Heron (placed Sleeper) | 43.3 ±3.2 | 20.1 | 4.2 | yes |
| Countess (tap from turn 6) | 38.7 ±2.9 | 4.6 | 4.3 | yes |
| Control (sees 3 cards) | 34.6 ±3.0 | 4.1 | 4.2 | no, by 0.1 |

  Strictly falling: yes. Control at least 20%: yes (34.6). Every step larger than its combined margin: all but Countess to Control, which misses by 0.1 point.
- Decision: two retune rounds are spent, so take the closest, `control.count` 3, and tell the coordinator: it is one step past the brief's notch list (1 to 2), and B32's `control.count` 2 (a 2.7-point step) is the fallback if three seen cards (of a four-card opening hand) is too strong a twist to announce. The gap is the rivals themselves: without twists Control is no harder than the Countess (B31: 39.1 against 41.0), so Control's twist has to make the whole step. The Magpie, Heron and Countess keep their twists as first written (lookout, sleeper, from 6): their steps hold. `TWISTS.control.count` is 3 in `js/data.js`.

## 2026-10-19 · B34 Samples cap by seat count (`SAMPLE_CAP` 2: none, 3: 24, 4: 12)
- Question: With playouts scoring expected points at 3-4 seats, can the Monte Carlo bots think inside a phone's budget (about 150 ms a move, 3.5x this Mac, so 45 ms here) if their samples are capped by seat count? Sized on the Mixed roster (about 1.25x Classic).
- Configuration: `nice -n 19 node games/dead-drop/tools/think-time.mjs --rivals heron,control --seats 3,4 --cap --roster mixed` (then `--roster classic`), 30 positions per row, commit 7b28b01 plus the Task 3 change, load 3.5 before, 3.6 after. Not a sim: a timing run of `think` alone. One run only, since no row was over the bar.
- Numbers (ms on this Mac, per move):

| Roster | Seats | Rival | Samples | Mean | p95 | Max |
|---|---|---|---|---|---|---|
| mixed | 3 | heron | 24 | 22.24 | 40.37 | 47.60 |
| mixed | 3 | control | 24 | 21.15 | 37.50 | 39.92 |
| mixed | 4 | heron | 12 | 16.16 | 25.87 | 28.03 |
| mixed | 4 | control | 12 | 16.31 | 28.50 | 32.82 |
| classic | 3 | heron | 24 | 18.36 | 26.55 | 35.75 |
| classic | 3 | control | 24 | 17.35 | 26.29 | 26.37 |
| classic | 4 | heron | 12 | 12.23 | 19.45 | 20.86 |
| classic | 4 | control | 12 | 12.42 | 20.78 | 20.87 |

- Decision: every Mixed p95 is at or under the 45 ms bar (worst: 40.4 at three seats), so the caps stay 24 and 12; the 16 and 8 fallbacks were not needed. Three-seat Mixed has the least headroom (max 47.6 ms), so retime if the roster or the playout grows. In the sim, "own samples" at 3-4 seats now means these capped counts (`--samples N` still overrides).

## 2026-10-19 · B35 The Blackmailer's cost: a token (a) or a fold in answer (b), 5,000 rounds per configuration (Phase 3 Task 4 Step 4)
- Question: B29 found Mixed's stake game hot at two seats (rounds won at stake 2 or more 46.5%, over 40; folds in answer 23.7%, under 25), and B30 traced the short matches to the Blackmailer's free escalation. On the same seeds, does either fix to its rule put every spec 2.8 band inside: (a) `rules.blackmailer=token`, the flip spends one of its player's tokens and does nothing without one, or (b) `rules.blackmailer=answer`, no token is spent but its call can be folded to (answered at the start of the next turn; nothing on the final turn)? Bands: `maxStake` <= 40, `foldInAnswer` 25-35, escalation 35-60 (token escalations; the Blackmailer's rate reported beside it), escalator wins 55-65, 5-7 rounds a match, reel wins <= 25.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-blackmailer --roster mixed --rounds 5000 --workers 4 --variant token:rules.blackmailer=token --variant answer:rules.blackmailer=answer --out games/dead-drop/tools/baselines/phase3-blackmailer.json` (the brief's command plus `--workers 4`), commit b7fcf0f (the rule switch, default `'free'`), seed dd, Heron x Heron at 24 samples, Mixed rosters, two seats. Base (`free`) 5,093 rounds / 1,000 matches, token 5,091 / 1,000, answer 5,016 / 960 (0 capped), 29 rounds/s (525.6 s for all three, 4 workers), load 5.1 before, 5.5 after. No resume.
- Counting (new in this commit, `tools/sim/stats.mjs`): the sim now records the Blackmailer's escalations, marked `free`, apart from token escalations. Escalation, escalator won and bluffs count token escalations only, as B29 read them; "+ Blackmailer" is the share of rounds where its flip escalated (under `answer`, opened a call), and its escalator's round wins beside it. Answers to its call (under `answer` only; the other rules ask none) count in "answered with a fold" and are also shown on their own, with the token answers alone beside them.
- Numbers (95% margins):

| Rate | Band | free (base, 2b-ii's rule) | token (a) | answer (b) |
|---|---|---|---|---|
| Won at stake 2 or more (`maxStake`) | <= 40 | **45.9** ±1.4 | **45.2** ±1.4 | **43.4** ±1.4 |
| Answered with a fold, all answers | 25-35 | **23.6** ±1.7 | **23.1** ±1.7 | **20.6** ±1.4 |
| ... token escalations' answers | | 23.6 ±1.7 (592 / 2,512) | 23.1 ±1.7 (531 / 2,303) | 23.4 ±1.7 (565 / 2,415) |
| ... the Blackmailer's call | | none asked | none asked | 11.7 ±2.3 (90 / 770) |
| Escalation (tokens) | 35-60 | 49.3 ±1.4 | 45.2 ±1.4 | 48.1 ±1.4 |
| + the Blackmailer | report | 15.6 ±1.0 | 17.3 ±1.0 | 15.4 ±1.0 |
| Escalator won (tokens) | 55-65 | 66.2 ±1.9 | 65.2 ±1.9 | 64.6 ±1.9 |
| The Blackmailer's escalator won | report | 46.7 ±3.5 | 47.1 ±3.3 | 51.9 ±3.5 |
| Rounds per match | 5-7 | 5.09 ±0.10 | 5.09 ±0.10 | 5.22 ±0.10 |
| Reel wins | 5-25 | 18.3 ±2.4 | 19.6 ±2.5 | 19.9 ±2.5 |
| Half-time leader wins | report | 62.8 ±3.3 | 62.5 ±3.3 | 59.2 ±3.4 |
| Points per round | report | 2.85 ±0.04 | 2.84 ±0.04 | 2.78 ±0.04 |
| Tokens spent per player per match | report | 1.26 | 1.59 | 1.26 |
| Rounds begun with a seat out of tokens | report | 1.4 ±0.3 | 3.1 ±0.5 | 1.6 ±0.3 |
| Folds (rounds) | report | 21.4 ±1.1 | 20.3 ±1.1 | 22.4 ±1.2 |
| Blackmailer, win% when played | report | 46.8 ±2.3 | 47.3 ±2.3 | 46.1 ±2.3 |
| Macau, winner took the round | report | 63.7 ±4.1 | 63.0 ±4.1 | 61.4 ±4.2 |

  Bands missed (by how much, against the margin): **free**: `maxStake` over by 5.9 (±1.4), folds in answer under by 1.4 (±1.7), escalator won over by 1.2 (±1.9). **token**: `maxStake` over by 5.2 (±1.4), folds in answer under by 1.9 (±1.7), escalator won over by 0.2 (±1.9). **answer**: `maxStake` over by 3.4 (±1.4), folds in answer under by 4.4 counting every answer (±1.4), or by 1.6 (±1.7) on token escalations' answers alone; escalator won inside. Every other band is inside for all three. Against the base on the same seeds (the sim's comparison, * past the combined margin): token moves escalation -4.1 ±1.9 *, the Blackmailer +1.7 ±1.4 *, `maxStake` -0.7 ±1.9; answer moves `maxStake` -2.5 ±1.9 *, folds in answer (all) -3.0 ±2.2 *, the Blackmailer's escalator +5.3 ±5.0 *. The base reproduces B29 (45.9 against 46.5, 23.6 against 23.7, rounds a match 5.09 against 5.10).
- Findings:
  - Neither rule lands `maxStake`. A token barely costs anything: players spend 1.26 of their 3 tokens a match, so the Blackmailer nearly always has one (rounds begun with a seat out of tokens: 3.1%). The token it spends is a token escalation that doesn't happen later (token escalations -4.1, the Blackmailer +1.7, since more rounds are still unescalated when it flips), and a round goes to stake 2 about as often (escalated rounds 64.9% to 62.5%). The answer rule asks, but the bots fold to only 11.7% of its calls: the call lands at the start of turns 2-6, when their round value is seldom below the -0.29 answer threshold (they fold to 23% of token escalations, which come from a seat that chose to bet on a strong hand). So `maxStake` falls only 2.5 points.
  - The folds-in-answer shortfall is not the Blackmailer's: the token escalations' answers fold 23.1-23.6% under every rule, against 27.2% on Classic (B23). Counting the Blackmailer's answers under the answer rule lowers the rate further (its calls are folded to less), so no Blackmailer rule can lift it into 25-35. That points at the answer threshold on Mixed rosters (rule c, `stakes.answer`), not at the Blackmailer.
  - Size of the gap: `maxStake` is 15.7 points over Classic's 30.2 (B23), about the Blackmailer's own 15.6% of rounds. Getting to 40 needs about 6 points off, so about 40% of the Blackmailer's stake-2 rounds gone; the answer rule took off 2.5 points with an 11.7% fold rate. The Blackmailer is in 50.5% of rounds' rosters (2,570 of 5,093) and escalates in about 31% of those.
  - The answer rule is the closer of the two on `maxStake` (3.4 over against 5.2) and escalator won (inside against a near miss), and about level with the token rule on folds in answer if read on token escalations (23.4 against 23.1), but farther if every answer counts (20.6).
- Decision: neither rule puts every band inside, so (as the coordinator decided beforehand) nothing is chosen: `RULES.blackmailer` stays `'free'`, Step 5 (the 20,000-round confirm and the points by roster) is not run, and both configurations' numbers go to the coordinator. Options the numbers suggest, theirs to approve: retune the bots' answer threshold (`stakes.answer`; rule c) on Mixed, which is what folds in answer need under any Blackmailer rule; a stronger Blackmailer rule (the answer rule's call plus a token, or the Blackmailer's call only on turns where folding saves something); or accept Mixed's hotter stakes as the content's character. Then: the coordinator chose `answer` and accepted its two misses; B36 confirms it.

## 2026-10-19 · B36 The Blackmailer's call can be folded to (`rules.blackmailer` answer): the Mixed confirm, 20,000 rounds, and points by roster (Phase 3 Task 4 Steps 5-6)
- Question: The coordinator chose rule (b) from B35, `answer` (the Blackmailer's flip escalates without a token, and its rivals may fold in answer at the start of the next turn; on the final turn it does nothing), and accepted its two misses in advance. At the bots' own samples and 20,000 rounds on Mixed rosters, two seats: where do the stake rates land against B29 (2b-ii's `free` rule), are every agent, every city and seat 0 still in band, and do the Blackmailer and Macau still pay in points as B30 found (plan Risk 1)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-blackmailer-final --roster mixed --rounds 20000 --workers 4 --set rules.blackmailer=answer --against games/dead-drop/tools/baselines/phase2b2-final.json --out games/dead-drop/tools/baselines/phase3-blackmailer-final.json`, commit 57d9eb9. The rule came from `--set`, since 57d9eb9 still had `'free'` written; the next commit writes `'answer'` into `RULES.blackmailer`, which plays the same. Seed dd, Heron x Heron at 24 samples, 20,034 rounds / 3,800 matches (0 capped), 29 rounds/s (688.6 s, 4 workers), load 2.8 before, 5.5 after. No resume. Two-seat play is otherwise B29's: the Classic goldens hold, and B35's `free` base reproduced B29. Then `nice -n 19 node games/dead-drop/tools/points-by-roster.mjs --from games/dead-drop/tools/baselines/phase3-blackmailer-final.json --rounds 10000 --workers 4`: this run's first 10,042 rounds / 1,900 matches, 29 rounds/s (347.6 s), load 4.2 before, 6.0 after. Its roster section covers all 3,800 matches.
- Numbers (95% margins; "change" is the sim's comparison with B29's saved base, * past the combined margin):

| Rate | Band | B29, `free` | B36, `answer` | Change | In band? |
|---|---|---|---|---|---|
| Won at stake 2 or more (`maxStake`) | <= 40 | 46.5 ±0.7 | **43.5** ±0.7 | -3.0 ±1.0 * | **no: 3.5 over (accepted)** |
| Answered with a fold, every answer | 25-35 | 23.7 ±0.8 | **21.2** ±0.7 | -2.5 ±1.1 * | **no: 3.8 under (accepted)** |
| ... token escalations' answers (`tokenFoldInAnswer`) | 25-35 | 23.7 ±0.8 | 23.6 ±0.8 | | no: 1.4 under |
| ... the Blackmailer's call | report | none asked | 13.7 ±1.2 (3,153 answers) | | |
| Escalation (tokens) | 35-60 | 49.7 ±0.7 | 48.3 ±0.7 | -1.3 ±1.0 * | yes |
| + the Blackmailer | report | not recorded (about 15.6, B35) | 15.7 ±0.5 | | |
| Escalator won (tokens) | 55-65 | 64.9 ±0.9 | 64.1 ±1.0 | -0.9 ±1.3 | yes |
| The Blackmailer's escalator won | report | (46.7 ±3.5, B35) | 52.1 ±1.7 | | |
| Rounds per match | 5-7 | 5.10 ±0.05 | 5.27 ±0.05 | +0.2 ±0.1 * | yes |
| Reel wins | 5-25 | 19.5 ±1.2 | 19.8 ±1.3 | +0.3 ±1.8 | yes |
| `reelComeback` | report | 91.9 ±1.9 | 90.6 ±2.1 | | |
| Half-time leader wins | report | 60.2 ±1.7 | 60.4 ±1.7 | | |
| Points per round | report | 2.86 ±0.02 | 2.78 ±0.02 | -0.1 ±0.0 * | |
| Folds (rounds) / dead heats / tie-breaks | report | 21.1 / 2.7 / 17.7 | 23.0 / 2.6 / 16.9 | | |
| Tokens spent per player per match | report | 1.27 | 1.27 | | |
| Seat 0 wins (matches) | 45-55 | 49.8 ±1.6 | 49.0 ±1.6 | | yes |

  Every agent's win% when played is inside 44-56: the Wiretap at 45.7 is the lowest, the Heavy at 51.9 the highest, and the Blackmailer reads 46.6 ±1.2 (B29: 46.7 ±1.2). Every city's "winner took the round" is inside 55-80: Havana at 61.6 is the lowest, Lisbon at 76.3 the highest, and Macau reads 62.3 ±2.1. The full tables are in the JSON.

  Points by roster, beside B30 (the same method on B29's `free` run):

| Rate | B30, `free` | B36, `answer` |
|---|---|---|
| Points per round, Blackmailer in the roster | 3.14 ±0.04 (5,188 rounds) | 2.97 ±0.04 (5,331 rounds) |
| Points per round, Blackmailer not in the roster | 2.55 ±0.04 (4,909 rounds) | 2.55 ±0.04 (4,711 rounds) |
| Rounds per match with / without the Blackmailer in the roster (all matches) | 4.65 / 5.68 | 4.95 / 5.69 |
| The Blackmailer played, to the flip: its seat's share of the rounds / of the points | 46.6 ±1.6 / 48.1 (3,608 seat-rounds) | 46.8 ±1.7 / 48.7 (3,416) |
| Points per round, Macau dealt / not dealt | 3.37 ±0.09 / 2.76 ±0.03 | 3.33 ±0.10 / 2.67 ±0.03 |
| Macau held at the flip: its holder's share of the rounds / of the points | 61.8 ±2.9 / 73.1 (1,047 rounds) | 62.6 ±3.0 / 73.7 (1,023) |

  Every other agent's matches run 5.24 (the Courier) to 5.35 (the Jammer) rounds with it in the roster.
- Findings:
  - The rule does what it can. Rounds won at stake 2 or more fall 3.0 points (46.5 to 43.5). Matches holding a Blackmailer gain 0.3 rounds (4.65 to 4.95, against 5.69 without), and they pay 0.17 fewer points a round. Every band but two is inside.
  - The two misses are accepted, as B23's escalator miss was. `maxStake` is 43.5 ±0.7, 3.5 over its 40. Folds in answer are 21.2 ±0.7 counting every answer, 3.8 under its 25. Both come from the same place: the bots fold to only 13.7% ±1.2 of the Blackmailer's calls (11.7 ±2.3 at 5,000 rounds, B35). The call lands at the start of turns 2-6, whatever their hands, and their round value is seldom below the -0.29 answer threshold then. They fold to 23.6% of token escalations, which come from a seat that chose to bet. The fold shortfall is not the Blackmailer's: token escalations' answers fold 23.1-23.6% on Mixed under every rule (B35; 23.6 ±0.8 here, 23.7 in B29), against 27.2% on Classic (B23). That is the bots' answer threshold (`stakes.answer`) on Mixed rosters, which no Blackmailer rule can move. Counting the Blackmailer's answers in the rate lowers it further.
  - Its escalator now wins 52.1% ±1.7 of those rounds, against 46.7 ±3.5 when nobody could fold (B35), since a fold in answer is its win. The Blackmailer still reads average in round wins (46.6 when played) and in points (48.7% of the points from 46.8% of the rounds). It still speeds matches, but less.
  - Macau's holder still takes more than 70% of the points from about 62% of the rounds: 73.7% from 62.6% (B30: 73.1% from 61.8%). As B30 found, that is its rule, and the bots underrate it. Left as it is: a change there is a design call for the coordinator.
- Decision: `RULES.blackmailer` is `'answer'` in `js/data.js`, with a comment naming B35-B36. The Blackmailer's card text reads "Flip: a free escalation, no token; rivals may still fold." Its Help note, which the roster card shows too, says rivals answer at the start of the next turn and that it does nothing on the final turn. `tools/baselines/phase3-blackmailer-final.json` is the two-seat Mixed reference from now on (in place of `phase2b2-final.json`).

## 2026-10-19 · B37 Re-baseline at 3 seats after expected-points scoring (Phase 3 Task 5 Step 1)
- Question: Task 3 made the bots score a playout by expected points at 3-4 seats (B25 scored it as win/lose: P(win) − P(lose)). On B25's configuration (Heron × 3 at 8 samples, Classic, target 8), what did that move? Folds in answer and escalation are the ones to watch (B25: 61.7% of answers were folds, 73.9% escalation).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-base3 --seats 3 --samples 8 --rounds 5000 --roster classic --workers 4 --against games/dead-drop/tools/baselines/phase2b1-seats3.json --out games/dead-drop/tools/baselines/phase3-base3.json` (the brief's command plus `--roster classic`, the default, and `--workers 4`; the sim's default target at 3 seats is `TARGETS[3]` = 8, as B25's `--target 8`), commit 8f58714, seed dd, 5,005 rounds / 1,360 matches (0 capped), 41 rounds/s (122 s), load 1.7 before, 4.9 after. No resume.
- Numbers (B25 in brackets; * = the change is past the combined margin):

| Rate | Value |
|---|---|
| Rounds per match | 3.68 ±0.05 [4.25] * (≈ 10.1 min at 2.75 min a round) |
| Answered with a fold | 29.4% ±1.0 [61.7] * |
| Escalation | 76.2% ±1.2 [73.9] * |
| Escalator won | 50.6% ±1.6 [68.8] * |
| Won at stake 2 or more | 67.8% ±1.3 [38.9] * |
| Folds (rounds) | 5.9% ±0.7 [34.3] * |
| Tie-breaks | 34.1% ±1.3 [21.4] * |
| Dead heats | 3.6% ±0.5 [3.1] |
| Half-time leader wins | 44.2% ±2.7 [51.3] * |
| Reel wins | 12.9% ±1.8 [6.9] * (93.7% from behind) |
| Points per round | 3.66 ±0.04 [3.28] * |
| Seat shares (matches) | 33.5 / 32.6 / 34.0 (each ±2.5) |
| Other | pot taken 0.52 [1.29], 0.94 tokens spent per player [1.05], 0.5% of rounds begin with a seat out [1.5] |

- Decision: the new baseline at 3 seats. Expected points stopped the folding: a win/lose value sits near 1/3 − 2/3 for an ordinary hand at three seats, under the −0.29 answer threshold, so B25's bots folded 62% of answers and 34% of rounds ended in folds; scored by points, playing on is worth something and only 29% of answers (6% of rounds) are folds. Escalation barely moved (+2.3), but more escalated rounds are now played out, so stake 2 or more wins 68% of rounds (from 39%), points per round rise and matches get shorter still (3.7 rounds, against the 5-7 band): the pace is now the target's job (Step 2). The escalator wins 50.6%, still above a fair 33%.

## 2026-10-19 · B38 Re-baseline at 4 seats after expected-points scoring (Phase 3 Task 5 Step 1)
- Question: The same at four seats, on B26's configuration (Heron × 4 at 8 samples, Classic, target 7). B26: 73.3% of answers were folds, 68.2% escalation.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-base4 --seats 4 --samples 8 --rounds 5000 --roster classic --workers 4 --against games/dead-drop/tools/baselines/phase2b1-seats4.json --out games/dead-drop/tools/baselines/phase3-base4.json` (default target `TARGETS[4]` = 7, as B26's `--target 7`), commit 8f58714, seed dd, 5,060 rounds / 1,480 matches (0 capped), 20 rounds/s (252 s), load 4.3 before, 5.7 after. No resume.
- Numbers (B26 in brackets; * = past the combined margin):

| Rate | Value |
|---|---|
| Rounds per match | 3.42 ±0.06 [3.45] (≈ 12.0 min at 3.5 min a round) |
| Answered with a fold | 22.3% ±0.8 [73.3] * |
| Escalation | 73.0% ±1.2 [68.2] * |
| Escalator won | 36.9% ±1.6 [68.5] * |
| Won at stake 2 or more | 67.6% ±1.3 [35.4] * |
| Folds (rounds) | 0.9% ±0.3 [31.8] * |
| Tie-breaks | 54.3% ±1.4 [27.0] * |
| Dead heats | 6.7% ±0.7 [4.4] * |
| Half-time leader wins | 42.0% ±2.6 [43.9] |
| Reel wins | 11.9% ±1.6 [5.1] * (92.6% from behind) |
| Points per round | 3.79 ±0.05 [3.96] * |
| Seat shares (matches) | 26.6 / 24.2 / 25.1 / 24.2 (each ±2.2) |
| Other | pot taken 0.63 [2.06], 0.62 tokens spent per player [0.59], 0.4% of rounds begin with a seat out [0.4] |

- Decision: the new baseline at 4 seats. The same shift, larger: folds in answer fall from 73% to 22% and rounds ending in folds from 32% to under 1% (a round ends in folds only when all three others fold), so the escalator, who used to collect the folds, now wins 36.9% (a fair share is 25%). Points per round fall a little (3.96 to 3.79: far fewer folders pay their stake into the pot, while more rounds are won at stake 2 or more), so matches stay at 3.4 rounds, well under the 4.5-6 band: the target has to rise (Step 2).

## 2026-10-19 · B39 The 3-seat grid: targets 8, 10, 12 and the pace `roundPoints3` 2 (Phase 3 Task 5 Step 2)
- Question: B37 left 3-seat matches at 3.7 rounds. Which target and pace put every band inside? Bands (spec, "Phase 3 tuning"): 5-7 rounds a match (centre 6), each seat's match share 33.3 ±5 (28.3-38.3), half-time leader wins <= 60, reel wins <= 30; escalation, escalator won, folds in answer, stake 2 or more and points per round reported only.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-grid3 --seats 3 --samples 8 --rounds 5000 --roster classic --workers 4 --target 10 --variant t8:target=8 --variant t12:target=12 --variant t10p2:stakes.roundPoints3=2 --variant t12p2:target=12 --variant t12p2:stakes.roundPoints3=2 --out games/dead-drop/tools/baselines/phase3-grid3.json` (the brief's command plus `--roster classic` and `--workers 4`; the two `t12p2` flags compose one two-key variant, as the CLI's header says), commit 8f58714, seed dd, Heron × 3 at 8 samples, Classic, five configurations on the same seeds, 25,176 rounds in 600 s (42 rounds/s), load 4.9 before, 6.4 after. No resume. `t8` is B37's configuration (same config hash, same numbers).
- Numbers (95% margins; minutes at 2.75 a round; seat shares each about ±3):

| Config | Target | `roundPoints3` | Rounds / matches | Rounds per match | Minutes | Half-time leader | Reel wins | Seat shares | Escalation | Escalator won | Folds in answer | Stake 2+ | Points per round | Bands |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base (t10) | 10 | 1 | 5,062 / 960 | 5.27 ±0.09 | 14.5 | 38.1 ±3.6 | 29.2 ±2.9 | 35.9 / 30.5 / 33.5 | 50.9 ±1.4 | 51.0 ±1.9 | 31.1 ±1.3 | 44.4 ±1.4 | 3.08 ±0.04 | all met (0.73 from 6) |
| t8 | 8 | 1 | 5,005 / 1,360 | 3.68 ±0.05 | 10.1 | 44.2 ±2.7 | 12.9 ±1.8 | 33.5 / 32.6 / 34.0 | 76.2 ±1.2 | 50.6 ±1.6 | 29.4 ±1.0 | 67.8 ±1.3 | 3.66 ±0.04 | rounds under by 1.32 |
| t12 | 12 | 1 | 5,050 / 760 | 6.64 ±0.15 | 18.3 | 39.2 ±3.9 | **50.1** ±3.6 | 35.0 / 30.8 / 34.2 | 33.4 ±1.3 | 54.0 ±2.4 | 31.7 ±1.6 | 28.8 ±1.2 | 2.68 ±0.04 | reel over by 20.1 |
| t10p2 | 10 | 2 | 5,027 / 1,240 | 4.05 ±0.07 | 11.1 | 55.6 ±3.0 | 14.7 ±2.0 | 35.3 / 31.5 / 33.1 | 99.6 ±0.2 | 47.9 ±1.4 | 27.8 ±0.9 | 88.6 ±0.9 | 4.17 ±0.03 | rounds under by 0.95 |
| t12p2 | 12 | 2 | 5,032 / 1,000 | 5.03 ±0.09 | 13.8 | 49.5 ±3.4 | 20.8 ±2.5 | 35.6 / 32.0 / 32.4 | 99.2 ±0.2 | 48.4 ±1.4 | 28.0 ±0.9 | 88.1 ±0.9 | 4.16 ±0.03 | all met (0.97 from 6) |

- Findings: at `roundPoints3` 1 the target sets the length, and the Microfilm's reel takes over as matches lengthen: reel wins go 12.9, 29.2, 50.1% at targets 8, 10, 12 (89% or more of them from behind), since a longer match hands out more strips (1.58 a match at 10) while the points race slows. `roundPoints3` 2 counts fewer rounds left, so the rivals stop saving tokens: escalation is automatic again (99%), 88% of rounds are won at stake 2 or more and points per round jump by about 1.1, which shortens matches (t12p2 5.0 rounds) and so holds the reel down (20.8), but lifts the half-time leader (49.5) and leaves no betting decision. Seats are fair everywhere (no share outside 30.5-35.9).
- Decision: two configurations meet every band, t10 (5.27 rounds, 0.73 from the centre) and t12p2 (5.03, 0.97). By Step 3's rule the nearest the centre wins: **target 10, `roundPoints3` 1** (it also keeps escalation a choice, 51% against 99%). The margin to watch is the reel: 29.2 ±2.9 against a bar of 30, so Step 5's confirm at the bots' own 24 samples decides whether it holds.

## 2026-10-19 · B40 The 4-seat grid: targets 9, 10, 11 and the pace `roundPoints4` 2 (Phase 3 Task 5 Step 2)
- Question: B38 left 4-seat matches at 3.4 rounds. Which target and pace put every band inside? Bands: 4.5-6 rounds a match (centre 5.25), each seat's match share 25 ±5 (20-30), half-time leader wins <= 60, reel wins <= 30; the rest reported only.
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-grid4 --seats 4 --samples 8 --rounds 5000 --roster classic --workers 4 --target 10 --variant t9:target=9 --variant t11:target=11 --variant t10p2:stakes.roundPoints4=2 --out games/dead-drop/tools/baselines/phase3-grid4.json` (the brief's command plus `--roster classic` and `--workers 4`), commit 8f58714, seed dd, Heron × 4 at 8 samples, Classic, four configurations on the same seeds, 20,197 rounds in 1,009 s (20 rounds/s), load 5.3 before, 6.8 after. No resume.
- Numbers (95% margins; minutes at 3.5 a round; seat shares each about ±3):

| Config | Target | `roundPoints4` | Rounds / matches | Rounds per match | Minutes | Half-time leader | Reel wins | Seat shares | Escalation | Escalator won | Folds in answer | Stake 2+ | Points per round | Bands |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base (t10) | 10 | 1 | 5,032 / 900 | 5.59 ±0.11 | 19.6 | 30.6 ±3.5 | **34.2** ±3.1 | 27.4 / 24.2 / 25.0 / 23.3 | 49.1 ±1.4 | 39.1 ±1.9 | 23.8 ±1.0 | 46.0 ±1.4 | 3.20 ±0.05 | reel over by 4.2 |
| t9 | 9 | 1 | 5,037 / 1,020 | 4.94 ±0.09 | 17.3 | 34.4 ±3.4 | 27.2 ±2.7 | 24.4 / 25.2 / 25.4 / 25.0 | 52.2 ±1.4 | 36.4 ±1.8 | 23.0 ±0.9 | 48.4 ±1.4 | 3.25 ±0.05 | all met (0.31 from 5.25) |
| t11 | 11 | 1 | 5,094 / 780 | **6.53** ±0.15 | 22.9 | 30.6 ±3.7 | **46.2** ±3.5 | 28.2 / 26.2 / 23.6 / 22.1 | 36.0 ±1.3 | 40.5 ±2.2 | 24.4 ±1.1 | 33.3 ±1.3 | 2.85 ±0.04 | rounds over by 0.53, reel over by 16.2 |
| t10p2 | 10 | 2 | 5,034 / 1,220 | **4.13** ±0.08 | 14.4 | 51.0 ±3.1 | 19.2 ±2.2 | 23.6 / 25.7 / 25.4 / 25.2 | 99.8 ±0.1 | 36.5 ±1.3 | 21.0 ±0.7 | 93.2 ±0.7 | 4.45 ±0.04 | rounds under by 0.37 |

- Findings: the same shape as B39. At `roundPoints4` 1 the reel climbs with the target (27.2, 34.2, 46.2% at 9, 10, 11; 82-85% of them from behind) and is the band that binds. `roundPoints4` 2 again makes escalation automatic (99.8%) and short matches (4.1 rounds). Seats are fair everywhere (22.1-28.2). The half-time leader wins only 31-34% at `roundPoints4` 1 (a seat's fair share is 25%): a 4-seat match is still wide open at half time, and the reel's comebacks are part of why.
- Decision: one configuration meets every band, t9: **target 9, `roundPoints4` 1** (4.94 rounds, 0.31 from the centre; about 17 minutes). The reel is again the closest band (27.2 ±2.7 against 30), for Step 5's confirm at the bots' own 12 samples.

## 2026-10-19 · B41 The 3-seat confirm at the bots' own samples: target 10, `roundPoints3` 1 (Phase 3 Task 5 Step 5)
- Question: Does B39's choice (target 10, `roundPoints3` 1) hold every band with Heron at its own capped 24 samples (`SAMPLE_CAP[3]`, B34)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-final3 --seats 3 --rounds 10000 --roster classic --workers 4 --out games/dead-drop/tools/baselines/phase3-final3.json` (the brief's command plus `--roster classic` and `--workers 4`), commit 8f58714 plus this task's `data.js` (`TARGETS[3]` 10, `TARGETS[4]` 9, `roundPoints3/4` 1; uncommitted at the time), seed dd, Heron × 3 at 24 samples, Classic, 10,078 rounds / 1,880 matches (0 capped), 13 rounds/s (757 s), load 4.8 before, 6.1 after. No resume. The JSON was then renamed `phase3-final3-t10.json`, so that `phase3-final3.json` holds the configuration taken (B43).
- Numbers (B39's t10 at 8 samples in brackets):

| Rate | Band | Value |
|---|---|---|
| Rounds per match | 5-7 | 5.36 ±0.07 [5.27] (≈ 14.7 min) |
| Seat shares (matches) | 28.3-38.3 | 33.5 / 31.9 / 34.6 (each ±2.2) [35.9 / 30.5 / 33.5] |
| Half-time leader wins | <= 60 | 39.1% ±2.6 [38.1] |
| Reel wins | <= 30 | **33.4% ±2.1** [29.2] (86.1% from behind; 1.67 strips a match [1.58]) |
| Escalation | report | 51.1% ±1.0 [50.9] |
| Escalator won | report | 49.5% ±1.4 [51.0] |
| Answered with a fold | report | 20.4% ±0.8 [31.1] |
| Won at stake 2 or more | report | 46.2% ±1.0 [44.4] |
| Points per round | report | 3.04 ±0.03 [3.08] |
| Other | report | folds 2.5% [4.3], tie-breaks 42.8% [38.0], dead heats 5.2%, pot taken 0.28, 0.91 tokens spent per player; bots A/B/C win 32.2 / 33.7 / 34.1 (±2.1) |

- Decision: the reel band is missed by 3.4 points, more than its ±2.1 margin, so (Step 5) the choice goes back to Step 3 once. The 24-sample bots fold in answer a third less (20.4 against 31.1), so more rounds reach the final flip and more strips change hands (1.67 a match), and the reel rose 4.2 points over the 8-sample grid; the other bands barely moved. Back at Step 3, the one other configuration in B39 that met every band is t12p2 (target 12, `roundPoints3` 2: 5.03 rounds, reel 20.8 ±2.5, so about 9 points of room for the same shift), so it is the rule's next choice and goes to its own confirm (B43). Its cost, reported here rather than banded: rivals escalate in 99% of rounds at `roundPoints3` 2 (B39).

## 2026-10-19 · B42 The 4-seat confirm at the bots' own samples: target 9, `roundPoints4` 1 (Phase 3 Task 5 Step 5)
- Question: Does B40's choice (target 9, `roundPoints4` 1) hold every band with Heron at its own capped 12 samples (`SAMPLE_CAP[4]`, B34)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-final4 --seats 4 --rounds 10000 --roster classic --workers 4 --out games/dead-drop/tools/baselines/phase3-final4.json` (the brief's command plus `--roster classic` and `--workers 4`), commit 8f58714 plus this task's `data.js` (as B41), seed dd, Heron × 4 at 12 samples, Classic, 10,025 rounds / 1,980 matches (0 capped), 13 rounds/s (756 s), load 4.4 before, 5.3 after (under the skip threshold of 10). No resume.
- Numbers (B40's t9 at 8 samples in brackets):

| Rate | Band | Value |
|---|---|---|
| Rounds per match | 4.5-6 | 5.06 ±0.07 [4.94] (≈ 17.7 min) |
| Seat shares (matches) | 20-30 | 26.3 / 24.0 / 24.9 / 24.8 (each ±1.9) [24.4 / 25.2 / 25.4 / 25.0] |
| Half-time leader wins | <= 60 | 32.7% ±2.5 [34.4] |
| Reel wins | <= 30 | 26.9% ±2.0 [27.2] (89.7% from behind; 1.71 strips a match) |
| Escalation | report | 52.2% ±1.0 [52.2] |
| Escalator won | report | 38.0% ±1.3 [36.4] |
| Answered with a fold | report | 18.1% ±0.6 [23.0] |
| Won at stake 2 or more | report | 49.0% ±1.0 [48.4] |
| Points per round | report | 3.21 ±0.03 [3.25] |
| Other | report | folds 0.4%, tie-breaks 55.5%, dead heats 6.0%, pot taken 0.38, 0.66 tokens spent per player; bots A/B/C/D win 25.2 / 25.0 / 25.8 / 24.0 (±1.9) |

- Decision: every band holds, so **target 9, `roundPoints4` 1** stand at four seats (5.06 rounds, 0.19 from the centre, about 18 minutes a match). The reel kept its 3-point margin here (12 samples sit nearer 8 than B41's 24 do). This file is the 4-seat baseline for later phases.

## 2026-10-19 · B43 The 3-seat confirm, second choice: target 12, `roundPoints3` 2 (Phase 3 Task 5 Step 5, after B41)
- Question: B41 sent the 3-seat choice back to Step 3 once; the rule's next choice is B39's t12p2. Does it hold every band at the bots' own 24 samples?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-final3b --seats 3 --rounds 10000 --roster classic --workers 4 --out games/dead-drop/tools/baselines/phase3-final3.json`, commit 8f58714 plus this task's `data.js` with `TARGETS[3]` 12 and `roundPoints3` 2 (uncommitted at the time; the sim reads them as defaults, so the config has no patches), seed dd, Heron × 3 at 24 samples, Classic, 10,047 rounds / 2,060 matches (0 capped), 14 rounds/s (721 s), load 3.9 before, 5.1 after. No resume.
- Numbers (B39's t12p2 at 8 samples in brackets; B41's t10 at 24 samples in braces):

| Rate | Band | Value |
|---|---|---|
| Rounds per match | 5-7 | **4.88 ±0.06** [5.03] {5.36} (≈ 13.4 min) |
| Seat shares (matches) | 28.3-38.3 | 34.9 / 33.0 / 32.1 (each ±2.1) [35.6 / 32.0 / 32.4] |
| Half-time leader wins | <= 60 | 53.2% ±2.4 [49.5] {39.1} |
| Reel wins | <= 30 | 23.7% ±1.8 [20.8] {33.4} (87.1% from behind; 1.44 strips a match [1.31]) |
| Escalation | report | 99.3% ±0.2 [99.2] {51.1} |
| Escalator won | report | 45.6% ±1.0 [48.4] {49.5} |
| Answered with a fold | report | 17.4% ±0.5 [28.0] {20.4} |
| Won at stake 2 or more | report | 91.8% ±0.5 [88.1] {46.2} |
| Points per round | report | 4.11 ±0.02 [4.16] {3.04} |
| Other | report | folds 2.8% [7.2], tie-breaks 39.4%, dead heats 4.7%, 1.61 tokens spent per player, 8.1% of rounds begun with a seat out of tokens; bots A/B/C win 32.8 / 34.1 / 33.2 (±2.0) |

- Decision: rounds per match miss the band by 0.12 (4.88 against 5), twice the ±0.06 margin, so this confirm fails too, and Step 5 allows only the one return to Step 3. As at target 10 (B41), the 24-sample bots fold in answer less (17.4 against 28.0) and more strips change hands, so the reel ends more matches early (23.7, up 2.9) and matches are 0.15 rounds shorter. Neither 3-seat configuration holds every band at the bots' own samples: target 10 / `roundPoints3` 1 misses the reel by 3.4 points (33.4 ±2.1, about 11% over its bar of 30), target 12 / `roundPoints3` 2 misses the length by 0.12 rounds (about 2% under 5, some 20 seconds a match). The nearer miss, t12p2, stays in `data.js` and goes to the coordinator with the other: it costs automatic escalation (rivals escalate in 99% of rounds, 92% of rounds are won at stake 2 or more), which 2b-i tuned out at two seats (B12-B22), against t10's 51%. What the numbers suggest, the coordinator's call: a 3-seat grid at the bots' own 24 samples (the 8-sample grid moved the reel by +3 to +4 points and the length by ±0.15 rounds at three seats), between the two: `roundPoints3` 1.5 at targets 11-12, or t13 at `roundPoints3` 2.

## 2026-10-19 · B44 Skill still tells at a 4-seat table: Wren, Heron, Heron, Control (Phase 3 Task 5 Step 6, report only)
- Question: With samples capped at 12 at four seats (B34), does Control (80 samples, capped to 12, noise 0.02) still beat Wren (6 samples, noise 0.35), and is Control's share at least the Herons' (24 capped to 12, noise 0.15)?
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-mixed4 --seats 4 --a wren --b heron --c heron --d control --rounds 3000 --roster classic --workers 4 --out games/dead-drop/tools/baselines/phase3-mixed4.json` (the brief's command plus `--roster classic` and `--workers 4`), commit 4b942d3 (another session's lobby commits since 8f58714; the engine, bot, roster and sim code are unchanged) plus this task's `data.js` (`TARGETS[4]` 9, `roundPoints4` 1), seed dd, samples 6 / 12 / 12 / 12, Classic, 3,076 rounds / 620 matches (0 capped), 13 rounds/s (228 s), load 3.6 before, 5.4 after. No resume.
- Numbers (`botMatches`, 95% margins):

| Bot (seat) | Rival | Samples | Matches won |
|---|---|---|---|
| A (0) | Wren | 6 | 11.9% ±2.6 |
| B (1) | Heron | 12 | 29.2% ±3.6 |
| C (2) | Heron | 12 | 26.8% ±3.5 |
| D (3) | Control | 12 | 32.1% ±3.7 |

  The table itself: 4.96 ±0.12 rounds a match (≈ 17.4 min), half-time leader 38.1% ±4.5, reel wins 29.0% ±3.6, escalation 51.4%, escalator won 38.9%.
- Decision: report only. Skill still tells at four seats: Control wins 2.7 times Wren's share (32.1 against 11.9) and Control's share is not under either Heron's (29.2, 26.8; the gaps are inside the margins at 3,000 rounds, so the cap leaves Control at least level with Heron, not clearly ahead).

## 2026-10-19 · B45 The 3-seat grid at the bots' own samples: `roundPoints3` 1.5 at targets 11 and 12, `roundPoints3` 2 at 13, and a reel of 3 at target 10 (Phase 3 Task 5b)
- Question: B41 and B43 found no 3-seat setting that held every band at the bots' own 24 samples (t10/rp1: reel 33.4 ±2.1; t12/rp2: 4.88 ±0.06 rounds and escalation in 99% of rounds), and the 8-sample grid (B39) had misjudged the reel by 3-4 points. Between the two, at 24 samples, does any configuration hold every band? Bands as B39: 5-7 rounds a match (centre 6), each seat's match share 28.3-38.3, half-time leader wins <= 60, reel wins <= 30; escalation, escalator won, folds in answer, stake 2 or more and points per round reported only. The coordinator's rule: (1) of the configurations meeting every band, the nearest 6 rounds (tie: `roundPoints3` nearer 1, then the target nearer 10); (2) if none does, automatic escalation (about 80% or more) is the miss not accepted, a reel slightly over (up to about 33) or rounds slightly short are preferred to it, and the fallback is t10/rp1 (B41) rather than t12/rp2 (B43).
- Configuration: `nice -n 19 node games/dead-drop/tools/sim.mjs --run p3-grid3b --seats 3 --rounds 5000 --roster classic --workers 4 --target 11 --set stakes.roundPoints3=1.5 --variant t12p15:target=12 --variant t12p15:stakes.roundPoints3=1.5 --variant t13p2:target=13 --variant t13p2:stakes.roundPoints3=2 --variant t10p1r3:target=10 --variant t10p1r3:stakes.roundPoints3=1 --variant t10p1r3:rules.reel=3 --out games/dead-drop/tools/baselines/phase3-grid3b.json`, commit 2743bef, seed dd, Heron × 3 at 24 samples (`SAMPLE_CAP[3]`; no `--samples`), Classic, four configurations on the same seeds, 20,233 rounds in 1,503 s (13 rounds/s), load 2.6 before, 4.3 after. No resume. Every configuration names its target and `roundPoints3` (the base through `--set`, which the variants override), so the run doesn't depend on the three-seat values in `data.js`. `rules.reel` is the one reel for every table size (`RULES.reel`, read into `state.reel` by `newMatch`); the sim sets it for this configuration only.
- Numbers (95% margins; minutes at 2.75 a round; seat shares each about ±3; B41 and B43, the 10,000-round confirms at 24 samples, for comparison):

| Config | Target | `roundPoints3` | Reel | Rounds / matches | Rounds per match | Minutes | Half-time leader | Reel wins | Seat shares | Escalation | Escalator won | Folds in answer | Stake 2+ | Points per round | Bands |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base (t11p15) | 11 | 1.5 | 2 | 5,074 / 1,020 | **4.97** ±0.09 | 13.7 | 47.0 ±3.2 | 27.4 ±2.7 | 30.8 / 34.2 / 35.0 | 80.7 ±1.1 | 48.2 ±1.5 | 19.3 ±0.9 | 74.1 ±1.2 | 3.71 ±0.04 | rounds under by 0.03 (inside ±0.09); escalation at the 80% line |
| t12p15 | 12 | 1.5 | 2 | 5,060 / 880 | 5.75 ±0.12 | 15.8 | 39.9 ±3.7 | **37.5** ±3.2 | 34.4 / 32.6 / 33.0 | 63.0 ±1.3 | 47.5 ±1.7 | 20.5 ±1.0 | 57.4 ±1.4 | 3.32 ±0.04 | reel over by 7.5 |
| t13p2 | 13 | 2 | 2 | 5,093 / 900 | 5.66 ±0.11 | 15.6 | 46.3 ±3.4 | **35.3** ±3.1 | 30.8 / 33.8 / 35.4 | 82.9 ±1.0 | 47.7 ±1.5 | 19.1 ±0.8 | 76.0 ±1.2 | 3.75 ±0.04 | reel over by 5.3; escalation over 80 |
| t10p1r3 | 10 | 1 | **3** | 5,006 / 860 | 5.82 ±0.09 | 16.0 | 45.0 ±3.9 | 6.2 ±1.6 | 30.0 / 33.5 / 36.5 | 54.8 ±1.4 | 45.1 ±1.9 | 18.9 ±1.0 | 50.4 ±1.4 | 3.15 ±0.04 | all met (0.18 from 6) |
| B41 t10p1 | 10 | 1 | 2 | 10,078 / 1,880 | 5.36 ±0.07 | 14.7 | 39.1 ±2.6 | **33.4** ±2.1 | 33.5 / 31.9 / 34.6 | 51.1 ±1.0 | 49.5 ±1.4 | 20.4 ±0.8 | 46.2 ±1.0 | 3.04 ±0.03 | reel over by 3.4 |
| B43 t12p2 | 12 | 2 | 2 | 10,047 / 2,060 | **4.88** ±0.06 | 13.4 | 53.2 ±2.4 | 23.7 ±1.8 | 34.9 / 33.0 / 32.1 | 99.3 ±0.2 | 45.6 ±1.0 | 17.4 ±0.5 | 91.8 ±0.5 | 4.11 ±0.02 | rounds under by 0.12; escalation automatic |

  Other rates: reel wins from behind 86.0 / 85.8 / 84.0 / 96.2%; strips a match 1.51 / 1.76 / 1.72 / 1.94; tokens spent per player 1.34 / 1.21 / 1.56 / 1.06; rounds begun with a seat out of tokens 3.3 / 2.6 / 6.5 / 1.1%; bots A/B/C win 32.2-34.3 in every configuration.
- Findings:
  - At a reel of 2 the reel follows the match length, whatever sets it: 23.7, 27.4, 33.4, 35.3 and 37.5% at 4.88, 4.97, 5.36, 5.66 and 5.75 rounds (B43, t11p15, B41, t13p2, t12p15). Reel wins of 30 or less need matches of about 5.15 rounds or less, so with a reel of 2 the length band (5 or more) and the reel band leave a window about 0.15 rounds wide, little more than a 10,000-round confirm's ±0.06-0.07. Of the settings with a reel of 2 here, only t11p15 sits in it, and it escalates in 80.7% of rounds.
  - `roundPoints3` 1.5 counts fewer rounds left than 1, so rivals spend tokens sooner: escalation is 80.7% at target 11 and 63.0% at 12 (51.1% at 1, 99.3% at 2 and target 12). Target 13 at 2 brings it to 82.9%, still past the line.
  - A reel of 3 takes the reel out of the binding: 6.2% of matches, 96% of them comebacks, with 1.94 strips a match, so matches run to 5.82 rounds on points with escalation a choice (54.8%). At two seats (B20) a reel of 3 decided 3.0% of matches, under that table's 5% floor; at three seats it decides 6.2 ±1.6.
- Decision: **target 10, `roundPoints3` 1 (B41's configuration), by step 2 of the rule.** Step 1 took t10p1r3, the only configuration meeting every band (t11p15 is 0.03 rounds short; even counted in, t10p1r3 is the nearer 6, 0.18 against 1.03). The coordinator declined it: it needs a rule that differs by table size (`RULES.reel` is one reel for every table, read by `newMatch`), and it would let the film decide only 6.2% of three-seat matches, the problem 2b-i fixed by lowering the reel from 3 to 2 (B20, B23: 3% to 21%). It stays a one-knob follow-up (a reel by seat count) if Rich wants it. Of the rest, the 1.5-pace candidates either sit at the automatic-escalation line (t11p15: 80.7%) or push the reel to 35-38% (t12p15 37.5, t13p2 35.3 with escalation at 82.9%), and t12/rp2 (B43, the value in `data.js` before this entry) runs 4.88 rounds with escalation in 99% of rounds. So step 2 falls back to t10/rp1, whose reel at about a third of matches the coordinator accepted beforehand for the bigger table. Its confirm is B41, not rerun: the same seeds and configuration at 10,000 rounds and 24 samples give 5.36 ±0.07 rounds, reel 33.4 ±2.1 (3.4 over its bar, the miss accepted), escalation 51.1%, half-time leader 39.1 ±2.6, seats 33.5 / 31.9 / 34.6. `TARGETS[3]` is 10 and `STAKES.roundPoints3` 1 in `js/data.js`, and `tools/baselines/phase3-final3-t10.json` (B41) is the 3-seat baseline for later phases (`phase3-final3.json` stays B43's t12/rp2).

## 2026-10-20 · B46 The one that got away: fidelity, hit rate and cost at two to four seats (Phase 4 Task 1)
- Question: The table now keeps each round's record (a per-turn action log, `js/replay.js`, Decision 1 of the Phase 4 plan) and works out every losing seat's one that got away when the round ends (Decisions 2-3). On bot matches played through the table itself, as in play: does every record replay exactly as played; how often is a line found for a seat that lost at the flip in a round nobody folded in; and what does the round's end cost the host? Bars (final): the as-played replay matches on every flip round; found in at least 30% of eligible seat-rounds at every seat count (the prototype found 84 / 84 / 64 / 53); p95 per round at most 25 ms at four seats on this Mac (the prototype's 14). The draft's 80% upper bar is dropped (coordinator, 2026-10-20).
- Configuration: `tools/gotaway.mjs` (this entry's tool): createTable + attachBot with Mr Heron at 8 samples in every seat (pace 0, `tapWait` 50, rng `createRng(`${seed}:${m}:${seat}`)`), table seed `dd:<m>`, four tables at a time on one thread, the table's own records. At each round's end it replays the record as played (result and scores must match on every flip round, else exit 1) and works out every seat's `gotAway` again from it (must equal the table's lines, else exit 1), timing that (every seat, every round, fold rounds too: what the table did at first; since Task 1's fix round the table skips the winner and rounds with a fold, so this is an upper bound on its work). Runs, one at a time at `nice -n 19`, commit 46299fe plus this task's `replay.js` and `session.js` (committed with this entry), seed dd:
  - `node games/dead-drop/tools/gotaway.mjs --seats 2 --matches 300 --samples 8 --out games/dead-drop/tools/baselines/phase4-gotaway.json` (74 s, load 3.8 before, 3.3 after)
  - `node games/dead-drop/tools/gotaway.mjs --seats 2 --roster mixed --matches 300 --samples 8` (85 s, load 3.0 / 2.3; rerun in Task 1's fix round on eb40a40 plus the fix, with the kinds split four ways: 84 s, load 5.4 / 3.0, every count the same but the kinds and the times, which are the rerun's below)
  - `node games/dead-drop/tools/gotaway.mjs --seats 3 --matches 150 --samples 8` (85 s, load 2.2 / 2.5)
  - `node games/dead-drop/tools/gotaway.mjs --seats 4 --matches 100 --samples 8` (104 s, load 2.6 / 2.0)
- Numbers (95% margins; eligible: lost at the flip in a round nobody folded in; ms: every seat's `gotAway` at a round's end, all rounds):

| Run | Rounds | Flip rounds | Replayed as played | Rounds with a fold | Lost seat-rounds | Eligible | Found | Found of eligible | Found of lost | By turn 1-6 | City only / same card, another partner or face / card changed / both | ms per round mean / p95 / max | Prototype found / p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 seats, Classic | 1,879 | 1,320 | **1,320 of 1,320** | 559 | 1,273 | 1,273 | 1,072 | **84.2% ±2.0** | 84.2% ±2.0 | 60 / 78 / 187 / 174 / 286 / 287 | 399 / 0 / 435 / 238 | 0.85 / **2.17** / 3.27 | 84.1 / 2.2 |
| 2 seats, Mixed | 1,703 | 1,165 | **1,165 of 1,165** | 538 | 1,132 | 1,132 | 947 | **83.7% ±2.2** | 83.7% ±2.2 | 56 / 75 / 136 / 162 / 264 / 254 | 379 / 34 / 348 / 186 | 1.01 / **2.77** / 5.80 | 83.8 / 2.8 |
| 3 seats, Classic | 814 | 776 | **776 of 776** | 236 | 1,494 | 1,108 | 684 | **61.7% ±2.9** | 45.8% ±2.5 | 60 / 68 / 130 / 109 / 159 / 158 | 214 / 0 / 301 / 169 | 3.00 / **6.17** / 11.08 | 63.5 / 6.8 |
| 4 seats, Classic | 512 | 507 | **507 of 507** | 153 | 1,434 | 1,005 | 505 | **50.2% ±3.1** | 35.2% ±2.5 | 51 / 58 / 76 / 75 / 120 / 125 | 134 / 0 / 233 / 138 | 6.10 / **12.4** / 18.16 | 53.2 / 14.0 |

  Five sentences (two seats, Classic, in the order found):
  - "Turn 2: Handler to Hong Kong instead of Istanbul would have won the round." (match dd:2, round 0, seat 1)
  - "Turn 4: the Handler to Tangier instead of the Jammer would have won the round." (dd:3, round 0, seat 1)
  - "Turn 1: the Veteran to Istanbul instead of the Impostor to Monaco would have won the round." (dd:1, round 1, seat 1)
  - "Turn 4: the Getaway to Hong Kong instead of the Tripwire would have won the round." (dd:0, round 1, seat 0)
  - "Turn 5: the Jammer to Moscow instead of the Getaway would have won the round." (dd:2, round 1, seat 1)

  The other runs' first lines: Mixed "Turn 4: the Heavy to Geneva instead of the Sleeper …", "Turn 5: Handler to Zurich instead of Reykjavik …", "Turn 3: Turncoat to Helsinki instead of Reykjavik …"; three seats "Turn 6: Heavy to Havana instead of Vienna …", "Turn 3: the Veteran to Hong Kong instead of the Mole to Helsinki …"; four seats "Turn 6: Heavy to Hong Kong instead of Monaco …", "Turn 4: the Mole to Hong Kong instead of the Veteran to Berlin …".
- Findings:
  - Fidelity is exact: 3,768 of 3,768 flip rounds replayed to the round's result and scores, and the table's lines equalled the ones worked out again from its records in every round (no exit). A planted recording gap (answers not noted) failed the first run at once (match dd:2, round 2, exit 1).
  - The hit rates match the prototype's (its own engine-level driver) inside the margins: 84.2 / 83.7 / 61.7 / 50.2 against 84.1 / 83.8 / 63.5 / 53.2. Turns 5 and 6 are about half the lines (53% at two seats Classic, 55% Mixed, 46% at three, 49% at four); city-only changes about a third (37%, 40%, 31%, 27%). At three and four seats a seat that lost had a fold in its round 26% and 30% of the time and gets no line then (Decision 2), so a line follows 46% and 35% of all lost seat-rounds there.
  - The same card with another partner (an Accomplice's, to any city) or another face (in Casablanca) is 34 lines of 947 on Mixed (13 to the same city, 21 to another, which the first run counted as city only), none on Classic (no Accomplice, no Casablanca). Such a line can name a partner that stayed in hand, so a shared screen that shows only city-only lines must also require the same partner (Task 2).
  - Cost: the four-seat p95 is 12.4 ms for the whole round's end (every seat), half the bar; no `legalDrops` cache is needed.
- Decision: every bar holds (fidelity on every flip round; found 50-84% of eligible, over 30% at every seat count; p95 12.4 ms at four seats against 25). The table's records and lines stand as built; Task 2 can render them. `tools/baselines/phase4-gotaway.json` is the two-seat Classic baseline.

## 2026-10-20 · B47 The daily's deck: Classic plus two, a first look (Phase 4 Task 3)
- Question: The daily operation (`js/daily.js`, Decisions 5-6 of the Phase 4 plan) deals Classic plus two featured agents and a featured city (14 cards a deck, 12 cities, round 1 on the featured city), against one of the five rivals (no twist). Drawn from the date alone, what do the first three days look like, and is any featured agent or the city far from even? Report only: at 1,000 rounds the margin is about +-4 on an agent and +-7 on a match, so only a number outside 35-65 is a finding. No tuning in this phase.
- Configuration: `nice -n 19 node games/dead-drop/tools/daily.mjs --from 2026-10-21 --days 60 --sim 3 --rounds 1000 --samples 8` (one process, about 3 minutes, load about 2.5-3 before). Mr Heron (bot A) against the day's rival, both at 8 samples, `setup: 'daily:<date>'`, seed `sim:<date>`, batches of 20 matches until 1,000 rounds. `tools/sim/play.mjs` deals each match from its own seed, so the sim does not use `fixedDeals`.
- Numbers (95% margins):

| Day | Rival | Featured | Matches | Rounds | Rounds a match | Seat 0 wins | Heron wins | Featured agents, win% when played | Featured city, winner took the round |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-21 | Control | Accomplice, Blackmailer, Prague | 180 | 1,001 | 5.56 | 45.6 +-7.3 | 50.0 +-7.3 | 49.0 +-3.8 / 43.6 +-4.3 | 66.2 +-6.1 (234 decided) |
| 2026-10-22 | The Countess | Turncoat, Bodyguard, Macau | 200 | 1,093 | 5.46 | 46.5 +-6.9 | 44.5 +-6.9 | 48.3 +-3.6 / 47.8 +-3.8 | 61.9 +-5.4 (310 decided) |
| 2026-10-23 | The Magpie | Accomplice, Turncoat, Rome | 180 | 1,053 | 5.85 | 54.4 +-7.3 | 48.9 +-7.3 | 50.4 +-3.5 / 47.1 +-3.7 | 64.9 +-5.4 (305 decided) |

- Findings: No agent is outside 35-65 (the lowest is the Blackmailer at 43.6). Seat 0 and Heron both sit in 44-55 on every day. A match runs about 5.5-5.9 rounds. The featured city shows the winner taking the round 62-66% of the time, in line with the other cities' pull (the first look at this number; no earlier entry gives a bar for it).
- Schedule (60 days from 2026-10-21): all five rivals appear (the Magpie 18 days, the Countess 15, Control 11, Wren 11, Heron 5). Worth a note: the Turncoat is featured five days running (2026-11-21 to 11-25), and 11-21 and 11-22 are the same rival (the Countess) and the same pair (Turncoat + Bodyguard) with only the city changed. No other agent runs more than three days (Courier, Decoy) in a row. Eight agents, two a day, makes a streak this long unlikely but not rare; a rule that no featured agent repeats on the next day is a small change to `dailyOperation`'s draw if the coordinator wants it (it would reshuffle every date).
- Fix round: the schedule now follows a rule, walked from `DAILY_EPOCH` 2026-10-01: no agent or city is featured the day after it was. The 60-day schedule above is the old draw, as are the three dates simulated here (the sim numbers are from the old draws); the new schedule has no consecutive agent or city repeats (400 days checked in `daily.test.mjs`).
- Decision: none (report only). Nothing is tuned.
