import type { ElementKind, Expression, ModelElement, Relationship } from "../types.js";
import type { ModelIndex } from "./modelIndex.js";

/** What a term names that Structurizr refuses: reported by membership as a compatibility error. */
export interface TermProblem {
  readonly code: "unresolved-reference" | "view-element-not-permitted" | "structurizr-rejects";
  readonly subject?: ModelElement;
  readonly text?: string;
}

export interface Evaluation {
  /** Document order. */
  readonly elements: readonly ModelElement[];
  /** The workspace's order: explicit ones, then implied ones. */
  readonly relationships: readonly Relationship[];
}

type Item = ModelElement | Relationship;
type Report = (problem: TermProblem) => void;

/** Static views take these kinds in `findAfferentCouplings` order (`StaticViewExpressionParser`). */
const COUPLING_KINDS: readonly ElementKind[] = [
  "custom",
  "person",
  "softwareSystem",
  "container",
  "component",
];

const GROUPABLE: ReadonlySet<ElementKind> = new Set(COUPLING_KINDS);

/** The model items an expression selects, as `ExpressionParser.evaluateExpression` finds them. */
export function evaluate(index: ModelIndex, expression: Expression, report: Report): Evaluation {
  const items = new Evaluator(index, report).items(expression);
  const elementOrder = (element: ModelElement) => index.elementOrder.get(element.id) ?? 0;
  const relationshipOrder = (relationship: Relationship) =>
    index.relationshipOrder.get(relationship) ?? 0;
  const elements: ModelElement[] = [];
  const relationships: Relationship[] = [];
  for (const item of items) {
    if (isRelationship(item)) relationships.push(item);
    else elements.push(item);
  }
  return {
    elements: elements.sort((left, right) => elementOrder(left) - elementOrder(right)),
    relationships: relationships.sort(
      (left, right) => relationshipOrder(left) - relationshipOrder(right),
    ),
  };
}

function isRelationship(item: Item): item is Relationship {
  return "sourceId" in item;
}

class Evaluator {
  constructor(
    private readonly index: ModelIndex,
    private readonly report: Report,
  ) {}

  private get elements(): readonly ModelElement[] {
    return this.index.workspace.elements;
  }

  items(expression: Expression): Set<Item> {
    switch (expression.kind) {
      case "all":
        return new Set();
      case "reference":
        return this.identified(expression.identifier);
      case "coupling":
        return this.coupling(expression);
      case "not": {
        const excluded = this.items(expression.operand);
        return new Set(this.elements.filter((element) => !excluded.has(element)));
      }
      case "and": {
        const right = this.items(expression.right);
        return new Set([...this.items(expression.left)].filter((item) => right.has(item)));
      }
      case "or":
        return new Set([...this.items(expression.left), ...this.items(expression.right)]);
      case "relationship":
        return this.between(expression.source, expression.destination);
      case "relationshipEnd":
        return this.byEnd(expression.end, this.endElements(expression.operand));
      default:
        return this.filtered(expression);
    }
  }

  /** The filters over the model's elements and relationships. */
  private filtered(expression: Expression): Set<Item> {
    switch (expression.kind) {
      case "elementType":
        return this.where((element) => element.kind === expression.elementKind);
      case "elementParent": {
        const parent = this.index.elementNamed(expression.parent);
        const namesGroup = this.index.elementsNamed(expression.parent) !== undefined;
        if (parent === undefined && !namesGroup) this.unresolved(expression.parent);
        return this.where((element) => parent !== undefined && element.parentId === parent.id);
      }
      case "elementTag":
        return this.where(
          (element) => hasAllTags(element.tags, expression.tags) === expression.equals,
        );
      case "elementTechnology":
        return this.where(
          (element) =>
            (element.kind === "container" || element.kind === "component") &&
            (element.technology === expression.technology) === expression.equals,
        );
      case "elementProperty":
        return this.where((element) => element.properties[expression.name] === expression.value);
      case "elementGroup":
        return this.where(
          (element) => GROUPABLE.has(element.kind) && element.group === expression.group,
        );
      case "relationshipTag":
        return new Set(
          this.index.relationships.filter(
            (relationship) => hasAllTags(relationship.tags, expression.tags) === expression.equals,
          ),
        );
      case "relationshipProperty":
        return new Set(
          this.index.relationships.filter(
            (relationship) => propertiesOf(relationship)[expression.name] === expression.value,
          ),
        );
      default:
        return new Set();
    }
  }

  private where(test: (element: ModelElement) => boolean): Set<Item> {
    return new Set(this.elements.filter(test));
  }

  /** `parseIdentifier`: an element or a group's elements, and a relationship with its implied relatives. */
  private identified(identifier: string): Set<Item> {
    const items = new Set<Item>(this.index.elementsNamed(identifier) ?? []);
    const relationship = this.index.relationshipNamed(identifier);
    if (relationship) {
      items.add(relationship);
      if (relationship.key !== undefined) {
        for (const relative of this.index.impliedFrom(relationship.key)) items.add(relative);
      }
    }
    if (items.size === 0) this.unresolved(identifier);
    return items;
  }

  /** `getElements` for a reference, the elements of an expression otherwise. */
  private operandElements(operand: Expression): ModelElement[] {
    if (operand.kind === "reference")
      return [...(this.index.elementsNamed(operand.identifier) ?? [])];
    return [...this.items(operand)].filter((item): item is ModelElement => !isRelationship(item));
  }

  private endElements(operand: Expression): Set<ModelElement> {
    if (
      operand.kind === "reference" &&
      this.index.elementsNamed(operand.identifier) === undefined
    ) {
      this.unresolved(operand.identifier);
    }
    return new Set(this.operandElements(operand));
  }

  private coupling(expression: Extract<Expression, { kind: "coupling" }>): Set<Item> {
    const found = this.operandElements(expression.operand);
    if (found.length === 0) {
      this.report(
        expression.operand.kind === "reference"
          ? { code: "unresolved-reference", text: expression.operand.identifier }
          : { code: "unresolved-reference" },
      );
    }
    const items = new Set<Item>();
    for (const element of found) {
      items.add(element);
      if (expression.afferent) {
        const sources = (this.index.incoming.get(element.id) ?? []).map((r) => r.sourceId);
        for (const coupled of this.byKind(sources)) items.add(coupled);
      }
      if (expression.efferent) {
        const destinations = (this.index.outgoing.get(element.id) ?? []).map(
          (r) => r.destinationId,
        );
        for (const coupled of this.byKind(destinations)) items.add(coupled);
      }
    }
    return items;
  }

  private byKind(ids: readonly string[]): ModelElement[] {
    const elements = ids
      .map((id) => this.index.byId.get(id))
      .filter((element): element is ModelElement => element !== undefined);
    return COUPLING_KINDS.flatMap((kind) => elements.filter((element) => element.kind === kind));
  }

  /** `<source>-><destination>` with `*` on either side. */
  private between(source: string, destination: string): Set<Item> {
    if (source === "*" && destination === "*") return new Set(this.index.relationships);
    if (destination === "*") return this.byEnd("source", this.endElements(reference(source)));
    if (source === "*") return this.byEnd("destination", this.endElements(reference(destination)));
    const sources = this.byEnd("source", this.endElements(reference(source)));
    const destinations = this.byEnd("destination", this.endElements(reference(destination)));
    return new Set([...sources].filter((item) => destinations.has(item)));
  }

  private byEnd(end: "source" | "destination", elements: ReadonlySet<ModelElement>): Set<Item> {
    const ids = new Set([...elements].map((element) => element.id));
    return new Set(
      this.index.relationships.filter((relationship) =>
        ids.has(end === "source" ? relationship.sourceId : relationship.destinationId),
      ),
    );
  }

  private unresolved(identifier: string): void {
    this.report({ code: "unresolved-reference", text: identifier });
  }
}

function reference(identifier: string): Expression {
  return { kind: "reference", identifier };
}

/** `ModelItem.hasTag` per tag: every listed tag, trimmed, among the item's tags. */
function hasAllTags(itemTags: readonly string[], wanted: readonly string[]): boolean {
  return wanted.every((tag) => itemTags.includes(tag.trim()));
}

/** Relationship properties, when the parser records them on the relationship. */
function propertiesOf(relationship: Relationship): Readonly<Record<string, string>> {
  const withProperties = relationship as Relationship & {
    readonly properties?: Readonly<Record<string, string>>;
  };
  return withProperties.properties ?? {};
}
