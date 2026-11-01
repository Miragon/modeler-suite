import { C4_COLOUR_STYLES, type StaticViewType, type ViewKey } from "@miragon/c4-schema-model";
import { block, oneLine, render, type Written } from "./place.js";
import { quote, VIEW_KEYWORD } from "./write.js";

/**
 * What every view the modeler writes gets, the values it draws drafts with (SPEC 3.5 rule 5,
 * 4.4): Structurizr ignores the layout properties and lays the view out itself instead of stacking
 * every element at 0,0, and a bare `autoLayout tb` would read 6.2.4's 100 / 50 px defaults.
 */
export const NEW_VIEW_AUTO_LAYOUT = "tb 300 160";

/**
 * The `styles` block "Apply C4 colours" writes into an empty `views` block, so that edit changes
 * nothing on a new workspace.
 */
function c4ColourStyles(): Written {
  return block(
    "styles",
    C4_COLOUR_STYLES.map((style) =>
      block(`element ${quote(style.tag)}`, [
        oneLine(`background ${quote(style.background)}`),
        oneLine(`color ${quote(style.color)}`),
        oneLine(`stroke ${quote(style.stroke)}`),
      ]),
    ),
  );
}

/**
 * The empty workspace of New diagram and of the first edit of a blank file: no element, so its
 * implicit landscape view shows the empty-file hint, and the C4 colours, which every element
 * drawn into it takes, as every modeler of the suite shows its notation's colours from the start.
 */
export function newWorkspaceText(): string {
  const workspace = block("workspace", [block("model", []), block("views", [c4ColourStyles()])]);
  return `${render(workspace, "", "    ", "\n")}\n`;
}

/** `<keyword> [<scope>] "<key>" { include * autoLayout tb 300 160 [title] }` */
export function viewStatement(
  type: StaticViewType,
  scopeReference: string | undefined,
  key: ViewKey,
  title?: string,
): Written {
  const head = [
    VIEW_KEYWORD[type],
    ...(scopeReference === undefined ? [] : [scopeReference]),
    quote(key),
  ];
  return block(head.join(" "), [
    oneLine("include *"),
    oneLine(`autoLayout ${NEW_VIEW_AUTO_LAYOUT}`),
    ...(title === undefined ? [] : [oneLine(`title ${quote(title)}`)]),
  ]);
}
