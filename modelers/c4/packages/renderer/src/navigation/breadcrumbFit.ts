/** The widths of one crumb as drawn: its separator and padding, its name and its level. */
export interface CrumbWidths {
  /** The separator before it and the padding around its text. */
  readonly fixed: number;
  readonly name: number;
  /** 0 without a level (the landscape). */
  readonly level: number;
  readonly current: boolean;
}

/** The widths a crumb's name and level get. */
export interface CrumbFit {
  readonly name: number;
  readonly level: number;
}

interface Part {
  readonly crumb: number;
  readonly field: keyof CrumbFit;
  readonly floor: number;
}

/**
 * How a path that is too wide gives way, in this order: the names of the views above, each down
 * to `nameMin` (a letter and its ellipsis) or its own width; the current view's name; the levels
 * of the views above; the current view's level. Each step shares what it has to give in
 * proportion to what each part can give. `undefined` when even that does not fit.
 */
export function fitCrumbs(
  crumbs: readonly CrumbWidths[],
  available: number,
  nameMin: number,
): CrumbFit[] | undefined {
  const widths = crumbs.map((crumb) => ({ name: crumb.name, level: crumb.level }));
  const total = crumbs.reduce((sum, crumb) => sum + crumb.fixed + crumb.name + crumb.level, 0);
  let deficit = total - available;
  if (deficit <= 0) return widths;
  const names = (current: boolean): Part[] =>
    crumbs.flatMap((crumb, index) =>
      crumb.current === current
        ? [{ crumb: index, field: "name", floor: Math.min(crumb.name, nameMin) }]
        : [],
    );
  const levels = (current: boolean): Part[] =>
    crumbs.flatMap((crumb, index) =>
      crumb.current === current ? [{ crumb: index, field: "level", floor: 0 }] : [],
    );
  for (const step of [names(false), names(true), levels(false), levels(true)]) {
    const room = (part: Part) => widths[part.crumb]![part.field] - part.floor;
    const given = step.reduce((sum, part) => sum + room(part), 0);
    if (given <= 0) continue;
    const share = Math.min(1, deficit / given);
    for (const part of step) widths[part.crumb]![part.field] -= room(part) * share;
    if (share < 1) return widths;
    deficit -= given;
  }
  return deficit <= 0 ? widths : undefined;
}
