// Penny a Mile: the numbers. Everything the engine, the bot and the UI share.
// Money is in pounds; time is in days (30-day months, 360-day years); distance in tiles.

export const W = 40;
export const H = 40;
export const MONTH = 30;
export const YEAR = 360;
export const START_YEAR = 1900;
export const END_YEAR = 1920;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Board meetings on 1 January of these years: company value must reach the target. 1920 is the final count. */
export const BOARD = [
  { year: 1905, target: 150000 },
  { year: 1910, target: 550000 },
  { year: 1915, target: 1400000 },
];

export const START_CASH = 60000;
export const LOAN = { max: 100000, step: 10000, rate: 0.06 };

/** A station gathers from, and delivers to, everything within this many tiles (a 7×7 square). */
export const RADIUS = 3;

// Ground types.
export const GRASS = 0;
export const WATER = 1;
export const ROCK = 2;
export const FIELD = 3;

// Costs.
export const COST = {
  track: 320, // a piece of track on open grass
  field: 80, // extra over farmland
  forest: 260, // extra to clear woods (scaled by density)
  road: 220, // extra for a level crossing
  bridge: 2600, // a piece over water
  station: 2400,
  curve: 1.25, // multiplier on new curved pieces, so routes prefer long straights
  reuse: 0.15, // planning weight per existing piece (free to use, but shorter is still better)
  upkeepPiece: 6, // per piece per year
  upkeepStation: 120, // per station per year
  refund: 0.25, // bulldozing gives back this share of what a piece cost
};

/**
 * Cargo: rate is pounds per unit per tile hauled; `fresh` days before pay starts to fall,
 * reaching 30% at `stale` days.
 */
export const CARGO = {
  pax: { name: 'Passengers', short: 'passengers', unit: '', rate: 3, fresh: 14, stale: 60, color: '#9b2d3a' },
  coal: { name: 'Coal', short: 'coal', unit: 't', rate: 2.25, fresh: 70, stale: 260, color: '#34302c' },
  wood: { name: 'Wood', short: 'wood', unit: 't', rate: 2.4, fresh: 50, stale: 200, color: '#a8642f' },
  grain: { name: 'Grain', short: 'grain', unit: 't', rate: 2.6, fresh: 36, stale: 160, color: '#e0b33d' },
  goods: { name: 'Goods', short: 'goods', unit: ' crates', rate: 3.5, fresh: 24, stale: 120, color: '#2f5f9e' },
};
export const CARGO_IDS = Object.keys(CARGO);

/** Industries: `makes` (primary, monthly range), `takes` and `turns` (secondary: what it accepts becomes `turns`). */
export const INDUSTRY = {
  colliery: { name: 'Colliery', w: 2, h: 2, makes: 'coal', prod: [70, 120] },
  power: { name: 'Power Station', w: 2, h: 2, takes: ['coal'] },
  forest: { name: 'Woods', w: 2, h: 2, makes: 'wood', prod: [55, 95] },
  sawmill: { name: 'Sawmill', w: 2, h: 2, takes: ['wood'], turns: 'goods' },
  farm: { name: 'Farm', w: 2, h: 2, makes: 'grain', prod: [55, 95] },
  mill: { name: 'Mill', w: 2, h: 2, takes: ['grain'], turns: 'goods' },
};

/** How many of each industry a shire gets. */
export const INDUSTRY_MIX = ['colliery', 'colliery', 'colliery', 'power', 'power', 'forest', 'forest', 'sawmill', 'farm', 'farm', 'mill', 'mill'];

export const TOWN_COUNT = 6;

/** Houses by level: people living there. */
export const HOUSE_POP = [0, 24, 50, 90, 150];
/** Passengers a month per resident covered by an active station (before the rating). */
export const PAX_RATE = 0.16;
/** A station accepts passengers with this many houses in reach, goods with GOODS_HOUSES. */
export const PAX_HOUSES = 3;
export const GOODS_HOUSES = 7;

/** Locomotive classes, named after British hills. speed in tiles a day, cap in units. */
export const MODELS = [
  { id: 'cheviot', name: 'Cheviot', wheels: '0-6-0', year: 1900, speed: 0.25, cap: 40, cost: 6000, run: 900, livery: '#2f6b46' },
  { id: 'mendip', name: 'Mendip', wheels: '2-6-0', year: 1905, speed: 0.32, cap: 60, cost: 10000, run: 1300, livery: '#7c2f2a' },
  { id: 'pennine', name: 'Pennine', wheels: '4-6-0', year: 1910, speed: 0.4, cap: 80, cost: 15000, run: 1800, livery: '#284c7a' },
  { id: 'cairngorm', name: 'Cairngorm', wheels: '4-6-2', year: 1915, speed: 0.5, cap: 100, cost: 22000, run: 2500, livery: '#3b3b3b' },
  { id: 'snowdon', name: 'Snowdon', wheels: 'diesel', year: 1925, speed: 0.62, cap: 120, cost: 30000, run: 3000, livery: '#8a5a1e' },
];

/** Trains are worth their price less this share a year, down to FLOOR. */
export const DEPRECIATION = 0.05;
export const DEPRECIATION_FLOOR = 0.2;
/** Trade-in share of a train's current value when modernising. */
export const TRADE_IN = 0.6;

/** Line colours for services, in the order they are handed out. */
export const LINE_COLOURS = ['#c8a14b', '#b3302a', '#2f5f9e', '#5d8a3a', '#7a4b8c', '#d0742c', '#2a8a86', '#a0526b', '#56606b', '#8c7a2a'];

/** Waiting cargo above this at a station is lost. */
export const MAX_WAITING = 600;

// Town names: a prefix and a suffix.
export const NAME_A = ['Ash', 'Brad', 'Kettle', 'Thorn', 'Hal', 'Mar', 'Pen', 'Sel', 'Brom', 'Dun', 'Oak', 'Fen', 'Lang', 'Cran', 'Stan', 'Wold', 'Bram', 'Ched', 'Long', 'Nether', 'Rother', 'Swin', 'Tad', 'Whit', 'Elm', 'Hart', 'Kings', 'Lark', 'Mickle', 'Pud', 'Rush', 'Sal', 'Thistle', 'Wey', 'Yarn', 'Ald', 'Bur', 'Cold', 'Gold', 'Hazel'];
export const NAME_B = ['by', 'ford', 'ham', 'ley', 'wick', 'ton', 'bury', 'worth', 'combe', 'stead', 'thorpe', 'field', 'bridge', 'dale', 'mere', 'borough', 'minster', 'hurst', 'well', 'brook'];
