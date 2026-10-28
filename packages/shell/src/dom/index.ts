export type {
  AppearanceHandle,
  DropZoneOptions,
  EmptyHintOptions,
  EmptyStateOptions,
  FileMenuAction,
  FileMenuOptions,
  LegalLineOptions,
  LegalLink,
  PrimaryActionHandle,
  PrimaryActionOptions,
  StorageLike,
  ToastHandle,
  WebAppearanceOptions,
  InspectorHandle,
  InspectorOptions,
  LegendHandle,
  LegendOptions,
  MenuActionEntry,
  MenuCheckboxEntry,
  MenuDialogEntry,
  MenuEntry,
  MenuGroups,
  MenuHandle,
  MenuRadioGroup,
  MenuRadioOption,
  PaletteReadOnlyState,
  PaletteRegistration,
  ProblemSummary,
  ProblemsOptions,
  ShellHandle,
  ShellOptions,
  StatusMessage,
  StatusSeverity,
  TooltipContent,
  TooltipHandle,
} from "./types.js";
export type { MenuGroupName } from "./menu.js";
export { mountShell } from "./mount.js";

export type { ShellDialog, ShellDialogOptions } from "./dialog.js";
export { openShellDialog } from "./dialog.js";
export type { ShortcutsDialogOptions } from "./shortcuts-dialog.js";
export { showShortcutsDialog } from "./shortcuts-dialog.js";

export type { IconNode, IconOptions, ShellIconName } from "./icons.js";
export { ICONS, PALETTE_TOOL_ICON, iconElement, iconMarkup } from "./icons.js";
