import { runDailyMonitor } from "../services/api-service.mjs";

const force = process.argv.includes("--force");

const result = await runDailyMonitor({ force });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
