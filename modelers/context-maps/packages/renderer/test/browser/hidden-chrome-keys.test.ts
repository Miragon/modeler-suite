import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { Modeler, type CmElement, type CmLabelEditing } from "@miragon/context-maps-renderer";
import { emptyDocument, type CmDocument } from "@miragon/context-maps-schema-model";

function mapDocument(): CmDocument {
  const doc = emptyDocument("Hidden chrome");
  doc.contexts = [
    {
      id: "billing",
      label: "Billing",
      position: { x: 100, y: 200 },
      size: { width: 200, height: 110 },
    },
  ];
  return doc;
}

/**
 * The ways a host hides a map it keeps. The browser moves the focus off the hidden control only at
 * its next rendering update, so each case presses its keys at the still-focused control first.
 */
const hostHidings = [
  {
    how: "made it inert",
    hide: (host: HTMLElement) => (host.inert = true),
    show: (host: HTMLElement) => (host.inert = false),
  },
  {
    how: "hid it with display: none",
    hide: (host: HTMLElement) => (host.style.display = "none"),
    show: (host: HTMLElement) => host.style.removeProperty("display"),
  },
  {
    how: "hid it with visibility: hidden",
    hide: (host: HTMLElement) => host.style.setProperty("visibility", "hidden"),
    show: (host: HTMLElement) => host.style.removeProperty("visibility"),
  },
];

/**
 * diagram-js-direct-editing moves the focus into its box only inside a frame that has the focus,
 * as it has for a user who opened the editor.
 */
async function focusTheFrame(): Promise<void> {
  const target = document.createElement("div");
  target.style.width = "16px";
  target.style.height = "16px";
  document.body.append(target);
  await userEvent.click(target);
  target.remove();
  expect(document.hasFocus()).toBe(true);
}

describe("the map's own chrome on a map the host hides", () => {
  let host: HTMLElement;
  let modeler: Modeler;
  const keysAtWindow: string[] = [];
  const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

  beforeEach(async () => {
    await focusTheFrame();
    host = document.createElement("div");
    const container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    host.appendChild(container);
    document.body.appendChild(host);
    modeler = new Modeler({ container });
    modeler.importDocument(mapDocument());
    window.addEventListener("keydown", countKeyAtWindow);
  });

  afterEach(() => {
    window.removeEventListener("keydown", countKeyAtWindow);
    keysAtWindow.length = 0;
    modeler.destroy();
    host.remove();
  });

  function billing(): CmElement {
    return modeler.get<ElementRegistry>("elementRegistry").get("billing") as unknown as CmElement;
  }

  function directEditingIsActive(): boolean {
    return modeler.get<{ isActive(): boolean }>("directEditing").isActive();
  }

  function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  /** Each key reaches the page untouched: not prevented and on to the window. */
  function expectLeftToPage(target: EventTarget, keys: readonly KeyboardEventInit[]): void {
    for (const init of keys) {
      const before = keysAtWindow.length;
      const name = `${init.ctrlKey ? "Ctrl+" : ""}${init.key}`;
      expect(pressKey(target, init).defaultPrevented, name).toBe(false);
      expect(keysAtWindow.length, `${name} at the window`).toBe(before + 1);
    }
  }

  it.each(hostHidings)(
    "the name editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      modeler.get<CmLabelEditing>("cmLabelEditing").activate(billing());
      const content = host.querySelector<HTMLElement>(".djs-direct-editing-content")!;
      expect(document.activeElement).toBe(content);
      content.innerText = "Invoicing";
      hide(host);

      expectLeftToPage(content, [
        { key: "Enter", keyCode: 13 },
        { key: "Escape", keyCode: 27 },
      ]);
      expect(directEditingIsActive()).toBe(true);
      expect(modeler.exportDocument().contexts[0]?.label).toBe("Billing");

      show(host);
      expect(pressKey(content, { key: "Enter", keyCode: 13 }).defaultPrevented).toBe(true);
      expect(directEditingIsActive()).toBe(false);
      expect(modeler.exportDocument().contexts[0]?.label).toBe("Invoicing");
    },
  );

  it.each(hostHidings)(
    "the description editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      modeler.get<Selection>("selection").select(billing());
      host
        .querySelector('.djs-context-pad.open [data-action="description"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      const field = host.querySelector<HTMLTextAreaElement>(".cm-pad-prompt__field")!;
      expect(document.activeElement).toBe(field);
      field.value = "Sends the invoices";
      hide(host);

      expectLeftToPage(field, [{ key: "Enter", ctrlKey: true }, { key: "Escape" }]);
      expect(field.isConnected).toBe(true);
      expect(modeler.exportDocument().contexts[0]?.description).toBeUndefined();

      show(host);
      expect(pressKey(field, { key: "Enter", ctrlKey: true }).defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(modeler.exportDocument().contexts[0]?.description).toBe("Sends the invoices");
    },
  );
});
