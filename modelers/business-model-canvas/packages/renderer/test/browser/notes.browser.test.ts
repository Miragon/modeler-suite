import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { parse } from "yaml";
import {
  connectNotes,
  createCollaborativeModeler,
  type CollaborativeDiagram,
  type InspectorSlot,
  type NotesConnection,
  type ReadOnly,
} from "../../src/index.js";
import orders from "./fixtures/orders.bmc?raw";

let modeler: CollaborativeDiagram;
let host: HTMLElement;
let inspector: HTMLElement;
let notes: NotesConnection;

/** The shell's inspector slot as the panel sees it: an element it may open and close. */
function inspectorSlot(element: HTMLElement): InspectorSlot {
  return {
    element,
    isOpen: () => !element.hidden,
    open: () => (element.hidden = false),
    close: () => (element.hidden = true),
  };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
const service = <T>(name: string): T => modeler.diagram.get<T>(name);
/** The fields of the written file these tests read. */
interface Written {
  canvas?: { title?: string; notes?: unknown };
  channels?: { notes?: unknown };
  "value-propositions"?: { items: { id: string; notes?: unknown }[] };
}
const exported = () => parse(modeler.exportText()) as Written;
const marker = (label: string) =>
  host.querySelector<HTMLButtonElement>(`.bmc-note-marker button[aria-label^="${label}"]`);
const draft = () => inspector.querySelector<HTMLTextAreaElement>(".bmc-panel-note-draft textarea");
const savedTexts = () =>
  [
    ...inspector.querySelectorAll<HTMLTextAreaElement>(
      ".bmc-panel-note:not(.bmc-panel-note-draft) textarea",
    ),
  ].map((text) => text.value);

function type(field: HTMLTextAreaElement, text: string): void {
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event("input"));
}

function leave(field: HTMLElement): void {
  field.blur();
}

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  host = attachedHost();
  modeler.attachTo(host);
  inspector = document.createElement("aside");
  inspector.hidden = true;
  document.body.append(inspector);
  notes = connectNotes(inspectorSlot(inspector), modeler.diagram);
  await modeler.importText(orders);
  await frame();
  await frame();
});

afterEach(() => {
  notes.destroy();
  modeler.destroy();
  inspector.remove();
  host.parentElement?.remove();
});

describe("the notes markers", () => {
  it("show one comment per place, with a count only once it has notes", async () => {
    expect(marker("Add a note to the whole canvas")).not.toBeNull();
    expect(marker("Add a note to Channels")?.textContent).toBe("");
    await modeler.importText(`${orders}channels:\n  notes:\n    - text: One\n    - text: Two\n`);
    await frame();
    await frame();
    expect(marker("Notes on Channels, 2")?.textContent).toBe("2");
    expect(host.querySelectorAll(".bmc-note-marker")).toHaveLength(10);
  });

  it("leave places without notes out on a read-only canvas", async () => {
    service<ReadOnly>("readOnly").setReadOnly(true);
    await frame();
    expect(host.querySelectorAll(".bmc-note-marker")).toHaveLength(0);
  });

  it("are no part of an export", () => {
    expect(modeler.diagram.saveSVG().svg).not.toContain("bmc-note-marker");
  });
});

describe("the notes panel", () => {
  it("starts a note on an empty place and writes it as one undo step when the field is left", async () => {
    marker("Add a note to Channels")!.click();
    await frame();
    expect(inspector.hidden).toBe(false);
    const field = draft()!;
    expect(document.activeElement).toBe(field);
    type(field, "Partner listing in the Orca catalog?");
    leave(field);
    expect(exported().channels?.notes).toEqual([{ text: "Partner listing in the Orca catalog?" }]);
    service<CommandStack>("commandStack").undo();
    expect(exported().channels).toBeUndefined();
  });

  it("keeps an empty new note open when the focus goes elsewhere", async () => {
    marker("Add a note to Channels")!.click();
    await frame();
    leave(draft()!);
    expect(draft()).not.toBeNull();
    expect(exported().channels).toBeUndefined();
  });

  it("puts back a text that was cleared and left, and removes a note only with its bin", async () => {
    await modeler.importText(`${orders}channels:\n  notes:\n    - text: Keep me\n`);
    await frame();
    await frame();
    marker("Notes on Channels")!.click();
    await frame();
    const field = inspector.querySelector<HTMLTextAreaElement>(".bmc-panel-text")!;
    type(field, "");
    leave(field);
    expect(field.value).toBe("Keep me");
    expect(exported().channels?.notes).toEqual([{ text: "Keep me" }]);
    inspector.querySelector<HTMLButtonElement>('[aria-label="Delete note"]')!.click();
    expect(exported().channels).toBeUndefined();
  });

  it("shows only the notes of the place it was opened for", async () => {
    const withCanvasNote = orders.replace(
      "canvas:\n  title: Orders\n",
      "canvas:\n  title: Orders\n  notes:\n    - text: On the canvas\n",
    );
    await modeler.importText(`${withCanvasNote}channels:\n  notes:\n    - text: On channels\n`);
    await frame();
    await frame();
    marker("Notes on Channels")!.click();
    await frame();
    expect(savedTexts()).toEqual(["On channels"]);
    marker("Notes on the whole canvas")!.click();
    await frame();
    expect(savedTexts()).toEqual(["On the canvas"]);
    expect(inspector.querySelector(".bmc-panel-place")?.textContent).toBe("Whole canvas");
  });

  it("follows the one selected sticky and writes its notes on it", async () => {
    notes.panel.show(undefined, false);
    service<Selection>("selection").select(service<ElementRegistry>("elementRegistry").get("pay")!);
    await frame();
    expect(inspector.querySelector(".bmc-panel-place")?.textContent).toBe("Sticky: Pay");
    inspector.querySelector<HTMLButtonElement>('[data-key="add"]')!.click();
    await frame();
    type(draft()!, "Which providers?");
    leave(draft()!);
    const pay = exported()["value-propositions"]?.items.find((item) => item.id === "pay");
    expect(pay?.notes).toEqual([{ text: "Which providers?" }]);
  });

  it("writes notes on the whole canvas under canvas.notes", async () => {
    marker("Add a note to the whole canvas")!.click();
    await frame();
    type(draft()!, "Pricing still open");
    leave(draft()!);
    expect(exported().canvas).toEqual({ title: "Orders", notes: [{ text: "Pricing still open" }] });
  });
});
