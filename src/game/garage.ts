// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: garage — riders, bikes, upgrades, cosmetics
// ---------------------------------------------------------------------------
import type { RiderColors } from './models';

// --- riders ----------------------------------------------------------------
export interface RiderDef {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  /** small innate biases, applied on top of bike + upgrades */
  bias: Partial<Stats>;
  skin: number;
  helmet: number;
}

export const RIDERS: RiderDef[] = [
  {
    id: 'rusty', name: 'RUSTY VANE', tag: 'THE LOCAL',
    blurb: 'Knows every rut on this hill. Nothing rattles him.',
    bias: { grip: 6, land: 6 }, skin: 0xd8a172, helmet: 0xfff0d0,
  },
  {
    id: 'mox', name: 'MOX HALLIDAY', tag: 'THE BRAWLER',
    blurb: 'Treats the pack like a contact sport. Loves a fistful of jersey.',
    bias: { bonk: 12, accel: 4, grip: -4 }, skin: 0x8a5a34, helmet: 0xff7a00,
  },
  {
    id: 'juno', name: 'JUNO PIKE', tag: 'THE FLYER',
    blurb: 'Finds air where there is none. Lands most of it.',
    bias: { air: 12, land: 5, top: -3 }, skin: 0xf0c39a, helmet: 0x00e5ff,
  },
  {
    id: 'bex', name: 'BEX ORTOLAN', tag: 'THE MISSILE',
    blurb: 'Tucks on everything. Brakes are a suggestion.',
    bias: { top: 11, accel: 5, land: -5 }, skin: 0x6b4226, helmet: 0xff2e2e,
  },
  {
    id: 'kit', name: 'KIT SOLVANG', tag: 'THE SURGEON',
    blurb: 'Never off the racing line. Never wastes a metre.',
    bias: { grip: 11, top: 3, bonk: -6 }, skin: 0xe8b98d, helmet: 0x1b1b1b,
  },
  {
    id: 'grud', name: 'GRUD', tag: 'THE UNIT',
    blurb: 'Enormous. Unbothered. Rolls through things.',
    bias: { bonk: 15, land: 8, accel: -7 }, skin: 0xc98b5e, helmet: 0x111111,
  },
];

// --- bikes -----------------------------------------------------------------
export interface Stats {
  top: number;    // top speed
  accel: number;  // acceleration
  grip: number;   // cornering
  air: number;    // trick control
  land: number;   // landing forgiveness
  bonk: number;   // melee shove
}

export const STAT_KEYS: (keyof Stats)[] = ['top', 'accel', 'grip', 'air', 'land', 'bonk'];
export const STAT_LABEL: Record<keyof Stats, string> = {
  top: 'TOP SPEED', accel: 'ACCEL', grip: 'GRIP',
  air: 'AIR CONTROL', land: 'LANDING', bonk: 'BONK FORCE',
};

export interface BikeDef {
  id: string;
  name: string;
  klass: string;
  blurb: string;
  base: Stats;
  price: number;
  frame: number;
  accent: number;
  wheelScale: number;
  tubeScale: number;
}

export const BIKES: BikeDef[] = [
  {
    id: 'clunker', name: 'THE CLUNKER', klass: 'STARTER',
    blurb: 'Heavy, honest, and free. It will get you down.',
    base: { top: 42, accel: 44, grip: 46, air: 40, land: 44, bonk: 50 },
    price: 0, frame: 0x2fe6c8, accent: 0xffd400, wheelScale: 1, tubeScale: 1,
  },
  {
    id: 'hornet', name: 'HORNET 29', klass: 'ALL-ROUND',
    blurb: 'Light, quick, no bad habits. The safe pick.',
    base: { top: 58, accel: 62, grip: 58, air: 54, land: 52, bonk: 44 },
    price: 900, frame: 0xffd400, accent: 0x1b1b22, wheelScale: 1.04, tubeScale: 0.92,
  },
  {
    id: 'slab', name: 'SLAB HEAVY', klass: 'BRAWLER',
    blurb: 'Built from scaffolding. Wins every argument.',
    base: { top: 52, accel: 40, grip: 54, air: 38, land: 74, bonk: 82 },
    price: 1400, frame: 0xff3b30, accent: 0x111111, wheelScale: 1.1, tubeScale: 1.22,
  },
  {
    id: 'wisp', name: 'WISP CARBON', klass: 'FREERIDE',
    blurb: 'Barely there. Flicks like a thought.',
    base: { top: 56, accel: 66, grip: 52, air: 84, land: 46, bonk: 30 },
    price: 1900, frame: 0x9b30ff, accent: 0x00ff9d, wheelScale: 0.96, tubeScale: 0.8,
  },
  {
    id: 'bolt', name: 'BOLT DH-9', klass: 'DOWNHILL',
    blurb: 'A missile with bars. Point it and hold on.',
    base: { top: 86, accel: 58, grip: 70, air: 56, land: 62, bonk: 46 },
    price: 2800, frame: 0x0e6fd6, accent: 0xff2e88, wheelScale: 1.06, tubeScale: 1.02,
  },
  {
    id: 'bonkyard', name: 'BONKYARD SPECIAL', klass: 'PROTOTYPE',
    blurb: 'Welded from three dead bikes and pure spite.',
    base: { top: 74, accel: 72, grip: 66, air: 70, land: 68, bonk: 74 },
    price: 4200, frame: 0xff6a00, accent: 0x00e5ff, wheelScale: 1.08, tubeScale: 1.1,
  },
];

// --- upgrades --------------------------------------------------------------
export interface UpgradeDef {
  id: keyof Stats;
  name: string;
  part: string;
  desc: string;
  perLevel: number;
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'top', name: 'DRIVETRAIN', part: 'TALL GEARING', desc: 'Raises the speed you can hold on the straights.', perLevel: 7, costs: [150, 300, 550, 900] },
  { id: 'accel', name: 'CRANKS', part: 'LIGHT ARMS', desc: 'Get back up to pace faster out of corners.', perLevel: 7, costs: [140, 280, 520, 850] },
  { id: 'grip', name: 'TYRES', part: 'SOFT COMPOUND', desc: 'More bite in the berms and on loose dirt.', perLevel: 7, costs: [160, 320, 580, 950] },
  { id: 'air', name: 'BARS', part: 'WIDE RISER', desc: 'Faster rotation and finer control in the air.', perLevel: 7, costs: [130, 270, 500, 820] },
  { id: 'land', name: 'SUSPENSION', part: 'COIL SHOCK', desc: 'Soak up bad landings that would otherwise end you.', perLevel: 7, costs: [170, 340, 600, 1000] },
  { id: 'bonk', name: 'GLOVES', part: 'KNUCKLE PLATE', desc: 'Hit harder, launch rivals further, bank more boost.', perLevel: 7, costs: [120, 250, 460, 780] },
];

export const MAX_LEVEL = 4;

// --- cosmetics -------------------------------------------------------------
export interface Swatch { id: string; name: string; hex: number; }

export const FRAME_COLORS: Swatch[] = [
  { id: 'stock', name: 'STOCK', hex: 0 },
  { id: 'mint', name: 'MINT', hex: 0x2fe6c8 },
  { id: 'sun', name: 'SUNBURST', hex: 0xffd400 },
  { id: 'blood', name: 'BLOOD', hex: 0xff3b30 },
  { id: 'violet', name: 'VIOLET', hex: 0x9b30ff },
  { id: 'cobalt', name: 'COBALT', hex: 0x0e6fd6 },
  { id: 'ember', name: 'EMBER', hex: 0xff6a00 },
  { id: 'bone', name: 'BONE', hex: 0xf2ede0 },
  { id: 'void', name: 'VOID', hex: 0x16161c },
];

export const JERSEY_COLORS: Swatch[] = [
  { id: 'red', name: 'CRIMSON', hex: 0xff3b30 },
  { id: 'blue', name: 'AZURE', hex: 0x2f7bff },
  { id: 'purple', name: 'GRAPE', hex: 0x9b30ff },
  { id: 'green', name: 'TOXIC', hex: 0x00c853 },
  { id: 'orange', name: 'TANGERINE', hex: 0xff9500 },
  { id: 'white', name: 'CHALK', hex: 0xf2f2f2 },
  { id: 'pink', name: 'HOTPINK', hex: 0xff2e88 },
  { id: 'cyan', name: 'GLACIER', hex: 0x00e5ff },
];

export const ACCENT_COLORS: Swatch[] = [
  { id: 'gold', name: 'GOLD', hex: 0xffd400 },
  { id: 'cyan', name: 'NEON', hex: 0x00e5ff },
  { id: 'pink', name: 'MAGENTA', hex: 0xff2e88 },
  { id: 'lime', name: 'LIME', hex: 0xc0f000 },
  { id: 'white', name: 'WHITE', hex: 0xffffff },
  { id: 'black', name: 'CARBON', hex: 0x1b1b22 },
];

// --- loadout ---------------------------------------------------------------
export interface Loadout {
  rider: string;
  bike: string;
  frame: string;
  jersey: string;
  accent: string;
  /** upgrade levels per owned bike: bikeId -> stat -> level */
  levels: Record<string, Partial<Record<keyof Stats, number>>>;
  owned: string[];
}

export const DEFAULT_LOADOUT: Loadout = {
  rider: 'rusty',
  bike: 'clunker',
  frame: 'stock',
  jersey: 'red',
  accent: 'gold',
  levels: {},
  owned: ['clunker'],
};

export const getRider = (id: string) => RIDERS.find(r => r.id === id) ?? RIDERS[0];
export const getBike = (id: string) => BIKES.find(b => b.id === id) ?? BIKES[0];

export function levelOf(l: Loadout, bikeId: string, stat: keyof Stats): number {
  return l.levels[bikeId]?.[stat] ?? 0;
}

export function upgradeCost(stat: keyof Stats, level: number): number | null {
  const u = UPGRADES.find(x => x.id === stat)!;
  return level >= MAX_LEVEL ? null : u.costs[level];
}

/** Final 0-100 stats from bike base + upgrades + rider bias. */
export function computeStats(l: Loadout): Stats {
  const bike = getBike(l.bike);
  const rider = getRider(l.rider);
  const out = { ...bike.base };
  for (const u of UPGRADES) {
    out[u.id] += levelOf(l, bike.id, u.id) * u.perLevel;
  }
  for (const k of STAT_KEYS) {
    out[k] = Math.max(1, Math.min(100, out[k] + (rider.bias[k] ?? 0)));
  }
  return out;
}

/** Gameplay multipliers derived from stats. Tuned to stay inside the
 *  physics envelope the balance harness validated: roughly +/-10%. */
export interface Perf {
  topCap: number;    // m/s added to the soft cap
  accel: number;     // pedal force multiplier
  grip: number;      // lateral grip multiplier
  airRate: number;   // trick rotation multiplier
  landTol: number;   // extra landing angle tolerance (radians)
  bonk: number;      // bonk force / boost gain multiplier
}

export function computePerf(l: Loadout): Perf {
  const s = computeStats(l);
  const n = (v: number) => (v - 50) / 50;   // -1 .. +1
  return {
    topCap: n(s.top) * 4.5,
    accel: 1 + n(s.accel) * 0.22,
    grip: 1 + n(s.grip) * 0.16,
    airRate: 1 + n(s.air) * 0.28,
    landTol: n(s.land) * 0.16,
    bonk: 1 + n(s.bonk) * 0.35,
  };
}

/** Resolve cosmetics into the colour set the rider builder wants. */
export function loadoutColors(l: Loadout): RiderColors {
  const bike = getBike(l.bike);
  const rider = getRider(l.rider);
  const frameSw = FRAME_COLORS.find(f => f.id === l.frame);
  const jersey = JERSEY_COLORS.find(j => j.id === l.jersey)?.hex ?? 0xff3b30;
  const accent = ACCENT_COLORS.find(a => a.id === l.accent)?.hex ?? 0xffd400;
  return {
    jersey,
    pants: 0x18181b,
    helmet: rider.helmet,
    frame: frameSw && frameSw.hex !== 0 ? frameSw.hex : bike.frame,
    accent,
    skin: rider.skin,
  };
}

/** Coins awarded for a finished run. */
export function runPayout(place: number, score: number, tricks: number, bonks: number): number {
  const placeBonus = [0, 260, 190, 140, 100, 70, 50][place] ?? 40;
  return Math.round(placeBonus + score / 90 + tricks * 8 + bonks * 5);
}
