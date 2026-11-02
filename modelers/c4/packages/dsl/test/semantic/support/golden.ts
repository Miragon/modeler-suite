import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  viewCatalog,
  viewMembers,
  type DiagnosticCode,
  type ModelElement,
  type Relationship,
  type Workspace,
} from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { parseWorkspace } from "../../../src/parse.js";

/*
 * Compares what the builder reads from a folder of DSL files with what Structurizr 6.2.4 made of
 * them (`scripts/structurizr-snapshots`): the verdict per file and, for every file whose model
 * the builder reads completely, the elements, relationships, static view contents and styles.
 */

interface ReferenceElement {
  readonly canonical: string;
  readonly identifier: string | null;
  readonly kind: string;
  readonly parent: string | null;
  readonly name: string;
  readonly description: string;
  readonly technology: string;
  readonly metadata: string;
  readonly tags: readonly string[];
  readonly url: string | null;
  readonly group: string | null;
  readonly properties: Readonly<Record<string, string>>;
}

interface ReferenceRelationship {
  readonly identifier: string | null;
  readonly source: string;
  readonly destination: string;
  readonly description: string;
  readonly technology: string;
  readonly tags: readonly string[];
  readonly url: string | null;
  readonly implied: boolean;
  readonly properties: Readonly<Record<string, string>>;
}

interface ReferenceView {
  readonly key: string;
  readonly type: string;
  readonly scope: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly default: boolean;
  readonly autoLayout: Readonly<Record<string, unknown>> | null;
  readonly elements: readonly string[];
  readonly relationships: readonly string[];
  readonly properties: Readonly<Record<string, string>>;
}

interface ReferenceResult {
  readonly file: string;
  readonly accepted: boolean;
  readonly error?: string;
  readonly workspace?: {
    readonly name: string;
    readonly description: string;
    readonly elements: readonly ReferenceElement[];
    readonly relationships: readonly ReferenceRelationship[];
    readonly views: readonly ReferenceView[];
    readonly styles: {
      readonly elements: readonly Readonly<Record<string, unknown>>[];
      readonly relationships: readonly Readonly<Record<string, unknown>>[];
      readonly themes: readonly string[];
    };
  };
}

function canonicalNames(workspace: Workspace): Map<string, string> {
  const byId = new Map(workspace.elements.map((element) => [element.id, element]));
  const prefix: Readonly<Record<ModelElement["kind"], string>> = {
    person: "Person://",
    softwareSystem: "SoftwareSystem://",
    container: "Container://",
    component: "Component://",
    custom: "Custom://",
  };
  const names = new Map<string, string>();
  for (const element of workspace.elements) {
    const chain: string[] = [];
    for (
      let current: ModelElement | undefined = element;
      current;
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)
    ) {
      chain.unshift(current.name.replaceAll(".", "").replaceAll("/", ""));
    }
    names.set(element.id, `${prefix[element.kind]}${chain.join(".")}`);
  }
  return names;
}

/**
 * Structurizr keys an explicit element below an anonymous one under that one's random UUID, which
 * the snapshot leaves out; the builder keys it under the implicit identifier instead (SPEC 3.3).
 */
function underAnonymous(workspace: Workspace, element: ModelElement): boolean {
  const byId = new Map(workspace.elements.map((candidate) => [candidate.id, candidate]));
  for (
    let parent = element.parentId === undefined ? undefined : byId.get(element.parentId);
    parent;
    parent = parent.parentId === undefined ? undefined : byId.get(parent.parentId)
  ) {
    if (parent.implicit && element.id.startsWith(`${parent.id}.`)) return true;
  }
  return false;
}

function ourElements(workspace: Workspace) {
  const names = canonicalNames(workspace);
  return workspace.elements.map((element) => ({
    canonical: names.get(element.id),
    identifier: element.implicit || underAnonymous(workspace, element) ? null : element.id,
    kind: element.kind,
    parent: element.parentId === undefined ? null : (names.get(element.parentId) ?? null),
    name: element.name,
    description: element.description,
    technology: element.technology,
    metadata: element.metadata,
    tags: element.tags,
    url: element.url ?? null,
    group: element.group ?? null,
    properties: element.properties,
  }));
}

function relationshipLabel(relationship: Relationship, names: ReadonlyMap<string, string>): string {
  return `${names.get(relationship.sourceId)} -> ${names.get(relationship.destinationId)} (${relationship.description})${relationship.implied ? " implied" : ""}`;
}

function ourRelationships(workspace: Workspace) {
  const names = canonicalNames(workspace);
  return workspace.relationships
    .map((relationship) => ({
      identifier: relationship.identifier ?? null,
      source: names.get(relationship.sourceId),
      destination: names.get(relationship.destinationId),
      description: relationship.description,
      technology: relationship.technology,
      tags: relationship.implied ? null : relationship.tags,
      url: relationship.url ?? null,
      implied: relationship.implied,
      properties: relationship.implied ? null : (relationship.properties ?? {}),
    }))
    .sort(byJson);
}

function ourViews(workspace: Workspace) {
  const names = canonicalNames(workspace);
  const relationships = new Map(
    workspace.relationships.map((relationship) => [relationship.canvasKey, relationship]),
  );
  return viewCatalog(workspace)
    .list()
    .filter(
      (entry) =>
        entry.state === "written" &&
        ["systemLandscape", "systemContext", "container", "component"].includes(entry.type),
    )
    .map((entry) => {
      const members = viewMembers(workspace, entry);
      const definition = entry.definition;
      return {
        key: entry.key,
        type: entry.type,
        scope: entry.scopeId === undefined ? null : (names.get(entry.scopeId) ?? null),
        title: definition?.title ?? null,
        description: definition?.description ?? "",
        default: definition?.isDefault ?? false,
        autoLayout: definition?.autoLayout ?? null,
        elements: members.elements.map((id) => names.get(id)).sort(),
        relationships: members.relationships
          .map((key) => relationships.get(key))
          .filter((relationship): relationship is Relationship => relationship !== undefined)
          .map((relationship) => relationshipLabel(relationship, names))
          .sort(),
        properties: definition?.properties ?? {},
      };
    });
}

const RANK_DIRECTIONS: Readonly<Record<string, string>> = {
  TopBottom: "tb",
  BottomTop: "bt",
  LeftRight: "lr",
  RightLeft: "rl",
};

function referenceViews(views: readonly ReferenceView[]) {
  return views.map((view) => ({
    key: view.key,
    type: view.type,
    scope: view.scope,
    title: view.title === "" ? null : view.title,
    description: view.description ?? "",
    default: view.default,
    autoLayout:
      view.autoLayout === null
        ? null
        : {
            rankDirection: RANK_DIRECTIONS[String(view.autoLayout["rankDirection"])],
            rankSeparation: view.autoLayout["rankSeparation"],
            nodeSeparation: view.autoLayout["nodeSeparation"],
            edgeSeparation: view.autoLayout["edgeSeparation"],
            vertices: view.autoLayout["vertices"],
          },
    elements: [...view.elements].sort(),
    relationships: [...view.relationships].sort(),
    properties: view.properties,
  }));
}

function byJson(left: unknown, right: unknown): number {
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Files whose model the builder reads completely: no include, extension, script or bulk statement. */
function closedWorld(text: string, workspace: Workspace): boolean {
  return !workspace.openWorld && !/^\s*!(elements|relationships)\b/im.test(text);
}

export interface GoldenSuite {
  readonly title: string;
  readonly folder: string;
  readonly snapshot: string;
  readonly files: number;
  /** Refused by the reference run only for what its machine lacked. */
  readonly environment?: ReadonlySet<string>;
  /** What Structurizr refuses, and the diagnostic the builder names for it. */
  readonly refused: Readonly<
    Record<string, { readonly code: DiagnosticCode; readonly rejects: boolean }>
  >;
  readonly encoding?: (file: string) => BufferEncoding;
  readonly minimumCompared: number;
}

export function goldenSuite(suite: GoldenSuite): void {
  const reference = JSON.parse(readFileSync(suite.snapshot, "utf8")) as {
    readonly structurizr: { readonly version: string; readonly commit: string };
    readonly results: readonly ReferenceResult[];
  };
  const read = (file: string) =>
    readFileSync(join(suite.folder, file), suite.encoding?.(file) ?? "utf8");
  const environment = suite.environment ?? new Set<string>();
  const accepted = reference.results.filter(
    (result) => result.accepted || environment.has(result.file),
  );
  const refused = reference.results.filter(
    (result) => !result.accepted && !environment.has(result.file),
  );
  const compared = accepted.filter((result) => {
    if (!result.accepted || result.workspace === undefined) return false;
    const text = read(result.file);
    return closedWorld(text, parseWorkspace(text).workspace);
  });

  describe(suite.title, () => {
    it("covers every file, read by Structurizr 6.2.4", () => {
      expect(reference.structurizr).toEqual({
        version: "6.2.4",
        commit: "e3a736a90194d3ac692ad7b5c1c7a48287355347",
      });
      expect(reference.results).toHaveLength(suite.files);
      expect(Object.keys(suite.refused).sort()).toEqual(
        refused.map((result) => result.file).sort(),
      );
      expect(compared.length).toBeGreaterThanOrEqual(suite.minimumCompared);
    });

    it.each(accepted.map((result) => result.file))(
      "%s imports without a compatibility error",
      (file) => {
        const parse = parseWorkspace(read(file));
        expect(parse.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual(
          [],
        );
        expect(parse.ok).toBe(true);
      },
    );

    it.each(refused.map((result) => result.file))(
      "%s is refused for the reason Structurizr refuses it",
      (file) => {
        const expected = suite.refused[file];
        const parse = parseWorkspace(read(file));
        const found = parse.diagnostics.filter(
          (diagnostic) =>
            diagnostic.code === expected?.code &&
            diagnostic.rejects === expected.rejects &&
            diagnostic.severity === "error",
        );
        expect(found.length).toBeGreaterThan(0);
        expect(parse.ok).toBe(!expected?.rejects);
      },
    );

    describe.each(compared.map((result) => [result.file, result] as const))(
      "%s",
      (file, result) => {
        const workspace = parseWorkspace(read(file)).workspace;
        const expected = result.workspace;
        if (expected === undefined) throw new Error("no workspace in the reference");

        it("has the name and description", () => {
          expect({ name: workspace.name, description: workspace.description }).toEqual({
            name: expected.name === "Name" ? "" : expected.name,
            description: expected.description === "Description" ? "" : expected.description,
          });
        });

        it("has the elements", () => {
          const elements = expected.elements.map((element) => ({
            ...element,
            url: element.url ?? null,
          }));
          expect(ourElements(workspace).sort(byJson)).toEqual([...elements].sort(byJson));
        });

        it("has the explicit and implied relationships", () => {
          const relationships = expected.relationships.map((relationship) => ({
            identifier: relationship.identifier,
            source: relationship.source,
            destination: relationship.destination,
            description: relationship.description,
            technology: relationship.technology,
            tags: relationship.implied ? null : relationship.tags,
            url: relationship.url,
            implied: relationship.implied,
            properties: relationship.implied ? null : relationship.properties,
          }));
          expect(ourRelationships(workspace)).toEqual([...relationships].sort(byJson));
        });

        it("shows what Structurizr shows in every static view", () => {
          expect(ourViews(workspace)).toEqual(referenceViews(expected.views));
        });

        it("has the light styles, the unscoped and the light one of a tag merged", () => {
          const defined = (style: Readonly<Record<string, unknown>>) =>
            Object.fromEntries(
              Object.entries(style).filter(([, value]) => value !== null && value !== undefined),
            );
          const merge = (styles: readonly Readonly<Record<string, unknown>>[]) => {
            const merged = new Map<unknown, Record<string, unknown>>();
            for (const style of styles.map(defined))
              merged.set(style["tag"], { ...merged.get(style["tag"]), ...style });
            return [...merged.values()].sort(byJson);
          };
          const plain = (style: object) => style as Readonly<Record<string, unknown>>;
          expect(workspace.styles.elements.map(plain).map(defined).sort(byJson)).toEqual(
            merge(expected.styles.elements).map(elementStyle),
          );
          expect(
            workspace.styles.relationships.map(plain).map(relationshipStyle).sort(byJson),
          ).toEqual(merge(expected.styles.relationships.map(relationshipStyle)));
        });
      },
    );
  });
}

/** Structurizr's enum spellings in the model's; the legacy `dashed` flag read as the line style. */
function relationshipStyle(style: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { dashed, ...rest } = style;
  const entries = Object.entries(rest)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => [
      name,
      typeof value === "string" && (name === "style" || name === "routing")
        ? value.toLowerCase()
        : value,
    ]);
  const read = Object.fromEntries(entries);
  if (read["style"] === undefined && typeof dashed === "boolean")
    read["style"] = dashed ? "dashed" : "solid";
  return read;
}

function elementStyle(style: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const entries = Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => [
      name,
      name === "border" && typeof value === "string" ? value.toLowerCase() : value,
    ]);
  return Object.fromEntries(entries);
}
