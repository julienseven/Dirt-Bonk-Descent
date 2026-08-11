import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type Phase } from './game/game';
import Hud from './ui/Hud';
import TouchControls from './ui/TouchControls';
import { Menu, Pause, Results, Loading } from './ui/Screens';
import TunePanel from './ui/TunePanel';
import Garage from './ui/Garage';
import { type Loadout } from './game/garage';
import {
  xpBreakdown, xpTotal, cashEarned, completedChallenges,
  type XpLine, type RunSummary,
} from './game/progression';
import { getMode, type ModeId } from './game/modes';
import MountainSelect from './ui/MountainSelect';
import { levelFromXp } from './game/mountains';
import { audio } from './game/audio';
import {
  loadSave, writeSave, commitRun, type SaveData, type Difficulty, type RecordResult,
} from './game/save';

const isTouch = () =>
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
  window.matchMedia('(pointer: coarse)').matches;

export default function App() {
  // ?tune opens the headless balance harness instead of the game
  if (typeof window !== 'undefined' && window.location.search.includes('tune')) {
    return <TunePanel />;
  }
  return <GameApp />;
}

function GameApp() {
  const mount = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [pct, setPct] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [lastResult, setLastResult] = useState<RecordResult | null>(null);
  const [garage, setGarage] = useState(false);
  const [picker, setPicker] = useState(false);
  const [payout, setPayout] = useState(0);
  const [xpGain, setXpGain] = useState(0);
  const [xpLines, setXpLines] = useState<XpLine[]>([]);
  const [levelUp, setLevelUp] = useState(false);
  const [mode, setMode] = useState<ModeId>('descent');
  const touch = useRef(isTouch());
  const saveRef = useRef(save);
  saveRef.current = save;
  const committed = useRef<object | null>(null);

  useEffect(() => {
    if (!mount.current) return;
    let g: Game | null = null;
    let alive = true;
    let p = 0;
    const tick = setInterval(() => { p = Math.min(92, p + 11); setPct(p); }, 60);
    const id = setTimeout(() => {
      if (!alive || !mount.current) return;
      try {
      g = new Game(mount.current);
      g.onPhaseChange = ph => setPhase(ph);
      const s = saveRef.current;
      g.applyDifficulty(s.difficulty);
      g.pbSplits = s.best[s.difficulty]?.splits ?? [];
      g.ghostData = s.ghost[s.difficulty] ?? null;
      g.showGhost = s.showGhost;
      g.reducedMotion = s.reducedMotion;
      g.applyLoadout(s.loadout);
      if (s.mountain !== 'shaleback') g.loadMountain(s.mountain);
      audio.setMusicEnabled(s.music);
      audio.setSfxEnabled(s.sfx);
      g.start();
      clearInterval(tick);
      setPct(100);
      setGame(g);
      // dev / harness: let Playwright and the console skip the cold open
      if (typeof window !== 'undefined' && /[?&](debug|states|capture)=/.test(window.location.search)) {
        (window as unknown as { __dbd?: Game }).__dbd = g;
      }
      } catch (err) {
        // Never hang on the loading screen. A throw during construction
        // used to leave setGame() unreached and the bar stuck forever,
        // which reads as "the game is broken" with no way to diagnose it.
        clearInterval(tick);
        console.error('[DirtBonkDescent] startup failed:', err);
        setFatal(err instanceof Error ? err.message : String(err));
      }
    }, 60);
    return () => {
      alive = false;
      clearInterval(tick);
      clearTimeout(id);
      g?.dispose();
    };
  }, []);

  // fold a completed run into the save exactly once
  useEffect(() => {
    if (phase !== 'finish' || !game) return;
    const d = game.hud.finishData;
    if (!d) return;
    // guard against StrictMode's double effect invoke and any re-render
    if (committed.current === d) return;
    committed.current = d;
    const next = { ...saveRef.current };
    const res = commitRun(next, next.difficulty, {
      time: d.time, score: d.score, place: d.place,
      topSpeed: d.topSpeed, splits: d.splits, date: Date.now(),
    }, game.takeGhost());
    // ---- itemised progression
    const mode = getMode(game.mode);
    const base: RunSummary = {
      place: d.place, fieldSize: game.hud.total,
      score: d.score, tricks: d.tricks, bonks: d.bonks,
      nearMisses: d.nearMisses, shortcuts: d.shortcuts,
      bestTrickScore: d.bestTrickScore, time: d.time,
      length: game.track.length, finished: true,
      challengesDone: [],
      modeXpScale: mode.xpScale, modeCashScale: mode.cashScale,
    };
    const done = completedChallenges(base);
    const summary: RunSummary = { ...base, challengesDone: done };
    const lines = xpBreakdown(summary);
    const gainedXp = xpTotal(lines);
    const earned = cashEarned(summary);
    setXpLines(lines);
    const before = levelFromXp(next.xp).level;
    next.coins += earned;
    next.xp += gainedXp;
    const after = levelFromXp(next.xp).level;
    // per-mountain best time
    const mid = next.mountain;
    const pb = next.mountainBest[mid];
    if (pb === undefined || d.time < pb) {
      next.mountainBest = { ...next.mountainBest, [mid]: d.time };
    }
    setPayout(earned);
    setXpGain(gainedXp);
    setLevelUp(after > before);
    setSave(next);
    setLastResult(res);
    // race the new benchmark next run
    game.pbSplits = next.best[next.difficulty]?.splits ?? [];
    game.ghostData = next.ghost[next.difficulty] ?? null;
  }, [phase, game]);

  // stop the race renderer while the garage's own GL context is on screen
  useEffect(() => { if (game) game.suspended = garage; }, [game, garage]);

  const patch = useCallback((p: Partial<SaveData>) => {
    setSave(prev => {
      const next = { ...prev, ...p };
      writeSave(next);
      return next;
    });
  }, []);

  const chooseDifficulty = useCallback((d: Difficulty) => {
    patch({ difficulty: d });
    if (game) {
      game.applyDifficulty(d);
      game.pbSplits = saveRef.current.best[d]?.splits ?? [];
      game.ghostData = saveRef.current.ghost[d] ?? null;
    }
  }, [game, patch]);

  const setLoadout = useCallback((l: Loadout) => {
    patch({ loadout: l });
    game?.applyLoadout(l);
  }, [game, patch]);

  const buy = useCallback((cost: number, l: Loadout) => {
    setSave(prev => {
      const next = { ...prev, coins: Math.max(0, prev.coins - cost), loadout: l };
      writeSave(next);
      return next;
    });
    game?.applyLoadout(l);
  }, [game]);

  const pickMountain = useCallback((id: string) => {
    patch({ mountain: id });
    game?.loadMountain(id);
    setPicker(false);
  }, [game, patch]);

  const chooseMode = useCallback((id: ModeId) => {
    setMode(id);
    game?.setMode(id);
  }, [game]);

  const startRace = useCallback(() => {
    if (!game) return;
    setLastResult(null);
    setPayout(0);
    setXpGain(0);
    setLevelUp(false);
    game.setMode(mode);
    game.pbSplits = saveRef.current.best[saveRef.current.difficulty]?.splits ?? [];
    game.startRace();
  }, [game, mode]);

  /** Re-run without replaying the cold open. */
  const rerun = useCallback(() => {
    if (!game) return;
    setLastResult(null);
    setPayout(0); setXpGain(0); setLevelUp(false);
    game.pbSplits = saveRef.current.best[saveRef.current.difficulty]?.splits ?? [];
    game.quickRestart();
  }, [game]);

  const toMenu = useCallback(() => {
    if (!game) return;
    game.setPhase('menu');
    game.resetRace();
  }, [game]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a]">
      <div ref={mount} className="absolute inset-0" />
      {/* portrait phones can't fit pads + HUD during a run; menus still work upright */}
      <div
        className="rotate-hint"
        data-phase={phase === 'race' || phase === 'countdown' || phase === 'intro' ? 'race' : phase}
        style={{
          display: (phase === 'race' || phase === 'countdown' || phase === 'intro')
            ? undefined
            : 'none',
        }}
      >
        <div className="hud-big text-[34px] text-[#ffd400]" style={{ textShadow: '0 4px 0 #000' }}>
          ROTATE YOUR DEVICE
        </div>
        <div className="hud-label !text-[10px]">RACE IN LANDSCAPE</div>
        <div className="mt-2 text-[40px]" aria-hidden>📱</div>
      </div>
      {!game && !fatal && <Loading pct={pct} />}
      {fatal && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#06070a] px-8 text-center">
          <div className="hud-big text-[32px] text-[#ff4d4d]" style={{ textShadow: '0 4px 0 #000' }}>
            COULDN'T DROP IN
          </div>
          <div className="hud-label !text-[10px]">THE MOUNTAIN FAILED TO BUILD</div>
          <code className="mt-2 max-w-lg text-[11px] leading-snug text-white/50">{fatal}</code>
          <button onClick={() => window.location.reload()}
            className="title-skew mt-3 border-2 border-[#ffd400] px-6 py-2">
            <span className="hud-big text-[18px] text-[#ffd400]">RETRY</span>
          </button>
        </div>
      )}
      {game && <Hud game={game} />}
      {game && (phase === 'race' || phase === 'countdown' || phase === 'intro') && (
        <TouchControls game={game} visible={touch.current} />
      )}
      {game && garage && (
        <Garage
          loadout={save.loadout}
          coins={save.coins}
          xp={save.xp}
          reducedMotion={save.reducedMotion}
          onChange={setLoadout}
          onBuy={buy}
          onClose={() => setGarage(false)}
        />
      )}
      {game && picker && (
        <MountainSelect save={save} onPick={pickMountain} onClose={() => setPicker(false)} />
      )}
      {game && phase === 'menu' && !garage && !picker && (
        <Menu
          save={save}
          onStart={startRace}
          onGarage={() => setGarage(true)}
          onMountains={() => setPicker(true)}
          onDifficulty={chooseDifficulty}
          mode={mode}
          onMode={chooseMode}
          onToggleMusic={v => { patch({ music: v }); audio.setMusicEnabled(v); }}
          onToggleSfx={v => { patch({ sfx: v }); audio.setSfxEnabled(v); }}
          onToggleMotion={v => { patch({ reducedMotion: v }); game.reducedMotion = v; }}
          onToggleGhost={v => { patch({ showGhost: v }); game.showGhost = v; }}
        />
      )}
      {game && phase === 'paused' && (
        <Pause onResume={() => game.togglePause()} onRestart={rerun} onQuit={toMenu} />
      )}
      {game && phase === 'finish' && (
        <Results game={game} save={save} result={lastResult} payout={payout}
          xpGain={xpGain} levelUp={levelUp} xpLines={xpLines}
          onRestart={rerun} onMenu={toMenu} onGarage={() => { toMenu(); setGarage(true); }} />
      )}
    </div>
  );
}
