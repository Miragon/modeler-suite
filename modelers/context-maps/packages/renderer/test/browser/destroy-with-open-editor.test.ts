/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  Modeler,
  createCollaborativeModeler,
  type CmContext,
  type CmLabelEditing,
} from "@miragon/context-maps-renderer";
import { emptyDocument, serializeDocumentText } from "@miragon/context-maps-schema-model";

// A host may destroy the modeler while an editor on the canvas holds typed text (#439). The
// teardown removes the canvas container, which takes the focus off the editor: its blur must not
// commit the text to a map that is being destroyed, nor restore the focus to a canvas that is gone.

const TYPED = "typed";

/** Past diagram-js's debounced focus restore and the work a commit would schedule. */
const SETTLE_MS = 100;

type Editor = "description" | "context name" | "team";

const EDITORS: readonly Editor[] = ["description", "context name", "team"];

/** What a case needs of the map, whether the host holds the `Modeler` or the contract instance. */
interface HostedMap {
  get<T>(name: string): T;
  readonly container: HTMLElement;
}

interface Mounted {
  map: HostedMap;
  destroy(): void;
}

const wrappers: HTMLElement[] = [];
const stopListening: (() => void)[] = [];

afterEach(() => {
  for (const stop of stopListening.splice(0)) stop();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

const MOUNTS: Record<"Modeler" | "contract", () => Promise<Mounted>> = {
  async Modeler() {
    const container = document.createElement("div");
    container.style.cssText = "width:1024px;height:768px";
    document.body.append(container);
    wrappers.push(container);
    const modeler = new Modeler({ container });
    modeler.importText(mapText());
    return { map: modeler, destroy: () => modeler.destroy() };
  },
  async contract() {
    const modeler = createCollaborativeModeler();
    const host = attachedHost();
    wrappers.push(host.parentElement!);
    modeler.attachTo(host);
    await modeler.importText(mapText());
    return { map: modeler.diagram, destroy: () => modeler.destroy() };
  },
};

function mapText(): string {
  const doc = emptyDocument("Destroy with an open editor");
  doc.contexts = [
    {
      id: "billing",
      label: "Billing",
      team: "Finance Team",
      position: { x: 100, y: 200 },
      size: { width: 200, height: 110 },
    },
  ];
  return serializeDocumentText(doc);
}

/**
 * diagram-js-direct-editing moves the focus into its content only inside a frame that has the
 * focus, as it has for a user who opened the editor; and only a focused field can lose the focus.
 */
async function focusTheFrame(): Promise<void> {
  const target = document.createElement("div");
  target.style.cssText = "width:16px;height:16px";
  document.body.append(target);
  await userEvent.click(target);
  target.remove();
  expect(document.hasFocus()).toBe(true);
}

/** Errors that reach the window: a throw in a timer or a dropped promise reaches no caller. */
function listenForWindowErrors(): string[] {
  const errors: string[] = [];
  const onError = (event: ErrorEvent): void => {
    errors.push(String(event.error ?? event.message));
    event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    errors.push(String(event.reason));
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  stopListening.push(() => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  });
  return errors;
}

function billing(map: HostedMap): CmContext {
  const found = map.get<ElementRegistry>("elementRegistry").get("billing");
  if (!found) throw new Error("no context billing");
  return found as unknown as CmContext;
}

/** Opens the editor and types into it; returns the focused field. */
function typeInto(map: HostedMap, editor: Editor): HTMLElement {
  if (editor === "description") {
    map.get<Selection>("selection").select(billing(map));
    map.container
      .querySelector('.djs-context-pad.open [data-action="description"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    const field = map.container.querySelector<HTMLTextAreaElement>(".cm-pad-prompt__field")!;
    field.value = TYPED;
    return field;
  }
  const labelEditing = map.get<CmLabelEditing>("cmLabelEditing");
  if (editor === "team") labelEditing.activateTeam(billing(map));
  else labelEditing.activate(billing(map));
  const content = map.container.querySelector<HTMLElement>(".djs-direct-editing-content")!;
  content.innerText = TYPED;
  return content;
}

describe.each(Object.keys(MOUNTS) as (keyof typeof MOUNTS)[])(
  "a destroy of the %s while an editor holds typed text (#439)",
  (mount) => {
    beforeEach(focusTheFrame);

    it.each(EDITORS)(
      "closes the %s editor without a command and throws nothing later",
      async (editor) => {
        const { map, destroy } = await MOUNTS[mount]();
        const field = typeInto(map, editor);
        expect(document.activeElement).toBe(field);
        let commands = 0;
        map.get<EventBus>("eventBus").on("commandStack.changed", () => commands++);
        const errors = listenForWindowErrors();

        destroy();
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

        expect({ commands, errors }).toEqual({ commands: 0, errors: [] });
        expect(field.isConnected).toBe(false);
      },
    );
  },
);
