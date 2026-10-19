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
