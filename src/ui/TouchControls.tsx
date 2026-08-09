import { useEffect, useRef } from 'react';
import type { Game } from '../game/game';

/**
 * Touch layout built around thumb reach rather than a keyboard mirror:
 *  - left thumb owns a slide zone (analog steer, no discrete buttons to
 *    miss, and you can swing across it without lifting)
 *  - throttle is automatic, so it costs no button at all
 *  - right thumb gets two big contextual actions (bonk on the ground,
 *    whip in the air) plus hop / boost / brake
 */

function ActionButton({
  game, code, label, sub, tint, size = 62, wide = false,
}: {
  game: Game; code: string; label: string; sub?: string;
  tint?: string; size?: number; wide?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (down: boolean) => {
      game.setVirtualKey(code, down);
      el.style.transform = down ? 'scale(.9)' : 'scale(1)';
      el.style.filter = down ? 'brightness(1.6)' : 'none';
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      // NOTE: deliberately no setPointerCapture — capturing here is what
      // made it impossible to roll a thumb from one action to the next.
      set(true);
    };
    const onUp = () => set(false);
    const onEnter = (e: PointerEvent) => { if (e.buttons || e.pressure > 0) set(true); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointerenter', onEnter);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('pointerenter', onEnter);
      game.setVirtualKey(code, false);
    };
  }, [game, code]);

  return (
    <button
      ref={ref}
      className="pointer-events-auto touch-none select-none rounded-2xl border-2 bg-black/45 backdrop-blur"
      style={{
        width: wide ? size * 1.55 : size, height: size,
        borderColor: tint ?? 'rgba(255,255,255,.28)',
        transition: 'transform .06s, filter .06s',
      }}
    >
      <span className="hud-big block leading-none text-white" style={{ fontSize: size > 60 ? 20 : 16 }}>
        {label}
      </span>
      {sub && <span className="hud-label mt-[2px] block !text-[8px]">{sub}</span>}
    </button>
  );
}

export default function TouchControls({ game, visible }: { game: Game; visible: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const airRef = useRef(false);

  // --- analog steering strip -------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const el = zone.current;
    if (!el) return;
    let id: number | null = null;

    const apply = (clientX: number) => {
      const r = el.getBoundingClientRect();
      // normalised offset from the strip's centre, with a small dead zone
      let v = ((clientX - r.left) / r.width) * 2 - 1;
      if (Math.abs(v) < 0.08) v = 0;
      v = Math.max(-1, Math.min(1, v * 1.15));
      game.setSteerAxis(v);
      if (knob.current) {
        knob.current.style.left = `${(v * 0.5 + 0.5) * 100}%`;
        knob.current.style.opacity = '1';
      }
    };
    const release = () => {
      id = null;
      game.setSteerAxis(0);
      if (knob.current) { knob.current.style.left = '50%'; knob.current.style.opacity = '.35'; }
    };
    const down = (e: PointerEvent) => { e.preventDefault(); id = e.pointerId; apply(e.clientX); };
    const move = (e: PointerEvent) => { if (id === e.pointerId) { e.preventDefault(); apply(e.clientX); } };
    const up = (e: PointerEvent) => { if (id === e.pointerId) { e.preventDefault(); release(); } };

    el.addEventListener('pointerdown', down);
    // listen on window so a thumb that slides off the strip keeps steering
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    game.autoPedal = true;
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      game.setSteerAxis(null);
      game.autoPedal = false;
    };
  }, [game, visible]);

  // --- relabel the two action buttons in the air ------------------------
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const air = game.hud.trickHold > 0 || game.hud.airTime > 0.15;
      if (air === airRef.current) return;
      airRef.current = air;
      document.querySelectorAll<HTMLElement>('[data-act-sub]').forEach(el => {
        const side = el.dataset.actSub!;
        el.textContent = air ? `WHIP ${side}` : `BONK ${side}`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game, visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 8 }}>
      {/* steering strip — the whole lower-left is a slide surface */}
      <div
        ref={zone}
        className="pointer-events-auto absolute bottom-0 left-0 touch-none"
        style={{ width: '46%', height: 132 }}
      >
        <div className="absolute inset-x-3 bottom-4 h-[58px] rounded-2xl border-2 border-white/25 bg-black/40 backdrop-blur">
          <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white/20" />
          <div
            ref={knob}
            className="absolute top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[#2fe6c8] bg-[#2fe6c8]/25"
            style={{ left: '50%', opacity: 0.35, transition: 'left .05s linear, opacity .15s' }}
          />
          <span className="hud-label absolute -top-[15px] left-3 !text-[8px]">SLIDE TO STEER</span>
        </div>
      </div>

      {/* right thumb cluster */}
      <div className="absolute bottom-4 right-3 flex flex-col items-end gap-2">
        <div className="flex items-end gap-2">
          <ActionButton game={game} code="KeyS" label="■" sub="BRAKE" size={54} />
          <ActionButton game={game} code="KeyJ" label="⤴" sub="HOP" size={54} />
          <ActionButton game={game} code="Space" label="⚡" sub="BOOST" size={62} tint="rgba(255,46,136,.75)" />
        </div>
        <div className="flex items-end gap-2">
          <button className="pointer-events-none opacity-0" aria-hidden />
          <TouchAction game={game} code="KeyQ" side="L" label="◀" />
          <TouchAction game={game} code="KeyE" side="R" label="▶" />
        </div>
      </div>

      <button
        onPointerDown={e => { e.preventDefault(); game.togglePause(); }}
        className="pointer-events-auto absolute right-3 top-3 touch-none rounded-lg border-2 border-white/30 bg-black/45 px-3 py-2 backdrop-blur"
      >
        <span className="hud-big text-[14px] text-white">II</span>
      </button>
    </div>
  );
}

/** Big contextual action: bonk on the ground, whip in the air. */
function TouchAction({ game, code, side, label }: {
  game: Game; code: string; side: 'L' | 'R'; label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (down: boolean) => {
      game.setVirtualKey(code, down);
      el.style.transform = down ? 'scale(.9)' : 'scale(1)';
      el.style.filter = down ? 'brightness(1.6)' : 'none';
    };
    const onDown = (e: PointerEvent) => { e.preventDefault(); set(true); };
    const onUp = () => set(false);
    const onEnter = (e: PointerEvent) => { if (e.buttons || e.pressure > 0) set(true); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointerenter', onEnter);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('pointerenter', onEnter);
      game.setVirtualKey(code, false);
    };
  }, [game, code]);

  return (
    <button
      ref={ref}
      className="pointer-events-auto touch-none select-none rounded-2xl border-2 border-[#ffd400]/70 bg-black/45 backdrop-blur"
      style={{ width: 76, height: 66, transition: 'transform .06s, filter .06s' }}
    >
      <span className="hud-big block text-[22px] leading-none text-[#ffd400]">{label}</span>
      <span className="hud-label mt-[2px] block !text-[8px]" data-act-sub={side}>BONK {side}</span>
    </button>
  );
}
