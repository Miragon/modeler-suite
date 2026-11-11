import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type { Element } from "diagram-js/lib/model/Types";
import { isStickyShape } from "../model/di-types.js";

/**
 * A sticky goes wherever it is dropped, on a block or on another sticky: the drop decides its
 * block and slot, and the sticky hangs on the root. Stickies keep their size and never connect.
 */
export default class DiagramRules extends RuleProvider {
  override init(): void {
    const onCanvas = (context: { target?: Element }) => !!context.target;
    this.addRule(["shape.create", "elements.create"], onCanvas);
    this.addRule(
      ["shape.move", "elements.move"],
      (context: { shapes?: Element[]; shape?: Element }) =>
        (context.shapes ?? [context.shape]).every(isStickyShape),
    );
    this.addRule("shape.resize", () => false);
    this.addRule("connection.create", () => false);
  }
}
