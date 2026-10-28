/** Gap between the label editor and the list, and the list's least distance to the container edge. */
const GAP = 4;

/** The list is as wide as the field, and never narrower than this. */
const MIN_WIDTH = 160;

let listCount = 0;

/**
 * The suggestion list of a sticky's label editor (issue #115): a temporary canvas popup (guide
 * §5.13) under the field with listbox semantics. The field keeps the focus throughout; the list
 * names its options with `aria-activedescendant`. It opens on typing when the board has names
 * that fit, and closes on accepting one, on Escape, on a press outside it and the field, and when
 * the editor closes. ↑ and ↓ move through the options, Tab takes the active option (else the
 * first) and Enter the active one, so Enter without an active option still breaks the line. A
 * click on an option takes it. The field stays open, so Cmd/Ctrl+Enter or a click outside saves,
 * as without the list.
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

  private place(list: HTMLElement): void {
    const field = this.field.getBoundingClientRect();
    const origin = this.container.getBoundingClientRect();
    list.style.minWidth = `${Math.max(MIN_WIDTH, Math.round(field.width))}px`;
    const width = list.offsetWidth;
    const height = list.offsetHeight;
    const roomBelow = this.container.clientHeight - (field.bottom - origin.top) - GAP;
    const roomAbove = field.top - origin.top - GAP;
    const below = height <= roomBelow || roomBelow >= roomAbove;
    const top = below ? field.bottom - origin.top + GAP : field.top - origin.top - GAP - height;
    const left = Math.min(field.left - origin.left, this.container.clientWidth - width - GAP);
    list.style.left = `${Math.max(GAP, left)}px`;
    list.style.top = `${Math.max(GAP, top)}px`;
  }

  private setActive(index: number): void {
    const options = this.list?.children;
    if (!options) return;
    this.active = index;
    [...options].forEach((option, position) =>
      option.setAttribute("aria-selected", String(position === index)),
    );
    const active = options[index];
    if (!active) return;
    this.field.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView?.({ block: "nearest" });
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
