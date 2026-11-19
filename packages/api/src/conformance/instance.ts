import { apiVersionsCompatible, type CollaborativeModeler, MODELER_API_VERSION } from "../index.js";
import type { ConformanceCase } from "./harness.js";
import {
  changeEvents,
  exportOrFail,
  fail,
  importOrFail,
  raceTheBound,
  settleOf,
} from "./support.js";

const PRE_IMPORT_CALL_BOUND_MS = 2000;

const toleratedCall = (action: () => Promise<void> | void): Promise<void> =>
  raceTheBound(
    Promise.resolve()
      .then(action)
      .catch(() => undefined),
    undefined,
    PRE_IMPORT_CALL_BOUND_MS,
  );

export const instanceCases: ConformanceCase[] = [
  {
    name: "meta declares the notation, editability and a compatible apiVersion",
    async run(h) {
      const m = await h.create();
      try {
        if (!m.meta.notation) fail("meta.notation is empty");
        if (m.meta.editable !== true)
          fail("create() must return an EDITABLE modeler (meta.editable === true)");
        if (!apiVersionsCompatible(m.meta.apiVersion, MODELER_API_VERSION)) {
          fail(`apiVersion ${m.meta.apiVersion} is not compatible with ${MODELER_API_VERSION}`);
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "calls before the first import never wedge the instance",
    async run(h) {
      const m = await h.create();
      let control: CollaborativeModeler | undefined;
      try {
        // what these return without a document is the modeler's choice —
        // only the instance has to survive them
        try {
          m.exportText();
        } catch {
          // a throw before the first import is allowed
        }
        await toleratedCall(() => h.mutate(m));
        await settleOf(h)();
        control = await h.create();
        const texts = h.canonicalTexts.length > 0 ? h.canonicalTexts.slice(0, 2) : [""];
        let last = "";
        for (const [index, text] of texts.entries()) {
          const source = `canonicalTexts[${index}]`;
          // the oracle is a fresh instance's export of the same text: this
          // case isolates the pre-import calls — a non-canonical serializer
          // fails L2, not here
          await control.importText(text);
          const expected = exportOrFail(control, `after importing ${source} into a fresh instance`);
          await importOrFail(
            m,
            text,
            `importText(${source}) rejected on an instance that ran exportText() and a user command before its first import (wedged)`,
          );
          last = exportOrFail(
            m,
            `after importing ${source} into an instance used before its first import`,
          );
          if (last !== expected) {
            fail(
              `importText(${source}) on an instance that ran exportText() and a user command before its first import did not render that document:\n--- expected (a fresh instance's export)\n${expected}\n--- got\n${last}`,
            );
          }
        }
        const { calls } = await changeEvents(h, m, () => h.mutate(m));
        if (calls === 0) {
          fail(
            "a user mutation fired no onContentChanged on an instance used before its first import (wedged)",
          );
        }
        if (
          exportOrFail(m, "after a user mutation on an instance used before its first import") ===
          last
        ) {
          fail(
            "a user mutation did not apply on an instance used before its first import (wedged)",
          );
        }
      } finally {
        m.destroy();
        control?.destroy();
      }
    },
  },
];
