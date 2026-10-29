/**
 * Per-element quick actions (diagram-js context pad + popup menus), so every
 * embedder of the Modeler gets element-level editing out of the box — not just
 * hosts that build their own inspector.
 *
 *  - Bounded context: append a connected context, connect, subdomain type
 *    (menu), owning team (in-place over its caption), rename (in-place direct
 *    editing), description (anchored prompt), delete.
 *  - Relationship: pattern (menu); integration roles (menu) and swap ends
 *    while the pattern is asymmetric; rename, description, delete.
 *  - Multi-selection: delete.
 *
 * Every mutation goes through `cmModeling`/`modeling`, so it is undoable and
 * lands in `exportDocument()`. Role/pattern constraints mirror the reference
 * inspector: upstream roles combine, downstream roles exclude each other, and
 * customer-supplier blocks OHS (upstream) and CF (downstream). Connect, swap
 * ends and delete hand the focus to the canvas, where Delete and Cmd/Ctrl+Z act
 * on what they did. Append opens the subdomain-type menu, which takes the
 * focus and hands it to the canvas when it closes.
 */

import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type {
  ContextPadEntries,
  ContextPadEntry,
  default as ContextPadProvider,
} from "diagram-js/lib/features/context-pad/ContextPadProvider";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { PopupMenuTarget } from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { PopupMenuEntries } from "diagram-js/lib/features/popup-menu/PopupMenuProvider";
import type Connect from "diagram-js/lib/features/connect/Connect";
import type Create from "diagram-js/lib/features/create/Create";
import type AutoPlace from "diagram-js/lib/features/auto-place/AutoPlace";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Scheduler from "diagram-js/lib/features/scheduler/Scheduler";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";
import { asTRBL, getMid } from "diagram-js/lib/layout/LayoutUtil";
import {
  DEFAULT_DISTANCE,
  findFreePosition,
  generateGetNextPosition,
} from "diagram-js/lib/features/auto-place/AutoPlaceUtil";
import {
  ALL_PATTERN_SPECS,
  ALL_SUBDOMAIN_SPECS,
  DOWNSTREAM_ROLES,
  DOWNSTREAM_ROLE_SPECS,
  RELATIONSHIP_PATTERN_SPECS,
  SUBDOMAIN_TYPE_SPECS,
  UPSTREAM_ROLES,
  UPSTREAM_ROLE_SPECS,
} from "@miragon/context-maps-schema-model";
import type {
  DownstreamRole,
  RelationshipPatternSpec,
  UpstreamRole,
} from "@miragon/context-maps-schema-model";
import {
  isCmContext,
  isCmElement,
  isCmRelationship,
  type CmContext,
  type CmElement,
  type CmRelationship,
} from "../model/di-types.js";
import type CmModeling from "../modeling/CmModeling.js";
import type CmLabelEditing from "../label-editing/CmLabelEditing.js";
import type CmElementFactory from "../model/CmElementFactory.js";
import { READ_ONLY_CHANGED_EVENT, type CmReadOnly } from "../read-only/index.js";
import type { CmGestureCancel } from "../gesture-cancel/index.js";
import { escapeMarkup } from "../draw/markup.js";
import { contextIconSvg, relationshipIconSvg, roleChipSvg } from "../draw/palette-icons.js";
import { chromeIcon } from "../draw/lucide.js";
import { handFocusToCanvas } from "../keyboard/canvasFocus.js";

const SUBDOMAIN_MENU = "cm-subdomain-menu";
const PATTERN_MENU = "cm-pattern-menu";
const ROLES_MENU = "cm-roles-menu";

/**
 * The menus a user action leaves open: the subdomain-type menu after an append, so that classifying
 * is one click away, and the integration roles after a toggle, so that combinations need no new
 * click on the pad.
 */
const FOLLOW_UP_MENUS = {
  [SUBDOMAIN_MENU]: { padEntry: "subdomain-type", title: "Subdomain type" },
  [ROLES_MENU]: { padEntry: "roles", title: "Integration roles" },
} as const;

type FollowUpMenuId = keyof typeof FOLLOW_UP_MENUS;

interface FollowUpMenu {
  elementId: string;
  menuId: FollowUpMenuId;
}

const FOLLOW_UP_MENU_STEP = "cmContextPad#followUpMenu";

/** Marks the entry matching the element's current state (check + accent, CSS). */
const ACTIVE_CLASS = "cm-popup-active";
const MENU_GAP = 8;

/** Why OHS / CF are unavailable while the pattern is customer-supplier. */
const CUSTOMER_SUPPLIER_BLOCKERS: Partial<Record<UpstreamRole | DownstreamRole, string>> = {
  OHS: "Open Host Service is one-size-fits-all and not applicable in a customer-supplier relationship.",
  CF: "Conformist is not applicable in a customer-supplier relationship; a customer can negotiate.",
};

function padEntryHtml(
  icon: string,
  title: string,
  options: { draggable?: boolean; danger?: boolean } = {},
): string {
  const draggable = options.draggable ? ` draggable="true"` : "";
  const danger = options.danger ? " cm-pad-entry--danger" : "";
  const label = escapeMarkup(title);
  return `<div class="entry cm-pad-entry${danger}"${draggable} title="${label}" aria-label="${label}">${icon}</div>`;
}

/**
 * Beside the pad entry that opened the card, kept on screen when the entry sits at a viewport
 * edge: no room on the right → flip to the entry's left, bottom → shift up.
 */
function placePromptBeside(card: HTMLElement, anchor: HTMLElement): void {
  const bounds = anchor.getBoundingClientRect();
  card.style.left = `${bounds.right + MENU_GAP}px`;
  card.style.top = `${bounds.top}px`;
  const cardBounds = card.getBoundingClientRect();
  const margin = 8;
  if (cardBounds.right > window.innerWidth - margin) {
    card.style.left = `${Math.max(margin, bounds.left - cardBounds.width - MENU_GAP)}px`;
  }
  if (cardBounds.bottom > window.innerHeight - margin) {
    card.style.top = `${Math.max(margin, window.innerHeight - margin - cardBounds.height)}px`;
  }
}

export default class CmContextPadProvider implements ContextPadProvider {
  static $inject = [
    "contextPad",
    "popupMenu",
    "eventBus",
    "connect",
    "create",
    "autoPlace",
    "rules",
    "dragging",
    "modeling",
    "cmModeling",
    "cmLabelEditing",
    "cmElementFactory",
    "selection",
    "canvas",
    "scheduler",
    "cmReadOnly",
    "cmGestureCancel",
    "elementRegistry",
  ];

  /** The last pad-opened menu, so a roles toggle can re-open it in place. */
  private currentMenu?: { element: CmElement; menuId: string; title: string; position: Point };

  /** The menu open right now that a user action keeps open. */
  private followUpMenu?: FollowUpMenu;
  /** The same, taken before an import closed the menu, until the import has run. */
  private suspendedMenu?: FollowUpMenu;
  /** Releases the user's action the pending step of a follow-up menu holds. */
  private releaseMenuStep?: () => void;

  constructor(
    private readonly contextPad: ContextPad,
    private readonly popupMenu: PopupMenu,
    private readonly eventBus: EventBus,
    connect: Connect,
    private readonly create: Create,
    private readonly autoPlace: AutoPlace,
    private readonly rules: Rules,
    private readonly dragging: Dragging,
    private readonly modeling: Modeling,
    private readonly cmModeling: CmModeling,
    private readonly labelEditing: CmLabelEditing,
    private readonly elementFactory: CmElementFactory,
    private readonly selection: Selection,
    private readonly canvas: Canvas,
    private readonly scheduler: Scheduler,
    private readonly readOnly: Pick<CmReadOnly, "isReadOnly">,
    private readonly gestureCancel: Pick<CmGestureCancel, "isCancellingForClear" | "holdAction">,
    private readonly elementRegistry: ElementRegistry,
  ) {
    // Injecting Connect instantiates it so its connect.* drag handlers exist
    // (same reason as CmConnectHandles — the module does not eagerly init it).
    void connect;
    contextPad.registerProvider(this);
    // A read-only canvas has no context pad (guide §13.5): nothing it offers may change the map.
    eventBus.on("contextPad.open.allowed", 2000, () =>
      this.readOnly.isReadOnly() ? false : undefined,
    );
    eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (event.readOnly) {
        this.cancelPrompt();
        popupMenu.close();
        contextPad.close();
        return;
      }
      // Unlocked with an element still selected: its pad comes back, as a fresh selection would.
      const selected = selection.get() as Element[];
      if (selected.length === 1) contextPad.open(selected[0]!, true);
      else if (selected.length > 1) contextPad.open(selected, true);
    });
    eventBus.on("popupMenu.close", () => {
      this.followUpMenu = undefined;
    });
    popupMenu.registerProvider(SUBDOMAIN_MENU, {
      getPopupMenuEntries: (target: PopupMenuTarget) => this.subdomainMenuEntries(target),
    });
    popupMenu.registerProvider(PATTERN_MENU, {
      getPopupMenuEntries: (target: PopupMenuTarget) => this.patternMenuEntries(target),
    });
    popupMenu.registerProvider(ROLES_MENU, {
      getPopupMenuEntries: (target: PopupMenuTarget) => this.rolesMenuEntries(target),
    });
    // Deconflict auto-placed appends: diagram-js' stock position (right of the
    // source) ignores occupied slots — step downwards until the slot is free.
    // Registered at default priority, beating the stock low-priority listener.
    eventBus.on("autoPlace", (event: { source: Shape; shape: Shape }) => {
      const { source, shape } = event;
      const position = {
        x: asTRBL(source).right + DEFAULT_DISTANCE + shape.width / 2,
        y: getMid(source).y,
      };
      return findFreePosition(
        source,
        shape,
        position,
        generateGetNextPosition({ y: { margin: 30, minDistance: 30 } }),
      );
    });
    // The pad's placement is corrected purely via CSS classes: connections
    // flip it away from the target context their last segment points into.
    eventBus.on("contextPad.create", (event: { target?: unknown; pad?: HTMLElement }) => {
      const { pad, target } = event;
      if (!pad) return;
      let flipX = false;
      let flipY = false;
      if (isCmRelationship(target)) {
        const waypoints = (target.waypoints ?? []) as Point[];
        const last = waypoints[waypoints.length - 1];
        const previous = waypoints[waypoints.length - 2];
        if (last && previous) {
          const dx = last.x - previous.x;
          const dy = last.y - previous.y;
          flipX = Math.abs(dx) >= Math.abs(dy) && dx > 0;
          flipY = Math.abs(dy) > Math.abs(dx) && dy > 0;
        }
      }
      pad.classList.toggle("cm-pad-flip-x", flipX);
      pad.classList.toggle("cm-pad-flip-y", flipY);
    });
    // diagram-js positions the pad without any viewport clamping, and the
    // canvas container clips (overflow: hidden) — pull an overflowing pad back
    // in so its actions stay reachable for shapes at the canvas edge. Runs
    // after diagram-js' own scheduled position update (lower listener priority
    // → later schedule() call → later task).
    eventBus.on(["contextPad.open", "contextPad.show", "canvas.viewbox.changed"], 250, () =>
      this.clampPadIntoView(),
    );
  }

  private clampPadIntoView(): void {
    void this.scheduler.schedule(() => {
      const container = this.canvas.getContainer();
      const pad = container.querySelector<HTMLElement>(".djs-context-pad.open");
      if (!pad) return;
      const containerBounds = container.getBoundingClientRect();
      const padBounds = pad.getBoundingClientRect();
      const margin = 4;
      const overflowRight = padBounds.right - (containerBounds.right - margin);
      if (overflowRight > 0) {
        pad.style.left = `${parseFloat(pad.style.left || "0") - overflowRight}px`;
      }
      // The cm-pad-flip-x transform can carry a connection's pad past the
      // LEFT border (its anchor is the unclamped last waypoint).
      const overflowLeft = containerBounds.left + margin - padBounds.left;
      if (overflowLeft > 0) {
        pad.style.left = `${parseFloat(pad.style.left || "0") + overflowLeft}px`;
      }
      // Vertically pull an overflowing pad up — but never past the top
      // border: when the stack is taller than the canvas, the top actions
      // stay reachable rather than none of them.
      let shiftY = 0;
      const overflowBottom = padBounds.bottom - (containerBounds.bottom - margin);
      if (overflowBottom > 0) shiftY = -overflowBottom;
      const overflowTop = containerBounds.top + margin - (padBounds.top + shiftY);
      if (overflowTop > 0) shiftY += overflowTop;
      if (shiftY !== 0) {
        pad.style.top = `${parseFloat(pad.style.top || "0") + shiftY}px`;
      }
    }, "cmContextPad#clampIntoView");
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    if (this.readOnly.isReadOnly()) return {};
    if (isCmContext(element)) return this.contextEntries(element);
    if (isCmRelationship(element)) return this.relationshipEntries(element);
    return {};
  }

  getMultiElementContextPadEntries(elements: Element[]): ContextPadEntries {
    if (this.readOnly.isReadOnly()) return {};
    const cmElements = elements.filter(isCmElement);
    if (cmElements.length !== elements.length) return {};
    return { delete: this.deleteEntry(cmElements, "Delete selection") };
  }

  // --- bounded context ------------------------------------------------------

  private contextEntries(context: CmContext): ContextPadEntries {
    const spec = context.subdomainType ? SUBDOMAIN_TYPE_SPECS[context.subdomainType] : undefined;
    return {
      "append-context": {
        group: "edit",
        html: padEntryHtml(
          chromeIcon("square-plus"),
          "Append a connected context: click to place automatically, drag to position",
          { draggable: true },
        ),
        action: {
          click: (event: Event) => this.appendContext(event, context),
          dragstart: (event: Event) => this.startAppend(event, context),
        },
      },
      connect: {
        group: "edit",
        html: padEntryHtml(chromeIcon("arrow-right"), "Connect to another context", {
          draggable: true,
        }),
        action: {
          click: (event: Event) => this.startConnect(event, context, true),
          dragstart: (event: Event) => this.startConnect(event, context, false),
        },
      },
      "subdomain-type": {
        group: "edit",
        html: padEntryHtml(
          contextIconSvg(context.subdomainType),
          `Change subdomain type (currently ${spec?.label ?? "unclassified"})`,
        ),
        action: {
          click: (event: Event) => this.openMenu(event, context, SUBDOMAIN_MENU, "Subdomain type"),
        },
      },
      team: {
        group: "edit",
        html: padEntryHtml(
          chromeIcon("users"),
          `Set owning team (currently ${context.team ?? "none"})`,
        ),
        action: { click: () => this.labelEditing.activateTeam(context) },
      },
      "edit-label": this.editLabelEntry(context, "Rename context"),
      description: this.descriptionEntry(context, "Purpose, ubiquitous language, notes…"),
      delete: this.deleteEntry([context], "Delete context"),
    };
  }

  /**
   * Same payload as Connect#start, mirroring CmConnectHandles, but with
   * diagram-js' ghost-click trap OFF for both variants: the trap relies on the
   * gesture-ending canvas click, which Chromium suppresses whenever the
   * mousedown target was re-rendered by the connect command — the unconsumed
   * trap would then swallow the user's NEXT click. The click variant instead
   * blocks exactly one immediately-following element.click itself (when it
   * does fire, it must not re-select the target over the fresh relationship).
   */
  private startConnect(event: Event, source: CmContext, viaClick: boolean): void {
    this.dragging.init(event as MouseEvent, "connect", {
      autoActivate: viaClick,
      trapClick: false,
      data: {
        shape: source,
        context: { start: source, connectionStart: getMid(source) },
      },
    });
    handFocusToCanvas(this.canvas, event);
    if (viaClick) {
      const swallowGestureClick = () => false;
      this.eventBus.once("connect.cleanup", 250, () => {
        this.eventBus.once("element.click", 10000, swallowGestureClick);
        const disarm = (): void => this.eventBus.off("element.click", swallowGestureClick);
        // Dragging binds endDrag to mousedown AND mouseup — the gesture already
        // ends in the *mousedown* of the finishing click, whose click event is
        // only delivered after the following mouseup. Hold the blocker until
        // then: the capture-mouseup runs before the click, the 0ms task after.
        document.addEventListener("mouseup", () => setTimeout(disarm, 0), {
          capture: true,
          once: true,
        });
        // Safety net (same window as diagram-js' ClickTrap): if the click never
        // arrives, the blocker must not eat a later real one.
        setTimeout(disarm, 400);
      });
    }
    // The drag lifecycle clears the selection; the user is still "at" the source, unless an import
    // or a clear cancelled the connect and is about to remove it.
    this.eventBus.once("connect.cleanup", 250, () => {
      if (this.gestureCancel.isCancellingForClear()) return;
      if (this.selection.get().length === 0) this.selection.select(source);
    });
  }

  /**
   * Append a fresh, unclassified context connected to the source. The click
   * variant auto-places it (diagram-js auto-place, which also selects it), the
   * drag variant hands placement to the create tool with a `source` hint —
   * both stamp the connection through the `connection.create` rule. After
   * placement the subdomain-type menu opens so classifying is one click away.
   */
  private appendContext(event: Event, source: CmContext): void {
    const shape = this.elementFactory.createNewContext();
    // CmRules returns the relationship attrs (cmKind + default pattern), not
    // just a boolean — pass them on so the connection is stamped correctly.
    const connection = this.rules.allowed("connection.create", {
      source,
      target: shape,
    }) as unknown as false | null | Record<string, unknown>;
    const appended = this.autoPlace.append(
      source,
      shape,
      connection && typeof connection === "object" ? { connection } : {},
    ) as unknown as CmContext;
    // The type menu opens only while the pad shows on the new context; when it
    // does not, the focus would otherwise stay on <body>.
    handFocusToCanvas(this.canvas, event);
    this.openTypeMenu(appended);
  }

  private startAppend(event: Event, source: CmContext): void {
    const shape = this.elementFactory.createNewContext();
    const onCreated = () => this.openTypeMenu(shape);
    this.eventBus.once("create.end", 250, onCreated);
    // A cancelled create must not leave the armed listener behind — it would
    // fire on the next palette create otherwise.
    this.eventBus.once("create.cleanup", () => this.eventBus.off("create.end", onCreated));
    this.create.start(event as MouseEvent, shape, { source });
    handFocusToCanvas(this.canvas, event);
  }

  /**
   * Open the subdomain-type menu for a freshly appended context, anchored to
   * its pad entry, deferred one task so the pad has been positioned first.
   * The menu is the last step of the user's append: an import a host makes
   * from the append's change listener waits until it is open, then reopens it
   * on the context with the same id (`resumeMenu`), as a label edit follows
   * its element across an import. The Modeler's synchronous `importDocument`
   * does not wait: when it has replaced the context by the time the menu
   * opens, the menu follows the context there. Not when the import removed
   * it, and not when something else is selected by then.
   */
  private openTypeMenu(context: CmContext): void {
    const menu: FollowUpMenu = { elementId: context.id, menuId: SUBDOMAIN_MENU };
    this.scheduleMenuStep(() => {
      const replaced = this.elementRegistry.get(context.id) !== context;
      if (replaced) this.followMenu(menu);
      else this.openMenuOnPad(context, menu.menuId);
    });
  }

  /** Selects the element with the menu's id while nothing is selected, then opens it on its pad. */
  private followMenu(menu: FollowUpMenu): void {
    const current = this.elementRegistry.get(menu.elementId);
    const fits = menu.menuId === SUBDOMAIN_MENU ? isCmContext(current) : isCmRelationship(current);
    if (!fits || this.readOnly.isReadOnly()) return;
    if (this.selection.get().length === 0) this.selection.select(current as unknown as Element);
    this.scheduleMenuStep(() => this.openMenuOnPad(current as CmElement, menu.menuId));
  }

  /**
   * One step of a follow-up menu, a task later; a later step replaces it. Until it has run it
   * holds the user's action, so an import from the action's change listener waits for it.
   */
  private scheduleMenuStep(step: () => void): void {
    const release = this.gestureCancel.holdAction();
    const replaced = this.releaseMenuStep;
    this.releaseMenuStep = release;
    replaced?.();
    void this.scheduler.schedule(() => {
      try {
        step();
      } finally {
        if (this.releaseMenuStep === release) this.releaseMenuStep = undefined;
        release();
      }
    }, FOLLOW_UP_MENU_STEP);
  }

  private openMenuOnPad(element: CmElement, menuId: FollowUpMenuId): void {
    if (!this.contextPad.isOpen(element as unknown as Element)) return;
    const { padEntry, title } = FOLLOW_UP_MENUS[menuId];
    const entry = this.canvas
      .getContainer()
      .querySelector<HTMLElement>(`.djs-context-pad.open [data-action="${padEntry}"]`);
    if (!entry) return;
    this.openMenuBeside(entry.getBoundingClientRect(), element, menuId, title);
    if (this.popupMenu.isOpen()) this.followUpMenu = { elementId: element.id, menuId };
  }

  /** Remembers the menu a user action keeps open, before an import closes it. */
  suspendMenu(): void {
    this.suspendedMenu = this.followUpMenu;
  }

  /** Reopens the remembered menu on the element the import put under the same id. */
  resumeMenu(): void {
    const menu = this.suspendedMenu;
    this.suspendedMenu = undefined;
    if (menu) this.scheduleMenuStep(() => this.followMenu(menu));
  }

  // --- relationship ---------------------------------------------------------

  private relationshipEntries(relationship: CmRelationship): ContextPadEntries {
    // Tolerate unknown patterns (unvalidated imports), like the renderer does:
    // the pad must still open so the pattern menu can repair the element.
    const spec = RELATIONSHIP_PATTERN_SPECS[relationship.pattern] as
      RelationshipPatternSpec | undefined;
    const entries: ContextPadEntries = {
      pattern: {
        group: "edit",
        html: padEntryHtml(
          relationshipIconSvg(spec?.pattern),
          `Change pattern (currently ${spec?.label ?? relationship.pattern})`,
        ),
        action: {
          click: (event: Event) =>
            this.openMenu(event, relationship, PATTERN_MENU, "Relationship pattern"),
        },
      },
    };
    if (spec && !spec.symmetric) {
      entries.roles = {
        group: "edit",
        html: padEntryHtml(
          chromeIcon("sliders-horizontal"),
          "Edit integration roles: OHS/PL upstream, ACL/CF downstream",
        ),
        action: {
          click: (event: Event) =>
            this.openMenu(event, relationship, ROLES_MENU, "Integration roles"),
        },
      };
      entries["swap-ends"] = {
        group: "edit",
        html: padEntryHtml(
          chromeIcon("arrow-left-right"),
          "Swap ends: reverse upstream/downstream",
        ),
        action: {
          click: (event: Event) => {
            this.cmModeling.swapEnds(relationship);
            handFocusToCanvas(this.canvas, event);
          },
        },
      };
    }
    entries["edit-label"] = this.editLabelEntry(relationship, "Edit label");
    entries.description = this.descriptionEntry(relationship, "What flows here, contracts, notes…");
    entries.delete = this.deleteEntry([relationship], "Delete relationship");
    return entries;
  }

  // --- shared entries -------------------------------------------------------

  private editLabelEntry(element: CmElement, title: string): ContextPadEntry {
    return {
      group: "edit",
      html: padEntryHtml(chromeIcon("pencil"), `${title}: edit the name in place`),
      action: { click: () => this.labelEditing.activate(element) },
    };
  }

  private descriptionEntry(element: CmElement, placeholder: string): ContextPadEntry {
    return {
      group: "edit",
      html: padEntryHtml(chromeIcon("text-align-start"), "Edit description"),
      action: {
        click: (event: Event) =>
          this.openPrompt(event, {
            value: element.description ?? "",
            placeholder,
            label: "Description",
            multiline: true,
            onCommit: (value) => this.cmModeling.setDescription(element, value || undefined),
          }),
      },
    };
  }

  /**
   * A small input card anchored beside the clicked pad entry (like the popup
   * menus — below would cover the rest of the vertical stack) — for the
   * free-text properties, which should not open centred over the element.
   * Enter (Ctrl/Cmd+Enter in the multiline variant) and blur commit, Escape
   * cancels.
   */
  private activePrompt?: { cancel(): void };

  /** Closes an open description prompt without saving it (an import replaces its element). */
  cancelPrompt(): void {
    this.activePrompt?.cancel();
  }

  private openPrompt(
    event: Event,
    config: {
      value: string;
      placeholder: string;
      label: string;
      multiline?: boolean;
      onCommit(value: string): void;
    },
  ): void {
    this.activePrompt?.cancel();
    const anchor = ((event as { delegateTarget?: EventTarget }).delegateTarget ??
      event.target) as HTMLElement;

    const card = document.createElement("div");
    card.className = "cm-pad-prompt";

    const field = document.createElement(config.multiline ? "textarea" : "input") as
      HTMLInputElement | HTMLTextAreaElement;
    field.className = "cm-pad-prompt__field";
    field.value = config.value;
    field.placeholder = config.placeholder;
    field.setAttribute("aria-label", config.label);
    if (field instanceof HTMLTextAreaElement) field.rows = 4;
    card.appendChild(field);

    if (config.multiline) {
      const hint = document.createElement("div");
      hint.className = "cm-pad-prompt__hint";
      hint.textContent = "Esc to cancel · ⌘/Ctrl+Enter to save";
      card.appendChild(hint);
    }

    this.canvas.getContainer().appendChild(card);
    placePromptBeside(card, anchor);
    field.focus();
    if (field instanceof HTMLTextAreaElement) {
      // Select-all in a filled textarea makes the first keystroke wipe the
      // text — park the caret at the end instead.
      field.setSelectionRange(field.value.length, field.value.length);
    } else {
      field.select();
    }

    // A pan or zoom moves the pad, also one the host makes (setViewState, a fit): the card follows
    // its entry and keeps the typed text instead of committing it (mirrors the label editor).
    // After the pad's own position update and clamp, which are scheduled at a higher priority.
    const followPad = (): void => {
      void this.scheduler.schedule(() => {
        if (anchor.isConnected) placePromptBeside(card, anchor);
      }, "cmContextPad#placePrompt");
    };
    this.eventBus.on("canvas.viewbox.changed", 200, followPad);

    let done = false;
    const cleanup = (): void => {
      if (done) return;
      done = true;
      this.eventBus.off("canvas.viewbox.changed", followPad);
      this.scheduler.cancel("cmContextPad#placePrompt");
      card.remove();
      this.activePrompt = undefined;
      (this.canvas as { restoreFocus?: () => void }).restoreFocus?.();
    };
    const commit = (): void => {
      if (done) return;
      const value = field.value.trim();
      const changed = value !== config.value.trim();
      cleanup();
      if (changed) config.onCommit(value);
    };
    field.addEventListener("keydown", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        cleanup();
      } else if (
        keyEvent.key === "Enter" &&
        (!config.multiline || keyEvent.ctrlKey || keyEvent.metaKey)
      ) {
        keyEvent.preventDefault();
        commit();
      }
    });
    field.addEventListener("blur", commit);
    this.activePrompt = { cancel: cleanup };
  }

  private deleteEntry(elements: CmElement[], title: string): ContextPadEntry {
    return {
      group: "delete",
      html: padEntryHtml(chromeIcon("trash"), title, { danger: true }),
      action: {
        click: (event: Event) => {
          this.modeling.removeElements(elements as Element[]);
          handFocusToCanvas(this.canvas, event);
        },
      },
    };
  }

  private openMenu(event: Event, element: CmElement, menuId: string, title: string): void {
    const anchor = ((event as { delegateTarget?: EventTarget }).delegateTarget ??
      event.target) as HTMLElement;
    this.openMenuBeside(anchor.getBoundingClientRect(), element, menuId, title);
  }

  /**
   * Menus open beside the clicked entry — beneath it they would cover the
   * rest of the vertical stack. At the viewport's right edge PopupMenu flips
   * an overflowing menu back across its anchor (and the whole pad column), so
   * a flipped menu is pushed fully left of the pad instead; the popup applies
   * its initial position only once, so the correction sticks (and is saved
   * for `reopenMenu`).
   */
  private openMenuBeside(
    entryBounds: DOMRect,
    element: CmElement,
    menuId: string,
    title: string,
  ): void {
    const position = { x: entryBounds.right + MENU_GAP, y: entryBounds.top };
    this.popupMenu.open(element, menuId, position, { title });
    const popup = document.querySelector<HTMLElement>(".djs-popup");
    const popupBounds = popup?.getBoundingClientRect();
    if (popup && popupBounds && popupBounds.left < entryBounds.right) {
      position.x = Math.max(MENU_GAP, entryBounds.left - MENU_GAP - popupBounds.width);
      popup.style.left = `${position.x}px`;
    }
    this.currentMenu = { element, menuId, title, position };
  }

  /**
   * Re-open a menu after a command: the command stack's `commandStack.changed`
   * auto-closes any popup, but a multi-select menu (integration roles) should
   * survive a toggle so combinations don't require re-opening the pad entry,
   * also across an import a host makes from the toggle's change listener.
   */
  private reopenMenu(element: CmElement, menuId: FollowUpMenuId): void {
    const menu = this.currentMenu;
    if (!menu || menu.menuId !== menuId || menu.element !== element) return;
    this.popupMenu.open(element, menuId, menu.position, { title: menu.title });
    if (this.popupMenu.isOpen()) this.followUpMenu = { elementId: element.id, menuId };
  }

  // --- popup menus ----------------------------------------------------------

  private subdomainMenuEntries(target: PopupMenuTarget): PopupMenuEntries {
    if (!isCmContext(target)) return {};
    const current = target.subdomainType;
    const entries: PopupMenuEntries = {};
    for (const spec of ALL_SUBDOMAIN_SPECS) {
      entries[`type-${spec.type}`] = {
        label: spec.label,
        description: spec.description,
        imageHtml: contextIconSvg(spec.type),
        ...(spec.type === current ? { className: ACTIVE_CLASS } : {}),
        action: () => {
          if (spec.type !== current) this.cmModeling.setSubdomainType(target, spec.type);
        },
      };
    }
    entries["type-none"] = {
      label: "Unclassified",
      description: "No subdomain classification.",
      imageHtml: contextIconSvg(),
      ...(current === undefined ? { className: ACTIVE_CLASS } : {}),
      action: () => {
        if (current !== undefined) this.cmModeling.setSubdomainType(target, undefined);
      },
    };
    return entries;
  }

  private patternMenuEntries(target: PopupMenuTarget): PopupMenuEntries {
    if (!isCmRelationship(target)) return {};
    const current = target.pattern;
    const entries: PopupMenuEntries = {};
    for (const spec of ALL_PATTERN_SPECS) {
      entries[`pattern-${spec.pattern}`] = {
        label: spec.label,
        description: spec.description,
        imageHtml: relationshipIconSvg(spec.pattern),
        ...(spec.pattern === current ? { className: ACTIVE_CLASS } : {}),
        action: () => {
          if (spec.pattern !== current) this.cmModeling.setPattern(target, spec.pattern);
        },
      };
    }
    return entries;
  }

  private rolesMenuEntries(target: PopupMenuTarget): PopupMenuEntries {
    if (!isCmRelationship(target)) return {};
    const spec = RELATIONSHIP_PATTERN_SPECS[target.pattern] as RelationshipPatternSpec | undefined;
    if (!spec || spec.symmetric) return {};
    const customerSupplier = target.pattern === "customer-supplier";
    const upstream = target.upstreamRoles ?? [];
    const downstream = target.downstreamRoles ?? [];
    const entries: PopupMenuEntries = {};

    for (const role of UPSTREAM_ROLES) {
      const active = upstream.includes(role);
      const blocker = customerSupplier ? CUSTOMER_SUPPLIER_BLOCKERS[role] : undefined;
      // A blocked role that is already set (unvalidated import, CML) stays
      // clickable — deselecting it is the repair, not the violation.
      const blocked = blocker !== undefined && !active;
      entries[`upstream-${role}`] = {
        label: UPSTREAM_ROLE_SPECS[role].label,
        description: blocker
          ? active
            ? `${blocker} Click to remove it.`
            : blocker
          : UPSTREAM_ROLE_SPECS[role].description,
        imageHtml: roleChipSvg(role),
        group: { id: "upstream", name: "Upstream (from): OHS and/or PL" },
        ...(blocked ? { disabled: true } : {}),
        ...(active ? { className: ACTIVE_CLASS } : {}),
        action: () => {
          if (blocked) return;
          this.cmModeling.setUpstreamRoles(
            target,
            active ? upstream.filter((existing) => existing !== role) : [...upstream, role],
          );
          this.reopenMenu(target, ROLES_MENU);
        },
      };
    }
    for (const role of DOWNSTREAM_ROLES) {
      const active = downstream.includes(role);
      const blocker = customerSupplier ? CUSTOMER_SUPPLIER_BLOCKERS[role] : undefined;
      const blocked = blocker !== undefined && !active;
      entries[`downstream-${role}`] = {
        label: DOWNSTREAM_ROLE_SPECS[role].label,
        description: blocker
          ? active
            ? `${blocker} Click to remove it.`
            : blocker
          : DOWNSTREAM_ROLE_SPECS[role].description,
        imageHtml: roleChipSvg(role),
        group: { id: "downstream", name: "Downstream (to): ACL or CF, not both" },
        ...(blocked ? { disabled: true } : {}),
        ...(active ? { className: ACTIVE_CLASS } : {}),
        action: () => {
          if (blocked) return;
          this.cmModeling.setDownstreamRoles(target, active ? [] : [role]);
          this.reopenMenu(target, ROLES_MENU);
        },
      };
    }
    return entries;
  }
}
