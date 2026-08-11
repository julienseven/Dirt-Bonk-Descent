// Headless track balance audit — no DOM, no Three mesh build.
// Soft playtest gates: elev, width, combat, identity, theme AI feel.
// Exit 1 if any hard gate fails. Run: npx vite-node scripts/audit-tracks.ts
import { buildMountainTrack, getTrackDefinition } from '../src/game/mountainsBuild';
import { MOUNTAINS, estimateTime } from '../src/game/mountains';
import { themeAiFeel } from '../src/game/ai';

let fails = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  fails++;
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

for (const m of MOUNTAINS) {
  const t = buildMountainTrack(m.id, 1);
  const def = getTrackDefinition(m.id);
  const elevDrop = t.py[0] - t.py[t.count - 1];
  const grade = elevDrop / t.length;
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
  const est = estimateTime(m);
  const feel = themeAiFeel(def.theme);

  console.log(`\n=== ${m.name} (${m.id}) theme=${def.theme} ===`);
  console.log(`  len=${t.length}m elevDrop=${Math.round(elevDrop)}m grade=${grade.toFixed(3)} startY=${Math.round(t.py[0])} endY=${Math.round(t.py[t.count - 1])}`);
  console.log(`  width avg=${avg(widths).toFixed(1)} min=${Math.min(...widths).toFixed(1)} max=${Math.max(...widths).toFixed(1)}`);
  console.log(`  pitch avg=${avg(pitches).toFixed(3)}  zones=${t.zones.length} combat=${combat} secret=${secret} cliffs=${cliffs}`);
  console.log(`  features jumps=${jumps} gaps=${gaps} shortcuts=${t.shortcuts.length} props=${t.obstacles.length}`);
  console.log(`  denseFogZones=${densFog} narrowZones=${narrow} landmarks=${def.landmarks.length}`);
  console.log(`  identity: ${m.themeLabel} · ${m.feel} · est=${Math.round(est)}s`);
  console.log(`  AI feel: pace=${feel.paceMul} caut=${feel.cautionMul} send=${feel.sendMul} line=${feel.lineMul}`);
  console.log(`  hooks: "${m.introHook}" → "${m.finishHook}"`);

  // ---- hard gates (playtest bar) ----------------------------------------
  if (elevDrop < 400) fail(`${m.id}: elev drop ${Math.round(elevDrop)}m < 400`);
  else ok(`elev drop ${Math.round(elevDrop)}m`);

  if (grade < 0.14 || grade > 0.32) fail(`${m.id}: grade ${grade.toFixed(3)} outside 0.14–0.32`);
  else ok(`grade ${grade.toFixed(3)}`);

  if (avg(widths) < 10 || avg(widths) > 18) fail(`${m.id}: avg width ${avg(widths).toFixed(1)}`);
  else ok(`avg width ${avg(widths).toFixed(1)}`);

  if (Math.min(...widths) < 4.5) fail(`${m.id}: min width needle ${Math.min(...widths).toFixed(1)}`);
  else ok(`min width ${Math.min(...widths).toFixed(1)}`);

  if (def.landmarks.length < 4) fail(`${m.id}: landmarks ${def.landmarks.length} < 4`);
  else ok(`landmarks ${def.landmarks.length}`);

  if (t.shortcuts.length < 1) fail(`${m.id}: no shortcuts`);
  else ok(`shortcuts ${t.shortcuts.length}`);

  if (jumps < 8) fail(`${m.id}: jumps ${jumps} < 8`);
  else ok(`jumps ${jumps}`);

  if (!m.introHook || !m.finishHook || !m.themeLabel) fail(`${m.id}: missing identity hooks`);
  else ok('identity hooks');

  if (est < 80 || est > 240) fail(`${m.id}: est time ${est.toFixed(0)}s out of band`);
  else ok(`est ${Math.round(est)}s`);

  if (!def.atmosphere?.sky || def.atmosphere.sky.length < 7) fail(`${m.id}: incomplete atmosphere`);
  else ok('atmosphere');

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

console.log(`\n--- audit: ${fails === 0 ? 'PASS' : `FAIL (${fails})`} ---`);
process.exit(fails === 0 ? 0 : 1);
