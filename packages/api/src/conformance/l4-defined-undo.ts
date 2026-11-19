import type { ConformanceCase } from "./harness.js";
import { changeEvents, fail, same, skip, sortedIds } from "./support.js";

export const definedUndoCase: ConformanceCase = {
  name: "L4: undo directly after an import is a no-op",
  async run(harness) {
    if (!harness.undo) return skip("undo is undefined — the notation declares no undo");
    const first = harness.canonicalTexts[0];
    const second = harness.canonicalTexts[1];
    if (first === undefined || second === undefined || first === second) {
      fail("the L4 case needs TWO DISTINCT canonicalTexts — with one, stale undo is undetectable");
    }
    const modeler = await harness.create();
    try {
      await modeler.importText(first);
      await harness.mutate(modeler);
      await harness.mutate(modeler);
      // leg 1 — GUARANTEED id coincidence: re-import the mutated document
      // itself. A stale diagram-js stack whose revert removes the created
      // shape by id is a silent no-op on any other document and deletes a
      // re-imported element on this one — the tt drift as it really bites
      const mutated = modeler.exportText();
      await modeler.importText(mutated);
      const baselineSame = modeler.exportText();
      const idsSame = sortedIds(modeler);
      const { calls } = await changeEvents(harness, modeler, () => harness.undo!(modeler));
      if (calls > 0)
        fail(
          "undo directly after importText fired onContentChanged — history housekeeping is not a change",
        );
      if (
        modeler.exportText() !== baselineSame ||
        (idsSame && !same(idsSame, sortedIds(modeler)))
      ) {
        fail(
          "undo after importText removed a re-imported element by id coincidence (stale history applied)",
        );
      }
      // leg 2 — a DIFFERENT document replaces the doc; a snapshot-restoring
      // stale stack would resurrect the previous one
      await harness.mutate(modeler);
      await modeler.importText(second);
      const baseline = modeler.exportText();
      await harness.undo(modeler);
      await harness.undo(modeler); // drain a stale multi-entry history too
      if (modeler.exportText() !== baseline) {
        fail("undo after importText mutated the freshly imported document (stale history applied)");
      }
    } finally {
      modeler.destroy();
    }
  },
};
