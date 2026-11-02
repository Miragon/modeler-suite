import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type LabelEditing from "../../src/label-editing/LabelEditing.js";
import { isElementShape, type C4ElementShape } from "../../src/scene/types.js";
import {
  destroyMounted,
  elementNamed,
  mountModeler,
  press,
  service,
  shapeOf,
  type Mounted,
} from "./support/interaction/mount.js";

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

let page: Mounted;
const keysAtWindow: string[] = [];
const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

beforeEach(async () => {
  page = await mountModeler();
  window.addEventListener("keydown", countKeyAtWindow);
});

afterEach(() => {
  window.removeEventListener("keydown", countKeyAtWindow);
  keysAtWindow.length = 0;
  destroyMounted();
});

function payments(): C4ElementShape {
  const shape = shapeOf(page.modeler, "payments");
  if (!isElementShape(shape)) throw new Error("payments is no element shape");
  return shape;
}

describe("the diagram's own chrome on a diagram the host hides", () => {
  it.each(hostHidings)(
    "the label editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      const labelEditing = service<LabelEditing>(page.modeler, "labelEditing");
      labelEditing.activate(payments());
      const field = page.host.querySelector<HTMLTextAreaElement>(".diagram-label-editor")!;
      expect(document.activeElement).toBe(field);
      field.value = "Payments Inc";
      hide(page.host);

      for (const key of ["Enter", "Escape", "Tab"]) {
        const before = keysAtWindow.length;
        expect(press(field, key), key).toBe(true);
        expect(keysAtWindow.length, `${key} at the window`).toBe(before + 1);
      }
      expect(labelEditing.isActive()).toBe(true);
      expect(elementNamed(page.modeler, "payments")?.name).toBe("Payment Provider");

      show(page.host);
      expect(press(field, "Enter")).toBe(false);
      expect(labelEditing.isActive()).toBe(false);
      expect(elementNamed(page.modeler, "payments")?.name).toBe("Payments Inc");
    },
  );
});
