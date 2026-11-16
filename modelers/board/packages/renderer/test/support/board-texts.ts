/**
 * The board texts the conformance kit and the browser tests run on: the ones designIQ's bench
 * measured the board with, cut from its kit page byte for byte. A changed byte here is a
 * different measurement, so the texts are never edited by hand. BOARD_PROTO alone is the suite's
 * own.
 */

// ── the texts: hand-written in the canonical form (header, then one line per element sorted by id, keys sorted) ──

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

/** a group with a note in it, a note beside it and an arrow between the notes */
export const BOARD_A = lines(
  String.raw`{"format":"structured-model","meta":{"title":"Kit board A","version":1},"version":1}`,
  String.raw`{"id":"e_note_to_note","kind":"edge","label":"leads to","source":"n_note_a","sourceHandle":"right","target":"n_note_b","targetHandle":"left"}`,
  String.raw`{"height":420,"id":"n_group","kind":"node","text":"Inbox","type":"group","width":640,"x":0,"y":0,"z":"a"}`,
  String.raw`{"height":160,"id":"n_note_a","kind":"node","parent":"n_group","text":"First note","type":"text","width":240,"x":40,"y":80,"z":"b"}`,
  String.raw`{"height":160,"id":"n_note_b","kind":"node","text":"## Second note\n\nWith a list:\n\n- one\n- two","type":"text","width":240,"x":760,"y":80,"z":"c"}`,
);
/** a model of the repository (edited in place by the product's editor), an image and a note with an arrow */
export const BOARD_B = lines(
  String.raw`{"format":"structured-model","meta":{"title":"Kit board B","version":1},"version":1}`,
  String.raw`{"id":"e_remark_to_order","kind":"edge","source":"n_remark","sourceHandle":"left","target":"n_order","targetHandle":"right"}`,
  String.raw`{"file":"assets/sketch.svg","height":240,"id":"n_image","kind":"node","type":"image","width":320,"x":0,"y":620,"z":"c"}`,
  String.raw`{"file":"processes/order-to-cash.bpmn","height":540,"id":"n_order","kind":"node","type":"model","width":800,"x":0,"y":0,"z":"a"}`,
  String.raw`{"height":180,"id":"n_remark","kind":"node","text":"Check the credit limit first.","type":"text","width":320,"x":880,"y":0,"z":"b"}`,
);
/** a board without elements */
export const BOARD_EMPTY = lines(String.raw`{"format":"structured-model","meta":{},"version":1}`);
/**
 * The shape of board A with the value `__proto__` as the group's name, as a note's whole text and
 * as the arrow's label. Not one of the bench's texts: a reader that looks for the key `__proto__`
 * in a line's text instead of its parsed keys refuses the board's own export of such a board.
 */
export const BOARD_PROTO = lines(
  String.raw`{"format":"structured-model","meta":{"title":"Kit board proto","version":1},"version":1}`,
  String.raw`{"id":"e_note_to_note","kind":"edge","label":"__proto__","source":"n_note_a","sourceHandle":"right","target":"n_note_b","targetHandle":"left"}`,
  String.raw`{"height":420,"id":"n_group","kind":"node","text":"__proto__","type":"group","width":640,"x":0,"y":0,"z":"a"}`,
  String.raw`{"height":160,"id":"n_note_a","kind":"node","parent":"n_group","text":"__proto__","type":"text","width":240,"x":40,"y":80,"z":"b"}`,
  String.raw`{"height":160,"id":"n_note_b","kind":"node","text":"Second note","type":"text","width":240,"x":760,"y":80,"z":"c"}`,
);

/** board A as a person or another tool may leave it: other key order, other line order, blank lines, no last newline */
export const LOOSE_A = [
  String.raw`{"kind":"node","type":"text","id":"n_note_b","x":760,"y":80,"width":240,"height":160,"z":"c","text":"## Second note\n\nWith a list:\n\n- one\n- two"}`,
  "",
  String.raw`{ "id": "n_group", "kind": "node", "type": "group", "text": "Inbox", "x": 0, "y": 0, "width": 640, "height": 420, "z": "a" }`,
  String.raw`{"version":1,"meta":{"version":1,"title":"Kit board A"},"format":"structured-model"}`,
  String.raw`{"kind":"edge","id":"e_note_to_note","source":"n_note_a","target":"n_note_b","sourceHandle":"right","targetHandle":"left","label":"leads to"}`,
  "   ",
  String.raw`{"parent":"n_group","kind":"node","type":"text","id":"n_note_a","text":"First note","x":40,"y":80,"width":240,"height":160,"z":"b"}`,
].join("\n");

/** content the board does not know: it stays in the document, off the canvas, and is written back */
export const FOREIGN = lines(
  String.raw`{"format":"structured-model","meta":{"owner":"team-a","title":"Foreign","version":1},"version":1}`,
  String.raw`{"height":100,"id":"n_locked","kind":"node","locked":true,"text":"Locked","type":"text","width":200,"x":0,"y":0,"z":"a"}`,
  String.raw`{"id":"n_shapeless","kind":"node","type":"text"}`,
  String.raw`{"colour":"amber","id":"x_lane","kind":"swimlane","rows":[1,2,3]}`,
);

const HEADER = String.raw`{"format":"structured-model","meta":{},"version":1}`;
export const INVALID: readonly string[] = [
  "not a board at all",
  `<?xml version="1.0" encoding="UTF-8"?>\n<definitions/>\n`,
  // an element line cut off while a peer types
  `${HEADER}\n{"height":160,"id":"n_a","kind":"no`,
  // a newer format
  `{"format":"structured-model","meta":{},"version":2}\n`,
  // one id twice
  `${HEADER}\n{"id":"n_a","kind":"node"}\n{"id":"n_a","kind":"edge"}\n`,
  // elements without a header: some other tool's JSON lines
  `{"id":"n_a","kind":"node"}\n`,
  `${HEADER}\n${HEADER}\n`,
  // a header key the board would not write back
  `{"format":"structured-model","generator":"other","meta":{},"version":1}\n`,
  // a line that is JSON and no object
  `${HEADER}\n[1,2,3]\n`,
];

/** what of FOREIGN has to come back in the exported text */
export const FOREIGN_MUST_SURVIVE: readonly string[] = [
  `"owner":"team-a"`,
  `"locked":true`,
  `"id":"n_shapeless"`,
  `"kind":"swimlane"`,
  `"rows":[1,2,3]`,
];

/** the file the model node of BOARD_B shows */
export const MODEL_PATH = "processes/order-to-cash.bpmn";
/** the file the image node of BOARD_B shows */
export const IMAGE_PATH = "assets/sketch.svg";
