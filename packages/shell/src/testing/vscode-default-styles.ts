/** The `id` of the `<style>` with VS Code's default webview stylesheet, as VS Code names it. */
export const VSCODE_DEFAULT_STYLES_ID = "_defaultStyles";

/**
 * The rules of VS Code's default webview stylesheet the shell's own-document reset must beat
 * (implementation notes, "VS Code: host hygiene"), with deliberately foreign values so a leak shows.
 */
export const VSCODE_DEFAULT_STYLES = `@layer vscode-default {
  body { margin: 0; padding: 0 20px; color: currentColor; font-family: serif; font-size: 17px; }
  kbd { box-shadow: inset 0 -1px 0 currentColor; vertical-align: middle; padding: 1px 3px; border-radius: 3px; font-family: serif; }
  code { font-family: serif; padding: 1px 3px; border-radius: 4px; }
  a:focus, input:focus, select:focus, textarea:focus { outline: 1px solid -webkit-focus-ring-color; outline-offset: -1px; }
}`;
