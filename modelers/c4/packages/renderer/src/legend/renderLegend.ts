import type { LegendRow } from "../scene/types.js";
import { legendPreview } from "./legendContent.js";

/** The parts of a view its rows come in, with a separator between two parts (guide §5.10). */
function partOf(row: LegendRow): "elements" | "frames" | "relationships" {
  if (row.kind === "element") return "elements";
  return row.kind === "relationship" ? "relationships" : "frames";
}

/**
 * Renders the rows into the shell's live legend body (or a host's own panel), replacing what was
 * there: the legend follows the view, so the apps call this on `import.done`, `c4.view.changed`
 * and `commandStack.changed` (SPEC 6.6). The rows use the shell's row and preview classes.
 */
export function renderLegend(body: HTMLElement, rows: readonly LegendRow[]): void {
  const owner = body.ownerDocument;
  const nodes: HTMLElement[] = [];
  if (rows.length === 0) {
    const empty = owner.createElement("div");
    empty.className = "cd-shell-legend-row c4-legend-empty";
    empty.textContent = "Nothing in this view yet";
    nodes.push(empty);
  }
  let part: string | undefined;
  for (const row of rows) {
    if (part !== undefined && partOf(row) !== part) {
      const separator = owner.createElement("div");
      separator.className = "cd-shell-legend-separator";
      separator.setAttribute("role", "separator");
      nodes.push(separator);
    }
    part = partOf(row);
    const element = owner.createElement("div");
    element.className = "cd-shell-legend-row c4-legend-row";
    element.dataset.legendKind = row.kind;
    const preview = owner.createElement("span");
    preview.className = "cd-shell-legend-preview";
    preview.innerHTML = legendPreview(row);
    const label = owner.createElement("span");
    label.textContent = row.label;
    element.append(preview, label);
    nodes.push(element);
  }
  body.replaceChildren(...nodes);
}
