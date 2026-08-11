import { runRaceScenarios, formatRaceReport } from '../src/game/raceScenarios';

const results = runRaceScenarios();
console.log(formatRaceReport(results));
process.exit(results.every(r => r.pass) ? 0 : 1);
