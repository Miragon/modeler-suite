import "../fixtures/tokens/cd-tokens.generated.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "diagram-js/assets/diagram-js.css";
import "../src/shell.css";
import "./demo.css";

import {
  INVALID_STATUS_DELAY_MS,
  appearanceAttributes,
  mountShell,
  resolveAppearance,
  type Appearance,
  type MenuGroups,
  type ShellHandle,
  type ShellHost,
  type Theme,
} from "../src/index.js";
import { connectDiagramJs, type DiagramJsConnection } from "../src/diagram-js.js";
import {
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWindow,
} from "../src/testing-vscode-stub.js";
import {
  mountVsCodeShell,
  persistView,
  readShellState,
  writeShellState,
  type ShellWebviewState,
} from "../src/vscode-webview.js";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";

import tokens from "../fixtures/tokens/cd-tokens.generated.json";
import {
  addSampleShapes,
  countDocumentChanges,
  createDemoDiagram,
  createDemoModeler,
  demoContentBounds,
  type DemoFlaws,
} from "./demo-diagram.js";
import { openShortcutsDialog } from "./demo-dialog.js";

/**
 * The demo page the shell's own e2e suite drives. Query parameters:
 * - `host`: `ide` (default, a VS Code webview inside the stub of `./testing/vscode-stub`), `web`
 *   or `embedded` (a foreign page);
 * - `themes`: the modes the demo modeler declares, comma-separated (default `light`);
 * - `theme`, `kontrast`: what the host requests (default `light`, none); embedded: the foreign
 *   page's own mode;
 * - `colorTheme`, `reduceMotion` (ide): the modeler's setting and VS Code's workbench.reduceMotion;
 * - `empty`: start without content; `legend` (`legend=open`: open at start), `inspector`: mount
 *   those slots; `wideLegend`: a second legend row wider than the card's minimum width, so the
 *   card's width depends on its font;
 * - `problems=<count>:<errors>`, `status=danger|warning`: show pill and status box at start;
 * - `invalid`: the invalid-file state (`__demo.setInvalid(true)`: read-only canvas at once, its
 *   marks and the status box after 800ms).
 *
 * Built as a production webview bundle (e2e/demo-webview.ts), the page under the webview CSP has
 * no query: the parameters come from `<div id="app" data-search="…">`, and the VS Code stub is
 * the one `openWebviewBundle` runs ahead of the bundle.
 *
 * `window.__demo.flaws` switches on one fault each for the kit's saboteur specs, at any time.
 */
const search = document.getElementById("app")?.dataset.search ?? location.search;
const params = new URLSearchParams(search);
const host = (params.get("host") ?? "ide") as ShellHost;
const themes = (params.get("themes") ?? "light").split(",") as Theme[];
const stubOptions = stubOptionsFromSearch(search);
const requested: Appearance = stubOptions.requested;

const calls: string[] = [];
let snap = true;
let level = "big-picture";

const menu: MenuGroups = {
  model: [
    {
      kind: "radio",
      id: "level",
      label: "Level",
      options: [
        { value: "big-picture", label: "Big picture" },
        { value: "process", label: "Process modelling" },
        { value: "design", label: "Software design" },
      ],
      value: () => level,
      onSelect: (value) => {
        level = value;
        calls.push(`level:${value}`);
      },
    },
    {
      kind: "checkbox",
      id: "snap",
      label: "Snap to grid",
      checked: () => snap,
      onToggle: (checked) => {
        snap = checked;
        calls.push(`snap:${checked}`);
      },
    },
    // A Model action without a dialog: after a click the focus goes to the canvas (guide §5.4).
    {
      kind: "action",
      id: "arrange",
      label: "Arrange boxes",
      onSelect: () => calls.push("arrange"),
    },
  ],
  export: [
    {
      kind: "action",
      id: "export-png",
      label: "Export as PNG",
      icon: "file-image",
      onSelect: () => {
        calls.push("export-png");
        if (flaws.evalUnderCsp) probeEval();
      },
    },
    {
      kind: "action",
      id: "export-svg",
      label: "Export as SVG",
      icon: "file-code-corner",
      onSelect: () => calls.push("export-svg"),
    },
  ],
  help: [
    {
      kind: "dialog",
      id: "shortcuts",
      label: "Keyboard shortcuts…",
      icon: "keyboard",
      shortcut: "?",
      onSelect: () => {
        calls.push("shortcuts");
        openShortcutsDialog(root);
        if (flaws.throwFromDialog) {
          window.setTimeout(() => {
            throw new Error("demo: the shortcuts dialog failed to open");
          });
        }
      },
    },
  ],
};

/** zod 4's probe without `jitless`: `new Function` once, its refusal caught. */
function probeEval(): void {
  try {
    new Function("return 1")();
  } catch {
    // the webview CSP refuses it and reports a securitypolicyviolation all the same
  }
}

function hostElement(): HTMLElement {
  const app = document.getElementById("app");
  if (!app) throw new Error("demo: #app is missing");
  if (host !== "embedded") return app;
  // a foreign page: its own language, mode and layout, the modeler in a sized box
  document.documentElement.classList.remove("cd-shell-document");
  document.documentElement.lang = "de";
  for (const [name, value] of Object.entries(appearanceAttributes(requested))) {
    document.documentElement.setAttribute(name, value);
  }
  app.classList.add("demo-foreign-page");
  const box = document.createElement("div");
  box.className = "demo-embedded-host";
  app.append(box);
  return box;
}

const root = hostElement();
const vscodeHost =
  host === "ide"
    ? ((window as StubWindow).__modelerShellVsCodeStub ??
      installVsCodeWebviewStub({ ...stubOptions, themes }))
    : undefined;
const vscode = host === "ide" ? (window as StubWindow).acquireVsCodeApi?.() : undefined;
const stored: ShellWebviewState = vscode ? readShellState(vscode) : {};
if (host === "web") {
  for (const [name, value] of Object.entries(
    appearanceAttributes(resolveAppearance(requested, themes)),
  )) {
    document.documentElement.setAttribute(name, value);
  }
}

const flaws: DemoFlaws = {
  noKeyboardCreate: false,
  canvasUnlocked: false,
  noSelectAll: false,
  commitLabelOnViewChange: false,
  closeLabelOnViewChange: false,
  notePromptFollowsView: false,
  notePromptHidesWhileViewChanges: false,
  evalUnderCsp: false,
  throwFromDialog: false,
};

// the diagram first, so document keydown listeners of a modeler would precede the shell's
const canvasElement = document.createElement("div");
const diagram = createDemoDiagram(canvasElement, {
  flaws,
  isReadOnly: () => shell.isReadOnly(),
  freeRectCenter: () => connection.viewport.freeRectCenter(),
});

const documentChanges = countDocumentChanges(diagram);

const options = {
  canvas: canvasElement,
  lang: "en",
  themes,
  menu,
  problems: { onActivate: () => calls.push("show-problems") },
  emptyHint: { onInsertExample: () => insertExample() },
  ...(params.has("legend")
    ? {
        legend: {
          render(body: HTMLElement) {
            body.innerHTML = `<div class="cd-shell-legend-row"><span class="cd-shell-legend-preview demo-legend-box"></span><span>Box</span></div>`;
            if (params.has("wideLegend")) {
              body.insertAdjacentHTML(
                "beforeend",
                `<div class="cd-shell-legend-row">A row wider than the card's minimum width</div>`,
              );
            }
          },
          onToggle: (open: boolean) => {
            calls.push(`legend:${open}`);
            if (vscode) writeShellState(vscode, { legendOpen: open });
          },
          open: params.get("legend") === "open" ? true : stored.legendOpen,
        },
      }
    : {}),
  ...(params.has("inspector") ? { inspector: { label: "Properties" } } : {}),
};

// The whole web column is on /web.html; here the web host keeps its 0.1 parts, so a dark-capable
// modeler only needs its theme colours (mountShell throws without them).
const appearance = {
  themeColors: { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] },
};
const shell: ShellHandle =
  host === "ide"
    ? mountVsCodeShell(root, { ...options, themes })
    : mountShell(root, { ...options, host, ...(host === "web" ? { appearance } : {}) });

const connection: DiagramJsConnection = connectDiagramJs(shell, diagram, {
  modeler: createDemoModeler(diagram),
});
const stopPersisting = vscode ? persistView(vscode, connection.viewport) : undefined;

function insertExample(): void {
  calls.push("insert-example");
  addSampleShapes(diagram);
  shell.setEmptyHint(false);
  connection.viewport.afterImport();
}

/** The invalid-file state of guide §13.5, as a host shows it after an import that failed to parse. */
function setInvalid(invalid: boolean): void {
  if (!invalid) {
    shell.setReadOnly(false);
    shell.setStatus(null);
    return;
  }
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: "danger", text: shell.messages.invalidFile("demo diagram") },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
  if (!flaws.canvasUnlocked) diagram.get<ContextPad>("contextPad").close();
}

if (params.has("empty")) {
  shell.setEmptyHint(true);
} else {
  addSampleShapes(diagram);
}
if (stored.view) connection.viewport.setState(stored.view);
connection.viewport.afterImport();

const problems = params.get("problems");
if (problems) {
  const [count = 0, errors = 0] = problems.split(":").map(Number);
  shell.setProblems({ count, errors });
}
const status = params.get("status");
if (status === "danger" || status === "warning") {
  shell.setStatus({ severity: status, text: shell.messages.invalidFile("demo diagram") });
}
if (params.has("invalid")) setInvalid(true);

let destroyed = false;

const demo = {
  ready: true,
  host,
  themes,
  requested,
  calls,
  shell,
  connection,
  diagram,
  vscode: vscodeHost,
  flaws,
  documentChanges,
  contentBounds: () => demoContentBounds(diagram),
  setInvalid,
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    stopPersisting?.();
    connection.destroy();
    diagram.destroy();
    shell.destroy();
  },
};

declare global {
  interface Window {
    __demo?: typeof demo;
  }
}
window.__demo = demo;
