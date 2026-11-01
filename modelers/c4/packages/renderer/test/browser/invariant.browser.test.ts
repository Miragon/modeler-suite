/*
 * The canvas invariant under a seeded fuzz (SPEC 9.4): 300 random steps of gestures, edits, view
 * switches, undos, redos, imports, rebases and draft materializations, and after every step the
 * canvas equals a fresh import of the exported text in the same view. A refused edit is a valid
 * step; an error thrown or reported is not, and neither is a history patch that no longer fits.
 */
import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Connection, Element } from "diagram-js/lib/model/Types";
import type { CreatableKind } from "@miragon/c4-dsl";
import type { StaticViewType } from "@miragon/c4-schema-model";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type DocumentStore from "../../src/document/DocumentStore.js";
import type C4ElementFactory from "../../src/modeling/C4ElementFactory.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import {
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
  type C4Connection,
  type C4ElementShape,
} from "../../src/scene/types.js";
import { EDIT_REFUSED_EVENT, VIEW_CHANGED_EVENT, type C4Views } from "../../src/services.js";
import { LIBRARY, SHOP } from "./support/documents.js";
import { expectCanvasMatchesDocument } from "./support/invariant.js";
import { pointerOn } from "./support/pointer.js";
import { createTestModeler, removeHosts } from "./support/stack.js";

const STEPS = 300;
const SEED = 0x6b_c4_2026;

/** mulberry32: small, seeded, the same sequence on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const CREATABLE: Readonly<Record<string, readonly CreatableKind[]>> = {
  systemLandscape: ["person", "softwareSystem"],
  systemContext: ["person", "softwareSystem"],
  container: ["person", "softwareSystem", "container"],
  component: ["person", "softwareSystem", "container", "component"],
};

const VIEW_TYPES: readonly StaticViewType[] = [
  "systemLandscape",
  "systemContext",
  "container",
  "component",
];

let modeler: CollaborativeDiagram | undefined;

afterEach(() => {
  modeler?.destroy();
  modeler = undefined;
  removeHosts();
});

describe("the canvas equals a fresh import after every step", () => {
  it(`${STEPS} seeded random steps`, { timeout: 120_000 }, async () => {
    const next = random(SEED);
    const pick = <T>(items: readonly T[]): T | undefined =>
      items.length === 0 ? undefined : items[Math.floor(next() * items.length)];
    const between = (low: number, high: number) => Math.round(low + next() * (high - low));
    ({ modeler } = createTestModeler());
    const diagram: CollaborativeDiagram = modeler;
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", onError);
    await diagram.importText(SHOP);

    const service = <T>(name: string): T => diagram.diagram.get<T>(name);
    const modeling = () => service<C4Modeling>("modeling");
    const all = () => service<ElementRegistry>("elementRegistry").getAll() as Element[];
    const shapes = () => all().filter(isElementShape) as C4ElementShape[];
    const boundaries = () => all().filter(isBoundaryShape);
    const connections = () => all().filter(isRelationshipConnection) as C4Connection[];
    const elementIds = () => shapes().map((shape) => shape.c4.id);
    const modelIds = () =>
      service<DocumentStore>("c4Document")
        .current()
        .parse.workspace.elements.map(({ id }) => id);
    let created = 0;

    const steps: ReadonlyArray<readonly [string, number, () => unknown]> = [
      [
        "move",
        8,
        () => {
          const moved = shapes().filter(() => next() < 0.4);
          const one = pick(shapes());
          const chosen = moved.length > 0 ? moved : one ? [one] : [];
          if (chosen.length > 0) {
            modeling().moveElements(chosen, { x: between(-120, 120), y: between(-120, 120) });
          }
        },
      ],
      [
        "drag an element",
        3,
        () => {
          const shape = pick(shapes());
          if (shape) {
            pointerOn(diagram.diagram)
              .grab(shape.id, { x: between(-90, 90), y: between(30, 120) })
              .drop();
          }
        },
      ],
      [
        "drag a boundary",
        2,
        () => {
          const boundary = pick(boundaries());
          if (boundary) modeling().moveElements([boundary], { x: between(-80, 80), y: 40 });
        },
      ],
      [
        "resize",
        3,
        () => {
          const shape = pick(shapes());
          if (shape) {
            modeling().resizeShape(shape, {
              x: shape.x,
              y: shape.y,
              width: between(160, 360),
              height: between(120, 260),
            });
          }
        },
      ],
      [
        "bend",
        3,
        () => {
          const connection = pick(connections()) as Connection | undefined;
          if (!connection) return;
          const [start] = connection.waypoints;
          const end = connection.waypoints.at(-1);
          if (!start || !end) return;
          const vertices = next() < 0.3 ? [] : [{ x: between(-200, 1200), y: between(-200, 1000) }];
          modeling().updateWaypoints(connection, [start, ...vertices, end]);
        },
      ],
      [
        "create",
        5,
        () => {
          const kind = pick(CREATABLE[diagram.views.active().type] ?? []);
          if (!kind) return;
          created += 1;
          const factory = service<C4ElementFactory>("c4ElementFactory");
          const name = next() < 0.5 ? `Fuzz ${created}` : undefined;
          modeling().createShape(factory.createNew(kind, name), {
            x: between(-400, 1400),
            y: between(-300, 1100),
          });
        },
      ],
      [
        "connect",
        4,
        () => {
          const source = pick(shapes());
          const target = pick(shapes());
          if (source && target && source !== target) modeling().connect(source, target);
        },
      ],
      [
        "smart delete",
        4,
        () => {
          const chosen = [...shapes(), ...connections()].filter(() => next() < 0.15);
          if (chosen.length > 0) modeling().removeElements(chosen);
        },
      ],
      [
        "delete from the model",
        2,
        () => {
          const id = pick(modelIds());
          if (id) diagram.c4.deleteFromModel([id], []);
        },
      ],
      [
        "remove from the view",
        2,
        () => {
          const shape = pick(shapes());
          const connection = pick(connections());
          diagram.c4.removeFromView(
            shape && next() < 0.7 ? [shape.c4.id] : [],
            connection && next() < 0.5 ? [connection.c4.key] : [],
          );
        },
      ],
      [
        "include in the view",
        2,
        () => {
          const shown = new Set(elementIds());
          const id = pick(modelIds().filter((candidate) => !shown.has(candidate)));
          if (id) diagram.c4.includeInView([id]);
        },
      ],
      [
        "edit an element",
        4,
        () => {
          const shape = pick(shapes());
          if (!shape) return;
          const field = pick(["name", "description", "technology"] as const) ?? "name";
          diagram.c4.editElement(shape.c4.id, { [field]: `Edited ${between(1, 9999)}` });
        },
      ],
      [
        "rename an identifier",
        2,
        () => {
          const shape = pick(shapes());
          if (shape) diagram.c4.renameIdentifier(shape.c4.id, `renamed${between(1, 9999)}`);
        },
      ],
      [
        "edit a relationship",
        2,
        () => {
          const connection = pick(connections());
          if (connection && !connection.c4.implied) {
            diagram.c4.editRelationship(connection.c4.key, {
              description: `Uses ${between(1, 99)}`,
            });
          }
        },
      ],
      [
        "edit the view",
        2,
        () => {
          const { key } = diagram.views.active();
          diagram.c4.editView(
            key,
            next() < 0.5 ? { title: `View ${between(1, 99)}` } : { description: null },
          );
        },
      ],
      ["lay out automatically", 1, () => diagram.c4.layOutAutomatically()],
      ["apply the C4 colours", 1, () => diagram.c4.applyC4Colours()],
      [
        "edit the workspace",
        1,
        () => diagram.c4.editWorkspace({ name: `Workspace ${between(1, 99)}` }),
      ],
      [
        "create a view",
        1,
        () => {
          const type = pick(VIEW_TYPES) ?? "systemLandscape";
          diagram.c4.createView(type, type === "systemLandscape" ? undefined : pick(modelIds()));
        },
      ],
      [
        "delete a view",
        1,
        () => {
          const view = pick(
            diagram.views
              .catalog()
              .list()
              .filter(({ state }) => state === "written"),
          );
          if (view) diagram.c4.deleteView(view.key);
        },
      ],
      [
        "switch the view",
        7,
        () => {
          const view = pick(diagram.views.catalog().list());
          if (view?.editable) diagram.views.open(view.key, { cause: "user" });
        },
      ],
      [
        "drill down or up",
        3,
        () => {
          const shape = pick(shapes());
          const child = shape ? service<C4Views>("c4Views").childOf(shape.c4.id) : undefined;
          const target = next() < 0.5 ? child : diagram.views.parent();
          if (target) diagram.views.open(target.key, { cause: "user" });
        },
      ],
      ["undo", 8, () => service<CommandStack>("commandStack").undo()],
      ["redo", 4, () => service<CommandStack>("commandStack").redo()],
      [
        "re-import in the view",
        3,
        () => diagram.importText(diagram.exportText(), { view: diagram.views.active().key }),
      ],
      ["re-import", 2, () => diagram.importText(diagram.exportText())],
      ["import another document", 1, () => diagram.importText(next() < 0.7 ? SHOP : LIBRARY)],
      [
        "rebase",
        2,
        () => {
          expect(diagram.rebaseText(`// rebased ${between(1, 99)}\n${diagram.exportText()}`)).toBe(
            true,
          );
        },
      ],
      [
        "restore a view state",
        2,
        () => {
          const view = pick(diagram.views.catalog().list());
          if (view) diagram.setViewState({ view: view.key, x: 0, y: 0, width: 800, height: 600 });
        },
      ],
    ];

    const total = steps.reduce((sum, [, weight]) => sum + weight, 0);
    const log: string[] = [];
    // Counted on the modeler, so the fuzz proves it ran edits and switches, not only refusals.
    const counts = { commands: 0, switches: 0, refusals: 0, imports: 0 };
    const eventBus = service<EventBus>("eventBus");
    eventBus.on("commandStack.changed", () => (counts.commands += 1));
    eventBus.on(VIEW_CHANGED_EVENT, () => (counts.switches += 1));
    eventBus.on(EDIT_REFUSED_EVENT, () => (counts.refusals += 1));
    eventBus.on("import.done", () => (counts.imports += 1));
    for (let step = 0; step < STEPS; step += 1) {
      let roll = next() * total;
      const [name, , run] =
        steps.find(([, weight]) => (roll -= weight) < 0) ?? (steps[0] as (typeof steps)[number]);
      log.push(`${step}: ${name} in ${diagram.views.active().key}`);
      try {
        await run();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errors).toEqual([]);
        expectCanvasMatchesDocument(diagram);
      } catch (error) {
        throw new Error(`step ${log.slice(-6).join(" | ")}: ${String(error)}`, { cause: error });
      }
    }
    window.removeEventListener("error", onError);
    expect(counts.commands).toBeGreaterThan(STEPS / 3);
    expect(counts.switches).toBeGreaterThan(STEPS / 15);
    expect(counts.imports).toBeGreaterThan(STEPS / 50);
  });
});
