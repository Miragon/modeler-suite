/**
 * A card: what a model node shows for a file no editor of the board covers. It names the file
 * and, where the host shows files, asks the host to show it in an editor of the host's own. The
 * page never gets such a file's content.
 *
 * A card is no editor, and the board arms it all the same: a double-click and the header's Edit
 * arm every model node, and only the board could leave one out. So the card takes the arming
 * for what a person means by it, the wish to open the file, and asks the host to show it; where
 * the host shows no file it says so. An armed card has nothing to edit and writes nothing. A
 * double-click on the button itself asks once: its first click did, and the arming it brings
 * asks nothing more.
 */
import { repoPath, type BoardFiles } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

export const CARD_NOTE = "This board has no editor for this file.";
export const OPEN_LABEL = "Open in its editor";
/** where the host has no editor to show a file in */
export const NO_SHOW_TEXT = "This app cannot show this file.";
/** a path the files port refuses whoever asks */
export const UNREACHED_TEXT =
  "A board reaches no file outside its repository and none in a dot folder.";
export const SHOWN_TEXT = "Opened in its editor.";
export const NOT_SHOWN_TEXT = "This file could not be shown.";

/** px a pointer may travel between its press and its click: more is a drag of the node */
const CLICK_SLACK = 4;

export interface OpenCardOptions {
  files: BoardFiles;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface CardParts {
  readonly card: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly said: HTMLElement;
}

function build(element: HTMLElement, path: string): CardParts {
  const page = element.ownerDocument;
  const part = <Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    name: string,
    text = "",
  ): HTMLElementTagNameMap[Tag] => {
    const made = page.createElement(tag);
    made.className = `board-host-card__${name}`;
    made.textContent = text;
    return made;
  };
  const slash = path.lastIndexOf("/");
  const card = page.createElement("div");
  card.className = "board-host-card";
  // takes the focus of an armed card that has no button, so that the keys do not go to the page
  card.tabIndex = -1;
  const folder = part("span", "folder", slash < 0 ? "" : `in ${path.slice(0, slash)}`);
  folder.hidden = slash < 0;
  const button = part("button", "open", OPEN_LABEL);
  button.type = "button";
  const said = part("p", "said");
  said.setAttribute("role", "status");
  card.append(part("strong", "name", path.slice(slash + 1)), folder, part("p", "note", CARD_NOTE));
  card.append(button, said);
  element.append(card);
  return { card, button, said };
}

/**
 * What takes a click on a preview. The board keeps a preview `inert`, so a click on the card
 * lands on the parent of the outermost inert element the card stands in.
 */
function clickTaker(element: HTMLElement): Element | null {
  let inert: HTMLElement | null = null;
  for (let at: HTMLElement | null = element; at; at = at.parentElement) {
    if (at.inert) inert = at;
  }
  return inert?.parentElement ?? null;
}

const within = (box: DOMRect, x: number, y: number): boolean =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

export function openCard(context: EmbeddedEditorContext, options: OpenCardOptions): EmbeddedEditor {
  const { element, path } = context;
  const { files } = options;
  const page = element.ownerDocument;
  const { card, button, said } = build(element, path);
  element.dataset.embed = "card";
  element.dataset.embedState = "card";

  const reached = repoPath(path) !== undefined;
  let ended = false;
  let asking = false;
  /** what the last try to show the file came to */
  let outcome: string | undefined;
  /** true where the host shows files, false where it shows none, undefined until it said */
  const shows = (): boolean | undefined => {
    if (!reached || files.showFile === undefined) return false;
    return files.showsFiles === undefined ? true : files.showsFiles();
  };
  const draw = (): void => {
    const can = shows();
    button.hidden = can !== true;
    said.textContent = outcome ?? (can === false ? (reached ? NO_SHOW_TEXT : UNREACHED_TEXT) : "");
  };
  const show = (): void => {
    if (ended || asking || shows() !== true) return;
    asking = true;
    outcome = undefined;
    draw();
    Promise.resolve(files.showFile?.(path))
      .then(
        () => SHOWN_TEXT,
        (error: unknown) => `${NOT_SHOWN_TEXT} ${messageOf(error)}`,
      )
      .then((text) => {
        asking = false;
        outcome = text;
        if (!ended) draw();
      });
  };
  draw();

  let pressed: { x: number; y: number } | undefined;
  /** the first click of the gesture that is on its way asked the host */
  let asked = false;
  /** the arming that comes next is the one of a double-click whose first click asked */
  let armsAfterAsking = false;
  const onPress = (event: PointerEvent): void => {
    pressed = { x: event.clientX, y: event.clientY };
  };
  // A preview takes no pointer, so its button is never the target of a click: the click lands
  // on what holds the preview, and this listener reads where. An armed card is in no preview:
  // nothing holds it, and a click on its button is the button's own. The second click of a
  // double-click is left to the arming.
  const onPageClick = (event: MouseEvent): void => {
    if (ended || event.detail > 1) return;
    asked = false;
    armsAfterAsking = false;
    if (event.target !== clickTaker(element)) return;
    const travelled = pressed
      ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
      : 0;
    if (
      travelled <= CLICK_SLACK &&
      within(button.getBoundingClientRect(), event.clientX, event.clientY)
    ) {
      show();
      asked = true;
    }
  };
  const onPageDoubleClick = (): void => {
    armsAfterAsking = asked;
  };
  const listeners = [
    ["pointerdown", onPress],
    ["click", onPageClick],
    ["dblclick", onPageDoubleClick],
  ] as const;
  for (const [type, listener] of listeners) {
    page.addEventListener(type, listener as EventListener, true);
  }
  button.addEventListener("click", show);
  const stops = [
    // the host says whether it shows files with its answer to the hello, before the first list
    files.onPaths(draw),
    files.onMoved((moves) => {
      const move = moves.find((one) => one.from === path);
      if (move && !ended) context.relocate(move.to);
    }),
    context.onArmedChange((armed) => {
      if (!armed) return;
      if (armsAfterAsking) armsAfterAsking = false;
      else show();
    }),
  ];
  return {
    ready: Promise.resolve(),
    release() {
      const active = page.activeElement;
      if (active instanceof HTMLElement && card.contains(active)) active.blur();
    },
    focus() {
      (button.hidden ? card : button).focus({ preventScroll: true });
    },
    destroy() {
      ended = true;
      for (const stop of stops) stop();
      for (const [type, listener] of listeners) {
        page.removeEventListener(type, listener as EventListener, true);
      }
      card.remove();
      delete element.dataset.embed;
      delete element.dataset.embedState;
    },
  };
}
