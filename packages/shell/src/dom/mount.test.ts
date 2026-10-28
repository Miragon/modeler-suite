import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountShell } from "./mount.js";
import {
  FakeResizeObserver,
  canvasWithSvg,
  chrome,
  cleanup,
  click,
  fakePalette,
  fakeZoomTarget,
  focusingZoomTarget,
  installFakes,
  keydown,
  mount,
  pointer,
  setContainerSize,
} from "../../test/support/dom.js";

beforeEach(installFakes);
afterEach(cleanup);

const fullOptions = {
  menu: { export: [{ kind: "action" as const, id: "png", label: "Export as PNG", onSelect() {} }] },
  problems: { onActivate() {} },
  legend: { render() {} },
  inspector: { label: "Properties" },
  emptyHint: { onInsertExample() {} },
};

describe("mountShell: DOM", () => {
  it("renders the chrome in the tab order of guide §5.14, the layer last", () => {
    const { root } = mount(fullOptions);
    const order = [...root.children].map(
      (child) => child.getAttribute("data-chrome") ?? child.className.split(" ")[0],
    );
    expect(order).toEqual([
      "menu",
      "cd-shell-canvas",
      "status",
      "cd-shell-hint",
      "inspector",
      "problems",
      "legend",
      "zoom",
      "cd-shell-layer",
    ]);
    const layer = root.querySelector(".cd-shell-layer");
    expect([...(layer?.children ?? [])].map((child) => child.getAttribute("role"))).toEqual([
      "menu",
      "tooltip",
    ]);
    expect(root.querySelector('[data-chrome="primary"]')).toBeNull();
  });

  it("gives every island its class and keeps what is not shown hidden", () => {
    const { root } = mount(fullOptions);
    expect(chrome(root, "menu").className).toBe("cd-shell-menu-trigger cd-shell-island");
    expect(chrome(root, "zoom").classList).toContain("cd-shell-zoom");
    expect(chrome(root, "problems").classList).toContain("cd-shell-problems");
    expect(chrome(root, "legend").localName).toBe("section");
    expect(chrome(root, "inspector").localName).toBe("aside");
    expect(chrome(root, "inspector").getAttribute("aria-label")).toBe("Properties");
    expect(chrome(root, "status").classList).toContain("cd-shell-status");
    for (const name of ["status", "inspector", "problems"])
      expect(chrome(root, name).hidden, name).toBe(true);
    expect(root.querySelector<HTMLElement>(".cd-shell-hint")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".cd-shell-menu")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".cd-shell-tooltip")?.hidden).toBe(true);
  });

  it("has no positive tabindex and only buttons of type button", () => {
    const { root } = mount(fullOptions);
    const positive = [...root.querySelectorAll("[tabindex]")].filter(
      (element) => Number(element.getAttribute("tabindex")) > 0,
    );
    expect(positive).toEqual([]);
    for (const button of root.querySelectorAll("button")) expect(button.type).toBe("button");
  });

  it("renders only the islands the modeler asked for", () => {
    const { root } = mount();
    expect(root.querySelector('[data-chrome="problems"]')).toBeNull();
    expect(root.querySelector('[data-chrome="legend"]')).toBeNull();
    expect(root.querySelector('[data-chrome="inspector"]')).toBeNull();
    expect(root.querySelector(".cd-shell-hint")).toBeNull();
    expect(chrome(root, "zoom")).toBeTruthy();
    expect(chrome(root, "status")).toBeTruthy();
    // a menu without entries leaves its anchor empty
    expect(chrome(root, "menu").hidden).toBe(true);
  });

  it("moves a passed canvas into the slot and creates one otherwise", () => {
    const canvas = document.createElement("div");
    canvas.className = "djs-parent";
    const { shell, root } = mount({ canvas });
    expect(shell.canvas).toBe(canvas);
    expect(canvas.parentElement).toBe(root);
    expect(canvas.className).toBe("djs-parent cd-shell-canvas");
    expect(root.children[1]).toBe(canvas);

    const { shell: other } = mount();
    expect(other.canvas.className).toBe("cd-shell-canvas");
    expect(other.canvas.parentElement).toBe(other.root);
  });
});

describe("mountShell: root and document", () => {
  it.each(["ide", "web"] as const)(
    "%s: root class, host and palette attributes, own-document class",
    (host) => {
      const { root } = mount({ host });
      expect(root.classList).toContain("cd-shell");
      expect(root.getAttribute("data-cd-shell-host")).toBe(host);
      expect(root.getAttribute("data-palette")).toBe("top");
      expect(root.hasAttribute("lang")).toBe(false);
      expect(document.documentElement.classList).toContain("cd-shell-document");
      for (const name of ["data-legend", "data-inspector", "data-problems", "data-readonly"]) {
        expect(root.hasAttribute(name), name).toBe(false);
      }
    },
  );

  it("embedded: the root carries lang, the foreign page keeps its document", () => {
    document.documentElement.lang = "de";
    const { shell, root } = mount({ host: "embedded", lang: "en" });
    expect(root.getAttribute("lang")).toBe("en");
    expect(shell.lang).toBe("en");
    expect(document.documentElement.classList).not.toContain("cd-shell-document");
  });

  it("embedded: the foreign page's language is not the tool's (guide §2)", () => {
    document.documentElement.lang = "de";
    const page = document.createElement("div");
    page.lang = "de-DE";
    const root = document.createElement("div");
    page.append(root);
    document.body.append(page);
    setContainerSize(root, 1000, 800);
    const english = mountShell(root, { host: "embedded" });
    expect(english.lang).toBe("en");
    expect(root.getAttribute("lang")).toBe("en");
    english.destroy();

    root.setAttribute("lang", "fr");
    const declared = mountShell(root, { host: "embedded" });
    expect(declared.lang).toBe("fr");
    declared.destroy();
    expect(root.getAttribute("lang")).toBe("fr");
  });

  it("reads the language from the closest [lang], else English", () => {
    const wrapper = document.createElement("div");
    wrapper.lang = "de-DE";
    const root = document.createElement("div");
    wrapper.append(root);
    document.body.append(wrapper);
    setContainerSize(root, 1000, 800);
    const german = mountShell(root, { host: "ide" });
    expect(german.lang).toBe("de-DE");
    german.destroy();

    const bare = document.createElement("div");
    document.body.append(bare);
    const english = mountShell(bare, { host: "ide" });
    expect(english.lang).toBe("en");
    english.destroy();
  });

  it("resolves messages and the platform", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    const root = document.createElement("div");
    document.body.append(root);
    const shell = mountShell(root, {
      host: "ide",
      messages: { menu: "Menü", keyNames: { ctrl: "Strg" } },
    });
    expect(shell.platform).toBe("mac");
    expect(shell.messages.menu).toBe("Menü");
    expect(shell.messages.keyNames).toEqual({
      ctrl: "Strg",
      shift: "Shift",
      plus: "Plus",
      minus: "Minus",
    });
    expect(chrome(root, "menu").getAttribute("aria-label")).toBe("Menü");
    shell.destroy();
  });
});

describe("destroy", () => {
  it("removes every element, class, attribute, listener and observer, and is idempotent", () => {
    vi.useFakeTimers();
    const canvas = document.createElement("div");
    const { shell, root } = mount({ ...fullOptions, canvas });
    const target = fakeZoomTarget(1);
    shell.setZoomTarget(target);
    shell.registerPalette(fakePalette());
    shell.setProblems({ count: 2, errors: 1 });
    shell.setReadOnly(true);
    shell.legend?.setOpen(true);
    shell.inspector?.open();
    shell.setStatus({ severity: "danger", text: "Invalid" }, { delayMs: 800 });
    shell.menu.open();
    const observers = [...FakeResizeObserver.instances];

    shell.destroy();
    shell.destroy();

    expect([...root.children]).toEqual([canvas]);
    expect(canvas.className).toBe("");
    expect(root.getAttributeNames()).toEqual(["id"]);
    expect(root.className).toBe("");
    expect(document.documentElement.className).toBe("");
    expect(observers.length).toBeGreaterThan(1);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(target.listeners.size).toBe(0);

    vi.advanceTimersByTime(2000);
    expect(root.querySelector(".cd-shell-status")).toBeNull();
    expect(
      keydown(document.body, { key: "=", code: "Equal", metaKey: true }).defaultPrevented,
    ).toBe(false);
    expect(target.calls).toEqual([]);
  });

  it("keeps what the page had before the mount", () => {
    document.documentElement.classList.add("cd-shell-document");
    const root = document.createElement("div");
    root.className = "app";
    root.setAttribute("lang", "en");
    document.body.append(root);
    const shell = mountShell(root, { host: "embedded" });
    shell.destroy();
    expect(document.documentElement.classList).toContain("cd-shell-document");
    expect(root.className).toBe("app");
    expect(root.getAttribute("lang")).toBe("en");
  });

  it("turns every later call into a no-op", () => {
    const { shell, root } = mount(fullOptions);
    shell.destroy();
    expect(() => {
      shell.setProblems({ count: 1, errors: 0 });
      shell.setStatus({ severity: "warning", text: "x" });
      shell.setEmptyHint(true);
      shell.setReadOnly(true);
      shell.setZoomTarget(fakeZoomTarget());
      shell.menu.open();
      shell.legend?.toggle();
      shell.inspector?.open();
      shell.registerPalette(fakePalette())();
      shell.tooltip.attach(document.createElement("button"), { label: "x" })();
    }).not.toThrow();
    expect(root.children.length).toBe(0);
    expect(root.hasAttribute("data-readonly")).toBe(false);
  });
});

describe("mountShell: the embedded root's mode (guide §13.3)", () => {
  const flushObservers = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    document.documentElement.removeAttribute("data-cd-theme");
    document.documentElement.removeAttribute("data-cd-kontrast");
  });

  it("stays light inside a dark host page and takes the host's high contrast over", async () => {
    document.documentElement.setAttribute("data-cd-theme", "dark");
    const { shell, root } = mount({ host: "embedded" });
    expect(root.getAttribute("data-cd-theme")).toBe("light");
    expect(root.hasAttribute("data-cd-kontrast")).toBe(false);

    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    await flushObservers();
    expect(root.getAttribute("data-cd-kontrast")).toBe("hoch");

    document.documentElement.removeAttribute("data-cd-kontrast");
    await flushObservers();
    expect(root.hasAttribute("data-cd-kontrast")).toBe(false);

    shell.destroy();
    expect(root.hasAttribute("data-cd-theme")).toBe(false);
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    await flushObservers();
    expect(root.hasAttribute("data-cd-kontrast")).toBe(false);
  });

  it("follows the nearest mode carrier of the page", () => {
    document.documentElement.setAttribute("data-cd-theme", "dark");
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    const panel = document.createElement("div");
    panel.setAttribute("data-cd-theme", "light");
    const root = document.createElement("div");
    panel.append(root);
    document.body.append(panel);
    setContainerSize(root, 1000, 800);
    const shell = mountShell(root, { host: "embedded" });
    expect(root.hasAttribute("data-cd-kontrast")).toBe(false);
    shell.destroy();
  });

  it("takes the first of the modeler's themes, and writes no mode in an own document", () => {
    const { root: embedded } = mount({ host: "embedded", themes: ["dark", "light"] });
    expect(embedded.getAttribute("data-cd-theme")).toBe("dark");
    const { root: own } = mount({ host: "ide", themes: ["light", "dark"] });
    expect(own.hasAttribute("data-cd-theme")).toBe(false);
  });

  it("throws for empty themes before it touches the root", () => {
    const root = document.createElement("div");
    document.body.append(root);
    expect(() => mountShell(root, { host: "embedded", themes: [] })).toThrow(/at least one theme/);
    expect(root.getAttributeNames()).toEqual([]);
  });
});

describe("mountShell: robustness", () => {
  it("removes everything again when rendering throws", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setContainerSize(root, 1000, 800);
    expect(() =>
      mountShell(root, {
        host: "ide",
        menu: { export: [{ kind: "action", id: "png", label: "Export as PNG", onSelect() {} }] },
        legend: {
          render() {
            throw new Error("legend broke");
          },
        },
      }),
    ).toThrow("legend broke");
    expect(root.getAttributeNames()).toEqual([]);
    expect(root.children).toHaveLength(0);
    expect(document.documentElement.classList).not.toContain("cd-shell-document");
    expect(FakeResizeObserver.instances.every((observer) => observer.observed.size === 0)).toBe(
      true,
    );
    expect(
      keydown(document.body, { key: "=", code: "Equal", metaKey: true }).defaultPrevented,
    ).toBe(false);
  });

  it("numbers element ids page-wide, also across separate copies of the shell", () => {
    const counter = Symbol.for("@miragon/modeler-shell.mounts");
    const scope = globalThis as unknown as Record<symbol, number | undefined>;
    const { shell: first } = mount({ menu: fullOptions.menu });
    const { shell: second } = mount({ menu: fullOptions.menu });
    expect(first.menu.dropdown.id).not.toBe(second.menu.dropdown.id);
    // another bundle's copy counted on the same page global
    scope[counter] = (scope[counter] ?? 0) + 5;
    const { shell: third } = mount({ menu: fullOptions.menu });
    expect(third.menu.dropdown.id).toBe(`cd-shell-menu-${scope[counter]}`);
  });
});

describe("mountShell: focus when an island hides (guide §5.14)", () => {
  it("moves the focus from Insert example to the canvas when the hint hides", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell, root } = mount({ canvas, emptyHint: { onInsertExample() {} } });
    shell.setEmptyHint(true);
    root.querySelector<HTMLButtonElement>(".cd-shell-hint-action")?.focus();
    shell.setEmptyHint(false);
    expect(document.activeElement).toBe(svg);
  });

  // WebKit and Firefox on macOS leave a clicked button unfocused: the click finds `<body>` focused.
  it("moves the focus to the canvas when the hint hides after a pointer click on Insert example", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell, root } = mount({ canvas, emptyHint: { onInsertExample() {} } });
    shell.setEmptyHint(true);
    click(root.querySelector(".cd-shell-hint-action")!, 1);
    expect(document.activeElement).toBe(document.body);
    shell.setEmptyHint(false);
    expect(document.activeElement).toBe(svg);
  });

  it("forgets the pointer click on Insert example once the hint has hidden or a focus moved on", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell, root } = mount({
      canvas,
      emptyHint: { onInsertExample() {} },
      menu: fullOptions.menu,
    });
    shell.setEmptyHint(true);
    click(root.querySelector(".cd-shell-hint-action")!, 1);
    shell.menu.trigger.focus();
    shell.setEmptyHint(false);
    expect(document.activeElement).toBe(shell.menu.trigger);

    shell.menu.trigger.blur();
    shell.setEmptyHint(true);
    shell.setEmptyHint(false);
    expect(document.activeElement).not.toBe(svg);
  });

  it("moves the focus from a closing inspector to the canvas, else to the menu trigger", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell } = mount({ canvas, inspector: { label: "Properties" } });
    const field = document.createElement("input");
    shell.inspector?.element.append(field);
    shell.inspector?.open();
    field.focus();
    shell.inspector?.close();
    expect(document.activeElement).toBe(svg);

    const bare = mount({ menu: fullOptions.menu, inspector: { label: "Properties" } }).shell;
    const other = document.createElement("input");
    bare.inspector?.element.append(other);
    bare.inspector?.open();
    other.focus();
    bare.inspector?.close();
    expect(document.activeElement).toBe(bare.menu.trigger);
  });

  it("leaves the focus alone when it is elsewhere", () => {
    const { canvas } = canvasWithSvg();
    const { shell } = mount({
      canvas,
      emptyHint: { onInsertExample() {} },
      menu: fullOptions.menu,
    });
    shell.setEmptyHint(true);
    shell.menu.trigger.focus();
    shell.setEmptyHint(false);
    expect(document.activeElement).toBe(shell.menu.trigger);
  });
});

describe("mountShell: focus after a pointer click (guide §5.8)", () => {
  function withPalette() {
    const { canvas, svg } = canvasWithSvg();
    const mounted = mount({ canvas, menu: fullOptions.menu });
    const palette = fakePalette();
    const lasso = palette.entry("lasso-tool", { label: "Lasso" });
    const separator = document.createElement("hr");
    separator.className = "separator";
    palette.element.append(separator);
    canvas.querySelector(".djs-container")?.prepend(palette.element);
    const unregister = mounted.shell.registerPalette(palette);
    mounted.shell.setZoomTarget(focusingZoomTarget(svg));
    return { ...mounted, svg, palette, lasso, separator, unregister };
  }

  it("hands it to the canvas after a click or a drag on a palette entry, not after Enter or Space", () => {
    const { svg, lasso } = withPalette();
    lasso.focus();
    click(lasso, 1);
    expect(document.activeElement).toBe(svg);

    lasso.focus();
    click(lasso, 0);
    expect(document.activeElement).toBe(lasso);

    lasso.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(svg);
  });

  it("leaves it alone for a click between the palette's entries, after unregister and after destroy", () => {
    const first = withPalette();
    first.lasso.focus();
    click(first.separator, 1);
    expect(document.activeElement).toBe(first.lasso);
    first.unregister();
    click(first.lasso, 1);
    expect(document.activeElement).toBe(first.lasso);

    const second = withPalette();
    second.lasso.focus();
    second.shell.destroy();
    click(second.lasso, 1);
    expect(document.activeElement).toBe(second.lasso);
  });

  it("closes the open menu and hands it to the canvas when the click goes to a zoom button", () => {
    const { shell, root, svg } = withPalette();
    shell.menu.open();
    const zoomIn = chrome(root, "zoom").querySelector<HTMLButtonElement>('[data-zoom="in"]')!;
    pointer(zoomIn, "pointerdown");
    zoomIn.focus();
    click(zoomIn, 1);
    expect(shell.menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(svg);
  });
});

describe("shell.showShortcutsDialog (guide §5.4, §8)", () => {
  const EDIT = { title: "Edit", rows: [{ action: "Undo", keys: ["⌘Z"] }] };

  function dialogIn(root: HTMLElement): HTMLDialogElement | null {
    return root.querySelector<HTMLDialogElement>("dialog.cd-shell-dialog.cd-shell-shortcuts");
  }

  function rowsOf(root: HTMLElement): HTMLTableRowElement[] {
    return [...(dialogIn(root)?.querySelectorAll("tr") ?? [])];
  }

  it("opens in the root with the chrome's keys in a View group first, then the modeler's", () => {
    const { shell, root } = mount();
    const dialog = shell.showShortcutsDialog([EDIT]);

    const element = dialogIn(root);
    expect(dialog.isOpen()).toBe(true);
    expect(element?.open).toBe(true);
    expect(element?.querySelector(".cd-shell-dialog-title")?.textContent).toBe(
      "Keyboard shortcuts",
    );
    const headings = [...(element?.querySelectorAll("h3") ?? [])];
    expect(headings.map((heading) => heading.textContent)).toEqual(["View", "Edit"]);
    expect(
      rowsOf(root).map((row) => [
        row.getAttribute("data-chrome-key"),
        row.querySelector("th")?.textContent,
        row.querySelector("kbd")?.textContent,
      ]),
    ).toEqual([
      ["zoomIn", "Zoom in", "⌘+"],
      ["zoomOut", "Zoom out", "⌘−"],
      ["zoomToActual", "Zoom to 100%", "⌘0"],
      ["fit", "Fit to view", "⇧1"],
      [null, "Undo", "⌘Z"],
    ]);
  });

  it("names the chrome's rows in the shell's messages and platform", () => {
    const { shell, root } = mount({
      platform: "other",
      lang: "de",
      messages: {
        zoomIn: "Vergrößern",
        shortcutsTitle: "Tastenkürzel",
        shortcutsView: "Ansicht",
        keyNames: { ctrl: "Strg" },
      },
    });
    shell.showShortcutsDialog([{ title: "Ansicht", rows: [{ action: "Raster", keys: ["G"] }] }]);
    expect(dialogIn(root)?.querySelector(".cd-shell-dialog-title")?.textContent).toBe(
      "Tastenkürzel",
    );
    const rows = rowsOf(root);
    expect(rows[0]?.textContent).toBe("VergrößernStrg+Plus");
    expect(rows.at(-1)?.textContent).toBe("RasterG");
  });

  it("closes the menu first and returns the focus to the trigger on close", () => {
    const { shell, root } = mount(fullOptions);
    shell.menu.open();
    expect(shell.menu.isOpen()).toBe(true);

    const dialog = shell.showShortcutsDialog([EDIT]);
    expect(shell.menu.isOpen()).toBe(false);

    dialog.close();
    expect(dialogIn(root)).toBeNull();
    expect(document.activeElement).toBe(shell.menu.trigger);
  });

  it("hands the focus to the canvas when the element that had it is gone", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell } = mount({ canvas });
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const dialog = shell.showShortcutsDialog([EDIT]);
    opener.remove();

    dialog.close();

    expect(document.activeElement).toBe(svg);
  });

  it("returns the open dialog while it is open, and a new one after it closed", () => {
    const { shell, root } = mount();
    const first = shell.showShortcutsDialog([EDIT]);
    expect(shell.showShortcutsDialog([])).toBe(first);
    expect(root.querySelectorAll("dialog")).toHaveLength(1);

    first.close();
    const second = shell.showShortcutsDialog([]);
    expect(second).not.toBe(first);
    expect(second.isOpen()).toBe(true);
  });

  it("is removed by destroy without moving the focus, and opens nothing afterwards", () => {
    const { canvas, svg } = canvasWithSvg();
    const { shell, root } = mount({ canvas });
    const dialog = shell.showShortcutsDialog([EDIT]);
    root.querySelector<HTMLButtonElement>(".cd-shell-dialog-close")?.focus();

    shell.destroy();

    expect(dialog.isOpen()).toBe(false);
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(svg);
    expect(shell.showShortcutsDialog([EDIT]).isOpen()).toBe(false);
    expect(document.querySelector("dialog")).toBeNull();
  });
});
