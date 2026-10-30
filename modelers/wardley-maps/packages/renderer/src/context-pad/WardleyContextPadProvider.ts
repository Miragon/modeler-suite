import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Connect from "diagram-js/lib/features/connect/Connect";
import type Create from "diagram-js/lib/features/create/Create";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type {
  ContextPadEntries,
  default as ContextPadProvider,
} from "diagram-js/lib/features/context-pad/ContextPadProvider";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import {
  isWardleyShape,
  isWardleyConnection,
  type WardleyConnection,
  type WardleyShape,
} from "../model/di-types.js";
import type WardleyModeling from "../modeling/WardleyModeling.js";
import type WardleyLabelEditing from "../label-editing/WardleyLabelEditing.js";
import type WardleyEvolveDragging from "../evolve/WardleyEvolveDragging.js";
import type WardleyElementFactory from "../model/WardleyElementFactory.js";
import type WardleyColorPicker from "../color-picker/WardleyColorPicker.js";
import type EvolutionGrid from "../evolution-grid/EvolutionGrid.js";
import type WardleyLinkEditing from "../link-editing/WardleyLinkEditing.js";
import { canHaveLink, linkOf, safeLinkUrl } from "../link-editing/index.js";
import { POPUP_PROVIDER_ID } from "../popup/index.js";
import { isReadOnly } from "../read-only/index.js";
import { focusCanvasWithoutRing, isKeyOnHiddenTarget } from "../a11y/index.js";
import { chromeIcon } from "../draw/lucide.js";

/** Rows of the compact pad: primary actions, then properties, then the destructive action. */
const GROUP_PRIMARY = "edit";
const GROUP_PROPERTIES = "wardley";
const GROUP_DANGER = "danger";

/** Distance (diagram px) below the source at which a keyboard-appended component is placed. */
const KEYBOARD_APPEND_OFFSET = 80;

const PAD_PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);
const PAD_NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * ContextPad entry as a focusable icon button. `draggable=true` is mandatory for entries with a
 * `dragstart` action — otherwise diagram-js does not fire the drag.
 */
function cpHtml(iconSvg: string, label: string, draggable = false): string {
  const name = escapeAttribute(label);
  return `<div class="entry wardley-cp-entry" role="button" tabindex="0" aria-label="${name}"${draggable ? ' draggable="true"' : ""} title="${name}">${iconSvg}</div>`;
}

/** Context actions per element (concept doc §5.5). */
export default class WardleyContextPadProvider implements ContextPadProvider {
  static $inject = [
    "contextPad",
    "modeling",
    "connect",
    "create",
    "popupMenu",
    "wardleyModeling",
    "wardleyLabelEditing",
    "wardleyEvolveDragging",
    "wardleyElementFactory",
    "wardleyColorPicker",
    "eventBus",
    "canvas",
    "injector",
  ];

  /** Synthetic clicks created for Enter/Space, so actions can pick a pointer-free variant. */
  private readonly keyboardEvents = new WeakSet<Event>();

  constructor(
    private readonly contextPad: ContextPad,
    private readonly modeling: Modeling,
    private readonly connect: Connect,
    private readonly create: Create,
    private readonly popupMenu: PopupMenu,
    private readonly wardleyModeling: WardleyModeling,
    private readonly labelEditing: WardleyLabelEditing,
    private readonly evolveDragging: WardleyEvolveDragging,
    private readonly factory: WardleyElementFactory,
    private readonly colorPicker: WardleyColorPicker,
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly injector: Injector,
  ) {
    contextPad.registerProvider(this);
    eventBus.on("contextPad.create", (event: { pad: HTMLElement }) => {
      event.pad.setAttribute("role", "toolbar");
      event.pad.setAttribute("aria-label", "Element actions");
      event.pad.addEventListener("keydown", (keyEvent) => this.onPadKeydown(keyEvent, event.pad));
    });
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    if (isReadOnly(this.injector)) return {};
    if (isWardleyConnection(element)) return this.connectionEntries(element);
    if (!isWardleyShape(element)) return {};
    const shape = element as WardleyShape;
    // Insertion order is render order: diagram-js creates a group row on its first entry.
    const entries: ContextPadEntries = {};
    this.addPrimaryEntries(shape, entries);
    this.addPropertyEntries(shape, entries);
    entries["delete"] = {
      group: GROUP_DANGER,
      title: "Delete",
      html: cpHtml(chromeIcon("trash"), "Delete"),
      action: {
        click: this.focusingCanvas(() =>
          this.modeling.removeElements([shape as unknown as Element]),
        ),
      },
    };
    return entries;
  }

  /** Connections: edit the annotation (or the flow value of an imported flow link) + delete. */
  private connectionEntries(conn: WardleyConnection): ContextPadEntries {
    const isFlow = conn.wardleyType === "flow";
    const editTitle = isFlow ? "Edit flow value" : "Edit link annotation";
    return {
      "edit-value": {
        group: GROUP_PRIMARY,
        title: editTitle,
        html: cpHtml(chromeIcon("pencil"), editTitle),
        action: { click: () => this.labelEditing.activateConnection(conn) },
      },
      delete: {
        group: GROUP_DANGER,
        title: "Delete connection",
        html: cpHtml(chromeIcon("trash"), "Delete connection"),
        action: {
          click: this.focusingCanvas(() =>
            this.modeling.removeElements([conn as unknown as Element]),
          ),
        },
      },
    };
  }

  /** Row 1: edit label, append, connect, evolve. */
  private addPrimaryEntries(shape: WardleyShape, entries: ContextPadEntries): void {
    // Drawings have no label (pure geometry); regions are unlabelled like in OWM.
    if (shape.wardleyType !== "drawing" && shape.wardleyType !== "attitude") {
      entries["edit-label"] = {
        group: GROUP_PRIMARY,
        title: "Edit label",
        html: cpHtml(chromeIcon("pencil"), "Edit label"),
        action: { click: () => this.labelEditing.activate(shape) },
      };
    }

    const connectable =
      shape.wardleyType === "component" ||
      shape.wardleyType === "anchor" ||
      shape.wardleyType === "submap" ||
      shape.wardleyType === "pipeline";
    if (connectable) {
      // Append component: drags out a new (blank) component and creates the arrow automatically
      // (diagram-js Create with `source` -> modeling.appendShape). Configurable via ⚙.
      const startAppend = this.focusingCanvas((event: Event) => {
        if (this.keyboardEvents.has(event)) {
          this.appendBelow(shape);
          return;
        }
        const next = this.factory.createNew("component", "Component");
        this.create.start(event as MouseEvent, next as unknown as Element, {
          source: shape as unknown as Element,
        });
      });
      entries["append"] = {
        group: GROUP_PRIMARY,
        title: "Append component (auto-connect)",
        html: cpHtml(chromeIcon("circle-plus"), "Append component", true),
        action: { click: startAppend, dragstart: startAppend },
      };

      const startConnect = this.focusingCanvas((event: Event) => {
        this.connect.start(event as MouseEvent, shape as unknown as Element);
      });
      entries["connect"] = {
        group: GROUP_PRIMARY,
        title: "Connect to existing element (A)",
        html: cpHtml(chromeIcon("arrow-right"), "Connect to existing element (A)", true),
        action: { click: startConnect, dragstart: startConnect },
      };
    }

    if (shape.wardleyType === "component") {
      if (shape.movement) {
        // Target is set -> drag the red target circle directly to MOVE it
        // (see WardleyEvolveDragging). Here we only offer removal.
        entries["evolve-clear"] = {
          group: GROUP_PRIMARY,
          title: "Remove evolve",
          html: cpHtml(chromeIcon("chevrons-right-x"), "Remove evolve"),
          action: { click: this.focusingCanvas(() => this.wardleyModeling.clearMovement(shape)) },
        };
      } else if (shape.evolution < 0.999) {
        // Drag the target out along the axis (live preview). The click does NOT model immediately
        // (no automatic +0.2 anymore) — it only starts the placement. At evolution ~ 1 there is
        // no meaningful target left — the entry is omitted (instead of creating a null movement).
        const startEvolve = this.focusingCanvas((event: Event) =>
          this.evolveDragging.start(event, shape),
        );
        entries["evolve"] = {
          group: GROUP_PRIMARY,
          title: "Evolve: drag to set the target maturity",
          html: cpHtml(
            chromeIcon("chevrons-right"),
            "Evolve: drag to set the target maturity",
            true,
          ),
          action: { click: startEvolve, dragstart: startEvolve },
        };
      }
    }
  }

  /** Row 2: settings, line style, colour, link. */
  private addPropertyEntries(shape: WardleyShape, entries: ContextPadEntries): void {
    if (shape.wardleyType === "component") {
      entries["settings"] = {
        group: GROUP_PROPERTIES,
        title: "Settings (type, sourcing, inertia)",
        html: cpHtml(chromeIcon("sliders-horizontal"), "Settings (type, sourcing, inertia)"),
        action: {
          click: (event: Event) => {
            const e = event as MouseEvent;
            this.popupMenu.open(shape as unknown as Element, POPUP_PROVIDER_ID, {
              x: e.clientX,
              y: e.clientY,
            });
          },
        },
      };
    }

    // Drawings: cycle the stroke style (solid -> dashed -> dotted).
    if (shape.wardleyType === "drawing") {
      const next =
        shape.strokeStyle === "dashed"
          ? "dotted"
          : shape.strokeStyle === "dotted"
            ? undefined
            : "dashed";
      const title = `Line style: ${shape.strokeStyle ?? "solid"} (click to change)`;
      entries["stroke-style"] = {
        group: GROUP_PROPERTIES,
        title,
        html: cpHtml(chromeIcon("line-style"), title),
        action: {
          click: this.focusingCanvas(() =>
            this.wardleyModeling.updateProperties(shape, { strokeStyle: next }),
          ),
        },
      };
    }

    // Color is available on EVERY element (model-wide `color`, DSL extension `(color ...)`).
    entries["color"] = {
      group: GROUP_PROPERTIES,
      title: "Color",
      html: cpHtml(chromeIcon("palette"), "Color"),
      action: {
        click: (event: Event) => {
          const e = event as MouseEvent;
          this.colorPicker.open(shape, e.clientX, e.clientY);
        },
      },
    };

    // OWM `url(...)`: set the address (submap drill-down / component link) and open it.
    const linkEditing = this.injector.get<WardleyLinkEditing>("wardleyLinkEditing", false);
    const storedLink = linkOf(shape);
    if (linkEditing && canHaveLink(shape)) {
      const title = storedLink ? "Edit link…" : "Set link…";
      entries["link"] = {
        group: GROUP_PROPERTIES,
        title,
        html: cpHtml(chromeIcon("link"), title),
        action: { click: () => linkEditing.activate(shape) },
      };
    }
    // Shared maps can carry any address, so only allowlisted ones are ever opened.
    const openableLink = safeLinkUrl(storedLink);
    if (openableLink) {
      entries["open-link"] = {
        group: GROUP_PROPERTIES,
        title: `Open link (${openableLink})`,
        html: cpHtml(chromeIcon("external-link"), `Open link (${openableLink})`),
        action: {
          click: this.focusingCanvas(() =>
            window.open(openableLink, "_blank", "noopener,noreferrer"),
          ),
        },
      };
    }
  }

  /**
   * For an entry that opens no editor or popup: after a pointer click or drag it hands the focus to
   * the canvas (guide §5.8), whose keys act only while it has the focus. The clicked entry took the
   * focus and goes away when the pad re-renders or closes, which would leave it on `<body>`. Enter
   * and Space keep it in the pad (`onPadKeydown`).
   */
  private focusingCanvas(action: (event: Event) => void): (event: Event) => void {
    return (event) => {
      action(event);
      if (!this.keyboardEvents.has(event)) focusCanvasWithoutRing(this.canvas);
    };
  }

  /** Enter/Space on a focused entry = a click at the element's centre. */
  private onPadKeydown(event: KeyboardEvent, pad: HTMLElement): void {
    if (event.altKey || event.ctrlKey || event.metaKey || isKeyOnHiddenTarget(event)) return;
    const entry = (event.target as Element | null)?.closest?.(".entry");
    const action = entry?.getAttribute("data-action");
    if (!entry || !action || !pad.contains(entry)) return;

    // Toolbar navigation, stopped here: no listener further up acts on these keys too.
    const entries = Array.from(pad.querySelectorAll<HTMLElement>(".entry"));
    const index = entries.indexOf(entry as HTMLElement);
    let next: HTMLElement | undefined;
    if (PAD_PREVIOUS_KEYS.has(event.key))
      next = entries[(index - 1 + entries.length) % entries.length];
    else if (PAD_NEXT_KEYS.has(event.key)) next = entries[(index + 1) % entries.length];
    else if (event.key === "Home") next = entries[0];
    else if (event.key === "End") next = entries[entries.length - 1];
    if (next || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (next) next.focus();
      else this.canvas.focus();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();

    const target = (this.contextPad as unknown as { _current?: { target?: unknown } })._current
      ?.target;
    const point = this.clientCenterOf(Array.isArray(target) ? target[0] : target);
    const click = new MouseEvent("click", { bubbles: true, clientX: point.x, clientY: point.y });
    this.keyboardEvents.add(click);
    this.contextPad.triggerEntry(action, "click", click);

    // Actions that close the pad (delete, …) would otherwise drop focus onto <body>.
    const focused = document.activeElement;
    if (!pad.isConnected && (!focused || focused === document.body)) this.canvas.focus();
  }

  private clientCenterOf(element: unknown): { x: number; y: number } {
    const containerBounds = this.canvas.getContainer().getBoundingClientRect();
    const viewbox = this.canvas.viewbox();
    let center = { x: viewbox.x + viewbox.width / 2, y: viewbox.y + viewbox.height / 2 };
    if (isWardleyConnection(element)) {
      const first = element.waypoints[0];
      const last = element.waypoints[element.waypoints.length - 1];
      if (first && last) center = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    } else if (isWardleyShape(element)) {
      center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    }
    return {
      x: containerBounds.left + (center.x - viewbox.x) * viewbox.scale,
      y: containerBounds.top + (center.y - viewbox.y) * viewbox.scale,
    };
  }

  /**
   * Keyboard append: there is no pointer to drag the new component to, so it is placed one step
   * further down the value chain, connected, selected and opened for naming.
   */
  private appendBelow(source: WardleyShape): void {
    const grid = this.injector.get<EvolutionGrid>("evolutionGrid");
    const plotBottom = grid.toCanvas({ evolution: 0, visibility: 0 }).y;
    const next = this.factory.createNew("component", "Component");
    const position = {
      x: source.x + source.width / 2,
      y: Math.min(
        source.y + source.height / 2 + KEYBOARD_APPEND_OFFSET,
        plotBottom - next.height / 2,
      ),
    };
    const created = this.modeling.appendShape(
      source as unknown as Shape,
      next as unknown as Shape,
      position,
      (source as unknown as Shape).parent!,
      { connection: { wardleyType: "dependency" } },
    );
    this.injector
      .get<{ select(element: unknown): void }>("selection", false)
      ?.select(created ?? next);
    this.labelEditing.activate((created ?? next) as unknown as WardleyShape);
  }
}
