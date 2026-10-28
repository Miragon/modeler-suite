import { mountShell, type ShellHandle, type ShellOptions } from "../../dom/index.js";
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

/** The shell's handle with a `destroy` that runs `beforeDestroy` first; every other member delegates. */
function withDestroyHook(shell: ShellHandle, beforeDestroy: () => void): ShellHandle {
  return {
    get root() {
      return shell.root;
    },
    get canvas() {
      return shell.canvas;
    },
    get host() {
      return shell.host;
    },
    get lang() {
      return shell.lang;
    },
    get platform() {
      return shell.platform;
    },
    get messages() {
      return shell.messages;
    },
    get menu() {
      return shell.menu;
    },
    get tooltip() {
      return shell.tooltip;
    },
    get legend() {
      return shell.legend;
    },
    get inspector() {
      return shell.inspector;
    },
    get primary() {
      return shell.primary;
    },
    get appearance() {
      return shell.appearance;
    },
    setZoomTarget: (target) => shell.setZoomTarget(target),
    fitInsets: () => shell.fitInsets(),
    registerPalette: (palette) => shell.registerPalette(palette),
    setProblems: (summary) => shell.setProblems(summary),
    setStatus: (status, options) => shell.setStatus(status, options),
    setEmptyHint: (visible) => shell.setEmptyHint(visible),
    setReadOnly: (readOnly, options) => shell.setReadOnly(readOnly, options),
    isReadOnly: () => shell.isReadOnly(),
    setEmptyState: (shown) => shell.setEmptyState(shown),
    isEmptyStateShown: () => shell.isEmptyStateShown(),
    toast: (request) => shell.toast(request),
    showShortcutsDialog: (groups) => shell.showShortcutsDialog(groups),
    destroy() {
      beforeDestroy();
      shell.destroy();
    },
  };
}

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
  return withDestroyHook(shell, disconnect);
}
