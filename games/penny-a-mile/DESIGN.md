# Penny a Mile

Game #7, type **network** (draw routes as demand grows). A pocket Transport Tycoon on a
model-railway layout. The name comes from the 1844 Railway Act's "parliamentary trains":
third class at a penny a mile. Here too, you're paid by the distance you haul.

## The hook

You drag one line from a colliery to a power station, and the layout answers: track runs
around the river and the woods, two little stations appear, and a green tank engine puffs
away with its coal hoppers. A few seconds later a gold "£1,240" rises off the platform. The
coal piles up faster than one engine can shift it, so you add a second, then borrow and
build a sawmill line, and the sawmill starts making goods that the town wants... A network
that compounds, and a Board that wants more of it every five years.

- **The moment** (seconds): drag a route and it's built at once; each delivery lands as a
  coin and a rising sum over the station.
- **The run** (about 12 minutes at normal speed): 1900 to 1920. Board meetings in 1905, 1910
  and 1915 each set a company-value target (shown from the start, climbing). Miss one and
  the Board replaces you. 1920 is the final count: company value is the score.
- **The return**: your best value on the shelf, the day's map (the same shire for everyone),
  and new random shires.

## Rules

- **The shire** is a 40×40 tile layout: grass, farmland, woods (clearing costs extra),
  rivers (bridges cost a lot) and rocky outcrops (impassable). Six towns and a dozen
  industries.
- **Cargo**: passengers (towns ⇄ towns), coal (colliery → power station), wood
  (forest → sawmill), grain (farm → mill). Sawmills and mills turn what they're sent into
  **goods**, which towns want. That's the supply chain to exploit.
- **Build a route**: drag from one spot to another. Either end can be an existing station
  or open ground (a station is built there). The cheapest path is found for you, reusing
  any track you already own for free. The preview shows the cost and what each end
  supplies and accepts. Each route is a service: trains shuttle between its two stations.
- **Stations** gather from everything within 3 tiles: industries in reach send their output
  there, houses in reach make passengers, and a station accepts what its neighbours want.
- **Pay** = units × cargo rate × tiles between the two stations (Manhattan distance) × a
  speed factor (passengers soon go stale, coal never does). Longer routes pay more per load
  but need more trains.
- **Station rating**: frequent pickups by fast trains raise the share of production a
  station receives; cargo left waiting lowers it. More trains, more cargo.
- **Industries** change output each year. Well-served ones tend to grow. Towns grow when
  they're served, and new houses appear on the layout.
- **Subsidies** (as in TT): the Board of Trade offers a bonus for a new connection; the
  first delivery wins double pay on it for two years.
- **New locomotives** arrive over the years (the Cheviot, Mendip, Pennine and Cairngorm
  classes, named after British hills): faster and bigger. Modernise a service's fleet for
  the price minus a trade-in.
- **Money**: running costs and track upkeep come out monthly. Borrow up to £100,000 at 6%.
  Run out of money with the loan maxed for three months and the receivers come in.
- **Company value** = cash − loan + trains (depreciating) + half what the track and stations
  cost.

## Controls

- **Build** (B): drag from a spot to another to lay a route. Tap one end, then the other, also
  works (phones).
- **Look** (L): drag to pan, tap a station, train, industry or town for its card.
- **Bulldoze** (D): tap a track tile or a station to remove it (a quarter back).
- Wheel or pinch to zoom; right-drag, two fingers or WASD/arrows to pan. Space pauses;
  1/2/3 set the speed.

## Look and sound

**A model railway layout**, seen in TT's isometric view. Flock-green grass with speckle,
lichen-puff trees, ploughed fields, a glossy resin river, plaster crags, card-kit cottages
with red and slate roofs, brown ballast with silver rails. The layout sits on a plywood
baseboard whose edge shows, in front of a painted sky backscene.

The UI is railway company livery: **Brunswick green enamel with brass lining** for the bars,
and **Edmondson card tickets** for the cards (the little stiff tickets in coloured stock),
whose colour says what they are: buff for stations, green for services, pink for
subsidies.

Tokens:
- Brunswick green `#1d4a37`, brass `#c8a14b`, enamel cream lettering `#f1e6c8`
- Ticket stocks: buff `#e6d3a3`, green `#bcd3a8`, pink `#ecc3be`
- Signal red `#b3302a` (losses, warnings: red ink, ledger-style)
- Cargo colours carry meaning everywhere: coal `#34302c`, wood `#a8642f`, grain `#e0b33d`,
  goods `#2f5f9e`, passengers `#9b2d3a` (carriage crimson)
- Backscene sky `#a9c6d3` to haze `#e3dcc4`

Type: **Cabin** and **Cabin Condensed** only (a humanist sans in the line of Johnston and
Gill, the lettering of British railways). The title is a locomotive nameplate: brass letters on
a red ground, curved over the splasher. No all-caps labels apart from that plate.

**The one memorable moment: the Board meeting.** Every five years the layout dims and the
company ledger opens. Each service's earnings for the term are written in, one line at a time
with a pen scratch and a coin tick. Then the totals, then a brass steam-pressure gauge whose
needle swings toward the Board's mark (red zone below it), and a rubber stamp: "Charter
renewed" or "Dismissed". 1920's meeting is the finale, ending on the company's map, a
railway-company map of your whole network that's worth a screenshot.

Sound (all synthesised): a soft chuff that quickens with speed, a two-note whistle on
departure, a coin "ting" per delivery (pitch rising with the sum), a ratchet clank when track
is laid, a crowd cheer when the first train reaches a town, a brass chord for new locomotives,
pen scratches and a stamp thud at the Board.

## Tuning notes

From `tools/sim.mjs` (whole charters played by `js/bot.js` at skills 0.3, 0.6 and 1; 30 runs each):

- **Time:** a day is 0.1 s at normal speed, so a year is 36 s and the charter about 12 minutes;
  ×2 and ×4 for impatient players. Trains run 0.25–0.62 tiles a day (2.5–6 tiles a second).
- **Cargo rates** (£ per unit per tile): passengers 3, coal 2.25, wood 2.4, grain 2.6, goods 3.5.
  The first guess was twice that, and a bot ended 1920 at £7.5M with 250 trains.
- **The bot builds like a person:** a new route every 2–5 months depending on skill, at most two
  trains a month. Building every month gave it 49 services by 1920.
- **Output every ten days, and trains wait for a load:** an empty train at a station that sends
  cargo to the far end waits up to 20 days for a third of a load. Before this the first train
  left the colliery before any coal existed and the first coin took three months; afterwards the
  bots' 1905 values rose by about 70%, and the targets were raised to match.
- **The Board:** £150k by 1905, £550k by 1910, £1.4M by 1915. Bots pass 1905 90–100% of the
  time, and survive the whole charter 47% (skill 0.3), 70% (0.6) and 63% (1.0; it spends more
  on trains); median finals £2.6–3.5M. The new classes in 1905, 1910 and 1915 give a visible
  jump the year after each meeting.
- **Ranks** at the end follow those finals: General manager (£2.5M) is a good run, Chairman
  (£4M) a great one.
- **Crags** are impassable: noise above 0.83 gives a median 6% of tiles (0.78 gave 11%, up to
  23%, and routes were mostly detours).
- **Pay by Manhattan distance between the stations**, not track length, so a winding line earns
  no more than a straight one; curves are 25% dearer to plan, so routes come out as long
  straights with few bends.

## Ideas for later

- Multi-stop services, signals and single-track blocking.
- Road vehicles and boats.
- A rival company.
