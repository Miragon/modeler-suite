import type { ConformanceCase } from "./harness.js";
import { changeEvents, fail, same, skip, sortedIds } from "./support.js";

export const definedUndoCase: ConformanceCase = {
  name: "L4: undo directly after an import is a no-op",
  async run(h) {
    if (!h.undo) return skip("undo is undefined — the notation declares no undo");
    const first = h.canonicalTexts[0];
    const second = h.canonicalTexts[1];
    if (first === undefined || second === undefined || first === second) {
      fail("the L4 case needs TWO DISTINCT canonicalTexts — with one, stale undo is undetectable");
    }
    const m = await h.create();
    try {
      await m.importText(first);
      await h.mutate(m);
      await h.mutate(m);
      // leg 1 — GUARANTEED id coincidence: re-import the mutated document
      // itself. A stale diagram-js stack whose revert removes the created
      // shape by id is a silent no-op on any other document and deletes a
      // re-imported element on this one — the tt drift as it really bites
      const mutated = m.exportText();
      await m.importText(mutated);
      const baselineSame = m.exportText();
      const idsSame = sortedIds(m);
      const { calls } = await changeEvents(h, m, () => h.undo!(m));
      if (calls > 0)
        fail(
          "undo directly after importText fired onContentChanged — history housekeeping is not a change",
        );
      if (m.exportText() !== baselineSame || (idsSame && !same(idsSame, sortedIds(m)))) {
        fail(
          "undo after importText removed a re-imported element by id coincidence (stale history applied)",
        );
      }
      // leg 2 — a DIFFERENT document replaces the doc; a snapshot-restoring
      // stale stack would resurrect the previous one
      await h.mutate(m);
      await m.importText(second);
      const baseline = m.exportText();
      await h.undo(m);
      await h.undo(m); // drain a stale multi-entry history too
      if (m.exportText() !== baseline) {
        fail("undo after importText mutated the freshly imported document (stale history applied)");
      }
    } finally {
      m.destroy();
    }
  },
};
