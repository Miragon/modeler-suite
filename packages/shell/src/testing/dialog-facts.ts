import type { Size } from "../core/index.js";
import type { BorderSideFacts } from "./media-facts.js";
import type { ToolWindow } from "./page-tools.js";

/*
 * Snapshots of the `shortcutsDialog` case, judged in Node (`dialog-checks.ts`). Like every probe
 * they run in the browser through `page.evaluate` and reference nothing outside their own body.
 */

/** The chrome tooltip a zoom control shows: its label and its chip. */
export interface TooltipPartsFacts {
  label: string;
  shortcut: string;
}

/** The visible chrome tooltip in the root, split into label and chip; `null` while none shows. */
export const tooltipPartsProbe = ({ root }: { root: string }): TooltipPartsFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const tooltip = [
    ...(document.querySelector(root)?.querySelectorAll('[role="tooltip"]') ?? []),
  ].find((element) => tools.visible(element));
  if (!tooltip) return null;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const chip = tooltip.querySelector("kbd");
  const label = chip
    ? [...tooltip.childNodes]
        .filter((node) => node !== chip)
        .map((node) => node.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim()
    : text(tooltip);
  return { label, shortcut: text(chip) };
};

/** The roles and tokens the dialog must show, resolved where it lives. */
export interface DialogRoleFacts {
  flaecheHoch: string;
  linie: string;
  kontur: string;
  fokus: string;
  backdrop: string;
  textLeise: string;
  grund: string;
  radiusMd: string;
  radiusSm: string;
  shadow3: string;
}

export interface DialogBorderFacts {
  top: BorderSideFacts;
  right: BorderSideFacts;
  bottom: BorderSideFacts;
  left: BorderSideFacts;
}

/** One chip of the shortcut tables, as computed. */
export interface DialogChipFacts {
  text: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  background: string;
  border: BorderSideFacts;
  radius: string;
  padding: string;
  boxShadow: string;
}

export interface DialogRowFacts {
  /** `data-chrome-key` of a row of the chrome's own keys; `null` for a modeler's row. */
  chromeKey: string | null;
  action: string;
  /** The action is a `<th scope="row">`. */
  rowHeader: boolean;
  keys: string[];
}

export interface DialogGroupFacts {
  heading: string;
  /** The table's `aria-labelledby` names the group's heading. */
  labelled: boolean;
  rows: DialogRowFacts[];
}

/** The shell's open dialogs in scope, and the first one as computed. */
export interface ShellDialogFacts {
  /** Open `dialog.cd-shell-dialog` elements in the scope. */
  open: number;
  dialog: {
    description: string;
    /** Opened with `showModal()`: in the top layer, the page behind it inert. */
    modal: boolean;
    /**
     * The window a fixed element lies in: the root's client size (in quirks mode the body's),
     * without scrollbars.
     */
    viewport: Size;
    /**
     * The content box of the modeler's container, the shell root, which the dialog's sizes refer
     * to (guide §5.1); the window without a root.
     */
    container: Size;
    /** The dialog's box in viewport coordinates. */
    box: { left: number; top: number; width: number; height: number };
    /**
     * The part of the element the dialog lives in (the shell root of a mounted shell) that shows,
     * in viewport coordinates: its box inside the window and inside every element that clips its
     * overflow and has it in its containing-block chain; `null` when nothing of it shows.
     */
    shown: { left: number; top: number; right: number; bottom: number } | null;
    /** The text of what `aria-labelledby` names, and that element's tag. */
    name: { text: string; tag: string } | null;
    title: { fontSize: string; fontWeight: string } | null;
    background: string;
    border: DialogBorderFacts;
    radius: string;
    boxShadow: string;
    backdrop: { background: string; filter: string };
    headerPadding: string | null;
    bodyPadding: string | null;
    close: {
      name: string;
      width: number;
      height: number;
      background: string;
      icon: { width: number; height: number } | null;
      client: { x: number; y: number };
    } | null;
    groups: DialogGroupFacts[];
    chips: DialogChipFacts[];
    /** The dialog's Tab stops: focusable, enabled, shown, `tabIndex` ≥ 0. */
    tabStops: number;
    roles: DialogRoleFacts;
  } | null;
  /** Where the focus is. */
  focus: { description: string; inDialog: boolean; onMenuTrigger: boolean };
}

export const shellDialogProbe = ({
  root,
  wholeDocument,
}: {
  root: string;
  wholeDocument: boolean;
}): ShellDialogFacts => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  const scope: ParentNode | null = wholeDocument ? document : rootElement;
  const dialogs = [
    ...(scope?.querySelectorAll<HTMLDialogElement>("dialog.cd-shell-dialog[open]") ?? []),
  ];
  const active = document.activeElement;
  const trigger = rootElement?.querySelector('[data-chrome="menu"]') ?? null;
  const first = dialogs[0];
  const focus = {
    description: active && active !== document.body ? tools.describe(active) : "<body>",
    inDialog: first !== undefined && active !== first && first.contains(active),
    onMenuTrigger: trigger !== null && active === trigger,
  };
  if (!first) return { open: 0, dialog: null, focus };

  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const side = (style: CSSStyleDeclaration, name: string): BorderSideFacts => ({
    width: parseFloat(style.getPropertyValue(`border-${name}-width`)) || 0,
    style: style.getPropertyValue(`border-${name}-style`),
    color: style.getPropertyValue(`border-${name}-color`),
  });
  const resolve = (
    property: string,
    value: string,
    read: (style: CSSStyleDeclaration) => string,
  ) => {
    const probe = document.createElement("span");
    probe.setAttribute("data-modeler-shell-conformance", "role-probe");
    probe.style.cssText = `position:absolute;visibility:hidden;${property}:${value};`;
    first.append(probe);
    const resolved = read(getComputedStyle(probe));
    probe.remove();
    return resolved;
  };
  const color = (role: string) => resolve("color", `var(${role})`, (style) => style.color);
  const roles: DialogRoleFacts = {
    flaecheHoch: resolve("background-color", "var(--cd-ui-flaeche-hoch)", (s) => s.backgroundColor),
    linie: color("--cd-ui-linie"),
    kontur: color("--cd-ui-kontur"),
    fokus: color("--cd-ui-fokus"),
    backdrop: resolve("background-color", "var(--cd-ui-backdrop)", (s) => s.backgroundColor),
    textLeise: color("--cd-ui-text-leise"),
    grund: resolve("background-color", "var(--cd-ui-grund)", (s) => s.backgroundColor),
    radiusMd: resolve(
      "border-top-left-radius",
      "var(--cd-radius-md)",
      (s) => s.borderTopLeftRadius,
    ),
    radiusSm: resolve(
      "border-top-left-radius",
      "var(--cd-radius-sm)",
      (s) => s.borderTopLeftRadius,
    ),
    shadow3: resolve("box-shadow", "var(--cd-shadow-3)", (s) => s.boxShadow),
  };

  const rootStyle = rootElement ? getComputedStyle(rootElement) : null;
  const container =
    rootElement && rootStyle
      ? {
          width:
            rootElement.clientWidth -
            parseFloat(rootStyle.paddingLeft) -
            parseFloat(rootStyle.paddingRight),
          height:
            rootElement.clientHeight -
            parseFloat(rootStyle.paddingTop) -
            parseFloat(rootStyle.paddingBottom),
        }
      : { width: window.innerWidth, height: window.innerHeight };
  // In quirks mode `<body>` reports the window and `<html>` its own box.
  const viewportElement =
    document.compatMode === "BackCompat" ? document.body : document.documentElement;
  const viewport = {
    width: viewportElement?.clientWidth || window.innerWidth,
    height: viewportElement?.clientHeight || window.innerHeight,
  };
  const home = first.parentElement;
  let shown = null as { left: number; top: number; right: number; bottom: number } | null;
  if (home) {
    const own = home.getBoundingClientRect();
    shown = {
      left: Math.max(own.left, 0),
      top: Math.max(own.top, 0),
      right: Math.min(own.right, viewport.width),
      bottom: Math.min(own.bottom, viewport.height),
    };
    const isRoot = (element: Element) =>
      element === document.body || element === document.documentElement;
    const isSet = (value: string) => value !== "" && value !== "none";
    const containsPositioned = (around: CSSStyleDeclaration, position: string) =>
      (position === "absolute" && around.position !== "static") ||
      [
        "transform",
        "translate",
        "rotate",
        "scale",
        "perspective",
        "filter",
        "backdrop-filter",
      ].some((property) => isSet(around.getPropertyValue(property))) ||
      /\b(layout|paint|strict|content)\b/.test(around.contain) ||
      /\b(transform|perspective|filter)\b/.test(around.willChange);
    let element: Element = home;
    for (;;) {
      const { position } = getComputedStyle(element);
      let around = element.parentElement;
      if (position === "absolute" || position === "fixed") {
        while (
          around &&
          !isRoot(around) &&
          !containsPositioned(getComputedStyle(around), position)
        ) {
          around = around.parentElement;
        }
      }
      if (!around || isRoot(around)) break;
      const aroundStyle = getComputedStyle(around);
      const clipX = aroundStyle.overflowX !== "visible";
      const clipY = aroundStyle.overflowY !== "visible";
      if (clipX || clipY) {
        const rect = around.getBoundingClientRect();
        const left = rect.left + around.clientLeft;
        const top = rect.top + around.clientTop;
        shown = {
          left: clipX ? Math.max(shown.left, left) : shown.left,
          top: clipY ? Math.max(shown.top, top) : shown.top,
          right: clipX ? Math.min(shown.right, left + around.clientWidth) : shown.right,
          bottom: clipY ? Math.min(shown.bottom, top + around.clientHeight) : shown.bottom,
        };
      }
      element = around;
    }
    if (shown.right <= shown.left || shown.bottom <= shown.top) shown = null;
  }
  const style = getComputedStyle(first);
  const backdrop = getComputedStyle(first, "::backdrop");
  const box = first.getBoundingClientRect();
  const nameElement = first.getAttribute("aria-labelledby")
    ? document.getElementById(first.getAttribute("aria-labelledby") ?? "")
    : null;
  const titleElement = first.querySelector(".cd-shell-dialog-title");
  const header = first.querySelector(".cd-shell-dialog-header");
  const body = first.querySelector(".cd-shell-dialog-body");
  const closeButton = first.querySelector<HTMLElement>(".cd-shell-dialog-close");
  const closeBox = closeButton?.getBoundingClientRect();
  const icon = closeButton?.querySelector("svg")?.getBoundingClientRect();
  const groups: DialogGroupFacts[] = [...first.querySelectorAll(".cd-shell-shortcuts-group")].map(
    (group) => {
      const heading = group.querySelector("h1, h2, h3, h4, h5, h6");
      const table = group.querySelector("table");
      return {
        heading: text(heading),
        labelled:
          heading !== null &&
          heading.id !== "" &&
          table?.getAttribute("aria-labelledby") === heading.id,
        rows: [...(table?.querySelectorAll("tr") ?? [])].map((row) => {
          const header = row.querySelector("th");
          return {
            chromeKey: row.getAttribute("data-chrome-key"),
            action: text(header ?? row.querySelector("td")),
            rowHeader: header?.getAttribute("scope") === "row",
            keys: [...row.querySelectorAll("kbd")].map((key) => text(key)),
          };
        }),
      };
    },
  );
  const chips: DialogChipFacts[] = [...first.querySelectorAll("kbd")].map((chip) => {
    const chipStyle = getComputedStyle(chip);
    return {
      text: text(chip),
      fontFamily: chipStyle.fontFamily,
      fontSize: chipStyle.fontSize,
      fontWeight: chipStyle.fontWeight,
      color: chipStyle.color,
      background: chipStyle.backgroundColor,
      border: side(chipStyle, "top"),
      radius: chipStyle.borderTopLeftRadius,
      padding: `${chipStyle.paddingTop} ${chipStyle.paddingRight}`,
      boxShadow: chipStyle.boxShadow,
    };
  });
  const focusable = [
    ...first.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]:not([contenteditable="false"])',
    ),
  ].filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && tools.visible(element),
  );
  let modal = false;
  try {
    modal = first.matches(":modal");
  } catch {
    modal = false;
  }
  return {
    open: dialogs.length,
    dialog: {
      description: tools.describe(first),
      modal,
      viewport,
      container,
      box: { left: box.left, top: box.top, width: box.width, height: box.height },
      shown,
      name: nameElement ? { text: text(nameElement), tag: nameElement.localName } : null,
      title: titleElement
        ? {
            fontSize: getComputedStyle(titleElement).fontSize,
            fontWeight: getComputedStyle(titleElement).fontWeight,
          }
        : null,
      background: style.backgroundColor,
      border: {
        top: side(style, "top"),
        right: side(style, "right"),
        bottom: side(style, "bottom"),
        left: side(style, "left"),
      },
      radius: style.borderTopLeftRadius,
      boxShadow: style.boxShadow,
      backdrop: {
        background: backdrop.backgroundColor,
        filter:
          backdrop.backdropFilter || backdrop.getPropertyValue("-webkit-backdrop-filter") || "none",
      },
      headerPadding: header ? getComputedStyle(header).padding : null,
      bodyPadding: body ? getComputedStyle(body).padding : null,
      close:
        closeButton && closeBox
          ? {
              name: (closeButton.getAttribute("aria-label") ?? text(closeButton)).trim(),
              width: closeBox.width,
              height: closeBox.height,
              background: getComputedStyle(closeButton).backgroundColor,
              icon: icon ? { width: icon.width, height: icon.height } : null,
              client: {
                x: closeBox.left + closeBox.width / 2,
                y: closeBox.top + closeBox.height / 2,
              },
            }
          : null,
      groups,
      chips,
      tabStops: focusable.length,
      roles,
    },
    focus,
  };
};

/** Where the focus is relative to the shell's open dialog, after a Tab or a close. */
export interface DialogFocusFacts {
  /** An open `dialog.cd-shell-dialog` in scope. */
  open: boolean;
  description: string;
  inDialog: boolean;
  onMenuTrigger: boolean;
  /** The focused element's outline (the focus ring of guide §8). */
  outline: BorderSideFacts;
}

export const dialogFocusProbe = ({
  root,
  wholeDocument,
}: {
  root: string;
  wholeDocument: boolean;
}): DialogFocusFacts => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  const scope: ParentNode | null = wholeDocument ? document : rootElement;
  const dialog = scope?.querySelector("dialog.cd-shell-dialog[open]") ?? null;
  const active = document.activeElement;
  const style = active ? getComputedStyle(active) : null;
  return {
    open: dialog !== null,
    description: active && active !== document.body ? tools.describe(active) : "<body>",
    inDialog: dialog !== null && active !== dialog && dialog.contains(active),
    onMenuTrigger: active !== null && active === rootElement?.querySelector('[data-chrome="menu"]'),
    outline: {
      width: parseFloat(style?.outlineWidth ?? "") || 0,
      style: style?.outlineStyle ?? "none",
      color: style?.outlineColor ?? "",
    },
  };
};
