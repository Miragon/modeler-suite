import type { ConformanceCase } from "./harness.js";
import { fail, skip } from "./support.js";

export const canonicalFixpointCases: ConformanceCase[] = [
  {
    name: "L2: canonical texts are byte fixpoints of import → export",
    async run(harness) {
      if (harness.canonicalTexts.length === 0) fail("harness provides no canonicalTexts");
      const modeler = await harness.create();
      try {
        for (const text of harness.canonicalTexts) {
          await modeler.importText(text);
          const out = modeler.exportText();
          if (out !== text)
            fail(
              `export after import differs from the canonical input:\n--- in\n${text}\n--- out\n${out}`,
            );
          if (modeler.exportText() !== out)
            fail("exportText is not deterministic — two exports of one document differ");
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L2: canonicalization of loose input is idempotent",
    async run(harness) {
      if (harness.looseTexts === undefined)
        return skip("looseTexts is undefined — pass [] if the notation has no loose form");
      if (harness.looseTexts.length === 0) return;
      const modeler = await harness.create();
      try {
        for (const text of harness.looseTexts) {
          await modeler.importText(text);
          const canonical = modeler.exportText();
          await modeler.importText(canonical);
          const again = modeler.exportText();
          if (again !== canonical) fail("canonicalization is not idempotent on loose input");
        }
      } finally {
        modeler.destroy();
      }
    },
  },
];
