import type {
  ElementId,
  ElementKind,
  ModelElement,
  Relationship,
  StaticViewType,
} from "../types.js";
import type { ModelIndex } from "./modelIndex.js";

const ALLOWED_KINDS: Readonly<Record<StaticViewType, ReadonlySet<ElementKind>>> = {
  systemLandscape: new Set(["person", "softwareSystem", "custom"]),
  systemContext: new Set(["person", "softwareSystem", "custom"]),
  container: new Set(["person", "softwareSystem", "custom", "container"]),
  component: new Set(["person", "softwareSystem", "custom", "container", "component"]),
};

/**
 * The elements and relationships of one static view while its statements run, with the rules of
 * Structurizr's `ModelView` and its four static subclasses: adding an element adds its
 * relationships to the elements already shown, removing one removes its relationships, and an
 * element whose ancestor or descendant is shown is not permitted in a container or component view
 * (`checkParentAndChildrenHaveNotAlreadyBeenAdded`; Structurizr's exception is ignored there).
 */
export class ViewContents {
  private readonly elements = new Set<ElementId>();
  private readonly relationships = new Set<Relationship>();
  /** Per element, how many shown elements it is an ancestor of. */
  private readonly shownBelow = new Map<ElementId, number>();
  private readonly allowedKinds: ReadonlySet<ElementKind>;

  constructor(
    readonly index: ModelIndex,
    private readonly type: StaticViewType,
    private readonly scope: ModelElement | undefined,
  ) {
    this.allowedKinds = ALLOWED_KINDS[type];
    if (type === "systemContext" && scope) this.addElement(scope, true);
  }

  kindAllowed(kind: ElementKind): boolean {
    return this.allowedKinds.has(kind);
  }

  /** `canBeRemoved`: only a context view's own system stays. */
  removable(element: ModelElement): boolean {
    return !(this.type === "systemContext" && element.id === this.scope?.id);
  }

  /** `addElement`; false when the view does not permit the element. */
  addElement(element: ModelElement, withRelationships: boolean): boolean {
    if (!this.permitted(element)) return false;
    if (!this.elements.has(element.id)) {
      this.elements.add(element.id);
      for (const ancestor of this.index.ancestors(element.id)) {
        this.shownBelow.set(ancestor, (this.shownBelow.get(ancestor) ?? 0) + 1);
      }
    }
    if (withRelationships) this.addRelationshipsOf(element);
    return true;
  }

  removeElement(element: ModelElement): void {
    if (!this.elements.delete(element.id)) return;
    for (const ancestor of this.index.ancestors(element.id)) {
      this.shownBelow.set(ancestor, (this.shownBelow.get(ancestor) ?? 1) - 1);
    }
    for (const relationship of [...this.relationships]) {
      if (relationship.sourceId === element.id || relationship.destinationId === element.id) {
        this.relationships.delete(relationship);
      }
    }
  }

  /** `addRelationship`: only between two shown elements. */
  addRelationship(relationship: Relationship): void {
    if (this.elements.has(relationship.sourceId) && this.elements.has(relationship.destinationId)) {
      this.relationships.add(relationship);
    }
  }

  removeRelationship(relationship: Relationship): void {
    this.relationships.delete(relationship);
  }

  /** `include *` (greedy) and `include *?` per view type. */
  addDefaultElements(greedy: boolean): void {
    switch (this.type) {
      case "systemLandscape":
        return this.addLandscapeDefaults();
      case "systemContext":
        return this.addContextDefaults(greedy);
      case "container":
        return this.addContainerDefaults(greedy);
      case "component":
        return this.addComponentDefaults(greedy);
    }
  }

  sortedElements(): ElementId[] {
    const order = (id: ElementId) => this.index.elementOrder.get(id) ?? 0;
    return [...this.elements].sort((left, right) => order(left) - order(right));
  }

  sortedRelationships(): string[] {
    const order = (relationship: Relationship) =>
      this.index.relationshipOrder.get(relationship) ?? 0;
    return [...this.relationships]
      .sort((left, right) => order(left) - order(right))
      .map((relationship) => relationship.canvasKey);
  }

  private addLandscapeDefaults(): void {
    for (const element of this.index.workspace.elements) {
      if (element.kind === "softwareSystem") this.addElement(element, true);
    }
    for (const element of this.index.workspace.elements) {
      if (element.kind === "person") this.addElement(element, true);
    }
    for (const id of this.sortedElements()) {
      const element = this.index.byId.get(id);
      if (element) this.addNearestNeighbours(element, "custom");
    }
  }

  private addContextDefaults(greedy: boolean): void {
    if (!this.scope) return;
    this.addNearestNeighbours(this.scope, "custom");
    this.addNearestNeighbours(this.scope, "person");
    this.addNearestNeighbours(this.scope, "softwareSystem");
    if (!greedy) this.keepRelationshipsTouching(new Set([this.scope.id]));
  }

  private addContainerDefaults(greedy: boolean): void {
    if (!this.scope) return;
    const containers = this.childrenOf(this.scope, "container");
    for (const container of containers) {
      this.addElement(container, true);
      this.addNearestNeighbours(container, "custom");
      this.addNearestNeighbours(container, "person");
      this.addNearestNeighbours(container, "softwareSystem");
    }
    if (!greedy)
      this.keepRelationshipsTouching(new Set(containers.map((container) => container.id)));
  }

  private addComponentDefaults(greedy: boolean): void {
    if (!this.scope) return;
    const system =
      this.scope.parentId === undefined ? undefined : this.index.byId.get(this.scope.parentId);
    const siblings = system ? this.childrenOf(system, "container") : [];
    const components = this.childrenOf(this.scope, "component");
    for (const component of components) {
      this.addElement(component, true);
      for (const container of siblings) {
        if (this.related(container.id, component.id)) this.addElement(container, true);
      }
      this.addNearestNeighbours(component, "custom");
      this.addNearestNeighbours(component, "person");
      this.addNearestNeighbours(component, "softwareSystem");
    }
    if (!greedy)
      this.keepRelationshipsTouching(new Set(components.map((component) => component.id)));
  }

  /** `addNearestNeighbours(element, type)`: nothing at all when the element itself is not permitted. */
  private addNearestNeighbours(element: ModelElement, kind: ElementKind): void {
    if (!this.addElement(element, true)) return;
    for (const relationship of this.index.outgoing.get(element.id) ?? []) {
      const destination = this.index.byId.get(relationship.destinationId);
      if (destination?.kind === kind) this.addElement(destination, true);
    }
    for (const relationship of this.index.incoming.get(element.id) ?? []) {
      const source = this.index.byId.get(relationship.sourceId);
      if (source?.kind === kind) this.addElement(source, true);
    }
  }

  /** `removeRelationshipsNotConnectedToElements`, the reluctant `*?`. */
  private keepRelationshipsTouching(ids: ReadonlySet<ElementId>): void {
    for (const relationship of [...this.relationships]) {
      if (!ids.has(relationship.sourceId) && !ids.has(relationship.destinationId)) {
        this.relationships.delete(relationship);
      }
    }
  }

  /** `ModelView.addRelationships`: to and from the elements already shown. */
  private addRelationshipsOf(element: ModelElement): void {
    for (const relationship of this.index.outgoing.get(element.id) ?? []) {
      if (this.elements.has(relationship.destinationId)) this.relationships.add(relationship);
    }
    for (const relationship of this.index.incoming.get(element.id) ?? []) {
      if (this.elements.has(relationship.sourceId)) this.relationships.add(relationship);
    }
  }

  private related(first: ElementId, second: ElementId): boolean {
    const between = (from: ElementId, to: ElementId) =>
      (this.index.outgoing.get(from) ?? []).some(
        (relationship) => relationship.destinationId === to,
      );
    return between(first, second) || between(second, first);
  }

  private childrenOf(parent: ModelElement, kind: ElementKind): ModelElement[] {
    return (this.index.children.get(parent.id) ?? []).filter((child) => child.kind === kind);
  }

  /** `checkElementCanBeAdded` of the four static views. */
  private permitted(element: ModelElement): boolean {
    if (!this.allowedKinds.has(element.kind)) return false;
    if (this.type === "systemLandscape" || this.type === "systemContext") return true;
    if (element.kind === "person" || element.kind === "custom") return true;
    const scopeSystem = this.type === "container" ? this.scope?.id : this.scope?.parentId;
    if (element.id === scopeSystem || element.id === this.scope?.id) return false;
    const ancestorShown = this.index
      .ancestors(element.id)
      .some((ancestor) => this.elements.has(ancestor));
    return !ancestorShown && (this.shownBelow.get(element.id) ?? 0) === 0;
  }
}
