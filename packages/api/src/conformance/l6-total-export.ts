import type { ConformanceCase, ConformanceHarness, UserMutation } from "./harness.js";
import { exportOrFail, foreignRoundTrips, skip } from "./support.js";

const mutationsOf = (h: ConformanceHarness): UserMutation[] => [
  { name: "mutate (element command)", run: (m) => h.mutate(m) },
  ...(h.configMutations ?? []),
];

export const totalExportCases: ConformanceCase[] = [
  {
    name: "L6: export is total after imports, user mutations and undo",
    async run(h) {
      const m = await h.create();
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        for (const mutation of mutationsOf(h)) {
          await mutation.run(m);
          exportOrFail(m, `after ${mutation.name}`);
        }
        if (h.undo) {
          await h.undo(m);
          exportOrFail(m, "after an undo");
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L6: foreign content survives an import → export round-trip",
    async run(h) {
      if (h.foreignTexts === undefined) {
        return skip("foreignTexts is undefined — pass [] if the notation has no foreign form");
      }
      if (h.foreignTexts.length === 0) return;
      const m = await h.create();
      try {
        await foreignRoundTrips(h, m, "");
      } finally {
        m.destroy();
      }
    },
  },
];
