import { COLORS } from "../draw/styles.js";

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" aria-hidden="true" focusable="false">';

const NOTE_PREVIEW =
  `${SVG_OPEN}<path d="M1 6a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3l-6 6H4a3 3 0 0 1-3-3z" fill="${COLORS.plot}" stroke="${COLORS.outline}" stroke-width="1"/>` +
  `<path d="M23 9h-6v6z" fill="${COLORS.line}" stroke="${COLORS.outline}" stroke-width="1" stroke-linejoin="round"/></svg>`;

/**
 * Renders the legend into the shell's legend body (or a host's own panel), replacing what was
 * there: the one mark that is not plain to see, the folded corner of a sticky with notes. A tape's
 * colour means what the team gives it, so the legend names none.
 */
export function renderLegend(body: HTMLElement): void {
  const owner = body.ownerDocument;
  const row = owner.createElement("div");
  row.className = "cd-shell-legend-row";
  const preview = owner.createElement("span");
  preview.className = "cd-shell-legend-preview";
  preview.innerHTML = NOTE_PREVIEW;
  const label = owner.createElement("span");
  label.textContent = "Has notes";
  row.append(preview, label);
  body.replaceChildren(row);
}
