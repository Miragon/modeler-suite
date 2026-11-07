import { afterEach, describe, test } from "vitest";
import { registerConformance, registerMergeConformance } from "@miragon/modeler-api/conformance";
import { mergeC4Text } from "../../src/index.js";
import { C4_MERGE_FIXTURES } from "./merge-fixtures.js";
import { harness, removeHarnessHosts } from "./support/harness.js";

describe("the renderer implements the collaborative-modeler contract", () => {
  afterEach(removeHarnessHosts);

  // Every hook is filled and the renderer follows every recommendation, so a skip is a gap of the
  // harness and an advisory a regression: either fails the case it comes from.
  registerConformance(harness, test, {
    onSkip(caseName, reason) {
      throw new Error(`conformance case skipped: "${caseName}": ${reason}`);
    },
    onAdvisory(caseName, advice) {
      throw new Error(`conformance advisory: "${caseName}": ${advice}`);
    },
  });
});

// The merge an IDE host (Orca) calls when an agent writes the file under the user's unsaved edits.
describe("C4 merges an outside write into a draft", () => {
  registerMergeConformance(mergeC4Text, C4_MERGE_FIXTURES, test);
});
