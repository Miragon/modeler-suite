/**
 * What the page itself listens to, beside the shell and the board: the browser's file picker,
 * the two file keys (Cmd/Ctrl+O opens a file, Cmd/Ctrl+S downloads the board), and a person
 * going to the model picker of a board that has nothing to offer there.
 */
import { isTextField } from "@miragon/modeler-shell";
import { BOARD_SUFFIX } from "./board-file.js";

export interface PageActions {
  openFile(file: File): void;
  download(): void;
  /** a board a person made is on the canvas: the start screen has none yet */
  canDownload(): boolean;
  /** a person went to the board's model picker, by the pointer or by the keyboard */
  modelPickerUsed(): void;
}

export interface PageInput {
  /** opens the browser's file picker */
  pickFile(): void;
  /** takes the input and every listener away again */
  dispose(): void;
}

export function connectPage(root: HTMLElement, on: PageActions): PageInput {
  const page = root.ownerDocument;
  const view = page.defaultView;

  const picker = page.createElement("input");
  picker.type = "file";
  picker.accept = BOARD_SUFFIX;
  picker.hidden = true;
  picker.dataset.boardApp = "open";
  picker.setAttribute("aria-label", "Board file");
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    // the same file can be picked again
    picker.value = "";
    if (file) on.openFile(file);
  });
  page.body.append(picker);
  const pickFile = (): void => picker.click();

  const onKey = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if ((key !== "o" && key !== "s") || event.isComposing) return;
    // Never the browser's "Open file" or "Save page as" in their place, over a dialog either.
    event.preventDefault();
    if (event.repeat || page.querySelector("dialog:modal") !== null) return;
    if (key === "o") {
      pickFile();
      return;
    }
    if (!on.canDownload()) return;
    // A note or a label that is being typed belongs in the file: leaving the field commits it.
    const active = page.activeElement;
    if (active instanceof HTMLElement && isTextField(active)) active.blur();
    on.download();
  };

  // The picker is the renderer's and the page cannot write into it. It can hear a person go to
  // it, by a press or by the Tab key.
  const onPicker = (event: Event): void => {
    const { target } = event;
    if (target instanceof Element && target.closest(".board-toolbar__models") !== null) {
      on.modelPickerUsed();
    }
  };

  // On the way down: a note that is being typed keeps its keys from whatever lies above it.
  view?.addEventListener("keydown", onKey, true);
  root.addEventListener("focusin", onPicker);
  root.addEventListener("pointerdown", onPicker);
  return {
    pickFile,
    dispose() {
      view?.removeEventListener("keydown", onKey, true);
      root.removeEventListener("focusin", onPicker);
      root.removeEventListener("pointerdown", onPicker);
      picker.remove();
    },
  };
}
