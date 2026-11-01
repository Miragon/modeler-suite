import {
  childElements,
  viewCatalog,
  type ElementId,
  type ViewKey,
  type Workspace,
} from "@miragon/c4-schema-model";

const DRAWN_ABOVE_CONTAINERS = new Set(["systemLandscape", "systemContext"]);

/**
 * What to tell the user once after drawing, in a landscape or context view, a relationship on a
 * software system that has containers: Structurizr implies relationships upward only, so the
 * system's container view will not show it (SPEC 4.1). Undefined when no new relationship hangs
 * on such a system.
 */
export function relationshipLevelNotice(
  workspace: Workspace,
  view: ViewKey,
  created: readonly string[],
): string | undefined {
  const entry = viewCatalog(workspace).resolve(view);
  if (entry === undefined || !DRAWN_ABOVE_CONTAINERS.has(entry.type)) return undefined;
  const byId = new Map(workspace.elements.map((element) => [element.id, element]));
  const hasContainers = (id: ElementId) =>
    byId.get(id)?.kind === "softwareSystem" && childElements(workspace, id).length > 0;
  for (const key of created) {
    const relationship = workspace.relationships.find(
      (candidate) => !candidate.implied && candidate.canvasKey === key,
    );
    if (relationship === undefined) continue;
    const { sourceId, destinationId } = relationship;
    const fromSystem = hasContainers(sourceId);
    const toSystem = hasContainers(destinationId);
    if (!fromSystem && !toSystem) continue;
    const name = (id: ElementId) => byId.get(id)?.name ?? id;
    const bothSystems =
      byId.get(sourceId)?.kind === "softwareSystem" &&
      byId.get(destinationId)?.kind === "softwareSystem";
    const scope = fromSystem ? sourceId : destinationId;
    const what = bothSystems
      ? "connects the systems themselves"
      : `connects to ${name(scope)} itself`;
    const views =
      fromSystem && toSystem
        ? `the container views of ${name(sourceId)} and ${name(destinationId)} won't show it`
        : `${name(scope)}'s container view won't show it`;
    const draw =
      fromSystem && toSystem
        ? "Draw it between containers"
        : fromSystem
          ? "Draw it from a container"
          : "Draw it to a container";
    return `${name(sourceId)} → ${name(destinationId)} ${what}, so ${views}. ${draw}, or use Move to a container…`;
  }
  return undefined;
}
