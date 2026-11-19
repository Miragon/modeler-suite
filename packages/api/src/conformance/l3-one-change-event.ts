import type { ConformanceCase } from "./harness.js";
import { changeEvents, defaultSettle, fail, skip } from "./support.js";

export const changeEventCases: ConformanceCase[] = [
  {
    name: "L3: a scripted user mutation fires onContentChanged, and the export already reflects it inside the listener",
    async run(h) {
      const m = await h.create();
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        const before = m.exportText();
        const { calls, exportAtEmit } = await changeEvents(h, m, () => h.mutate(m));
        if (calls === 0) fail("a user mutation fired no onContentChanged");
        const after = m.exportText();
        if (after === before)
          fail("the harness mutation did not change the export — the case proves nothing");
        if (exportAtEmit !== after) {
          fail(
            "exportText() inside the onContentChanged listener did not return the post-change document (emit before apply)",
          );
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L3: config/axis edits fire onContentChanged too, with the export already updated",
    async run(h) {
      if (h.configMutations === undefined) {
        return skip(
          "configMutations is undefined — pass [] if the notation has no config/axis/title surface",
        );
      }
      for (const mutation of h.configMutations) {
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          const before = m.exportText();
          const { calls, exportAtEmit } = await changeEvents(h, m, () => mutation.run(m));
          if (calls === 0) fail(`config mutation "${mutation.name}" fired no onContentChanged`);
          const after = m.exportText();
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
          m.destroy();
        }
      }
    },
  },
  {
    name: "L3: unsubscribe stops delivery",
    async run(h) {
      const m = await h.create();
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        let calls = 0;
        const off = m.onContentChanged(() => {
          calls += 1;
        });
        off();
        await h.mutate(m);
        await (h.settle ?? defaultSettle)();
        if (calls > 0) fail("onContentChanged delivered after unsubscribe");
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L3: undo and redo fire onContentChanged and restore the export",
    async run(h) {
      if (!h.undo) return skip("undo is undefined — the notation declares no undo");
      const undo = h.undo;
      const m = await h.create();
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        const before = m.exportText();
        await h.mutate(m);
        await (h.settle ?? defaultSettle)();
        const mutated = m.exportText();
        const undone = await changeEvents(h, m, () => undo(m));
        if (undone.calls === 0)
          fail("undo fired no onContentChanged — the host would never export the undone state");
        if (m.exportText() !== before)
          fail("undo of a single mutation did not restore the pre-mutation export");
        if (undone.exportAtEmit !== before)
          fail("exportText() inside the undo listener did not return the undone document");
        if (!h.redo)
          return skip(
            "redo is undefined — the redo half of this case was not verified (pass redo to verify it)",
          );
        const redo = h.redo;
        const redone = await changeEvents(h, m, () => redo(m));
        if (redone.calls === 0) fail("redo fired no onContentChanged");
        if (m.exportText() !== mutated) fail("redo did not restore the mutated export");
        if (redone.exportAtEmit !== mutated)
          fail("exportText() inside the redo listener did not return the redone document");
      } finally {
        m.destroy();
      }
    },
  },
];
