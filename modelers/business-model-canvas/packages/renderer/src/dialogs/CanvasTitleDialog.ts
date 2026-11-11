import type CanvasModeling from "../modeling/CanvasModeling.js";
import { dialogForm, labelled, textField, type ChromeDialog, type DialogChrome } from "./form.js";

/** "Canvas title…": the one field of the canvas, applied as one undo step. */
export function openCanvasTitleDialog(
  chrome: DialogChrome,
  modeling: CanvasModeling,
): ChromeDialog {
  const close = () => dialog.close();
  const dialog: ChromeDialog = chrome.openDialog({
    container: chrome.container,
    title: "Canvas title",
    className: "bmc-title-dialog",
    ...(chrome.focusFallback ? { focusFallback: chrome.focusFallback } : {}),
    render(body) {
      const title = textField(modeling.title());
      title.autofocus = true;
      body.append(
        dialogForm([labelled("Title", title)], close, () => modeling.setTitle(title.value)),
      );
    },
  });
  return dialog;
}
