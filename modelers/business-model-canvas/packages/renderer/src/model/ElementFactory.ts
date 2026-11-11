import BaseElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Connection, Label, Root, Shape } from "diagram-js/lib/model/Types";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 8;

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
}

/**
 * Replaces diagram-js's elementFactory: an element created on the canvas gets a random id such as
 * `sticky_k3x9q2mf`. Two peers editing one document never allocate the same id for different
 * elements, which a per-instance counter (`shape_1` on both sides) would (contract RECOMMENDATION,
 * checked by the kit's collision advisory).
 */
export default class ElementFactory extends BaseElementFactory {
  static $inject = ["elementRegistry"];

  constructor(private readonly elementRegistry: ElementRegistry) {
    super();
  }

  override create(type: "root", attrs?: Partial<Root>): Root;
  override create(type: "shape", attrs?: Partial<Shape>): Shape;
  override create(type: "connection", attrs?: Partial<Connection>): Connection;
  override create(type: "label", attrs?: Partial<Label>): Label;
  override create(
    type: "root" | "shape" | "connection" | "label",
    attrs?: Partial<Root & Shape & Connection & Label>,
  ): Root | Shape | Connection | Label {
    const withId = attrs?.id ? attrs : { ...attrs, id: this.unusedId(attrs) };
    switch (type) {
      case "root":
        return super.create(type, withId);
      case "shape":
        return super.create(type, withId);
      case "connection":
        return super.create(type, withId);
      case "label":
        return super.create(type, withId);
    }
  }

  private unusedId(attrs: Record<string, unknown> | undefined): string {
    const kind = attrs?.["elementKind"];
    const prefix = typeof kind === "string" ? kind : "element";
    let id: string;
    do {
      id = `${prefix}_${randomSuffix()}`;
    } while (this.elementRegistry.get(id));
    return id;
  }
}
