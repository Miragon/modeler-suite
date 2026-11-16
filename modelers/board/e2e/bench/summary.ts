import { writeSummary } from "./report.js";

/** After the last board: every result of the folder as one table. */
export default function printSummary(): void {
  const summary = writeSummary();
  if (summary !== undefined) console.log(`\n${summary}\n`);
}
