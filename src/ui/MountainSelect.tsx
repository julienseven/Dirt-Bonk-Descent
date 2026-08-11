import { MOUNTAINS, estimateTime, levelFromXp } from '../game/mountains';
import { formatTime } from '../game/core';
import { audio } from '../game/audio';
import type { SaveData } from '../game/save';

export default function MountainSelect({
  save, onPick, onClose,
}: {
  save: SaveData;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { level, into, need } = levelFromXp(save.xp);

  return (
    <div className="screen-pad absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(8,12,18,.86) 0%, rgba(4,5,8,.96) 70%)' }}>
      <div className="scan pointer-events-none absolute inset-0 opacity-40" />
      <div className="screen-scroll relative max-h-full w-full px-6 py-5">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="title-skew inline-block bg-[#ffd400] px-4 py-[3px]">
                <span className="hud-label !text-[10px] !tracking-[.4em] !text-black">CHOOSE YOUR DESCENT</span>
              </div>
              <h2 className="hud-big compact-title mt-1 text-[clamp(38px,7vw,78px)] leading-[0.85] text-white"
                style={{ textShadow: '0 6px 0 #ff2e88' }}>THE MOUNTAINS</h2>
              <p className="mt-1 max-w-md text-[11px] leading-snug text-white/45">
                Five different worlds. Same rules. Pick a mountain and drop in.
              </p>
            </div>
            <div className="ml-auto text-right">
              <div className="hud-label !text-[8px]">RIDER LEVEL</div>
              <div className="hud-big text-[34px] leading-none text-[#2fe6c8]">{level}</div>
              <div className="mt-1 h-[6px] w-[130px] border border-white/25 bg-black/60">
                <div className="h-full bg-gradient-to-r from-[#2fe6c8] to-[#ffd400]"
                  style={{ width: `${Math.min(100, (into / need) * 100)}%` }} />
              </div>
              <div className="hud-label mt-[3px] !text-[8px]">{into} / {need} XP</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MOUNTAINS.map(m => {
              const locked = level < m.reqLevel;
              const best = save.mountainBest[m.id];
              const cur = save.mountain === m.id;
              const [skyTop, skyMid, skyBot] = m.cardSky;
              return (
                <button key={m.id}
                  disabled={locked}
                  onClick={() => { audio.uiClick(); onPick(m.id); }}
                  className="group relative overflow-hidden border-2 text-left transition-all"
                  style={{
                    borderColor: locked ? 'rgba(255,255,255,.12)' : cur ? m.tint : 'rgba(255,255,255,.22)',
                    background: 'rgba(0,0,0,.55)',
                    opacity: locked ? 0.5 : 1,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    transform: cur ? 'translateY(-3px)' : 'none',
                    boxShadow: cur
                      ? `0 6px 0 rgba(0,0,0,.7), 0 0 36px ${m.tint}55`
                      : '0 4px 0 rgba(0,0,0,.6)',
                  }}>
                  {/* theme sky strip — each mountain is recognisable from colour alone */}
                  <div className="relative h-[52px] w-full overflow-hidden"
                    style={{
                      background: `linear-gradient(180deg, ${skyTop} 0%, ${skyMid} 55%, ${skyBot} 100%)`,
                    }}>
                    {/* silhouette ridge */}
                    <svg className="absolute inset-x-0 bottom-0 h-[28px] w-full opacity-80"
                      viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden>
                      <path
                        d={ridgePath(m.id)}
                        fill="rgba(0,0,0,.45)"
                      />
                    </svg>
                    <div className="absolute left-2 top-1.5 flex items-center gap-1.5">
                      <span className="hud-label !text-[8px] !tracking-[.25em] px-1.5 py-[1px]"
                        style={{
                          background: m.tint,
                          color: '#0a0a0c',
                        }}>
                        {m.themeLabel}
                      </span>
                      {cur && (
                        <span className="hud-label !text-[8px] text-white/90"
                          style={{ textShadow: '0 1px 0 #000' }}>SELECTED</span>
                      )}
                    </div>
                    <div className="absolute bottom-1 right-2 hud-label !text-[8px] text-white/80"
                      style={{ textShadow: '0 1px 2px #000' }}>
                      {m.feel}
                    </div>
                  </div>

                  <div className="p-3.5 pt-3">
                    {/* rating chevrons */}
                    <div className="flex items-center gap-[3px]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className="text-[12px] font-black"
                          style={{ color: i < m.rating ? m.tint : 'rgba(255,255,255,.14)' }}>▲</span>
                      ))}
                      {locked && (
                        <span className="hud-label ml-auto !text-[8px] text-[#ff6a6a]">
                          LEVEL {m.reqLevel}
                        </span>
                      )}
                    </div>

                    <div className="hud-big mt-1.5 text-[22px] leading-none text-white">{m.name}</div>
                    <div className="hud-label !text-[8px]" style={{ color: m.tint }}>{m.sub}</div>
                    <p className="mt-1.5 min-h-[40px] text-[11px] leading-snug text-white/50">{m.blurb}</p>

                    <div className="mt-2 flex items-end justify-between border-t border-white/12 pt-2">
                      <div>
                        <div className="hud-label !text-[8px]">LENGTH</div>
                        <div className="hud-big text-[16px] leading-none text-white/85">
                          {(m.length / 1000).toFixed(1)}km
                        </div>
                      </div>
                      <div>
                        <div className="hud-label !text-[8px]">EST.</div>
                        <div className="hud-big text-[16px] leading-none text-white/85">
                          ~{formatTime(estimateTime(m)).slice(0, 4)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="hud-label !text-[8px]">YOUR BEST</div>
                        <div className="hud-big text-[16px] leading-none"
                          style={{ color: best ? '#7ef7ff' : 'rgba(255,255,255,.3)' }}>
                          {best ? formatTime(best) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={() => { audio.uiClick(); onClose(); }}
              className="title-skew border-2 border-white/35 px-7 py-2"
              style={{ boxShadow: '5px 5px 0 #000' }}>
              <span className="hud-big text-[20px] text-white/80">BACK</span>
            </button>
            <div className="hud-label self-center !text-[9px] text-white/35">
              Win races, stomp tricks and poach shortcuts to level up and open the rest of the range.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stable per-mountain ridge silhouette for the card sky strip. */
function ridgePath(id: string): string {
  // hand-tuned peaks so each card reads as a different skyline
  const paths: Record<string, string> = {
    shaleback: 'M0,40 L0,28 L18,18 L32,24 L48,10 L62,20 L80,8 L98,16 L120,6 L145,18 L168,12 L200,22 L200,40 Z',
    cinder: 'M0,40 L0,30 L25,8 L40,22 L55,4 L70,18 L95,2 L110,16 L140,6 L160,20 L180,10 L200,24 L200,40 Z',
    thornwood: 'M0,40 L0,26 L20,22 L40,18 L60,20 L80,14 L100,18 L120,12 L140,16 L160,14 L180,18 L200,16 L200,40 Z',
    ironjaw: 'M0,40 L0,24 L15,20 L30,6 L45,22 L60,4 L80,18 L100,2 L120,16 L140,5 L160,20 L180,8 L200,18 L200,40 Z',
    lastlight: 'M0,40 L0,30 L30,22 L50,12 L70,20 L90,6 L110,14 L130,4 L150,16 L170,8 L200,20 L200,40 Z',
    redrock: 'M0,40 L0,28 L25,16 L45,24 L70,10 L95,20 L120,8 L150,18 L175,12 L200,22 L200,40 Z',
  };
  return paths[id] ?? paths.shaleback;
}
