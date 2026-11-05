import { resolveAppearance, type Appearance, type Theme } from "../../core/index.js";
import { mountShell, type ShellHandle } from "../../dom/index.js";
import { withBeforeDestroy } from "../../ide/index.js";
import { applyAppearance, type VsCodeShellOptions } from "../../vscode/webview/index.js";
import { orcaEditorApi } from "./api.js";

const MORE_CONTRAST = "(prefers-contrast: more)";

function requestedAppearance(colorScheme: string, moreContrast: boolean): Appearance {
  const theme = colorScheme === "dark" ? "dark" : "light";
  return moreContrast ? { theme, kontrast: "hoch" } : { theme };
}

function htmlColorScheme(): string {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Follows Orca's light/dark mode: the `light`/`dark` class Orca bakes into `<html>` before the
 * first paint, then its `theme` event. Orca has no high-contrast theme, so the system's
 * `prefers-contrast: more` asks for high contrast. Each request is resolved against `themes`, so
 * the modeler never shows a mode it lacks. Returns the disconnect function. Throws when `themes`
 * is empty.
 */
export function connectOrcaAppearance(themes: readonly Theme[]): () => void {
  if (themes.length === 0) {
    throw new Error("@miragon/modeler-shell: connectOrcaAppearance needs at least one theme");
  }
  const contrast = window.matchMedia(MORE_CONTRAST);
  let colorScheme = htmlColorScheme();
  const show = (): void =>
    applyAppearance(resolveAppearance(requestedAppearance(colorScheme, contrast.matches), themes));
  show();
  const subscription = orcaEditorApi().on("theme", (theme) => {
    colorScheme = theme.colorScheme;
    show();
  });
  contrast.addEventListener("change", show);
  return () => {
    subscription.dispose();
    contrast.removeEventListener("change", show);
  };
}

/** An Orca editor has what a VS Code webview has, and no problems pill: Orca has no diagnostics for it. */
export type OrcaShellOptions = Omit<VsCodeShellOptions, "problems">;

/**
 * `mountShell` for an Orca custom editor: `host: "ide"`, the key listener on `document`, Orca's
 * mode. Orca has no reduce-motion setting of its own, so `prefers-reduced-motion` decides.
 * `destroy()` also disconnects the appearance.
 */
export function mountOrcaShell(root: HTMLElement, options: OrcaShellOptions): ShellHandle {
  const disconnectAppearance = connectOrcaAppearance(options.themes);
  let shell: ShellHandle;
  try {
    shell = mountShell(root, { ...options, host: "ide", keyScope: "document" });
  } catch (error) {
    disconnectAppearance();
    throw error;
  }
  return withBeforeDestroy(shell, disconnectAppearance);
}
