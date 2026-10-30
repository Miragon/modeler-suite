import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import {
  VALUE_CHAIN_THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeValueChainModeler,
  type VcLabelEditingProvider,
  type VcModeling,
} from "../../src/index.js";
import "../../src/assets/value-chain.css";
import ORDER_TO_CASH from "./fixtures/order-to-cash.vc.json?raw";
import { CanvasPointer, exportImage } from "./support/pointer.js";

/**
 * Contract 1.5 `appearance` (`packages/api/README.md`, "Cases for the 1.5 surfaces"; guide §13.3,
 * row "Eingebettet"): a light-only canvas stays light when dark is requested, also on a dark page;
 * the contrast always applies; a request is view state and never reaches the document or an
 * export.
 */

const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "text-decoration-color",
  "caret-color",
  "column-rule-color",
  "color-scheme",
] as const;

/** A theme and a contrast no modeler knows, as an untyped host may send them. */
const UNKNOWN_THEME = { theme: "sepia" } as unknown as AppearanceRequest;
const UNKNOWN_CONTRAST = { theme: "light", contrast: "max" } as unknown as AppearanceRequest;

const REQUESTS: AppearanceRequest[] = [
  { theme: "light" },
  { theme: "dark" },
  { theme: "light", contrast: "high" },
  { theme: "dark", contrast: "high" },
  { theme: "light", contrast: "normal" },
  UNKNOWN_THEME,
  UNKNOWN_CONTRAST,
];

let modeler: CollaborativeValueChainModeler | undefined;
let host: HTMLElement;
let changes = 0;

function editor(): CollaborativeValueChainModeler {
  if (!modeler) throw new Error("no modeler mounted");
  return modeler;
}

/** The computed colours of every element the modeler drew into its host, in document order. */
function computedColours(): string[] {
  return [...host.querySelectorAll("*")].map((element) => {
    const style = getComputedStyle(element);
    return COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property)).join("|");
  });
}

function pageMode(theme: string | null, contrast: string | null): void {
  const root = document.documentElement;
  if (theme) root.setAttribute("data-cd-theme", theme);
  else root.removeAttribute("data-cd-theme");
  if (contrast) root.setAttribute("data-cd-kontrast", contrast);
  else root.removeAttribute("data-cd-kontrast");
}

function history(): { canUndo: boolean; canRedo: boolean } {
  const stack = editor().diagram.get<CommandStack>("commandStack");
  return { canUndo: stack.canUndo(), canRedo: stack.canRedo() };
}

/** Everything a request must leave as it was: document, picture, view, selection and history. */
function viewAndDocument(): unknown {
  return {
    text: editor().exportText(),
    image: exportImage(editor()),
    view: editor().getViewState(),
    selection: editor().elements.selection(),
    history: history(),
  };
}

beforeEach(async () => {
  pageMode(null, null);
  host = attachedHost(1000, 700);
  modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(ORDER_TO_CASH);
  changes = 0;
  modeler.onContentChanged(() => (changes += 1));
});

afterEach(() => {
  pageMode(null, null);
  modeler?.destroy();
  modeler = undefined;
});

describe("appearance: themes", () => {
  it("lists light only, the same list on every read, every instance and the viewer", () => {
    const fresh = createCollaborativeModeler();
    const viewer = createCollaborativeViewer();
    const { themes } = editor().appearance;

    expect(themes).toEqual(["light"]);
    expect(new Set(themes).size).toBe(themes.length);
    expect(themes.every((theme) => theme === "light" || theme === "dark")).toBe(true);
    expect(editor().appearance.themes).toBe(themes);
    expect(fresh.appearance.themes).toBe(themes);
    expect(viewer.appearance.themes).toBe(themes);
    expect(themes).toBe(VALUE_CHAIN_THEMES);
    fresh.destroy();
    viewer.destroy();
  });
});

describe("appearance: set", () => {
  it("before attachTo and before the first import, and holds across later imports", async () => {
    const fresh = createCollaborativeModeler();
    const root = fresh.diagram.container;
    expect(root.hasAttribute("data-cd-theme")).toBe(false);

    expect(() => fresh.appearance.set({ theme: "dark", contrast: "high" })).not.toThrow();
    expect(root.getAttribute("data-cd-theme")).toBe("light");
    expect(root.getAttribute("data-cd-kontrast")).toBe("hoch");

    fresh.attachTo(attachedHost(1000, 700));
    await fresh.importText(ORDER_TO_CASH);
    await fresh.importText("");
    expect(root.getAttribute("data-cd-theme")).toBe("light");
    expect(root.getAttribute("data-cd-kontrast")).toBe("hoch");
    fresh.destroy();
  });

  it("draws the listed theme, light for any other, and high contrast only when asked for", () => {
    const root = editor().diagram.container;
    const drawn = (request: AppearanceRequest): [string | null, string | null] => {
      editor().appearance.set(request);
      return [root.getAttribute("data-cd-theme"), root.getAttribute("data-cd-kontrast")];
    };

    expect(drawn({ theme: "light" })).toEqual(["light", null]);
    expect(drawn({ theme: "dark", contrast: "high" })).toEqual(["light", "hoch"]);
    expect(drawn({ theme: "dark" })).toEqual(["light", null]);
    expect(drawn({ theme: "light", contrast: "high" })).toEqual(["light", "hoch"]);
    expect(drawn({ theme: "light", contrast: "normal" })).toEqual(["light", null]);
    expect(drawn(UNKNOWN_THEME)).toEqual(["light", null]);
    expect(drawn(UNKNOWN_CONTRAST)).toEqual(["light", null]);
  });

  it("never throws, whatever an untyped host passes", () => {
    const untyped = editor().appearance.set as (request: unknown) => void;
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("no fields");
        },
      },
    );
    for (const request of [undefined, null, 42, "dark", [], throwing]) {
      expect(() => untyped(request)).not.toThrow();
      expect(editor().diagram.container.getAttribute("data-cd-theme")).toBe("light");
    }
  });

  it("is view state: no change event, the text and the SVG export byte-identical, view, selection and history kept", () => {
    const step = editor().diagram.get<VcModeling>("vcModeling");
    const pointer = new CanvasPointer(editor());
    step.updateLabel(pointer.shape("step-credit"), "Credit limit");
    editor().elements.reveal("step-delivery");
    editor().setViewState({ x: 120, y: 80, width: 640, height: 480 });
    changes = 0;
    const before = viewAndDocument();

    for (const request of REQUESTS) {
      editor().appearance.set(request);
      expect(viewAndDocument()).toEqual(before);
    }
    expect(changes).toBe(0);
  });

  it("on the viewer, and after destroy without a throw", async () => {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(attachedHost(1000, 700));
    await viewer.importText(ORDER_TO_CASH);
    const image = exportImage(viewer);

    viewer.appearance.set({ theme: "dark", contrast: "high" });
    expect(viewer.diagram.container.getAttribute("data-cd-theme")).toBe("light");
    expect(viewer.diagram.container.getAttribute("data-cd-kontrast")).toBe("hoch");
    expect(exportImage(viewer)).toBe(image);

    viewer.destroy();
    expect(() => viewer.appearance.set({ theme: "light" })).not.toThrow();
  });
});

describe("appearance: the computed colours", () => {
  beforeEach(() => {
    editor().elements.reveal("step-delivery");
  });

  /** The reference: a request for themes[0] on a page that says nothing about its mode. */
  function reference(contrast: "normal" | "high"): string[] {
    pageMode(null, null);
    editor().appearance.set({ theme: "light", contrast });
    return computedColours();
  }

  it("high contrast changes what the canvas draws", () => {
    expect(reference("high")).not.toEqual(reference("normal"));
  });

  it("stay light on a dark page with high contrast, for a request of dark and of an unknown theme, with each contrast, also after a re-import", async () => {
    for (const contrast of ["normal", "high"] as const) {
      const expected = reference(contrast);
      pageMode("dark", "hoch");
      for (const request of [{ theme: "dark" }, UNKNOWN_THEME]) {
        editor().appearance.set({ ...request, contrast } as AppearanceRequest);
        expect(computedColours()).toEqual(expected);
      }
    }

    await editor().importText(ORDER_TO_CASH);
    editor().elements.reveal("step-delivery");
    for (const contrast of ["normal", "high"] as const) {
      const expected = reference(contrast);
      pageMode("dark", "hoch");
      editor().appearance.set({ theme: "dark", contrast });
      expect(computedColours()).toEqual(expected);
    }
  });

  it("follow a dark page without a request, so a set that does nothing would fail the check above", () => {
    const expected = reference("normal");
    const fresh = createCollaborativeModeler();
    expect(fresh.diagram.container.hasAttribute("data-cd-theme")).toBe(false);
    fresh.destroy();
    editor().diagram.container.removeAttribute("data-cd-theme");
    pageMode("dark", "hoch");

    expect(computedColours()).not.toEqual(expected);
  });

  it("follow the nearest carrier without a request: one in normal contrast on a high-contrast page, one in high contrast on a page in normal contrast (#401)", () => {
    const normal = reference("normal");
    const high = reference("high");
    editor().diagram.container.removeAttribute("data-cd-theme");
    editor().diagram.container.removeAttribute("data-cd-kontrast");

    pageMode(null, "hoch");
    host.setAttribute("data-cd-theme", "light");
    expect(computedColours()).toEqual(normal);

    pageMode(null, null);
    host.setAttribute("data-cd-kontrast", "hoch");
    expect(computedColours()).toEqual(high);
  });
});

describe("appearance: a label being typed", () => {
  it("stays open with its input, commits nothing, and the user's commit writes what it would have", () => {
    const pointer = new CanvasPointer(editor());
    pointer
      .graphics("step-credit")
      .dispatchEvent(pointer.event("dblclick", pointer.centreOf("step-credit")));
    const content = editor().diagram.container.querySelector<HTMLElement>(
      ".djs-direct-editing-content",
    );
    if (!content) throw new Error("the label editor did not open");
    content.innerText = "typed, not committed";
    const text = editor().exportText();

    for (const request of REQUESTS) editor().appearance.set(request);

    expect(changes).toBe(0);
    expect(editor().exportText()).toBe(text);
    const open = editor().diagram.get<VcLabelEditingProvider>("vcLabelEditingProvider").openEdit();
    expect(open?.element.id).toBe("step-credit");
    expect(open?.text).toBe("typed, not committed");

    content.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true }),
    );
    expect(changes).toBe(1);
    expect(pointer.shape("step-credit").vcLabel).toBe("typed, not committed");
  });
});
