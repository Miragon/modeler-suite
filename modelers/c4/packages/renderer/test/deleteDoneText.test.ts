import { describe, expect, it } from "vitest";
import { deleteDoneText } from "../src/modeling/deleteDoneText.js";
import type { DeleteDoneEvent } from "../src/services.js";

const NONE = { elements: [], relationships: [] };

function done(
  fromModel: Partial<DeleteDoneEvent["fromModel"]>,
  fromView: Partial<DeleteDoneEvent["fromView"]> = {},
): DeleteDoneEvent {
  return {
    view: "Containers-bookshop",
    fromModel: { ...NONE, ...fromModel },
    fromView: { ...NONE, ...fromView },
  };
}

describe("what Delete did, as the toast and the notification say it (SPEC 5.4)", () => {
  it("names one element removed from the view, which stays in the model", () => {
    expect(deleteDoneText(done({}, { elements: ["E-mail System"] }))).toBe(
      "Removed E-mail System from this view. It stays in the model.",
    );
  });

  it("names one element deleted from the model, since no other view showed it", () => {
    expect(deleteDoneText(done({ elements: ["Notifications"] }))).toBe(
      "Deleted Notifications from the model. No other view showed it.",
    );
  });

  it("names one relationship by its ends", () => {
    expect(deleteDoneText(done({}, { relationships: ["Web App → API"] }))).toBe(
      "Removed the relationship Web App → API from this view. It stays in the model.",
    );
  });

  it("counts several items per kind", () => {
    expect(
      deleteDoneText(done({ elements: ["Orders", "Catalogue"], relationships: ["A → B"] })),
    ).toBe("Deleted 2 elements and 1 relationship from the model. No other view showed them.");
    expect(deleteDoneText(done({}, { relationships: ["A → B", "B → C"] }))).toBe(
      "Removed 2 relationships from this view. They stay in the model.",
    );
  });

  it("says both when Delete took some from the model and some from the view", () => {
    expect(
      deleteDoneText(
        done({ elements: ["Notifications"] }, { elements: ["E-mail System", "Payment Provider"] }),
      ),
    ).toBe("Deleted Notifications from the model and removed 2 elements from this view.");
  });

  it("says nothing when no selected item went", () => {
    expect(deleteDoneText(done({}))).toBeUndefined();
  });
});
