import TextUtil, { type TextLayoutConfig } from "diagram-js/lib/util/Text";
import { FONT } from "./styles.js";

const ELLIPSIS = "…";

export interface TextBox {
  width: number;
  height: number;
}

export interface FittedTextOptions {
  box: TextBox;
  fontSize: number;
  fill: string;
  align?: "left-top" | "center-middle";
  padding?: number;
  /** Above and below, where it differs from `padding`. */
  verticalPadding?: number;
  fontWeight?: number;
}

/**
 * Text that stays inside its box: lines past the box are dropped and the last kept one ends in an
 * ellipsis, so the frame's bounds cover the whole drawing and no export cuts a line off.
 */
export function fittedText(text: string, options: FittedTextOptions): SVGElement {
  const style = {
    fontFamily: FONT.family,
    fontSize: options.fontSize,
    lineHeight: FONT.lineHeight,
    ...(options.fontWeight ? { fontWeight: options.fontWeight } : {}),
  };
  const util = new TextUtil({ style });
  const config: TextLayoutConfig = {
    box: options.box,
    // diagram-js's typings list only the centred alignments its own renderers use.
    align: (options.align ?? "left-top") as "center-middle",
    padding: {
      top: options.verticalPadding ?? options.padding ?? 0,
      bottom: options.verticalPadding ?? options.padding ?? 0,
      left: options.padding ?? 0,
      right: options.padding ?? 0,
    },
    style: { fill: options.fill },
  };
  const element = util.createText(text, config);
  const lineHeight = options.fontSize * FONT.lineHeight;
  const maxLines = Math.max(
    1,
    Math.floor(
      (options.box.height - 2 * (options.verticalPadding ?? options.padding ?? 0)) / lineHeight,
    ),
  );
  const lines = [...element.children].map((line) => line.textContent ?? "");
  if (lines.length <= maxLines) return withFont(element, style.fontFamily);
  const kept = lines.slice(0, maxLines - 1);
  let last = (lines[maxLines - 1] ?? "").trimEnd();
  for (;;) {
    const cut = util.createText([...kept, `${last}${ELLIPSIS}`].join("\n"), config);
    if (cut.children.length <= maxLines || last === "") return withFont(cut, style.fontFamily);
    last = last.slice(0, -1).trimEnd();
  }
}

function withFont(element: SVGElement, family: string): SVGElement {
  element.setAttribute("font-family", family);
  return element;
}
