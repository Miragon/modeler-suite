export type { PageLike } from "./page.js";
export type { ChromeMeasurement, ExpectedBox, IslandBox } from "./geometry.js";
export { GEOMETRY_TOLERANCE_PX, expectedChromeBoxes, measureChrome } from "./geometry.js";
export type {
  AbsentFeature,
  CspHooks,
  DropFixture,
  DropFixtures,
  EmptyDocument,
  LabelEditorHooks,
  OpenContext,
  RegisterShellConformanceOptions,
  ShellCaseOutcome,
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellConformanceTest,
  ShellSkip,
  ShortcutsDialogHooks,
  ShowHook,
  ShowHooks,
  ToastFixture,
} from "./harness.js";
export { registerShellConformance, shellConformanceCases, vsCodeStubSearch } from "./harness.js";
