import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { TITLE_MARKER } from "../canvas-frame/CanvasFrame.js";
import type HostLauncher from "../context-pad/HostLauncher.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/index.js";

interface EditLock {
  isReadOnly(): boolean;
}

/** Room around the title's text, so the hover background does not sit on its letters. */
const PAD = { x: 4, y: 3 };

/**
 * The header's title is the way to edit it: a click opens "Canvas title". HTML over the frame, so
 * no export carries it; nothing under the read-only lock.
 */
export default class HeaderEditing {
  static $inject = ["canvas", "eventBus", "injector"];

  private readonly layer = document.createElement("div");
  private button: HTMLButtonElement | undefined;
  private destroyed = false;

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    this.layer.className = "bmc-header-edit";
    canvas.getContainer().append(this.layer);
    // A listener that returned a value would stop the event for every listener after it.
    const later = (): void => {
      requestAnimationFrame(() => {
        if (!this.destroyed) this.refresh();
      });
    };
    eventBus.on(["elements.changed", "import.done", READ_ONLY_CHANGED_EVENT], later);
    eventBus.on("canvas.viewbox.changed", (): void => this.place());
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
      this.layer.remove();
    });
  }

  private launcher(): HostLauncher | undefined {
    return this.injector.get<HostLauncher | undefined>("hostLauncher", false);
  }

  private locked(): boolean {
    return this.injector.get<EditLock | undefined>("readOnly", false)?.isReadOnly() ?? false;
  }

  refresh(): void {
    this.layer.replaceChildren();
    this.button = undefined;
    const launcher = this.launcher();
    if (this.locked() || !launcher?.hasCanvasTitle()) return;
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.className = "bmc-header-title";
    button.setAttribute("aria-label", "Edit the title");
    button.addEventListener("click", () => launcher.openCanvasTitle());
    this.button = button;
    this.layer.append(button);
    this.place();
  }

  /** Over the title where the view shows it now; a pan or zoom moves it, it builds nothing. */
  private place(): void {
    const container = this.canvas.getContainer();
    const title = container.querySelector<SVGElement>(`.layer-bmc-frame .${TITLE_MARKER}`);
    if (!this.button || !title) return;
    const origin = container.getBoundingClientRect();
    const box = title.getBoundingClientRect();
    Object.assign(this.button.style, {
      left: `${box.left - origin.left - PAD.x}px`,
      top: `${box.top - origin.top - PAD.y}px`,
      width: `${box.width + 2 * PAD.x}px`,
      height: `${box.height + 2 * PAD.y}px`,
    });
  }
}
