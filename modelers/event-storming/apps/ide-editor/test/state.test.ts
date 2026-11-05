import { describe, expect, it } from "vitest";
import {
  readShellState,
  vsCodeEditorHost,
  writeShellState,
} from "@miragon/modeler-shell/vscode/webview";
import { readTypeCaptionsVisible, writeTypeCaptionsVisible } from "../src/state.js";

function stateApi(initial: unknown) {
  let state = initial;
  return {
    getState: () => state,
    setState: (next: unknown) => {
      state = next;
    },
    postMessage: () => undefined,
  };
}

/** The editor reads and writes its own keys through the host's state, here VS Code's. */
const editorState = (api: ReturnType<typeof stateApi>) => vsCodeEditorHost({}, api).state;

const VIEW = { viewbox: { x: 1, y: 2, width: 300, height: 200 }, userMoved: true };

describe("webview state", () => {
  it("keeps the type captions at the top-level key next to the shell state", () => {
    const api = stateApi(undefined);

    writeShellState(api, { view: VIEW });
    writeTypeCaptionsVisible(editorState(api), false);

    expect(api.getState()).toEqual({ modelerShell: { view: VIEW }, typeCaptionsVisible: false });
    expect(readShellState(api).view).toEqual(VIEW);
    expect(readTypeCaptionsVisible(editorState(api))).toBe(false);
  });

  it("survives a later write of the shell", () => {
    const api = stateApi(undefined);

    writeTypeCaptionsVisible(editorState(api), false);
    writeShellState(api, { view: VIEW });

    expect(readTypeCaptionsVisible(editorState(api))).toBe(false);
  });

  it("reads nothing from a missing or malformed state", () => {
    expect(readTypeCaptionsVisible(editorState(stateApi(undefined)))).toBeUndefined();
    expect(readTypeCaptionsVisible(editorState(stateApi("broken")))).toBeUndefined();
    expect(
      readTypeCaptionsVisible(editorState(stateApi({ typeCaptionsVisible: "no" }))),
    ).toBeUndefined();
  });
});
