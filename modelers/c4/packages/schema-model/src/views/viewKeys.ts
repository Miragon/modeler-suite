import type {
  ElementId,
  ModelElement,
  StaticViewType,
  ViewKey,
  ViewType,
  Workspace,
} from "../types.js";

/** `ViewSet`'s view type constants, the prefixes of generated keys. */
const GENERATED_PREFIXES: Readonly<Record<ViewType, string>> = {
  systemLandscape: "SystemLandscape",
  systemContext: "SystemContext",
  container: "Container",
  component: "Component",
  dynamic: "Dynamic",
  deployment: "Deployment",
  filtered: "Filtered",
  custom: "Custom",
  image: "Image",
};

const GENERATED_KEY =
  /^(SystemLandscape|SystemContext|Container|Component|Dynamic|Deployment|Filtered|Custom|Image)-\d{3,}$/;

const DRAFT_PREFIXES: Readonly<Record<Exclude<StaticViewType, "systemLandscape">, string>> = {
  systemContext: "SystemContext",
  container: "Containers",
  component: "Components",
};

const LANDSCAPE_KEY = "SystemLandscape";

const draftKeysByWorkspace = new WeakMap<Workspace, Map<StaticViewType, Map<string, ViewKey>>>();

/**
 * The key an implicit view or a draft carries and is written under (SPEC 4.2):
 * `SystemLandscape`, `SystemContext-<slug>`, `Containers-<slug>`, `Components-<slug>`, the slug
 * the scope's id with `.` as `-`. A key a written view holds (case-insensitively), one in
 * Structurizr's generated pattern, or one an earlier scope of the same type got takes `-2`, `-3`.
 */
export function draftKey(
  type: StaticViewType,
  scopeId: ElementId | undefined,
  workspace: Workspace,
): ViewKey {
  const keys = draftKeysOf(type, workspace);
  const known = keys.get(scopeId ?? "");
  if (known !== undefined) return known;
  return unusedKey(candidateKey(type, scopeId), takenKeys(workspace, keys));
}

/** Structurizr's `generateViewKey`: the first unused `<Type>-NNN`, case-sensitive. */
export function generateViewKey(type: ViewType, taken: ReadonlySet<ViewKey>): ViewKey {
  const prefix = GENERATED_PREFIXES[type];
  for (let counter = 1; ; counter++) {
    const key = `${prefix}-${String(counter).padStart(3, "0")}`;
    if (!taken.has(key)) return key;
  }
}

/** The elements a draft of `type` can be scoped on, in document order. */
export function draftScopes(type: StaticViewType, workspace: Workspace): readonly ModelElement[] {
  if (type === "systemLandscape") return [];
  const kind = type === "component" ? "container" : "softwareSystem";
  return workspace.elements.filter((element) => element.kind === kind);
}

function draftKeysOf(type: StaticViewType, workspace: Workspace): Map<string, ViewKey> {
  let perType = draftKeysByWorkspace.get(workspace);
  if (perType === undefined) {
    perType = new Map();
    draftKeysByWorkspace.set(workspace, perType);
  }
  const cached = perType.get(type);
  if (cached !== undefined) return cached;
  const keys = new Map<string, ViewKey>();
  const taken = takenKeys(workspace, keys);
  if (type === "systemLandscape") {
    keys.set("", unusedKey(LANDSCAPE_KEY, taken));
  } else {
    for (const scope of draftScopes(type, workspace)) {
      const key = unusedKey(candidateKey(type, scope.id), taken);
      keys.set(scope.id, key);
      taken.add(key.toLowerCase());
    }
  }
  perType.set(type, keys);
  return keys;
}

function takenKeys(workspace: Workspace, drafts: ReadonlyMap<string, ViewKey>): Set<string> {
  return new Set([
    ...workspace.views.map((view) => view.key.toLowerCase()),
    ...[...drafts.values()].map((key) => key.toLowerCase()),
  ]);
}

function candidateKey(type: StaticViewType, scopeId: ElementId | undefined): ViewKey {
  if (type === "systemLandscape") return LANDSCAPE_KEY;
  const slug = (scopeId ?? "").replace(/[^A-Za-z0-9_-]/g, "-");
  return `${DRAFT_PREFIXES[type]}-${slug}`;
}

function unusedKey(candidate: ViewKey, taken: ReadonlySet<string>): ViewKey {
  const usable = (key: string) => !taken.has(key.toLowerCase()) && !GENERATED_KEY.test(key);
  if (usable(candidate)) return candidate;
  for (let counter = 2; ; counter++) {
    const key = `${candidate}-${counter}`;
    if (usable(key)) return key;
  }
}
