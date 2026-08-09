import { useEffect, useRef } from 'react';
import type { Game } from '../game/game';

/**
 * On-screen controls for touch devices. Buttons drive the same virtual-key
 * path as the keyboard, so the sim never needs to know where input came from.
 */
function Pad({
  game, code, label, sub, className, style,
}: {
  game: Game; code: string | string[]; label: string; sub?: string;
  className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const codes = Array.isArray(code) ? code : [code];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (down: boolean) => {
      codes.forEach(c => game.setVirtualKey(c, down));
      el.style.transform = down ? 'scale(0.92)' : 'scale(1)';
      el.style.filter = down ? 'brightness(1.5)' : 'none';
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      set(true);
    };
    const up = (e: PointerEvent) => { e.preventDefault(); set(false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
      codes.forEach(c => game.setVirtualKey(c, false));
    };
  }, [game, codes.join()]);

  return (
    <button
      ref={ref}
      className={`pointer-events-auto select-none touch-none rounded-xl border-2 border-white/30 bg-black/45 backdrop-blur active:border-white/70 ${className ?? ''}`}
      style={{ transition: 'transform .06s, filter .06s', ...style }}
    >
      <span className="hud-big block text-[19px] leading-none text-white">{label}</span>
      {sub && <span className="hud-label mt-[3px] block !text-[8px]">{sub}</span>}
    </button>
  );
}

export default function TouchControls({ game, visible }: { game: Game; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 8 }}>
      {/* left cluster: steering */}
      <div className="absolute bottom-4 left-3 flex gap-2">
        <Pad game={game} code="KeyA" label="◀" sub="LEFT" className="h-[74px] w-[74px]" />
        <Pad game={game} code="KeyD" label="▶" sub="RIGHT" className="h-[74px] w-[74px]" />
      </div>

      {/* right cluster: throttle + actions */}
      <div className="absolute bottom-4 right-3 grid grid-cols-3 gap-2">
        <Pad game={game} code="KeyQ" label="Q" sub="BONK L" className="h-[54px] w-[62px]" />
        <Pad game={game} code="KeyJ" label="^" sub="HOP" className="h-[54px] w-[62px]" />
        <Pad game={game} code="KeyE" label="E" sub="BONK R" className="h-[54px] w-[62px]" />
        <Pad game={game} code="KeyS" label="■" sub="BRAKE" className="h-[62px] w-[62px]" />
        <Pad game={game} code="Space" label="⚡" sub="BOOST"
          className="h-[62px] w-[62px] !border-[#ff2e88]/70" />
        <Pad game={game} code="KeyW" label="▲" sub="PEDAL"
          className="h-[62px] w-[62px] !border-[#2fe6c8]/70" />
      </div>

      {/* tuck sits under the left thumb reach */}
      <div className="absolute bottom-[92px] left-3">
        <Pad game={game} code="ShiftLeft" label="TUCK" className="h-[44px] w-[100px]" />
      </div>

      {/* pause */}
      <button
        onPointerDown={e => { e.preventDefault(); game.togglePause(); }}
        className="pointer-events-auto absolute right-3 top-3 touch-none rounded-lg border-2 border-white/30 bg-black/45 px-3 py-2 backdrop-blur"
      >
        <span className="hud-big text-[14px] text-white">II</span>
      </button>
    </div>
  );
}
