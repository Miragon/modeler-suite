import {
  INVALID_STATUS_DELAY_MS,
  type Appearance,
  type ShellHost,
  type Size,
  type Theme,
} from "../core/index.js";
import {
  DOM_ORDER,
  type AppearanceFacts,
  type AriaFacts,
  type CanvasLayerFacts,
  type CanvasStateFacts,
  type FocusPlaceFacts,
  type LabelEditorFacts,
  type MenuEntryFacts,
  type MenuFacts,
  type PaletteColorEntry,
  type PaletteColorFacts,
  type PaletteEntryState,
  type ReadOnlyStateFacts,
  type ShapeFacts,
  type SurroundFacts,
  type ZoomButton,
} from "./facts.js";
import { GEOMETRY_TOLERANCE_PX, type Rectangle } from "./geometry.js";
import type { AbsentFeature, ShellConformanceHarness, ShowHook } from "./harness.js";
import { shortcutChipProblems } from "./key-shortcut-checks.js";
import type { ElementFacts, LeftoverFacts, RecordedKey } from "./page-tools.js";
import type { PageLike } from "./page.js";
import { legalAriaProblems, primaryAriaProblems } from "./web-checks.js";

/*
 * The judgements of the cases, as pure functions of what the probes saw. Each returns readable
 * problems (empty = conforming), so a case can report all of them at once.
 */

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

const name = (element: ElementFacts): string =>
  normalize(element.attributes["aria-label"] ?? element.text);

const attribute = (element: ElementFacts, key: string): string | undefined =>
  element.attributes[key];

/** `aria-keyshortcuts` of the zoom panel (guide §5.6, WAI-ARIA key names). */
export function expectedKeyShortcuts(platform: "mac" | "other"): Record<ZoomButton, string> {
  const modifier = platform === "mac" ? "Meta" : "Control";
  return {
    in: `${modifier}+= ${modifier}+Plus`,
    out: `${modifier}+-`,
    actual: `${modifier}+0`,
    fit: "Shift+1",
  };
}

/** Roles, names, states, DOM order and tab stops of guide §5.4 to §5.14 and §12. */
export function ariaProblems(facts: AriaFacts, host: ShellHost): string[] {
  const problems: string[] = [];

  if (host === "embedded") {
    if (!facts.rootLang)
      problems.push("root: an embedded shell root carries the tool's lang itself (guide §2, §12)");
  } else if (!facts.documentLang) {
    problems.push("<html> has no lang (guide §2)");
  }

  const trigger = facts.trigger;
  if (!trigger) {
    problems.push('menu: no [data-chrome="menu"] trigger');
  } else {
    if (trigger.tag !== "button")
      problems.push(`menu: the trigger is a <${trigger.tag}>, expected a <button>`);
    if (!attribute(trigger, "aria-label"))
      problems.push("menu: the icon-only trigger has no aria-label");
    if (attribute(trigger, "aria-haspopup") !== "menu") {
      problems.push(
        `menu: aria-haspopup is "${attribute(trigger, "aria-haspopup") ?? ""}", expected "menu"`,
      );
    }
    if (attribute(trigger, "aria-expanded") !== "false") {
      problems.push(
        `menu: aria-expanded is "${attribute(trigger, "aria-expanded") ?? ""}" while closed, expected "false"`,
      );
    }
    if (!attribute(trigger, "aria-controls")) {
      problems.push("menu: the trigger has no aria-controls");
    } else if (!facts.controlled) {
      problems.push(
        `menu: aria-controls="${attribute(trigger, "aria-controls")}" names no element`,
      );
    } else if (attribute(facts.controlled, "role") !== "menu") {
      problems.push(
        `menu: aria-controls names a ${facts.controlled.description} with role "${attribute(facts.controlled, "role") ?? ""}", expected "menu"`,
      );
    }
  }

  if (!facts.palette) {
    problems.push('palette: no [data-chrome="palette"]');
  } else {
    const toolbar = facts.toolbar;
    if (!toolbar || attribute(toolbar, "role") !== "toolbar") {
      problems.push('palette: .djs-palette-entries has no role="toolbar"');
    } else if (!attribute(toolbar, "aria-label")) {
      problems.push("palette: the toolbar has no aria-label");
    }
    for (const entry of facts.entries) {
      const action = attribute(entry, "data-action") ?? entry.description;
      if (attribute(entry, "role") !== "button")
        problems.push(`palette: entry "${action}" has no role="button"`);
      if (!attribute(entry, "aria-label"))
        problems.push(`palette: entry "${action}" has no aria-label (title)`);
      const tabindex = attribute(entry, "tabindex");
      if (tabindex !== "0" && tabindex !== "-1") {
        problems.push(
          `palette: entry "${action}" has tabindex "${tabindex ?? ""}", expected roving 0/-1`,
        );
      }
    }
    const stops = facts.entries.filter((entry) => attribute(entry, "tabindex") === "0");
    if (facts.entries.length > 0 && stops.length !== 1) {
      problems.push(
        `palette: ${stops.length} entries with tabindex="0", expected exactly one (roving tabindex)`,
      );
    }
    const tools = facts.entries.filter(
      (entry) =>
        entry.group === "tools" && (attribute(entry, "data-action") ?? "").endsWith("-tool"),
    );
    for (const tool of tools) {
      const pressed = attribute(tool, "aria-pressed");
      if (pressed !== "true" && pressed !== "false") {
        problems.push(`palette: tool "${attribute(tool, "data-action")}" has no aria-pressed`);
      }
    }
    const pressed = tools.filter((tool) => attribute(tool, "aria-pressed") === "true");
    if (pressed.length > 1)
      problems.push(`palette: ${pressed.length} tools are aria-pressed at once`);
  }

  const zoom = facts.zoom;
  if (!zoom) {
    problems.push('zoom: no [data-chrome="zoom"]');
  } else {
    if (attribute(zoom, "role") !== "group") problems.push('zoom: the panel has no role="group"');
    if (!attribute(zoom, "aria-label")) problems.push("zoom: the panel has no aria-label");
    const shortcuts = expectedKeyShortcuts(facts.platform);
    for (const button of ["out", "actual", "in", "fit"] as const) {
      const control = facts.zoomButtons[button];
      if (!control) {
        problems.push(`zoom: no [data-zoom="${button}"] button`);
        continue;
      }
      if (control.tag !== "button")
        problems.push(`zoom: [data-zoom="${button}"] is a <${control.tag}>`);
      if (!name(control)) problems.push(`zoom: [data-zoom="${button}"] has no accessible name`);
      if (attribute(control, "aria-keyshortcuts") !== shortcuts[button]) {
        problems.push(
          `zoom: [data-zoom="${button}"] aria-keyshortcuts is "${attribute(control, "aria-keyshortcuts") ?? ""}", expected "${shortcuts[button]}" (${facts.platform})`,
        );
      }
      if (control.disabled) {
        problems.push(
          `zoom: [data-zoom="${button}"] is natively disabled; aria-disabled keeps the focus (guide §5.8)`,
        );
      }
    }
    const readout = facts.zoomButtons.actual;
    if (readout) {
      if (!/\d/.test(readout.text))
        problems.push(`zoom: the readout shows "${readout.text}", expected a percentage`);
      const label = normalize(attribute(readout, "aria-label") ?? "");
      if (!label.includes(readout.text)) {
        problems.push(
          `zoom: the readout's aria-label "${label}" does not name the current zoom "${readout.text}"`,
        );
      }
      if (attribute(readout, "aria-disabled") === "true")
        problems.push("zoom: the readout is never disabled");
    }
  }

  const present = new Set(facts.order);
  const expectedOrder = DOM_ORDER.filter((part) => present.has(part));
  if (facts.order.join() !== expectedOrder.join()) {
    problems.push(
      `DOM order is ${facts.order.join(", ")}; expected ${expectedOrder.join(", ")} (guide §5.14)`,
    );
  }
  if (!present.has("canvas"))
    problems.push("canvas: no diagram-js <svg> (.djs-container > svg) in the root");
  const canvas = facts.canvas;
  if (
    canvas &&
    !normalize(attribute(canvas, "aria-label") ?? "") &&
    !attribute(canvas, "aria-labelledby")
  ) {
    problems.push(
      'canvas: the focusable <svg> has no accessible name (WCAG 4.1.2); shellModule names it role="application" with messages.canvas',
    );
  }
  for (const element of facts.positiveTabindex)
    problems.push(`positive tabindex on ${element} (guide §5.14)`);
  for (const element of facts.titled) {
    problems.push(`${element} has a native title; the chrome tooltip replaces it (guide §5.6)`);
  }
  problems.push(...primaryAriaProblems(facts, host), ...legalAriaProblems(facts, host));
  return problems;
}

/** The optional islands once the harness showed them. */
export function optionalIslandProblems(facts: AriaFacts, shown: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (shown.has("problems")) {
    const pill = facts.problems;
    if (!pill?.visible) {
      problems.push("problems: the pill is not visible after show.problems");
    } else {
      if (pill.tag !== "button")
        problems.push(`problems: the pill is a <${pill.tag}>, expected a <button>`);
      const label = normalize(attribute(pill, "aria-label") ?? "");
      if (!label) problems.push("problems: the pill has no aria-label (count and errors)");
      else if (!label.includes(pill.text)) {
        problems.push(
          `problems: the aria-label "${label}" does not contain the visible text "${pill.text}"`,
        );
      }
    }
  }
  if (shown.has("status")) {
    const status = facts.status;
    if (!status?.visible) {
      problems.push("status: the status box is not visible after show.status");
    } else {
      const role = attribute(status, "role");
      const severity = attribute(status, "data-severity");
      const expected = severity === "danger" ? "alert" : "status";
      if (role !== expected) {
        problems.push(
          `status: role is "${role ?? ""}" for data-severity="${severity ?? ""}", expected "${expected}"`,
        );
      }
    }
  }
  if (shown.has("legend")) {
    const legend = facts.legend;
    if (!legend?.visible) {
      problems.push("legend: the legend is not visible after show.legend");
    } else {
      if (!facts.legendTitle)
        problems.push("legend: the card is not labelled by its title (aria-labelledby)");
      if (!facts.legendClose || !attribute(facts.legendClose, "aria-label")) {
        problems.push("legend: the close button has no aria-label");
      }
    }
  }
  if (shown.has("inspector")) {
    const inspector = facts.inspector;
    if (!inspector?.visible) {
      problems.push("inspector: the inspector is not visible after show.inspector");
    } else {
      if (inspector.tag !== "aside")
        problems.push(`inspector: a <${inspector.tag}>, expected an <aside>`);
      if (!attribute(inspector, "aria-label"))
        problems.push("inspector: the <aside> has no aria-label");
    }
  }
  return problems;
}

/** One Tab stop as the kit's tab-sequence probe saw it. */
export interface TabStop {
  description: string;
  /** What the stop is: the palette's roving entry, the canvas `<svg>`, the web app's primary action. */
  kind: "palette" | "canvas" | "primary" | "other";
}

/**
 * Tab from the menu trigger (guide §5.14): the primary action (web app), the palette's one tab
 * stop, then the canvas `<svg>`; nothing else in between (a renderer's own `tabindex` on
 * `.djs-container` would be an extra, unnamed stop). With `primary` the web app shows one, and
 * Tab from the trigger lands on it first.
 */
export function tabSequenceProblems(stops: readonly TabStop[], primary = false): string[] {
  const [first, second, third] = stops;
  const sequence = first?.kind === "primary" ? [second, third] : [first, second];
  const [palette, canvas] = sequence;
  const problems: string[] = [];
  if (primary && first?.kind !== "primary") {
    problems.push(
      `tab order: Tab from the menu trigger lands on ${first?.description ?? "nothing"}, expected the primary action (top left, top right, top centre, guide §5.14)`,
    );
  }
  if (palette?.kind !== "palette") {
    problems.push(
      `tab order: Tab from the menu trigger lands on ${palette?.description ?? "nothing"}, expected the palette's roving entry (guide §5.14)`,
    );
  } else if (canvas?.kind !== "canvas") {
    problems.push(
      `tab order: Tab from the palette lands on ${canvas?.description ?? "nothing"}, expected the canvas <svg> (an unexpected tab stop, guide §5.14)`,
    );
  }
  return problems;
}

/** One activation of a chrome control by the kit and where the focus went afterwards. */
export interface FocusHandBackStep {
  /** The control as a problem names it: "zoom in", "palette tool \"lasso-tool\"". */
  control: string;
  /** A pointer click, or the key that activated the focused control. */
  by: "pointer" | "Enter" | "Space";
  /** `focus.control` tells whether the focus is on the control, or for a menu entry on the trigger. */
  focus: FocusPlaceFacts;
  /** A menu entry: Enter and Space return the focus to the menu trigger (guide §5.4). */
  menuEntry?: boolean;
  /** The web app's primary action (guide §5.7): Enter and Space leave the focus on the button. */
  primaryAction?: boolean;
}

/**
 * Guide §5.8: after a pointer click on chrome that acts on the canvas the focus is on the canvas
 * `<svg>`, so Delete, the arrows and undo act at once; after Enter or Space it stays on the control,
 * so a keyboard user can press again, and for a menu entry it returns to the trigger (§5.4).
 */
export function focusHandBackProblems(steps: readonly FocusHandBackStep[]): string[] {
  return steps.flatMap(({ control, by, focus, menuEntry, primaryAction }) => {
    const guide = `${menuEntry ? "§5.4, " : ""}${primaryAction ? "§5.7, " : ""}§5.8`;
    if (by === "pointer") {
      return focus.canvas
        ? []
        : [
            `focus: after a click on ${control} the focus is on ${focus.focused}, expected the canvas <svg>, so its keys act at once (guide ${guide})`,
          ];
    }
    if (focus.control) return [];
    return [
      menuEntry
        ? `focus: after ${by} on ${control} the focus is on ${focus.focused}, expected the menu trigger, where the keyboard left the menu (guide §5.4)`
        : `focus: after ${by} on ${control} the focus is on ${focus.focused}, expected it to stay on ${control}, so the next press acts again (guide ${guide})`,
    ];
  });
}

/**
 * The File and Model entries guide §5.4 hands to the canvas after a pointer click: an enabled,
 * non-destructive `menuitem` that opens no dialog in the modeler (`aria-haspopup="dialog"`).
 */
export function isCanvasMenuAction(entry: MenuEntryFacts): boolean {
  return (
    entry.role === "menuitem" &&
    (entry.group === "file" || entry.group === "model") &&
    entry.menuId !== null &&
    entry.popup !== "dialog" &&
    !entry.disabled &&
    !entry.danger
  );
}

/** The legend right after `open`, without a stored state (guide §5.10). */
export interface LegendStartFacts {
  container: Size;
  /** The root carries `data-legend="open"` or the card is visible. */
  open: boolean;
}

/**
 * Guide §5.10: without a stored state the legend starts closed in every container (product decision
 * of 2026-10-24, which replaced 0.4's open above 440px width and 820px height).
 */
export function legendStartProblems(facts: LegendStartFacts): string[] {
  if (!facts.open) return [];
  const at = `${Math.round(facts.container.width)} × ${Math.round(facts.container.height)}`;
  return [
    `legend: open on first load in a ${at} container; without a stored state it starts closed in every container, and only a stored legend.open opens it on mount (guide §5.10)`,
  ];
}

/**
 * `legendStart` needs a new document per `open`: the shell decides the legend's start state once per
 * mount, so in a kept page the second size would read the first one's state.
 */
export function keptDocumentProblems(size: Size, kept: boolean): string[] {
  if (!kept) return [];
  return [
    `harness: open kept the page's document at ${size.width} × ${size.height} (a navigation that changes only the URL fragment keeps it), so the shell did not mount again and the legend kept its earlier start state; open loads a new document, as on a first visit (for example after page.goto("about:blank"))`,
  ];
}

/** A palette entry with the keyboard focus: its tooltip's chip and what it names for assistive technology. */
export interface PaletteShortcutFacts {
  action: string;
  /** Text of the visible tooltip's `kbd` chip; empty without a chip. */
  chip: string;
  keyShortcuts: string | null;
}

/**
 * Guide §5.6: an entry whose tooltip shows a shortcut carries `aria-keyshortcuts`, which names keys
 * (`shortcutChipProblems`).
 */
export function paletteShortcutProblems(entries: readonly PaletteShortcutFacts[]): string[] {
  return entries.flatMap((entry) => {
    const where = `palette: entry "${entry.action}"`;
    const problems = shortcutChipProblems(where, entry.chip, entry.keyShortcuts);
    if (problems.length > 0 || !entry.chip || entry.keyShortcuts) return problems;
    return [
      `${where} shows the shortcut "${entry.chip}" in its tooltip but has no aria-keyshortcuts (guide §5.6)`,
    ];
  });
}

/**
 * The keys an open menu consumes (↑ ↓ Home End, a letter) never reach a `keydown` listener on
 * `document`: a modeler's document keyboard would act on them (Event Storming moves the selection
 * on ↑/↓).
 */
export function menuKeysAtDocumentProblems(
  pressed: readonly string[],
  documentKeys: readonly RecordedKey[],
): string[] {
  const reached = new Set(documentKeys.map((key) => key.key));
  return pressed
    .filter((key) => reached.has(key))
    .map(
      (key) =>
        `menu: ${key} in the open menu reached a keydown listener on document; a modeler's document keyboard acts on it (stop it at the menu, guide §5.4)`,
    );
}

/**
 * An open menu (guide §5.4): expanded trigger, labelled `role="menu"`, named items, shortcut chips
 * that assistive technology hears, by keys and not characters (§5.6), focus.
 */
export function menuOpenProblems(facts: MenuFacts, focus?: "first" | "last"): string[] {
  const problems: string[] = [];
  if (facts.expanded !== "true") {
    problems.push(`menu: aria-expanded is "${facts.expanded ?? ""}" while open, expected "true"`);
  }
  const menu = facts.menu;
  if (!menu) return [...problems, 'menu: no visible role="menu" after opening'];
  if (!attribute(menu, "aria-label")) problems.push("menu: the dropdown has no aria-label");
  if (facts.controls && attribute(menu, "id") !== facts.controls) {
    problems.push(
      `menu: the visible dropdown is #${attribute(menu, "id") ?? ""}, the trigger controls #${facts.controls}`,
    );
  }
  if (facts.items.length === 0) problems.push("menu: the dropdown has no menuitem");
  facts.items.forEach((item, index) => {
    const label = item.name || `item ${index + 1}`;
    if (!item.name) problems.push(`menu: ${label} has no accessible name`);
    if (item.role !== "menuitem" && item.checked !== "true" && item.checked !== "false") {
      problems.push(`menu: "${label}" (${item.role}) has aria-checked "${item.checked ?? ""}"`);
    }
    if (item.role === "menuitemradio" && !item.group) {
      problems.push(`menu: radio "${label}" is not in a labelled role="group"`);
    }
    if (item.haspopup === "dialog" && !item.name.endsWith("…")) {
      problems.push(`menu: "${label}" opens a dialog, so its label ends with "…" (U+2026)`);
    }
    if (item.shortcut && !item.keyShortcuts && !item.description.includes(item.shortcut)) {
      problems.push(
        `menu: "${label}" shows the shortcut "${item.shortcut}" but names it neither in aria-keyshortcuts nor in its description (guide §5.6)`,
      );
    }
    problems.push(...shortcutChipProblems(`menu: "${label}"`, item.shortcut, item.keyShortcuts));
  });
  if (focus && facts.items.length > 0) {
    const expected = focus === "first" ? 0 : facts.items.length - 1;
    if (facts.active !== expected) {
      problems.push(
        `menu: focus is on ${facts.active < 0 ? "no entry" : `entry ${facts.active + 1}`}, expected the ${focus} entry`,
      );
    }
  }
  return problems;
}

export function menuClosedProblems(facts: MenuFacts, focusOnTrigger: boolean): string[] {
  const problems: string[] = [];
  if (facts.expanded !== "false")
    problems.push(`menu: aria-expanded is "${facts.expanded ?? ""}" after closing`);
  if (facts.menu) problems.push("menu: the dropdown is still visible after Escape");
  if (focusOnTrigger && !facts.activeIsTrigger)
    problems.push("menu: Escape did not return the focus to the trigger");
  return problems;
}

/**
 * How a key press must arrive at a `keydown` listener on `window` (guide §5.8, §13.5):
 * - `handled`: the shell executes it; IDE: stopped, else it arrives prevented;
 * - `blocked`: recognized but not executed (text field, modal, Escape with a dialog); IDE: stopped,
 *   else it arrives unprevented (the browser, the field or the dialog acts);
 * - `canvas`: the canvas handled it (`defaultPrevented`); IDE: stopped, else it arrives prevented;
 * - `free`: nobody may handle it; it arrives unprevented in every host.
 * In the IDE host a stopped key never reaches `window`, so `prevented` is read on `document`.
 */
export type KeyReach = "handled" | "blocked" | "canvas" | "free";

export interface SeenKeys {
  /** What a listener on `window` saw. */
  keys: readonly RecordedKey[];
  /** What a listener on `document`, registered after the shell's, saw. */
  documentKeys?: readonly RecordedKey[];
}

export function keyReachProblem(
  press: string,
  reach: KeyReach,
  host: ShellHost,
  seen: SeenKeys,
): string | undefined {
  const shouldPrevent = reach === "handled" || reach === "canvas";
  if (host === "ide" && reach !== "free") {
    if (seen.keys.length > 0) {
      return `${press} reached a keydown listener on window; in the IDE host the shell stops it on document, or VS Code runs it again (guide §13.5)`;
    }
    const atDocument = seen.documentKeys ?? [];
    const prevented = atDocument.length === 1 ? atDocument[0]?.defaultPrevented : undefined;
    if (prevented === true && !shouldPrevent) {
      return `${press} was prevented; the shell only stops it, so the field, dialog or browser still acts (guide §13.5)`;
    }
    if (prevented === false && shouldPrevent) {
      return `${press} was stopped but not prevented; a handled key also calls preventDefault`;
    }
    return undefined;
  }
  if (seen.keys.length === 0) {
    return host === "ide"
      ? `${press} never reached window; keys the webview does not handle must go on to VS Code (guide §13.5)`
      : `${press} never reached window; outside the IDE host the shell never stops propagation`;
  }
  if (seen.keys.length > 1) return `${press} reached window ${seen.keys.length} times`;
  const prevented = seen.keys[0]?.defaultPrevented ?? false;
  if (prevented && !shouldPrevent) {
    return `${press} arrived prevented; ${reach === "free" ? "nothing may handle it" : "the browser, the field or the dialog must act"}`;
  }
  if (!prevented && shouldPrevent) {
    return `${press} arrived unprevented; a handled key calls preventDefault (the browser would zoom the page)`;
  }
  return undefined;
}

/** The decision of guide §13.5, computed independently of the shell under test. */
export function expectedAppearance(requested: Appearance, themes: readonly Theme[]): Appearance {
  const fallback = themes[0];
  if (fallback === undefined)
    throw new Error("@miragon/modeler-shell conformance: harness.themes is empty");
  const theme = themes.includes(requested.theme) ? requested.theme : fallback;
  return requested.kontrast ? { theme, kontrast: requested.kontrast } : { theme };
}

const describeAppearance = (appearance: Appearance): string =>
  appearance.kontrast ? `${appearance.theme} + ${appearance.kontrast}` : appearance.theme;

export interface AppearanceVerdict {
  problems: string[];
}

/**
 * What an embedded root must show (guide §13.3): its first mode whatever the page shows, the one a
 * light-only renderer draws for any request through the contract's `appearance` surface
 * (`@miragon/modeler-api` 1.5), with the page's high contrast taken over from the nearest mode
 * carrier above it.
 */
export function expectedEmbeddedAppearance(
  facts: AppearanceFacts,
  themes: readonly Theme[],
): Appearance {
  const fallback = themes[0];
  if (fallback === undefined)
    throw new Error("@miragon/modeler-shell conformance: harness.themes is empty");
  const host = facts.themed.filter((element) => element.relation === "ancestor").at(-1);
  return host?.kontrast === "hoch" ? { theme: fallback, kontrast: "hoch" } : { theme: fallback };
}

/**
 * The web app's own expectation (guide §13.3): `<html>` carries `carrier` (`system` for a
 * dark-capable modeler without a stored choice) and the page shows `effective` under the emulated
 * system preference.
 */
export interface WebModeExpectation {
  carrier: string;
  effective: Appearance;
}

/** No half-dark (guide §13.3, §13.5): one mode on `<html>` (own document) or the root (embedded). */
export function appearanceProblems(
  facts: AppearanceFacts,
  host: ShellHost,
  requested: Appearance,
  themes: readonly Theme[],
  web?: WebModeExpectation,
): AppearanceVerdict {
  const ownDocument = host !== "embedded";
  const expected =
    web?.effective ??
    (ownDocument
      ? expectedAppearance(requested, themes)
      : expectedEmbeddedAppearance(facts, themes));
  const carrierTheme = web?.carrier ?? expected.theme;
  const problems: string[] = [];
  const described =
    carrierTheme === expected.theme
      ? describeAppearance(expected)
      : `${carrierTheme} showing ${describeAppearance(expected)}`;
  const label = ownDocument
    ? `requested ${describeAppearance(requested)}, expected ${described}`
    : `host page ${describeAppearance(requested)}, expected ${described}`;

  const carrier = ownDocument
    ? facts.themed.find((element) => element.isDocument && element.theme !== null)
    : facts.themed.find((element) => element.relation === "self" && element.theme !== null);
  if (!carrier) {
    problems.push(
      ownDocument
        ? `<html> has no data-cd-theme (${label}); the host always writes it, also "light" (guide §13.3)`
        : `the embedded root has no data-cd-theme (${label}): it takes the host page's mode instead of its own (guide §13.3)`,
    );
  } else {
    if (carrier.theme !== carrierTheme) {
      problems.push(`${carrier.description} has data-cd-theme="${carrier.theme}" (${label})`);
    }
    if ((carrier.kontrast ?? undefined) !== expected.kontrast) {
      problems.push(
        `${carrier.description} has ${carrier.kontrast ? `data-cd-kontrast="${carrier.kontrast}"` : "no data-cd-kontrast"} (${label})`,
      );
    }
  }
  for (const element of facts.themed) {
    if (element === carrier) continue;
    const stray = ownDocument
      ? !element.isDocument || element.theme === null
      : element.relation === "descendant" || element.relation === "self";
    if (!stray) continue;
    const values = [
      element.theme !== null ? `data-cd-theme="${element.theme}"` : "",
      element.kontrast !== null ? `data-cd-kontrast="${element.kontrast}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const sameMode =
      carrier !== undefined &&
      element.theme === carrier.theme &&
      element.kontrast === carrier.kontrast;
    problems.push(
      element.theme === null
        ? `${element.description} carries ${values} without data-cd-theme on the same element (guide §13.3)`
        : sameMode
          ? `${element.description} repeats ${values}: in an own document the attributes stand only on <html> (guide §13.5)`
          : `${element.description} carries ${values}: a second mode inside the modeler is half-dark (guide §13.5)`,
    );
  }

  if (ownDocument && !facts.documentClasses.includes("cd-shell-document")) {
    problems.push(
      "<html> lacks cd-shell-document in an own document (the reset of the webview's host styles)",
    );
  }
  if (!ownDocument && facts.documentClasses.includes("cd-shell-document")) {
    problems.push(
      "<html> of a foreign page carries cd-shell-document: the own-document reset restyles the host page",
    );
  }

  const reference = facts.parts[0];
  if (reference && !reference.roles["--cd-ui-text"]) {
    problems.push(
      "--cd-ui-text is empty at the shell root: the vendored cd-tokens.generated.css is not loaded",
    );
  }
  for (const part of facts.parts) {
    const schemes = part.colorScheme.split(/\s+/);
    const dark = schemes.includes("dark");
    const light = schemes.includes("light");
    if (expected.theme === "light" && (dark || (carrier && !light))) {
      problems.push(`${part.name}: color-scheme is "${part.colorScheme}" (${label})`);
    }
    if (expected.theme === "dark" && (!dark || light)) {
      problems.push(`${part.name}: color-scheme is "${part.colorScheme}" (${label})`);
    }
    if (reference && part !== reference) {
      for (const [role, value] of Object.entries(part.roles)) {
        if (value !== reference.roles[role]) {
          problems.push(
            `${part.name}: ${role} resolves to "${value}", the root to "${reference.roles[role] ?? ""}" (half-dark)`,
          );
        }
      }
    }
  }
  for (const required of ["dropdown", "tooltip"]) {
    if (!facts.parts.some((part) => part.name === required)) {
      problems.push(`${required}: not visible when the kit opened it, so its mode was not checked`);
    }
  }
  return { problems };
}

/** The root attributes the shell writes (API.md, DOM; the web host's state attributes included). */
const SHELL_ROOT_ATTRIBUTES = [
  "data-cd-shell-host",
  "data-palette",
  "data-legend",
  "data-inspector",
  "data-problems",
  "data-readonly",
  "data-primary",
  "data-zoom-row",
  "data-empty-state",
  "data-drop",
];

/** What an embedded root carries on top (its own mode). */
const EMBEDDED_ROOT_ATTRIBUTES = ["data-cd-theme", "data-cd-kontrast"];

/** Messages of benign browser reports that are no shell error. */
const BENIGN_ERRORS = /ResizeObserver loop/;

/** Nothing of the shell remains after `destroy` (API.md, `destroy()`). */
export function leftoverProblems(facts: LeftoverFacts, host: ShellHost): string[] {
  const problems: string[] = [];
  for (const element of facts.classedElements) problems.push(`${element} is left after destroy`);
  const ownDocument = host !== "embedded";
  for (const name of facts.documentClasses) {
    if (ownDocument && name === "cd-shell-document") continue;
    problems.push(`<html> keeps the class ${name} after destroy`);
  }
  for (const element of facts.chromeElements) problems.push(`${element} is left after destroy`);
  for (const name of facts.rootClasses)
    problems.push(`the root keeps the class ${name} after destroy`);
  const written = ownDocument
    ? SHELL_ROOT_ATTRIBUTES
    : [...SHELL_ROOT_ATTRIBUTES, ...EMBEDDED_ROOT_ATTRIBUTES];
  for (const name of facts.rootAttributes) {
    if (written.includes(name)) problems.push(`the root keeps ${name} after destroy`);
  }
  for (const error of facts.errors) {
    if (!BENIGN_ERRORS.test(error))
      problems.push(`the page reported an error after destroy: ${error}`);
  }
  return problems;
}

/** After `destroy` no listener of the shell may act on a chrome key any more. */
export function afterDestroyKeyProblem(
  press: string,
  recorded: readonly RecordedKey[],
): string | undefined {
  if (recorded.length === 0)
    return `${press} after destroy never reached window: a shell listener still stops it`;
  if (recorded.some((key) => key.defaultPrevented)) {
    return `${press} after destroy arrived prevented: a shell listener is still installed`;
  }
  return undefined;
}

/** The islands a harness may list as `absent`, as far as `geometry` and `aria` see them. */
export type AbsentIsland = Extract<ShowHook, "legend" | "inspector" | "problems" | "status">;

const ABSENT_ISLANDS: readonly AbsentIsland[] = ["legend", "inspector", "problems", "status"];

/** The islands of `absent` (its state `invalid` has no island). */
export function absentIslands(absent: readonly AbsentFeature[] | undefined): AbsentIsland[] {
  return ABSENT_ISLANDS.filter((island) => absent?.includes(island));
}

/** An island the harness declares absent must never show. */
export function absentIslandProblems(
  visible: ReadonlySet<string>,
  absent: readonly AbsentFeature[] | undefined,
): string[] {
  return absentIslands(absent)
    .filter((island) => visible.has(island))
    .map((island) => `${island}: visible, but harness.absent says the modeler has no ${island}`);
}

/** A hook the harness both gives and lists as absent is a contradiction in the harness itself. */
export function harnessHookProblems<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  hooks: readonly AbsentFeature[],
): string[] {
  return hooks
    .filter((hook) =>
      hook === "drop" || hook === "labelEditor"
        ? harness.absent?.includes(hook) && harness[hook]
        : hook !== "problemSelection" &&
          hook !== "canvasMenuAction" &&
          harness.absent?.includes(hook) &&
          harness.show?.[hook],
    )
    .map((hook) =>
      hook === "drop" || hook === "labelEditor"
        ? `harness: absent lists "${hook}", but harness.${hook} is given`
        : `harness: absent lists "${hook}", but show.${hook} is given`,
    );
}

/** Guide §10.1: the surround of the canvas is a container painted in `--cd-ui-grund`, in both modes. */
export function surroundProblems(facts: SurroundFacts): string[] {
  if (!facts.container) return ["canvas surround: no .djs-container in the root to check"];
  if (!facts.painted) {
    return [
      "canvas surround: nothing from .djs-container out to the root paints a background colour; the surround is var(--cd-ui-grund) (guide §10.1)",
    ];
  }
  if (facts.painted.color === facts.grund) return [];
  return [
    `canvas surround: ${facts.painted.description} paints ${facts.painted.color}, but --cd-ui-grund resolves to ${facts.grund}; the surround follows the mode (guide §10.1)`,
  ];
}

/** Lasso, Hand and the other tools of the `tools` group; every other entry is a notation preview. */
export function isToolEntry(entry: Pick<PaletteEntryState, "action" | "group">): boolean {
  return entry.group === "tools" || entry.action.endsWith("-tool");
}

function paletteEntryState(entry: PaletteColorEntry): string {
  if (entry.disabled) return "aria-disabled";
  if (entry.hovered) return entry.pressed ? "pressed and hovered" : "hovered";
  return entry.pressed ? "pressed" : "at rest";
}

/**
 * Guide §5.5 and §13.5: a tool entry and its icon (`currentColor`) show `--cd-ui-text` at rest and
 * while pressed, `--cd-ui-interaktion` while hovered and `--cd-ui-text-leise` while aria-disabled.
 * Notation previews keep their own colours and are exempt.
 */
export function paletteColorProblems(facts: PaletteColorFacts): string[] {
  const problems: string[] = [];
  for (const entry of facts.entries) {
    if (!isToolEntry(entry)) continue;
    const [role, value] = entry.disabled
      ? (["--cd-ui-text-leise", facts.roles.textLeise] as const)
      : entry.hovered
        ? (["--cd-ui-interaktion", facts.roles.interaktion] as const)
        : (["--cd-ui-text", facts.roles.text] as const);
    const state = paletteEntryState(entry);
    if (entry.color !== value) {
      problems.push(
        `palette: tool "${entry.action}" ${state} has color ${entry.color}, expected ${role} (${value}) (guide §5.5)`,
      );
    }
    if (entry.icon && entry.icon.color !== value) {
      const icon = entry.icon.kind === "svg" ? "<svg> icon" : "::before icon";
      problems.push(
        `palette: the ${icon} of tool "${entry.action}" ${state} has color ${entry.icon.color}, expected ${role} (${value}); a renderer rule overrides the skin (guide §5.5)`,
      );
    }
  }
  return problems;
}

export interface CreateFacts {
  /** `data-action` of the entry the kit pressed Enter on. */
  entry: string;
  before: readonly ShapeFacts[];
  after: readonly ShapeFacts[];
  canvas: CanvasStateFacts;
  /** The free rectangle when Enter was pressed (guide §5.9). */
  free: Rectangle;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Guide §5.5: Enter on a creating entry places exactly one element in the centre of the free
 * rectangle, selects it and puts the focus on the canvas (its `<svg>` or the label editor).
 */
export function createProblems(facts: CreateFacts): string[] {
  const known = new Set(facts.before.map((shape) => shape.id));
  const added = facts.after.filter((shape) => !known.has(shape.id));
  const pressed = `Enter on palette entry "${facts.entry}"`;
  if (added.length === 0) {
    return [
      `create: ${pressed} added no element; Enter on a creating entry places it in the centre of the free rectangle (guide §5.5)`,
    ];
  }
  if (added.length > 1) {
    return [
      `create: ${pressed} added ${added.length} elements (${added.map((shape) => shape.id).join(", ")}), expected exactly one`,
    ];
  }
  const [shape] = added as [ShapeFacts];
  const problems: string[] = [];
  if (!shape.selected)
    problems.push(`create: the new element "${shape.id}" is not selected (guide §5.5)`);
  if (!facts.canvas.focusInCanvas) {
    problems.push(
      `create: after ${pressed} the focus is on ${facts.canvas.focused}, expected the canvas (its <svg> or the label editor, guide §5.5)`,
    );
  }
  const centre = {
    x: shape.box.left + shape.box.width / 2,
    y: shape.box.top + shape.box.height / 2,
  };
  const { free } = facts;
  const tolerance = GEOMETRY_TOLERANCE_PX + 1e-6;
  const inside =
    centre.x >= free.left - tolerance &&
    centre.x <= free.right + tolerance &&
    centre.y >= free.top - tolerance &&
    centre.y <= free.bottom + tolerance;
  if (!inside) {
    problems.push(
      `create: the new element "${shape.id}" is centred at (${round(centre.x)}, ${round(centre.y)})px, outside the free rectangle ${round(free.left)}–${round(free.right)} × ${round(free.top)}–${round(free.bottom)}px (guide §5.5, §5.9)`,
    );
  }
  return problems;
}

/** The focused field holds the typed text. */
function holdsTyped(facts: LabelEditorFacts, typed: string): boolean {
  return facts.editing && facts.text.includes(typed);
}

/** Right after `labelEditor.open`: the editor has the focus and the typed text, and nothing changed yet. */
export function labelEditorOpenProblems(
  typed: string,
  facts: LabelEditorFacts,
  documentChanged: boolean,
): string[] {
  const problems: string[] = [];
  if (typed === "") {
    problems.push("label editor: labelEditor.open typed nothing, so the case would prove nothing");
  } else if (!facts.editing) {
    problems.push(
      `label editor: after labelEditor.open the focus is on ${facts.focused}, expected the label editor (a text field) holding "${typed}"`,
    );
  } else if (!holdsTyped(facts, typed)) {
    problems.push(
      `label editor: after labelEditor.open the focused field holds "${facts.text}", expected the typed "${typed}"`,
    );
  }
  if (documentChanged) {
    problems.push(
      "label editor: labelEditor.documentChanged reports a change right after labelEditor.open; typing alone changes no document, so it counts from the moment open resolved",
    );
  }
  return problems;
}

/** One view change the shell made over the open label editor, and what it left. */
export interface LabelEditorStepFacts {
  /** What the kit did ("a click on Fit", "Shift+1 on the canvas"). */
  step: string;
  /** What `labelEditor.open` typed. */
  typed: string;
  /** The view before the step (`LabelEditorFacts.view`). */
  viewBefore: string | null;
  after: LabelEditorFacts;
  /** `labelEditor.documentChanged` after the step. */
  documentChanged: boolean;
}

/**
 * A view change the host makes never commits the open label editor (contract L5), and it leaves the
 * editor open with the typed text: L5 only recommends that, the shell kit requires it.
 */
export function labelEditorStepProblems(facts: LabelEditorStepFacts): string[] {
  const { step, typed, after } = facts;
  const problems: string[] = [];
  if (after.view === null || after.view === facts.viewBefore) {
    problems.push(
      `label editor: ${step} left the view as it was, so it proved nothing about a view change`,
    );
  }
  if (facts.documentChanged) {
    problems.push(
      `label editor: ${step} committed the open label editor (labelEditor.documentChanged); a view change the host makes never commits it (contract L5)`,
    );
  } else if (!after.editing) {
    problems.push(
      `label editor: after ${step} the focus is on ${after.focused}, not in the label editor; it stays open with the typed "${typed}" (L5 recommends it, the shell kit requires it)`,
    );
  } else if (!holdsTyped(after, typed)) {
    problems.push(
      `label editor: after ${step} the focused field holds "${after.text}", expected the typed "${typed}" (L5 recommends it, the shell kit requires it)`,
    );
  }
  return problems;
}

/**
 * Whether `view` (`LabelEditorFacts.view`, the viewport layer's matrix as six numbers) shows 100 %
 * as the shell's Cmd/Ctrl+0 reads it, the one view it leaves as it is: both scales exactly 1 in
 * the probe's three decimals, the rounding of diagram-js's `canvas.zoom()`. `false` for a view
 * that is no such matrix.
 */
export function isViewAtActualSize(view: string | null): boolean {
  const values = view?.trim().split(/\s+/).map(Number) ?? [];
  if (values.length !== 6 || !values.every(Number.isFinite)) return false;
  const [scaleX, , , scaleY] = values;
  return scaleX === 1 && scaleY === 1;
}

/**
 * After every step kept the editor open: the user's own commit, a click on an empty spot of the
 * canvas, must show in `labelEditor.documentChanged`, or the steps proved nothing.
 */
export function labelEditorCommitProblems(documentChanged: boolean): string[] {
  return documentChanged
    ? []
    : [
        "label editor: a click on an empty spot of the canvas after the view changes left labelEditor.documentChanged false, so the case proved nothing; open types text the element's label does not hold yet, and documentChanged reports the commit a click elsewhere makes",
      ];
}

/** The read-only marks once the invalid-file state shows (guide §5.12, §13.5). */
export function readOnlyStateProblems(facts: ReadOnlyStateFacts): string[] {
  const problems: string[] = [];
  const after = `${INVALID_STATUS_DELAY_MS}ms after show.invalid`;
  if (!facts.readOnly) problems.push(`read-only: the root has no data-readonly ${after}`);
  const status = facts.status;
  if (!status?.visible) {
    problems.push(`read-only: the status box is not visible ${after} (guide §5.12)`);
  } else if (status.attributes.role !== "alert") {
    problems.push(
      `read-only: the status box of an invalid file has role "${status.attributes.role ?? ""}", expected "alert" (guide §13.5)`,
    );
  }
  return problems;
}

/** The palette entries that stay active on a read-only canvas (guide §13.5), named independently of the shell. */
export const READ_ONLY_PALETTE_ACTIONS: readonly string[] = ["lasso-tool", "hand-tool"];

/** Guide §13.5: every palette entry that changes something is aria-disabled, Lasso and Hand stay active. */
export function readOnlyPaletteProblems(entries: readonly PaletteEntryState[]): string[] {
  return entries.flatMap((entry) => {
    const staysActive = READ_ONLY_PALETTE_ACTIONS.includes(entry.action);
    if (staysActive && entry.disabled) {
      return [
        `palette: "${entry.action}" is aria-disabled on the read-only canvas; Lasso and Hand stay active (guide §13.5)`,
      ];
    }
    if (!staysActive && !entry.disabled) {
      return [
        `palette: "${entry.action}" is not aria-disabled on the read-only canvas (guide §13.5)`,
      ];
    }
    return [];
  });
}

/** The shell's own Legend toggle in the Model group. */
const LEGEND_MENU_ID = "legend";

/**
 * Guide §13.5 and the product decision on view toggles: on a read-only canvas the Legend toggle,
 * export and help stay usable. The shell renders its `MenuGroups` as Model, Export, Help, empty
 * groups left out, so only the first group can be Model: an entry in a later one that read-only
 * newly disabled is a problem.
 */
export function readOnlyMenuProblems(
  before: readonly MenuEntryFacts[],
  after: readonly MenuEntryFacts[],
): string[] {
  const problems: string[] = [];
  const key = (entry: MenuEntryFacts) => `${entry.menuId ?? ""}\u0000${entry.name}`;
  const enabledBefore = new Set(before.filter((entry) => !entry.disabled).map(key));
  for (const entry of after) {
    if (!entry.disabled) continue;
    if (entry.menuId === LEGEND_MENU_ID && entry.role === "menuitemcheckbox") {
      problems.push(
        "menu: the Legend toggle is aria-disabled on the read-only canvas; a view-only toggle stays usable (guide §13.5)",
      );
    } else if (entry.group !== "model" && enabledBefore.has(key(entry))) {
      problems.push(
        `menu: "${entry.name}" is aria-disabled on the read-only canvas; export and help stay usable (guide §13.5)`,
      );
    }
  }
  return problems;
}

/** What the read-only lock must keep from a shape (guide §13.5): no context pad, move, resize, delete or label editor. */
export interface LockedShapeFacts {
  /** Context-pad entries visible after clicking the shape. */
  contextPadEntries: readonly string[];
  /** The shape before and after a 40px drag (`undefined`: gone). */
  dragged: { before: ShapeFacts; after: ShapeFacts | undefined };
  /** Text fields inside `.djs-container` after a double-click on the shape. */
  textFields: readonly string[];
  /** Whether the shape is still there after Delete, then after Backspace. */
  kept: { Delete: boolean; Backspace: boolean };
}

export function lockedShapeProblems(facts: LockedShapeFacts): string[] {
  const problems: string[] = [];
  const { before, after } = facts.dragged;
  if (facts.contextPadEntries.length > 0) {
    problems.push(
      `read-only: selecting "${before.id}" shows the context pad (${facts.contextPadEntries.join(", ")}) (guide §13.5)`,
    );
  }
  if (!after) {
    problems.push(`read-only: a 40px drag removed "${before.id}" from the canvas (guide §13.5)`);
  } else if (
    after.transform !== before.transform ||
    Math.abs(after.size.width - before.size.width) > 0.5 ||
    Math.abs(after.size.height - before.size.height) > 0.5
  ) {
    problems.push(
      `read-only: a 40px drag changed "${before.id}" (transform "${before.transform}" → "${after.transform}", ${round(before.size.width)} × ${round(before.size.height)} → ${round(after.size.width)} × ${round(after.size.height)}) (guide §13.5)`,
    );
  }
  if (facts.textFields.length > 0) {
    problems.push(
      `read-only: a double-click on "${before.id}" opens a text field (${facts.textFields.join(", ")}) (guide §13.5)`,
    );
  }
  for (const key of ["Delete", "Backspace"] as const) {
    if (!facts.kept[key])
      problems.push(`read-only: ${key} on the canvas deleted "${before.id}" (guide §13.5)`);
  }
  return problems;
}

/**
 * Guide §5.13: the highest `z-index` an overlay that stays in the canvas may take (a toolbar, its
 * own context pad, a prompt, the label editor), under the palette at 110.
 */
export const OVERLAY_LAYER_LIMIT = 100;

/** The canvas layers above `OVERLAY_LAYER_LIMIT` in one state, before and after a zoom. */
export interface OverlayLayerFacts {
  /** Where the kit looked: `as opened`, `with "box" selected`, `after a click on context-pad entry "note"`. */
  state: string;
  /** The palette's `z-index`. */
  palette: number | null;
  /** The layers above the limit in that state. */
  before: readonly CanvasLayerFacts[];
  /**
   * What the kit saw of them while it watched after a zoom at the canvas changed the view; `null`
   * when no zoom key did.
   */
  afterZoom: {
    /** Layers that never closed. */
    stays: readonly CanvasLayerFacts[];
    /** Layers that closed and showed again (on diagram-js's late `canvas.viewbox.changed`). */
    back: readonly CanvasLayerFacts[];
  } | null;
}

/**
 * Guide §5.13: above the palette lie only popups a user opens briefly, which close on a pan or zoom
 * (and tooltips while the pointer rests, which the kit parks away). A layer above the limit that is
 * still there after the view zoomed, or that only hid while the view changed, stays, and so must
 * lie at the limit or below.
 */
export function overlayLayerProblems(facts: OverlayLayerFacts): string[] {
  if (facts.before.length === 0) return [];
  const listed = facts.before
    .map((layer) => `${layer.description} at z-index ${layer.zIndex}`)
    .join(", ");
  if (facts.afterZoom === null) {
    return [
      `canvas: neither Cmd/Ctrl+Plus nor Cmd/Ctrl+Minus at the canvas changed the view ${facts.state}, so whether ${listed} closes on a zoom was not verified`,
    ];
  }
  const { palette } = facts;
  const above = (layer: CanvasLayerFacts) =>
    palette !== null && layer.zIndex > palette
      ? `above the palette at ${palette}`
      : `above the limit of ${OVERLAY_LAYER_LIMIT}${palette === null ? "" : ` (the palette lies at ${palette})`}`;
  const seen = (layer: CanvasLayerFacts) =>
    facts.before.some((before) => before.description === layer.description);
  const problem = (layer: CanvasLayerFacts, behaviour: string) =>
    `canvas: ${layer.description} lies at z-index ${layer.zIndex} in .djs-container ${facts.state} and ${behaviour}, ${above(layer)}; an overlay that stays (a toolbar, a prompt, a label editor) lies at ${OVERLAY_LAYER_LIMIT} or below, only a popup that closes on a pan or zoom may cover the palette (guide §5.13)`;
  return [
    ...facts.afterZoom.stays
      .filter(seen)
      .map((layer) => problem(layer, "stays when the view zooms")),
    ...facts.afterZoom.back
      .filter(seen)
      .map((layer) => problem(layer, "comes back once the zoomed view has settled")),
  ];
}
