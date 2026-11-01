/*
 * The C4 model of a Structurizr DSL workspace as plain data: what @miragon/c4-dsl builds from the
 * text, and what the layout and the renderer read without depending on the parser. Frozen
 * interface (SPEC 3.2, 4.1, 4.2): a change goes to every work package that depends on it.
 */

/** An explicit identifier (hierarchical mode: the full dotted key) or an implicit one (SPEC 3.3). */
export type ElementId = string;
/** The identifier, else `<src>-><dst>`, else `implied:<src>-><dst>` (SPEC 3.6). */
export type RelationshipKey = string;
/** `[a-zA-Z0-9_-]+` */
export type ViewKey = string;
export type ElementKind = "person" | "softwareSystem" | "container" | "component" | "custom";
export type StaticViewType = "systemLandscape" | "systemContext" | "container" | "component";
export type ViewType = StaticViewType | "filtered" | "dynamic" | "deployment" | "custom" | "image";
export type IdentifierMode = "flat" | "hierarchical";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Box extends Point, Size {}

export type FieldName = "name" | "description" | "technology" | "metadata" | "tags" | "url";

/** Where a field's value is written, so an edit writes it back to the same place (SPEC 3.5). */
export interface FieldSource {
  readonly form: "positional" | "statement" | "reopen" | "archetype" | "absent";
  /** Index into the parse's source index (dsl-internal). */
  readonly statement: number;
  readonly token: number | undefined;
  readonly editable: boolean;
  /** Why the field is not editable. */
  readonly reason: "substitution" | "bulk" | "several-statements" | "include" | undefined;
}

export interface ModelElement {
  readonly id: ElementId;
  /** As written. */
  readonly identifier: string | undefined;
  /** Anonymous: `id` is the implicit identifier. */
  readonly implicit: boolean;
  readonly kind: ElementKind;
  readonly archetype: string | undefined;
  readonly parentId: ElementId | undefined;
  readonly name: string;
  readonly description: string;
  /** Containers and components. */
  readonly technology: string;
  /** Custom elements. */
  readonly metadata: string;
  /** In cascade order: Element, the kind's tag, archetype tags, own tags. */
  readonly tags: readonly string[];
  readonly ownTags: readonly string[];
  readonly url: string | undefined;
  readonly properties: Readonly<Record<string, string>>;
  /** `Outer/Inner`, joined with `structurizr.groupSeparator`. */
  readonly group: string | undefined;
  readonly fields: Readonly<Record<FieldName, FieldSource>>;
}

export interface Relationship {
  /** Undefined for an ambiguous unnamed duplicate (SPEC 3.6). */
  readonly key: RelationshipKey | undefined;
  /** `key`, or `<src>-><dst>#<n>` for an ambiguous one: the canvas's, never written. */
  readonly canvasKey: string;
  readonly identifier: string | undefined;
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
  readonly description: string;
  readonly technology: string;
  readonly tags: readonly string[];
  readonly url: string | undefined;
  readonly implied: boolean;
  readonly impliedBy: RelationshipKey | undefined;
  /** Made by `!elements` or `!relationships`: not editable. */
  readonly bulk: boolean;
  readonly fields: Readonly<Record<"description" | "technology" | "tags" | "url", FieldSource>>;
  /**
   * The relationship's `properties`, archetype defaults first; an implied one carries its
   * origin's, as `relationship.properties[name]==value` reads the linked relationship. Absent
   * when there are none.
   */
  readonly properties?: Readonly<Record<string, string>>;
}

export interface AutoLayout {
  readonly rankDirection: "tb" | "bt" | "lr" | "rl";
  /** Structurizr px, as are the other two separations. */
  readonly rankSeparation: number;
  readonly nodeSeparation: number;
  readonly edgeSeparation: number;
  readonly vertices: boolean;
}

/** A `c4modeler.element.<id>` value in modeler units; `width` and `height` only when not the default. */
export interface StoredBox {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

export interface StoredLayout {
  readonly elements: ReadonlyMap<ElementId, StoredBox>;
  readonly relationships: ReadonlyMap<RelationshipKey, readonly Point[]>;
  /** Keys naming nothing in the view: kept in the text, reported as info. */
  readonly unmatched: readonly string[];
  /** Unreadable values: ignored with a warning, rewritten by the next edit. */
  readonly malformed: readonly string[];
}

/**
 * The supported include and exclude terms (SPEC 4.1, R-DSL §11.3). `element==x` reads as the
 * reference `x`, `element==->x->` as its coupling, `element!=…` as `not`, `relationship==*` as
 * `*->*`. A term outside this set has no expression and makes its view read-only.
 */
export type Expression =
  | { readonly kind: "all"; readonly reluctant: boolean }
  | { readonly kind: "reference"; readonly identifier: string }
  | {
      readonly kind: "coupling";
      readonly afferent: boolean;
      readonly efferent: boolean;
      readonly operand: Expression;
    }
  | { readonly kind: "not"; readonly operand: Expression }
  | { readonly kind: "elementType"; readonly elementKind: ElementKind }
  | { readonly kind: "elementParent"; readonly parent: string }
  | { readonly kind: "elementTag"; readonly equals: boolean; readonly tags: readonly string[] }
  | { readonly kind: "elementTechnology"; readonly equals: boolean; readonly technology: string }
  | { readonly kind: "elementProperty"; readonly name: string; readonly value: string }
  | { readonly kind: "elementGroup"; readonly group: string }
  | {
      readonly kind: "relationship";
      /** An identifier or `*`. */
      readonly source: string;
      readonly destination: string;
    }
  | { readonly kind: "relationshipTag"; readonly equals: boolean; readonly tags: readonly string[] }
  | { readonly kind: "relationshipProperty"; readonly name: string; readonly value: string }
  | {
      readonly kind: "relationshipEnd";
      readonly end: "source" | "destination";
      readonly operand: Expression;
    }
  | {
      readonly kind: "and" | "or";
      readonly left: Expression;
      readonly right: Expression;
    };

export interface ViewTerm {
  readonly text: string;
  /** Undefined: not supported (SPEC 4.1). */
  readonly expression: Expression | undefined;
}

export interface ViewStatement {
  readonly kind: "include" | "exclude";
  readonly terms: readonly ViewTerm[];
}

export interface ViewDefinition {
  readonly key: ViewKey;
  /** Keyless in the text: the key is Structurizr's `generateViewKey` value. */
  readonly keyGenerated: boolean;
  readonly type: ViewType;
  readonly scopeId: ElementId | undefined;
  /** Filtered views. */
  readonly baseKey: ViewKey | undefined;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly isDefault: boolean;
  readonly autoLayout: AutoLayout | undefined;
  readonly statements: readonly ViewStatement[];
  /** The later `properties` block wins per key. */
  readonly properties: Readonly<Record<string, string>>;
  readonly layout: StoredLayout;
  /** One of the four static types, with every term supported. */
  readonly editable: boolean;
  readonly readOnlyReason: "type" | "expression" | "scope" | undefined;
}

export interface GroupDefinition {
  readonly name: string;
  readonly identifier: string | undefined;
  /** `Outer/Inner`, joined with `structurizr.groupSeparator`. */
  readonly path: string;
  /** The element whose block holds the group; absent at model level. */
  readonly parentId?: ElementId;
  readonly members: readonly ElementId[];
}

/** Structurizr's shape names; the style property is case-insensitive. */
export type ShapeName =
  | "Box"
  | "RoundedBox"
  | "Circle"
  | "Ellipse"
  | "Hexagon"
  | "Diamond"
  | "Cylinder"
  | "Bucket"
  | "Pipe"
  | "Person"
  | "Robot"
  | "Folder"
  | "WebBrowser"
  | "Window"
  | "Terminal"
  | "Shell"
  | "MobileDevicePortrait"
  | "MobileDeviceLandscape"
  | "Component";

export type LineStyle = "solid" | "dashed" | "dotted";
export type RelationshipRouting = "direct" | "orthogonal" | "curved";

/** One `element "<tag>"` style as written, merged per tag; sizes in Structurizr px. */
export interface ElementStyle {
  readonly tag: string;
  readonly shape?: ShapeName;
  readonly width?: number;
  readonly height?: number;
  /** `#rrggbb` in lower case, also for a CSS colour name. */
  readonly background?: string;
  readonly stroke?: string;
  readonly color?: string;
  readonly strokeWidth?: number;
  readonly fontSize?: number;
  readonly border?: LineStyle;
  /** 0..100 */
  readonly opacity?: number;
  readonly metadata?: boolean;
  readonly description?: boolean;
  readonly icon?: string;
}

/** One `relationship "<tag>"` style as written, merged per tag; `dashed false` reads as solid. */
export interface RelationshipStyle {
  readonly tag: string;
  readonly thickness?: number;
  readonly color?: string;
  readonly style?: LineStyle;
  readonly routing?: RelationshipRouting;
  readonly fontSize?: number;
  readonly width?: number;
  /** 0..100 */
  readonly position?: number;
  readonly opacity?: number;
  readonly metadata?: boolean;
  readonly description?: boolean;
}

/** The light scheme: unscoped and `light` styles, in the order their tags were first defined. */
export interface Styles {
  readonly elements: readonly ElementStyle[];
  readonly relationships: readonly RelationshipStyle[];
  /** Theme names and URLs, never fetched. */
  readonly themes: readonly string[];
}

export type MetadataSymbols = "square" | "round" | "curly" | "angle" | "double-angle" | "none";

/** The words of the type line, with `terminology` applied over the English defaults. */
export interface Terminology {
  readonly person: string;
  readonly softwareSystem: string;
  readonly container: string;
  readonly component: string;
  readonly deploymentNode: string;
  readonly infrastructureNode: string;
  readonly relationship: string;
  readonly metadataSymbols: MetadataSymbols;
}

export interface Workspace {
  readonly name: string;
  readonly description: string;
  /** Document order. */
  readonly elements: readonly ModelElement[];
  /** Explicit ones in document order, then the implied ones in creation order. */
  readonly relationships: readonly Relationship[];
  /** The written views in document order. */
  readonly views: readonly ViewDefinition[];
  readonly groups: readonly GroupDefinition[];
  /** Light-scheme element and relationship styles; dark blocks are kept in the text and ignored. */
  readonly styles: Styles;
  readonly terminology: Terminology;
  readonly dynamicReferences: ReadonlyMap<
    ViewKey,
    { readonly elements: readonly ElementId[]; readonly relationships: readonly RelationshipKey[] }
  >;
  /** Deployment instance identifiers per element. */
  readonly instances: ReadonlyMap<ElementId, readonly string[]>;
  /** `!include`, `extends`, `!script` or `!plugin` present: content the modeler did not read. */
  readonly openWorld: boolean;
  /** `!script`, `!plugin` and `!components` bodies, `!elements` and `!relationships` expressions. */
  readonly opaqueTexts: readonly string[];
}

export type DiagnosticCode =
  // The reject rules of SPEC 3.8 (`rejects: true`).
  | "unclosed-block"
  | "unexpected-close"
  | "unterminated-comment"
  | "unterminated-text-block"
  | "workspace-count"
  | "statement-outside-workspace"
  | "duplicate-block"
  | "duplicate-identifier"
  | "duplicate-view-key"
  | "element-not-permitted"
  | "invalid-identifier"
  // Compatibility errors: Structurizr 6.2.4 refuses them, the canvas shows the rest safely.
  | "unresolved-reference"
  | "duplicate-name"
  | "relationship-not-permitted"
  | "relationship-to-ancestor"
  | "relationship-exists"
  | "view-element-not-permitted"
  | "invalid-statement"
  | "structurizr-rejects"
  // Warnings and infos (SPEC 3.6, 3.7, 4.2, 6.2, 6.4).
  | "include-not-read"
  | "extends-not-read"
  | "unknown-constant"
  | "script-not-run"
  | "bulk-not-evaluated"
  | "implied-strategy-unknown"
  | "view-type-not-editable"
  | "view-scope-invalid"
  | "unsupported-expression"
  | "theme-not-loaded"
  | "style-property-ignored"
  | "unknown-statement"
  | "relationship-ambiguous"
  | "layout-unmatched"
  | "layout-malformed"
  | "default-not-editable"
  | "shape-substituted"
  | "text-colour-adjusted";

export interface Diagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: DiagnosticCode;
  /** English, guide §2: what happened, what to do. */
  readonly message: string;
  /** UTF-16 offsets into the text. */
  readonly range: { readonly start: number; readonly end: number };
  /** 1-based, the first physical line of the statement; `column` is 1-based too. */
  readonly line: number;
  readonly column: number;
  /** The exclusive end, 1-based. */
  readonly endLine: number;
  readonly endColumn: number;
  readonly rejects: boolean;
  /** Statement identity: element id, relationship key, view key or normalised statement text. */
  readonly anchor: string;
  readonly elementId?: ElementId;
}

/** What a static view shows (SPEC 4.1). */
export interface ViewMembers {
  /** Document order. */
  readonly elements: readonly ElementId[];
  /** Canvas keys: explicit ones in document order, then implied ones. */
  readonly relationships: readonly string[];
  readonly boundaries: readonly {
    readonly elementId: ElementId;
    readonly members: readonly ElementId[];
    readonly parentId?: ElementId;
    readonly depth: number;
  }[];
  /**
   * A group is the path within its scope: the model and a system's block may each hold a "Core",
   * so `groupKey(scopeId, path)` is what tells two frames of one view apart.
   */
  readonly groups: readonly {
    readonly path: string;
    readonly name: string;
    /** The element whose block holds the group (`GroupDefinition.parentId`); absent at model level. */
    readonly scopeId?: ElementId;
    readonly members: readonly ElementId[];
    readonly depth: number;
  }[];
  readonly diagnostics: readonly Diagnostic[];
}

/** A view the catalog lists or resolves: written, implicit or a draft (SPEC 4.2). */
export interface ViewEntry {
  readonly key: ViewKey;
  readonly state: "written" | "implicit" | "draft";
  readonly type: ViewType;
  readonly scopeId: ElementId | undefined;
  readonly editable: boolean;
  /** The displayed title (SPEC 4.6). */
  readonly title: string;
  /** Written views only. */
  readonly definition: ViewDefinition | undefined;
}

export interface ViewCatalog {
  /** Written (document order), then implicit, then the missing default drafts. */
  list(): readonly ViewEntry[];
  /** Written, implicit or any draft key derivable from the workspace. */
  resolve(key: ViewKey): ViewEntry | undefined;
  defaultView(): ViewEntry;
  /** The drill-down target (SPEC 4.5). */
  childOf(elementId: ElementId): ViewEntry | undefined;
  parentOf(key: ViewKey): ViewEntry | undefined;
  /** The written one if it exists. */
  draftFor(type: StaticViewType, scopeId?: ElementId): ViewEntry;
}

/** The identifiers `deriveIdentifier` must avoid, all in lower case (lookups are case-insensitive). */
export interface IdentifierRegister {
  /**
   * Explicit and implicit element identifiers (hierarchical mode: full dotted keys), group,
   * deployment and relationship identifiers.
   */
  readonly taken: ReadonlySet<string>;
  readonly archetypes: ReadonlySet<string>;
}

/** `!impliedRelationships`: true, the built-in "unless same" class, or false. */
export type ImpliedStrategy = "unless-any" | "unless-same" | "none";

/** An explicit relationship in document order, with the strategy in force where it is written. */
export interface RelationshipEvent {
  readonly relationship: Relationship;
  readonly strategy: ImpliedStrategy;
}

export interface Ancestry {
  /** Child to parent. */
  readonly parents: ReadonlyMap<ElementId, ElementId>;
}

/**
 * An element's style after the cascade (SPEC 6.4). A colour left undefined draws the default
 * look's role; a defined one is self-set and already meets the contrast rule (text 4.5:1 on the
 * fill, stroke 3:1 on the canvas ground).
 */
export interface ResolvedElementStyle {
  readonly shape: ShapeName;
  /** Style `width` / `height` in modeler units; undefined: the shape's default. */
  readonly width: number | undefined;
  readonly height: number | undefined;
  /** With the style's opacity mixed over white. */
  readonly fill: string | undefined;
  readonly stroke: string | undefined;
  readonly text: string | undefined;
  /** Modeler units, 1..4. */
  readonly strokeWidth: number;
  readonly border: LineStyle;
  /** Whether the type line is drawn. */
  readonly metadata: boolean;
  readonly description: boolean;
  /** The tags whose styles contributed, in cascade order (the legend's label). */
  readonly tags: readonly string[];
}

/** A boundary's style after the cascade over `Boundary` and `Boundary:<Kind>`. */
export interface ResolvedBoundaryStyle {
  /** Undefined: no fill. */
  readonly fill: string | undefined;
  readonly stroke: string | undefined;
  readonly text: string | undefined;
  readonly strokeWidth: number;
  readonly border: LineStyle;
  readonly tags: readonly string[];
}

export interface ResolvedRelationshipStyle {
  readonly stroke: string | undefined;
  /** The self-set colour adjusted to 4.5:1 on the label's ground. */
  readonly text: string | undefined;
  /** Modeler units, 1..4. */
  readonly thickness: number;
  readonly line: LineStyle;
  readonly routing: RelationshipRouting;
  /** The label's place along the path, 0..100. */
  readonly position: number;
  readonly metadata: boolean;
  readonly description: boolean;
  readonly tags: readonly string[];
}

/** One tag style of "Apply C4 colours". */
export interface ColourStyle {
  readonly tag: string;
  readonly background: string;
  readonly color: string;
  readonly stroke: string;
}

export interface ElementDigest {
  readonly kind: ElementKind;
  readonly parentId: ElementId | undefined;
  readonly name: string;
  readonly description: string;
  readonly technology: string;
  readonly metadata: string;
  readonly ownTags: readonly string[];
  readonly url: string | undefined;
  readonly properties: Readonly<Record<string, string>>;
  readonly group: string | undefined;
}

export interface RelationshipDigest {
  readonly identifier: string | undefined;
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
  readonly description: string;
  readonly technology: string;
  readonly tags: readonly string[];
  readonly url: string | undefined;
}

export interface ViewDigest {
  readonly key: ViewKey;
  readonly type: ViewType;
  readonly scopeId: ElementId | undefined;
  readonly baseKey: ViewKey | undefined;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly isDefault: boolean;
  readonly autoLayout: AutoLayout | undefined;
  readonly statements: readonly {
    readonly kind: "include" | "exclude";
    readonly terms: readonly string[];
  }[];
  /** Layout entries and every other property. */
  readonly properties: Readonly<Record<string, string>>;
}

/**
 * The primary digest the edit layer's frame condition compares (SPEC 3.4 step 4): plain data, so
 * an operation states its expected result as a transformation of the digest before it.
 */
export interface SemanticDigest {
  readonly name: string;
  readonly description: string;
  readonly elements: ReadonlyMap<ElementId, ElementDigest>;
  /** Explicit relationships in document order. */
  readonly relationships: readonly RelationshipDigest[];
  /** Written views in document order. */
  readonly views: ReadonlyMap<ViewKey, ViewDigest>;
  /** The styles, normalised. */
  readonly styles: string;
  /** Normalised text of what the modeler does not interpret: deployment, dynamic steps, docs, scripts. */
  readonly opaque: readonly string[];
}
