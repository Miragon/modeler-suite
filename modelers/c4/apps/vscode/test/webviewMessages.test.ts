import { describe, expect, it } from "vitest";
import type { EditNotice } from "@miragon/c4-dsl";
import { noticeText } from "../../webapp/src/notices.js";
import {
  NOTICE_MESSAGES,
  NO_PARENT_VIEW_MESSAGE,
  noticeMessages,
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
