import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createShortcutsDialog, type ShortcutsDialogChrome } from "../../src/index.js";
import "../../src/assets/event-storming.css";

/*
 * createShortcutsDialog is deprecated (issue #262): the apps open the shell's dialog, and designIQ
 * is the one consumer left, so this file is the only check of what it still promises. Delete it with
 * the dialog.
 */
describe("the deprecated createShortcutsDialog (real browser DOM)", () => {
  let root: HTMLElement;
  let trigger: HTMLButtonElement;
  let chrome: ShortcutsDialogChrome;

  beforeEach(() => {
    root = document.createElement("div");
    trigger = document.createElement("button");
    trigger.textContent = "Menu";
    root.append(trigger);
    document.body.append(root);
    chrome = {
      root,
      platform: "other",
      lang: "en",
      menu: { trigger },
      messages: {
        close: "Close",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        zoomToActual: (percent) => `Zoom to ${percent}`,
        fit: "Fit to view",
        keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
      },
    };
  });

  afterEach(() => {
    root.remove();
  });

  it("opens a modal dialog in the chrome's root with one table per shortcut group", () => {
    const dialog = createShortcutsDialog(chrome);

    dialog.open();

    const element = root.querySelector<HTMLDialogElement>("dialog.event-storming-shortcuts");
    expect(dialog.isOpen()).toBe(true);
    expect(element?.open).toBe(true);
    expect(
      [...root.querySelectorAll(".event-storming-shortcuts-group-title")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["View", "Edit", "Tools"]);
    dialog.destroy();
  });

  it("closes on Escape and hands the focus back to the menu trigger", async () => {
    const dialog = createShortcutsDialog(chrome);
    dialog.open();
    expect(document.activeElement?.closest("dialog")).not.toBeNull();

    await userEvent.keyboard("{Escape}");

    expect(dialog.isOpen()).toBe(false);
    await expect.poll(() => document.activeElement).toBe(trigger);
    dialog.destroy();
  });

  it("closes with its Close button, which carries the chrome's label", async () => {
    const dialog = createShortcutsDialog(chrome);
    dialog.open();
    const close = root.querySelector<HTMLButtonElement>(".event-storming-shortcuts-close");
    expect(close?.getAttribute("aria-label")).toBe("Close");

    close?.click();

    expect(dialog.isOpen()).toBe(false);
    await expect.poll(() => document.activeElement).toBe(trigger);
    dialog.destroy();
  });

  it("removes the dialog from the root on destroy", () => {
    const dialog = createShortcutsDialog(chrome);
    dialog.open();

    dialog.destroy();

    expect(root.querySelector("dialog")).toBeNull();
    expect(dialog.isOpen()).toBe(false);
  });
});
