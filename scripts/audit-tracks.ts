// Headless track balance audit — no DOM, no Three mesh build.
import { buildMountainTrack } from '../src/game/mountainsBuild';
import { MOUNTAINS } from '../src/game/mountains';
import { getTrackDefinition } from '../src/game/mountainsBuild';

for (const m of MOUNTAINS) {
  const t = buildMountainTrack(m.id, 1);
  const def = getTrackDefinition(m.id);
  const elevDrop = t.py[0] - t.py[t.count - 1];
  const widths: number[] = [];
  const pitches: number[] = [];
  for (let i = 0; i < t.count; i += 8) {
    widths.push(t.hw[i] * 2);
    pitches.push(t.pitch[i]);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const combat = t.zones.filter(z => z.combat).length;
  const secret = t.zones.filter(z => z.secret).length;
  const cliffs = t.zones.filter(z => z.dropDepth).length;
  const jumps = t.features.filter(f =>
    f.kind === 'gap' || f.kind === 'table' || f.kind === 'kicker' || f.kind === 'double').length;
  const gaps = t.features.filter(f => f.kind === 'gap').length;
  const densFog = t.zones.filter(z => z.fog > 1.5).length;
  const narrow = t.zones.filter(z => z.width < 10).length;

  console.log(`\n=== ${m.name} (${m.id}) theme=${def.theme} ===`);
  console.log(`  len=${t.length}m elevDrop=${Math.round(elevDrop)}m startY=${Math.round(t.py[0])} endY=${Math.round(t.py[t.count - 1])}`);
  console.log(`  width avg=${avg(widths).toFixed(1)} min=${Math.min(...widths).toFixed(1)} max=${Math.max(...widths).toFixed(1)}`);
  console.log(`  pitch avg=${avg(pitches).toFixed(3)}  zones=${t.zones.length} combat=${combat} secret=${secret} cliffs=${cliffs}`);
  console.log(`  features jumps=${jumps} gaps=${gaps} shortcuts=${t.shortcuts.length} props=${t.obstacles.length}`);
  console.log(`  denseFogZones=${densFog} narrowZones=${narrow} landmarks=${def.landmarks.length}`);
  for (const z of t.zones) {
    const flags = [
      z.combat ? 'COMBAT' : '',
      z.secret ? 'SECRET' : '',
      z.dropDepth ? `DROP${z.dropDepth}` : '',
      z.rails ? 'BRIDGE' : '',
    ].filter(Boolean).join(' ');
    console.log(`  · ${z.name.padEnd(22)} w=${String(z.width).padStart(4)} steep=${z.steep.toFixed(3)} fog=${z.fog.toFixed(2)} trees=${z.treeDensity.toFixed(2)} ${z.surface} ${flags}`);
  }
}
