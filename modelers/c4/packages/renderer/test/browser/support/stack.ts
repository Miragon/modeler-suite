/*
 * The shipped stack for the renderer's own browser tests (SPEC 11.2 WP6b): the real engine, the
 * real drawing, palette and label editor. The engine sits behind a probe, so a test can make the
 * edit layer refuse the next edit or count how often the text was parsed (SPEC 1.2: every browser
 * test can swap the seam).
 */
import "../../../src/assets/c4.css";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { ModuleDeclaration } from "didi";
import type { EditRefusal } from "@miragon/c4-dsl";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
  type CollaborativeOptions,
} from "../../../src/collaborative/index.js";
import { createC4Engine, type C4Engine } from "../../../src/engine/C4Engine.js";

export interface ProbedEngine extends C4Engine {
  /** The next `applyEdit` refuses with `reason`, whatever the edit. */
  refuseNext(reason: EditRefusal, message: string): void;
  /** How often `parse` ran. */
  readonly parses: number;
}

export function probedEngine(): ProbedEngine {
  const engine = createC4Engine();
  let refusal: { reason: EditRefusal; message: string } | undefined;
  let parses = 0;
  return {
    ...engine,
    parse(text) {
      parses += 1;
      return engine.parse(text);
    },
    applyEdit(document, edit, context) {
      const refused = refusal;
      refusal = undefined;
      if (refused) return { ok: false, ...refused };
      return engine.applyEdit(document, edit, context);
    },
    refuseNext(reason, message) {
      refusal = { reason, message };
    },
    get parses() {
      return parses;
    },
  };
}

export function engineModule(engine: C4Engine): ModuleDeclaration {
  return { c4Engine: ["value", engine] };
}

export interface TestModeler {
  readonly modeler: CollaborativeDiagram;
  readonly engine: ProbedEngine;
}

/** A modeler on the probed real engine, attached to a host of the kit's size. */
export function createTestModeler(options: CollaborativeOptions = {}): TestModeler {
  const engine = probedEngine();
  const modeler = createCollaborativeModeler({
    ...options,
    additionalModules: [engineModule(engine), ...(options.additionalModules ?? [])],
  });
  modeler.attachTo(attachedHost());
  return { modeler, engine };
}

/** The read-only mount on the real engine, attached. */
export function createTestViewer(options: CollaborativeOptions = {}): CollaborativeDiagram {
  const viewer = createCollaborativeViewer(options);
  viewer.attachTo(attachedHost());
  return viewer;
}

/** Removes every host `attachedHost` added to the page. */
export function removeHosts(): void {
  for (const wrapper of document.querySelectorAll("body > div")) wrapper.remove();
}
