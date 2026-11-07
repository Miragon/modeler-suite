import { describe, expect, test } from "vitest";
import { isMergeConflict } from "@miragon/modeler-api";
import { mergeValueChainText } from "../src/collaborative/merge.js";
import { VALUE_CHAIN_MERGE_FIXTURES } from "./support/merge-fixtures.js";

// The merge kit itself runs in test:browser (conformance.browser.test.ts), next to the contract.
describe("mergeValueChainText", () => {
  const { base, conflicting } = VALUE_CHAIN_MERGE_FIXTURES;

  test("names the step both sides renamed", () => {
    const [renamed] = conflicting;
    try {
      mergeValueChainText(base, renamed!.external, renamed!.draft);
      throw new Error("no conflict");
    } catch (error) {
      expect(isMergeConflict(error) && error.conflictingIds).toEqual(["step_order"]);
    }
  });

  test("names a connection the outside removed the target of", () => {
    const [, dangling] = conflicting;
    try {
      mergeValueChainText(base, dangling!.external, dangling!.draft);
      throw new Error("no conflict");
    } catch (error) {
      expect(isMergeConflict(error) && error.conflictingIds).toEqual(["flow_2"]);
    }
  });

  test("merges a blank draft as the new empty diagram", () => {
    expect(mergeValueChainText("", "", "")).toBe(mergeValueChainText("", "", ""));
  });
});
