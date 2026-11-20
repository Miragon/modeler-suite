import type { ConformanceCase, ConformanceHarness } from "./harness.js";
import {
  changeEvents,
  exportOrFail,
  fail,
  firstText,
  importOrFail,
  same,
  secondText,
  settleOf,
  skip,
  sortedIds,
} from "./support.js";

interface Probe {
  label: string;
  text: string;
}

const describeProbe = (probe: Probe): string => {
  const excerpt = probe.text.length > 40 ? `${probe.text.slice(0, 40)}…` : probe.text;
  return `${probe.label} (${JSON.stringify(excerpt)})`;
};

/**
 * damaged forms of every canonical text — what a host re-imports while a
 * peer is still typing (cut mid-way, the last character missing) or after a
 * transport glitch (a trailing NUL) — plus the harness's own probeTexts.
 * Cuts fall on code points, never inside a surrogate pair; duplicates are
 * dropped so each input runs once
 */
function probesOf(harness: ConformanceHarness): Probe[] {
  const probes: Probe[] = [];
  harness.canonicalTexts.forEach((text, index) => {
    const source = `canonicalTexts[${index}]`;
    const codePoints = Array.from(text);
    const cut = (length: number): string => codePoints.slice(0, length).join("");
    probes.push(
      { label: `the first half of ${source}`, text: cut(Math.floor(codePoints.length / 2)) },
      { label: `the first third of ${source}`, text: cut(Math.floor(codePoints.length / 3)) },
      { label: `${source} without its last character`, text: cut(codePoints.length - 1) },
      { label: `${source} followed by a NUL character`, text: `${text}\u0000` },
    );
  });
  (harness.probeTexts ?? []).forEach((text, index) =>
    probes.push({ label: `probeTexts[${index}]`, text }),
  );
  const seen = new Set<string>();
  return probes.filter((probe) => {
    if (seen.has(probe.text)) return false;
    seen.add(probe.text);
    return true;
  });
}

export const rejectedImportCases: ConformanceCase[] = [
  {
    name: "L7: a rejected import leaves no trace",
    async run(harness) {
      if (harness.invalidTexts === undefined) {
        return skip(
          "invalidTexts is undefined — pass [] if the notation has no non-importable text",
        );
      }
      if (harness.invalidTexts.length === 0) return;
      const modeler = await harness.create();
      try {
        const text = firstText(harness);
        await modeler.importText(text);
        const beforeEdit = modeler.exportText();
        // with undo history on the stack: a rejected import must leave it
        // intact too (an engine that erases history BEFORE parsing does not)
        if (harness.undo) {
          await harness.mutate(modeler);
          await settleOf(harness)();
        }
        const doc = modeler.exportText();
        const ids = sortedIds(modeler);
        for (const bad of harness.invalidTexts) {
          let rejected = false;
          const { calls } = await changeEvents(harness, modeler, () =>
            modeler.importText(bad).then(
              () => undefined,
              () => {
                rejected = true;
              },
            ),
          );
          if (!rejected) fail("importText resolved for a non-importable input — it must REJECT");
          if (calls > 0) fail("a rejected import fired onContentChanged");
          if (modeler.exportText() !== doc)
            fail("a rejected import changed the document — the previous state must stay intact");
          if (ids && !same(ids, sortedIds(modeler))) {
            fail(
              "a rejected import changed the rendered elements — the canvas must keep the previous document",
            );
          }
        }
        if (harness.undo) {
          await harness.undo(modeler);
          if (modeler.exportText() !== beforeEdit) {
            fail(
              "a rejected import erased the undo history — the previous document's history must stay intact",
            );
          }
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L7: the modeler stays usable after a rejected import",
    async run(harness) {
      if (harness.invalidTexts === undefined) {
        return skip(
          "invalidTexts is undefined — pass [] if the notation has no non-importable text",
        );
      }
      const bad = harness.invalidTexts[0];
      if (bad === undefined) return;
      const modeler = await harness.create();
      try {
        await modeler.importText(firstText(harness));
        await modeler.importText(bad).then(
          () => fail("importText resolved for a non-importable input — it must REJECT"),
          () => undefined,
        );
        const next = secondText(harness);
        await importOrFail(modeler, next, "the next VALID import after a rejection did not render");
        if (modeler.exportText() !== next)
          fail("the next valid import after a rejection did not replace the document");
        const before = modeler.exportText();
        const { calls } = await changeEvents(harness, modeler, () => harness.mutate(modeler));
        if (calls === 0)
          fail("a user mutation after a rejected import fired no onContentChanged (wedged)");
        if (exportOrFail(modeler, "after a mutation that followed a rejected import") === before) {
          fail("a user mutation after a rejected import did not apply (wedged)");
        }
        if (harness.undo) {
          await harness.undo(modeler);
          exportOrFail(modeler, "after an undo that followed a rejected import");
        }
      } finally {
        modeler.destroy();
      }
    },
  },
  {
    name: "L7: every rejection of a derived probe leaves no trace",
    async run(harness) {
      const base = firstText(harness);
      const modeler = await harness.create();
      try {
        await modeler.importText(base);
        const baseline = exportOrFail(modeler, "after importing canonicalTexts[0]");
        const baseIds = sortedIds(modeler);
        let previous: Probe | undefined;
        const reimportBase = async (): Promise<void> => {
          if (previous === undefined) return;
          const after = `after importing ${describeProbe(previous)}`;
          await importOrFail(modeler, base, `the next valid import ${after} did not render`);
          const doc = exportOrFail(modeler, `on the next valid import ${after}`);
          if (doc !== baseline || (baseIds && !same(baseIds, sortedIds(modeler)))) {
            fail(`the next valid import ${after} did not replace the document (wedged)`);
          }
        };
        const mutateAndExpectApplied = async (): Promise<string> => {
          await harness.mutate(modeler);
          await settleOf(harness)();
          const doc = exportOrFail(modeler, "after a user mutation");
          if (doc === baseline) {
            fail(
              previous === undefined
                ? "the harness mutation did not change the export — the case proves nothing"
                : `a user mutation after importing ${describeProbe(previous)} did not apply (wedged)`,
            );
          }
          return doc;
        };
        for (const probe of probesOf(harness)) {
          await reimportBase();
          // a document WITH undo history: a rejection must keep both
          const doc = await mutateAndExpectApplied();
          const ids = sortedIds(modeler);
          const what = `importText(${describeProbe(probe)})`;
          let rejected = false;
          const { calls } = await changeEvents(harness, modeler, () =>
            modeler.importText(probe.text).then(
              () => undefined,
              () => {
                rejected = true;
              },
            ),
          );
          if (rejected) {
            if (calls > 0) fail(`a rejected ${what} fired onContentChanged ${calls}x (L7)`);
            if (exportOrFail(modeler, `after a rejected ${what}`) !== doc) {
              fail(
                `a rejected ${what} changed the document — the previous state must stay intact (L7)`,
              );
            }
            if (ids && !same(ids, sortedIds(modeler))) {
              fail(
                `a rejected ${what} changed the rendered elements — the canvas must keep the previous document (L7)`,
              );
            }
            if (harness.undo) {
              await harness.undo(modeler);
              if (
                exportOrFail(modeler, `after an undo that followed a rejected ${what}`) !== baseline
              ) {
                fail(
                  `a rejected ${what} erased the undo history — the previous document's history must stay intact (L7)`,
                );
              }
            }
          } else {
            if (calls > 0)
              fail(
                `${what} resolved and fired onContentChanged ${calls}x — an import is silent (L1)`,
              );
            exportOrFail(modeler, `after ${what} resolved (L6)`);
          }
          previous = probe;
        }
        await reimportBase();
        await mutateAndExpectApplied();
      } finally {
        modeler.destroy();
      }
    },
  },
];
