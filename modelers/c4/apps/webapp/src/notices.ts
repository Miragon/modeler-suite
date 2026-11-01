import type { EditNotice } from "@miragon/c4-dsl";
import type { DeleteDoneEvent, DeletedItems } from "@miragon/c4-renderer";

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

function count(items: DeletedItems): number {
  return items.elements.length + items.relationships.length;
}

function counted(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

/** One item by its name, more by their number per kind: "2 elements and 1 relationship". */
function described(items: DeletedItems): string {
  const [element] = items.elements;
  const [relationship] = items.relationships;
  if (count(items) === 1) {
    return element ?? `the relationship ${relationship ?? ""}`;
  }
  const parts = [
    items.elements.length > 0 ? counted(items.elements.length, "element") : undefined,
    items.relationships.length > 0
      ? counted(items.relationships.length, "relationship")
      : undefined,
  ];
  return parts.filter((part) => part !== undefined).join(" and ");
}

/**
 * What Delete did (`c4.delete.done`), as the info toast says it: from the model when no other view
 * showed it, else from this view only (SPEC 5.4). Undefined when it took no selected item.
 */
export function deleteDoneText({ fromModel, fromView }: DeleteDoneEvent): string | undefined {
  const deleted = count(fromModel);
  const removed = count(fromView);
  if (deleted === 0 && removed === 0) return undefined;
  if (deleted > 0 && removed > 0) {
    return `Deleted ${described(fromModel)} from the model and removed ${described(fromView)} from this view.`;
  }
  if (deleted > 0) {
    return `Deleted ${described(fromModel)} from the model. No other view showed ${deleted === 1 ? "it" : "them"}.`;
  }
  return `Removed ${described(fromView)} from this view. ${removed === 1 ? "It stays" : "They stay"} in the model.`;
}
