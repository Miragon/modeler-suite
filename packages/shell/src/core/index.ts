export type {
  Bounds,
  ChromeIsland,
  Insets,
  PaletteRow,
  Point,
  ScaledViewbox,
  ShellHost,
  Size,
  ViewportState,
  ZoomTarget,
} from "./types.js";
export { CHROME_ISLANDS } from "./types.js";

export type { ShellSizeName, ShellSizes } from "./sizes.js";
export { SHELL, SHELL_TOKENS, shellSizesFromTokens } from "./sizes.js";

export type { FitLayout } from "./fit.js";
export {
  FIT_ANIMATION_MS,
  MAX_FIT_ZOOM,
  VIEW_TOLERANCE,
  easeStandard,
  fitInsets,
  fitViewbox,
  freeRectCenter,
  interpolateViewbox,
  sameView,
} from "./fit.js";

export type { ZoomReadout } from "./zoom.js";
export {
  ZOOM_MAX,
  ZOOM_MIN,
  canZoomIn,
  canZoomOut,
  formatNumber,
  formatPercent,
  zoomReadout,
} from "./zoom.js";

export type {
  ChromeKey,
  KeyAction,
  KeyContext,
  KeyDecision,
  KeyLike,
  NavigatorLike,
  Platform,
  ShortcutKeyKind,
} from "./keymap.js";
export {
  TEXT_FIELD_SELECTOR,
  ariaKeyShortcuts,
  ariaKeyShortcutsFromLabel,
  commandKeyLabel,
  decideKey,
  detectPlatform,
  isTextField,
  isUndoRedoKey,
  matchChromeKey,
  shortcutKeyKind,
  shortcutLabel,
} from "./keymap.js";

export type {
  Appearance,
  AppearanceAttributes,
  ColorThemeSetting,
  Kontrast,
  Theme,
} from "./appearance.js";
export {
  REDUCED_MOTION_CLASS,
  appearanceAttributes,
  appearanceFromBodyClasses,
  appearanceFromColorThemeKind,
  reducedMotionFromBodyClasses,
  requestedAppearance,
  resolveAppearance,
} from "./appearance.js";

export type { ShellMessageOverrides, ShellMessages } from "./messages.js";
export { defaultMessages, resolveMessages } from "./messages.js";

export type {
  ChromeShortcutRow,
  ShortcutChrome,
  ShortcutGroup,
  ShortcutRow,
  ShownShortcutGroup,
  ShownShortcutRow,
} from "./shortcuts.js";
export { chromeShortcutRows, isChromeShortcutRow, withChromeShortcuts } from "./shortcuts.js";

export type { PaletteRowInput, TooltipPlacementInput } from "./layout.js";
export {
  INVALID_STATUS_DELAY_MS,
  PALETTE_CLEARANCE,
  TOOLTIP_DELAY_MS,
  decidePaletteRow,
  legendStartsOpen,
  placeTooltip,
} from "./layout.js";

// ---- Web host (0.2) ----

export type { PrimaryWidths, TopRow, TopRowInput } from "./web-chrome/top-row.js";
export { decideTopRow } from "./web-chrome/top-row.js";
export type { BottomRowInput } from "./web-chrome/bottom-row.js";
export { LEGAL_LINE_HEIGHT, legalLineHeight, zoomRowRaised } from "./web-chrome/bottom-row.js";
export type {
  DragContext,
  DragItemLike,
  DragVerdict,
  DropForbiddenReason,
} from "./web-chrome/drop.js";
export { acceptsFile, dragVerdict } from "./web-chrome/drop.js";

export type {
  BottomObstacle,
  ToastAction,
  ToastRequest,
  ToastSlot,
  ToastStackInput,
  ToastStatus,
} from "./feedback/toasts.js";
export {
  MAX_TOASTS,
  TOAST_DURATION_MS,
  TOAST_MAX_WIDTH,
  toastLifetime,
  toastStackBottom,
  toastStackWidth,
  toastToEvict,
} from "./feedback/toasts.js";
export type {
  AppearanceChoice,
  DocumentMode,
  ThemeColors,
  WebModeScriptOptions,
} from "./feedback/appearance.js";
export {
  APPEARANCE_STORAGE_KEY,
  documentMode,
  parseAppearanceChoice,
  webHeadMarkup,
  webModeScript,
} from "./feedback/appearance.js";
export type { ProblemItem, ProblemSeverity } from "./feedback/problems.js";
export { problemSummary } from "./feedback/problems.js";
