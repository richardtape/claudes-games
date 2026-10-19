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
