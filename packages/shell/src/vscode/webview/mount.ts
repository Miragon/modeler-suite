import { mountShell, type ShellHandle, type ShellOptions } from "../../dom/index.js";
import { withBeforeDestroy } from "../../ide/index.js";
import {
  connectAppearance,
  connectReducedMotion,
  type AppearanceListenerOptions,
} from "./appearance.js";

/** The web column's options (0.2): a VS Code webview has none of them (guide §5.2, §13.5). */
type WebHostOptionKey = "primary" | "legal" | "file" | "appearance" | "emptyState" | "dropZone";

export interface VsCodeShellOptions
  extends
    Omit<ShellOptions, "host" | "keyScope" | "themes" | WebHostOptionKey>,
    AppearanceListenerOptions {}

/**
 * `mountShell` for a VS Code webview: `host: "ide"`, the key listener on `document` (VS Code's own
 * listener sits on `window`, so handled keys are stopped before it), `cd-shell-document` on
 * `<html>`, plus `connectAppearance` and `connectReducedMotion`. `destroy()` also disconnects both.
 */
export function mountVsCodeShell(root: HTMLElement, options: VsCodeShellOptions): ShellHandle {
  const { themes } = options;
  const disconnectAppearance = connectAppearance({ themes });
  const disconnectReducedMotion = connectReducedMotion();
  const disconnect = (): void => {
    disconnectAppearance();
    disconnectReducedMotion();
  };
  let shell: ShellHandle;
  try {
    shell = mountShell(root, { ...options, host: "ide", keyScope: "document" });
  } catch (error) {
    disconnect();
    throw error;
  }
  return withBeforeDestroy(shell, disconnect);
}
