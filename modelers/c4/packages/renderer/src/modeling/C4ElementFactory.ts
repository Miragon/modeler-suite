import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type { Shape } from "diagram-js/lib/model/Types";
import type { CreatableKind } from "@miragon/c4-dsl";
import type { SceneNotation } from "../scene/notation.js";
import type { C4PreviewReference } from "../scene/types.js";
import type { C4ElementFactory as C4ElementFactoryService } from "../services.js";

export const PREVIEW_PREFIX = "preview:";

/**
 * The service `c4ElementFactory`: the shape a palette create or the harness hands to diagram-js
 * before the element exists (SPEC 1.1). The reconciler never registers it; the create's command
 * writes the element, and the reconciler adds the shape the document asks for.
 */
export default class C4ElementFactory implements C4ElementFactoryService {
  static $inject = ["elementFactory", "c4Notation"];

  private previews = 0;

  constructor(
    private readonly elementFactory: ElementFactory,
    private readonly notation: SceneNotation,
  ) {}

  createNew(kind: CreatableKind, name?: string, tags?: readonly string[]): Shape {
    const shape = tags?.includes("Database") ? "Cylinder" : this.notation.defaultShape(kind);
    const { width, height } = this.notation.defaultSize(shape);
    this.previews += 1;
    const c4: C4PreviewReference = {
      role: "preview",
      kind,
      ...(name === undefined ? {} : { name }),
      ...(tags === undefined ? {} : { tags: [...tags] }),
    };
    return this.elementFactory.createShape({
      id: `${PREVIEW_PREFIX}${this.previews}`,
      width,
      height,
      c4,
    } as Partial<Shape>);
  }
}
