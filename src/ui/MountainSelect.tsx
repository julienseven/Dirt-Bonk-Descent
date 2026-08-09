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
              return (
                <button key={m.id}
                  disabled={locked}
                  onClick={() => { audio.uiClick(); onPick(m.id); }}
                  className="group relative overflow-hidden border-2 p-4 text-left transition-all"
                  style={{
                    borderColor: locked ? 'rgba(255,255,255,.12)' : cur ? m.tint : 'rgba(255,255,255,.22)',
                    background: cur ? `${m.tint}18` : 'rgba(0,0,0,.5)',
                    opacity: locked ? 0.5 : 1,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    transform: cur ? 'translateY(-3px)' : 'none',
                    boxShadow: cur ? `0 6px 0 rgba(0,0,0,.7), 0 0 30px ${m.tint}44` : '0 4px 0 rgba(0,0,0,.6)',
                  }}>
                  {/* rating chevrons */}
                  <div className="flex items-center gap-[3px]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="text-[13px] font-black"
                        style={{ color: i < m.rating ? m.tint : 'rgba(255,255,255,.14)' }}>▲</span>
                    ))}
                    {locked && (
                      <span className="hud-label ml-auto !text-[8px] text-[#ff6a6a]">
                        LEVEL {m.reqLevel}
                      </span>
                    )}
                  </div>

                  <div className="hud-big mt-2 text-[24px] leading-none text-white">{m.name}</div>
                  <div className="hud-label !text-[8px]" style={{ color: m.tint }}>{m.sub}</div>
                  <p className="mt-2 min-h-[46px] text-[11px] leading-snug text-white/50">{m.blurb}</p>

                  <div className="mt-2 flex items-end justify-between border-t border-white/12 pt-2">
                    <div>
                      <div className="hud-label !text-[8px]">LENGTH</div>
                      <div className="hud-big text-[17px] leading-none text-white/85">
                        {(m.length / 1000).toFixed(1)}km
                      </div>
                    </div>
                    <div>
                      <div className="hud-label !text-[8px]">EST.</div>
                      <div className="hud-big text-[17px] leading-none text-white/85">
                        ~{formatTime(estimateTime(m)).slice(0, 4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="hud-label !text-[8px]">YOUR BEST</div>
                      <div className="hud-big text-[17px] leading-none"
                        style={{ color: best ? '#7ef7ff' : 'rgba(255,255,255,.3)' }}>
                        {best ? formatTime(best) : '—'}
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
