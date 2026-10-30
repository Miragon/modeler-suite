import { afterEach, expect, test } from "vitest";
import {
  Modeler,
  contextMapMenu,
  contextMapShortcuts,
  createTitleDialog,
  hoverTipFor,
} from "@miragon/context-maps-renderer";
import * as renderer from "@miragon/context-maps-renderer";
import { SAMPLE_DOCUMENT } from "@miragon/context-maps-schema-model";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

test("the menu offers the four exports with PNG first and the shortcuts dialog under Help", () => {
  const selected: string[] = [];
  const exportOf = (name: string) => ({ onSelect: () => selected.push(name) });
  const menu = contextMapMenu({
    exports: {
      png: exportOf("png"),
      svg: exportOf("svg"),
      json: exportOf("json"),
      cml: exportOf("cml"),
    },
    showKeyboardShortcuts: () => selected.push("shortcuts"),
  });
  expect(menu.model).toEqual([]);
  expect(menu.export.map((entry) => entry.label)).toEqual([
    "Export as PNG",
    "Export as SVG",
    "Export as JSON",
    "Export as CML",
  ]);
  expect(menu.export.map((entry) => entry.icon)).toEqual([
    "file-image",
    "file-code-corner",
    undefined,
    undefined,
  ]);
  expect(menu.help).toMatchObject([{ kind: "dialog", label: "Keyboard shortcuts…" }]);
  for (const entry of [...menu.export, ...menu.help]) entry.onSelect();
  expect(selected).toEqual(["png", "svg", "json", "cml", "shortcuts"]);
});

test("a title entry joins the Model group when the host can rename the map", () => {
  const opened: string[] = [];
  const noExport = { onSelect: () => undefined };
  const menu = contextMapMenu({
    exports: { png: noExport, svg: noExport, json: { ...noExport, shortcut: "⌘S" }, cml: noExport },
    showKeyboardShortcuts: () => undefined,
    editTitle: () => opened.push("title"),
  });
  expect(menu.model).toMatchObject([{ kind: "dialog", id: "map-title", label: "Map title…" }]);
  expect(menu.export[2]).toMatchObject({ label: "Export as JSON", shortcut: "⌘S" });
  menu.model[0]!.onSelect();
  expect(opened).toEqual(["title"]);
});

/** A chrome root with a menu trigger, as the shell hands it to the title dialog. */
function chromeRoot(): { root: HTMLElement; trigger: HTMLButtonElement } {
  const root = document.createElement("div");
  const trigger = document.createElement("button");
  root.append(trigger);
  document.body.append(root);
  cleanups.push(() => root.remove());
  return { root, trigger };
}

const SHORTCUT_MESSAGES = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomToActual: (percent: string) => `Zoom to ${percent}`,
  fit: "Fit to view",
  keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
};

test("the shortcuts dialog's groups name the zoom keys as the chrome's tooltips do", () => {
  const groups = contextMapShortcuts({
    platform: "other",
    lang: "en",
    messages: SHORTCUT_MESSAGES,
  });
  expect(groups.map((group) => group.title)).toEqual(["View", "Edit", "Tools"]);
  expect(groups[0]!.rows).toContainEqual({ action: "Zoom in", keys: ["Ctrl+Plus"] });
  expect(groups[0]!.rows).toContainEqual({ action: "Zoom to 100%", keys: ["Ctrl+0"] });
});

test("the web app's file keys lead the shortcuts dialog's groups", () => {
  const groups = contextMapShortcuts(
    { platform: "mac", lang: "en", messages: SHORTCUT_MESSAGES },
    { fileKeys: true },
  );
  expect(groups.map((group) => group.title)).toEqual(["File", "View", "Edit", "Tools"]);
  expect(groups[0]!.rows).toEqual([
    { action: "Open…", keys: ["⌘O"] },
    { action: "Export as JSON", keys: ["⌘S"] },
  ]);
});

/** Every selector of the page's style sheets, the ones inside `@layer`, `@media` and `@scope` too. */
function selectorsOf(rules: CSSRuleList): string[] {
  return [...rules].flatMap((rule) => [
    ...(rule instanceof CSSStyleRule ? [rule.selectorText] : []),
    ...("cssRules" in rule ? selectorsOf((rule as CSSGroupingRule).cssRules) : []),
  ]);
}

test("the renderer leaves the keyboard shortcuts dialog to the shell: no dialog of its own, no rules for one", () => {
  expect(Object.keys(renderer)).not.toContain("createShortcutsDialog");
  expect(Object.keys(renderer)).toContain("contextMapShortcuts");
  const selectors = [...document.styleSheets].flatMap((sheet) => selectorsOf(sheet.cssRules));
  expect(selectors).toContain(".cm-title-dialog");
  expect(selectors.filter((selector) => selector.includes("cm-shortcuts"))).toEqual([]);
});

test("the title dialog edits the map title in a field and applies it once", async () => {
  const { root, trigger } = chromeRoot();
  let title = "Conference";
  const written: string[] = [];
  const dialog = createTitleDialog(
    { root, menu: { trigger }, messages: { close: "Close" } },
    {
      title: () => title,
      setTitle: (next) => {
        written.push(next);
        title = next;
      },
    },
  );

  dialog.open();
  const element = root.querySelector<HTMLDialogElement>("dialog.cm-title-dialog")!;
  expect(element.matches(":modal")).toBe(true);
  expect(element.querySelector("h3")?.textContent).toBe("Map title");
  const field = element.querySelector<HTMLInputElement>("input")!;
  expect(document.activeElement).toBe(field);
  expect(field.value).toBe("Conference");
  expect(element.querySelector("label")?.htmlFor).toBe(field.id);
  expect(
    [...element.querySelectorAll<HTMLButtonElement>(".cm-dialog-footer button")].map(
      (button) => `${button.textContent}:${button.dataset.variant}`,
    ),
  ).toEqual(["Cancel:secondary", "Apply:primary"]);

  field.value = "  Conference 2026  ";
  const closed = new Promise((resolve) =>
    element.addEventListener("close", resolve, { once: true }),
  );
  element.querySelector("form")!.requestSubmit();
  expect(dialog.isOpen()).toBe(false);
  expect(written).toEqual(["Conference 2026"]);
  await closed;
  expect(document.activeElement).toBe(trigger);

  dialog.open();
  expect(field.value).toBe("Conference 2026");
  element.querySelector("form")!.requestSubmit();
  dialog.open();
  field.value = "Discarded";
  element.querySelector<HTMLButtonElement>('[data-variant="secondary"]')!.click();
  expect(dialog.isOpen()).toBe(false);
  expect(written).toEqual(["Conference 2026"]);
  dialog.destroy();
  expect(root.querySelector("dialog")).toBeNull();
});

test("hovering an element shows its own data in a tooltip inside the canvas", () => {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:0;top:0;width:900px;height:640px";
  const container = document.createElement("div");
  wrapper.append(container);
  document.body.append(wrapper);
  const modeler = new Modeler({ container });
  cleanups.push(() => {
    modeler.destroy();
    wrapper.remove();
  });
  modeler.importDocument(SAMPLE_DOCUMENT);
  const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
  const eventBus = modeler.get<{ fire(event: string, payload: unknown): void }>("eventBus");

  const tooltip = container.querySelector<HTMLElement>(".djs-container > .cm-hover-tooltip")!;
  expect(tooltip.hidden).toBe(true);
  eventBus.fire("element.hover", {
    element: registry.get("ctx_cfp"),
    originalEvent: new MouseEvent("mouseover", { clientX: 200, clientY: 200 }),
  });
  expect(tooltip.hidden).toBe(false);
  expect(tooltip.textContent).toContain("CfP Management");
  expect(tooltip.textContent).toContain("Team: Program Team");
  eventBus.fire("element.out", { element: registry.get("ctx_cfp") });
  expect(tooltip.hidden).toBe(true);

  expect(hoverTipFor(registry.get("rel_submission_evaluation"))).toEqual({
    title: "Upstream-Downstream · submissions API",
    body: "RESTful HTTP",
  });
});
