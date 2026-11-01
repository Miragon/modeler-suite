/*
 * The syntax tree (SPEC 3.1), the parse result (3.2), the source index the edit layer reads (WP3)
 * and the edit operations (3.4) of the Structurizr DSL reader and editor. Frozen interface: a
 * change goes to every work package that depends on it.
 */
import type {
  Box,
  Diagnostic,
  ElementId,
  FieldName,
  IdentifierMode,
  Point,
  Size,
  StaticViewType,
  ViewKey,
  Workspace,
} from "@miragon/c4-schema-model";

/** UTF-16 offsets into the text. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export interface Token {
  /** Unescaped. */
  readonly value: string;
  /** As written, quotes included. */
  readonly raw: string;
  readonly quoted: boolean;
  readonly textBlock: boolean;
  /** `raw` contains `${…}`. */
  readonly substitutes: boolean;
  readonly range: TextRange;
}

export interface Statement {
  readonly kind: "statement";
  /** The first physical line's indentation to the end of the last (block close included), line break excluded. */
  readonly range: TextRange;
  /** The logical line, continuations and text block included, up to and including `{`. */
  readonly head: TextRange;
  readonly indent: string;
  /** `x` of `x = …` */
  readonly assignee: Token | undefined;
  /** Keyword or operator first; `{` excluded. */
  readonly tokens: readonly Token[];
  readonly continued: boolean;
  readonly endsInTextBlock: boolean;
  /** Structurizr rejects it (a compatibility error, SPEC 3.8). */
  readonly trailingComment: TextRange | undefined;
  readonly block:
    | {
        readonly open: TextRange;
        readonly children: readonly CstNode[];
        readonly close: CloseBrace;
      }
    | undefined;
}

/** `} // done` keeps ` // done` as `trailing`. */
export interface CloseBrace {
  readonly range: TextRange;
  readonly indent: string;
  readonly trailing: string;
}

export interface Trivia {
  readonly kind: "blank" | "lineComment" | "blockComment";
  readonly range: TextRange;
}

/** Verbatim up to the line that, trimmed, is `}`. */
export interface RawBlock {
  readonly kind: "raw";
  readonly directive: "!script" | "!plugin" | "!components";
  readonly range: TextRange;
}

export type CstNode = Statement | Trivia | RawBlock;

export interface Cst {
  readonly text: string;
  readonly bom: boolean;
  /** The majority, `\n` on a tie. */
  readonly lineBreak: "\n" | "\r\n";
  /** The most common step between a block statement and its first child; 4 spaces by default. */
  readonly indentUnit: string;
  readonly endsWithLineBreak: boolean;
  readonly nodes: readonly CstNode[];
  readonly syntaxDiagnostics: readonly Diagnostic[];
}

/** Statements per element, relationship, view and field: read only by @miragon/c4-dsl. */
export interface SourceIndex {
  element(
    id: ElementId,
  ): { readonly definition: Statement; readonly reopens: readonly Statement[] } | undefined;
  field(
    id: ElementId,
    field: FieldName,
  ): { readonly statement: Statement; readonly token: number | undefined } | undefined;
  relationship(key: string): Statement | undefined;
  view(key: ViewKey): Statement | undefined;
  modelBlock(): Statement | undefined;
  viewsBlock(): Statement | undefined;
  stylesBlock(): Statement | undefined;
  identifierModeAt(offset: number): IdentifierMode;
  references(id: ElementId): readonly { readonly statement: Statement; readonly token: number }[];
}

export interface ParseResult {
  /** No diagnostic rejects. */
  readonly ok: boolean;
  readonly text: string;
  readonly cst: Cst;
  readonly workspace: Workspace;
  readonly diagnostics: readonly Diagnostic[];
  readonly sources: SourceIndex;
}

export type CreatableKind = "person" | "softwareSystem" | "container" | "component";

export interface ElementFields {
  name: string;
  description: string;
  technology: string;
  metadata: string;
  tags: readonly string[];
  url: string | null;
}

export interface RelationshipFields {
  description: string;
  technology: string;
  tags: readonly string[];
  url: string | null;
}

export type C4Edit =
  | {
      type: "createElement";
      kind: CreatableKind;
      name?: string;
      tags?: readonly string[];
      /** Without it the element gets no layout key: the view places it beside its first neighbour. */
      center?: Point;
      size?: Size;
      /** Also writes a relationship from this element to the new one, in the same edit. */
      connectFrom?: ElementId;
    }
  | {
      type: "createRelationship";
      sourceId: ElementId;
      destinationId: ElementId;
      description?: string;
      technology?: string;
    }
  | { type: "updateElement"; id: ElementId; fields: Partial<ElementFields> }
  /** `key` is the relationship's canvas key. */
  | { type: "updateRelationship"; key: string; fields: Partial<RelationshipFields> }
  /**
   * Moves one end of an explicit relationship from its element to a child of it (a software
   * system's container, a container's component); everything else of the relationship stays.
   */
  | {
      type: "moveRelationshipEnd";
      /** The relationship's canvas key. */
      key: string;
      end: "source" | "destination";
      /** A child of the element at that end. */
      to: ElementId;
      /** Where the elements the move brings into the current view are drawn, as their layout keys. */
      boxes?: ReadonlyMap<ElementId, Box>;
    }
  | { type: "renameIdentifier"; id: ElementId; identifier: string }
  | {
      type: "setLayout";
      boxes: ReadonlyMap<ElementId, Box>;
      vertices: ReadonlyMap<string, readonly Point[] | null>;
    }
  | { type: "smartDelete"; ids: readonly ElementId[]; relationships: readonly string[] }
  | { type: "deleteFromModel"; ids: readonly ElementId[]; relationships: readonly string[] }
  | { type: "removeFromView"; ids: readonly ElementId[]; relationships: readonly string[] }
  | {
      type: "includeInView";
      ids: readonly ElementId[];
      /** Where the added elements are drawn, written as their layout keys so they never move. */
      boxes?: ReadonlyMap<ElementId, Box>;
    }
  | { type: "createView"; viewType: StaticViewType; scopeId?: ElementId; title?: string }
  | {
      type: "updateView";
      key: ViewKey;
      fields: { title?: string | null; description?: string | null };
    }
  | { type: "deleteView"; key: ViewKey }
  /** "Lay out automatically" on the current view. */
  | { type: "clearLayout" }
  | { type: "updateWorkspace"; fields: { name?: string; description?: string } }
  | { type: "applyC4Colours" }
  | { type: "insertExample"; exampleText: string };

export interface EditContext {
  readonly view: ViewKey;
  /** The boxes the user sees in the view. */
  readonly boxes: ReadonlyMap<ElementId, Box>;
  readonly vertices: ReadonlyMap<string, readonly Point[]>;
  readonly fresh: ReadonlySet<ElementId>;
  readonly identifiers: "readable" | "collision-free";
  /** 4 characters of `[0-9a-z]`; seeded in tests. */
  readonly random: () => string;
}

/** Against the text before the edit. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly insert: string;
}

export interface IdChange {
  readonly kind: "element" | "relationship";
  readonly from: string;
  readonly to: string;
}

export type EditNotice =
  | "implied-relationship-appears"
  | "relationship-after-deployment"
  | "include-not-updated"
  | "identifier-may-collide";

export type EditRefusal =
  | "read-only"
  | "view-not-editable"
  | "field-not-editable"
  | "unrepresentable-value"
  | "name-taken"
  | "identifier-invalid"
  | "identifier-taken"
  | "referenced-by-opaque"
  | "view-in-use"
  | "not-allowed"
  | "relationship-exists"
  | "verification-failed";

export type EditOutcome =
  | {
      readonly ok: true;
      readonly text: string;
      readonly edits: readonly TextEdit[];
      readonly inverse: readonly TextEdit[];
      readonly document: ParseResult;
      readonly view: ViewKey;
      readonly fresh: ReadonlySet<ElementId>;
      readonly idChanges: readonly IdChange[];
      readonly created: {
        readonly elements: readonly ElementId[];
        readonly relationships: readonly string[];
      };
      readonly notices: readonly EditNotice[];
    }
  | { readonly ok: false; readonly reason: EditRefusal; readonly message: string };

/** What a smart delete removes from the model and what only from the view (SPEC 5.4). */
export interface SmartDeletePlan {
  readonly fromModel: { ids: ElementId[]; relationships: string[] };
  readonly fromView: { ids: ElementId[]; relationships: string[] };
}

/** What "Delete from model…" names in its confirmation. */
export interface DeleteImpact {
  readonly descendants: number;
  readonly views: readonly ViewKey[];
  readonly dynamicSteps: number;
  readonly instances: number;
}
