/*
 * Insert example (SPEC 8.2): a blank or skeleton-only document (an empty model, no view, no
 * styles but the C4 colours New writes) becomes the example as one edit; anything else is refused,
 * so it never overwrites the user's work.
 */
import { semanticDigest, type Workspace } from "@miragon/c4-schema-model";
import { parseWorkspace } from "../parse.js";
import type { Draft } from "./draft.js";
import { refuse } from "./refusal.js";
import { newWorkspaceText } from "./skeleton.js";

let newWorkspaceStyles: string | undefined;

function hasSkeletonStyles(workspace: Workspace): boolean {
  const { elements, relationships } = workspace.styles;
  if (elements.length === 0 && relationships.length === 0) return true;
  newWorkspaceStyles ??= semanticDigest(parseWorkspace(newWorkspaceText()).workspace).styles;
  return semanticDigest(workspace).styles === newWorkspaceStyles;
}

export function isSkeletonOnly(draft: Draft): boolean {
  if (draft.text.trim() === "") return true;
  const { workspace, sources } = draft;
  return (
    draft.parse.ok &&
    workspace.elements.length === 0 &&
    workspace.relationships.length === 0 &&
    workspace.views.length === 0 &&
    workspace.opaqueTexts.length === 0 &&
    hasSkeletonStyles(workspace) &&
    sources.deploymentEnvironments().length === 0
  );
}

export function insertExample(draft: Draft, exampleText: string): void {
  if (!isSkeletonOnly(draft)) {
    refuse(
      "not-allowed",
      "The example goes only into an empty workspace. Open a new diagram first.",
    );
  }
  if (!parseWorkspace(exampleText).ok) refuse("verification-failed", "The example doesn't import.");
  const text =
    draft.text.trim() !== "" && draft.lineBreak === "\r\n"
      ? exampleText.replace(/\r?\n/g, "\r\n")
      : exampleText;
  draft.intent.replacesEverything = true;
  draft.intent.checks.push((after) => (after.ok ? undefined : "the example doesn't import"));
  draft.replaceText(text);
  draft.chosenView = draft.catalog().defaultView().key;
}
