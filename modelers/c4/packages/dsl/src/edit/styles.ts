/*
 * Element styles the modeler writes (SPEC 3.5 rule 10): "Apply C4 colours" and the Database
 * entry's cylinder. An existing light or unscoped block for the tag gets the properties set in
 * place and the missing ones appended; a new block goes at the end of `styles`, a new `styles`
 * block at the end of `views`. Idempotent.
 */
import { C4_COLOUR_STYLES } from "@miragon/c4-schema-model";
import type { Statement, TextEdit } from "../types.js";
import type { Draft } from "./draft.js";
import { block, insertLastChild, oneLine, replaceToken, statementChildren } from "./place.js";
import { ensureViews, ensureWorkspace } from "./views.js";
import { quote } from "./write.js";

interface StyleProperty {
  /** Lower-case names that set it, the first the one written. */
  readonly names: readonly string[];
  readonly raw: string;
  /** The value as compared: colours ignore case. */
  readonly value: string;
}

function stylesBlock(draft: Draft): Statement {
  const existing = draft.sources.stylesBlock();
  if (existing?.block) return existing;
  const views = ensureViews(draft);
  draft.apply([insertLastChild(draft, views, [block("styles", [])])]);
  return draft.sources.stylesBlock() as Statement;
}

function elementStyle(draft: Draft, tag: string): Statement | undefined {
  const styles = draft.sources
    .styles()
    .filter(
      (style) => style.type === "elementStyle" && style.tag === tag && style.scheme !== "dark",
    );
  return (styles.find((style) => style.scheme === undefined) ?? styles[0])?.statement;
}

/**
 * Sets the properties of the element style for `tag`, creating the block when there is none. A
 * blank text becomes the new workspace first, so the styles it brings count as existing ones.
 */
function setElementStyle(draft: Draft, tag: string, properties: readonly StyleProperty[]): void {
  ensureWorkspace(draft);
  const existing = elementStyle(draft, tag);
  if (existing === undefined) {
    const styles = stylesBlock(draft);
    const lines = properties.map((property) => oneLine(`${property.names[0]} ${property.raw}`));
    draft.apply([insertLastChild(draft, styles, [block(`element ${quote(tag)}`, lines)])]);
    return;
  }
  const children = statementChildren(existing);
  const edits: TextEdit[] = [];
  const missing: StyleProperty[] = [];
  for (const property of properties) {
    const statement = children
      .filter((child) => property.names.includes(child.tokens[0]?.value.toLowerCase() ?? ""))
      .at(-1);
    const token = statement?.tokens[1];
    if (statement === undefined || token === undefined) missing.push(property);
    else if (token.value.toLowerCase() !== property.value.toLowerCase())
      edits.push(replaceToken(token, property.raw));
  }
  if (missing.length > 0) {
    if (existing.block === undefined) return;
    edits.push(
      insertLastChild(
        draft,
        existing,
        missing.map((property) => oneLine(`${property.names[0]} ${property.raw}`)),
      ),
    );
  }
  draft.apply(edits);
}

function colour(names: readonly string[], value: string): StyleProperty {
  return { names, raw: quote(value), value };
}

/** "Apply C4 colours": the contrast-tuned classic palette as tag styles (SPEC 6.4). */
export function applyC4Colours(draft: Draft): void {
  for (const style of C4_COLOUR_STYLES) {
    setElementStyle(draft, style.tag, [
      colour(["background"], style.background),
      colour(["color", "colour"], style.color),
      colour(["stroke"], style.stroke),
    ]);
  }
}

/** The Database entry's style, when the workspace has none for the tag (SPEC 5.1). */
export function addDatabaseStyle(draft: Draft): void {
  if (draft.workspace.styles.elements.some((style) => style.tag === "Database")) return;
  draft.intent.stylesMayChange = true;
  setElementStyle(draft, "Database", [{ names: ["shape"], raw: "cylinder", value: "cylinder" }]);
}
