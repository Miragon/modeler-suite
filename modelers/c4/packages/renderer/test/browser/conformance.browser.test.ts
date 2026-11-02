import { afterEach, describe, test } from "vitest";
import { registerConformance } from "@miragon/modeler-api/conformance";
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
