import type {
  ElementId,
  ModelElement,
  StaticViewType,
  ViewCatalog,
  ViewDefinition,
  ViewEntry,
  ViewKey,
  ViewType,
  Workspace,
} from "../types.js";
import { modelIndex, type ModelIndex } from "./modelIndex.js";
import { draftKey, draftScopes } from "./viewKeys.js";

const catalogs = new WeakMap<Workspace, ViewCatalog>();

interface Target {
  readonly type: StaticViewType;
  readonly scope: ModelElement | undefined;
}

/** Written, implicit and draft views (SPEC 4.2). */
export function viewCatalog(workspace: Workspace): ViewCatalog {
  let catalog = catalogs.get(workspace);
  if (catalog === undefined) {
    catalog = buildCatalog(workspace);
    catalogs.set(workspace, catalog);
  }
  return catalog;
}

function buildCatalog(workspace: Workspace): ViewCatalog {
  const index = modelIndex(workspace);
  const written = workspace.views.map((definition) => writtenEntry(index, definition));
  const writtenByKey = new Map<ViewKey, ViewEntry>();
  for (const entry of written) if (!writtenByKey.has(entry.key)) writtenByKey.set(entry.key, entry);
  const firstWritten = (type: StaticViewType, scopeId?: ElementId) =>
    written.find((entry) => entry.type === type && entry.scopeId === scopeId);

  const defaults = defaultTargets(index);
  const implicit =
    workspace.views.length === 0
      ? defaults.map((target) => unwritten(index, target, "implicit"))
      : [];
  const unwrittenByKey = new Map<ViewKey, ViewEntry>(implicit.map((entry) => [entry.key, entry]));
  for (const target of allTargets(workspace)) {
    const entry = unwritten(index, target, "draft");
    if (!unwrittenByKey.has(entry.key)) unwrittenByKey.set(entry.key, entry);
  }
  const unwrittenFor = (type: StaticViewType, scope?: ModelElement): ViewEntry => {
    const key = draftKey(type, scope?.id, workspace);
    return unwrittenByKey.get(key) ?? unwritten(index, { type, scope }, "draft");
  };
  const entryFor = (type: StaticViewType, scope?: ModelElement): ViewEntry =>
    firstWritten(type, scope?.id) ?? unwrittenFor(type, scope);

  const missing =
    implicit.length > 0
      ? []
      : defaults
          .filter((target) => firstWritten(target.type, target.scope?.id) === undefined)
          .map((target) => unwrittenFor(target.type, target.scope));
  const listed = [...written, ...implicit, ...missing];
  const resolve = (key: ViewKey) => writtenByKey.get(key) ?? unwrittenByKey.get(key);
  const element = (id: ElementId | undefined) =>
    id === undefined ? undefined : index.byId.get(id);

  return {
    list: () => listed,
    resolve,
    defaultView: () => {
      const marked = written
        .filter((entry) => entry.editable && entry.definition?.isDefault === true)
        .at(-1);
      return marked ?? written.find((entry) => entry.editable) ?? unwrittenFor("systemLandscape");
    },
    childOf: (elementId) => {
      const target = element(elementId);
      if (target?.kind === "softwareSystem") return entryFor("container", target);
      if (target?.kind === "container") return entryFor("component", target);
      return undefined;
    },
    parentOf: (key) => {
      const entry = resolve(key);
      const scope = element(entry?.scopeId);
      switch (entry?.type) {
        case "component": {
          const system = element(scope?.parentId);
          return system && entryFor("container", system);
        }
        case "container":
          if (scope?.kind === "softwareSystem") return entryFor("systemContext", scope);
          return firstWritten("systemLandscape") ?? unwrittenFor("systemLandscape");
        case "systemContext":
          return firstWritten("systemLandscape") ?? unwrittenFor("systemLandscape");
        default:
          return undefined;
      }
    },
    draftFor: (type, scopeId) => {
      const scope = element(scopeId);
      if (scopeId !== undefined && scope === undefined) {
        return (
          firstWritten(type, scopeId) ??
          unwritten(index, { type, scope: undefined }, "draft", scopeId)
        );
      }
      return entryFor(type, scope);
    },
  };
}

/**
 * Structurizr's `createDefaultViews` (static part, SZ l.1191-1221): one landscape, then per
 * software system sorted by name a context view and, with containers, a container view, then per
 * container sorted by name a component view when it has components.
 */
function defaultTargets(index: ModelIndex): Target[] {
  const targets: Target[] = [{ type: "systemLandscape", scope: undefined }];
  const byName = (elements: readonly ModelElement[]) =>
    [...elements].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
  const systems = byName(
    index.workspace.elements.filter((element) => element.kind === "softwareSystem"),
  );
  for (const system of systems) {
    targets.push({ type: "systemContext", scope: system });
    const containers = childrenOf(index, system, "container");
    if (containers.length === 0) continue;
    targets.push({ type: "container", scope: system });
    for (const container of byName(containers)) {
      if (childrenOf(index, container, "component").length > 0) {
        targets.push({ type: "component", scope: container });
      }
    }
  }
  return targets;
}

function allTargets(workspace: Workspace): Target[] {
  return [
    { type: "systemLandscape", scope: undefined },
    ...(["systemContext", "container", "component"] as const).flatMap((type) =>
      draftScopes(type, workspace).map((scope) => ({ type, scope })),
    ),
  ];
}

function childrenOf(
  index: ModelIndex,
  parent: ModelElement,
  kind: ModelElement["kind"],
): ModelElement[] {
  return (index.children.get(parent.id) ?? []).filter((child) => child.kind === kind);
}

function unwritten(
  index: ModelIndex,
  target: Target,
  state: "implicit" | "draft",
  missingScopeId?: ElementId,
): ViewEntry {
  const scopeId = target.scope?.id ?? missingScopeId;
  const scopeKind = target.type === "component" ? "container" : "softwareSystem";
  const scopeValid = target.type === "systemLandscape" || target.scope?.kind === scopeKind;
  return {
    key: draftKey(target.type, scopeId, index.workspace),
    state,
    type: target.type,
    scopeId,
    editable: scopeValid,
    title: computedTitle(index, target.type, scopeId, undefined),
    definition: undefined,
  };
}

function writtenEntry(index: ModelIndex, definition: ViewDefinition): ViewEntry {
  const title = definition.title?.trim();
  return {
    key: definition.key,
    state: "written",
    type: definition.type,
    scopeId: definition.scopeId,
    editable: definition.editable,
    title: title ? title : computedTitle(index, definition.type, definition.scopeId, definition),
    definition,
  };
}

/** SPEC 4.6: the title C4 asks for, naming the diagram type and its scope. */
function computedTitle(
  index: ModelIndex,
  type: ViewType,
  scopeId: ElementId | undefined,
  definition: ViewDefinition | undefined,
): string {
  const scope = scopeId === undefined ? undefined : index.byId.get(scopeId);
  const scopeName = scope?.name ?? scopeId ?? "";
  const parent = scope?.parentId === undefined ? undefined : index.byId.get(scope.parentId);
  const qualified = parent ? `${parent.name} - ${scopeName}` : scopeName;
  const forScope = (words: string) => (scopeId === undefined ? words : `${words} for ${qualified}`);
  switch (type) {
    case "systemLandscape":
      return "System Landscape diagram";
    case "systemContext":
      return `System Context diagram for ${scopeName}`;
    case "container":
      return `Container diagram for ${scopeName}`;
    case "component":
      return `Component diagram for ${qualified}`;
    case "dynamic":
      return forScope("Dynamic diagram");
    case "deployment":
      return forScope("Deployment diagram");
    case "image":
      return forScope("Image diagram");
    case "custom":
      return "Custom diagram";
    case "filtered": {
      const base = index.workspace.views.find((view) => view.key === definition?.baseKey);
      if (base === undefined || base.type === "filtered") return "Filtered diagram";
      return base.title?.trim() || computedTitle(index, base.type, base.scopeId, base);
    }
  }
}
