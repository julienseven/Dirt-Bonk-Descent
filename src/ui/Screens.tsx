import type { Game } from '../game/game';
import { formatTime } from '../game/core';
import { audio } from '../game/audio';
import {
  DIFFICULTIES, formatDelta, type Difficulty, type RecordResult, type SaveData,
} from '../game/save';
import { ZONES } from '../game/track';

const PLACE = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-[28px] items-center justify-center rounded-[4px] border-b-[3px] border-black/70 bg-white/90 px-[7px] py-[2px] text-[11px] font-black text-black shadow">
      {children}
    </span>
  );
}

const CONTROLS: [string, React.ReactNode][] = [
  ['PEDAL / STEER', <><Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key></>],
  ['TUCK (GO FASTER)', <Key>SHIFT</Key>],
  ['HOP / BUNNY HOP', <Key>J</Key>],
  ['BONK LEFT / RIGHT', <><Key>Q</Key> <Key>E</Key></>],
  ['BOOST (on ground)', <Key>SPACE</Key>],
  ['AIR: WHIP / FLIP', <><Key>Q</Key><Key>E</Key> / <Key>J</Key><Key>K</Key></>],
  ['AIR: SUPERBONK POSE', <Key>SPACE</Key>],
  ['CRASHED? MASH TO GET UP', <><Key>W</Key> <Key>SPACE</Key></>],
  ['PAUSE', <Key>ESC</Key>],
];

export function Menu({
  save, onStart, onDifficulty, onToggleMusic, onToggleSfx, onToggleMotion, onToggleGhost,
}: {
  save: SaveData;
  onStart: () => void;
  onDifficulty: (d: Difficulty) => void;
  onToggleMusic: (v: boolean) => void;
  onToggleSfx: (v: boolean) => void;
  onToggleMotion: (v: boolean) => void;
  onToggleGhost: (v: boolean) => void;
}) {
  const music = save.music, sfx = save.sfx;
  const hasGhost = !!save.ghost[save.difficulty];
  const pb = save.best[save.difficulty];
  const pbScore = save.bestScore[save.difficulty] ?? 0;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(6,8,12,.35) 0%, rgba(4,5,8,.92) 75%)' }}>
      <div className="scan pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-6 w-full max-w-5xl">
        <div className="slide-up">
          <div className="title-skew inline-block bg-[#ffd400] px-5 py-1">
            <span className="hud-label !text-[12px] !tracking-[.5em] !text-black">ARCADE DOWNHILL MAYHEM</span>
          </div>
          <h1 className="wobble hud-big mt-2 text-[clamp(46px,10vw,132px)] leading-[0.82] text-white"
            style={{ textShadow: '0 8px 0 #ff2e88, 0 16px 0 #00000088, 0 0 70px #ff2e8855' }}>
            DIRT<span className="text-[#ffd400]"> BONK </span>DESCENT
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-white/70">
            4.6 kilometres straight down a mountain. Six racers, no rules, and a fist for anything
            that gets close. Bonk rivals, plow the crowd, stomp flips, chain it all into boost — and get
            to the bottom first.
          </p>
        </div>

        <div className="mt-7 grid gap-6 md:grid-cols-[auto_1fr] md:items-end">
          <div className="slide-up" style={{ animationDelay: '.08s' }}>
            <button
              onClick={() => { audio.resume(); audio.uiClick(); onStart(); }}
              className="group relative block"
            >
              <span className="title-skew block bg-[#ff2e88] px-10 py-4 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1"
                style={{ boxShadow: '8px 8px 0 #000, 0 0 40px #ff2e8877' }}>
                <span className="hud-big block text-[40px] leading-none text-white">DROP IN</span>
              </span>
            </button>
            <div className="mt-4 flex flex-wrap gap-2">
              {([['MUSIC', music, () => onToggleMusic(!music)],
                 ['SFX', sfx, () => onToggleSfx(!sfx)],
                 ['REDUCED MOTION', save.reducedMotion, () => onToggleMotion(!save.reducedMotion)],
                 ...(hasGhost
                   ? [['GHOST', save.showGhost, () => onToggleGhost(!save.showGhost)] as const]
                   : []),
                ] as const).map(([label, on, fn]) => (
                <button key={label} onClick={() => { audio.uiMove(); fn(); }}
                  className={`title-skew border-2 px-4 py-1 text-[11px] font-black tracking-[.2em] transition-colors ${on ? 'border-[#2fe6c8] bg-[#2fe6c8]/20 text-[#2fe6c8]' : 'border-white/25 text-white/40'}`}>
                  {label} {on ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>

            {/* difficulty */}
            <div className="mt-5">
              <div className="hud-label mb-2">FIELD STRENGTH</div>
              <div className="flex flex-col gap-[6px]">
                {DIFFICULTIES.map(d => {
                  const on = save.difficulty === d.id;
                  return (
                    <button key={d.id}
                      onClick={() => { audio.uiMove(); onDifficulty(d.id); }}
                      className="title-skew flex items-center gap-3 border-2 px-3 py-[5px] text-left transition-all"
                      style={{
                        borderColor: on ? d.color : 'rgba(255,255,255,.18)',
                        background: on ? `${d.color}22` : 'transparent',
                      }}>
                      <span className="hud-big text-[15px]" style={{ color: on ? d.color : 'rgba(255,255,255,.5)' }}>
                        {d.label}
                      </span>
                      <span className="hud-label !tracking-[.1em] !text-[9px]">{d.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* personal bests */}
            {(pb || pbScore > 0) && (
              <div className="mt-4 border-l-4 border-[#ffd400] bg-black/50 px-3 py-2">
                <div className="hud-label mb-1">YOUR BEST — {DIFFICULTIES.find(d => d.id === save.difficulty)?.label}</div>
                <div className="flex gap-5">
                  {pb && (
                    <div>
                      <div className="hud-big text-[20px] leading-none text-[#7ef7ff]">{formatTime(pb.time)}</div>
                      <div className="hud-label !text-[8px]">TIME · {PLACE[pb.place]}</div>
                    </div>
                  )}
                  {pbScore > 0 && (
                    <div>
                      <div className="hud-big text-[20px] leading-none text-[#ffd400]">{Math.round(pbScore).toLocaleString()}</div>
                      <div className="hud-label !text-[8px]">STYLE</div>
                    </div>
                  )}
                  <div>
                    <div className="hud-big text-[20px] leading-none text-white/70">{save.runs}</div>
                    <div className="hud-label !text-[8px]">RUNS</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="slide-up grid grid-cols-2 gap-x-6 gap-y-[6px] rounded-sm border-l-4 border-[#2fe6c8] bg-black/55 p-4 backdrop-blur"
            style={{ animationDelay: '.16s' }}>
            {CONTROLS.map(([label, keys]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="hud-label !tracking-[.14em]">{label}</span>
                <span className="flex shrink-0 items-center gap-1">{keys}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="slide-up mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-bold uppercase tracking-[.18em] text-white/40" style={{ animationDelay: '.24s' }}>
          <span><span className="text-[#ffd400]">Tip</span> — release the trick key to level out before you land</span>
          <span><span className="text-[#ffd400]">Tip</span> — clip a rock's shoulder and you'll deflect; hit it square and you're down</span>
          <span><span className="text-[#ffd400]">Tip</span> — bonks, tricks and close shaves chain into one multiplier</span>
          <span><span className="text-[#ffd400]">Tip</span> — land on downslopes to keep speed; tuck the straights</span>
          <span><span className="text-[#ffd400]">Tip</span> — go down? mash to get up fast and you'll keep your momentum</span>
        </div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center">
        <div className="hud-big text-[72px] leading-none text-white" style={{ textShadow: '0 6px 0 #ff2e88' }}>PAUSED</div>
        <div className="mt-6 flex flex-col items-center gap-3">
          {[['RESUME', onResume, '#2fe6c8'], ['RESTART RUN', onRestart, '#ffd400'], ['QUIT TO MENU', onQuit, '#ff2e88']].map(([l, fn, c]) => (
            <button key={l as string} onClick={() => { audio.uiClick(); (fn as () => void)(); }}
              className="title-skew w-[280px] border-2 py-2 transition-transform hover:translate-x-1"
              style={{ borderColor: c as string, boxShadow: `4px 4px 0 #000` }}>
              <span className="hud-big text-[22px]" style={{ color: c as string }}>{l as string}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Results({
  game, save, result, onRestart, onMenu,
}: {
  game: Game; save: SaveData; result: RecordResult | null;
  onRestart: () => void; onMenu: () => void;
}) {
  const d = game.hud.finishData;
  if (!d) return null;
  const prevSplits = result?.timeRecord ? [] : (save.best[save.difficulty]?.splits ?? []);
  const rivals = [...game.hud.rivals].sort((a, b) => a.place - b.place);
  const win = d.place === 1;
  const rows: [string, string][] = [
    ['FINISH TIME', formatTime(d.time)],
    ['STYLE POINTS', Math.round(d.score).toLocaleString()],
    ['BONKS LANDED', String(d.bonks)],
    ['TRICKS STOMPED', String(d.tricks)],
    ['TOP SPEED', `${Math.round(d.topSpeed)} km/h`],
    ['TOTAL AIRTIME', `${d.airTotal.toFixed(1)}s`],
    ['BEST TRICK', d.bestTrick],
  ];
  if (isFinite(d.gap)) {
    rows.splice(1, 0, ['MARGIN', `${d.gap < 0.01 ? '<0.01' : d.gap.toFixed(2)}s`]);
  }
  const photo = isFinite(d.gap) && d.gap < 0.75;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(6,8,12,.4) 0%, rgba(4,5,8,.93) 70%)' }}>
      <div className="scan pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-6 w-full max-w-4xl">
        <div className="slide-up">
          <div className="title-skew inline-block px-5 py-1" style={{ background: win ? '#ffd400' : '#ff2e88' }}>
            <span className="hud-label !text-[12px] !tracking-[.4em] !text-black">
              {photo ? 'DECIDED BY INCHES' : win ? 'YOU TOOK THE MOUNTAIN' : 'RUN COMPLETE'}
            </span>
          </div>
          <h2 className="hud-big mt-1 text-[clamp(52px,10vw,116px)] leading-[0.85] text-white"
            style={{ textShadow: `0 8px 0 ${win ? '#ffd400' : '#ff2e88'}, 0 0 60px #00000099` }}>
            {PLACE[d.place]} PLACE
          </h2>
          {(result?.timeRecord || result?.scoreRecord) && (
            <div className="mt-2 flex gap-2">
              {result.timeRecord && (
                <span className="title-skew bg-[#7ef7ff] px-3 py-[3px]">
                  <span className="hud-big text-[15px] text-black">
                    NEW BEST TIME{result.prevTime != null && ` · ${formatDelta(d.time - result.prevTime)}s`}
                  </span>
                </span>
              )}
              {result.scoreRecord && (
                <span className="title-skew bg-[#ffd400] px-3 py-[3px]">
                  <span className="hud-big text-[15px] text-black">NEW BEST STYLE</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-[1.3fr_1fr]">
          <div className="slide-up rounded-sm border-l-4 border-[#ffd400] bg-black/60 p-4 backdrop-blur" style={{ animationDelay: '.08s' }}>
            {rows.map(([k, v], i) => (
              <div key={k} className="flex items-baseline justify-between border-b border-white/10 py-[7px] last:border-0"
                style={{ animation: `slideUp .4s ${0.1 + i * 0.05}s both` }}>
                <span className="hud-label">{k}</span>
                <span className="hud-big text-[22px] text-white">{v}</span>
              </div>
            ))}
          </div>
          <div className="slide-up rounded-sm border-l-4 border-[#2fe6c8] bg-black/60 p-4 backdrop-blur" style={{ animationDelay: '.14s' }}>
            {d.splits.length > 1 && (
              <>
                <div className="hud-label mb-2">ZONE SPLITS</div>
                <div className="mb-3 max-h-[132px] overflow-y-auto pr-1">
                  {ZONES.map((z, i) => {
                    const t = d.splits[i];
                    if (i === 0 || t === undefined) return null;
                    const prev = prevSplits[i];
                    const delta = prev !== undefined ? t - prev : null;
                    return (
                      <div key={z.name} className="flex items-baseline justify-between gap-2 py-[2px]">
                        <span className="hud-label !tracking-[.08em] !text-[9px]">{z.name}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="hud-mono text-[12px] text-white/80">{formatTime(t)}</span>
                          {delta !== null && (
                            <span className="hud-mono w-[46px] text-right text-[12px]"
                              style={{ color: delta <= 0 ? '#7ef7c8' : '#ff6a6a' }}>
                              {formatDelta(delta)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="hud-label mb-2">FINAL ORDER</div>
            {rivals.map(r => (
              <div key={r.name} className="mb-[6px] flex items-center gap-2">
                <span className="hud-big w-[34px] text-[18px] text-white/70">{PLACE[r.place]}</span>
                <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: r.color }} />
                <span className={`hud-big text-[18px] ${r.name === 'YOU' ? 'text-[#ffd400]' : 'text-white/80'}`}>{r.name}</span>
                <span className="ml-auto h-[6px] w-[90px] bg-white/10">
                  <span className="block h-full" style={{ width: `${r.progress * 100}%`, background: r.color }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="slide-up mt-6 flex flex-wrap gap-3" style={{ animationDelay: '.24s' }}>
          <button onClick={() => { audio.uiClick(); onRestart(); }}
            className="title-skew bg-[#ffd400] px-8 py-3" style={{ boxShadow: '6px 6px 0 #000' }}>
            <span className="hud-big text-[26px] text-black">RUN IT BACK</span>
          </button>
          <button onClick={() => { audio.uiClick(); onMenu(); }}
            className="title-skew border-2 border-white/40 px-8 py-3" style={{ boxShadow: '6px 6px 0 #000' }}>
            <span className="hud-big text-[26px] text-white/80">MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Loading({ pct }: { pct: number }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#06070a]">
      <div className="hud-big text-[42px] text-[#ffd400]" style={{ textShadow: '0 5px 0 #000' }}>CARVING THE MOUNTAIN…</div>
      <div className="mt-4 h-[8px] w-[320px] border border-white/25 bg-black">
        <div className="h-full bg-gradient-to-r from-[#2fe6c8] to-[#ff2e88] transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
