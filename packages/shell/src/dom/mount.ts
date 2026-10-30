import {
  LEGAL_LINE_HEIGHT,
  SHELL,
  decideTopRow,
  detectPlatform,
  fitInsets,
  legalLineHeight,
  resolveMessages,
  toastStackBottom,
  withChromeShortcuts,
  zoomRowRaised,
  type BottomObstacle,
  type FitLayout,
  type Insets,
  type PaletteRow,
  type ShortcutGroup,
  type Size,
  type Theme,
  type ToastRequest,
  type ZoomTarget,
} from "../core/index.js";
import type { OwnedShellDialog, ShellDialog } from "./dialog.js";
import { boxRelativeTo, createElement, isPointerClick } from "./element.js";
import { connectWebAppearance } from "./feedback/appearance.js";
import { createProblemsPopover, type ProblemsPopover } from "./feedback/problems-popover.js";
import { createToaster } from "./feedback/toasts.js";
import { createEmptyHint } from "./hint.js";
import { createInspector } from "./inspector.js";
import { createKeyListener, isModalOpen, stopEscapeKeyup } from "./keys.js";
import { Ledger } from "./ledger.js";
import { createLegend } from "./legend.js";
import { createMenu, type MenuGroupName } from "./menu.js";
import { createProblemsPill } from "./problems.js";
import { openShortcutsDialog } from "./shortcuts-dialog.js";
import { createStatusBox } from "./status.js";
import { createTooltip } from "./tooltip.js";
import type {
  AppearanceHandle,
  InspectorHandle,
  LegendHandle,
  MenuCheckboxEntry,
  MenuEntry,
  MenuHandle,
  PaletteReadOnlyState,
  PaletteRegistration,
  PrimaryActionHandle,
  ShellHandle,
  ShellOptions,
  ToastHandle,
  TooltipHandle,
} from "./types.js";
import { createDropZone } from "./web/drop-zone.js";
import { createEmptyState } from "./web/empty-state.js";
import { createLegalLine } from "./web/legal.js";
import { appearanceMenuEntries, fileMenuEntries } from "./web/menu-groups.js";
import { createPrimaryAction } from "./web/primary.js";
import { createZoomPanel } from "./zoom-panel.js";

// Page-global: every modeler bundles its own copy of the shell (and the CJS entries inline one each),
// and two shells on one foreign page must not share element ids.
const MOUNT_COUNTER = Symbol.for("@miragon/modeler-shell.mounts");

function nextMountIndex(): number {
  const scope = globalThis as unknown as Record<symbol, number | undefined>;
  const index = (scope[MOUNT_COUNTER] ?? 0) + 1;
  scope[MOUNT_COUNTER] = index;
  return index;
}

const DEFAULT_THEMES: readonly Theme[] = ["light"];

/** The legal line's height on the root, which the stack above it (pill, legend, zoom row) adds. */
const LEGAL_HEIGHT_PROPERTY = "--modeler-shell-legal-height";

/** What `toast()` returns where no toast shows (the IDE and embedded hosts, after `destroy`). */
const INERT_TOAST: ToastHandle = Object.freeze({ dismiss() {} });

/** What `showShortcutsDialog()` returns after `destroy`. */
const CLOSED_DIALOG: ShellDialog = Object.freeze({ isOpen: () => false, close() {} });

/** The element's box relative to the root while it is rendered and visible, else `undefined`. */
function visibleBoxIn(element: HTMLElement | undefined, root: HTMLElement) {
  if (!element || element.hidden || !element.isConnected) return undefined;
  if (
    typeof element.checkVisibility === "function" &&
    !element.checkVisibility({ visibilityProperty: true })
  )
    return undefined;
  const box = boxRelativeTo(element, root);
  return box.width > 0 && box.height > 0 ? box : undefined;
}

// In a foreign page the closest [lang] is the page's language, not the tool's (guide §2).
function languageOf(
  root: HTMLElement,
  host: ShellOptions["host"],
  requested: string | undefined,
): string {
  if (requested) return requested;
  const declared =
    host === "embedded" ? root.getAttribute("lang") : root.closest("[lang]")?.getAttribute("lang");
  return declared || "en";
}

/** The contrast of the host page around an embedded root: the nearest mode carrier above it. */
function hostKontrast(root: HTMLElement): "hoch" | null {
  const carrier = root.parentElement?.closest("[data-cd-theme], [data-cd-kontrast]");
  return carrier?.getAttribute("data-cd-kontrast") === "hoch" ? "hoch" : null;
}

/**
 * Turns `root` into the shell (`.cd-shell`, container `cd-shell`) and renders the chrome in the
 * DOM order of guide §5.14: menu trigger, primary action (web), canvas slot, status box,
 * empty-file hint, empty state (web), inspector, problems pill, legend, legal line (web), zoom
 * panel, then the layer for dropdown, tooltip, problems popover and drop zone, and last the toast
 * stack (web). Installs the one `keydown` listener (see `ShellOptions.keyScope`) and the
 * root `ResizeObserver`.
 *
 * `root` must get its size from outside (`container-type: size`): `height: 100%` in an own
 * document, an explicitly sized element in a foreign page. When rendering throws (a modeler's
 * `legend.render`), everything added so far is removed again before the error propagates.
 */
export function mountShell(root: HTMLElement, options: ShellOptions): ShellHandle {
  const themes = options.themes ?? DEFAULT_THEMES;
  if (themes.length === 0)
    throw new Error("@miragon/modeler-shell: mountShell needs at least one theme");
  const ledger = new Ledger();
  try {
    return renderShell(root, options, themes, ledger);
  } catch (error) {
    ledger.close();
    throw error;
  }
}

function renderShell(
  root: HTMLElement,
  options: ShellOptions,
  themes: readonly Theme[],
  ledger: Ledger,
): ShellHandle {
  const ownerDocument = root.ownerDocument;
  const { host } = options;
  const index = nextMountIndex();
  const messages = resolveMessages(options.messages);
  const platform = options.platform ?? detectPlatform(globalThis.navigator);
  const lang = languageOf(root, host, options.lang);
  const keyScope = options.keyScope ?? (host === "embedded" ? "root" : "document");
  const web = host === "web";

  ledger.addClass(root, "cd-shell");
  ledger.attribute(root, "data-cd-shell-host", host);
  ledger.attribute(root, "data-palette", "top");
  if (host === "embedded") {
    ledger.attribute(root, "lang", lang);
    carryOwnMode(root, themes[0] ?? "light", ledger);
  } else {
    ledger.addClass(ownerDocument.documentElement, "cd-shell-document");
  }

  const setState = (name: string, value: string | null): void => {
    if (!ledger.isClosed) ledger.attribute(root, name, value);
  };

  // The head script set the mode before the first paint; this follows contrast and the menu choice.
  const appearance = web
    ? connectWebAppearance({ ownerDocument, themes, options: options.appearance })
    : undefined;
  if (appearance) ledger.defer(() => appearance.destroy());
  const darkCapable = themes.includes("dark");

  const layer = createElement(ownerDocument, "div", { class: "cd-shell-layer" });
  ledger.defer(() => layer.remove());
  const tooltip = createTooltip({ root, layer, id: `cd-shell-tooltip-${index}` });
  ledger.defer(() => tooltip.destroy());

  /** The lock of `setReadOnly(true)`; `readOnlyShown` its marks, which may follow after a delay. */
  let readOnly = false;
  let readOnlyShown = false;
  let readOnlyTimer: ReturnType<typeof setTimeout> | undefined;
  ledger.defer(() => clearTimeout(readOnlyTimer));

  const legend = options.legend
    ? createLegend({
        ownerDocument,
        messages,
        tooltip,
        titleId: `cd-shell-legend-title-${index}`,
        options: options.legend,
        onChange(open) {
          setState("data-legend", open ? "open" : null);
          placeHint();
          menu.refresh();
        },
        focusAfterClose: () => menu.trigger.focus(),
      })
    : undefined;
  if (legend) ledger.defer(() => legend.destroy());

  const legendEntry: MenuCheckboxEntry | undefined =
    legend && options.legend?.menuEntry !== false
      ? {
          kind: "checkbox",
          id: "legend",
          label: messages.legend,
          checked: () => legend.isOpen(),
          onToggle: (checked) => legend.setOpen(checked),
          keepEnabledWhenReadOnly: true,
        }
      : undefined;
  const shellModelEntries: readonly MenuCheckboxEntry[] = legendEntry ? [legendEntry] : [];
  const fileEntries: readonly MenuEntry[] =
    web && options.file ? fileMenuEntries(options.file, messages) : [];
  const appearanceEntries: readonly MenuEntry[] =
    appearance && darkCapable ? appearanceMenuEntries(appearance, messages) : [];
  const shellEntries = (group: MenuGroupName): readonly MenuEntry[] => {
    if (group === "file") return fileEntries;
    if (group === "model") return shellModelEntries;
    if (group === "appearance") return appearanceEntries;
    return [];
  };

  const menu = createMenu({
    root,
    layer,
    id: `cd-shell-menu-${index}`,
    messages,
    tooltip,
    groups: options.menu ?? {},
    shellEntries,
    isReadOnly: () => readOnly,
    focusCanvas,
  });
  ledger.defer(() => menu.destroy());
  ledger.defer(
    tooltip.attach(menu.trigger, () => (menu.isOpen() ? null : { label: messages.menu })),
  );

  const primary =
    web && options.primary
      ? createPrimaryAction({
          ownerDocument,
          messages,
          tooltip,
          options: options.primary,
          focusCanvas,
        })
      : undefined;
  if (primary) ledger.defer(() => primary.destroy());

  const canvas = options.canvas ?? createElement(ownerDocument, "div");
  ledger.addClass(canvas, "cd-shell-canvas");
  // An own page needs a main landmark; the diagram is its content. A foreign page has its own.
  if (web && !canvas.hasAttribute("role")) ledger.attribute(canvas, "role", "main");
  if (!options.canvas) ledger.defer(() => canvas.remove());

  /**
   * The focus target when the element holding it goes away: on the start screen its "New
   * diagram", else the canvas, else the menu trigger. A target that cannot take the focus (inert,
   * hidden behind the start screen) is passed over, so the focus never falls to `<body>` unseen.
   */
  function focusCanvasOrTrigger(): void {
    const took = (target: HTMLElement | SVGElement | null | undefined): boolean => {
      target?.focus({ preventScroll: true });
      return target !== null && target !== undefined && ownerDocument.activeElement === target;
    };
    if (emptyState?.isShown()) {
      emptyState.focus();
      if (emptyState.element.contains(ownerDocument.activeElement)) return;
    }
    if (took(canvas.querySelector<HTMLElement | SVGElement>("svg[tabindex]"))) return;
    if (!menu.trigger.hidden) took(menu.trigger);
  }

  /** Where the focus goes when the island holding it hides. */
  function moveFocusOutOf(island: HTMLElement): void {
    if (island.contains(ownerDocument.activeElement)) focusCanvasOrTrigger();
  }

  /**
   * Whether the island holds the focus as it shows or hides. WebKit and Firefox on macOS do not
   * focus a button on a pointer click, so a click on the start screen's "New diagram", "Show
   * example" or "Open a file…" or on the hint's "Insert example" leaves the focus on `<body>`, not
   * in the island that hands it to the canvas when it hides, also once the modeler has loaded the
   * file. Until the island shows or hides again, such a click counts as the island's focus while
   * nothing else has taken it.
   */
  function islandFocusTracker(island: HTMLElement | undefined): () => boolean {
    let clickedByPointer = false;
    island?.addEventListener(
      "click",
      (event) => {
        if ((event.target as Element | null)?.closest?.("button")) {
          clickedByPointer = isPointerClick(event);
        }
      },
      true,
    );
    return () => {
      const active = ownerDocument.activeElement;
      const focusNowhere = active === null || active === ownerDocument.body;
      const held = (island?.contains(active) ?? false) || (clickedByPointer && focusNowhere);
      clickedByPointer = false;
      return held;
    };
  }

  let zoomTarget: ZoomTarget | null = null;

  /**
   * After a pointer click on chrome that acts on the canvas (guide §5.8): the renderers act on keys
   * only while their canvas has the focus, so Delete or the arrows would otherwise go to the
   * clicked button. Only the adapter's zoom target can focus the canvas; without it the focus stays
   * where the click put it. True when the focus is on the canvas now.
   */
  function focusCanvas(): boolean {
    if (ledger.isClosed || !zoomTarget?.focus) return false;
    zoomTarget.focus();
    return canvas.contains(ownerDocument.activeElement);
  }

  const status = createStatusBox(ownerDocument);
  ledger.defer(() => status.destroy());
  const hint = options.emptyHint
    ? createEmptyHint(ownerDocument, messages, options.emptyHint)
    : undefined;
  if (hint) ledger.defer(() => hint.destroy());
  const hintHadFocus = islandFocusTracker(hint?.element);
  const emptyState =
    web && options.emptyState
      ? createEmptyState({
          ownerDocument,
          messages,
          options: options.emptyState,
          dropHint: options.dropZone
            ? (options.emptyState.dropHint ?? messages.dropHint)
            : undefined,
          open: options.file?.open,
          titleId: `cd-shell-empty-state-title-${index}`,
          onLeave: () => setEmptyStateShown(false),
        })
      : undefined;
  if (emptyState) ledger.defer(() => emptyState.destroy());
  const cardHadFocus = islandFocusTracker(emptyState?.element);
  const inspector = options.inspector
    ? createInspector(ownerDocument, options.inspector, (open) => {
        setState("data-inspector", open ? "open" : null);
        // Up to 760px the sheet hides zoom panel and pill, so the toasts' bottom row changes.
        updateBottomRow();
        placeHint();
      })
    : undefined;
  if (inspector) ledger.defer(() => inspector.destroy());
  const problemsOptions = options.problems;
  let popover: ProblemsPopover | undefined;
  const pill = problemsOptions
    ? createProblemsPill({
        ownerDocument,
        messages,
        lang,
        tooltip,
        showTooltip: host === "ide",
        onActivate() {
          if (popover) popover.toggle();
          else problemsOptions.onActivate?.();
        },
      })
    : undefined;
  if (pill) ledger.defer(() => pill.destroy());
  // The web app lists its problems itself; an embedding host only when it has no list of its own.
  if (pill && (web || (host === "embedded" && !problemsOptions?.onActivate))) {
    const created = createProblemsPopover({
      ownerDocument,
      root,
      layer,
      pill: pill.element,
      id: `cd-shell-problems-${index}`,
      titleId: `cd-shell-problems-title-${index}`,
      messages,
      onSelectItem: problemsOptions?.onSelectItem,
    });
    popover = created;
    ledger.defer(() => created.destroy());
  }
  const legal = web
    ? createLegalLine({
        ownerDocument,
        messages,
        options: options.legal ?? {},
        idPrefix: `cd-shell-legal-${index}`,
      })
    : undefined;
  if (legal) ledger.defer(() => legal.destroy());
  const zoomPanel = createZoomPanel({
    ownerDocument,
    messages,
    lang,
    platform,
    tooltip,
    focusCanvas,
  });
  ledger.defer(() => zoomPanel.destroy());
  // The IDE and the embedding host own all feedback (guide §5.2, §9, §13.5): no stack, no regions.
  const toaster = web
    ? createToaster({
        ownerDocument,
        messages,
        idPrefix: `cd-shell-toast-${index}`,
        focusFallback: focusCanvasOrTrigger,
        onChange: () => updateBottomRow(),
      })
    : undefined;
  if (toaster) ledger.defer(() => toaster.destroy());

  const defined = (element: HTMLElement | undefined): element is HTMLElement =>
    element !== undefined;
  root.prepend(...[menu.trigger, primary?.element, canvas].filter(defined));
  root.append(
    ...[
      status.element,
      hint?.element,
      emptyState?.element,
      inspector?.element,
      pill?.element,
      legend?.element,
      legal?.element,
      zoomPanel.element,
    ].filter(defined),
    layer,
    ...[toaster?.announcer, toaster?.element].filter(defined),
  );

  function showToast(request: ToastRequest): ToastHandle {
    return ledger.isClosed || !toaster ? INERT_TOAST : toaster.show(request);
  }

  const dropZone =
    web && options.dropZone
      ? createDropZone({
          ownerDocument,
          layer,
          messages,
          lang,
          options: options.dropZone,
          modalOpen: () => isModalOpen(ownerDocument),
          toast: showToast,
          setState: (state) => setState("data-drop", state),
        })
      : undefined;
  if (dropZone) ledger.defer(() => dropZone.destroy());

  let palette:
    | { registration: PaletteRegistration; detachTooltip: () => void; detachFocus: () => void }
    | undefined;
  let paletteRow: PaletteRow = "top";
  /** Web: the zoom panel stands above the legal line (`data-zoom-row="raised"`). */
  let zoomRaised = false;
  /** Web: the legal line's measured height, more than one line where a narrow container wraps it. */
  let legalHeight = LEGAL_LINE_HEIGHT;
  if (legal) ledger.defer(() => root.style.removeProperty(LEGAL_HEIGHT_PROPERTY));

  function containerSize(): Size {
    return { width: root.clientWidth, height: root.clientHeight };
  }

  function menuRight(): number {
    const box = boxRelativeTo(menu.trigger, root);
    return box.width > 0 ? box.x + box.width : SHELL.edge + SHELL.row;
  }

  /** The palette's intrinsic border-box width: it does not shrink once the second row clips it. */
  function paletteWidth(): number {
    const element = palette?.registration.element;
    return element ? element.offsetWidth - element.clientWidth + element.scrollWidth : 0;
  }

  function currentFitInsets(): Insets {
    const container = containerSize();
    const layout: FitLayout = {
      container,
      host,
      paletteRow,
      problemsVisible: pill?.isShown() ?? false,
    };
    if (web) {
      layout.zoomRaised = zoomRaised;
      layout.legalHeight = legalHeight;
    }
    if (legend?.isOpen()) layout.legendWidth = legend.element.getBoundingClientRect().width;
    if (inspector?.isOpen()) {
      layout.inspector =
        container.width > SHELL.narrow
          ? {}
          : { sheetTop: boxRelativeTo(inspector.element, root).y };
    }
    return fitInsets(layout);
  }

  function placeHint(): void {
    if (hint?.isShown()) hint.place(currentFitInsets());
  }

  function updateLayout(): void {
    if (ledger.isClosed) return;
    const size = containerSize();
    // A hidden tab may report 0 × 0; it neither measures nor decides anything then (guide §5.9).
    if (size.width === 0 || size.height === 0) return;
    const topRow = decideTopRow({
      containerWidth: size.width,
      paletteWidth: paletteWidth(),
      menuRight: menuRight(),
      primary: primary?.widths(),
    });
    paletteRow = topRow.paletteRow;
    setState("data-palette", paletteRow);
    if (primary) {
      const collapsed = topRow.primaryLabel === "collapsed";
      primary.setCollapsed(collapsed);
      setState("data-primary", collapsed ? "collapsed" : null);
    }
    updateBottomRow();
    placeHint();
  }

  /** Web: the raised zoom row (legal line) and the toast stack's bottom, from what is visible. */
  function updateBottomRow(): void {
    if (ledger.isClosed) return;
    const size = containerSize();
    if (size.width === 0 || size.height === 0) return;
    if (legal) {
      const legalBox = visibleBoxIn(legal.element, root);
      const height = legalLineHeight(legalBox?.height);
      if (height !== legalHeight || !root.style.getPropertyValue(LEGAL_HEIGHT_PROPERTY)) {
        legalHeight = height;
        root.style.setProperty(LEGAL_HEIGHT_PROPERTY, `${height}px`);
      }
      zoomRaised = zoomRowRaised({
        containerWidth: size.width,
        legalRight: legalBox && legalBox.x + legalBox.width,
        zoomWidth: visibleBoxIn(zoomPanel.element, root)?.width,
      });
      setState("data-zoom-row", zoomRaised ? "raised" : null);
    }
    if (toaster) {
      const obstacles = [zoomPanel.element, legal?.element, pill?.element].flatMap(
        (element): BottomObstacle[] => {
          const box = visibleBoxIn(element, root);
          return box ? [{ left: box.x, right: box.x + box.width, top: size.height - box.y }] : [];
        },
      );
      toaster.setBottom(
        toastStackBottom({
          containerWidth: size.width,
          obstacles,
          cardWidth: toaster.widestCard(),
        }),
      );
    }
  }

  function setEmptyStateShown(shown: boolean): void {
    if (ledger.isClosed || !emptyState || emptyState.isShown() === shown) return;
    const active = ownerDocument.activeElement;
    const hadFocus = cardHadFocus();
    // The work chrome and the canvas are about to hide: a focus there would fall to <body>. The
    // legal line and the toasts stay.
    const workHadFocus =
      shown &&
      active !== null &&
      root.contains(active) &&
      ![emptyState.element, legal?.element, toaster?.element].some((kept) =>
        kept?.contains(active),
      );
    emptyState.setShown(shown);
    setState("data-empty-state", shown ? "shown" : null);
    // Nothing behind the card takes a click or the Tab (guide §8: nothing else competes).
    ledger.attribute(canvas, "inert", shown ? "" : null);
    if (shown) {
      menu.close();
      popover?.close();
      tooltip.hide();
      if (workHadFocus) emptyState.focus();
    } else if (hadFocus) {
      focusCanvasOrTrigger();
    }
    updateLayout();
  }

  const ResizeObserverClass = globalThis.ResizeObserver;
  const resizeObserver = ResizeObserverClass
    ? new ResizeObserverClass(() => updateLayout())
    : undefined;
  resizeObserver?.observe(root);
  // The label widens once the web font has loaded; the top row decides again then. The legal line
  // may wrap onto a second line then, which lifts everything stacked above it.
  if (primary) resizeObserver?.observe(primary.element);
  if (legal) resizeObserver?.observe(legal.element);
  ledger.defer(() => resizeObserver?.disconnect());

  legend?.start(options.legend?.open ?? false);
  updateLayout();

  const keyTarget: HTMLElement | Document = keyScope === "root" ? root : ownerDocument;
  const onKeydown = createKeyListener({
    host,
    ownerDocument,
    dialogScope: keyTarget,
    isChrome: (node) =>
      node !== root &&
      root.contains(node) &&
      !canvas.contains(node) &&
      !(palette?.registration.element.contains(node) ?? false),
    menuOpen: () => menu.isOpen(),
    startScreen: () => emptyState?.isShown() ?? false,
    closeMenu() {
      const active = ownerDocument.activeElement;
      menu.close({ restoreFocus: active === menu.trigger || menu.dropdown.contains(active) });
      stopEscapeKeyup(ownerDocument);
    },
    hideTooltip: () => tooltip.hide(),
    // Behind the start screen the keys reach the browser instead: there is no diagram to zoom.
    run: (key) => {
      if (!emptyState?.isShown()) zoomPanel.run(key);
    },
  });
  keyTarget.addEventListener("keydown", onKeydown as EventListener);
  ledger.defer(() => keyTarget.removeEventListener("keydown", onKeydown as EventListener));

  function readOnlyState(): PaletteReadOnlyState {
    return { locked: readOnly, shown: readOnlyShown };
  }

  function applyReadOnly(): void {
    setState("data-readonly", readOnlyShown ? "" : null);
    palette?.registration.setReadOnly(readOnlyState());
    menu.refresh();
  }

  function showReadOnly(): void {
    readOnlyTimer = undefined;
    if (ledger.isClosed || !readOnly) return;
    readOnlyShown = true;
    applyReadOnly();
  }

  /**
   * A palette entry clicked or dragged with a pointer hands the focus to the canvas once
   * diagram-js has run it: its click and dragstart delegates sit on the same element and were
   * bound first. Enter and Space (the skin's synthetic click) leave it on the entry.
   */
  function handFocusBackFrom(element: HTMLElement): () => void {
    const onActivation = (event: Event): void => {
      if (event.type === "click" && !isPointerClick(event)) return;
      const entry = (event.target as Element | null)?.closest?.(".entry");
      if (entry && element.contains(entry)) focusCanvas();
    };
    element.addEventListener("click", onActivation);
    element.addEventListener("dragstart", onActivation);
    return () => {
      element.removeEventListener("click", onActivation);
      element.removeEventListener("dragstart", onActivation);
    };
  }

  function unregisterPalette(): void {
    if (!palette) return;
    palette.detachTooltip();
    palette.detachFocus();
    resizeObserver?.unobserve(palette.registration.element);
    palette = undefined;
  }
  ledger.defer(unregisterPalette);

  const menuHandle: MenuHandle = {
    trigger: menu.trigger,
    dropdown: menu.dropdown,
    isOpen: () => menu.isOpen(),
    open: (focus) => menu.open(focus),
    close: (closeOptions) => menu.close(closeOptions),
    refresh: () => menu.refresh(),
    setGroups: (groups) => {
      if (!ledger.isClosed) menu.setGroups(groups);
    },
  };

  const tooltipHandle: TooltipHandle = {
    attach: (control, content) => (ledger.isClosed ? () => {} : tooltip.attach(control, content)),
    hide: () => tooltip.hide(),
  };

  const legendHandle: LegendHandle | undefined = legend && {
    element: legend.element,
    body: legend.body,
    isOpen: () => legend.isOpen(),
    setOpen: (open) => {
      if (!ledger.isClosed) legend.setOpen(open);
    },
    toggle: () => {
      if (!ledger.isClosed) legend.toggle();
    },
  };

  const primaryHandle: PrimaryActionHandle | undefined = primary && {
    element: primary.element,
    isCollapsed: () => primary.isCollapsed(),
    refresh: () => {
      if (!ledger.isClosed) primary.refresh();
    },
  };

  const appearanceHandle: AppearanceHandle | undefined =
    appearance && darkCapable
      ? {
          choice: () => appearance.choice(),
          setChoice: (choice) => {
            if (ledger.isClosed) return;
            appearance.setChoice(choice);
            menu.refresh();
          },
        }
      : undefined;

  const inspectorHandle: InspectorHandle | undefined = inspector && {
    element: inspector.element,
    isOpen: () => inspector.isOpen(),
    open: () => {
      if (!ledger.isClosed) inspector.open();
    },
    close: () => {
      if (ledger.isClosed) return;
      if (inspector.isOpen()) moveFocusOutOf(inspector.element);
      inspector.close();
    },
  };

  let shortcutsDialog: { owned: OwnedShellDialog; handle: ShellDialog } | undefined;
  // Registered after the mount's elements, so it runs before their removal; it moves no focus.
  ledger.defer(() => shortcutsDialog?.owned.discard());

  function showShortcutsDialog(groups: readonly ShortcutGroup[]): ShellDialog {
    if (ledger.isClosed) return CLOSED_DIALOG;
    if (shortcutsDialog?.owned.isOpen()) return shortcutsDialog.handle;
    if (menu.isOpen()) {
      const active = ownerDocument.activeElement;
      menu.close({ restoreFocus: active === menu.trigger || menu.dropdown.contains(active) });
    }
    tooltip.hide();
    const owned = openShortcutsDialog(
      withChromeShortcuts(groups, { platform, lang, messages }),
      messages,
      { container: root, focusFallback: focusCanvasOrTrigger },
    );
    shortcutsDialog = {
      owned,
      handle: { isOpen: () => owned.isOpen(), close: () => owned.close() },
    };
    return shortcutsDialog.handle;
  }

  return {
    root,
    canvas,
    host,
    lang,
    platform,
    messages,
    menu: menuHandle,
    tooltip: tooltipHandle,
    legend: legendHandle,
    inspector: inspectorHandle,
    primary: primaryHandle,
    appearance: appearanceHandle,
    setZoomTarget(target: ZoomTarget | null) {
      if (ledger.isClosed) return;
      zoomTarget = target;
      zoomPanel.setTarget(target);
    },
    fitInsets: currentFitInsets,
    registerPalette(registration) {
      if (ledger.isClosed) return () => {};
      unregisterPalette();
      palette = {
        registration,
        detachTooltip: tooltip.delegate(registration.element, ".entry", (entry) =>
          registration.entryTooltip(entry),
        ),
        detachFocus: handFocusBackFrom(registration.element),
      };
      resizeObserver?.observe(registration.element);
      registration.setReadOnly(readOnlyState());
      updateLayout();
      const registered = palette;
      return () => {
        if (palette !== registered) return;
        unregisterPalette();
        updateLayout();
      };
    },
    setProblems(summary) {
      if (ledger.isClosed || !pill) return;
      const listHadFocus = popover?.element.contains(ownerDocument.activeElement) ?? false;
      pill.set(summary);
      setState("data-problems", pill.isShown() ? "shown" : null);
      popover?.setItems(summary.items ?? []);
      if (!pill.isShown() && popover?.isOpen()) {
        popover.close();
        // The pill went with the list, so the focus cannot return to it.
        if (listHadFocus) focusCanvasOrTrigger();
      }
      updateBottomRow();
      placeHint();
    },
    setStatus(next, statusOptions) {
      if (!ledger.isClosed) status.set(next, statusOptions?.delayMs ?? 0);
    },
    setEmptyHint(visible) {
      if (ledger.isClosed || !hint) return;
      if (visible !== hint.isShown()) {
        const hadFocus = hintHadFocus();
        if (hadFocus && !visible) focusCanvasOrTrigger();
      }
      hint.setShown(visible);
      placeHint();
    },
    setReadOnly(next, readOnlyOptions) {
      if (ledger.isClosed) return;
      if (!next) {
        clearTimeout(readOnlyTimer);
        readOnlyTimer = undefined;
        readOnly = false;
        readOnlyShown = false;
      } else {
        readOnly = true;
        const delayMs = readOnlyOptions?.delayMs ?? 0;
        // Repeated invalid imports while typing keep the first timer, like the status box.
        if (!readOnlyShown && readOnlyTimer === undefined) {
          if (delayMs > 0) readOnlyTimer = setTimeout(showReadOnly, delayMs);
          else readOnlyShown = true;
        }
      }
      applyReadOnly();
    },
    isReadOnly: () => readOnly,
    setEmptyState: setEmptyStateShown,
    isEmptyStateShown: () => emptyState?.isShown() ?? false,
    toast: showToast,
    showShortcutsDialog,
    destroy() {
      ledger.close();
    },
  };
}

/**
 * An embedded root carries its own mode (guide §13.3): the token CSS resolves the roles on the
 * nearest `[data-cd-theme]`, so without it a light-only modeler would inherit a dark host page and
 * be half-dark against its light-drawn diagram. The root's own `data-cd-theme` would also drop the
 * host's high contrast, so `data-cd-kontrast` is mirrored from the host for as long as it lives.
 */
function carryOwnMode(root: HTMLElement, theme: Theme, ledger: Ledger): void {
  ledger.attribute(root, "data-cd-theme", theme);
  const mirror = (): void => {
    if (ledger.isClosed) return;
    const kontrast = hostKontrast(root);
    if (root.getAttribute("data-cd-kontrast") !== kontrast)
      ledger.attribute(root, "data-cd-kontrast", kontrast);
  };
  mirror();
  const MutationObserverClass = globalThis.MutationObserver;
  if (!MutationObserverClass) return;
  const observer = new MutationObserverClass(mirror);
  observer.observe(root.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ["data-cd-theme", "data-cd-kontrast"],
    subtree: true,
  });
  ledger.defer(() => observer.disconnect());
}
