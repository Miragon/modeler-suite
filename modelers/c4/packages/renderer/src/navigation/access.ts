import type EventBus from "diagram-js/lib/core/EventBus";
import type { ParseResult } from "@miragon/c4-dsl";
import type {
  ElementId,
  ModelElement,
  ViewEntry,
  ViewMembers,
  Workspace,
} from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/ReadOnly.js";
import { TEXT_REBASED_EVENT } from "../services.js";
import type { C4DialogModeler } from "./types.js";

interface EditLock {
  isReadOnly(): boolean;
}

/** A service of the diagram, or undefined where the mount has none (the viewer has no modeling). */
export function serviceOf<T>(modeler: C4DialogModeler, name: string): T | undefined {
  try {
    return modeler.diagram.get<T>(name) ?? undefined;
  } catch {
    return undefined;
  }
}

export function parseOf(modeler: C4DialogModeler): ParseResult {
  return modeler.diagram.get<DocumentStore>("c4Document").current().parse;
}

export function workspaceOf(modeler: C4DialogModeler): Workspace {
  return parseOf(modeler).workspace;
}

export function membersOf(modeler: C4DialogModeler, view: ViewEntry): ViewMembers {
  return modeler.diagram.get<C4Engine>("c4Engine").members(workspaceOf(modeler), view);
}

export function eventBusOf(modeler: C4DialogModeler): EventBus {
  return modeler.diagram.get<EventBus>("eventBus");
}

/** The read-only lock holds, or the mount edits nothing (the viewer). */
export function isLocked(modeler: C4DialogModeler): boolean {
  if (serviceOf(modeler, "modeling") === undefined) return true;
  return serviceOf<EditLock>(modeler, "readOnly")?.isReadOnly() === true;
}

export function elementById(workspace: Workspace, id: ElementId): ModelElement | undefined {
  return workspace.elements.find((element) => element.id === id);
}

/** The kind's words as the type line names them ("Software System"). */
export function kindWord(workspace: Workspace, element: ModelElement): string {
  const { terminology } = workspace;
  switch (element.kind) {
    case "person":
      return terminology.person;
    case "softwareSystem":
      return terminology.softwareSystem;
    case "container":
      return terminology.container;
    case "component":
      return terminology.component;
    case "custom":
      return "Element";
  }
}

/**
 * The events after which a dialog or panel shows the document anew; the lock's change too, which
 * enables or disables what edits it, and a rebase, which moves the lines without an edit.
 */
export const DOCUMENT_EVENTS = [
  "import.done",
  "commandStack.changed",
  "c4.view.changed",
  TEXT_REBASED_EVENT,
  READ_ONLY_CHANGED_EVENT,
];
