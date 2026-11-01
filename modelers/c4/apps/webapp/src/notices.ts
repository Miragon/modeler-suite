import type { EditNotice } from "@miragon/c4-dsl";
import type { EditRefusedEvent } from "@miragon/c4-renderer";

/** What an edit did besides what was asked (`c4.edit.notice`), as the info toast says it (guide §2). */
const NOTICE_TEXTS: Readonly<Record<EditNotice, string>> = {
  "implied-relationship-appears":
    "An implied relationship shows in its place. It comes from a relationship between the elements inside.",
  "relationship-after-deployment":
    "The relationship is written after a deployment environment, so Structurizr won't add it to the deployed instances.",
  "include-not-updated": "Included files aren't read, so references there are not removed.",
  "identifier-may-collide": "Included files aren't read, so they may already use this identifier.",
};

export function noticeText(notice: EditNotice): string {
  return NOTICE_TEXTS[notice];
}

/**
 * A refused edit as its toast (guide §9): info where it explains a rule the edit would break,
 * danger where the edit went wrong, as for a refusal that names no level.
 */
export function refusalToast({ message, level }: EditRefusedEvent): {
  readonly status: "info" | "danger";
  readonly text: string;
} {
  return { status: level ?? "danger", text: message };
}
