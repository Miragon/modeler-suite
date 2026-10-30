import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  CD_TOKENS,
  Modeler,
  SHORTCUTS_DIALOG_KEY,
  createShortcutsDialog,
  createTitleDialog,
  diagramMenu,
  diagramShortcuts,
  type DiagramMenuActions,
  type DiagramMenuEntry,
  type ShortcutsDialogChrome,
  type TtModeling,
} from "@miragon/team-topologies-renderer";
import { SAMPLE_DOCUMENT } from "@miragon/team-topologies-schema-model";

/*
 * What a host's chrome shows around the canvas, from the renderer alone (designIQ mounts no modeler
 * shell): the menu entries, the shortcut groups and the title dialog, styled by the renderer's
 * stylesheet.
 */

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function actions(overrides: Partial<DiagramMenuActions> = {}) {
  const selected: string[] = [];
  const exportOf = (name: string) => ({ onSelect: () => selected.push(name) });
  return {
    selected,
    actions: {
      exports: { png: exportOf("png"), svg: exportOf("svg") },
      showKeyboardShortcuts: () => selected.push("shortcuts"),
      ...overrides,
    } satisfies DiagramMenuActions,
    exportOf,
  };
}

function ids(entries: readonly DiagramMenuEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

/** The chrome a host hands the dialogs: a root with a menu trigger, the shell's messages. */
function chrome(platform: "mac" | "other" = "other"): ShortcutsDialogChrome & {
  menu: { trigger: HTMLButtonElement };
} {
  const root = document.createElement("div");
  const trigger = document.createElement("button");
  trigger.textContent = "Menu";
  root.append(trigger);
  document.body.append(root);
  cleanups.push(() => root.remove());
  return {
    root,
    platform,
    lang: "en",
    menu: { trigger },
    messages: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomToActual: (percent) => `Zoom to ${percent}`,
      fit: "Fit to view",
      close: "Close",
      keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
    },
  };
}

/**
 * Resolves after the dialog's `close` event. It arrives in a task of its own, which a zero timer
 * does not reliably wait for; the dialog's own listener, added first, has run by then.
 */
function closeEventOf(dialog: HTMLDialogElement): Promise<void> {
  return new Promise((resolve) =>
    dialog.addEventListener("close", () => resolve(), { once: true }),
  );
}

/** A CSS box shadow (a token's `var()`) as the browser computes it. */
function computedShadow(value: string): string {
  const probe = document.createElement("span");
  probe.style.boxShadow = value;
  document.body.append(probe);
  const shadow = getComputedStyle(probe).boxShadow;
  probe.remove();
  return shadow;
}

/** A CSS colour (a token's `var()` or hex value) as the browser computes it. */
function computedColour(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

describe("diagramMenu", () => {
  test("has Model, Export with PNG before SVG, and Help, in the shapes the shell's menu takes", () => {
    const { actions: menuActions, selected } = actions();
    const menu = diagramMenu(menuActions);

    expect(menu.model).toEqual([]);
    expect(ids(menu.export)).toEqual(["export-png", "export-svg"]);
    expect(menu.export.map((entry) => [entry.kind, entry.label, entry.icon])).toEqual([
      ["action", "Export as PNG", "file-image"],
      ["action", "Export as SVG", "file-code-corner"],
    ]);
    expect(menu.help).toEqual([
      expect.objectContaining({
        kind: "dialog",
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts…",
        icon: "keyboard",
      }),
    ]);
    expect(menu.help[0]).not.toHaveProperty("shortcut");

    for (const entry of [...menu.export, ...menu.help]) entry.onSelect();
    expect(selected).toEqual(["png", "svg", "shortcuts"]);
  });

  test("adds the JSON export with its key chip only where the host offers it", () => {
    const { actions: menuActions, exportOf, selected } = actions();
    const menu = diagramMenu({
      ...menuActions,
      exports: { ...menuActions.exports, json: { ...exportOf("json"), shortcut: "⌘S" } },
    });

    expect(ids(menu.export)).toEqual(["export-png", "export-svg", "export-json"]);
    expect(menu.export[2]).toEqual(
      expect.objectContaining({ kind: "action", label: "Export as JSON", shortcut: "⌘S" }),
    );
    expect(menu.export[2]).not.toHaveProperty("icon");
    expect(menu.export[0]).not.toHaveProperty("shortcut");
    menu.export[2]!.onSelect();
    expect(selected).toEqual(["json"]);
  });

  test('puts "Diagram title…" into the Model group where the host renames the diagram', () => {
    const editTitle = vi.fn();
    const { actions: menuActions } = actions({ editTitle });
    const [entry, ...rest] = diagramMenu(menuActions).model;

    expect(rest).toEqual([]);
    expect(entry).toEqual(
      expect.objectContaining({ kind: "dialog", id: "diagram-title", label: "Diagram title…" }),
    );
    // It changes the document, so a read-only canvas disables it.
    expect(entry).not.toHaveProperty("keepEnabledWhenReadOnly");
    entry!.onSelect();
    expect(editTitle).toHaveBeenCalledOnce();
  });

  test("shows the host's key for the shortcuts dialog as the entry's chip", () => {
    const { actions: menuActions } = actions({ shortcutsKey: SHORTCUTS_DIALOG_KEY });
    expect(diagramMenu(menuActions).help[0]).toEqual(
      expect.objectContaining({ label: "Keyboard shortcuts…", shortcut: "?" }),
    );
  });
});

describe("diagramShortcuts", () => {
  test("names the View keys like the chrome's tooltips, per platform", () => {
    const [mac] = diagramShortcuts(chrome("mac"));
    const [other] = diagramShortcuts(chrome("other"));

    expect(mac).toEqual({
      title: "View",
      rows: [
        { action: "Zoom in", keys: ["⌘+"] },
        { action: "Zoom out", keys: ["⌘−"] },
        { action: "Zoom to 100%", keys: ["⌘0"] },
        { action: "Fit to view", keys: ["⇧1"] },
      ],
    });
    expect(other?.rows.map((row) => row.keys[0])).toEqual([
      "Ctrl+Plus",
      "Ctrl+Minus",
      "Ctrl+0",
      "Shift+1",
    ]);
  });

  test("leads with the web app's File keys and lists its dialog key under View when asked", () => {
    const host = chrome("other");
    expect(diagramShortcuts(host).map((group) => group.title)).toEqual(["View", "Edit", "Tools"]);

    const [file, view] = diagramShortcuts(host, { fileKeys: true });
    expect(file).toEqual({
      title: "File",
      rows: [
        { action: "Open…", keys: ["Ctrl+O"] },
        { action: "Export as JSON", keys: ["Ctrl+S"] },
      ],
    });
    expect(view?.rows.at(-1)).toEqual({ action: "Keyboard shortcuts", keys: ["?"] });
    expect(
      diagramShortcuts(host).some((group) => group.rows.some((row) => row.keys.includes("?"))),
    ).toBe(false);
  });
});

describe("createShortcutsDialog", () => {
  test("opens modal in the chrome's root, labelled, with one table per group", () => {
    const host = chrome();
    const dialog = createShortcutsDialog(host);
    dialog.open();

    const element = host.root.querySelector<HTMLDialogElement>("dialog.tt-dialog.tt-shortcuts")!;
    expect(dialog.isOpen()).toBe(true);
    expect(element.matches(":modal")).toBe(true);
    expect(document.getElementById(element.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "Keyboard shortcuts",
    );
    const tables = [...element.querySelectorAll("table")];
    expect(
      tables.map(
        (table) => document.getElementById(table.getAttribute("aria-labelledby")!)?.textContent,
      ),
    ).toEqual(["View", "Edit", "Tools"]);
    expect(element.textContent).toContain("Zoom to 100%");
    expect(element.querySelector(".tt-dialog__close")?.getAttribute("aria-label")).toBe("Close");
    expect(element.querySelector(".tt-dialog__close svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(element.contains(document.activeElement)).toBe(true);
  });

  test("shows the web app's File keys in a table of their own first", () => {
    const host = chrome("mac");
    createShortcutsDialog(host, { fileKeys: true }).open();

    const titles = [...host.root.querySelectorAll(".tt-shortcuts__group-title")].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual(["File", "View", "Edit", "Tools"]);
    const fileRows = [...host.root.querySelector("table")!.rows].map((row) => row.textContent);
    expect(fileRows).toEqual(["Open…⌘O", "Export as JSON⌘S"]);
  });

  test("closes on its Close button, gives the focus back to its opener and is removed by destroy()", async () => {
    const host = chrome();
    host.menu.trigger.focus();
    const dialog = createShortcutsDialog(host);
    dialog.open();

    const closed = closeEventOf(host.root.querySelector("dialog")!);
    host.root.querySelector<HTMLButtonElement>(".tt-dialog__close")!.click();
    await closed;
    expect(dialog.isOpen()).toBe(false);
    expect(document.activeElement).toBe(host.menu.trigger);

    dialog.destroy();
    expect(host.root.querySelector("dialog")).toBeNull();
    expect(dialog.isOpen()).toBe(false);
  });

  test("gives the focus back to the control that opened it, else to the menu trigger", async () => {
    const host = chrome();
    const opener = document.createElement("button");
    opener.textContent = "Help";
    host.root.append(opener);
    const dialog = createShortcutsDialog(host);

    opener.focus();
    dialog.open();
    let closed = closeEventOf(host.root.querySelector("dialog")!);
    dialog.close();
    await closed;
    expect(document.activeElement).toBe(opener);

    opener.focus();
    dialog.open();
    opener.remove();
    closed = closeEventOf(host.root.querySelector("dialog")!);
    dialog.close();
    await closed;
    expect(document.activeElement).toBe(host.menu.trigger);
  });

  test("brings its own styles: a raised panel and the key chips in Geist Mono", () => {
    const host = chrome();
    createShortcutsDialog(host).open();

    const panel = getComputedStyle(host.root.querySelector("dialog")!);
    expect(panel.backgroundColor).toBe(computedColour("var(--cd-ui-flaeche-hoch)"));
    expect(panel.borderTopLeftRadius).toBe("12px");
    expect(panel.display).toBe("flex");
    const chip = getComputedStyle(host.root.querySelector("kbd.tt-shortcuts__key")!);
    expect(chip.fontFamily).toContain("Geist Mono");
  });
});

describe("createTitleDialog", () => {
  function parts(root: HTMLElement) {
    const dialog = root.querySelector<HTMLDialogElement>("dialog.tt-dialog.tt-title-dialog")!;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>(".tt-dialog__footer button")];
    return {
      dialog,
      field: dialog.querySelector<HTMLInputElement>("input")!,
      form: dialog.querySelector<HTMLFormElement>("form")!,
      cancel: buttons.find((button) => button.textContent === "Cancel")!,
      apply: buttons.find((button) => button.textContent === "Apply")!,
    };
  }

  function type(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function titleOf(initial: string) {
    let current = initial;
    return {
      title: () => current,
      setTitle: vi.fn((next: string) => {
        current = next;
      }),
    };
  }

  test("opens modal on the current title with the field focused and labelled", () => {
    const host = chrome();
    createTitleDialog(host, titleOf("Payments")).open();

    const { dialog, field, cancel, apply } = parts(host.root);
    expect(dialog.matches(":modal")).toBe(true);
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "Diagram title",
    );
    expect(field.value).toBe("Payments");
    expect(document.activeElement).toBe(field);
    expect(dialog.querySelector("label")?.htmlFor).toBe(field.id);
    expect(dialog.querySelector("label")?.textContent).toBe("Title");
    expect([cancel.type, apply.type]).toEqual(["button", "submit"]);
  });

  test("applies the trimmed title once and gives the focus back to its opener", async () => {
    const host = chrome();
    const title = titleOf("Payments");
    host.menu.trigger.focus();
    createTitleDialog(host, title).open();
    const { dialog, field, form } = parts(host.root);

    type(field, "  Checkout  ");
    const closed = closeEventOf(dialog);
    form.requestSubmit();
    await closed;

    expect(title.setTitle).toHaveBeenCalledExactlyOnceWith("Checkout");
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(host.menu.trigger);
  });

  test("writes nothing for an unchanged title or on Cancel, and cannot apply a blank one", () => {
    const host = chrome();
    const title = titleOf("Payments");
    const dialog = createTitleDialog(host, title);

    dialog.open();
    parts(host.root).form.requestSubmit();
    dialog.open();
    type(parts(host.root).field, "Other");
    parts(host.root).cancel.click();
    expect(dialog.isOpen()).toBe(false);

    dialog.open();
    const { apply, field, form } = parts(host.root);
    type(field, "   ");
    expect(apply.disabled).toBe(true);
    form.requestSubmit();
    expect(dialog.isOpen()).toBe(true);
    expect(title.setTitle).not.toHaveBeenCalled();

    dialog.destroy();
    expect(host.root.querySelector("dialog")).toBeNull();
  });

  test("closes on a press on the backdrop, but not when a press that began in the panel ends there", () => {
    const host = chrome();
    const dialog = createTitleDialog(host, titleOf("Payments"));
    dialog.open();
    const { dialog: element, field } = parts(host.root);
    // A press outside the panel lands on the <dialog> itself (its ::backdrop).
    const pressAndRelease = (pressed: Element) => {
      pressed.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };

    pressAndRelease(field);
    expect(dialog.isOpen()).toBe(true);

    pressAndRelease(element);
    expect(dialog.isOpen()).toBe(false);
  });

  test("fills Apply in the brand blue and greys it out while it cannot apply", async () => {
    const host = chrome();
    createTitleDialog(host, titleOf("Payments")).open();
    const { apply, cancel, field } = parts(host.root);

    expect(getComputedStyle(apply).backgroundColor).toBe(computedColour(CD_TOKENS["--cd-blau"]));
    expect(getComputedStyle(apply).color).toBe(computedColour(CD_TOKENS["--cd-weiss"]));
    expect(getComputedStyle(cancel).backgroundColor).toBe(
      computedColour("var(--cd-ui-flaeche-hoch)"),
    );
    expect(getComputedStyle(field).borderTopColor).toBe(computedColour("var(--cd-ui-kontur)"));
    type(field, "");
    // The button eases into its disabled colours.
    await Promise.all(apply.getAnimations().map((animation) => animation.finished));
    expect(getComputedStyle(apply).backgroundColor).toBe(computedColour("var(--cd-ui-hover)"));
  });

  test("keeps Apply in the brand blue in the dark mode, whose interaction role is lighter", () => {
    const host = chrome();
    host.root.dataset.cdTheme = "dark";
    createTitleDialog(host, titleOf("Payments")).open();
    const { apply } = parts(host.root);

    const interaction = getComputedStyle(host.root).getPropertyValue("--cd-ui-interaktion");
    expect(computedColour(interaction)).not.toBe(computedColour(CD_TOKENS["--cd-blau"]));
    expect(getComputedStyle(apply).backgroundColor).toBe(computedColour(CD_TOKENS["--cd-blau"]));
    expect(getComputedStyle(apply).color).toBe(computedColour(CD_TOKENS["--cd-weiss"]));
  });

  test("lifts Apply in the link blue while a key presses it, with no pointer over it", async () => {
    const host = chrome();
    createTitleDialog(host, titleOf("Payments")).open();
    const { apply } = parts(host.root);

    apply.focus();
    await userEvent.keyboard("{Space>}");
    cleanups.push(() => userEvent.keyboard("{/Space}"));
    await Promise.all(apply.getAnimations().map((animation) => animation.finished));

    expect([apply.matches(":active"), apply.matches(":hover")]).toEqual([true, false]);
    expect(getComputedStyle(apply).backgroundColor).toBe(
      computedColour(CD_TOKENS["--cd-blau-link"]),
    );
    expect(getComputedStyle(apply).boxShadow).toBe(computedShadow("var(--cd-shadow-2)"));
    expect(new DOMMatrixReadOnly(getComputedStyle(apply).transform).f).toBe(-1);
  });

  describe("in high contrast, which is the nearest mode carrier's (#401, guide §13.3)", () => {
    /** The panel's edge and shadow, the rings of the field and of a button, the hovered Apply's shadow. */
    async function dialogLook(root: HTMLElement): Promise<Record<string, string>> {
      createTitleDialog({ ...chrome(), root }, titleOf("Payments")).open();
      const { dialog, field, cancel, apply } = parts(root);
      const panel = getComputedStyle(dialog);
      const look = {
        border: panel.borderTopColor,
        shadow: panel.boxShadow,
        fieldRing: getComputedStyle(field).outlineWidth,
      };
      cancel.focus();
      await userEvent.keyboard("{Shift}");
      expect(cancel.matches(":focus-visible")).toBe(true);
      const buttonRing = getComputedStyle(cancel).outlineWidth;
      await userEvent.hover(apply);
      await Promise.all(apply.getAnimations().map((animation) => animation.finished));
      expect(apply.matches(":hover")).toBe(true);
      return { ...look, buttonRing, hoveredPrimaryShadow: getComputedStyle(apply).boxShadow };
    }

    function rootIn(carrier: HTMLElement): HTMLElement {
      const root = document.createElement("div");
      carrier.append(root);
      document.body.append(carrier);
      cleanups.push(() => carrier.remove());
      return root;
    }

    function pageMode(contrast?: "hoch"): void {
      const page = document.documentElement;
      page.dataset.cdTheme = "light";
      if (contrast) page.dataset.cdKontrast = contrast;
      cleanups.push(() => {
        delete page.dataset.cdTheme;
        delete page.dataset.cdKontrast;
      });
    }

    /** What `property: value` computes to inside `element`, where the roles are its own. */
    function resolvedIn(element: HTMLElement, property: string, value: string): string {
      const probe = document.createElement("span");
      probe.style.setProperty(property, value);
      element.append(probe);
      const computed = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return computed;
    }

    test("keeps the shadows, the edge and the 2px rings under a normal-contrast carrier on a high-contrast page", async () => {
      pageMode("hoch");
      const carrier = document.createElement("section");
      carrier.dataset.cdTheme = "light";
      const root = rootIn(carrier);

      expect(await dialogLook(root)).toEqual({
        border: resolvedIn(root, "color", "var(--cd-ui-linie)"),
        shadow: resolvedIn(root, "box-shadow", "var(--cd-shadow-3)"),
        fieldRing: "2px",
        buttonRing: "2px",
        hoveredPrimaryShadow: resolvedIn(root, "box-shadow", "var(--cd-shadow-2)"),
      });
    });

    test("drops the shadows, also of a hovered Apply, draws the contour edge and widens the rings under a high-contrast carrier", async () => {
      pageMode();
      const carrier = document.createElement("section");
      carrier.dataset.cdTheme = "light";
      carrier.dataset.cdKontrast = "hoch";
      const root = rootIn(carrier);

      expect(await dialogLook(root)).toEqual({
        border: resolvedIn(root, "color", "var(--cd-ui-kontur)"),
        shadow: "none",
        fieldRing: "3px",
        buttonRing: "3px",
        hoveredPrimaryShadow: "none",
      });
    });
  });

  test("renames a modeler's diagram as one undo step through ttModeling", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:900px;height:640px";
    document.body.append(container);
    const modeler = new Modeler({ container });
    cleanups.push(() => {
      modeler.destroy();
      container.remove();
    });
    modeler.importDocument(SAMPLE_DOCUMENT);
    const before = modeler.getMeta()?.title ?? "";
    const host = chrome();
    const dialog = createTitleDialog(host, {
      title: () => modeler.getMeta()?.title ?? "",
      setTitle: (next) => modeler.get<TtModeling>("ttModeling").setTitle(next),
    });

    dialog.open();
    type(parts(host.root).field, "Team landscape 2026");
    const closed = closeEventOf(parts(host.root).dialog);
    parts(host.root).form.requestSubmit();
    await closed;

    expect(modeler.getMeta()?.title).toBe("Team landscape 2026");
    expect(modeler.exportDocument().title).toBe("Team landscape 2026");
    modeler.undo();
    expect(modeler.getMeta()?.title).toBe(before);
    expect(modeler.canUndo()).toBe(false);
  });
});
