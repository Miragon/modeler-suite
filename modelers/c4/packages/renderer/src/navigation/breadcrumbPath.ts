import type {
  ElementId,
  ViewCatalog,
  ViewEntry,
  ViewKey,
  ViewType,
  Workspace,
} from "@miragon/c4-schema-model";

/** One step of the breadcrumb: a view of the path from the landscape down to the one shown. */
export interface Crumb {
  readonly key: ViewKey;
  /** The scope element's name; the level's own name at the landscape. */
  readonly name: string;
  /** What the view shows of its scope ("containers"); none at the landscape. */
  readonly level: string | undefined;
  /** The view on the canvas, the last crumb. */
  readonly current: boolean;
  /** Not in the file yet: navigating never writes, the first edit there does. */
  readonly draft: boolean;
}

/** The name of the landscape's crumb (guide §2: sentence case). */
export const LANDSCAPE_CRUMB = "System landscape";

const LEVELS: Partial<Record<ViewType, string>> = {
  systemContext: "context",
  container: "containers",
  component: "components",
};

/** More than the catalog's four levels: a parent chain that long has a cycle, and stops there. */
const MAX_DEPTH = 8;

/**
 * The views from the root of the hierarchy down to `active`, by the parent rules of SPEC 4.5
 * (`ViewCatalog.parentOf`): landscape, the system context of S, the containers of S, the
 * components of C. Drafts are steps like written views, so no level drops out of the path or out
 * of U where the file has no view for it yet.
 */
export function breadcrumbPath(
  catalog: ViewCatalog,
  active: ViewEntry,
  workspace: Workspace,
): Crumb[] {
  const entries: ViewEntry[] = [active];
  const seen = new Set<ViewKey>([active.key]);
  for (
    let parent = catalog.parentOf(active.key);
    parent !== undefined && !seen.has(parent.key) && entries.length < MAX_DEPTH;
    parent = catalog.parentOf(parent.key)
  ) {
    seen.add(parent.key);
    entries.unshift(parent);
  }
  const names = new Map(workspace.elements.map((element) => [element.id, element.name.trim()]));
  return entries.map((entry) => ({
    key: entry.key,
    ...labelOf(entry, (id) => names.get(id)),
    current: entry === active,
    draft: entry.state !== "written",
  }));
}

/** The crumb's whole text, as it reads and as a screen reader names it. */
export function crumbText(crumb: Pick<Crumb, "name" | "level">): string {
  return crumb.level === undefined ? crumb.name : `${crumb.name} ${crumb.level}`;
}

function labelOf(
  entry: ViewEntry,
  nameOf: (id: ElementId) => string | undefined,
): Pick<Crumb, "name" | "level"> {
  if (entry.type === "systemLandscape") return { name: LANDSCAPE_CRUMB, level: undefined };
  const level = LEVELS[entry.type];
  if (level === undefined || entry.scopeId === undefined) {
    return { name: entry.title, level: undefined };
  }
  return { name: nameOf(entry.scopeId) || entry.scopeId, level };
}
