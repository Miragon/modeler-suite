/**
 * The contract's conformance kit bound to the BPMN adapter (`src/bpmn/collaborative-bpmn.ts`), on
 * `@miragon/bpmn-modeler` as the board bundles it: the adapter is held to the contract here as
 * every renderer of the suite holds itself, so it can leave this workspace for a package of its
 * own.
 *
 * The suite's rule for a renderer is zero skips. The adapter is not there yet and pins its ten,
 * each with the kit's reason word for word, as the board pins its own: the list is compared whole
 * and may only shrink. What they wait for:
 * - "L1" and "L5": the harness hooks of an interaction, bpmn-js's label editor
 *   (`openInteraction`, `interactionState`, `commitInteraction`).
 * - "L1 (recommended, 1.5)", "drop (recommended, 1.6)", "drag start (recommended, 1.6)",
 *   "interaction (when present, 1.5)" and "destroy from a listener (recommended, 1.6)": a held
 *   gesture driven by real pointer events (`startGesture`).
 * - "pan (recommended, 1.6)": a held pan (`startPan`).
 * - "viewer (when shipped)": a viewer mount on `@miragon/bpmn-modeler/viewer` (`createReadonly`).
 * - "appearance (when present, 1.5)": the `appearance` surface; the board draws light only.
 * A run of some cases only (`-t`) fails at its end.
 */
import type { CollaborativeModeler } from "@miragon/modeler-api";
import {
  attachedHost,
  type ConformanceHarness,
  registerConformance,
} from "@miragon/modeler-api/conformance";
import "@miragon/bpmn-modeler/styles.css";
import { afterAll, afterEach, expect, test } from "vitest";
import {
  createCollaborativeModeler,
  type CollaborativeBpmnModeler,
} from "../../src/bpmn/collaborative-bpmn.js";
import ORDER_TO_CASH from "../fixtures/order-to-cash.bpmn?raw";
import REVIEW from "../fixtures/review.bpmn?raw";

const LOAD_MS = 90_000;

/** the cases the adapter may skip, by their name up to its first colon, with the kit's reason */
const EXPECTED_SKIPS: Readonly<Record<string, string>> = {
  L1: "openInteraction is undefined — an interaction open during an import (a label editor with typed input) was not verified",
  "L1 (recommended, 1.5)":
    "startGesture is undefined — that an import cancels a running gesture (L1, RECOMMENDED since 1.5) was not checked",
  "drop (recommended, 1.6)":
    "startGesture is undefined — that an import from the change listener of a drop waits until the drop has ended (RECOMMENDED since 1.6) was not checked",
  "drag start (recommended, 1.6)":
    "startGesture is undefined — that an import from the selection listener at a drag's start runs once the drag has started and then ends it (RECOMMENDED since 1.6) was not checked",
  "pan (recommended, 1.6)":
    "startPan is undefined — that a pan is no gesture and runs on through an import (RECOMMENDED since 1.6) was not checked",
  "interaction (when present, 1.5)":
    "startGesture is undefined — that interaction.active() follows every gesture was not verified",
  "destroy from a listener (recommended, 1.6)":
    "startGesture is undefined — that a host may destroy the modeler from a listener while the user's input runs or inside an import that ends a held gesture, and that a listener unsubscribed during a delivery is not called (RECOMMENDED since 1.6), was not checked",
  L5: "openInteraction is undefined — a host's view change over an open interaction (a label editor with typed input) was not verified",
  "viewer (when shipped)": "createReadonly is undefined — the package ships no viewer mount",
  "appearance (when present, 1.5)":
    "the modeler exposes no appearance surface (optional, 1.5) — nothing to verify",
};

const skipped: Record<string, string> = {};
const advised: Record<string, string[]> = {};

const attached: HTMLElement[] = [];
afterEach(() => {
  for (const host of attached.splice(0)) host.parentElement?.remove();
});

afterAll(() => {
  expect(skipped).toEqual(EXPECTED_SKIPS);
  expect(advised).toEqual({});
});

interface Shape {
  id: string;
}
interface Services {
  elementFactory: { createShape(attrs: { type: string }): Shape };
  modeling: {
    createShape(shape: Shape, position: { x: number; y: number }, parent: unknown): Shape;
    moveElements(elements: unknown[], delta: { x: number; y: number }): void;
  };
  canvas: { getRootElement(): unknown };
  commandStack: { undo(): void; redo(): void };
  elementRegistry: { get(id: string): unknown };
}

const service = <K extends keyof Services>(modeler: CollaborativeModeler, name: K): Services[K] => {
  const diagram = (modeler as CollaborativeBpmnModeler).diagram;
  if (!diagram) throw new Error("the modeler has imported nothing yet");
  return diagram.get<Services[K]>(name);
};

let created = 0;

const harness: ConformanceHarness = {
  create: async () => {
    const host = attachedHost();
    attached.push(host);
    const modeler = createCollaborativeModeler();
    modeler.attachTo(host);
    return modeler;
  },
  canonicalTexts: [ORDER_TO_CASH, REVIEW],
  looseTexts: [],
  invalidTexts: [
    "not a diagram",
    '{"nodes": []}',
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x"><bpmn:process id="P" /></bpmn:definitions>',
  ],
  foreignTexts: [
    { text: REVIEW, mustSurvive: ['acme:owner="editorial"', '<acme:sla hours="4" />'] },
  ],
  viewState: { x: -120, y: -40, width: 1600, height: 1200 },
  settle: () => new Promise((resolve) => setTimeout(resolve, 20)),
  mutate(modeler) {
    created++;
    const shape = service(modeler, "elementFactory").createShape({ type: "bpmn:Task" });
    service(modeler, "modeling").createShape(
      shape,
      { x: 300 + created * 10, y: 420 },
      service(modeler, "canvas").getRootElement(),
    );
  },
  configMutations: [],
  undo: (modeler) => service(modeler, "commandStack").undo(),
  redo: (modeler) => service(modeler, "commandStack").redo(),
  moveElement(modeler) {
    const id = "Task_check_order";
    const element = service(modeler, "elementRegistry").get(id);
    if (!element) throw new Error(`no ${id}`);
    service(modeler, "modeling").moveElements([element], { x: 0, y: 120 });
    return id;
  },
};

registerConformance(harness, (name, run) => test(name, run, LOAD_MS), {
  onSkip: (name, reason) => {
    skipped[name.split(":")[0] ?? name] = reason;
  },
  onAdvisory: (name, advice) => {
    (advised[name] ??= []).push(advice);
  },
});
