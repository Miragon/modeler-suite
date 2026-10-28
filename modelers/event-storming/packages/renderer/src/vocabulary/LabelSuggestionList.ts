import type { FreeAreaInsets } from "@miragon/modeler-api";
import { CHROME_SPACING } from "../theme/palette.js";

/** The list is as wide as the field, and never narrower than this. */
const MIN_WIDTH = 160;

/**
 * The least height worth the list on one side of the field: one 36px option, the list's 6px
 * padding and its border. Below that, the list may use the canvas the chrome covers.
 */
const MIN_ROOM = 36 + 2 * 6 + 2;

let listCount = 0;

/** The vertical band of the container the list may take, in px from the container's top. */
interface Band {
  top: number;
  bottom: number;
}

/**
 * The suggestion list of a sticky's label editor (issue #115): a temporary canvas popup (guide
 * §5.13) beside the field with listbox semantics. The field keeps the focus throughout; the list
 * names its options with `aria-activedescendant`. It opens on typing when the board has names
 * that fit, and closes on accepting one, on Escape, on a press outside it and the field, and when
 * the editor closes. ↑ and ↓ move through the options, Tab takes the active option (else the
 * first) and Enter the active one, so Enter without an active option still breaks the line. A
 * click on an option takes it. The field stays open, so Cmd/Ctrl+Enter or a click outside saves,
 * as without the list. The list sits below the field, or above it where there is more room, never
 * over it, and scrolls when the room on that side is too low for every option.
 */
export class LabelSuggestionList {
  private list: HTMLElement | undefined;
  private options: readonly string[] = [];
  private active = -1;
  private readonly listId: string;

  private readonly onInput = (): void => this.update();
  // Chrome that keeps the focus in the field (a zoom button, the menu trigger) never blurs it, so
  // a press there would leave the list open over a canvas the user has moved on from.
  private readonly onOutsidePress = (event: Event): void => {
    const target = event.target;
    if (target instanceof Node && (this.list?.contains(target) || this.field.contains(target))) {
      return;
    }
    this.close();
  };

  constructor(
    private readonly field: HTMLTextAreaElement,
    private readonly container: HTMLElement,
    private readonly suggest: (typed: string) => readonly string[],
    private readonly onAccept: () => void = () => {},
    private readonly coveredInsets: () => FreeAreaInsets | undefined = () => undefined,
  ) {
    listCount += 1;
    this.listId = `event-storming-label-suggestions-${listCount}`;
    field.setAttribute("aria-autocomplete", "list");
    field.setAttribute("aria-haspopup", "listbox");
    field.addEventListener("input", this.onInput);
  }

  isOpen(): boolean {
    return this.list !== undefined;
  }

  /** The options shown, in order; empty while the list is closed. */
  shownOptions(): readonly string[] {
    return this.list ? this.options : [];
  }

  /** Takes a key of the field while the list is open; `true` when the list used it. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.list || event.isComposing) return false;
    const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
    if (event.key === "Escape") {
      this.close();
    } else if (event.key === "ArrowDown" && plain) {
      this.setActive(this.active + 1 >= this.options.length ? 0 : this.active + 1);
    } else if (event.key === "ArrowUp" && plain) {
      this.setActive(this.active <= 0 ? this.options.length - 1 : this.active - 1);
    } else if (event.key === "Tab" && plain) {
      this.accept(Math.max(0, this.active));
    } else if (event.key === "Enter" && plain && this.active >= 0) {
      this.accept(this.active);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  }

  /** Re-reads the suggestions for the field's text: opens, updates or closes the list. */
  update(): void {
    const options = this.suggest(this.field.value);
    if (options.length === 0) {
      this.close();
      return;
    }
    this.options = options;
    this.active = -1;
    this.render();
  }

  close(): void {
    if (!this.list) return;
    this.field.ownerDocument.removeEventListener("pointerdown", this.onOutsidePress, true);
    this.list.remove();
    this.list = undefined;
    this.options = [];
    this.active = -1;
    this.field.removeAttribute("aria-controls");
    this.field.removeAttribute("aria-activedescendant");
  }

  destroy(): void {
    this.close();
    this.field.removeEventListener("input", this.onInput);
    this.field.removeAttribute("aria-autocomplete");
    this.field.removeAttribute("aria-haspopup");
  }

  private render(): void {
    const list = this.list ?? this.createList();
    list.replaceChildren(
      ...this.options.map((label, index) => {
        const option = document.createElement("div");
        option.id = `${this.listId}-${index}`;
        option.className = "event-storming-label-suggestion";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.textContent = label;
        option.addEventListener("click", () => this.accept(index));
        return option;
      }),
    );
    list.scrollTop = 0;
    this.field.setAttribute("aria-controls", this.listId);
    this.field.removeAttribute("aria-activedescendant");
    this.place(list);
  }

  private createList(): HTMLElement {
    const list = document.createElement("div");
    list.id = this.listId;
    list.className = "event-storming-label-suggestions";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Label suggestions");
    // A press on the list must not take the focus off the field: its blur would save and close.
    list.addEventListener("mousedown", (event) => event.preventDefault());
    this.container.appendChild(list);
    this.field.ownerDocument.addEventListener("pointerdown", this.onOutsidePress, true);
    this.list = list;
    return list;
  }

  /**
   * The band the list may take: inside the container's edge and out of the chrome's way (guide
   * §5.13, nothing on the canvas lies over an island), `rand` from the edge at least.
   */
  private freeBand(): Band {
    const { rand } = CHROME_SPACING;
    const covered = this.coveredInsets();
    return {
      top: Math.max(rand, covered?.top ?? 0),
      bottom: this.container.clientHeight - Math.max(rand, covered?.bottom ?? 0),
    };
  }

  private place(list: HTMLElement): void {
    const { rand, luecke } = CHROME_SPACING;
    const field = this.field.getBoundingClientRect();
    const origin = this.container.getBoundingClientRect();
    list.style.minWidth = `${Math.max(MIN_WIDTH, Math.round(field.width))}px`;
    list.style.maxHeight = "";
    const width = list.offsetWidth;
    const height = list.offsetHeight;
    const fieldTop = field.top - origin.top;
    const fieldBottom = field.bottom - origin.top;
    const roomIn = (band: Band) => ({
      below: band.bottom - fieldBottom - luecke,
      above: fieldTop - luecke - band.top,
    });
    let room = roomIn(this.freeBand());
    if (Math.max(room.below, room.above) < MIN_ROOM) {
      room = roomIn({ top: rand, bottom: this.container.clientHeight - rand });
    }
    const below = height <= room.below || room.below >= room.above;
    const maxHeight = Math.max(0, Math.floor(below ? room.below : room.above));
    list.style.maxHeight = `${maxHeight}px`;
    const shown = Math.min(height, maxHeight);
    const top = below ? fieldBottom + luecke : fieldTop - luecke - shown;
    const left = Math.min(field.left - origin.left, this.container.clientWidth - width - rand);
    list.style.left = `${Math.max(rand, left)}px`;
    list.style.top = `${top}px`;
  }

  private setActive(index: number): void {
    const list = this.list;
    if (!list) return;
    this.active = index;
    [...list.children].forEach((option, position) =>
      option.setAttribute("aria-selected", String(position === index)),
    );
    const active = list.children[index];
    if (!(active instanceof HTMLElement)) return;
    this.field.setAttribute("aria-activedescendant", active.id);
    this.reveal(list, active);
  }

  /**
   * Scrolls the list, and only the list, until `option` shows. `scrollIntoView` would also scroll
   * diagram-js's container, whose `overflow: hidden` still scrolls, and so shift the whole board.
   */
  private reveal(list: HTMLElement, option: HTMLElement): void {
    const padding = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
    const top = option.offsetTop - padding;
    const bottom = option.offsetTop + option.offsetHeight + padding;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }

  private accept(index: number): void {
    const label = this.options[index];
    if (label === undefined) return;
    this.close();
    this.field.value = label;
    this.field.setSelectionRange(label.length, label.length);
    this.onAccept();
  }
}
