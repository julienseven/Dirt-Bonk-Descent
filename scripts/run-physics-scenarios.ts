import { runAllScenarios, formatReport } from '../src/game/physicsScenarios';

const results = runAllScenarios();
console.log(formatReport(results));
process.exit(results.every(r => r.pass) ? 0 : 1);
