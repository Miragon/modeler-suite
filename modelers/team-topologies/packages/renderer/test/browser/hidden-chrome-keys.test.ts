import { afterEach, describe, expect, test } from "vitest";
import { Modeler, type TtElement, type TtLabelEditing } from "@miragon/team-topologies-renderer";
import { emptyDocument, type TtDocument } from "@miragon/team-topologies-schema-model";

/**
 * The ways a host hides a diagram it keeps. The browser moves the focus off the hidden control only
 * at its next rendering update, so each case presses its keys at the still-focused control first.
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

function topologyDocument(): TtDocument {
  return {
    ...emptyDocument("Hidden chrome"),
    nodes: [
      {
        id: "team_a",
        type: "stream-aligned",
        label: "A",
        position: { x: 80, y: 200 },
        size: { width: 200, height: 80 },
      },
    ],
  };
}

let host: HTMLElement | undefined;
let modeler: Modeler | undefined;
const keysAtWindow: string[] = [];
const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

function mount(): { modeler: Modeler; host: HTMLElement } {
  host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:900px;height:640px";
  const container = document.createElement("div");
  container.style.cssText = "width:900px;height:640px";
  host.appendChild(container);
  document.body.appendChild(host);
  modeler = new Modeler({ container });
  modeler.importDocument(topologyDocument(), { fit: false });
  window.addEventListener("keydown", countKeyAtWindow);
  return { modeler, host };
}

afterEach(() => {
  window.removeEventListener("keydown", countKeyAtWindow);
  keysAtWindow.length = 0;
  modeler?.destroy();
  host?.remove();
  modeler = undefined;
  host = undefined;
});

function teamA(target: Modeler): TtElement {
  return target.get<{ get(id: string): TtElement }>("elementRegistry").get("team_a");
}

function press(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Each key reaches the page untouched: not prevented and on to the window. */
function expectLeftToPage(target: EventTarget, keys: readonly string[]): void {
  for (const key of keys) {
    const before = keysAtWindow.length;
    expect(press(target, key).defaultPrevented, key).toBe(false);
    expect(keysAtWindow.length, `${key} at the window`).toBe(before + 1);
  }
}

/** Past diagram-js' scheduled pad updates. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("the diagram's own chrome on a diagram the host hides", () => {
  test.each(hostHidings)(
    "the context pad leaves Enter and Space to the page once the host $how",
    async ({ hide, show }) => {
      const { modeler: target, host: page } = mount();
      target.get<{ select(element: unknown): void }>("selection").select(teamA(target) as unknown);
      await settle();
      const remove = page.querySelector<HTMLElement>(
        '.djs-context-pad.open [data-action="delete"]',
      )!;
      remove.tabIndex = 0;
      remove.focus();
      hide(page);
      expect(document.activeElement).toBe(remove);

      expectLeftToPage(remove, ["Enter", " "]);
      expect(target.exportDocument().nodes).toHaveLength(1);

      show(page);
      expect(press(remove, "Enter").defaultPrevented).toBe(true);
      expect(target.exportDocument().nodes).toHaveLength(0);
    },
  );

  test.each(hostHidings)(
    "the label editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      const { modeler: target, host: page } = mount();
      target.get<TtLabelEditing>("ttLabelEditing").activate(teamA(target));
      const editor = page.querySelector<HTMLTextAreaElement>("textarea.tt-label-editor")!;
      expect(document.activeElement).toBe(editor);
      editor.value = "Checkout";
      hide(page);

      expectLeftToPage(editor, ["Enter", "Escape"]);
      expect(editor.isConnected).toBe(true);
      expect(target.exportDocument().nodes[0]?.label).toBe("A");

      show(page);
      expect(press(editor, "Enter").defaultPrevented).toBe(true);
      expect(editor.isConnected).toBe(false);
      expect(target.exportDocument().nodes[0]?.label).toBe("Checkout");
    },
  );
});
