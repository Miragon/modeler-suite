import type { Box, FieldName } from "@miragon/c4-schema-model";
import type { TextFont } from "./textMetrics.js";

/** The bands of an element's stack, a relationship's label, a boundary's or group's caption, the title. */
export type TextBandName = "name" | "type" | "description" | "technology" | "title";

export type TextRole = "cd-c-fill-text" | "cd-c-fill-text-leise";

export interface TextBand {
  readonly band: TextBandName;
  /** The document field the band shows and the label editor edits; undefined: none (a type line). */
  readonly field: FieldName | undefined;
  /** Diagram coordinates; the band's full width, one line height per line. */
  readonly box: Box;
  readonly font: TextFont;
  readonly lines: readonly string[];
  /** Text was dropped: the last line ends in an ellipsis. */
  readonly truncated: boolean;
  /** How the lines sit in the box. */
  readonly align: "centre" | "start";
  readonly role: TextRole;
  /** A colour the author set (guide §10.6), drawn instead of the role and without its class. */
  readonly colour: string | undefined;
}

export interface TextBands {
  /** What the bands are laid out in (diagram coordinates): an element's text area, a label box. */
  readonly area: Box;
  readonly bands: readonly TextBand[];
  /** The plot-coloured ground behind a relationship's label, inside its label box. */
  readonly backing: Box | undefined;
}
