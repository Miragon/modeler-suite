import { describe, expect, it } from "vitest";
import type { EditNotice } from "@miragon/c4-dsl";
import type { DeleteDoneEvent, EditRefusedEvent } from "@miragon/c4-renderer";
import { noticeText, refusalToast } from "../../webapp/src/notices.js";
import {
  NOTICE_MESSAGES,
  NO_PARENT_VIEW_MESSAGE,
  deleteDoneNotification,
  noticeMessages,
  refusalNotification,
  viewMissingMessage,
} from "../src/webview/messages.js";

const ALL_MESSAGES = [
  ...Object.values(NOTICE_MESSAGES),
  NO_PARENT_VIEW_MESSAGE,
  viewMissingMessage("Containers-shop"),
];

describe("what the webview has the host show", () => {
  it("follows guide §2: a sentence that says what happened, no exclamation, no dash as a link", () => {
    for (const message of ALL_MESSAGES) {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toMatch(/!|—|–| - |please/i);
    }
  });

  it("names the view it couldn't open", () => {
    expect(viewMissingMessage("Containers-shop")).toContain("Containers-shop");
  });
});

describe("the notices after an edit", () => {
  // Guide §9: a notification of the IDE host says what the web app's toast says.
  it("read as the web app's info toasts", () => {
    for (const notice of Object.keys(NOTICE_MESSAGES) as EditNotice[]) {
      expect(NOTICE_MESSAGES[notice], notice).toBe(noticeText(notice));
    }
  });

  it("are shown after every edit that reports them", () => {
    const messageOf = noticeMessages();

    expect(messageOf("implied-relationship-appears")).toBe(
      NOTICE_MESSAGES["implied-relationship-appears"],
    );
    expect(messageOf("implied-relationship-appears")).toBe(
      NOTICE_MESSAGES["implied-relationship-appears"],
    );
    expect(messageOf("relationship-after-deployment")).toBe(
      NOTICE_MESSAGES["relationship-after-deployment"],
    );
  });

  it("about included files are shown once per editor", () => {
    const messageOf = noticeMessages();

    expect(messageOf("identifier-may-collide")).toBe(NOTICE_MESSAGES["identifier-may-collide"]);
    expect(messageOf("identifier-may-collide")).toBeUndefined();
    expect(messageOf("include-not-updated")).toBe(NOTICE_MESSAGES["include-not-updated"]);
    expect(messageOf("include-not-updated")).toBeUndefined();

    expect(noticeMessages()("identifier-may-collide")).toBe(
      NOTICE_MESSAGES["identifier-may-collide"],
    );
  });

  it("show nothing for a notice this webview doesn't know", () => {
    const messageOf = noticeMessages() as (notice: string) => string | undefined;
    expect(messageOf("a-later-notice")).toBeUndefined();
  });
});

const RULE: EditRefusedEvent = {
  reason: "not-allowed",
  message: "A system context view always shows its system. To leave it out, delete the view.",
  level: "info",
};
const FAILURE: EditRefusedEvent = {
  reason: "verification-failed",
  message: "Couldn't write this change into the DSL. Edit the text instead.",
  level: "danger",
};

describe("a refused edit", () => {
  it("explains a rule in an info notification, not an error", () => {
    expect(refusalNotification(RULE)).toEqual({ type: "info", message: RULE.message });
  });

  it("reports an edit that went wrong as an error", () => {
    expect(refusalNotification(FAILURE)).toEqual({ type: "error", message: FAILURE.message });
  });

  it("is an error when the refusal names no level", () => {
    expect(refusalNotification({ reason: "not-allowed", message: RULE.message })).toEqual({
      type: "error",
      message: RULE.message,
    });
  });

  // Guide §13.5: the host's notification has the level of the web app's toast.
  it("has the level and the words of the web app's toast", () => {
    const levels = { info: "info", danger: "error" } as const;
    for (const event of [RULE, FAILURE, { reason: "not-allowed", message: "x." } as const]) {
      const toast = refusalToast(event);
      expect(refusalNotification(event)).toEqual({
        type: levels[toast.status],
        message: toast.text,
      });
    }
  });
});

const NOTHING: DeleteDoneEvent["fromView"] = { elements: [], relationships: [] };

function deleted(fromModel: DeleteDoneEvent["fromModel"], fromView = NOTHING): DeleteDoneEvent {
  return { view: "Containers-bookshop", fromModel, fromView };
}

describe("what Delete did", () => {
  it("says the element left only this view, in an info notification", () => {
    expect(
      deleteDoneNotification(deleted(NOTHING, { ...NOTHING, elements: ["E-mail System"] })),
    ).toEqual({
      type: "info",
      message: "Removed E-mail System from this view. It stays in the model.",
    });
  });

  it("says the element went from the model when no other view showed it", () => {
    expect(deleteDoneNotification(deleted({ ...NOTHING, elements: ["Catalogue"] }))).toEqual({
      type: "info",
      message: "Deleted Catalogue from the model. No other view showed it.",
    });
  });

  it("follows guide §2 like every other message", () => {
    const message = deleteDoneNotification(
      deleted({ ...NOTHING, relationships: ["A → B"] }),
    )?.message;
    expect(message).toMatch(/^[A-Z].*\.$/);
    expect(message).not.toMatch(/!|—|–| - |please/i);
  });

  it("shows nothing when no selected item went", () => {
    expect(deleteDoneNotification(deleted(NOTHING))).toBeUndefined();
  });
});
