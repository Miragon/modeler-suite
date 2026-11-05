import type { ShellHandle } from "../dom/index.js";

/** The shell's handle with a `destroy` that runs `beforeDestroy` first; every other member delegates. */
export function withBeforeDestroy(shell: ShellHandle, beforeDestroy: () => void): ShellHandle {
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
