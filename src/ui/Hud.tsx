import { useEffect, useRef } from 'react';
import type { Game } from '../game/game';
import { formatTime } from '../game/core';

const PLACE = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

/** colour per bonk type, matching the resolver's palette */
const BONK_TINT: Record<string, string> = {
  'SIDE BONK': '#ffd400', 'FRONT BONK': '#ff9500', 'REAR BONK': '#7ef7ff',
  'WALL BONK': '#ff6a00', 'DOUBLE BONK': '#c0f000', 'MEGA BONK': '#ff2e88',
};

/** colour per state, so transitions are readable at a glance */
const STATE_TINT: Record<string, string> = {
  GROUNDED: '#cfd6e0', ACCELERATING: '#7ef7c8', BRAKING: '#ff9500',
  DRIFTING: '#7ef7ff', AIRBORNE: '#9fd0ff', TRICKING: '#ff2e88',
  LANDING: '#ffd400', BOOSTING: '#ff4de3', CRASHING: '#ff4d4d',
  STUNNED: '#ff6a6a', RECOVERING: '#c0f000', FINISHED: '#ffffff',
};

export default function Hud({ game }: { game: Game }) {
  const root = useRef<HTMLDivElement>(null);
  const speedNum = useRef<HTMLDivElement>(null);
  const speedArc = useRef<SVGCircleElement>(null);
  const placeNum = useRef<HTMLDivElement>(null);
  const timeTxt = useRef<HTMLDivElement>(null);
  const scoreTxt = useRef<HTMLDivElement>(null);
  const comboWrap = useRef<HTMLDivElement>(null);
  const comboNum = useRef<HTMLDivElement>(null);
  const comboBar = useRef<HTMLDivElement>(null);
  const boostFill = useRef<HTMLDivElement>(null);
  const pumpRing = useRef<HTMLDivElement>(null);
  const bonkTag = useRef<HTMLDivElement>(null);
  const boostWrap = useRef<HTMLDivElement>(null);
  const boostRdy = useRef<HTMLDivElement>(null);
  const trackBar = useRef<HTMLDivElement>(null);
  const pips = useRef<(HTMLDivElement | null)[]>([]);
  const zoneWrap = useRef<HTMLDivElement>(null);
  const zoneName = useRef<HTMLDivElement>(null);
  const zoneSub = useRef<HTMLDivElement>(null);
  const trickTxt = useRef<HTMLDivElement>(null);
  const airBar = useRef<HTMLDivElement>(null);
  const countTxt = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const vign = useRef<HTMLDivElement>(null);
  const offTxt = useRef<HTMLDivElement>(null);
  const draftTxt = useRef<HTMLDivElement>(null);
  const boostGrade = useRef<HTMLDivElement>(null);
  const hazWrap = useRef<HTMLDivElement>(null);
  const hazArrow = useRef<HTMLDivElement>(null);
  const hazEdge = useRef<HTMLDivElement>(null);
  const introWrap = useRef<HTMLDivElement>(null);
  const introLine = useRef<HTMLDivElement>(null);
  const introSub = useRef<HTMLDivElement>(null);
  const barTop = useRef<HTMLDivElement>(null);
  const barBot = useRef<HTMLDivElement>(null);
  const reactWrap = useRef<HTMLDivElement>(null);
  const reactBar = useRef<HTMLDivElement>(null);
  const dbgWrap = useRef<HTMLDivElement>(null);
  const dbgState = useRef<HTMLDivElement>(null);
  const dbgT = useRef<HTMLDivElement>(null);
  const dbgLog = useRef<HTMLDivElement>(null);
  const splitTxt = useRef<HTMLDivElement>(null);
  const ghostTxt = useRef<HTMLDivElement>(null);
  const stretchBar = useRef<HTMLDivElement>(null);
  const recWrap = useRef<HTMLDivElement>(null);
  const recBar = useRef<HTMLDivElement>(null);
  const recKey = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastCount = '';
    const C = 2 * Math.PI * 62;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const h = game.hud;

      // ---- cold open overlay (drawn even though the race HUD is hidden)
      const intro = h.phase === 'intro';
      if (introWrap.current) {
        introWrap.current.style.opacity = intro ? '1' : '0';
        introWrap.current.style.pointerEvents = 'none';
      }
      if (intro) {
        // letterbox slides in, then retracts as the racers launch
        const bars = Math.min(h.introFade, 1) * (h.introLine === 'SEND IT.' ? 0.35 : 1);
        if (barTop.current) barTop.current.style.height = `${bars * 11}vh`;
        if (barBot.current) barBot.current.style.height = `${bars * 11}vh`;
        if (introLine.current && introLine.current.textContent !== h.introLine) {
          introLine.current.textContent = h.introLine;
          if (h.introLine) {
            introLine.current.animate(
              [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
              { duration: 380, easing: 'cubic-bezier(.15,1.5,.4,1)' });
          }
        }
        if (introLine.current) {
          const send = h.introLine === 'SEND IT.';
          introLine.current.style.fontSize = send ? 'clamp(46px,11vw,140px)' : 'clamp(60px,13vw,170px)';
          introLine.current.style.color = send ? '#c0f000' : '#ffffff';
        }
        if (introSub.current && introSub.current.textContent !== h.introSub) {
          introSub.current.textContent = h.introSub;
        }
        if (introSub.current) introSub.current.style.opacity = h.introSub ? '1' : '0';
        // reaction window
        const rw = h.reactWindow;
        if (reactWrap.current) {
          reactWrap.current.style.opacity = rw > 0 && !h.holeshot ? '1' : '0';
        }
        if (reactBar.current) reactBar.current.style.width = `${rw * 100}%`;
      }

      const racing = h.phase === 'race' || h.phase === 'countdown' || h.phase === 'paused';
      if (root.current) root.current.style.opacity = racing || h.phase === 'finish' ? '1' : '0';
      if (!racing && h.phase !== 'finish') return;

      const kph = Math.max(0, h.speed);
      if (speedNum.current) speedNum.current.textContent = String(Math.round(kph));
      if (speedArc.current) {
        const f = Math.min(1, kph / 175);
        speedArc.current.style.strokeDasharray = `${f * C * 0.75} ${C}`;
        speedArc.current.style.stroke = h.boosting ? '#ff4de3' : kph > 130 ? '#ffd400' : '#2fe6c8';
      }
      if (placeNum.current && placeNum.current.textContent !== PLACE[h.place]) {
        placeNum.current.textContent = PLACE[h.place] || '—';
        placeNum.current.animate(
          [{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
          { duration: 240, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      }
      if (timeTxt.current) timeTxt.current.textContent = formatTime(h.time);
      if (scoreTxt.current) scoreTxt.current.textContent = Math.round(h.score).toLocaleString();

      if (comboWrap.current) {
        const on = h.combo > 1;
        comboWrap.current.style.opacity = on ? '1' : '0';
        comboWrap.current.style.transform = `translateY(${on ? 0 : -10}px) scale(${on ? 1 : 0.9})`;
      }
      // last bonk type, under the combo counter
      if (bonkTag.current) {
        const on = h.lastBonkT > 0;
        bonkTag.current.style.opacity = on ? String(Math.min(1, h.lastBonkT)) : '0';
        if (on && bonkTag.current.textContent !== h.lastBonk) {
          bonkTag.current.textContent = h.lastBonk;
          bonkTag.current.style.color = BONK_TINT[h.lastBonk] ?? '#ffd400';
          bonkTag.current.animate(
            [{ transform: 'scale(1.4) skewX(-10deg)' }, { transform: 'scale(1) skewX(-10deg)' }],
            { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        }
      }
      if (comboNum.current) comboNum.current.textContent = `${h.combo}x`;
      if (comboBar.current) comboBar.current.style.width = `${h.comboTime * 100}%`;

      // pump charge rides alongside the boost gauge
      if (pumpRing.current) {
        pumpRing.current.style.opacity = h.pumpArmed > 0.04 ? '1' : '0';
        pumpRing.current.style.height = `${Math.min(100, h.pumpArmed * 100)}%`;
      }
      if (boostFill.current) boostFill.current.style.height = `${h.boost}%`;
      if (boostWrap.current) boostWrap.current.style.filter = h.boosting ? 'drop-shadow(0 0 14px #ff4de3)' : 'none';
      if (boostRdy.current) boostRdy.current.style.opacity = h.boost > 25 && !h.boosting ? '1' : '0';
      if (boostGrade.current) boostGrade.current.style.opacity = h.boosting ? '1' : '0';

      for (let i = 0; i < h.rivals.length; i++) {
        const el = pips.current[i];
        const r = h.rivals[i];
        if (!el || !r) continue;
        el.style.top = `${r.progress * 100}%`;
        el.style.background = r.color;
        el.style.zIndex = r.name === 'YOU' ? '3' : '1';
      }
      if (trackBar.current) trackBar.current.style.setProperty('--p', `${h.progress * 100}%`);

      if (zoneWrap.current) {
        const a = Math.min(1, h.zoneFlash * 2.2);
        zoneWrap.current.style.opacity = String(a);
        zoneWrap.current.style.transform = `translateX(${(1 - a) * -40}px) skewX(-9deg)`;
      }
      if (zoneName.current && zoneName.current.textContent !== h.zone) zoneName.current.textContent = h.zone;
      if (zoneSub.current && zoneSub.current.textContent !== h.zoneSub) zoneSub.current.textContent = h.zoneSub;

      if (trickTxt.current) {
        trickTxt.current.textContent = h.trickText;
        trickTxt.current.style.opacity = h.trickText ? '1' : '0';
      }
      if (airBar.current) {
        airBar.current.style.opacity = h.airTime > 0.25 ? '1' : '0';
        airBar.current.style.width = `${Math.min(1, h.airTime / 2.4) * 100}%`;
      }

      if (countTxt.current) {
        if (h.countLabel !== lastCount) {
          lastCount = h.countLabel;
          countTxt.current.textContent = h.countLabel;
          if (h.countLabel) {
            countTxt.current.animate(
              [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.05)', opacity: 0.9 }],
              { duration: 640, easing: 'cubic-bezier(.15,1.5,.4,1)' });
          }
        }
        countTxt.current.style.opacity = h.phase === 'countdown' ? '1' : '0';
      }

      // reduced motion tones down the full-screen effects that drive nausea
      const rm = h.reducedMotion;
      const sp01 = Math.min(1, Math.max(0, (kph - 62) / 100)) * (rm ? 0.25 : 1);
      if (lines.current) {
        lines.current.style.opacity = rm ? '0' : String(sp01 * (h.boosting ? 1 : 0.72));
        lines.current.style.animationDuration = `${Math.max(0.12, 0.5 - sp01 * 0.38)}s`;
      }
      if (vign.current) vign.current.style.opacity = String(0.32 + sp01 * 0.42 + (h.crashed > 0 ? 0.3 : 0));
      if (flash.current) {
        flash.current.style.opacity = String(h.hitFlash * (rm ? 0.18 : 0.5));
        flash.current.style.background = h.crashed > 0
          ? 'radial-gradient(circle at 50% 55%, rgba(255,40,40,0.0) 30%, rgba(255,30,30,0.65) 100%)'
          : 'radial-gradient(circle at 50% 55%, rgba(255,255,255,0.0) 20%, rgba(255,220,90,0.6) 100%)';
      }
      if (offTxt.current) offTxt.current.style.opacity = h.offTrack && h.phase === 'race' ? '1' : '0';
      if (draftTxt.current) draftTxt.current.style.opacity = h.drafting ? '1' : '0';

      // state machine debug readout
      if (dbgWrap.current) {
        const on = game.debugStates;
        dbgWrap.current.style.display = on ? 'block' : 'none';
        if (on) {
          if (dbgState.current && dbgState.current.textContent !== h.state) {
            dbgState.current.textContent = h.state;
            dbgState.current.style.color = STATE_TINT[h.state] ?? '#ffffff';
          }
          if (dbgT.current) dbgT.current.textContent = `${h.stateLabel}  ${h.stateT.toFixed(2)}s`;
          if (dbgLog.current) {
            const txt = h.transitions
              .slice().reverse()
              .map(x => `${x.t.toFixed(2)}  ${x.from} → ${x.to}`).join('\n');
            if (dbgLog.current.textContent !== txt) dbgLog.current.textContent = txt;
          }
        }
      }

      // split delta vs personal best
      if (splitTxt.current) {
        const show = h.splitShow > 0 && h.splitHasPb;
        splitTxt.current.style.opacity = show ? String(Math.min(1, h.splitShow)) : '0';
        if (show) {
          const up = h.splitDelta <= 0;
          const t = `${up ? '−' : '+'}${Math.abs(h.splitDelta).toFixed(2)}`;
          if (splitTxt.current.textContent !== t) splitTxt.current.textContent = t;
          splitTxt.current.style.color = up ? '#7ef7c8' : '#ff6a6a';
          splitTxt.current.style.textShadow = `0 3px 0 #000, 0 0 20px ${up ? '#7ef7c8' : '#ff6a6a'}99`;
        }
      }

      // ghost gap
      if (ghostTxt.current) {
        ghostTxt.current.style.opacity = h.ghostActive ? '1' : '0';
        if (h.ghostActive) {
          const ahead = h.ghostGap >= 0;
          const m = Math.abs(h.ghostGap);
          const t = `${ahead ? '▲' : '▼'} ${m < 999 ? m.toFixed(0) : '999'}m`;
          if (ghostTxt.current.textContent !== t) ghostTxt.current.textContent = t;
          ghostTxt.current.style.color = ahead ? '#7ef7c8' : '#7ef7ff';
        }
      }

      // final stretch: track bar goes hot
      if (stretchBar.current) {
        stretchBar.current.style.opacity = h.finalStretch ? '1' : '0';
        stretchBar.current.style.background = h.photoFinish ? '#ff2e88' : '#ffd400';
      }

      // crash recovery: mash prompt
      const crashing = h.crashed > 0;
      if (recWrap.current) recWrap.current.style.opacity = crashing ? '1' : '0';
      if (recBar.current) recBar.current.style.width = `${h.recover * 100}%`;
      if (recKey.current) {
        const k = 1 + h.recoverPulse * 0.3;
        recKey.current.style.transform = `scale(${k.toFixed(3)})`;
        recKey.current.style.background = h.recoverPulse > 0.4 ? '#7ef7c8' : '#ffffff';
      }

      // hazard telegraph: pulses harder the later you leave it
      const hz = crashing ? 0 : h.hazard;
      if (hazWrap.current) {
        hazWrap.current.style.opacity = hz > 0.18 ? String(Math.min(1, (hz - 0.18) * 3)) : '0';
        const pulse = 1 + Math.sin(performance.now() / (hz > 0.62 ? 55 : 110)) * 0.09 * hz;
        hazWrap.current.style.transform = `translate(-50%,-50%) scale(${pulse.toFixed(3)})`;
      }
      if (hazArrow.current) {
        // point toward the escape route (away from the rock)
        hazArrow.current.textContent = h.hazardSide > 0 ? '◀' : h.hazardSide < 0 ? '▶' : '▲';
        hazArrow.current.style.color = hz > 0.62 ? '#ff2e2e' : '#ff9500';
      }
      if (hazEdge.current) {
        hazEdge.current.style.opacity = String(Math.max(0, (hz - 0.45)) * 1.5);
        hazEdge.current.style.background = h.hazardSide > 0
          ? 'linear-gradient(90deg, rgba(255,40,40,.5), transparent 26%)'
          : 'linear-gradient(270deg, rgba(255,40,40,.5), transparent 26%)';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <>
    {/* ---------- cold open ---------- */}
    <div ref={introWrap} className="pointer-events-none absolute inset-0 select-none opacity-0 transition-opacity duration-500"
      style={{ zIndex: 7 }}>
      <div ref={barTop} className="absolute inset-x-0 top-0 bg-black"
        style={{ height: 0, transition: 'height .5s cubic-bezier(.2,.9,.25,1)' }} />
      <div ref={barBot} className="absolute inset-x-0 bottom-0 bg-black"
        style={{ height: 0, transition: 'height .5s cubic-bezier(.2,.9,.25,1)' }} />

      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center">
        <div ref={introLine} className="hud-big text-center leading-[0.85] text-white"
          style={{ textShadow: '0 8px 0 #000, 0 0 70px rgba(0,0,0,.9)' }} />
        <div ref={introSub}
          className="hud-label mt-3 !text-[13px] !tracking-[.44em] text-white/75 opacity-0 transition-opacity duration-300"
          style={{ textShadow: '0 2px 6px #000' }} />
      </div>

      {/* reaction window */}
      <div ref={reactWrap} className="absolute inset-x-0 bottom-[19%] flex flex-col items-center opacity-0 transition-opacity duration-150">
        <div className="hud-big text-[26px] text-[#c0f000]" style={{ textShadow: '0 3px 0 #000' }}>
          HIT <span className="rounded-[4px] border-b-[3px] border-black/70 bg-white px-2 text-black">W</span> NOW
        </div>
        <div className="mt-2 h-[8px] w-[240px] border-2 border-black/70 bg-black/60">
          <div ref={reactBar} className="h-full bg-[#c0f000]" style={{ width: '100%' }} />
        </div>
      </div>

      <div className="absolute bottom-4 right-5">
        <span className="hud-label !text-[9px] text-white/40">ESC TO SKIP</span>
      </div>
    </div>

    <div ref={root} className="pointer-events-none absolute inset-0 select-none transition-opacity duration-300" style={{ zIndex: 6 }}>
      {/* screen effects */}
      <div ref={vign} className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 52%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.85) 100%)',
        transition: 'opacity .25s',
      }} />
      <div ref={boostGrade} className="absolute inset-0 opacity-0 transition-opacity duration-200 mix-blend-screen" style={{
        background: 'radial-gradient(ellipse at 50% 55%, rgba(255,60,200,0) 35%, rgba(255,40,190,0.22) 100%)',
      }} />
      <div ref={flash} className="absolute inset-0 opacity-0 mix-blend-screen" style={{ transition: 'opacity .12s' }} />
      <div ref={lines} className="speedlines absolute inset-0 opacity-0" />

      {/* top-left: place + clock. "vs your best" readouts stack under the
          clock they refer to, rather than sprawling across the top edge. */}
      <div className="absolute left-5 top-4 flex items-start gap-3">
        <div className="hud-panel px-4 py-2">
          <div className="hud-label">POS</div>
          <div ref={placeNum} className="hud-big text-[46px] leading-[0.86] text-white">1st</div>
        </div>
        <div>
          <div className="hud-panel px-4 py-2">
            <div className="hud-label">TIME</div>
            <div ref={timeTxt} className="hud-mono text-[26px] leading-none text-[#7ef7ff]">0:00.00</div>
          </div>
          <div className="mt-[6px] ml-1 flex items-baseline gap-3">
            <div ref={splitTxt} className="hud-big text-[21px] leading-none opacity-0"
              style={{ transition: 'opacity .2s' }} />
            <div ref={ghostTxt} className="hud-big text-[15px] leading-none text-[#7ef7ff] opacity-0"
              style={{ transition: 'opacity .25s', textShadow: '0 2px 0 #000' }} />
          </div>
        </div>
      </div>

      {/* top-right: score + combo */}
      <div className="absolute right-5 top-4 flex flex-col items-end gap-2">
        <div className="hud-panel px-4 py-2 text-right">
          <div className="hud-label">STYLE POINTS</div>
          <div ref={scoreTxt} className="hud-big text-[34px] leading-none text-[#ffd400]">0</div>
        </div>
        <div ref={comboWrap} className="opacity-0 transition-all duration-150">
          <div className="rounded-sm bg-[#ff2e88] px-3 py-1 shadow-[0_0_22px_#ff2e88aa]" style={{ transform: 'skewX(-10deg)' }}>
            <div ref={comboNum} className="hud-big text-[28px] leading-none text-white">2x</div>
          </div>
          <div className="mt-1 h-[4px] w-full bg-black/60">
            <div ref={comboBar} className="h-full bg-[#ffd400]" style={{ width: '100%' }} />
          </div>
        </div>
        <div ref={bonkTag} className="hud-big text-[17px] leading-none opacity-0"
          style={{ transform: 'skewX(-10deg)', textShadow: '0 2px 0 #000', transition: 'opacity .2s' }} />
      </div>

      {/* right: descent bar */}
      <div className="hud-descent absolute right-6 top-1/2 h-[46vh] -translate-y-1/2">
        <div className="hud-label mb-1 text-center">DESCENT</div>
        <div ref={trackBar} className="relative h-full w-[10px] rounded-full border border-white/25 bg-black/55">
          <div className="absolute inset-x-0 top-0 rounded-full bg-gradient-to-b from-[#2fe6c8] to-[#ffd400] opacity-70" style={{ height: 'var(--p,0%)' }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} ref={el => { pips.current[i] = el; }}
              className="absolute left-1/2 h-[10px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-black/70"
              style={{ top: '0%' }} />
          ))}
        </div>
      </div>

      {/* bottom-left: speedo */}
      <div className="hud-speedo absolute bottom-5 left-5">
        <div className="relative h-[150px] w-[150px]">
          <svg viewBox="0 0 150 150" className="absolute inset-0 -rotate-[135deg]">
            <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="11" strokeDasharray={`${2 * Math.PI * 62 * 0.75} ${2 * Math.PI * 62}`} strokeLinecap="round" />
            <circle ref={speedArc} cx="75" cy="75" r="62" fill="none" stroke="#2fe6c8" strokeWidth="11"
              strokeDasharray={`0 ${2 * Math.PI * 62}`} strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 8px currentColor)', transition: 'stroke .2s' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div ref={speedNum} className="hud-big text-[52px] leading-none text-white" style={{ textShadow: '0 3px 0 #000' }}>0</div>
            <div className="hud-label -mt-1">KM/H</div>
          </div>
        </div>
      </div>

      {/* bottom-right: boost */}
      <div className="hud-boost absolute bottom-5 right-6 flex items-end gap-3">
        <div ref={draftTxt} className="hud-big mb-3 text-[18px] text-[#7ef7c8] opacity-0 transition-opacity" style={{ textShadow: '0 2px 0 #000' }}>DRAFTING</div>
        <div className="text-center">
          <div ref={boostWrap} className="relative h-[160px] w-[26px] overflow-hidden rounded-sm border-2 border-black/70 bg-black/55">
            <div ref={boostFill} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#ff8a00] via-[#ff2e88] to-[#7ef7ff]" style={{ height: '0%', transition: 'height .08s linear' }} />
            <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg,transparent 0 12px,rgba(0,0,0,.55) 12px 14px)' }} />
          </div>
          <div className="relative mx-auto mt-[3px] h-[5px] w-[26px] border border-black/60 bg-black/50">
            <div ref={pumpRing} className="absolute bottom-0 left-0 w-full bg-[#c0f000] opacity-0"
              style={{ height: '0%', transition: 'opacity .15s' }} />
          </div>
          <div className="hud-label mt-1">BOOST</div>
          <div ref={boostRdy} className="hud-big text-[13px] text-[#ffd400] opacity-0 transition-opacity">SPACE!</div>
        </div>
      </div>

      {/* zone banner */}
      <div ref={zoneWrap} className="absolute left-0 top-[22%] opacity-0" style={{ transform: 'skewX(-9deg)' }}>
        <div className="bg-[#ffd400] py-1 pl-6 pr-8">
          <div ref={zoneName} className="hud-big text-[30px] leading-none text-black">START GATE</div>
        </div>
        <div className="ml-6 bg-black/85 px-3 py-[2px]">
          <div ref={zoneSub} className="hud-label text-[#ffd400]">DROP IN</div>
        </div>
      </div>

      {/* trick readout */}
      <div className="absolute left-1/2 top-[16%] -translate-x-1/2 text-center">
        <div ref={trickTxt} className="hud-big text-[38px] leading-none text-[#7ef7ff] opacity-0 transition-opacity duration-100"
          style={{ textShadow: '0 4px 0 #000, 0 0 26px #7ef7ff88' }} />
        <div className="mx-auto mt-2 h-[5px] w-[220px] bg-black/50">
          <div ref={airBar} className="h-full bg-[#7ef7ff] opacity-0 transition-opacity" style={{ width: '0%' }} />
        </div>
      </div>

      {/* countdown */}
      <div ref={countTxt} className="hud-big absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[150px] leading-none text-white opacity-0"
        style={{ textShadow: '0 8px 0 #000, 0 0 60px #ffd400' }} />

      {/* off track */}
      <div ref={offTxt} className="hud-big absolute left-1/2 top-[74%] -translate-x-1/2 text-[24px] text-[#ff6a00] opacity-0 transition-opacity"
        style={{ textShadow: '0 3px 0 #000' }}>OFF COURSE!</div>

      {/* final stretch marker on the descent bar */}
      <div ref={stretchBar} className="hud-descent absolute right-6 top-1/2 h-[46vh] w-[10px] -translate-y-1/2 opacity-0"
        style={{ transition: 'opacity .3s', clipPath: 'inset(90% 0 0 0)', borderRadius: 9999 }} />

      {/* crash recovery prompt */}
      <div ref={recWrap} className="absolute left-1/2 top-[58%] w-[300px] -translate-x-1/2 text-center opacity-0"
        style={{ transition: 'opacity .15s' }}>
        <div className="hud-big text-[26px] leading-none text-white" style={{ textShadow: '0 3px 0 #000' }}>
          MASH <span ref={recKey} className="inline-block rounded-[4px] border-b-[3px] border-black/70 px-2 text-black" style={{ background: '#fff' }}>W</span> TO GET UP
        </div>
        <div className="mx-auto mt-2 h-[9px] w-full border-2 border-black/70 bg-black/60">
          <div ref={recBar} className="h-full bg-gradient-to-r from-[#ffd400] to-[#7ef7c8]"
            style={{ width: '0%', transition: 'width .08s' }} />
        </div>
      </div>

      {/* state machine debug (?states) */}
      <div ref={dbgWrap} className="absolute left-5 top-[128px] hidden border-l-4 border-[#2fe6c8] bg-black/78 px-3 py-2 backdrop-blur">
        <div className="hud-label !text-[8px]">BIKE STATE</div>
        <div ref={dbgState} className="hud-big text-[22px] leading-none text-white">GROUNDED</div>
        <div ref={dbgT} className="hud-mono mt-[2px] text-[10px] text-white/55" />
        <div className="hud-label mt-2 !text-[8px]">TRANSITIONS</div>
        <div ref={dbgLog} className="hud-mono whitespace-pre text-[9px] leading-[1.5] text-[#7ef7c8]" />
      </div>

      {/* hazard telegraph */}
      <div ref={hazEdge} className="absolute inset-y-0 left-0 w-full opacity-0" style={{ transition: 'opacity .1s' }} />
      <div ref={hazWrap} className="absolute left-1/2 top-[60%] flex items-center gap-3 opacity-0"
        style={{ transform: 'translate(-50%,-50%)', transition: 'opacity .12s' }}>
        <div ref={hazArrow} className="hud-big text-[40px] leading-none text-[#ff9500]"
          style={{ textShadow: '0 3px 0 #000' }}>▲</div>
        <div className="hud-big text-[20px] leading-none text-[#ff9500]" style={{ textShadow: '0 3px 0 #000' }}>HAZARD</div>
      </div>
    </div>
    </>
  );
}
