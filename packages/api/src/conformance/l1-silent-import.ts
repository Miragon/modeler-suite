import type { ConformanceCase } from "./harness.js";
import {
  changeEvents,
  exportOrFail,
  fail,
  firstText,
  interactionKept,
  leftOpen,
  openAndRead,
  outcomeOf,
  secondText,
  settleOf,
  skip,
} from "./support.js";

export const silentImportCases: ConformanceCase[] = [
  {
    name: "L1: importText is silent (no change events, for canonical, loose and foreign inputs)",
    async run(harness) {
      const modeler = await harness.create();
      try {
        const texts = [
          ...harness.canonicalTexts,
          ...(harness.looseTexts ?? []),
          ...(harness.foreignTexts ?? []).map((foreignText) => foreignText.text),
        ];
        for (const text of texts) {
          const { calls } = await changeEvents(harness, modeler, () =>
            modeler.importText(text).then(() => undefined),
          );
          if (calls > 0) fail(`importText fired onContentChanged ${calls}x`);
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L1: importText over EXISTING undo history is silent too",
    async run(harness) {
      // diagram-js' commandStack.clear() emits 'changed' whether or not the
      // stack is empty — but an engine that only emits when it has something
      // to clear would pass the fresh-instance case above
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        await harness.mutate(modeler);
        await settleOf(harness)();
        const { calls } = await changeEvents(harness, modeler, () =>
          modeler.importText(secondText(harness)).then(() => undefined),
        );
        if (calls > 0)
          fail(`importText over a non-empty undo history fired onContentChanged ${calls}x`);
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L1: an interaction open during importText never commits",
    async run(harness) {
      if (!harness.openInteraction) {
        return skip(
          "openInteraction is undefined — an interaction open during an import (a label editor with typed input) was not verified",
        );
      }
      const openInteraction = harness.openInteraction;
      const first = firstText(harness);
      const second = harness.canonicalTexts[1];
      const modeler = await harness.create();
      try {
        const legs: Array<{ text: string; expected: string; what: string }> = [];
        // a DIFFERENT document usually removes the edited element (a commit
        // would land on a removed element); the SAME document keeps it (a
        // commit would write the typed input into the re-imported document)
        if (second !== undefined) {
          await modeler.importText(second);
          const expected = exportOrFail(modeler, "after importing canonicalTexts[1]");
          legs.push({ text: second, expected, what: "a different document (canonicalTexts[1])" });
        }
        await modeler.importText(first);
        const firstExport = exportOrFail(modeler, "after importing canonicalTexts[0]");
        legs.push({
          text: first,
          expected: firstExport,
          what: "the same document again (canonicalTexts[0])",
        });
        let advice: string | undefined;
        for (const [index, leg] of legs.entries()) {
          await modeler.importText(first);
          const opened = await openAndRead(harness, modeler, openInteraction);
          const { calls } = await changeEvents(harness, modeler, () =>
            modeler.importText(leg.text).then(() => undefined),
          );
          if (calls > 0) {
            fail(
              `importing ${leg.what} over an open interaction fired onContentChanged ${calls}x — the interaction committed during or because of the import (if every import emits, see the L1 cases first)`,
            );
          }
          const reopened = harness.interactionState?.(modeler);
          if (
            exportOrFail(modeler, `after importing ${leg.what} over an open interaction`) !==
            leg.expected
          ) {
            fail(
              `importing ${leg.what} over an open interaction did not leave that document — the interaction's input was applied to it`,
            );
          }
          if (harness.undo) {
            await harness.undo(modeler);
            await settleOf(harness)();
            if (
              exportOrFail(modeler, `after an undo that followed importing ${leg.what}`) !==
              leg.expected
            ) {
              fail(
                `undo after importing ${leg.what} over an open interaction changed the document — the interaction was committed onto the fresh undo history (L4)`,
              );
            }
          }
          const sameDocument = index === legs.length - 1;
          if (sameDocument && opened !== undefined && !interactionKept(opened, reopened)) {
            const input =
              opened.text === undefined ? "" : ` with the input ${JSON.stringify(opened.text)}`;
            advice = `an interaction on '${opened.elementId}'${input} did not survive a re-import of the same document (the import ${leftOpen(reopened)}) — RECOMMENDED: keep the typed input and reopen the interaction on the element with the same id, so a remote re-import does not cost the user what they were typing`;
          }
        }
        const unverified = [
          ...(second === undefined
            ? [
                "canonicalTexts holds one text — importing a DIFFERENT document over an open interaction was not verified (add a second canonical text)",
              ]
            : []),
          ...(harness.interactionState
            ? []
            : [
                "interactionState is undefined — the RECOMMENDED keep-and-reopen of an interaction across an import was not checked (pass interactionState to check it)",
              ]),
        ];
        return outcomeOf(advice === undefined ? {} : { advisories: [advice] }, unverified);
      } finally {
        modeler.destroy();
      }
    },
  },
];
