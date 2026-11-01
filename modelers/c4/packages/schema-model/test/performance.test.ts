import { describe, expect, it } from "vitest";
import { impliedRelationships } from "../src/implied.js";
import { viewCatalog } from "../src/views/catalog.js";
import { viewMembers } from "../src/views/membership.js";
import type { ElementId, ModelElement, Relationship, Workspace } from "../src/types.js";
import { component, container, person, relationship, system, workspace } from "./support/model.js";
import { costInYardsticks, describeCost, millisecondsOf } from "./support/yardstick.js";

/**
 * The model of a generated workspace of about 3 000 lines (SPEC 9.1 "Performance"): 40 systems
 * with 5 containers of 4 components each, 100 people, a relationship per component.
 */
function generated(): Workspace {
  const elements: ModelElement[] = [];
  const relationships: Relationship[] = [];
  for (let index = 0; index < 100; index++) elements.push(person(`p${index}`));
  for (let s = 0; s < 40; s++) {
    elements.push(system(`s${s}`));
    for (let c = 0; c < 5; c++) {
      elements.push(container(`s${s}.c${c}`, `s${s}`));
      for (let k = 0; k < 4; k++) {
        elements.push(component(`s${s}.c${c}.k${k}`, `s${s}.c${c}`));
        relationships.push(relationship(`p${(s * 20 + c * 4 + k) % 100}`, `s${s}.c${c}.k${k}`));
        relationships.push(
          relationship(`s${s}.c${c}.k${k}`, `s${(s + 1) % 40}.c${(c + 1) % 5}.k${k}`),
        );
      }
    }
  }
  return workspace({ elements, relationships });
}

/**
 * The budget in yardsticks (`support/yardstick.ts`), so it holds on a CI runner several times
 * slower than the laptop it was measured on. On an Apple M-series laptop the yardstick takes about
 * 20 ms and the projection 0.26 to 0.32 of it, up to 0.48 on slower cores; 1.5 is SPEC 9.1's 30 ms
 * there.
 */
const BUDGET_IN_YARDSTICKS = 1.5;

function project(model: Workspace, parents: ReadonlyMap<ElementId, ElementId>): void {
  impliedRelationships(
    model.relationships
      .filter((item) => !item.implied)
      .map((item) => ({ relationship: item, strategy: "unless-any" })),
    { parents },
  );
  const catalog = viewCatalog(model);
  for (const key of ["SystemLandscape", "SystemContext-s1", "Containers-s1", "Components-s1-c1"]) {
    viewMembers(model, catalog.resolve(key)!);
  }
}

describe("projection performance", () => {
  it(
    "builds the implied relationships, the catalog and the default views' members fast",
    { timeout: 60_000 },
    () => {
      const cost = costInYardsticks(() => {
        const model = generated();
        const parents = new Map(
          model.elements.flatMap((item) =>
            item.parentId ? [[item.id, item.parentId] as const] : [],
          ),
        );
        return millisecondsOf(() => project(model, parents));
      });
      expect(cost.yardsticks, describeCost(cost)).toBeLessThan(BUDGET_IN_YARDSTICKS);
    },
  );
});
