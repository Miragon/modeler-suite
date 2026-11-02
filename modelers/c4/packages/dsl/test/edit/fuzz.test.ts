import { fileURLToPath } from "node:url";
import { viewCatalog, viewMembers } from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { readBases, runFuzzSequence, type FuzzStep } from "../../scripts/write-fuzz-outputs.mjs";
import { applyEdit, applyTextEdits } from "../../src/edit/apply.js";
import { parseWorkspace } from "../../src/parse.js";

const API = { parseWorkspace, applyEdit, viewCatalog, viewMembers };
const BASES = readBases(fileURLToPath(new URL("../fixtures/structurizr", import.meta.url)));
const SEQUENCES = 2000;
const CHUNK = 100;

/** Every element the edit did not target exists afterwards with the same kind and parent. */
function untouchedSurvive(step: FuzzStep): string | undefined {
  if (!step.outcome.ok) return undefined;
  const renamed = new Map(
    step.outcome.idChanges
      .filter((change) => change.kind === "element")
      .map((change) => [change.from, change.to]),
  );
  const after = new Map(
    step.outcome.document.workspace.elements.map((element) => [element.id, element]),
  );
  const targeted = new Set<string>();
  const edit = step.edit;
  if (edit.type === "deleteFromModel" || edit.type === "smartDelete") {
    for (const id of edit.ids) targeted.add(id);
    for (const element of step.before.workspace.elements) {
      for (
        let parent = element.parentId;
        parent !== undefined;
        parent = step.before.workspace.elements.find(
          (candidate) => candidate.id === parent,
        )?.parentId
      ) {
        if (targeted.has(parent)) targeted.add(element.id);
      }
    }
  }
  for (const element of step.before.workspace.elements) {
    if (targeted.has(element.id)) continue;
    const id = renamed.get(element.id) ?? element.id;
    const counterpart = after.get(id);
    const parent =
      element.parentId === undefined
        ? undefined
        : (renamed.get(element.parentId) ?? element.parentId);
    if (counterpart === undefined) return `${element.id} went missing`;
    if (counterpart.kind !== element.kind || counterpart.parentId !== parent)
      return `${element.id} changed kind or parent`;
  }
  return undefined;
}

describe("edit fuzz", () => {
  for (let start = 1; start <= SEQUENCES; start += CHUNK) {
    it(`sequences ${start}..${start + CHUNK - 1}`, { timeout: 60_000 }, () => {
      const problems: string[] = [];
      for (let seed = start; seed < start + CHUNK; seed += 1) {
        const { steps } = runFuzzSequence(seed, API, BASES);
        steps.forEach((step, index) => {
          const where = `seed ${seed} step ${index} ${step.edit.type}`;
          const { outcome } = step;
          if (!outcome.ok) {
            if (outcome.reason === "verification-failed") {
              problems.push(
                `${where}: ${(outcome as { detail?: string }).detail ?? outcome.message}`,
              );
            }
            return;
          }
          if (applyTextEdits(step.before.text, outcome.edits) !== outcome.text)
            problems.push(`${where}: edits`);
          if (applyTextEdits(outcome.text, outcome.inverse) !== step.before.text)
            problems.push(`${where}: inverse`);
          if (!outcome.document.ok) problems.push(`${where}: result doesn't import`);
          const survival = untouchedSurvive(step);
          if (survival !== undefined) problems.push(`${where}: ${survival}`);
        });
      }
      expect(problems).toEqual([]);
    });
  }
});
