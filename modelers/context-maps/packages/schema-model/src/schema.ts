/**
 * Runtime validation for the context-map document model using Zod, plus the
 * strategic-DDD semantic rules adopted from Context Mapper.
 *
 * Two layers:
 *  - {@link parseDocument} does STRUCTURAL validation (shapes, enums, geometry).
 *    Anything entering the app from outside (files, share URLs, localStorage,
 *    CML import) goes through it so malformed data can never corrupt state.
 *  - {@link validateDocument} does SEMANTIC validation (the 13 relationship
 *    rules). It never blocks loading — the editor shows the findings so an
 *    imperfect (e.g. imported) map can still be opened and fixed.
 */

import { z } from "zod";
import {
  DOCUMENT_VERSION,
  DOWNSTREAM_ROLES,
  RELATIONSHIP_PATTERNS,
  SUBDOMAIN_TYPES,
  UPSTREAM_ROLES,
  isSymmetricPattern,
} from "./types";
import type { CmDocument, Relationship } from "./types";
import { CONTEXT_KEYS, DOCUMENT_KEYS, RELATIONSHIP_KEYS, foreignFields } from "./foreign";

/**
 * The largest coordinate or size a document may hold, in canvas px. A map a million pixels across
 * is far beyond any real diagram; values near the float limit (1e38) would turn the canvas's
 * zoom-to-fit into a zero scale and its viewbox into NaN, so such a file is rejected instead.
 */
export const MAX_COORDINATE = 1_000_000;

/**
 * Objects and arrays nested deeper than this make a document invalid; the document itself is the
 * first level. The serializer, structured cloning and JSON tooling descend one call per level and
 * overflow the stack a few thousand levels down, so the canvas would open such a file and fail to
 * save it. The model's own fields need four levels; only the values of foreign keys go deeper.
 */
export const MAX_NESTING_DEPTH = 100;

/** The id of the canvas's own root element, which holds the map's title. */
export const DIAGRAM_ROOT_ID = "cm-root";

/**
 * Why `id` cannot name a context or relationship, or `undefined` when it can. The canvas keeps one
 * element per id in a plain object: the ids of its own roots (the map's root and the implicit roots
 * diagram-js creates) are taken, and the name of a built-in object property (`constructor`,
 * `toString`, `__proto__`, …) already resolves there. Either makes the import fail, so the file is
 * rejected with the id as the reason.
 */
export function reservedIdProblem(id: string): string | undefined {
  if (id === DIAGRAM_ROOT_ID || id.startsWith("__implicitroot")) {
    return `the id "${id}" is reserved for the diagram itself`;
  }
  if (Object.hasOwn(Object.prototype, id)) {
    return `the id "${id}" is reserved: it names a built-in property of JavaScript objects`;
  }
  return undefined;
}

/** Whether `id` cannot name a context or relationship (see {@link reservedIdProblem}). */
export function isReservedId(id: string): boolean {
  return reservedIdProblem(id) !== undefined;
}

const elementIdSchema = z
  .string()
  .min(1)
  .refine((id) => !isReservedId(id), {
    error: (issue) => reservedIdProblem(String(issue.input)),
  });

const subdomainTypeSchema = z.enum(SUBDOMAIN_TYPES as unknown as [string, ...string[]]);
const patternSchema = z.enum(RELATIONSHIP_PATTERNS as unknown as [string, ...string[]]);
const upstreamRoleSchema = z.enum(UPSTREAM_ROLES as unknown as [string, ...string[]]);
const downstreamRoleSchema = z.enum(DOWNSTREAM_ROLES as unknown as [string, ...string[]]);

const sizeSchema = z.object({
  width: z.number().finite().positive().max(MAX_COORDINATE),
  height: z.number().finite().positive().max(MAX_COORDINATE),
});

const coordinateSchema = z.number().finite().min(-MAX_COORDINATE).max(MAX_COORDINATE);

const positionSchema = z.object({
  x: coordinateSchema,
  y: coordinateSchema,
});

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected a hex colour");

export const boundedContextSchema = z.object({
  id: elementIdSchema,
  label: z.string(),
  subdomainType: subdomainTypeSchema.optional(),
  team: z.string().optional(),
  description: z.string().optional(),
  position: positionSchema,
  size: sizeSchema,
  fill: hexColor.optional(),
  stroke: hexColor.optional(),
});

export const relationshipSchema = z.object({
  id: elementIdSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  pattern: patternSchema,
  upstreamRoles: z.array(upstreamRoleSchema).optional(),
  downstreamRoles: z.array(downstreamRoleSchema).optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  implementationTechnology: z.string().optional(),
});

export const documentSchema = z.object({
  version: z.literal(DOCUMENT_VERSION),
  title: z.string(),
  contexts: z.array(boundedContextSchema),
  relationships: z.array(relationshipSchema),
});

/** One reason a document is invalid, at the path of the offending value (`[]` = the whole text). */
export interface ParseIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export type ParseResult =
  | { ok: true; document: CmDocument }
  | {
      ok: false;
      error: string;
      /** Where the document is invalid; `parseDocument` and `parseDocumentText` always set it. */
      issues?: ParseIssue[];
    };

function failure(issues: ParseIssue[]): ParseResult {
  return {
    ok: false,
    error: issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; "),
    issues,
  };
}

/**
 * Validates and (if necessary) migrates unknown data into a {@link CmDocument}.
 * Returns a discriminated result rather than throwing so callers can show a
 * friendly message. Keys this version does not know stay on the document, its
 * contexts and its relationships (see `foreign.ts`), so a save writes them back.
 */
export function parseDocument(input: unknown): ParseResult {
  if (Array.isArray(input))
    return failure([{ path: [], message: "expected an object, got a list" }]);
  const newer = newerVersionOf(input);
  if (newer !== undefined) {
    return failure([
      {
        path: ["version"],
        message: `${newer} is newer than this modeler reads (${DOCUMENT_VERSION}); update the modeler to open this file`,
      },
    ]);
  }
  const migrated = migrate(input);
  const result = documentSchema.safeParse(migrated);
  const shapeIssues: ParseIssue[] = result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number => typeof segment !== "symbol",
        ),
        message: issue.message,
      }));
  // Checked next to the shape, not after it: a fix of the shape would otherwise bring up the
  // repeat as a new error, one round later.
  const sections = sectionsInFileOrder(migrated);
  const issues = inDocumentOrder(
    [...shapeIssues, ...repeatedIdIssues(migrated, sections), ...nestingIssues(migrated)],
    sections,
  );
  if (!result.success || issues.length > 0) return failure(issues);
  return {
    ok: true,
    document: keepForeignFields(result.data as CmDocument, migrated as Record<string, unknown>),
  };
}

/**
 * Parses the text of a `.cm`/`.cm.json` file. An empty text is an empty document (a file the
 * editor just created); anything that is not JSON fails with the parser's message.
 */
export function parseDocumentText(text: string): ParseResult {
  const json = text.replace(/^\uFEFF/, "");
  if (json.trim() === "") return parseDocument({});
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return failure([
      {
        path: [],
        message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }
  return parseDocument(value);
}

/**
 * The top-level keys in the order the file writes them. A hand-written file may list its
 * relationships before its contexts; "before" and "document order" then follow the file, so an
 * editor marks the copy the author wrote second.
 */
function sectionsInFileOrder(input: unknown): readonly string[] {
  return input !== null && typeof input === "object" ? Object.keys(input) : [];
}

/**
 * Each id that a context or relationship written before it already uses, at the path of the
 * repeat. The canvas keeps one element per id, so such a file cannot be drawn. Read from the raw
 * input, so a repeat is found while other values are still invalid; ids that are no non-empty
 * string or reserved carry an issue of their own.
 */
function repeatedIdIssues(input: unknown, sections: readonly string[]): ParseIssue[] {
  if (input == null || typeof input !== "object") return [];
  const seen = new Set<string>();
  const issues: ParseIssue[] = [];
  const lists = sections.filter((key) => key === "contexts" || key === "relationships");
  for (const list of lists) {
    const entries = (input as Record<string, unknown>)[list];
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry: unknown, index) => {
      const id = idOf(entry);
      if (id === undefined || isReservedId(id)) return;
      if (seen.has(id)) {
        issues.push({
          path: [list, index, "id"],
          message: `duplicate id "${id}"; ids must be unique across contexts and relationships`,
        });
      }
      seen.add(id);
    });
  }
  return issues;
}

/**
 * At most this many nesting issues per document. Each carries a path of {@link MAX_NESTING_DEPTH}
 * keys, so one wide container beyond the limit would otherwise give millions of them and an error
 * text longer than a string may be.
 */
const MAX_NESTING_ISSUES = 100;

interface OpenContainer {
  readonly container: object;
  readonly keys: readonly string[] | undefined;
  readonly size: number;
  next: number;
  readonly keyInParent: string | number | undefined;
}

/**
 * Each object or array at the first level beyond {@link MAX_NESTING_DEPTH}, in document order, up
 * to {@link MAX_NESTING_ISSUES}. Walked with an explicit stack, because the files it guards against
 * are the ones that overflow a recursive walk. The stack holds only the containers the walk is
 * inside of, never their entries, so a wide container costs no more memory than a narrow one.
 */
function nestingIssues(input: unknown): ParseIssue[] {
  const issues: ParseIssue[] = [];
  if (!isContainer(input)) return issues;
  // A caller in JavaScript may put one container in several places, or inside itself: walking it
  // again at a level no deeper than before finds nothing new, and would grow exponentially.
  const deepestWalk = new WeakMap<object, number>();
  const open: OpenContainer[] = [];
  const enter = (container: object, keyInParent?: string | number): void => {
    deepestWalk.set(container, open.length);
    const keys = Array.isArray(container) ? undefined : Object.keys(container);
    const size = keys?.length ?? (container as unknown[]).length;
    open.push({ container, keys, size, next: 0, keyInParent });
  };
  enter(input);
  while (open.length > 0 && issues.length < MAX_NESTING_ISSUES) {
    const current = open[open.length - 1]!;
    if (current.next === current.size) {
      open.pop();
      continue;
    }
    const index = current.next++;
    const key = current.keys === undefined ? index : current.keys[index]!;
    const entry: unknown = (current.container as Record<string | number, unknown>)[key];
    if (!isContainer(entry)) continue;
    if (open.length >= MAX_NESTING_DEPTH) {
      issues.push({
        path: [...open.flatMap(({ keyInParent }) => keyInParent ?? []), key],
        message: `objects and arrays may nest at most ${MAX_NESTING_DEPTH} levels deep`,
      });
      continue;
    }
    if ((deepestWalk.get(entry) ?? -1) >= open.length) continue;
    enter(entry, key);
  }
  return issues;
}

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function idOf(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== "object") return undefined;
  const { id } = entry as { id?: unknown };
  return typeof id === "string" && id !== "" ? id : undefined;
}

/** The issues in file order, by section and then by element (a stable sort). */
function inDocumentOrder(issues: ParseIssue[], sections: readonly string[]): ParseIssue[] {
  const section = ({ path }: ParseIssue): number => {
    const index = typeof path[0] === "string" ? sections.indexOf(path[0]) : -1;
    return index === -1 ? sections.length : index;
  };
  const element = ({ path }: ParseIssue): number => (typeof path[1] === "number" ? path[1] : -1);
  return issues.sort((a, b) => section(a) - section(b) || element(a) - element(b));
}

/**
 * The version of a document written by a newer modeler. Reading it as version 1 would rewrite it
 * as version 1 on the next save, dropping whatever the newer version means.
 */
function newerVersionOf(input: unknown): number | undefined {
  if (input == null || typeof input !== "object") return undefined;
  const version = (input as { version?: unknown }).version;
  return typeof version === "number" && version > DOCUMENT_VERSION ? version : undefined;
}

/**
 * Forward-migrates older/foreign document shapes to the current version. v1 is
 * the first version, so this mostly normalises loosely-shaped input (e.g. from
 * a hand-written file) into the expected container shape.
 */
function migrate(input: unknown): unknown {
  if (input == null || typeof input !== "object") return input;
  const doc = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...doc };
  next.version = DOCUMENT_VERSION;
  if (typeof next.title !== "string") next.title = "Untitled context map";
  if (!Array.isArray(next.contexts)) next.contexts = [];
  if (!Array.isArray(next.relationships)) next.relationships = [];
  return next;
}

/** The parsed (known) fields of `known`, followed by the foreign fields of its `source`. */
function appendForeignFields<T extends object>(
  known: T,
  source: unknown,
  knownKeys: readonly string[],
): T {
  if (source === null || typeof source !== "object") return known;
  const foreign = Object.entries(foreignFields(source, knownKeys));
  return foreign.length === 0
    ? known
    : (Object.fromEntries([...Object.entries(known), ...foreign]) as T);
}

function keepForeignFields(parsed: CmDocument, source: Record<string, unknown>): CmDocument {
  const contexts = source.contexts as unknown[];
  const relationships = source.relationships as unknown[];
  return appendForeignFields(
    {
      ...parsed,
      contexts: parsed.contexts.map((context, index) =>
        appendForeignFields(context, contexts[index], CONTEXT_KEYS),
      ),
      relationships: parsed.relationships.map((relationship, index) =>
        appendForeignFields(relationship, relationships[index], RELATIONSHIP_KEYS),
      ),
    },
    source,
    DOCUMENT_KEYS,
  );
}

/** A semantic finding on the map, tied to a specific relationship where relevant. */
export interface SemanticFinding {
  /** Rule identifier, e.g. "protect-or-conform". */
  rule: string;
  /** Human-readable explanation for the inspector. */
  message: string;
  /** The offending relationship id, if the finding is relationship-scoped. */
  relationshipId?: string;
  /**
   * Which end of the relationship the finding points at (e.g. an ACL issue is
   * a downstream concern), so canvas markers can sit next to the actual
   * problem. Absent for findings about the relationship as a whole.
   */
  side?: "upstream" | "downstream";
}

export interface ValidationReport {
  errors: SemanticFinding[];
  warnings: SemanticFinding[];
}

/**
 * Applies the 13 strategic-DDD semantic rules (rules 1-10 adopted from Context
 * Mapper, rules 11-12 from Kaiser's "Architecture for Flow", rule 13 keeps the
 * map unambiguous) to a structurally-valid document. Hard violations are
 * `errors`; soft/advisory violations are `warnings`. Never throws and never
 * blocks loading.
 */
export function validateDocument(doc: CmDocument): ValidationReport {
  const errors: SemanticFinding[] = [];
  const warnings: SemanticFinding[] = [];
  const contextById = new Map(doc.contexts.map((c) => [c.id, c]));
  const contextIds = new Set(contextById.keys());

  // Rule 10 — unique ids across contexts and relationships.
  const seen = new Set<string>();
  for (const c of doc.contexts) {
    if (seen.has(c.id)) errors.push({ rule: "unique-ids", message: `Duplicate id "${c.id}".` });
    seen.add(c.id);
  }
  for (const r of doc.relationships) {
    if (seen.has(r.id))
      errors.push({ rule: "unique-ids", message: `Duplicate id "${r.id}".`, relationshipId: r.id });
    seen.add(r.id);
  }

  // Rule 13 — at most one relationship per pair of contexts (either direction);
  // overlapping duplicate lines are visually indistinguishable and ambiguous.
  const seenPairs = new Map<string, Relationship>();
  for (const r of doc.relationships) {
    if (r.from === r.to) continue;
    const pair = [r.from, r.to].sort().join("\u0000");
    const first = seenPairs.get(pair);
    if (first)
      errors.push({
        rule: "one-relationship-per-pair",
        message: `More than one relationship between "${contextById.get(r.from)?.label ?? r.from}" and "${contextById.get(r.to)?.label ?? r.to}"; keep only one.`,
        relationshipId: r.id,
      });
    else seenPairs.set(pair, r);
  }

  for (const r of doc.relationships) {
    const up = r.upstreamRoles ?? [];
    const down = r.downstreamRoles ?? [];
    const symmetric = isSymmetricPattern(r.pattern);

    // Rule 8 — both endpoints must be contexts on the map.
    if (!contextIds.has(r.from))
      errors.push({
        rule: "endpoints-on-map",
        message: `References unknown context "${r.from}".`,
        relationshipId: r.id,
      });
    if (!contextIds.has(r.to))
      errors.push({
        rule: "endpoints-on-map",
        message: `References unknown context "${r.to}".`,
        relationshipId: r.id,
      });

    // Rule 9 — no self-relationship.
    if (r.from === r.to)
      errors.push({
        rule: "no-self-relationship",
        message: `Connects a context to itself.`,
        relationshipId: r.id,
      });

    // Rules 1 & 2 — role placement (guards malformed imports).
    for (const role of up)
      if (!UPSTREAM_ROLES.includes(role))
        errors.push({
          rule: "upstream-roles",
          message: `"${role}" is not a valid upstream role (OHS, PL).`,
          relationshipId: r.id,
          side: "upstream",
        });
    for (const role of down)
      if (!DOWNSTREAM_ROLES.includes(role))
        errors.push({
          rule: "downstream-roles",
          message: `"${role}" is not a valid downstream role (ACL, CF).`,
          relationshipId: r.id,
          side: "downstream",
        });

    // Rule 4 — symmetric relationships carry no integration roles.
    if (symmetric && (up.length > 0 || down.length > 0))
      errors.push({
        rule: "symmetric-integrity",
        message: `A symmetric ${r.pattern} relationship must not carry OHS/PL/ACL/CF roles.`,
        relationshipId: r.id,
      });

    // Rule 3 — protect OR conform, not both.
    if (down.includes("ACL") && down.includes("CF"))
      errors.push({
        rule: "protect-or-conform",
        message: `ACL and CF are combined; choose one.`,
        relationshipId: r.id,
        side: "downstream",
      });

    // Rules 5, 6, 7 — customer-supplier constraints.
    if (r.pattern === "customer-supplier") {
      if (down.includes("CF"))
        errors.push({
          rule: "customer-vs-conformist",
          message: `Conformist (CF) is not applicable in a customer-supplier relationship; a customer can negotiate.`,
          relationshipId: r.id,
          side: "downstream",
        });
      if (up.includes("OHS"))
        errors.push({
          rule: "generic-vs-custom-service",
          message: `Open Host Service (OHS) is not applicable in a customer-supplier relationship; OHS is one-size-fits-all.`,
          relationshipId: r.id,
          side: "upstream",
        });
      if (down.includes("ACL"))
        warnings.push({
          rule: "protect-or-cooperate",
          message: `An ACL in a customer-supplier relationship may be unnecessary; the supplier should align with the customer.`,
          relationshipId: r.id,
          side: "downstream",
        });
    }

    // Rule 11 — a core domain should not conform to another context's model;
    // protect the differentiating model with an ACL instead.
    const downstreamContext = contextById.get(r.to);
    if (!symmetric && down.includes("CF") && downstreamContext?.subdomainType === "core") {
      const upstreamContext = contextById.get(r.from);
      warnings.push({
        rule: "protect-the-core",
        message: `Core domain "${downstreamContext.label}" conforms (CF) to "${upstreamContext?.label ?? r.from}"; protect the core with an ACL instead.`,
        relationshipId: r.id,
        side: "downstream",
      });
    }

    // Rule 12 — a shared kernel between different teams couples their delivery
    // and demands constant coordination; keep it within one team or decouple.
    if (r.pattern === "shared-kernel") {
      const fromTeam = contextById.get(r.from)?.team?.trim();
      const toTeam = contextById.get(r.to)?.team?.trim();
      if (fromTeam && toTeam && fromTeam !== toTeam) {
        warnings.push({
          rule: "shared-kernel-team-coupling",
          message: `A shared kernel across two teams (${fromTeam}, ${toTeam}) couples them tightly; consider a partnership or an upstream-downstream relationship.`,
          relationshipId: r.id,
        });
      }
    }
  }

  return { errors, warnings };
}
