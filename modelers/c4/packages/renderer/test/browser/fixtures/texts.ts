/*
 * The documents of the conformance harness (SPEC 9.2, 9.3). The two canonical texts were written
 * by the edit layer from hand-authored inputs (a `setLayout` per view pinned every box) and then
 * reviewed byte by byte; the other texts are hand-authored.
 */
import bookshop from "./bookshop.dsl?raw";
import bookshopForeign from "./bookshop.foreign.dsl?raw";
import bookshopLoose from "./bookshop.loose.dsl?raw";
import library from "./library.dsl?raw";

/**
 * Canonical A: the default view `Landscape` (pinned, `include *` then `exclude mail`) and the
 * pinned `BookshopContext`, which shows `mail`. No C4 colour block and no context view of
 * `payments`, so every configuration edit of the harness changes the export.
 */
export const BOOKSHOP = bookshop;

/**
 * Canonical B: other elements and no view key of A. The default view `LibraryContainers` is a
 * pinned container view, whose `include *` takes no unconnected software system.
 */
export const LIBRARY = library;

/**
 * Tabs, CRLF, lowercase keywords, `#` and `/* *\/` comments, a `\` continuation, unquoted
 * tokens, a keyless view, an anonymous element, a text block and no layout. Git's
 * `core.autocrlf=input` would store the file with LF, and the CRLF of a file typed on Windows is
 * part of what this text proves.
 */
export const BOOKSHOP_LOOSE = bookshopLoose.replace(/\r?\n/g, "\r\n");

/** Content the modeler reads but never draws or edits, which every import keeps as written. */
export const BOOKSHOP_FOREIGN = bookshopForeign;

export const FOREIGN_FRAGMENTS: readonly string[] = [
  "!docs docs",
  "!adrs decisions",
  'deploymentEnvironment "Live" {',
  'dynamic bookshop "Checkout" "The checkout steps." {',
  '"x-vendor.owner" "team-orders"',
  "// owner: team orders",
  '!const OWNER "orders"',
];

// Each of SPEC 3.8's texts rejects for exactly one reason.

/** An unclosed `{` at the end of the text (rule 1). */
export const UNCLOSED = 'workspace {\n    model {\n        a = person "A"\n';

/** Two elements under one identifier (rule 3). */
export const DUPLICATE_IDENTIFIER =
  'workspace {\n    model {\n        a = person "A"\n        a = person "B"\n    }\n}\n';

/** A container at model level (rule 5). */
export const WRONG_CONTEXT = 'workspace {\n    model {\n        c = container "Orphan"\n    }\n}\n';

/** A view key a view earlier in the document holds (rule 4). */
export const DUPLICATE_VIEW_KEY =
  'workspace {\n    model {\n        a = softwareSystem "A"\n    }\n    views {\n        systemLandscape "L" {\n            include *\n        }\n        systemContext a "L" {\n            include *\n        }\n    }\n}\n';

export const INVALID_TEXTS: readonly string[] = [
  UNCLOSED,
  DUPLICATE_IDENTIFIER,
  WRONG_CONTEXT,
  DUPLICATE_VIEW_KEY,
];

function cutInside(text: string, statement: string, kept: number): string {
  const at = text.indexOf(statement);
  if (at < 0) throw new Error(`the fixture has no ${statement}`);
  return text.slice(0, at + kept);
}

const LANDSCAPE_HEADER = 'systemLandscape "Landscape" "The bookshop and its partners." {';

/** The damaged forms of A a peer's half-typed text takes, on top of those the kit derives. */
export const PROBES: readonly string[] = [
  cutInside(BOOKSHOP, 'person "Customer"', 'person "Cus'.length),
  cutInside(BOOKSHOP, "customer -> bookshop", "customer ->".length),
  // The view's header typed up to its `{`: a cut between tokens, where the first probe cuts a string.
  cutInside(BOOKSHOP, LANDSCAPE_HEADER, LANDSCAPE_HEADER.length - 1),
  BOOKSHOP.replace('"Sells books online."', '"""'),
];
