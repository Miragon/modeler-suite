import { describe, expect, it } from "vitest";
import type { EditRefusal } from "@miragon/c4-dsl";
import { refusalLevel, refusedEvent } from "../src/modeling/refusalLevel.js";
import type { RefusalLevel } from "../src/services.js";

/** Every reason the edit layer and the renderer refuse with, and how the apps show it (guide §9). */
const EXPECTED: Readonly<Record<EditRefusal, RefusalLevel>> = {
  "read-only": "info",
  "view-not-editable": "info",
  "field-not-editable": "info",
  "unrepresentable-value": "info",
  "name-taken": "info",
  "identifier-invalid": "info",
  "identifier-taken": "info",
  "referenced-by-opaque": "info",
  "view-in-use": "info",
  "not-allowed": "info",
  "relationship-exists": "info",
  "verification-failed": "danger",
};

describe("the level of a refusal", () => {
  it("is info for every rule a refusal explains", () => {
    for (const [reason, level] of Object.entries(EXPECTED) as [EditRefusal, RefusalLevel][]) {
      expect(refusalLevel(reason), reason).toBe(level);
    }
  });

  it("is danger only where the edit layer's own splice failed verification", () => {
    const failures = (Object.keys(EXPECTED) as EditRefusal[]).filter(
      (reason) => refusalLevel(reason) === "danger",
    );
    expect(failures).toEqual(["verification-failed"]);
  });

  it("is danger for a reason a later edit layer adds, until it is placed", () => {
    expect(refusalLevel("a-later-reason" as EditRefusal)).toBe("danger");
    expect(refusalLevel("toString" as EditRefusal)).toBe("danger");
  });

  it("goes with the event the renderer fires", () => {
    expect(
      refusedEvent(
        "not-allowed",
        "A system context view always shows its system. To leave it out, delete the view.",
      ),
    ).toEqual({
      reason: "not-allowed",
      message: "A system context view always shows its system. To leave it out, delete the view.",
      level: "info",
    });
    expect(refusedEvent("verification-failed", "Couldn't write this change.").level).toBe("danger");
  });
});
