import { useEffect, useMemo, useRef, useState } from 'react';
import { GarageScene, PREVIEW_LIST, type PreviewAnim } from '../game/garageScene';
import {
  RIDERS, BIKES, UPGRADES, MAX_LEVEL, STAT_KEYS, STAT_LABEL,
  FRAME_COLORS, JERSEY_COLORS, ACCENT_COLORS,
  computeStats, getBike, getRider, levelOf, upgradeCost,
  type Loadout, type Stats,
} from '../game/garage';
import { audio } from '../game/audio';

type Tab = 'rider' | 'bike' | 'tune' | 'paint';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rider', label: 'RIDER' },
  { id: 'bike', label: 'BIKE' },
  { id: 'tune', label: 'UPGRADE' },
  { id: 'paint', label: 'PAINT' },
];

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function StatBar({ k, v, delta }: { k: keyof Stats; v: number; delta?: number }) {
  const pct = Math.max(2, Math.min(100, v));
  const up = (delta ?? 0) > 0.5, down = (delta ?? 0) < -0.5;
  return (
    <div className="mb-[7px]">
      <div className="flex items-baseline justify-between">
        <span className="hud-label !tracking-[.1em] !text-[9px]">{STAT_LABEL[k]}</span>
        <span className="hud-mono text-[11px]" style={{ color: up ? '#7ef7c8' : down ? '#ff6a6a' : 'rgba(255,255,255,.75)' }}>
          {Math.round(v)}{delta ? (up ? ` ▲${Math.round(delta)}` : down ? ` ▼${Math.round(-delta)}` : '') : ''}
        </span>
      </div>
      <div className="mt-[3px] h-[7px] w-full overflow-hidden rounded-[2px] border border-black/60 bg-black/55">
        <div className="h-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: up
              ? 'linear-gradient(90deg,#2fe6c8,#7ef7c8)'
              : down
                ? 'linear-gradient(90deg,#8a2b2b,#ff6a6a)'
                : 'linear-gradient(90deg,#2fe6c8,#ffd400)',
          }} />
      </div>
    </div>
  );
}

function Card({ on, locked, onClick, children }: {
  on: boolean; locked?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => { if (!locked) { audio.uiMove(); onClick(); } }}
      className="relative block w-full border-2 px-3 py-2 text-left transition-all"
      style={{
        borderColor: on ? '#ffd400' : 'rgba(255,255,255,.14)',
        background: on ? 'rgba(255,212,0,.10)' : 'rgba(0,0,0,.42)',
        transform: on ? 'translateX(4px)' : 'none',
        opacity: locked ? 0.55 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function Garage({
  loadout, coins, onChange, onBuy, onClose, reducedMotion,
}: {
  loadout: Loadout;
  coins: number;
  onChange: (l: Loadout) => void;
  onBuy: (cost: number, l: Loadout) => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<GarageScene | null>(null);
  const [tab, setTab] = useState<Tab>('rider');
  const [anim, setAnim] = useState<PreviewAnim>('idle');
  const [hover, setHover] = useState<Stats | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const s = new GarageScene(host.current);
    s.reducedMotion = reducedMotion;
    scene.current = s;
    return () => { s.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setLoadout(loadout); }, [loadout]);
  useEffect(() => { scene.current?.setAnim(anim); }, [anim]);

  const stats = useMemo(() => computeStats(loadout), [loadout]);
  const bike = getBike(loadout.bike);
  const rider = getRider(loadout.rider);

  const set = (p: Partial<Loadout>) => onChange({ ...loadout, ...p });

  const buyBike = (id: string, price: number) => {
    if (loadout.owned.includes(id)) { audio.uiClick(); set({ bike: id }); return; }
    if (coins < price) { audio.hitTaken(0.4); return; }
    audio.chime(6);
    onBuy(price, { ...loadout, bike: id, owned: [...loadout.owned, id] });
  };

  const buyUpgrade = (stat: keyof Stats) => {
    const lvl = levelOf(loadout, bike.id, stat);
    const cost = upgradeCost(stat, lvl);
    if (cost === null || coins < cost) { audio.hitTaken(0.4); return; }
    audio.chime(4);
    const levels = { ...loadout.levels };
    levels[bike.id] = { ...(levels[bike.id] ?? {}), [stat]: lvl + 1 };
    onBuy(cost, { ...loadout, levels });
  };

  // preview stats for whatever the pointer is over
  const previewFor = (l: Loadout) => setHover(computeStats(l));
  const shown = hover ?? stats;
  const delta = (k: keyof Stats) => (hover ? hover[k] - stats[k] : 0);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#06070a]">
      {/* header */}
      <div className="flex shrink-0 items-center gap-4 border-b-2 border-[#ffd400]/40 px-5 py-3">
        <span className="title-skew bg-[#ffd400] px-4 py-1">
          <span className="hud-big text-[22px] text-black">GARAGE</span>
        </span>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="hud-label !text-[8px]">SCRAP</div>
            <div className="hud-big text-[22px] leading-none text-[#ffd400]">
              {coins.toLocaleString()}
            </div>
          </div>
          <button onClick={() => { audio.uiClick(); onClose(); }}
            className="title-skew border-2 border-white/35 px-5 py-2 transition-colors hover:border-[#ff2e88]">
            <span className="hud-big text-[16px] text-white">DONE</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---- viewport ---- */}
        <div className="relative min-h-[240px] flex-1 lg:min-h-0">
          <div ref={host} className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 50% 62%, #14202e 0%, #080a10 62%, #06070a 100%)' }} />
          <div className="pointer-events-none absolute left-4 top-3">
            <div className="hud-big text-[26px] leading-none text-white">{bike.name}</div>
            <div className="hud-label mt-[2px] !text-[9px] text-[#2fe6c8]">{bike.klass} · {rider.name}</div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <span className="hud-label !text-[8px]">DRAG TO SPIN · SCROLL TO ZOOM</span>
          </div>

          {/* animation previews */}
          <div className="absolute bottom-10 left-1/2 flex max-w-[92%] -translate-x-1/2 flex-wrap justify-center gap-[5px]">
            {PREVIEW_LIST.map(p => (
              <button key={p.id}
                onClick={() => { audio.uiMove(); setAnim(p.id); }}
                className="border px-[9px] py-[3px] text-[9px] font-black tracking-[.14em] transition-colors"
                style={{
                  borderColor: anim === p.id ? '#2fe6c8' : 'rgba(255,255,255,.2)',
                  background: anim === p.id ? 'rgba(47,230,200,.18)' : 'rgba(0,0,0,.5)',
                  color: anim === p.id ? '#2fe6c8' : 'rgba(255,255,255,.55)',
                  backdropFilter: 'blur(3px)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- panel ---- */}
        <div className="flex w-full shrink-0 flex-col border-t-2 border-white/10 lg:w-[430px] lg:border-l-2 lg:border-t-0">
          <div className="flex shrink-0 border-b border-white/10">
            {TABS.map(t => (
              <button key={t.id}
                onClick={() => { audio.uiMove(); setTab(t.id); setHover(null); }}
                className="flex-1 py-[9px] text-[11px] font-black tracking-[.18em] transition-colors"
                style={{
                  color: tab === t.id ? '#ffd400' : 'rgba(255,255,255,.42)',
                  borderBottom: tab === t.id ? '3px solid #ffd400' : '3px solid transparent',
                  background: tab === t.id ? 'rgba(255,212,0,.07)' : 'transparent',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}
            onPointerLeave={() => setHover(null)}>
            {tab === 'rider' && RIDERS.map(r => (
              <div key={r.id} className="mb-[6px]"
                onPointerEnter={() => previewFor({ ...loadout, rider: r.id })}>
                <Card on={loadout.rider === r.id} onClick={() => set({ rider: r.id })}>
                  <div className="flex items-center gap-3">
                    <span className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-black/50"
                      style={{ background: hex(r.helmet) }} />
                    <div className="min-w-0">
                      <div className="hud-big text-[16px] leading-none text-white">{r.name}</div>
                      <div className="hud-label !text-[8px] text-[#ff2e88]">{r.tag}</div>
                    </div>
                  </div>
                  <p className="mt-[6px] text-[11px] leading-snug text-white/50">{r.blurb}</p>
                </Card>
              </div>
            ))}

            {tab === 'bike' && BIKES.map(b => {
              const owned = loadout.owned.includes(b.id);
              const afford = coins >= b.price;
              return (
                <div key={b.id} className="mb-[6px]"
                  onPointerEnter={() => previewFor({ ...loadout, bike: b.id })}>
                  <Card on={loadout.bike === b.id} locked={!owned && !afford}
                    onClick={() => buyBike(b.id, b.price)}>
                    <div className="flex items-center gap-3">
                      <span className="h-[26px] w-[26px] shrink-0 rounded-[4px] border-2 border-black/50"
                        style={{ background: hex(b.frame) }} />
                      <div className="min-w-0 flex-1">
                        <div className="hud-big text-[16px] leading-none text-white">{b.name}</div>
                        <div className="hud-label !text-[8px] text-[#2fe6c8]">{b.klass}</div>
                      </div>
                      {owned
                        ? <span className="hud-label !text-[8px] text-[#7ef7c8]">OWNED</span>
                        : <span className="hud-big text-[14px]"
                          style={{ color: afford ? '#ffd400' : '#ff6a6a' }}>{b.price}</span>}
                    </div>
                    <p className="mt-[6px] text-[11px] leading-snug text-white/50">{b.blurb}</p>
                  </Card>
                </div>
              );
            })}

            {tab === 'tune' && (
              <>
                <div className="mb-3 text-[11px] leading-snug text-white/45">
                  Upgrades are fitted to <span className="text-[#ffd400]">{bike.name}</span> and stay with it.
                </div>
                {UPGRADES.map(u => {
                  const lvl = levelOf(loadout, bike.id, u.id);
                  const cost = upgradeCost(u.id, lvl);
                  const afford = cost !== null && coins >= cost;
                  return (
                    <div key={u.id} className="mb-[7px] border-2 border-white/12 bg-black/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="hud-big text-[14px] leading-none text-white">{u.name}</div>
                          <div className="hud-label !text-[8px] text-[#2fe6c8]">{u.part}</div>
                        </div>
                        <div className="flex gap-[3px]">
                          {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                            <span key={i} className="h-[16px] w-[9px] rounded-[1px] border border-black/60"
                              style={{ background: i < lvl ? '#ffd400' : 'rgba(255,255,255,.12)' }} />
                          ))}
                        </div>
                        <button
                          onClick={() => buyUpgrade(u.id)}
                          disabled={cost === null || !afford}
                          className="ml-1 shrink-0 border-2 px-2 py-[5px] transition-colors"
                          style={{
                            borderColor: cost === null ? 'rgba(126,247,200,.5)'
                              : afford ? '#ffd400' : 'rgba(255,255,255,.14)',
                            color: cost === null ? '#7ef7c8' : afford ? '#ffd400' : 'rgba(255,255,255,.3)',
                            cursor: cost === null || !afford ? 'not-allowed' : 'pointer',
                          }}>
                          <span className="hud-big text-[12px]">{cost === null ? 'MAX' : cost}</span>
                        </button>
                      </div>
                      <p className="mt-[5px] text-[10px] leading-snug text-white/40">{u.desc}</p>
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'paint' && (
              <>
                {([['FRAME', FRAME_COLORS, loadout.frame, (id: string) => set({ frame: id })],
                   ['JERSEY', JERSEY_COLORS, loadout.jersey, (id: string) => set({ jersey: id })],
                   ['ACCENT', ACCENT_COLORS, loadout.accent, (id: string) => set({ accent: id })],
                  ] as const).map(([label, list, cur, fn]) => (
                  <div key={label} className="mb-4">
                    <div className="hud-label mb-2">{label}</div>
                    <div className="flex flex-wrap gap-2">
                      {list.map(sw => (
                        <button key={sw.id}
                          onClick={() => { audio.uiMove(); fn(sw.id); }}
                          title={sw.name}
                          className="h-[36px] w-[36px] rounded-[4px] border-2 transition-transform"
                          style={{
                            background: sw.hex === 0
                              ? 'repeating-linear-gradient(45deg,#333 0 6px,#555 6px 12px)'
                              : hex(sw.hex),
                            borderColor: cur === sw.id ? '#ffd400' : 'rgba(0,0,0,.6)',
                            transform: cur === sw.id ? 'scale(1.14)' : 'none',
                            boxShadow: cur === sw.id ? '0 0 14px #ffd40088' : 'none',
                          }} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* stats always visible */}
          <div className="shrink-0 border-t-2 border-white/10 bg-black/55 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="hud-label">PERFORMANCE</span>
              {hover && <span className="hud-label !text-[8px] text-[#ffd400]">PREVIEW</span>}
            </div>
            {STAT_KEYS.map(k => (
              <StatBar key={k} k={k} v={shown[k]} delta={delta(k)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
