import type { ConformanceCase } from "./harness.js";
import {
  assertFinite,
  changeEvents,
  exportOrFail,
  fail,
  firstText,
  importContentText,
  importOrFail,
  interactionKept,
  leftOpen,
  openAndRead,
  outcomeOf,
  same,
  settleOf,
  skip,
} from "./support.js";

export const viewStateCases: ConformanceCase[] = [
  {
    name: "L5: getViewState never throws before the first import",
    async run(harness) {
      const modeler = await harness.create();
      try {
        let state: unknown;
        try {
          state = modeler.getViewState();
        } catch (error) {
          fail(`getViewState threw before the first import: ${String(error)}`);
        }
        if (state !== undefined) assertFinite(state, "before the first import");
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L5: view state round-trips across a re-import, an import fits the view — and none of it is document content",
    async run(harness) {
      if (harness.viewState === undefined) {
        return skip(
          "viewState is undefined — supply a panned/zoomed state, a no-op setViewState is otherwise undetectable",
        );
      }
      const viewState = harness.viewState;
      const modeler = await harness.create();
      try {
        const text = await importContentText(harness, modeler);
        const doc = modeler.exportText();
        const fitted = modeler.getViewState();
        assertFinite(fitted, "after the first import");
        // the modeler's OWN readback is the oracle from here on — a
        // diagram-js viewbox comes back rounded and enriched (scale, inner,
        // outer), never byte-equal to the harness literal
        modeler.setViewState(viewState);
        const applied = modeler.getViewState();
        assertFinite(applied, "after setViewState");
        if (same(applied, fitted)) {
          fail(
            "setViewState(viewState) had no effect — supply a state that differs from the fitted view",
          );
        }
        await modeler.importText(text);
        if (!same(modeler.getViewState(), fitted)) {
          fail(
            "an import must leave the view FITTED to the content (the same state the first import produced)",
          );
        }
        // the host restores with what IT read back before the re-import —
        // the readback must be settable and yield itself again
        const { calls } = await changeEvents(harness, modeler, () => modeler.setViewState(applied));
        if (calls > 0)
          fail("setViewState fired onContentChanged — view state is not document content");
        if (modeler.exportText() !== doc)
          fail("setViewState changed the export — view state leaked into the document");
        if (!same(modeler.getViewState(), applied)) {
          fail(
            "view state did not survive re-import + restore (setting the modeler's own readback must yield that readback)",
          );
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L5: a host's view change never commits an open interaction",
    async run(harness) {
      if (!harness.openInteraction) {
        return skip(
          "openInteraction is undefined — a host's view change over an open interaction (a label editor with typed input) was not verified",
        );
      }
      if (harness.viewState === undefined) {
        return skip(
          "viewState is undefined — a host's view change over an open interaction was not verified (supply a panned/zoomed state)",
        );
      }
      const openInteraction = harness.openInteraction;
      const commitInteraction = harness.commitInteraction;
      const viewState = harness.viewState;
      const settle = settleOf(harness);
      const first = firstText(harness);
      const modeler = await harness.create();
      try {
        await modeler.importText(first);
        const doc = exportOrFail(modeler, "after importing canonicalTexts[0]");
        // the document a commit writes WITHOUT a view change: proof that the
        // typed input is real, and the oracle for the commit after one
        let committed: string | undefined;
        if (commitInteraction) {
          const typed = (await openAndRead(harness, modeler, openInteraction))?.text;
          await commitInteraction(modeler);
          await settle();
          committed = exportOrFail(modeler, "after committing the interaction");
          if (committed === doc || (typed && !committed.includes(typed))) {
            fail(
              "committing the interaction openInteraction opened did not write its typed input into the export — the case proves nothing (commitInteraction must commit the way a user does, openInteraction type input the serializer writes verbatim)",
            );
          }
          await importOrFail(
            modeler,
            first,
            "re-importing canonicalTexts[0] after the commit rejected",
          );
        }
        const opened = await openAndRead(harness, modeler, openInteraction);
        const view = modeler.getViewState();
        const { calls } = await changeEvents(harness, modeler, () =>
          modeler.setViewState(viewState),
        );
        if (calls > 0) {
          fail(
            `setViewState over an open interaction fired onContentChanged ${calls}x — the host's view change committed it (L5; if every setViewState emits, see the L5 round-trip case first)`,
          );
        }
        if (exportOrFail(modeler, "after setViewState over an open interaction") !== doc) {
          fail(
            "setViewState over an open interaction changed the export — the host's view change committed it (L5)",
          );
        }
        if (same(modeler.getViewState(), view)) {
          fail(
            "setViewState(viewState) had no effect over an open interaction — the case proves nothing (supply a state that differs from the fitted view)",
          );
        }
        const after = harness.interactionState?.(modeler);
        let advice: string | undefined;
        if (opened !== undefined && !interactionKept(opened, after)) {
          const input =
            opened.text === undefined ? "" : ` with the input ${JSON.stringify(opened.text)}`;
          advice = `an interaction on '${opened.elementId}'${input} did not survive a host's view change (setViewState ${leftOpen(after)}) — RECOMMENDED: keep it open with its typed input, so the user's commit afterwards writes what it would have written without the view change`;
        } else if (commitInteraction && committed !== undefined) {
          await commitInteraction(modeler);
          await settle();
          const out = exportOrFail(modeler, "after committing the interaction after a view change");
          if (out !== committed) {
            advice = `committing an interaction after a host's view change wrote another document than committing it without one — RECOMMENDED: keep it open with its typed input across a view change (if openInteraction types different input per call, this advice is the harness's):\n--- committed without a view change\n${committed}\n--- committed after setViewState\n${out}`;
          }
        }
        return outcomeOf(
          advice === undefined ? {} : { advisories: [advice] },
          commitInteraction
            ? []
            : [
                "commitInteraction is undefined — that the typed input changes the document (without it the case may prove nothing) and that it still commits after the view change were not checked (pass commitInteraction to check both)",
              ],
        );
      } finally {
        modeler.destroy();
      }
    },
  },
];
