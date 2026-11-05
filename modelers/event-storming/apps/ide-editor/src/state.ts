import type { IdeEditorState } from "@miragon/modeler-shell/ide";

const TYPE_CAPTIONS_KEY = "typeCaptionsVisible";

export function readTypeCaptionsVisible(state: Pick<IdeEditorState, "read">): boolean | undefined {
  const value = state.read(TYPE_CAPTIONS_KEY);
  return typeof value === "boolean" ? value : undefined;
}

export function writeTypeCaptionsVisible(
  state: Pick<IdeEditorState, "write">,
  visible: boolean,
): void {
  state.write(TYPE_CAPTIONS_KEY, visible);
}
