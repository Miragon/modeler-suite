import type { ConformanceCase } from "./harness.js";
import { fail, skip } from "./support.js";

export const canonicalFixpointCases: ConformanceCase[] = [
  {
    name: "L2: canonical texts are byte fixpoints of import → export",
    async run(h) {
      if (h.canonicalTexts.length === 0) fail("harness provides no canonicalTexts");
      const m = await h.create();
      try {
        for (const text of h.canonicalTexts) {
          await m.importText(text);
          const out = m.exportText();
          if (out !== text)
            fail(
              `export after import differs from the canonical input:\n--- in\n${text}\n--- out\n${out}`,
            );
          if (m.exportText() !== out)
            fail("exportText is not deterministic — two exports of one document differ");
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L2: canonicalization of loose input is idempotent",
    async run(h) {
      if (h.looseTexts === undefined)
        return skip("looseTexts is undefined — pass [] if the notation has no loose form");
      if (h.looseTexts.length === 0) return;
      const m = await h.create();
      try {
        for (const text of h.looseTexts) {
          await m.importText(text);
          const canonical = m.exportText();
          await m.importText(canonical);
          const again = m.exportText();
          if (again !== canonical) fail("canonicalization is not idempotent on loose input");
        }
      } finally {
        m.destroy();
      }
    },
  },
];
