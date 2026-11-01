import type { EditNotice } from "@miragon/c4-dsl";

/*
 * What the webview asks the host to show as a notification (guide §13.5: no toasts in the
 * webview), only after an action the user triggered.
 */

/** The Parent View command at the top of the hierarchy (SPEC 4.5: a landscape has no parent). */
export const NO_PARENT_VIEW_MESSAGE =
  "The System Landscape is the top view: it has no parent view.";

/** Go to View… named a view the file no longer has (it changed while the QuickPick was open). */
export function viewMissingMessage(key: string): string {
  return `Couldn't open the view ${key}: the file doesn't have it any more.`;
}

/**
 * What the edit layer reports after an edit it applied (SPEC 3.4), in the words of the web app's
 * info toast (guide §9: the texts are the same in every host; webviewMessages.test.ts compares).
 */
export const NOTICE_MESSAGES: Readonly<Record<EditNotice, string>> = {
  "implied-relationship-appears":
    "An implied relationship shows in its place. It comes from a relationship between the elements inside.",
  "relationship-after-deployment":
    "The relationship is written after a deployment environment, so Structurizr won't add it to the deployed instances.",
  "include-not-updated": "Included files aren't read, so references there are not removed.",
  "identifier-may-collide": "Included files aren't read, so they may already use this identifier.",
};

/**
 * Notices about the workspace rather than the edit: they hold for every edit of a workspace that
 * includes other files, so the user reads each once per editor, not after every element.
 */
const ONCE_PER_EDITOR: ReadonlySet<EditNotice> = new Set([
  "include-not-updated",
  "identifier-may-collide",
]);

/** The message of each notice to show, or `undefined` for one this editor showed already. */
export function noticeMessages(): (notice: EditNotice) => string | undefined {
  const shown = new Set<EditNotice>();
  return (notice) => {
    if (!Object.hasOwn(NOTICE_MESSAGES, notice)) return undefined;
    const message = NOTICE_MESSAGES[notice];
    if (ONCE_PER_EDITOR.has(notice)) {
      if (shown.has(notice)) return undefined;
      shown.add(notice);
    }
    return message;
  };
}
