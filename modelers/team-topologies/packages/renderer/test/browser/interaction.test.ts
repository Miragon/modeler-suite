import { afterEach, describe, expect, test } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Root, Shape } from "diagram-js/lib/model/Types";
import {
  ROOT_ID,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtElementFactory,
} from "@miragon/team-topologies-renderer";
import onlineShop from "../../../../example/sample.tt?raw";
import rideHailing from "../../../../plugins/team-topologies-modeler/skills/tt-format/examples/ride-hailing.tt?raw";
import {
  Pointer,
  holdGesture,
  middle,
  paletteEntry,
  shape,
  type GestureKind,
} from "./support/pointer.js";

// The `interaction` surface of contract 1.5, along the cases packages/api/README.md plans for the
// kit ("Cases for the 1.5 surfaces"): a host with a live sync defers a peer's text while the user
// holds a gesture, and imports it once `onChange` reports false.

const KINDS: GestureKind[] = ["move", "create", "createOffCanvas"];

interface Mounted {
  modeler: CollaborativeTeamTopologiesModeler;
  host: HTMLElement;
  stopCollecting: () => void;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host, stopCollecting } of mounted.splice(0)) {
    stopCollecting();
    modeler.destroy();
    host.remove();
  }
});

interface Session {
  modeler: CollaborativeTeamTopologiesModeler;
  diagram: Modeler;
  /** Every value `onChange` delivered, in order. */
  deliveries: boolean[];
  /** Change events of the contract since the session started. */
  changes: () => number;
  /** Errors thrown out of the canvas's DOM listeners since the session started. */
  errors: unknown[];
}

function mount(
  create: () => CollaborativeTeamTopologiesModeler = createCollaborativeModeler,
): Mounted & { errors: unknown[] } {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 800px;";
  document.body.append(host);
  const modeler = create();
  modeler.attachTo(host);
  const errors: unknown[] = [];
  const collect = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collect);
  const entry = {
    modeler,
    host,
    stopCollecting: () => window.removeEventListener("error", collect),
  };
  mounted.push(entry);
  return { ...entry, errors };
}

async function session(text = onlineShop): Promise<Session> {
  const { modeler, errors } = mount();
  await modeler.importText(text);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const deliveries: boolean[] = [];
  modeler.interaction.onChange((active) => deliveries.push(active));
  return {
    modeler,
    diagram: modeler.diagram as Modeler,
    deliveries,
    changes: () => changes,
    errors,
  };
}

/** A team the user adds after the gesture: the next edit applies and reports. */
function addTeam(diagram: Modeler): void {
  const team = diagram
    .get<TtElementFactory>("ttElementFactory")
    .createNewTeam("platform", "Payments platform");
  diagram
    .get<Modeling>("modeling")
    .createShape(
      team as unknown as Shape,
      { x: 1400, y: 700 },
      diagram.get<Canvas>("canvas").getRootElement() as Root,
    );
}

describe("interaction.active() follows every gesture", () => {
  test("is false before the first import and at rest", async () => {
    const { modeler } = mount();
    expect(modeler.interaction.active()).toBe(false);
    await modeler.importText(onlineShop);
    expect(modeler.interaction.active()).toBe(false);
  });

  test.each(KINDS)(
    "%s: true while it is held, false after its drop, one onChange each way",
    async (kind) => {
      const { modeler, diagram, deliveries, errors } = await session();
      const gesture = holdGesture(diagram, kind);
      expect(modeler.interaction.active()).toBe(true);
      expect(deliveries).toEqual([true]);

      gesture.drop();
      expect(modeler.interaction.active()).toBe(false);
      expect(deliveries).toEqual([true, false]);
      expect(errors).toEqual([]);
    },
  );

  test.each(KINDS)("%s: the same when Escape cancels it", async (kind) => {
    const { modeler, diagram, deliveries, changes } = await session();
    const gesture = holdGesture(diagram, kind);
    expect(modeler.interaction.active()).toBe(true);

    gesture.cancel();
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([true, false]);
    expect(changes()).toBe(0);
  });

  test("a press that has not reached the drag threshold is no gesture", async () => {
    const { modeler, diagram, deliveries } = await session();
    const pointer = new Pointer(diagram);
    const start = middle(shape(diagram, "team_checkout"));
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.moveTo({ x: start.x + 2, y: start.y });
    expect(modeler.interaction.active()).toBe(false);

    pointer.releaseAt({ x: start.x + 2, y: start.y });
    expect(deliveries).toEqual([]);
  });

  test("a resize is a gesture from its press on the handle, which diagram-js starts at once", async () => {
    const { modeler, diagram, deliveries } = await session();
    const pointer = new Pointer(diagram);
    const team = shape(diagram, "team_fraud");
    diagram.get<Selection>("selection").select(team);
    const handle = diagram
      .get<Canvas>("canvas")
      .getContainer()
      .querySelector<SVGElement>(`.djs-resizer-${team.id}.djs-resizer-se .djs-resizer-hit`);
    if (!handle) throw new Error("the selected team shows no south-east resize handle");
    const corner = { x: team.x + team.width, y: team.y + team.height };
    pointer.press(handle, corner);
    pointer.moveTo({ x: corner.x + 30, y: corner.y + 20 });
    expect(modeler.interaction.active()).toBe(true);

    pointer.releaseAt({ x: corner.x + 30, y: corner.y + 20 });
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([true, false]);
  });

  test("a connect from an annotation's context pad is a gesture once its preview follows the pointer", async () => {
    const { modeler, diagram, deliveries } = await session();
    const pointer = new Pointer(diagram);
    diagram.get<Selection>("selection").select(shape(diagram, "ann_fraud_handover"));
    const connect = diagram
      .get<Canvas>("canvas")
      .getContainer()
      .querySelector<HTMLElement>('.djs-context-pad .entry[data-action="connect"]');
    if (!connect) throw new Error("the annotation's context pad has no connect entry");
    pointer.clickOn(connect);
    const target = middle(shape(diagram, "team_fraud"));
    pointer.moveTo({ x: target.x - 40, y: target.y });
    pointer.enter("team_fraud");
    pointer.moveTo(target);
    expect(modeler.interaction.active()).toBe(true);

    pointer.releaseAt(target);
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([true, false]);
  });

  test("a lasso drag with Shift is a gesture", async () => {
    const { modeler, diagram, deliveries } = await session();
    const pointer = new Pointer(diagram);
    pointer.press(pointer.graphics(ROOT_ID), { x: 0, y: 100 }, { shiftKey: true });
    pointer.moveTo({ x: 200, y: 300 });
    expect(modeler.interaction.active()).toBe(true);

    pointer.releaseAt({ x: 200, y: 300 });
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([true, false]);
  });

  test("the armed lasso tool is no gesture while it waits, and its drag is one", async () => {
    const { modeler, diagram, deliveries } = await session();
    const pointer = new Pointer(diagram);
    const container = diagram.get<Canvas>("canvas").getContainer();
    pointer.clickOn(paletteEntry(container, "lasso-tool"));
    pointer.enter();
    pointer.moveTo({ x: 600, y: 60 });
    pointer.moveTo({ x: 640, y: 90 });
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([]);

    pointer.press(pointer.graphics(ROOT_ID), { x: 30, y: 140 });
    pointer.moveTo({ x: 140, y: 260 });
    expect(modeler.interaction.active()).toBe(true);
    pointer.releaseAt({ x: 140, y: 260 });
    expect(deliveries).toEqual([true, false]);
  });

  // Decided in #170: a pan only moves the view, so it is no gesture, and an import leaves it running.
  test("a pan of the canvas is no gesture and keeps running across an import", async () => {
    const { modeler, diagram, deliveries, changes, errors } = await session();
    const canvas = diagram.get<Canvas>("canvas");
    canvas.focus();
    const mouse = (type: string, target: EventTarget, clientX: number, clientY: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY }),
      );
    mouse("mousedown", new Pointer(diagram).graphics(ROOT_ID), 600, 300);
    mouse("mousemove", document, 640, 340);
    const panned = canvas.viewbox();
    expect(modeler.interaction.active()).toBe(false);

    await modeler.importText(rideHailing);
    const afterTheImport = canvas.viewbox();
    mouse("mousemove", document, 680, 380);
    expect(canvas.viewbox().x).toBeLessThan(afterTheImport.x);
    mouse("mouseup", document, 680, 380);

    expect(panned.x).not.toBe(afterTheImport.x);
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([]);
    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(rideHailing);
    expect(errors).toEqual([]);
  });

  test("inside the listener active() returns the value it got, and the unsubscribe ends delivery", async () => {
    const { modeler, diagram } = await session();
    const seen: [boolean, boolean][] = [];
    const unsubscribe = modeler.interaction.onChange((active) =>
      seen.push([active, modeler.interaction.active()]),
    );
    holdGesture(diagram, "move").drop();
    expect(seen).toEqual([
      [true, true],
      [false, false],
    ]);

    unsubscribe();
    holdGesture(diagram, "create").drop();
    expect(seen).toHaveLength(2);
  });
});

describe("an import while a gesture runs (the L1 gesture case of contract 1.5)", () => {
  test.each(KINDS)(
    "%s: the import ends it before it resolves, and the release applies nothing",
    async (kind) => {
      const legs = [
        { before: onlineShop, imported: rideHailing },
        { before: onlineShop, imported: onlineShop },
      ];
      for (const { before, imported } of legs) {
        const { modeler, diagram, deliveries, changes, errors } = await session(before);
        const gesture = holdGesture(diagram, kind);
        expect(deliveries).toEqual([true]);

        const importing = modeler.importText(imported);
        const atResolve = importing.then(() => [...deliveries]);
        expect(modeler.interaction.active()).toBe(false);
        expect(await atResolve).toEqual([true, false]);
        gesture.drop();

        expect(errors).toEqual([]);
        expect(changes()).toBe(0);
        expect(deliveries).toEqual([true, false]);
        expect(modeler.exportText()).toBe(imported);
        diagram.undo();
        expect(changes()).toBe(0);
        expect(modeler.exportText()).toBe(imported);
        addTeam(diagram);
        expect(changes()).toBe(1);
      }
    },
  );

  test.each(KINDS)(
    "%s: a rejected import leaves it running, with no onChange until its drop",
    async (kind) => {
      const { modeler, diagram, deliveries, errors } = await session();
      const gesture = holdGesture(diagram, kind);

      await expect(modeler.importText('{"version": 3, "nodes": [')).rejects.toThrow();
      expect(modeler.interaction.active()).toBe(true);
      expect(deliveries).toEqual([true]);

      gesture.drop();
      expect(modeler.interaction.active()).toBe(false);
      expect(deliveries).toEqual([true, false]);
      expect(errors).toEqual([]);
    },
  );
});

describe("the viewer and the end of an instance", () => {
  test("the viewer has the surface and reports no gesture, a pan included", async () => {
    const { modeler: viewer, errors } = mount(createCollaborativeViewer);
    await viewer.importText(onlineShop);
    const deliveries: boolean[] = [];
    viewer.interaction.onChange((active) => deliveries.push(active));
    const pointer = new Pointer(viewer.diagram as Modeler);
    pointer.press(pointer.graphics(ROOT_ID), { x: 600, y: 60 });
    pointer.moveTo({ x: 700, y: 160 });
    expect(viewer.interaction.active()).toBe(false);
    pointer.releaseAt({ x: 700, y: 160 });

    expect(deliveries).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("nothing is delivered after destroy(), also for the gesture diagram-js cancels then", async () => {
    const { modeler, diagram, deliveries } = await session();
    holdGesture(diagram, "move");
    expect(deliveries).toEqual([true]);

    modeler.destroy();
    expect(modeler.interaction.active()).toBe(false);
    expect(deliveries).toEqual([true]);
  });

  test("a listener that throws leaves the import's cancel to finish", async () => {
    const { modeler, diagram, changes } = await session();
    const uncaught: unknown[] = [];
    const collect = (event: ErrorEvent) => {
      uncaught.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", collect);
    try {
      modeler.interaction.onChange((active) => {
        if (!active) throw new Error("the host's listener failed");
      });
      const gesture = holdGesture(diagram, "move");
      const imported = rideHailing;

      await modeler.importText(imported);
      await new Promise((resolve) => setTimeout(resolve, 0));
      gesture.drop();

      expect(modeler.interaction.active()).toBe(false);
      expect(modeler.exportText()).toBe(imported);
      expect(changes()).toBe(0);
      expect(uncaught).toEqual([new Error("the host's listener failed")]);
    } finally {
      window.removeEventListener("error", collect);
    }
  });
});
