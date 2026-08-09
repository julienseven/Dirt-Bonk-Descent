import { useEffect, useState } from 'react';
import { Track } from '../game/track';
import { fullReport, type DiffReport } from '../game/tune';
import { formatTime } from '../game/core';

const SKILL_LABEL: Record<string, string> = {
  '0.45': 'CASUAL',
  '0.65': 'DECENT',
  '0.85': 'GOOD',
  '1': 'EXPERT',
};

/** Is this row healthy for its difficulty? */
function verdict(d: string, skill: number, win: number): { txt: string; ok: boolean } {
  if (d === 'chill') {
    if (skill >= 0.65 && win < 0.5) return { txt: 'TOO HARD', ok: false };
    if (skill <= 0.45 && win > 0.9) return { txt: 'TOO EASY', ok: false };
  }
  if (d === 'pro') {
    if (skill >= 0.85 && win < 0.35) return { txt: 'TOO HARD', ok: false };
    if (skill <= 0.45 && win > 0.6) return { txt: 'TOO EASY', ok: false };
  }
  if (d === 'savage') {
    if (skill >= 1 && win < 0.15) return { txt: 'UNBEATABLE', ok: false };
    if (skill <= 0.65 && win > 0.5) return { txt: 'TOO EASY', ok: false };
  }
  return { txt: 'OK', ok: true };
}

export default function TunePanel() {
  const [data, setData] = useState<{ diff: string; rows: DiffReport[] }[] | null>(null);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    // build the same course the game uses, then race it many times headless
    const trk = new Track(20260114);
    const r = fullReport(trk);
    setMs(performance.now() - t0);
    setData(r);
  }, []);

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-[#06070a] p-6"
      style={{ touchAction: 'pan-y' }}>
      <h1 className="hud-big text-[34px] text-[#ffd400]">TUNING HARNESS</h1>
      <p className="mt-1 max-w-2xl text-[13px] leading-snug text-white/60">
        Headless simulation of the longitudinal race model — same track, same drag,
        same AI decisions, no rendering. Tricks, bonks and crashes are excluded so
        this reads purely on speed balance. 6 runs per skill level.
      </p>
      {!data && <div className="hud-big mt-8 text-[20px] text-white/70">SIMULATING…</div>}
      {data && (
        <>
          <div className="mt-2 text-[11px] text-white/40">
            {ms.toFixed(0)}ms · target: CASUAL should struggle on savage, EXPERT should
            win most on chill, PRO should be near 50% for GOOD.
          </div>
          {data.map(block => (
            <div key={block.diff} className="mt-6">
              <div className="hud-big text-[22px] text-white">{block.diff.toUpperCase()}</div>
              <table className="mt-2 w-full max-w-4xl border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-white/45">
                    {['PLAYER', 'WIN %', 'AVG PLACE', 'PLAYER TIME', 'BEST RIVAL', 'MARGIN', ''].map(h => (
                      <th key={h} className="border-b border-white/15 py-1 pr-4 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map(r => {
                    const v = verdict(block.diff, r.skill, r.winRate);
                    return (
                      <tr key={r.skill} className="text-white/85">
                        <td className="border-b border-white/8 py-1 pr-4">
                          {SKILL_LABEL[String(r.skill)] ?? r.skill}
                        </td>
                        <td className="border-b border-white/8 py-1 pr-4"
                          style={{ color: r.winRate > 0.6 ? '#7ef7c8' : r.winRate < 0.2 ? '#ff6a6a' : '#ffd400' }}>
                          {(r.winRate * 100).toFixed(0)}%
                        </td>
                        <td className="border-b border-white/8 py-1 pr-4">{r.avgPlace.toFixed(1)}</td>
                        <td className="border-b border-white/8 py-1 pr-4">{formatTime(r.playerTime)}</td>
                        <td className="border-b border-white/8 py-1 pr-4">{formatTime(r.fieldBest)}</td>
                        <td className="border-b border-white/8 py-1 pr-4"
                          style={{ color: r.margin < 0 ? '#7ef7c8' : '#ff6a6a' }}>
                          {r.margin >= 0 ? '+' : ''}{r.margin.toFixed(1)}s
                        </td>
                        <td className="border-b border-white/8 py-1 pr-4"
                          style={{ color: v.ok ? '#7ef7c8' : '#ff6a6a' }}>{v.txt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div className="mt-8 text-[12px] text-white/40">
            Remove <code className="text-[#ffd400]">?tune</code> from the URL to play.
          </div>
        </>
      )}
    </div>
  );
}
