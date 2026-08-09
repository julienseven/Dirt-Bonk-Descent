import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type Phase } from './game/game';
import Hud from './ui/Hud';
import TouchControls from './ui/TouchControls';
import { Menu, Pause, Results, Loading } from './ui/Screens';
import { audio } from './game/audio';
import {
  loadSave, writeSave, commitRun, type SaveData, type Difficulty, type RecordResult,
} from './game/save';

const isTouch = () =>
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
  window.matchMedia('(pointer: coarse)').matches;

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [pct, setPct] = useState(0);
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [lastResult, setLastResult] = useState<RecordResult | null>(null);
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
      g = new Game(mount.current);
      g.onPhaseChange = ph => setPhase(ph);
      const s = saveRef.current;
      g.applyDifficulty(s.difficulty);
      g.pbSplits = s.best[s.difficulty]?.splits ?? [];
      g.ghostData = s.ghost[s.difficulty] ?? null;
      g.showGhost = s.showGhost;
      g.reducedMotion = s.reducedMotion;
      audio.setMusicEnabled(s.music);
      audio.setSfxEnabled(s.sfx);
      g.start();
      clearInterval(tick);
      setPct(100);
      setGame(g);
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
    setSave(next);
    setLastResult(res);
    // race the new benchmark next run
    game.pbSplits = next.best[next.difficulty]?.splits ?? [];
    game.ghostData = next.ghost[next.difficulty] ?? null;
  }, [phase, game]);

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

  const startRace = useCallback(() => {
    if (!game) return;
    setLastResult(null);
    game.pbSplits = saveRef.current.best[saveRef.current.difficulty]?.splits ?? [];
    game.startRace();
  }, [game]);

  const toMenu = useCallback(() => {
    if (!game) return;
    game.setPhase('menu');
    game.resetRace();
  }, [game]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a]">
      <div ref={mount} className="absolute inset-0" />
      {!game && <Loading pct={pct} />}
      {game && <Hud game={game} />}
      {game && (phase === 'race' || phase === 'countdown') && (
        <TouchControls game={game} visible={touch.current} />
      )}
      {game && phase === 'menu' && (
        <Menu
          save={save}
          onStart={startRace}
          onDifficulty={chooseDifficulty}
          onToggleMusic={v => { patch({ music: v }); audio.setMusicEnabled(v); }}
          onToggleSfx={v => { patch({ sfx: v }); audio.setSfxEnabled(v); }}
          onToggleMotion={v => { patch({ reducedMotion: v }); game.reducedMotion = v; }}
          onToggleGhost={v => { patch({ showGhost: v }); game.showGhost = v; }}
        />
      )}
      {game && phase === 'paused' && (
        <Pause onResume={() => game.togglePause()} onRestart={startRace} onQuit={toMenu} />
      )}
      {game && phase === 'finish' && (
        <Results game={game} save={save} result={lastResult} onRestart={startRace} onMenu={toMenu} />
      )}
    </div>
  );
}
