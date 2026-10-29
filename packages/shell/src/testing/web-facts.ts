import type { Size } from "../core/index.js";
import type { DropFixture } from "./harness.js";
import type { ModeChange, RelativeBox, ToolWindow } from "./page-tools.js";

/*
 * In-page probes of the web column (0.2): mode and meta tags, top row, start screen, toasts,
 * problems list and drop zone. Like facts.ts, every probe runs in the page and stays
 * self-contained; the judgements are in web-checks.ts.
 */

type Point = { x: number; y: number };

/** `<html>`'s mode, its meta tags and the stored choice of the web app (guide §13.3). */
export interface WebModeFacts {
  theme: string | null;
  kontrast: string | null;
  /** `content` of `<meta name="color-scheme">`; `null` without one. */
  colorScheme: string | null;
  themeColors: Array<{ content: string; media: string | null }>;
  /** `localStorage[key]`; `null` without an entry. */
  stored: string | null;
  storageBlocked: boolean;
  noTransition: boolean;
}

export const webModeProbe = ({ key }: { key: string }): WebModeFacts => {
  const html = document.documentElement;
  let stored: string | null = null;
  let storageBlocked = false;
  try {
    stored = localStorage.getItem(key);
  } catch {
    storageBlocked = true;
  }
  return {
    theme: html.getAttribute("data-cd-theme"),
    kontrast: html.getAttribute("data-cd-kontrast"),
    colorScheme:
      document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? null,
    themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => ({
      content: meta.getAttribute("content") ?? "",
      media: meta.getAttribute("media"),
    })),
    stored,
    storageBlocked,
    noTransition: html.classList.contains("cd-shell-no-transition"),
  };
};

/**
 * Records every change of `<html data-cd-theme>`, `data-cd-kontrast`, `cd-shell-no-transition` and
 * the `color-scheme` and `theme-color` metas, with the animation frame each landed in, until
 * `modeChangesProbe` reads them.
 */
export const watchModeProbe = (_: null): void => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  tools.modeWatch?.stop();
  const html = document.documentElement;
  const changes: ModeChange[] = [];
  let frame = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    frame += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target as Element;
      if (target === html) {
        if (record.attributeName === "class") {
          const had = (record.oldValue ?? "").split(/\s+/).includes("cd-shell-no-transition");
          const has = html.classList.contains("cd-shell-no-transition");
          if (had !== has)
            changes.push({ part: "no-transition", value: has ? "on" : "off", frame });
        } else if (record.attributeName === "data-cd-theme") {
          changes.push({ part: "theme", value: html.getAttribute("data-cd-theme"), frame });
        } else if (record.attributeName === "data-cd-kontrast") {
          changes.push({ part: "kontrast", value: html.getAttribute("data-cd-kontrast"), frame });
        }
      } else if (target.localName === "meta") {
        const name = target.getAttribute("name");
        const media = target.getAttribute("media");
        changes.push({
          part: name === "color-scheme" ? "color-scheme" : "theme-color",
          value: `${target.getAttribute("content") ?? ""}${media ? ` ${media}` : ""}`,
          frame,
        });
      }
    }
  });
  observer.observe(html, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["data-cd-theme", "data-cd-kontrast", "class"],
  });
  for (const meta of document.querySelectorAll(
    'meta[name="color-scheme"], meta[name="theme-color"]',
  )) {
    observer.observe(meta, { attributes: true, attributeFilter: ["content"] });
  }
  tools.modeWatch = {
    changes,
    stop() {
      running = false;
      observer.disconnect();
    },
  };
};

/** The changes `watchModeProbe` recorded since it started; stops the recording. */
export const modeChangesProbe = (_: null): ModeChange[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const watch = tools.modeWatch;
  if (!watch) return [];
  watch.stop();
  tools.modeWatch = undefined;
  return [...watch.changes];
};

/** What the top row decision of guide §5.15 reads, as the shell measures it. */
export interface TopRowFacts {
  container: Size;
  paletteRow: "top" | "second-row";
  /** The palette's intrinsic border-box width (`offsetWidth − clientWidth + scrollWidth`). */
  paletteWidth: number | null;
  /** Right edge of the menu trigger, relative to the root. */
  menuRight: number | null;
  primary: {
    box: RelativeBox;
    client: Point;
    /** The root's `data-primary="collapsed"`. */
    collapsed: boolean;
    ariaLabel: string | null;
    describedBy: string | null;
    /** Text of the visible label; `null` while no label shows. */
    label: string | null;
  } | null;
}

/** The page's viewport, which a harness may frame around the shell root (an embedded host). */
export const viewportProbe = (_: null): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/** The legal line and each of its links, relative to the root (guide §5.10). */
export interface LegalLineFacts {
  container: { width: number; height: number };
  legal: RelativeBox | null;
  links: Array<{
    text: string;
    box: RelativeBox;
    /** Vertical centre of each line the link's text renders on, relative to the root. */
    lines: number[];
  }>;
  /** The visible `aria-hidden` separators, each with the index of the link after it in document order. */
  separators: Array<{ centerY: number; next: number | null }>;
}

export const legalLineProbe = ({ root }: { root: string }): LegalLineFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const legal = rootElement.querySelector('[data-chrome="legal"]');
  const rootTop = rootElement.getBoundingClientRect().top + rootElement.clientTop;
  const text = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
  const links = [...(legal?.querySelectorAll("a") ?? [])];
  const linesOf = (link: Element): number[] => {
    const range = document.createRange();
    range.selectNodeContents(link);
    const centres = [...range.getClientRects()]
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => Math.round(rect.top + rect.height / 2 - rootTop));
    return [...new Set(centres)].filter(
      (centre, index, all) => all.findIndex((other) => Math.abs(other - centre) < 4) === index,
    );
  };
  const separators = [...(legal?.querySelectorAll('[aria-hidden="true"]') ?? [])].filter(
    (element) => tools.visible(element) && text(element) !== "" && !element.querySelector("a"),
  );
  return {
    container: tools.container(rootElement),
    legal: legal && tools.visible(legal) ? tools.box(legal, rootElement) : null,
    links: links.map((link) => ({
      text: text(link),
      box: tools.box(link, rootElement),
      lines: linesOf(link),
    })),
    separators: separators.map((separator) => {
      const next = links.findIndex(
        (link) =>
          (separator.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
      const rect = separator.getBoundingClientRect();
      return { centerY: rect.top + rect.height / 2 - rootTop, next: next === -1 ? null : next };
    }),
  };
};

export const topRowProbe = ({ root }: { root: string }): TopRowFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const palette = rootElement.querySelector<HTMLElement>('[data-chrome="palette"]');
  const menu = rootElement.querySelector('[data-chrome="menu"]');
  const primary = rootElement.querySelector('[data-chrome="primary"]');
  const menuBox = menu && tools.visible(menu) ? tools.box(menu, rootElement) : null;
  let primaryFacts: TopRowFacts["primary"] = null;
  if (primary && tools.visible(primary)) {
    const rect = primary.getBoundingClientRect();
    const labels = [...primary.querySelectorAll("span")].filter(
      (span) => tools.visible(span) && (span.textContent ?? "").trim() !== "",
    );
    primaryFacts = {
      box: tools.box(primary, rootElement),
      client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      collapsed: rootElement.getAttribute("data-primary") === "collapsed",
      ariaLabel: primary.getAttribute("aria-label"),
      describedBy: primary.getAttribute("aria-describedby"),
      label:
        labels.length > 0 ? labels.map((span) => (span.textContent ?? "").trim()).join(" ") : null,
    };
  }
  return {
    container: tools.container(rootElement),
    paletteRow: rootElement.getAttribute("data-palette") === "second-row" ? "second-row" : "top",
    paletteWidth: palette ? palette.offsetWidth - palette.clientWidth + palette.scrollWidth : null,
    menuRight: menuBox ? menuBox.left + menuBox.width : null,
    primary: primaryFacts,
  };
};

/** Counts the `click` events that reach the first match of `selector` (removed with the stand-ins). */
export const countClicksProbe = ({
  root,
  selector,
}: {
  root: string;
  selector: string;
}): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const element = document.querySelector(root)?.querySelector(selector);
  if (!element) return false;
  tools.clicks = 0;
  const listener = () => {
    tools.clicks += 1;
  };
  element.addEventListener("click", listener, true);
  tools.cleanups.push(() => element.removeEventListener("click", listener, true));
  return true;
};

export const clicksProbe = (_: null): number =>
  (window as ToolWindow).__modelerShellConformance!.clicks;

/** The web app's start screen and what it hides (guide §8). */
export interface EmptyStateFacts {
  /** The root's `data-empty-state="shown"`. */
  shown: boolean;
  card: { visible: boolean; box: RelativeBox; tag: string; labelledBy: string | null } | null;
  komet: { tag: string; alt: string | null; width: number; height: number } | null;
  heading: { tag: string; text: string } | null;
  buttons: Array<{ variant: string | null; name: string; height: number; client: Point }>;
  hint: string | null;
  /**
   * The last link or button of the hint (the card's last paragraph), with its `aria-keyshortcuts`,
   * the text of the `kbd` chip after it and whether its own `text-decoration-line` underlines it.
   */
  openLink: {
    name: string;
    keyShortcuts: string | null;
    chip: string | null;
    underlined: boolean;
  } | null;
  /** Each island of the work chrome in the DOM, with its computed visibility. */
  work: Array<{ name: string; visibility: string; visible: boolean }>;
  /** The canvas slot (`.cd-shell-canvas`) is `inert`. */
  canvasInert: boolean;
  legalVisible: boolean;
}

export const emptyStateProbe = ({
  root,
  work,
}: {
  root: string;
  work: readonly string[];
}): EmptyStateFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const card = rootElement.querySelector('[data-chrome="empty-state"]');
  const image = card?.querySelector("img") ?? null;
  const heading = card?.querySelector("h1, h2, h3, h4, h5, h6") ?? null;
  const labelledBy = card?.getAttribute("aria-labelledby");
  const parts: Array<[string, Element | null]> = work.map((name) => [
    name,
    rootElement.querySelector(`[data-chrome="${name}"]`),
  ]);
  parts.push(["hint", rootElement.querySelector(".cd-shell-hint")]);
  const legal = rootElement.querySelector('[data-chrome="legal"]');
  const hintParagraph = [...(card?.querySelectorAll("p") ?? [])]
    .filter((paragraph) => (paragraph.textContent ?? "").trim() !== "")
    .at(-1);
  const link = [...(hintParagraph?.querySelectorAll("a[href], button") ?? [])]
    .filter((element) => tools.visible(element))
    .at(-1);
  const chip = link
    ? [...(hintParagraph?.querySelectorAll("kbd") ?? [])].find(
        (kbd) =>
          tools.visible(kbd) &&
          (link.compareDocumentPosition(kbd) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      )
    : undefined;
  return {
    shown: rootElement.getAttribute("data-empty-state") === "shown",
    card: card
      ? {
          visible: tools.visible(card),
          box: tools.box(card, rootElement),
          tag: card.tagName.toLowerCase(),
          labelledBy: labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
                .join(" ")
                .trim()
            : null,
        }
      : null,
    komet: image
      ? {
          tag: image.tagName.toLowerCase(),
          alt: image.getAttribute("alt"),
          width: image.getBoundingClientRect().width,
          height: image.getBoundingClientRect().height,
        }
      : null,
    heading: heading
      ? {
          tag: heading.tagName.toLowerCase(),
          text: (heading.textContent ?? "").replace(/\s+/g, " ").trim(),
        }
      : null,
    // The card's actions; a text link inside the hint paragraph is no action (guide §8).
    buttons: [...(card?.querySelectorAll("button") ?? [])]
      .filter((button) => tools.visible(button) && !button.closest("p"))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          variant: button.getAttribute("data-variant"),
          name: (button.getAttribute("aria-label") ?? button.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          height: rect.height,
          client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
      }),
    hint:
      [...(card?.querySelectorAll("p") ?? [])]
        .map((paragraph) => (paragraph.textContent ?? "").trim())
        .filter(Boolean)
        .at(-1) ?? null,
    openLink: link
      ? {
          name: (link.getAttribute("aria-label") ?? link.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          keyShortcuts: link.getAttribute("aria-keyshortcuts"),
          chip: chip?.textContent?.trim() || null,
          underlined: getComputedStyle(link).textDecorationLine.split(/\s+/).includes("underline"),
        }
      : null,
    work: parts
      .filter((part): part is [string, Element] => part[1] !== null)
      .map(([name, element]) => ({
        name,
        visibility: getComputedStyle(element).visibility,
        visible: tools.visible(element),
      })),
    canvasInert: rootElement.querySelector(".cd-shell-canvas")?.hasAttribute("inert") ?? false,
    legalVisible: legal ? tools.visible(legal) : false,
  };
};

/** Where the focus is: the island (`data-chrome`) around it, the canvas, `<body>` or outside the root. */
export const focusOwnerProbe = ({
  root,
}: {
  root: string;
}): { owner: string; description: string } => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const active = document.activeElement;
  const rootElement = document.querySelector(root);
  if (!active || active === document.body || active === document.documentElement) {
    return { owner: "body", description: "<body>" };
  }
  const description = tools.describe(active);
  if (!rootElement?.contains(active)) return { owner: "outside", description };
  if (active.closest(".djs-container")) return { owner: "canvas", description };
  const island = active.closest("[data-chrome]")?.getAttribute("data-chrome");
  return { owner: island ?? "other", description };
};

/** Removes the focus, so the next Tab starts at the beginning of the document. */
export const blurProbe = (_: null): void => {
  (document.activeElement as HTMLElement | null)?.blur?.();
};

/** One toast of the stack (guide §8). */
export interface ToastFacts {
  text: string;
  role: string | null;
  /** `data-status` of the card. */
  status: string | null;
  box: RelativeBox;
  client: Point;
  /** Its buttons: the action (with text) and Close (an icon with `aria-label`). */
  buttons: Array<{ name: string; text: string; client: Point }>;
  /** Whether the card is what a pointer at its centre reaches (nothing in the top layer above it). */
  topmost: boolean;
  focused: boolean;
  /** The card's width at `width: max-content` without width limits: what its content needs. */
  contentWidth: number;
}

/** One of the toasts' live regions (`.cd-shell-live [role]`), rendered whether a toast shows or not. */
export interface LiveRegionFacts {
  role: string | null;
  live: string | null;
  text: string;
}

export interface ToastsFacts {
  /** `[data-chrome="toasts"]`; `null` where there is none (the IDE and embedded hosts). */
  stack: {
    visible: boolean;
    box: RelativeBox;
    popover: string | null;
    popoverOpen: boolean;
  } | null;
  /** The visible toasts (`[data-status]` cards of the stack), in DOM order (the newest last). */
  toasts: ToastFacts[];
  /** Toast cards (`.cd-shell-toast`) visible anywhere in the document outside the stack. */
  strays: string[];
  /** The live regions in the root that announce the toasts. */
  live: LiveRegionFacts[];
}

export const toastsProbe = ({ root }: { root: string }): ToastsFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const stack = rootElement.querySelector<HTMLElement>('[data-chrome="toasts"]');
  const open = (element: HTMLElement): boolean => {
    try {
      return element.matches(":popover-open");
    } catch {
      return false;
    }
  };
  const toasts = stack
    ? [...stack.querySelectorAll<HTMLElement>(":scope > [data-status]")].filter((toast) =>
        tools.visible(toast),
      )
    : [];
  const name = (element: Element) =>
    (element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
  const centre = (element: Element): Point => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  // Measured and restored in one task, so no frame ever paints the probe's width.
  const contentWidth = (card: HTMLElement): number => {
    const saved = ["width", "min-width", "max-width"].map(
      (property) =>
        [
          property,
          card.style.getPropertyValue(property),
          card.style.getPropertyPriority(property),
        ] as const,
    );
    card.style.setProperty("width", "max-content", "important");
    card.style.setProperty("min-width", "0", "important");
    card.style.setProperty("max-width", "none", "important");
    const width = card.getBoundingClientRect().width;
    for (const [property, value, priority] of saved) {
      if (value) card.style.setProperty(property, value, priority);
      else card.style.removeProperty(property);
    }
    return width;
  };
  return {
    stack: stack
      ? {
          visible: tools.visible(stack),
          box: tools.box(stack, rootElement),
          popover: stack.getAttribute("popover"),
          popoverOpen: open(stack),
        }
      : null,
    toasts: toasts.map((toast) => {
      const point = centre(toast);
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        text: (toast.textContent ?? "").replace(/\s+/g, " ").trim(),
        role: toast.getAttribute("role"),
        status: toast.getAttribute("data-status"),
        box: tools.box(toast, rootElement),
        client: point,
        buttons: [...toast.querySelectorAll("button")]
          .filter((button) => tools.visible(button))
          .map((button) => ({
            name: name(button),
            text: (button.textContent ?? "").replace(/\s+/g, " ").trim(),
            client: centre(button),
          })),
        topmost: hit !== null && toast.contains(hit),
        focused: toast.contains(document.activeElement),
        contentWidth: contentWidth(toast),
      };
    }),
    strays: [...document.querySelectorAll(".cd-shell-toast")]
      .filter((element) => !stack?.contains(element) && tools.visible(element))
      .map((element) => tools.describe(element)),
    live: [
      ...rootElement.querySelectorAll(".cd-shell-live [role], .cd-shell-live [aria-live]"),
    ].map((region) => ({
      role: region.getAttribute("role"),
      live: region.getAttribute("aria-live"),
      text: (region.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  };
};

/** Focuses the button named `name` in the toast whose text contains `text`. */
export const focusToastButtonProbe = ({
  root,
  text,
  name,
}: {
  root: string;
  text: string;
  name: string;
}): boolean => {
  const stack = document.querySelector(root)?.querySelector('[data-chrome="toasts"]');
  const toast = [...(stack?.querySelectorAll<HTMLElement>(":scope > [data-status]") ?? [])].find(
    (candidate) => (candidate.textContent ?? "").includes(text),
  );
  const button = [...(toast?.querySelectorAll("button") ?? [])].find(
    (candidate) =>
      (candidate.getAttribute("aria-label") ?? candidate.textContent ?? "").trim() === name,
  );
  if (!button) return false;
  button.focus();
  return document.activeElement === button;
};

/**
 * Records the toast stack's popover toggles from now on (`beforetoggle`), so the kit sees whether a
 * toast shown over a modal dialog raised the stack in the top layer again.
 */
export const watchToastStackProbe = ({ root }: { root: string }): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const stack = document.querySelector(root)?.querySelector('[data-chrome="toasts"]');
  if (!stack) return false;
  const seen: string[] = [];
  const listener = (event: Event) => seen.push((event as ToggleEvent).newState);
  stack.addEventListener("beforetoggle", listener);
  tools.cleanups.push(() => stack.removeEventListener("beforetoggle", listener));
  tools.toastToggles = seen;
  return true;
};

/** The toggles `watchToastStackProbe` recorded, and whether the stack is shown in the top layer now. */
export const toastStackTogglesProbe = ({
  root,
}: {
  root: string;
}): { toggles: string[]; open: boolean } => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const stack = document.querySelector(root)?.querySelector('[data-chrome="toasts"]');
  let open = false;
  try {
    open = stack?.matches(":popover-open") ?? false;
  } catch {
    open = false;
  }
  return { toggles: [...(tools.toastToggles ?? [])], open };
};

/** A `<dialog>` opened with `showModal()` in the top layer, as a modeler's dialog (removed with the stand-ins). */
export const showModalProbe = (_: null): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("data-modeler-shell-conformance", "show-modal");
  dialog.setAttribute("aria-label", "Conformance stand-in");
  dialog.style.cssText = "width:60vw;height:60vh;max-width:none;max-height:none;";
  document.body.append(dialog);
  tools.injected.push(dialog);
  dialog.showModal();
  try {
    return dialog.matches(":modal");
  } catch {
    return dialog.open;
  }
};

/** The pill, the web app's problems list it opens, its rows and where the focus is (guide §5.10). */
export interface PopoverFacts {
  pill: {
    attributes: Record<string, string>;
    box: RelativeBox;
    client: Point;
    visible: boolean;
  } | null;
  popover: {
    attributes: Record<string, string>;
    box: RelativeBox;
    visible: boolean;
    /** Text of its `aria-labelledby` targets. */
    title: string | null;
  } | null;
  rows: Array<{ button: boolean; height: number; icon: boolean; text: string; client: Point }>;
  focus: "pill" | "popover" | "canvas" | "body" | "other";
  focused: string;
  /**
   * The row holding the focus: its index among `rows`, and whether it lies inside the visible part
   * of the scrolling list; `null` while no row holds it.
   */
  focusedRow: { index: number; inView: boolean } | null;
}

export const popoverProbe = ({ root }: { root: string }): PopoverFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const pill = rootElement.querySelector('[data-chrome="problems"]');
  const controls = pill?.getAttribute("aria-controls");
  const popover =
    (controls ? document.getElementById(controls) : null) ??
    rootElement.querySelector('[data-chrome="problems-popover"]');
  const attributes = (element: Element) => {
    const all: Record<string, string> = {};
    for (const name of element.getAttributeNames()) all[name] = element.getAttribute(name) ?? "";
    return all;
  };
  const labelledBy = popover?.getAttribute("aria-labelledby");
  const active = document.activeElement;
  const rows = popover
    ? [...popover.querySelectorAll(".cd-shell-problem")].filter((row) => tools.visible(row))
    : [];
  const pillRect = pill?.getBoundingClientRect();
  return {
    pill:
      pill && pillRect
        ? {
            attributes: attributes(pill),
            box: tools.box(pill, rootElement),
            client: {
              x: pillRect.left + pillRect.width / 2,
              y: pillRect.top + pillRect.height / 2,
            },
            visible: tools.visible(pill),
          }
        : null,
    popover: popover
      ? {
          attributes: attributes(popover),
          box: tools.box(popover, rootElement),
          visible: tools.visible(popover),
          title: labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
                .join(" ")
                .trim()
            : null,
        }
      : null,
    rows: rows.map((row) => {
      const target = row.matches("button") ? row : row.querySelector("button");
      const rect = (target ?? row).getBoundingClientRect();
      return {
        button: target !== null,
        height: row.getBoundingClientRect().height,
        icon: row.querySelector("svg") !== null,
        text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
        client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      };
    }),
    focus:
      !active || active === document.body
        ? "body"
        : pill && active === pill
          ? "pill"
          : popover?.contains(active)
            ? "popover"
            : active.closest(".djs-container")
              ? "canvas"
              : "other",
    focused: !active || active === document.body ? "<body>" : tools.describe(active),
    focusedRow: (() => {
      const index = active ? rows.findIndex((row) => row === active || row.contains(active)) : -1;
      const row = rows[index];
      if (!row) return null;
      let scroller: Element | null = row.parentElement;
      while (scroller && scroller !== popover && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      const view = (scroller ?? popover ?? row).getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return { index, inView: box.top >= view.top - 1 && box.bottom <= view.bottom + 1 };
    })(),
  };
};

/** A synthetic drag the kit dispatches: files built in the page, or plain strings (a text drag). */
export interface DragSpec {
  root: string;
  files: readonly DropFixture[];
  strings?: readonly string[];
  steps: ReadonlyArray<"dragenter" | "dragover" | "dragleave" | "drop">;
}

/** The drop zone and the root's state after a drag step (guide §9). */
export interface DropZoneFacts {
  /** The root's `data-drop`. */
  state: string | null;
  /** Per dispatched step: `defaultPrevented` and the `dropEffect` the page set. */
  events: Array<{ type: string; defaultPrevented: boolean; dropEffect: string }>;
  zone: {
    visible: boolean;
    box: RelativeBox;
    ariaHidden: string | null;
    background: string;
    borderStyle: string;
    borderWidth: string;
    borderColor: string;
    radius: string;
    cursor: string;
  } | null;
  chip: { text: string; background: string } | null;
  /** The roles of guide §9 resolved to computed colours inside the root. */
  roles: {
    hover: string;
    interaktion: string;
    dangerFlaeche: string;
    danger: string;
    flaecheHoch: string;
  };
}

export const dragProbe = async (spec: DragSpec): Promise<DropZoneFacts | null> => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(spec.root);
  if (!rootElement) return null;
  const transfer = new DataTransfer();
  for (const file of spec.files) {
    transfer.items.add(new File([file.text], file.name, { type: file.type }));
  }
  for (const text of spec.strings ?? []) transfer.items.add(text, "text/plain");
  const rect = rootElement.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const target = document.elementFromPoint(clientX, clientY) ?? rootElement;
  const events: DropZoneFacts["events"] = [];
  for (const type of spec.steps) {
    const event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: transfer,
      clientX,
      clientY,
    });
    // Chromium ignores dropEffect on a constructed DataTransfer; the kit records what the page sets.
    const effects: Record<string, string> = { dropEffect: "none", effectAllowed: "all" };
    const recorded = new Proxy(transfer, {
      get(target, key) {
        if (key === "dropEffect" || key === "effectAllowed") return effects[key];
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
      set(target, key, value) {
        if (key === "dropEffect" || key === "effectAllowed") {
          effects[key] = String(value);
          return true;
        }
        return Reflect.set(target, key, value, target);
      },
    });
    Object.defineProperty(event, "dataTransfer", { configurable: true, value: recorded });
    target.dispatchEvent(event);
    events.push({
      type,
      defaultPrevented: event.defaultPrevented,
      dropEffect: effects.dropEffect ?? "none",
    });
  }
  await tools.settle();
  const resolve = (role: string): string => {
    const probe = document.createElement("span");
    probe.setAttribute("data-modeler-shell-conformance", "role-probe");
    probe.style.cssText = `position:absolute;visibility:hidden;background-color:var(${role});`;
    rootElement.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  };
  const resolveColor = (role: string): string => {
    const probe = document.createElement("span");
    probe.setAttribute("data-modeler-shell-conformance", "role-probe");
    probe.style.cssText = `position:absolute;visibility:hidden;color:var(${role});`;
    rootElement.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  };
  const zone = rootElement.querySelector('[data-chrome="drop-zone"]');
  const chip = zone?.querySelector(".cd-shell-drop-zone-chip") ?? null;
  const zoneStyle = zone ? getComputedStyle(zone) : null;
  return {
    state: rootElement.getAttribute("data-drop"),
    events,
    zone:
      zone && zoneStyle
        ? {
            visible: tools.visible(zone),
            box: tools.box(zone, rootElement),
            ariaHidden: zone.getAttribute("aria-hidden"),
            background: zoneStyle.backgroundColor,
            borderStyle: zoneStyle.borderTopStyle,
            borderWidth: zoneStyle.borderTopWidth,
            borderColor: zoneStyle.borderTopColor,
            radius: zoneStyle.borderTopLeftRadius,
            cursor: zoneStyle.cursor,
          }
        : null,
    chip: chip
      ? {
          text: (chip.textContent ?? "").replace(/\s+/g, " ").trim(),
          background: getComputedStyle(chip).backgroundColor,
        }
      : null,
    roles: {
      hover: resolve("--cd-ui-hover"),
      interaktion: resolveColor("--cd-ui-interaktion"),
      dangerFlaeche: resolve("--cd-ui-danger-flaeche"),
      danger: resolveColor("--cd-ui-danger"),
      flaecheHoch: resolve("--cd-ui-flaeche-hoch"),
    },
  };
};
