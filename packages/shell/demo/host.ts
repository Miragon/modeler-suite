import "../fixtures/tokens/cd-tokens.generated.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "../src/shell.css";
import "./host.css";

import { openShellDialog, type ShellDialog } from "../src/index.js";

/**
 * A page of an embedding host that mounts no shell (`/host.html`): the modeler's container is a
 * box at a place of the page's choosing, and the shell's dialog opens in it with `openShellDialog`
 * alone. The e2e specs move the box and the page around it; `window.__hostDemo` is their handle.
 */
const container = document.getElementById("modeler");
const opener = document.getElementById("open");
if (!container || !opener) throw new Error("host demo: #modeler or #open is missing");

let dialog: ShellDialog | undefined;

const hostDemo = {
  ready: true,
  open(): ShellDialog {
    dialog = openShellDialog({
      container,
      title: "Host dialog",
      render(body) {
        body.style.height = "240px";
        body.append("A dialog of the shell in a page that mounts no shell.");
      },
    });
    return dialog;
  },
  close(): void {
    dialog?.close();
  },
};

opener.addEventListener("click", () => hostDemo.open());

declare global {
  interface Window {
    __hostDemo?: typeof hostDemo;
  }
}
window.__hostDemo = hostDemo;
