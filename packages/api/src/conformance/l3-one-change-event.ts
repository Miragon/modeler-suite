import type { ConformanceCase } from "./harness.js";
import { changeEvents, fail, firstText, settleOf, skip } from "./support.js";

export const changeEventCases: ConformanceCase[] = [
  {
    name: "L3: a scripted user mutation fires onContentChanged, and the export already reflects it inside the listener",
    async run(harness) {
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        const before = modeler.exportText();
        const { calls, exportAtEmit } = await changeEvents(harness, modeler, () =>
          harness.mutate(modeler),
        );
        if (calls === 0) fail("a user mutation fired no onContentChanged");
        const after = modeler.exportText();
        if (after === before)
          fail("the harness mutation did not change the export — the case proves nothing");
        if (exportAtEmit !== after) {
          fail(
            "exportText() inside the onContentChanged listener did not return the post-change document (emit before apply)",
          );
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L3: config/axis edits fire onContentChanged too, with the export already updated",
    async run(harness) {
      if (harness.configMutations === undefined) {
        return skip(
          "configMutations is undefined — pass [] if the notation has no config/axis/title surface",
        );
      }
      for (const mutation of harness.configMutations) {
        const modeler = await harness.create();
        try {
          await modeler.importText(firstText(harness));
          const before = modeler.exportText();
          const { calls, exportAtEmit } = await changeEvents(harness, modeler, () =>
            mutation.run(modeler),
          );
          if (calls === 0) fail(`config mutation "${mutation.name}" fired no onContentChanged`);
          const after = modeler.exportText();
          if (after === before) {
            fail(
              `config mutation "${mutation.name}" did not change the export — the case proves nothing`,
            );
          }
          if (exportAtEmit !== after) {
            fail(
              `exportText() inside the listener of config mutation "${mutation.name}" did not return the post-change document`,
            );
          }
        } finally {
          modeler.destroy();
        }
      }
    },
  },
  {
    name: "L3: unsubscribe stops delivery",
    async run(harness) {
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        let calls = 0;
        const off = modeler.onContentChanged(() => {
          calls += 1;
        });
        off();
        await harness.mutate(modeler);
        await settleOf(harness)();
        if (calls > 0) fail("onContentChanged delivered after unsubscribe");
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L3: undo and redo fire onContentChanged and restore the export",
    async run(harness) {
      if (!harness.undo) return skip("undo is undefined — the notation declares no undo");
      const undo = harness.undo;
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        const before = modeler.exportText();
        await harness.mutate(modeler);
        await settleOf(harness)();
        const mutated = modeler.exportText();
        const undone = await changeEvents(harness, modeler, () => undo(modeler));
        if (undone.calls === 0)
          fail("undo fired no onContentChanged — the host would never export the undone state");
        if (modeler.exportText() !== before)
          fail("undo of a single mutation did not restore the pre-mutation export");
        if (undone.exportAtEmit !== before)
          fail("exportText() inside the undo listener did not return the undone document");
        if (!harness.redo)
          return skip(
            "redo is undefined — the redo half of this case was not verified (pass redo to verify it)",
          );
        const redo = harness.redo;
        const redone = await changeEvents(harness, modeler, () => redo(modeler));
        if (redone.calls === 0) fail("redo fired no onContentChanged");
        if (modeler.exportText() !== mutated) fail("redo did not restore the mutated export");
        if (redone.exportAtEmit !== mutated)
          fail("exportText() inside the redo listener did not return the redone document");
      } finally {
        modeler.destroy();
      }
    },
  },
];
