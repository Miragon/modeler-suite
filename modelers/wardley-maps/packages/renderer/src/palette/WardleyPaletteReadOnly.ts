import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { isReadOnly, isReadOnlyShown, READ_ONLY_CHANGED } from "../read-only/index.js";

const ENTRY_SELECTOR = ".djs-palette-entries .entry[data-action]";

/** The entries a locked map leaves active (guide §13.5): the lasso changes only the selection. */
const ACTIVE_WHILE_LOCKED: ReadonlySet<string> = new Set(["lasso-tool"]);

/** Ahead of the palette's own handling of the entry, as the shell's veto is. */
const VETO_PRIORITY = 2000;

interface PaletteTriggerEvent {
  entry?: { group?: string };
  event?: Event & { delegateTarget?: EventTarget };
}

/**
 * Shows the read-only lock on the renderer's own palette, for a host without the Miragon modeler
 * shell, whose palette skin does the same: every entry that would change the map, the draw tool
 * too, is `aria-disabled="true"` while the lock shows, at once with it or after the lock's
 * `delayMs`, and again after every rebuild of the entries; its click, drag or Enter does nothing
 * from the lock on, and it stays focusable. The lasso stays active (guide §13.5). `wardley.css`
 * mutes the marked entries. A palette any chrome skins (`data-chrome="palette"`) is left to that
 * chrome.
 */
export default class WardleyPaletteReadOnly {
  static $inject = ["eventBus", "injector"];

  private container: HTMLElement | undefined;
  /** The `aria-disabled` an entry had before the lock marked it (`null`: none). */
  private readonly ownMarks = new WeakMap<Element, string | null>();

  constructor(
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    if (injector.get("modelerShell", false)) return;
    eventBus.on("palette.create", (event: { container: HTMLElement }) => {
      this.container = event.container;
    });
    eventBus.on(["palette.changed", READ_ONLY_CHANGED], () => this.apply());
    eventBus.on("palette.trigger", VETO_PRIORITY, (event: PaletteTriggerEvent) =>
      this.vetoes(event) ? this.refuse(event) : undefined,
    );
  }

  /** Whether `entry` does nothing while the lock holds, read from its element where there is one. */
  isDisabled(entry: Element): boolean {
    return this.ownsPalette() && isReadOnly(this.injector) && refusedWhileLocked(entry);
  }

  private ownsPalette(): boolean {
    const container = this.container;
    return !!container && container.getAttribute("data-chrome") !== "palette";
  }

  // The marks follow the lock as shown, which a host may delay (guide §13.5); the refusal does not.
  private apply(): void {
    const container = this.container;
    if (!container || !this.ownsPalette()) return;
    const shown = isReadOnlyShown(this.injector);
    for (const entry of container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)) {
      if (shown && refusedWhileLocked(entry)) {
        if (!this.ownMarks.has(entry)) {
          this.ownMarks.set(entry, entry.getAttribute("aria-disabled"));
        }
        entry.setAttribute("aria-disabled", "true");
      } else if (this.ownMarks.has(entry)) {
        const previous = this.ownMarks.get(entry);
        this.ownMarks.delete(entry);
        if (previous === null || previous === undefined) entry.removeAttribute("aria-disabled");
        else entry.setAttribute("aria-disabled", previous);
      }
    }
  }

  // A trigger without an entry element in this palette (a host's `triggerEntry`) passes only for
  // the tools, whose draw tool refuses the lock by itself.
  private vetoes({ entry, event }: PaletteTriggerEvent): boolean {
    if (!this.ownsPalette() || !isReadOnly(this.injector)) return false;
    const target = event?.delegateTarget ?? event?.target;
    const element =
      target instanceof Element ? target.closest<HTMLElement>(".entry[data-action]") : null;
    if (element && this.container!.contains(element)) return this.isDisabled(element);
    return entry?.group !== "tools";
  }

  private refuse({ event }: PaletteTriggerEvent): false {
    // A refused dragstart would otherwise still start the browser's own drag of the entry.
    event?.preventDefault();
    return false;
  }
}

function refusedWhileLocked(entry: Element): boolean {
  return !ACTIVE_WHILE_LOCKED.has(entry.getAttribute("data-action") ?? "");
}
