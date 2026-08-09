// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: PROGRESSION
//
// Two hard rules, enforced by the type system rather than by discipline:
//
//   1. XP is earned by DOING THINGS, not by finishing position alone.
//   2. Nothing purchasable with currency raises a performance stat.
//      Upgrades are earned with XP (levels); currency buys looks only.
//
// That second rule is what keeps this from being pay-to-win: the currency
// economy and the power economy are entirely separate ledgers.
// ---------------------------------------------------------------------------



// --- XP --------------------------------------------------------------------

export type XpSource =
  | 'finish' | 'podium' | 'victory' | 'tricks' | 'bonks'
  | 'nearmiss' | 'shortcuts' | 'challenge';

export interface XpLine {
  source: XpSource;
  label: string;
  amount: number;
  detail: string;
}

export interface RunSummary {
  place: number;
  fieldSize: number;
  score: number;
  tricks: number;
  bonks: number;
  nearMisses: number;
  shortcuts: number;
  bestTrickScore: number;
  time: number;
  length: number;
  finished: boolean;
  challengesDone: Challenge[];
  modeXpScale: number;
  modeCashScale: number;
}

/**
 * Itemised XP. Returned as lines rather than a total so the results screen
 * can show players exactly what paid — which is the part that teaches them
 * how to earn more next run.
 */
export function xpBreakdown(r: RunSummary): XpLine[] {
  const out: XpLine[] = [];
  const push = (source: XpSource, label: string, amount: number, detail: string) => {
    if (amount >= 1) out.push({ source, label, amount: Math.round(amount), detail });
  };

  // completing the descent at all — scaled by length so long mountains pay more
  if (r.finished) {
    push('finish', 'DESCENT COMPLETE', 60 + (r.length / 1000) * 22,
      `${(r.length / 1000).toFixed(1)}km`);
  }
  if (r.place <= 3 && r.finished) {
    push('podium', 'PODIUM', [0, 120, 80, 50][r.place] ?? 0,
      ['', '1ST', '2ND', '3RD'][r.place] ?? '');
  }
  if (r.place === 1 && r.finished) {
    push('victory', 'VICTORY', 140, `BEAT ${r.fieldSize - 1} RIVALS`);
  }
  push('tricks', 'TRICKS STOMPED', r.tricks * 9 + r.bestTrickScore / 90,
    `${r.tricks} landed`);
  push('bonks', 'BONKS LANDED', r.bonks * 6, `${r.bonks} hits`);
  push('nearmiss', 'CLOSE SHAVES', r.nearMisses * 5, `${r.nearMisses}`);
  push('shortcuts', 'SHORTCUTS POACHED', r.shortcuts * 26, `${r.shortcuts} found`);

  for (const c of r.challengesDone) {
    push('challenge', c.name, c.xp, 'CHALLENGE');
  }

  // mode multiplier applies to everything
  if (r.modeXpScale !== 1) {
    for (const line of out) line.amount = Math.round(line.amount * r.modeXpScale);
  }
  return out;
}

export const xpTotal = (lines: XpLine[]) =>
  lines.reduce((n, l) => n + l.amount, 0);

/** Currency. Deliberately NOT proportional to winning. */
export function cashEarned(r: RunSummary): number {
  const base = 40 + (r.length / 1000) * 18;
  const placeBonus = [0, 110, 85, 65, 50, 40, 32][r.place] ?? 25;
  // style is the main driver, so a spectacular loss can out-earn a dull win
  const style = r.score / 70;
  const doing = r.tricks * 7 + r.bonks * 5 + r.shortcuts * 14;
  return Math.round((base + placeBonus + style + doing) * r.modeCashScale);
}

// --- challenges ------------------------------------------------------------

export interface Challenge {
  id: string;
  name: string;
  desc: string;
  xp: number;
  /** does this run satisfy it? */
  test: (r: RunSummary) => boolean;
}

/**
 * Per-run challenges. These are the main way a player who keeps losing can
 * still make progress — every one of them is achievable without winning.
 */
export const CHALLENGES: Challenge[] = [
  { id: 'trickster', name: 'TRICKSTER', desc: 'Land 6 tricks in one run', xp: 90,
    test: r => r.tricks >= 6 },
  { id: 'bruiser', name: 'BRUISER', desc: 'Land 5 bonks in one run', xp: 90,
    test: r => r.bonks >= 5 },
  { id: 'poacher', name: 'POACHER', desc: 'Take 2 shortcuts in one run', xp: 110,
    test: r => r.shortcuts >= 2 },
  { id: 'threader', name: 'THREADER', desc: '4 close shaves in one run', xp: 80,
    test: r => r.nearMisses >= 4 },
  { id: 'showoff', name: 'SHOW-OFF', desc: 'A single trick worth 2,000+', xp: 130,
    test: r => r.bestTrickScore >= 2000 },
  { id: 'stylist', name: 'STYLIST', desc: 'Finish with 20,000 style points', xp: 140,
    test: r => r.score >= 20000 },
  { id: 'cleanrun', name: 'CLEAN RUN', desc: 'Podium without taking a shortcut', xp: 120,
    test: r => r.place <= 3 && r.shortcuts === 0 && r.finished },
];

export function completedChallenges(r: RunSummary): Challenge[] {
  return CHALLENGES.filter(c => c.test({ ...r, challengesDone: [] }));
}

// --- unlockables -----------------------------------------------------------

export type UnlockKind = 'effect' | 'emote' | 'trail' | 'riderSkin' | 'bikeSkin';

export interface Unlock {
  id: string;
  kind: UnlockKind;
  name: string;
  desc: string;
  /** currency price; 0 means level-gated only */
  price: number;
  /** player level required */
  reqLevel: number;
  colour: string;
}

/**
 * Everything currency can buy. Note what is NOT here: no stat boosts, no
 * bikes with better numbers, no consumables. Cosmetics only.
 */
export const UNLOCKS: Unlock[] = [
  // ---- trails
  { id: 'trail_dust', kind: 'trail', name: 'HEAVY DUST', desc: 'A thicker plume off the back wheel.', price: 320, reqLevel: 0, colour: '#c9b48c' },
  { id: 'trail_neon', kind: 'trail', name: 'NEON STREAK', desc: 'Glowing ribbon that follows your line.', price: 700, reqLevel: 3, colour: '#00e5ff' },
  { id: 'trail_fire', kind: 'trail', name: 'EMBER TRAIL', desc: 'Sparks and cinders when you boost.', price: 900, reqLevel: 5, colour: '#ff6a00' },
  { id: 'trail_void', kind: 'trail', name: 'VOID WAKE', desc: 'Deep violet smoke that lingers.', price: 1300, reqLevel: 8, colour: '#9b30ff' },

  // ---- landing / bonk effects
  { id: 'fx_gold', kind: 'effect', name: 'GOLD IMPACT', desc: 'Bonks burst gold.', price: 450, reqLevel: 2, colour: '#ffd400' },
  { id: 'fx_shock', kind: 'effect', name: 'SHOCKWAVE', desc: 'A ring pulse on every heavy landing.', price: 850, reqLevel: 4, colour: '#7ef7ff' },
  { id: 'fx_confetti', kind: 'effect', name: 'CONFETTI BONK', desc: 'Because why not.', price: 1100, reqLevel: 7, colour: '#ff2e88' },

  // ---- emotes (played at the finish line)
  { id: 'em_salute', kind: 'emote', name: 'SALUTE', desc: 'Two fingers off the helmet.', price: 260, reqLevel: 1, colour: '#f2f2f2' },
  { id: 'em_whip', kind: 'emote', name: 'VICTORY WHIP', desc: 'One last tailwhip over the line.', price: 620, reqLevel: 4, colour: '#c0f000' },
  { id: 'em_bow', kind: 'emote', name: 'TAKE A BOW', desc: 'For the crowd.', price: 780, reqLevel: 6, colour: '#ffd400' },

  // ---- cosmetic skins
  { id: 'skin_chrome', kind: 'bikeSkin', name: 'CHROME FRAME', desc: 'Mirror-polished tubes.', price: 950, reqLevel: 5, colour: '#dfe6ee' },
  { id: 'skin_rust', kind: 'bikeSkin', name: 'BARN FIND', desc: 'Honest rust. Goes faster, somehow.', price: 540, reqLevel: 2, colour: '#8a4b2a' },
  { id: 'skin_mud', kind: 'riderSkin', name: 'CAKED IN MUD', desc: 'Proof you rode the whole thing.', price: 400, reqLevel: 3, colour: '#5c4a32' },
  { id: 'skin_champ', kind: 'riderSkin', name: 'CHAMPION KIT', desc: 'Gold-trimmed jersey.', price: 1500, reqLevel: 10, colour: '#ffd400' },
];

export const getUnlock = (id: string) => UNLOCKS.find(u => u.id === id);

export function unlocksFor(kind: UnlockKind) {
  return UNLOCKS.filter(u => u.kind === kind);
}

/**
 * The pay-to-win guard.
 *
 * Currency buys only things in UNLOCKS, and UNLOCKS may only contain
 * cosmetic kinds. If someone later adds a stat-bearing kind, the union below
 * stops matching and this assignment fails to compile — so the rule is
 * enforced by the build, not by review.
 */
type CosmeticOnly = 'effect' | 'emote' | 'trail' | 'riderSkin' | 'bikeSkin';
type AssertCosmetic = UnlockKind extends CosmeticOnly
  ? (CosmeticOnly extends UnlockKind ? true : never)
  : never;
export const NO_PAY_TO_WIN: AssertCosmetic = true;

/** Runtime companion: nothing in UNLOCKS may carry a stat field. */
export function auditUnlocks(): { ok: boolean; offenders: string[] } {
  const statKeys = ['top', 'accel', 'grip', 'stab', 'air', 'bonk', 'boost'];
  const offenders = UNLOCKS
    .filter(u => statKeys.some(k => k in (u as unknown as Record<string, unknown>)))
    .map(u => u.id);
  return { ok: offenders.length === 0, offenders };
}
