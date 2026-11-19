/**
 * The conformance test kit — every law of the CollaborativeModeler contract
 * as an executable case. A modeler repo supplies a small HARNESS (how to
 * create an instance, canonical sample texts, scripted user mutations) and
 * binds the cases to its own test runner:
 *
 *   import { conformanceCases, registerConformance } from "@miragon/modeler-api/conformance";
 *   registerConformance(harness, test);            // node:test, vitest, jest — any (name, fn) runner
 *
 * The runner must run the cases one after another, as node:test, vitest and
 * jest do within a file unless told otherwise (no `test.concurrent`): the
 * keys case moves the focus and dispatches keys in the one document every
 * mounted instance listens to.
 *
 * Cases throw plain Errors on violation, so the kit has no runner or
 * assertion-library dependency. A case that CANNOT (fully) run because the
 * harness left an optional field undefined resolves with `{ skipped }` and
 * registerConformance reports it (console.warn by default) — a law the kit
 * did not verify is never a silent green. A RECOMMENDATION the modeler does
 * not follow resolves with `{ advisories }`, reported the same way and never
 * a failure: a recommendation becomes a law only in a major release.
 */
import { apiVersionsCompatible } from "./index.js";
import { type ConformanceCase, type ConformanceHarness } from "./conformance/harness.js";
import { appearanceCase } from "./conformance/appearance.js";
import { destroyFromAListenerCase, destroyTwiceCase } from "./conformance/destroy.js";
import { dragStartCase } from "./conformance/drag-start.js";
import { dropCase } from "./conformance/drop.js";
import { elementsCases } from "./conformance/elements.js";
import { gestureCase } from "./conformance/gestures.js";
import { instanceCases } from "./conformance/instance.js";
import { interactionCase } from "./conformance/interaction.js";
import { keysCase } from "./conformance/keys.js";
import { silentImportCases } from "./conformance/l1-silent-import.js";
import { canonicalFixpointCases } from "./conformance/l2-canonical-fixpoint.js";
import { changeEventCases } from "./conformance/l3-one-change-event.js";
import { definedUndoCase } from "./conformance/l4-defined-undo.js";
import { viewStateCases } from "./conformance/l5-view-state-round-trip.js";
import { totalExportCases } from "./conformance/l6-total-export.js";
import { rejectedImportCases } from "./conformance/l7-no-trace.js";
import { panCase } from "./conformance/pan.js";
import { userActionCase } from "./conformance/user-action.js";
import { viewerCase } from "./conformance/viewer.js";

export { apiVersionsCompatible };
export {
  mergeConformanceCases,
  registerMergeConformance,
  type ConflictingMergeFixture,
  type DisjointMergeFixture,
  type MergeConformanceCase,
  type MergeFixtures,
} from "./conformance/merge-cases.js";
export { attachedHost } from "./conformance/hosts.js";
export type {
  UserMutation,
  ConformanceHarness,
  GestureKind,
  HeldGesture,
  HeldPan,
  InteractionState,
  CaseOutcome,
  ConformanceCase,
} from "./conformance/harness.js";

export function conformanceCases(): ConformanceCase[] {
  return [
    ...instanceCases,
    ...silentImportCases,
    gestureCase,
    dropCase,
    userActionCase,
    dragStartCase,
    panCase,
    interactionCase,
    destroyFromAListenerCase,
    ...canonicalFixpointCases,
    ...changeEventCases,
    definedUndoCase,
    ...viewStateCases,
    ...elementsCases,
    ...totalExportCases,
    ...rejectedImportCases,
    viewerCase,
    appearanceCase,
    keysCase,
    destroyTwiceCase,
  ];
}

export interface RegisterOptions {
  /**
   * how a SKIPPED case is reported — a law the kit could not (fully) verify
   * because the harness left its field undefined. Default: console.warn
   */
  onSkip?: (caseName: string, reason: string) => void;
  /**
   * how an ADVISORY is reported — a RECOMMENDED behaviour the modeler does
   * not show; the case still passes. Called once per advice. Default:
   * console.warn
   */
  onAdvisory?: (caseName: string, advice: string) => void;
}

/**
 * bind every case to a (name, fn) test runner — node:test, vitest, jest —
 * that runs them one after another: the keys case moves the focus and
 * dispatches keys in the one document every mounted instance listens to, so
 * a case running beside it would see its keys or lose its focus. A case's
 * advisories are reported before its skip, so an `onSkip` that throws does
 * not hide them
 */
export function registerConformance(
  harness: ConformanceHarness,
  test: (name: string, fn: () => Promise<void>) => unknown,
  options: RegisterOptions = {},
): void {
  const onSkip =
    options.onSkip ??
    ((name: string, reason: string) => {
      console.warn(`modeler-api conformance: SKIPPED "${name}" — ${reason}`);
    });
  const onAdvisory =
    options.onAdvisory ??
    ((name: string, advice: string) => {
      console.warn(`modeler-api conformance: ADVISORY "${name}" — ${advice}`);
    });
  for (const conformanceCase of conformanceCases()) {
    test(`conformance: ${conformanceCase.name}`, async () => {
      const outcome = await conformanceCase.run(harness);
      for (const advice of outcome?.advisories ?? []) onAdvisory(conformanceCase.name, advice);
      if (outcome?.skipped) onSkip(conformanceCase.name, outcome.skipped);
    });
  }
}
