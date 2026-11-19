import type { ConformanceCase } from "./harness.js";
import { changeEvents, defaultSettle, exportOrFail, fail, secondText, skip } from "./support.js";

export const silentImportCases: ConformanceCase[] = [
  {
    name: "L1: importText is silent (no change events, for canonical, loose and foreign inputs)",
    async run(h) {
      const m = await h.create();
      try {
        const texts = [
          ...h.canonicalTexts,
          ...(h.looseTexts ?? []),
          ...(h.foreignTexts ?? []).map((f) => f.text),
        ];
        for (const text of texts) {
          const { calls } = await changeEvents(h, m, () =>
            m.importText(text).then(() => undefined),
          );
          if (calls > 0) fail(`importText fired onContentChanged ${calls}x`);
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L1: importText over EXISTING undo history is silent too",
    async run(h) {
      // diagram-js' commandStack.clear() emits 'changed' whether or not the
      // stack is empty — but an engine that only emits when it has something
      // to clear would pass the fresh-instance case above
      const m = await h.create();
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        await h.mutate(m);
        await (h.settle ?? defaultSettle)();
        const { calls } = await changeEvents(h, m, () =>
          m.importText(secondText(h)).then(() => undefined),
        );
        if (calls > 0)
          fail(`importText over a non-empty undo history fired onContentChanged ${calls}x`);
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "L1: an interaction open during importText never commits",
    async run(h) {
      if (!h.openInteraction) {
        return skip(
          "openInteraction is undefined — an interaction open during an import (a label editor with typed input) was not verified",
        );
      }
      const openInteraction = h.openInteraction;
      const first = h.canonicalTexts[0] ?? "";
      const second = h.canonicalTexts[1];
      const m = await h.create();
      try {
        const legs: Array<{ text: string; expected: string; what: string }> = [];
        // a DIFFERENT document usually removes the edited element (a commit
        // would land on a removed element); the SAME document keeps it (a
        // commit would write the typed input into the re-imported document)
        if (second !== undefined) {
          await m.importText(second);
          const expected = exportOrFail(m, "after importing canonicalTexts[1]");
          legs.push({ text: second, expected, what: "a different document (canonicalTexts[1])" });
        }
        await m.importText(first);
        const firstExport = exportOrFail(m, "after importing canonicalTexts[0]");
        legs.push({
          text: first,
          expected: firstExport,
          what: "the same document again (canonicalTexts[0])",
        });
        let advice: string | undefined;
        for (const [index, leg] of legs.entries()) {
          await m.importText(first);
          await openInteraction(m);
          await (h.settle ?? defaultSettle)();
          const opened = h.interactionState?.(m);
          if (h.interactionState && opened === undefined) {
            fail(
              "interactionState reports no interaction after openInteraction — the case proves nothing",
            );
          }
          const { calls } = await changeEvents(h, m, () =>
            m.importText(leg.text).then(() => undefined),
          );
          if (calls > 0) {
            fail(
              `importing ${leg.what} over an open interaction fired onContentChanged ${calls}x — the interaction committed during or because of the import (if every import emits, see the L1 cases first)`,
            );
          }
          const reopened = h.interactionState?.(m);
          if (
            exportOrFail(m, `after importing ${leg.what} over an open interaction`) !== leg.expected
          ) {
            fail(
              `importing ${leg.what} over an open interaction did not leave that document — the interaction's input was applied to it`,
            );
          }
          if (h.undo) {
            await h.undo(m);
            await (h.settle ?? defaultSettle)();
            if (
              exportOrFail(m, `after an undo that followed importing ${leg.what}`) !== leg.expected
            ) {
              fail(
                `undo after importing ${leg.what} over an open interaction changed the document — the interaction was committed onto the fresh undo history (L4)`,
              );
            }
          }
          const sameDocument = index === legs.length - 1;
          const kept = reopened?.elementId === opened?.elementId && reopened?.text === opened?.text;
          if (sameDocument && opened !== undefined && !kept) {
            const input =
              opened.text === undefined ? "" : ` with the input ${JSON.stringify(opened.text)}`;
            const after =
              reopened === undefined ? "closed it" : `left ${JSON.stringify(reopened)} open`;
            advice = `an interaction on '${opened.elementId}'${input} did not survive a re-import of the same document (the import ${after}) — RECOMMENDED: keep the typed input and reopen the interaction on the element with the same id, so a remote re-import does not cost the user what they were typing`;
          }
        }
        const unverified = [
          ...(second === undefined
            ? [
                "canonicalTexts holds one text — importing a DIFFERENT document over an open interaction was not verified (add a second canonical text)",
              ]
            : []),
          ...(h.interactionState
            ? []
            : [
                "interactionState is undefined — the RECOMMENDED keep-and-reopen of an interaction across an import was not checked (pass interactionState to check it)",
              ]),
        ];
        return {
          ...(unverified.length > 0 ? { skipped: unverified.join("; ") } : {}),
          ...(advice === undefined ? {} : { advisories: [advice] }),
        };
      } finally {
        m.destroy();
      }
    },
  },
];
