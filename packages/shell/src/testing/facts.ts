import type { ElementFacts, RelativeBox, ToolWindow } from "./page-tools.js";

/*
 * Snapshots the cases judge in Node (`checks.ts`). Each probe runs in the page and must stay
 * self-contained (see page-tools.ts).
 */

export type ZoomButton = "out" | "actual" | "in" | "fit";

/**
 * The chrome parts in the DOM (and tab) order of guide §5.14; the web app adds the primary action
 * after the menu trigger, the start screen card after the hint, the legal line before the zoom
 * panel and the toast stack last (API.md, Web host).
 */
export const DOM_ORDER = [
  "menu",
  "primary",
  "palette",
  "canvas",
  "status",
  "hint",
  "empty-state",
  "inspector",
  "problems",
  "legend",
  "legal",
  "zoom",
  "toasts",
] as const;

export type OrderedPart = (typeof DOM_ORDER)[number];

export interface PaletteEntryFacts extends ElementFacts {
  group: string | null;
}

/** A link of the web app's legal line. */
export interface LinkFacts {
  text: string;
  href: string;
  lang: string | null;
  target: string | null;
  rel: string | null;
}

export interface AriaFacts {
  platform: "mac" | "other";
  documentLang: string;
  rootLang: string | null;
  trigger: ElementFacts | null;
  /** The element the trigger's `aria-controls` names. */
  controlled: ElementFacts | null;
  palette: ElementFacts | null;
  toolbar: ElementFacts | null;
  /** The focusable canvas `<svg>` (`.djs-container > svg`). */
  canvas: ElementFacts | null;
  entries: PaletteEntryFacts[];
  zoom: ElementFacts | null;
  zoomButtons: Partial<Record<ZoomButton, ElementFacts>>;
  /** The parts that exist, in DOM order. */
  order: OrderedPart[];
  /** Elements inside the root with a positive `tabindex`. */
  positiveTabindex: string[];
  /** Chrome controls with a native `title` tooltip. */
  titled: string[];
  problems: ElementFacts | null;
  status: ElementFacts | null;
  legend: ElementFacts | null;
  /** Text of the legend's `aria-labelledby` targets. */
  legendTitle: string | null;
  legendClose: ElementFacts | null;
  inspector: ElementFacts | null;
  /** The web app's primary action (`[data-chrome="primary"]`). */
  primary: ElementFacts | null;
  /** The root's `data-primary="collapsed"`. */
  primaryCollapsed: boolean;
  /** The web app's legal line and its links, in order. */
  legal: ElementFacts | null;
  legalLinks: LinkFacts[];
  /** The element the pill's `aria-controls` names (the web app's problems list). */
  problemsControlled: ElementFacts | null;
}

export const ariaProbe = ({ root }: { root: string }): AriaFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const find = (selector: string) => rootElement.querySelector(selector);
  const factsOf = (element: Element | null | undefined) => (element ? tools.facts(element) : null);
  const navigatorLike = navigator as Navigator & { userAgentData?: { platform?: string } };
  const trigger = find('[data-chrome="menu"]');
  const controlsId = trigger?.getAttribute("aria-controls");
  const palette = find('[data-chrome="palette"]');
  const toolbar =
    palette?.querySelector('[role="toolbar"]') ?? palette?.querySelector(".djs-palette-entries");
  const zoom = find('[data-chrome="zoom"]');
  const zoomButtons: Partial<Record<ZoomButton, ElementFacts>> = {};
  for (const name of ["out", "actual", "in", "fit"] as const) {
    const button = zoom?.querySelector(`[data-zoom="${name}"]`);
    if (button) zoomButtons[name] = tools.facts(button);
  }
  const legend = find('[data-chrome="legend"]');
  const labelledBy = legend?.getAttribute("aria-labelledby");
  const legal = find('[data-chrome="legal"]');
  const pillControls = find('[data-chrome="problems"]')?.getAttribute("aria-controls");
  const parts: Array<[string, Element | null]> = [
    ["menu", trigger],
    ["primary", find('[data-chrome="primary"]')],
    ["palette", palette],
    ["canvas", find(".djs-container > svg")],
    ["status", find('[data-chrome="status"]')],
    ["hint", find(".cd-shell-hint")],
    ["inspector", find('[data-chrome="inspector"]')],
    ["problems", find('[data-chrome="problems"]')],
    ["empty-state", find('[data-chrome="empty-state"]')],
    ["legend", legend],
    ["legal", find('[data-chrome="legal"]')],
    ["zoom", zoom],
    ["toasts", find('[data-chrome="toasts"]')],
  ];
  const present = parts.filter((part): part is [string, Element] => part[1] !== null);
  present.sort(([, a], [, b]) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const titledSelector = [
    '[data-chrome="menu"][title]',
    '[data-chrome="primary"][title]',
    '[data-chrome="palette"] [data-action][title]',
    '[data-chrome="zoom"] [title]',
    '[data-chrome="problems"][title]',
  ].join(", ");
  return {
    platform: /mac/i.test(navigatorLike.userAgentData?.platform ?? navigatorLike.platform ?? "")
      ? "mac"
      : "other",
    documentLang: document.documentElement.lang,
    rootLang: rootElement.getAttribute("lang"),
    trigger: factsOf(trigger),
    controlled: factsOf(controlsId ? document.getElementById(controlsId) : null),
    palette: factsOf(palette),
    toolbar: factsOf(toolbar),
    canvas: factsOf(find(".djs-container > svg")),
    entries: [...(palette?.querySelectorAll("[data-action]") ?? [])].map((entry) => ({
      ...tools.facts(entry),
      group: entry.closest("[data-group]")?.getAttribute("data-group") ?? null,
    })),
    zoom: factsOf(zoom),
    zoomButtons,
    order: present.map(([name]) => name) as OrderedPart[],
    positiveTabindex: [...rootElement.querySelectorAll("[tabindex]")]
      .filter((element) => Number(element.getAttribute("tabindex")) > 0)
      .map(
        (element) => `${tools.describe(element)} (tabindex="${element.getAttribute("tabindex")}")`,
      ),
    titled: [...rootElement.querySelectorAll(titledSelector)].map((element) =>
      tools.describe(element),
    ),
    problems: factsOf(find('[data-chrome="problems"]')),
    status: factsOf(find('[data-chrome="status"]')),
    legend: factsOf(legend),
    legendTitle: labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" ")
          .trim()
      : null,
    legendClose: factsOf(legend?.querySelector("button")),
    inspector: factsOf(find('[data-chrome="inspector"]')),
    primary: factsOf(find('[data-chrome="primary"]')),
    primaryCollapsed: rootElement.getAttribute("data-primary") === "collapsed",
    legal: factsOf(legal),
    legalLinks: [...(legal?.querySelectorAll("a") ?? [])].map((link) => ({
      text: (link.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: link.getAttribute("href") ?? "",
      lang: link.getAttribute("lang"),
      target: link.getAttribute("target"),
      rel: link.getAttribute("rel"),
    })),
    problemsControlled: factsOf(pillControls ? document.getElementById(pillControls) : null),
  };
};

export interface MenuItemFacts {
  role: string;
  /** The accessible name, so without an `aria-hidden` shortcut chip (`PageTools.accessibleName`). */
  name: string;
  checked: string | null;
  disabled: string | null;
  haspopup: string | null;
  /** `aria-label` of the enclosing `role="group"`; `null` outside a group. */
  group: string | null;
  /** Text of the visible shortcut chip (`.cd-shell-menu-shortcut`); empty without one. */
  shortcut: string;
  keyShortcuts: string | null;
  /** The accessible description (`aria-describedby`, `PageTools.accessibleDescription`). */
  description: string;
}

export interface MenuFacts {
  /** The trigger's `aria-expanded` and `aria-controls`. */
  expanded: string | null;
  controls: string | null;
  /** The visible `role="menu"` inside the root. */
  menu: ElementFacts | null;
  items: MenuItemFacts[];
  /** Index of the focused item; -1 when the focus is elsewhere. */
  active: number;
  activeIsTrigger: boolean;
}

export const menuProbe = ({ root }: { root: string }): MenuFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const trigger = rootElement.querySelector('[data-chrome="menu"]');
  const menu =
    [...rootElement.querySelectorAll('[role="menu"]')].find((element) => tools.visible(element)) ??
    null;
  const items = menu
    ? [
        ...menu.querySelectorAll(
          '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
        ),
      ].filter((item) => tools.visible(item))
    : [];
  return {
    expanded: trigger?.getAttribute("aria-expanded") ?? null,
    controls: trigger?.getAttribute("aria-controls") ?? null,
    menu: menu ? tools.facts(menu) : null,
    items: items.map((item) => {
      const group = item.closest('[role="group"]');
      const chip = item.querySelector(".cd-shell-menu-shortcut");
      return {
        role: item.getAttribute("role") ?? "",
        name: tools.accessibleName(item),
        checked: item.getAttribute("aria-checked"),
        disabled: item.getAttribute("aria-disabled"),
        haspopup: item.getAttribute("aria-haspopup"),
        group: group && menu?.contains(group) ? (group.getAttribute("aria-label") ?? "") : null,
        shortcut:
          chip && tools.visible(chip) ? (chip.textContent ?? "").replace(/\s+/g, " ").trim() : "",
        keyShortcuts: item.getAttribute("aria-keyshortcuts"),
        description: tools.accessibleDescription(item),
      };
    }),
    active: items.findIndex((item) => item === document.activeElement),
    activeIsTrigger: Boolean(trigger) && document.activeElement === trigger,
  };
};

export interface PaletteFocusFacts {
  /** `data-action` of every entry, in order. */
  entries: string[];
  /** Entries with `tabindex="0"`. */
  tabStops: string[];
  /** `data-action` of the focused entry; `null` when the focus is elsewhere. */
  active: string | null;
}

export const paletteFocusProbe = ({ root }: { root: string }): PaletteFocusFacts | null => {
  const palette = document.querySelector(root)?.querySelector('[data-chrome="palette"]');
  if (!palette) return null;
  const entries = [...palette.querySelectorAll("[data-action]")];
  const active = document.activeElement;
  return {
    entries: entries.map((entry) => entry.getAttribute("data-action") ?? ""),
    tabStops: entries
      .filter((entry) => entry.getAttribute("tabindex") === "0")
      .map((entry) => entry.getAttribute("data-action") ?? ""),
    active: active && entries.includes(active) ? active.getAttribute("data-action") : null,
  };
};

export const zoomButtonsProbe = ({
  root,
}: {
  root: string;
}): Partial<Record<ZoomButton, ElementFacts>> => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const zoom = document.querySelector(root)?.querySelector('[data-chrome="zoom"]');
  const buttons: Partial<Record<ZoomButton, ElementFacts>> = {};
  for (const name of ["out", "actual", "in", "fit"] as const) {
    const button = zoom?.querySelector(`[data-zoom="${name}"]`);
    if (button) buttons[name] = tools.facts(button);
  }
  return buttons;
};

/** The design-system roles whose resolved values must agree on every part (no half-dark). */
export const MODE_ROLES = [
  "--cd-ui-grund",
  "--cd-ui-text",
  "--cd-ui-flaeche-hoch",
  "--cd-ui-linie",
] as const;

export interface ModeFacts {
  name: string;
  description: string;
  colorScheme: string;
  roles: Record<string, string>;
}

export interface ThemedElementFacts {
  description: string;
  isDocument: boolean;
  /** Where it sits relative to the shell root. */
  relation: "self" | "ancestor" | "descendant" | "elsewhere";
  theme: string | null;
  kontrast: string | null;
}

export interface AppearanceFacts {
  documentClasses: string[];
  /** Every element with `data-cd-theme` or `data-cd-kontrast`. */
  themed: ThemedElementFacts[];
  /** Root, canvas, every visible island, the visible empty-file hint, the open dropdown and the visible tooltip. */
  parts: ModeFacts[];
}

export const appearanceProbe = ({
  root,
  roles,
}: {
  root: string;
  roles: readonly string[];
}): AppearanceFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const mode = (name: string, element: Element) => {
    const style = getComputedStyle(element);
    const resolved: Record<string, string> = {};
    for (const role of roles) resolved[role] = style.getPropertyValue(role).trim();
    return {
      name,
      description: tools.describe(element),
      colorScheme: style.colorScheme,
      roles: resolved,
    };
  };
  const parts = [mode("root", rootElement)];
  const canvas = rootElement.querySelector(".djs-container");
  if (canvas) parts.push(mode("canvas", canvas));
  for (const island of rootElement.querySelectorAll("[data-chrome]")) {
    if (tools.visible(island))
      parts.push(mode(island.getAttribute("data-chrome") ?? "island", island));
  }
  const hint = rootElement.querySelector(".cd-shell-hint");
  if (hint && tools.visible(hint)) parts.push(mode("hint", hint));
  for (const [name, role] of [
    ["dropdown", "menu"],
    ["tooltip", "tooltip"],
  ] as const) {
    const popup = [...rootElement.querySelectorAll(`[role="${role}"]`)].find((element) =>
      tools.visible(element),
    );
    if (popup) parts.push(mode(name, popup));
  }
  return {
    documentClasses: [...document.documentElement.classList],
    themed: [...document.querySelectorAll("[data-cd-theme], [data-cd-kontrast]")].map(
      (element) => ({
        description: tools.describe(element),
        isDocument: element === document.documentElement,
        relation:
          element === rootElement
            ? "self"
            : element.contains(rootElement)
              ? "ancestor"
              : rootElement.contains(element)
                ? "descendant"
                : "elsewhere",
        theme: element.getAttribute("data-cd-theme"),
        kontrast: element.getAttribute("data-cd-kontrast"),
      }),
    ),
    parts,
  };
};

/** The element with the focus, classified for the tab-sequence check. */
export const activeStopProbe = ({
  root,
}: {
  root: string;
}): { description: string; kind: string } => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const active = document.activeElement;
  const rootElement = document.querySelector(root);
  if (!active || active === document.body || !rootElement)
    return { description: "<body>", kind: "other" };
  const description = tools.describe(active);
  if (!rootElement.contains(active))
    return { description: `${description} outside the shell root`, kind: "other" };
  if (active.matches('[data-chrome="palette"] [data-action]'))
    return { description, kind: "palette" };
  if (active.matches(".djs-container > svg")) return { description, kind: "canvas" };
  if (active.closest('[data-chrome="primary"]')) return { description, kind: "primary" };
  const tabindex = active.getAttribute("tabindex");
  return {
    description: tabindex === null ? description : `${description}[tabindex="${tabindex}"]`,
    kind: "other",
  };
};

/** Where the focus is after the kit activated a chrome control (guide §5.8). */
export interface FocusPlaceFacts {
  /** The focused element, `<body>` when nothing has the focus. */
  focused: string;
  /** On the canvas `<svg>` (`.djs-container > svg`) or inside it. */
  canvas: boolean;
  /** On the first visible match of `selector`, the control the kit activated. */
  control: boolean;
}

export const focusPlaceProbe = ({
  root,
  selector,
}: {
  root: string;
  selector: string;
}): FocusPlaceFacts => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  const active = document.activeElement;
  const svg = rootElement?.querySelector(".djs-container > svg");
  const control = rootElement
    ? [...rootElement.querySelectorAll(selector)].find((candidate) => tools.visible(candidate))
    : undefined;
  return {
    focused: !active || active === document.body ? "<body>" : tools.describe(active),
    canvas: Boolean(svg && active && svg.contains(active)),
    control: Boolean(control && active === control),
  };
};

/** The focused palette entry, its `aria-keyshortcuts` and the chip of the visible tooltip. */
export const paletteShortcutProbe = ({
  root,
}: {
  root: string;
}): { action: string; chip: string; keyShortcuts: string | null } | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  const active = document.activeElement;
  if (!rootElement || !active?.matches('[data-chrome="palette"] [data-action]')) return null;
  const tooltip = [...rootElement.querySelectorAll('[role="tooltip"]')].find((element) =>
    tools.visible(element),
  );
  const chip = tooltip
    ? [...tooltip.querySelectorAll("kbd")].find((element) => tools.visible(element))
    : undefined;
  return {
    action: active.getAttribute("data-action") ?? "",
    chip: (chip?.textContent ?? "").trim(),
    keyShortcuts: active.getAttribute("aria-keyshortcuts"),
  };
};

/** The canvas surround (guide §10.1) and the role it must show. */
export interface SurroundFacts {
  /** Whether the root holds a `.djs-container`. */
  container: boolean;
  /** The first element from `.djs-container` out to the root that paints a background colour. */
  painted: { description: string; color: string } | null;
  /** `--cd-ui-grund` resolved to a computed colour inside the root. */
  grund: string;
}

export const surroundProbe = ({ root }: { root: string }): SurroundFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const transparent = (color: string): boolean => {
    if (color === "" || color === "transparent") return true;
    const legacy = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(color);
    if (legacy) return Number(legacy[1]) === 0;
    const modern = /\/\s*([\d.]+)%?\s*\)$/.exec(color);
    return modern ? Number(modern[1]) === 0 : false;
  };
  const start = rootElement.querySelector(".djs-container");
  let painted: SurroundFacts["painted"] = null;
  for (let node: Element | null = start; node && !painted; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (!transparent(color)) painted = { description: tools.describe(node), color };
    if (node === rootElement) break;
  }
  const probe = document.createElement("span");
  probe.setAttribute("data-modeler-shell-conformance", "role-probe");
  probe.style.cssText = "position:absolute;visibility:hidden;background-color:var(--cd-ui-grund);";
  rootElement.append(probe);
  const grund = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return { container: start !== null, painted, grund };
};

/** One visible palette entry, as the keyboard walk and the read-only lock read it. */
export interface PaletteEntryState {
  action: string;
  /** `data-group` of the enclosing `.group`; `null` outside one. */
  group: string | null;
  pressed: boolean;
  disabled: boolean;
  /** Viewport coordinates of the centre, for `page.mouse`. */
  client: { x: number; y: number };
}

export const paletteEntriesProbe = ({ root }: { root: string }): PaletteEntryState[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const palette = document.querySelector(root)?.querySelector('[data-chrome="palette"]');
  if (!palette) return [];
  return [...palette.querySelectorAll("[data-action]")]
    .filter((entry) => tools.visible(entry))
    .map((entry) => {
      const rect = entry.getBoundingClientRect();
      return {
        action: entry.getAttribute("data-action") ?? "",
        group: entry.closest("[data-group]")?.getAttribute("data-group") ?? null,
        pressed: entry.getAttribute("aria-pressed") === "true",
        disabled: entry.getAttribute("aria-disabled") === "true",
        client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    });
};

/** The computed colours of one visible palette entry and of its icon. */
export interface PaletteColorEntry extends Omit<PaletteEntryState, "client"> {
  hovered: boolean;
  color: string;
  /** The entry's `<svg>`, else its `::before` when that has content; `null` for an image or a text entry. */
  icon: { kind: "svg" | "::before"; color: string } | null;
}

export interface PaletteColorFacts {
  /** The roles of guide §5.5 and §13.5, resolved to computed colours inside the palette. */
  roles: { text: string; interaktion: string; textLeise: string };
  entries: PaletteColorEntry[];
}

export const paletteColorProbe = ({ root }: { root: string }): PaletteColorFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const palette = document.querySelector(root)?.querySelector('[data-chrome="palette"]');
  if (!palette) return null;
  const resolve = (role: string): string => {
    const probe = document.createElement("span");
    probe.setAttribute("data-modeler-shell-conformance", "role-probe");
    probe.style.cssText = `position:absolute;visibility:hidden;color:var(${role});`;
    palette.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  };
  const iconOf = (entry: Element): PaletteColorEntry["icon"] => {
    const svg = entry.querySelector("svg");
    if (svg) return { kind: "svg", color: getComputedStyle(svg).color };
    const before = getComputedStyle(entry, "::before");
    if (before.content && before.content !== "none" && before.content !== "normal") {
      return { kind: "::before", color: before.color };
    }
    return null;
  };
  return {
    roles: {
      text: resolve("--cd-ui-text"),
      interaktion: resolve("--cd-ui-interaktion"),
      textLeise: resolve("--cd-ui-text-leise"),
    },
    entries: [...palette.querySelectorAll("[data-action]")]
      .filter((entry) => tools.visible(entry))
      .map((entry) => ({
        action: entry.getAttribute("data-action") ?? "",
        group: entry.closest("[data-group]")?.getAttribute("data-group") ?? null,
        pressed: entry.getAttribute("aria-pressed") === "true",
        disabled: entry.getAttribute("aria-disabled") === "true",
        hovered: entry.matches(":hover"),
        color: getComputedStyle(entry).color,
        icon: iconOf(entry),
      })),
  };
};

/** One diagram-js shape on the canvas (`.djs-shape[data-element-id]`). */
export interface ShapeFacts {
  id: string;
  /** diagram-js's selection marker on the shape's `<g>`. */
  selected: boolean;
  /** The `<g>`'s `transform` (its position in the diagram, unaffected by panning). */
  transform: string;
  /** Size of its `.djs-visual` in diagram units. */
  size: { width: number; height: number };
  /** Its `.djs-visual` relative to the root's padding box. */
  box: RelativeBox;
  /** Viewport coordinates of the centre, for `page.mouse`. */
  client: { x: number; y: number };
  /** Whether a pointer at the centre reaches the shape and not chrome above it. */
  hit: boolean;
}

export const shapesProbe = ({ root }: { root: string }): ShapeFacts[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return [];
  return [
    ...rootElement.querySelectorAll<SVGGraphicsElement>(
      ".djs-container .djs-shape[data-element-id]",
    ),
  ]
    .filter((shape) => tools.visible(shape))
    .map((shape) => {
      const visual = shape.querySelector<SVGGraphicsElement>(".djs-visual") ?? shape;
      const rect = visual.getBoundingClientRect();
      const client = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const local = typeof visual.getBBox === "function" ? visual.getBBox() : rect;
      const hitElement = document.elementFromPoint(client.x, client.y);
      return {
        id: shape.getAttribute("data-element-id") ?? "",
        selected: shape.classList.contains("selected"),
        transform: shape.getAttribute("transform") ?? "",
        size: { width: local.width, height: local.height },
        box: tools.box(visual, rootElement),
        client,
        hit: hitElement !== null && shape.contains(hitElement),
      };
    });
};

/** What the canvas offers at the moment: focus, context pad, open text fields. */
export interface CanvasStateFacts {
  /** The focus is inside `.djs-container` (the `<svg>` or a label editor). */
  focusInCanvas: boolean;
  focused: string;
  /** Visible entries of a diagram-js context pad. */
  contextPadEntries: string[];
  /** Visible text fields inside `.djs-container` (a label editor), the kit's stand-ins aside. */
  textFields: string[];
}

export const canvasStateProbe = ({ root }: { root: string }): CanvasStateFacts => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const container = document.querySelector(root)?.querySelector(".djs-container");
  const active = document.activeElement;
  const ours = (element: Element) => element.closest("[data-modeler-shell-conformance]") !== null;
  const visibleIn = (selector: string) =>
    container
      ? [...container.querySelectorAll(selector)].filter(
          (element) => !ours(element) && tools.visible(element),
        )
      : [];
  return {
    focusInCanvas: Boolean(container && active && container.contains(active)),
    focused: !active || active === document.body ? "<body>" : tools.describe(active),
    contextPadEntries: visibleIn(".djs-context-pad .entry").map(
      (entry) => entry.getAttribute("data-action") ?? tools.describe(entry),
    ),
    textFields: visibleIn('input, textarea, [contenteditable]:not([contenteditable="false"])').map(
      (field) => tools.describe(field),
    ),
  };
};

/** Where the typing goes and what the canvas shows, read around each step of the `labelEditor` case. */
export interface LabelEditorFacts {
  /** The focus is in a text field: an input, a textarea or editable text. */
  editing: boolean;
  /** The focused element, `<body>` when nothing has the focus. */
  focused: string;
  /** What the focused text field holds (`value`, or the text of editable text); empty outside one. */
  text: string;
  /** The canvas's view, the matrix of the diagram-js viewport layer; `null` without a canvas. */
  view: string | null;
}

export const labelEditorProbe = ({ root }: { root: string }): LabelEditorFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  if (!rootElement) return null;
  const active = document.activeElement;
  const editing =
    active instanceof HTMLElement &&
    (active.isContentEditable || active.matches("input, textarea"));
  const text =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.value
      : editing
        ? (active.textContent ?? "")
        : "";
  const viewport = rootElement.querySelector<SVGGraphicsElement>(
    ".djs-container > svg > .viewport",
  );
  const matrix = viewport?.transform?.baseVal?.consolidate?.()?.matrix;
  const view = matrix
    ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
        .map((value) => Math.round(value * 1000) / 1000)
        .join(" ")
    : (viewport?.getAttribute("transform") ?? null);
  return {
    editing,
    focused: !active || active === document.body ? "<body>" : tools.describe(active),
    text,
    view,
  };
};

/**
 * A point in the viewport where a pointer reaches the canvas itself: the `<svg>` or a drawing of
 * its root, no element, overlay, field or island above it; `null` when the canvas shows none.
 */
export const emptyCanvasSpotProbe = ({
  root,
}: {
  root: string;
}): { x: number; y: number } | null => {
  const svg = document.querySelector(root)?.querySelector(".djs-container > svg");
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const step = 24;
  for (let y = rect.top + step; y < rect.bottom - step; y += step) {
    for (let x = rect.left + step; x < rect.right - step; x += step) {
      const hit = document.elementFromPoint(x, y);
      if (hit && svg.contains(hit) && !hit.closest(".djs-element")) return { x, y };
    }
  }
  return null;
};

/** The read-only marks of the root and the status box (guide §5.12, §13.5). */
export interface ReadOnlyStateFacts {
  readOnly: boolean;
  status: ElementFacts | null;
}

export const readOnlyStateProbe = ({ root }: { root: string }): ReadOnlyStateFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  if (!rootElement) return null;
  const status = rootElement.querySelector('[data-chrome="status"]');
  return {
    readOnly: rootElement.hasAttribute("data-readonly"),
    status: status ? tools.facts(status) : null,
  };
};

/** One item of the open menu with the group it stands in, counted by the separators. */
export interface MenuEntryFacts {
  /** The accessible name, so without an `aria-hidden` shortcut chip (`PageTools.accessibleName`). */
  name: string;
  role: string;
  /** `data-menu-id` of the item or its radio group. */
  menuId: string | null;
  disabled: boolean;
  /**
   * `data-menu-group` of the item or its radio group: the shell's `model`, `export` and `help`,
   * in the web app also `file` and `appearance`.
   */
  group: string | null;
  /** `data-menu-value` of a radio option. */
  value: string | null;
  /** `aria-checked` of a checkbox or radio entry. */
  checked: string | null;
  /** Whether the entry's icon column holds an icon (guide §5.4, only the common set of §5.14). */
  icon: boolean;
  /** `aria-haspopup`: `"dialog"` for an entry that opens a dialog in the modeler. */
  popup: string | null;
  /** `aria-keyshortcuts` of the entry. */
  keyShortcuts: string | null;
  /** Text of the entry's shortcut chip (`.cd-shell-menu-shortcut`). */
  shortcut: string | null;
  /** `data-danger` of a destructive action. */
  danger: boolean;
}

export const menuEntriesProbe = ({ root }: { root: string }): MenuEntryFacts[] | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector(root);
  const menu = rootElement
    ? [...rootElement.querySelectorAll('[role="menu"]')].find((element) => tools.visible(element))
    : undefined;
  if (!menu) return null;
  const entries: MenuEntryFacts[] = [];
  const selector = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  for (const element of menu.querySelectorAll(selector)) {
    const role = element.getAttribute("role") ?? "";
    if (!tools.visible(element)) continue;
    entries.push({
      name: tools.accessibleName(element),
      role,
      menuId: element.closest("[data-menu-id]")?.getAttribute("data-menu-id") ?? null,
      disabled: element.getAttribute("aria-disabled") === "true",
      group: element.closest("[data-menu-group]")?.getAttribute("data-menu-group") ?? null,
      value: element.getAttribute("data-menu-value"),
      checked: element.getAttribute("aria-checked"),
      icon: element.querySelector(".cd-shell-menu-item-icon svg") !== null,
      popup: element.getAttribute("aria-haspopup"),
      keyShortcuts: element.getAttribute("aria-keyshortcuts"),
      shortcut: element.querySelector(".cd-shell-menu-shortcut")?.textContent?.trim() || null,
      danger: element.hasAttribute("data-danger"),
    });
  }
  return entries;
};

/** A stacking context directly in the canvas container's own, above the guide's limit. */
export interface CanvasLayerFacts {
  /** The element that carries the layer (its outermost stacking context below `.djs-container`). */
  description: string;
  /** Its `z-index` in `.djs-container`'s stacking context; `auto` counts as 0. */
  zIndex: number;
}

export interface CanvasLayersFacts {
  /** The palette's `z-index`; `null` without a palette. */
  palette: number | null;
  /** Every visible layer above `limit` other than the palette. */
  layers: CanvasLayerFacts[];
}

/**
 * The layers inside `.djs-container` (an isolated stacking context, guide §5.13) above `limit`:
 * each outermost stacking context below the container whose `z-index` exceeds it and that shows
 * something. A descendant's own `z-index` is local to that context and does not count; the
 * content of the canvas `<svg>` paints inside the `<svg>`. `null` without a canvas container.
 */
export const canvasLayersProbe = ({
  root,
  limit,
}: {
  root: string;
  limit: number;
}): CanvasLayersFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const container = document.querySelector(root)?.querySelector(".djs-container");
  if (!container) return null;
  const zIndexOf = (style: CSSStyleDeclaration): number | null =>
    !style.zIndex || style.zIndex === "auto" ? null : Number(style.zIndex);
  const stacks = (style: CSSStyleDeclaration, parent: CSSStyleDeclaration): boolean => {
    const position = style.position || "static";
    if (position === "fixed" || position === "sticky") return true;
    if (zIndexOf(style) !== null && (position !== "static" || /flex|grid/.test(parent.display)))
      return true;
    if (Number(style.opacity || "1") < 1 || style.isolation === "isolate") return true;
    if ((style.mixBlendMode || "normal") !== "normal") return true;
    const backdrop =
      style.backdropFilter ||
      (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
    if (
      [style.transform, style.filter, backdrop, style.perspective, style.clipPath, style.maskImage]
        .map((value) => value || "none")
        .some((value) => value !== "none")
    )
      return true;
    if (
      /transform|opacity|filter|perspective|isolation|mask|clip-path/.test(style.willChange || "")
    )
      return true;
    if (/layout|paint|strict|content/.test(style.contain || "")) return true;
    return ["size", "inline-size"].includes(style.containerType || "");
  };
  const shows = (element: Element): boolean =>
    tools.visible(element) ||
    [...element.querySelectorAll("*")].some((child) => tools.visible(child));
  const layers: CanvasLayerFacts[] = [];
  const visit = (element: Element, parent: CSSStyleDeclaration): void => {
    if (element.hasAttribute("data-modeler-shell-conformance")) return;
    const style = getComputedStyle(element);
    if (style.display === "none") return;
    if (stacks(style, parent)) {
      const zIndex = zIndexOf(style) ?? 0;
      if (zIndex > limit && !element.matches(".djs-palette") && shows(element))
        layers.push({ description: tools.describe(element), zIndex });
      return;
    }
    if (element instanceof SVGElement) return;
    for (const child of element.children) visit(child, style);
  };
  const containerStyle = getComputedStyle(container);
  for (const child of container.children) visit(child, containerStyle);
  const palette = container.querySelector(".djs-palette");
  return { palette: palette ? zIndexOf(getComputedStyle(palette)) : null, layers };
};

/** A diagram-js element a pointer can select: a shape at its centre, a connection on its line. */
export interface SelectableFacts {
  id: string;
  kind: "shape" | "connection";
  selected: boolean;
  /** Viewport coordinates where a click reaches the element, for `page.mouse`. */
  client: { x: number; y: number };
}

/**
 * The visible shapes and connections a pointer reaches, in document order. A connection is tried
 * at the middle of its hit line, then at a quarter and three quarters, since a label or a crossing
 * line may cover the middle.
 */
export const selectablesProbe = ({ root }: { root: string }): SelectableFacts[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const container = document.querySelector(root)?.querySelector(".djs-container");
  if (!container) return [];
  const reaches = (element: Element, point: { x: number; y: number }): boolean => {
    const hit = document.elementFromPoint(point.x, point.y);
    return hit !== null && element.contains(hit);
  };
  const shapePoint = (element: Element): { x: number; y: number } | null => {
    const rect = (element.querySelector(".djs-visual") ?? element).getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    return reaches(element, point) ? point : null;
  };
  const connectionPoint = (element: Element): { x: number; y: number } | null => {
    const line =
      element.querySelector<SVGGeometryElement>(".djs-hit") ??
      element.querySelector<SVGGeometryElement>(".djs-visual path, .djs-visual polyline");
    const matrix = line?.getScreenCTM();
    if (!line || !matrix || typeof line.getTotalLength !== "function") return null;
    const length = line.getTotalLength();
    for (const fraction of [0.5, 0.25, 0.75]) {
      const { x, y } = line.getPointAtLength(length * fraction);
      const point = {
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
      };
      if (reaches(element, point)) return point;
    }
    return null;
  };
  const found: SelectableFacts[] = [];
  for (const element of container.querySelectorAll(
    ".djs-shape[data-element-id], .djs-connection[data-element-id]",
  )) {
    if (!tools.visible(element)) continue;
    const kind = element.classList.contains("djs-connection") ? "connection" : "shape";
    const client = kind === "shape" ? shapePoint(element) : connectionPoint(element);
    if (!client) continue;
    found.push({
      id: element.getAttribute("data-element-id") ?? "",
      kind,
      selected: element.classList.contains("selected"),
      client,
    });
  }
  return found;
};

/**
 * The ids of the selected shapes and connections, also of one a pointer no longer reaches: the
 * bendpoints of a selected connection may cover every point `selectablesProbe` tries on its line.
 */
export const selectedIdsProbe = ({ root }: { root: string }): string[] => {
  const container = document.querySelector(root)?.querySelector(".djs-container");
  if (!container) return [];
  return [
    ...container.querySelectorAll(
      ".djs-shape.selected[data-element-id], .djs-connection.selected[data-element-id]",
    ),
  ].map((element) => element.getAttribute("data-element-id") ?? "");
};

/** A visible entry of the open context pad. */
export interface ContextPadEntryFacts {
  /** `data-action` of the entry. */
  action: string;
  /** Viewport coordinates of the centre, for `page.mouse`. */
  client: { x: number; y: number };
}

export const contextPadEntriesProbe = ({ root }: { root: string }): ContextPadEntryFacts[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const container = document.querySelector(root)?.querySelector(".djs-container");
  if (!container) return [];
  return [...container.querySelectorAll(".djs-context-pad .entry[data-action]")]
    .filter((entry) => tools.visible(entry))
    .map((entry) => {
      const rect = entry.getBoundingClientRect();
      return {
        action: entry.getAttribute("data-action") ?? "",
        client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    });
};

/**
 * While the kit clicks context-pad entries, `window.open` opens nothing: an entry that opens a
 * link would leave the page for a foreign one. Restored by `removeInjectedProbe`.
 */
export const holdWindowOpenProbe = (_: null): void => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const open = window.open;
  window.open = () => null;
  tools.cleanups.push(() => {
    window.open = open;
  });
};
