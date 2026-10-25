/**
 * Notation colours the renderer draws in place of a translucent template fill. Guide §10.6 draws a
 * notation fill that uses opacity premixed over white and opaque, in both modes, and keeps the
 * premixed values with the notation in the token module. They are not part of the brand ramp in
 * `palette.ts`; `draw/colour.test.ts` recomputes them from `schema-model/notation.ts`.
 */

import type { InteractionMode } from "@miragon/team-topologies-schema-model";

/** Each official interaction fill at its template opacity of 50 %, mixed over white. */
// Notation colours outside the brand ramp, as the module comment says.
// brand-lint-disable
export const PREMIXED_INTERACTION_FILLS: Readonly<Record<InteractionMode, string>> = {
  collaboration: "#E3DFEF",
  "x-as-a-service": "#DADADA",
  facilitating: "#E4EFDF",
};
// brand-lint-enable
