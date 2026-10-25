import "../fixtures/tokens/cd-tokens.generated.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "diagram-js/assets/diagram-js.css";
import "../src/shell.css";
import "./demo.css";

import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";

import kometUrl from "../fixtures/brand/miragon-komet-blau.svg?url";
import tokens from "../fixtures/tokens/cd-tokens.generated.json";
import {
  INVALID_STATUS_DELAY_MS,
  mountShell,
  problemSummary,
  type MenuGroups,
  type ShellHandle,
  type Theme,
  type ToastStatus,
} from "../src/index.js";
import { connectDiagramJs, type DiagramJsConnection } from "../src/diagram-js.js";
import {
  addSampleShapes,
  countDocumentChanges,
  createDemoDiagram,
  createDemoModeler,
  type DemoFlaws,
} from "./demo-diagram.js";
import { openShortcutsDialog } from "./demo-dialog.js";

/**
 * The web-app variant of the demo (`/web.html`): every 0.2 web-host option of `mountShell`, the way
 * a Miragon web app passes them (Event Storming's pilot, API.md "Usage: Event Storming in the web
 * app"). The head's mode markup comes from `webHeadMarkup` through the Vite config. Query
 * parameters:
 * - `themes`: the modes the demo modeler declares, comma-separated (default `light`);
 * - `empty`: open on the start screen, as a fresh visit without a document;
 * - `legend` (`legend=open`: open at start), `inspector`: mount those slots;
 * - `problems`: show the pill with its list at start; `invalid`: the invalid-file state.
 *
 * `window.__webDemo` is the harness's handle; `calls` records what the chrome asked the page to do.
 */
const params = new URLSearchParams(location.search);
const themes = (params.get("themes") ?? "light").split(",") as Theme[];
const calls: string[] = [];
let level = "big-picture";
let captions = true;

const app = document.getElementById("app");
if (!app) throw new Error("web demo: #app is missing");

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

// The diagram first, so a modeler's document keydown listeners would precede the shell's.
const canvasElement = document.createElement("div");
const diagram = createDemoDiagram(canvasElement, {
  flaws,
  isReadOnly: () => shell.isReadOnly(),
  freeRectCenter: () => connection.viewport.freeRectCenter(),
  // As wide as Event Storming's palette (648px): the primary action collapses below 892px, the
  // palette moves below 784px.
  extraShapes: 14,
});
const documentChanges = countDocumentChanges(diagram);
const modeling = diagram.get<Modeling>("modeling");
const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
const selection = diagram.get<Selection>("selection");

function shapes(): Element[] {
  return elementRegistry.filter(
    (element) => "parent" in element && Boolean(element.parent),
  ) as Element[];
}

/** Every new document opens like the first (guide §5.9); the start screen goes with it. */
function openDocument(fill: () => void): void {
  connection.viewport.newDocument();
  const existing = shapes();
  if (existing.length > 0) modeling.removeElements(existing);
  fill();
  connection.viewport.afterImport();
  shell.setEmptyState(false);
  shell.setProblems({ count: 0, errors: 0 });
  shell.menu.refresh();
}

function openSample(): void {
  openDocument(() => addSampleShapes(diagram));
}

function newDiagram(): void {
  calls.push("new-diagram");
  openDocument(() => {});
}

async function openDropped(files: readonly File[]): Promise<void> {
  const [file] = files;
  if (!file) return;
  await file.text();
  calls.push(`drop:${file.name}`);
  openSample();
}

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
      id: "type-captions",
      label: "Type captions",
      checked: () => captions,
      onToggle: (checked) => {
        captions = checked;
        calls.push(`type-captions:${checked}`);
      },
      keepEnabledWhenReadOnly: true,
    },
  ],
  export: [
    {
      kind: "action",
      id: "export-png",
      label: "Export as PNG",
      icon: "file-image",
      onSelect: () => calls.push("export-png"),
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
        openShortcutsDialog(app);
      },
    },
  ],
};

const shell: ShellHandle = mountShell(app, {
  host: "web",
  canvas: canvasElement,
  lang: "en",
  themes,
  messages: { canvas: "Demo diagram" },
  menu,
  primary: {
    onSelect: () => {
      calls.push("share");
      shell.toast({ status: "success", text: "Link copied" });
    },
  },
  legal: { links: [{ label: "GitHub", href: "https://github.com/Miragon/modeler-suite" }] },
  file: {
    newDiagram: { onSelect: () => newDiagram() },
    open: { onSelect: () => calls.push("open"), shortcut: "⌘O" },
    showExample: { onSelect: () => openSample() },
    import: { onSelect: () => calls.push("import") },
  },
  appearance: {
    themeColors: { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] },
  },
  problems: {
    onSelectItem: (item) => {
      calls.push(`select:${item.elementId ?? ""}`);
      const element = item.elementId ? elementRegistry.get(item.elementId) : undefined;
      if (element) selection.select(element);
    },
  },
  ...(params.has("legend")
    ? {
        legend: {
          render(body: HTMLElement) {
            body.innerHTML = `<div class="cd-shell-legend-row"><span class="cd-shell-legend-preview demo-legend-box"></span><span>Box</span></div>`;
          },
          onToggle: (open: boolean) => calls.push(`legend:${open}`),
          open: params.get("legend") === "open" ? true : undefined,
        },
      }
    : {}),
  ...(params.has("inspector") ? { inspector: { label: "Properties" } } : {}),
  emptyState: {
    title: "Demo Modeler",
    text: "Start a new diagram, or explore the example.",
    komet: kometUrl,
    onNewDiagram: () => newDiagram(),
    onShowExample: () => openSample(),
    dropHint: "Or drop a .demo or .json file here",
  },
  dropZone: {
    accept: [".demo", ".json", "application/json"],
    onDrop: (files) => void openDropped(files),
  },
});

const connection: DiagramJsConnection = connectDiagramJs(shell, diagram, {
  modeler: createDemoModeler(diagram),
});

/** Two problems for the list (guide §5.10): an error on the first box, a warning without an element. */
function showProblems(): void {
  const [first] = shapes();
  shell.setProblems(
    problemSummary([
      {
        severity: "error",
        message: "The box has no name.",
        location: "Box 1",
        elementId: first?.id,
      },
      { severity: "warning", message: "Two boxes overlap.", location: "Boxes 2 and 3" },
    ]),
  );
}

/** A fresh visit without a document: an empty board at 100 % behind the start screen. */
function startScreen(): void {
  connection.viewport.newDocument();
  const existing = shapes();
  if (existing.length > 0) modeling.removeElements(existing);
  connection.viewport.afterImport();
  shell.setEmptyState(true);
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
  connection.viewport.afterImport();
  shell.setEmptyState(true);
} else {
  addSampleShapes(diagram);
  connection.viewport.afterImport();
}
if (params.has("problems")) showProblems();
if (params.has("invalid")) setInvalid(true);

let destroyed = false;

const webDemo = {
  ready: true,
  host: "web" as const,
  themes,
  calls,
  shell,
  connection,
  diagram,
  flaws,
  documentChanges,
  showProblems,
  startScreen,
  setInvalid,
  toast(request: { status: ToastStatus; text: string; actionLabel?: string | undefined }): void {
    shell.toast({
      status: request.status,
      text: request.text,
      ...(request.actionLabel ? { action: { label: request.actionLabel, onSelect() {} } } : {}),
    });
  },
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    connection.destroy();
    diagram.destroy();
    shell.destroy();
  },
};

declare global {
  interface Window {
    __webDemo?: typeof webDemo;
  }
}
window.__webDemo = webDemo;
