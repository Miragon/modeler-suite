import type { ConformanceCase, ConformanceHarness, UserMutation } from "./harness.js";
import { exportOrFail, firstText, foreignRoundTrips, skip } from "./support.js";

const mutationsOf = (harness: ConformanceHarness): UserMutation[] => [
  { name: "mutate (element command)", run: (modeler) => harness.mutate(modeler) },
  ...(harness.configMutations ?? []),
];

export const totalExportCases: ConformanceCase[] = [
  {
    name: "L6: export is total after imports, user mutations and undo",
    async run(harness) {
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        for (const mutation of mutationsOf(harness)) {
          await mutation.run(modeler);
          exportOrFail(modeler, `after ${mutation.name}`);
        }
        if (harness.undo) {
          await harness.undo(modeler);
          exportOrFail(modeler, "after an undo");
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L6: foreign content survives an import → export round-trip",
    async run(harness) {
      if (harness.foreignTexts === undefined) {
        return skip("foreignTexts is undefined — pass [] if the notation has no foreign form");
      }
      if (harness.foreignTexts.length === 0) return;
      const modeler = await harness.create();
      try {
        await foreignRoundTrips(harness, modeler, "");
      } finally {
        modeler.destroy();
      }
    },
  },
];
