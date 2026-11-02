import { describe, expect, it } from "vitest";
import { refusalToast } from "../src/notices.js";

const RULE = "A system context view always shows its system. To leave it out, delete the view.";
const FAILURE = "Couldn't write this change into the DSL. Edit the text instead.";

describe("a refused edit, as its toast says it (guide §9)", () => {
  it("explains a rule in an info toast", () => {
    expect(refusalToast({ reason: "not-allowed", message: RULE, level: "info" })).toEqual({
      status: "info",
      text: RULE,
    });
  });

  it("reports an edit that went wrong in a danger toast", () => {
    expect(
      refusalToast({ reason: "verification-failed", message: FAILURE, level: "danger" }),
    ).toEqual({ status: "danger", text: FAILURE });
  });

  it("takes a refusal that names no level for a failure", () => {
    expect(refusalToast({ reason: "not-allowed", message: RULE })).toEqual({
      status: "danger",
      text: RULE,
    });
  });
});
