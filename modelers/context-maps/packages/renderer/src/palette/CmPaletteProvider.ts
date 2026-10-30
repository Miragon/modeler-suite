/**
 * The tool palette: the lasso tool first, then the three subdomain types of bounded context.
 * Relationships are drawn via the context pad's connect arrow, not from the palette. A pointer
 * drags or clicks a context onto the canvas; Enter or Space on an entry (a click without a
 * pointer, `detail === 0`, as the Miragon modeler shell and `CmPaletteToolbar` send it) places it
 * in the centre of the free rectangle instead, selected and with its name editor open (guide
 * §5.5). A pointer on any entry hands the focus to the canvas, also without the shell (guide §5.8).
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Create from "diagram-js/lib/features/create/Create";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type {
  PaletteEntries,
  default as PaletteProvider,
} from "diagram-js/lib/features/palette/PaletteProvider";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";
import type { FreeArea } from "@miragon/modeler-api";
import { ALL_SUBDOMAIN_SPECS } from "@miragon/context-maps-schema-model";
import { contextIconSvg } from "../draw/palette-icons.js";
import { toolIcon } from "../draw/lucide.js";
import type CmLabelEditing from "../label-editing/CmLabelEditing.js";
import type CmElementFactory from "../model/CmElementFactory.js";
import { isCmContext, type CmContext } from "../model/di-types.js";
import type { CmReadOnly } from "../read-only/index.js";
import { handFocusToCanvas, isKeyboardClick } from "../keyboard/canvasFocus.js";
import { freeAreaInsets } from "./freeArea.js";

/** diagram-js highlights tools only inside the group named exactly `tools`. */
const GROUP_TOOLS = "tools";
const GROUP_CONTEXTS = "cm-1-contexts";

/** Guide §5.5: a keyboard-created element lands this far down-right of one already centred there. */
const KEYBOARD_CREATE_OFFSET = 24;

export interface CmPaletteConfig {
  /**
   * The part of the canvas no chrome covers (`@miragon/modeler-api` 1.2), as the host passed it:
   * its insets in px from the container's edges (the modeler shell's `shell.fitInsets()`) or its
   * centre in diagram coordinates (the shell's `viewport.freeRectCenter()`). Without insets, the
   * room the renderer's own palette needs.
   */
  freeArea?: FreeArea | undefined;
}

function entryHtml(icon: string, draggable: boolean): string {
  const drag = draggable ? ` draggable="true"` : "";
  return `<div class="entry cm-palette-entry"${drag}>${icon}</div>`;
}

/** "Supporting Subdomain" → "Supporting subdomain": tooltips are in sentence case (guide §5.6). */
function sentenceCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

export default class CmPaletteProvider implements PaletteProvider {
  static $inject = [
    "palette",
    "create",
    "lassoTool",
    "cmElementFactory",
    "canvas",
    "modeling",
    "selection",
    "elementRegistry",
    "cmLabelEditing",
    "cmReadOnly",
    "config.cmPalette",
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly lassoTool: LassoTool,
    private readonly factory: CmElementFactory,
    private readonly canvas: Canvas,
    private readonly modeling: Modeling,
    private readonly selection: Selection,
    private readonly elementRegistry: ElementRegistry,
    private readonly labelEditing: CmLabelEditing,
    private readonly readOnly: Pick<CmReadOnly, "isReadOnly">,
    private readonly config: CmPaletteConfig | undefined,
  ) {
    palette.registerProvider(this);
  }

  getPaletteEntries(): PaletteEntries {
    const entries: PaletteEntries = {};

    // Entry keys must end in `-tool` ("lasso-tool" ↔ tool "lasso") for diagram-js'
    // tool-manager highlight to find them; Esc cancels any tool.
    entries["lasso-tool"] = {
      group: GROUP_TOOLS,
      title: "Lasso",
      html: entryHtml(toolIcon("square-dashed-mouse-pointer"), false),
      action: {
        click: (event: Event) => {
          this.lassoTool.activateSelection(event as MouseEvent);
          handFocusToCanvas(this.canvas, event);
        },
      },
    };

    for (const spec of ALL_SUBDOMAIN_SPECS) {
      const start = (event: Event) => {
        const shape = this.factory.createNewContext(spec.type, spec.label);
        if (isKeyboardClick(event)) {
          this.placeInFreeRect(shape);
          return;
        }
        this.create.start(event as MouseEvent, shape as unknown as Element);
        handFocusToCanvas(this.canvas, event);
      };
      entries[`context.${spec.type}`] = {
        group: GROUP_CONTEXTS,
        title: sentenceCase(spec.label),
        html: entryHtml(contextIconSvg(spec.type), true),
        action: { dragstart: start, click: start },
      };
    }

    return entries;
  }

  /**
   * Enter or Space on a creating entry (guide §5.5): a create that follows the pointer never ends
   * without one, so the context goes straight to the centre of the free rectangle (24px down-right
   * while that spot is taken), selected, with the canvas focused and its name editor open.
   */
  private placeInFreeRect(shape: CmContext): void {
    if (this.readOnly.isReadOnly()) return;
    const named = this.config?.freeArea?.center?.();
    const centre = named ? { x: named.x, y: named.y } : this.freeAreaCentre();
    const taken = (point: Point): boolean =>
      this.elementRegistry
        .filter((element) => isCmContext(element))
        .some((element) => {
          const box = element as unknown as { x: number; y: number; width: number; height: number };
          return (
            Math.abs(box.x + box.width / 2 - point.x) < 1 &&
            Math.abs(box.y + box.height / 2 - point.y) < 1
          );
        });
    while (taken(centre)) {
      centre.x += KEYBOARD_CREATE_OFFSET;
      centre.y += KEYBOARD_CREATE_OFFSET;
    }
    const created = this.modeling.createShape(
      shape as unknown as Shape,
      centre,
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created);
    this.canvas.focus();
    this.labelEditing.activate(created as unknown as CmContext);
  }

  /** The centre of the container minus the host's chrome, in diagram coordinates. */
  private freeAreaCentre(): Point {
    const viewbox = this.canvas.viewbox();
    const insets = freeAreaInsets(this.config?.freeArea);
    const freeWidth = Math.max(0, viewbox.outer.width - insets.left - insets.right);
    const freeHeight = Math.max(0, viewbox.outer.height - insets.top - insets.bottom);
    return {
      x: viewbox.x + (insets.left + freeWidth / 2) / viewbox.scale,
      y: viewbox.y + (insets.top + freeHeight / 2) / viewbox.scale,
    };
  }
}
