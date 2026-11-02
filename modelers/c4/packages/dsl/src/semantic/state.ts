import type {
  DiagnosticCode,
  ElementId,
  FieldName,
  IdentifierMode,
  ImpliedStrategy,
  MetadataSymbols,
  Relationship,
} from "@miragon/c4-schema-model";
import type { RawBlock, Statement, TextRange, Token } from "../types.js";
import type { ArchetypeBase, ArchetypeRecord, Context } from "./context.js";
import type {
  DeploymentRecord,
  ElementRecord,
  GroupRecord,
  OpaqueSite,
  ReferenceSite,
  RelationshipRecord,
  StyleRecord,
  Target,
  ViewRecord,
} from "./records.js";
import { Reporter } from "./report.js";
import { Constants } from "./values.js";

function namesRelationship(target: Target): boolean {
  return (
    target.type === "relationship" ||
    (target.type === "deployment" && target.kind === "deploymentRelationship")
  );
}

/** What the builder read a statement as: the edit layer finds its places by it. */
export type StatementRole =
  | "workspace"
  | "workspaceName"
  | "workspaceDescription"
  | "model"
  | "views"
  | "styles"
  | "element"
  | "elementReopen"
  | "relationship"
  | "relationshipReopen"
  | "group"
  | "groupProperty"
  | "description"
  | "technology"
  | "tags"
  | "url"
  | "metadata"
  | "properties"
  | "property"
  | "perspectives"
  | "archetypes"
  | "archetype"
  | "deploymentEnvironment"
  | "deploymentNode"
  | "deploymentGroup"
  | "instance"
  | "noRelationship"
  | "bulk"
  | "view"
  | "include"
  | "exclude"
  | "autoLayout"
  | "title"
  | "default"
  | "animation"
  | "animationStep"
  | "dynamicStep"
  | "parallel"
  | "imageContent"
  | "elementStyle"
  | "relationshipStyle"
  | "styleProperty"
  | "colourScheme"
  | "theme"
  | "terminology"
  | "configuration"
  | "constant"
  | "identifiers"
  | "impliedRelationships"
  | "includeFile"
  | "script"
  | "plugin"
  | "components"
  | "docs"
  | "opaque"
  | "unknown";

/** A statement's tokens after `${NAME}` substitution, keyword first (SPEC 3.1). */
export interface Values {
  readonly statement: Statement;
  readonly tokens: readonly string[];
  readonly assignee: string | undefined;
  /** `tokens[0]`, or "" for a statement that is only `{`. */
  readonly keyword: string;
  readonly lower: string;
  /** Per token: its raw text holds `${…}`, so a field it sets is read-only (SPEC 3.5). */
  readonly substituted: readonly boolean[];
}

export interface WorkspaceInfo {
  statement: Statement | undefined;
  extendsSource: string | undefined;
  name: string;
  description: string;
  nameToken: number | undefined;
  descriptionToken: number | undefined;
  readonly nameStatements: Statement[];
  readonly descriptionStatements: Statement[];
}

/** A view term's operand nothing above the term defines; `checks.ts` tells a forward reference. */
export interface PendingTerm {
  readonly values: Values;
  readonly context: Context;
  readonly token: number;
  readonly written: string;
}

/** A `-/>` statement: Structurizr removes replicated relationships between the ends' instances. */
export interface NoRelationshipSite {
  readonly values: Values;
  readonly context: Context;
  readonly source: Target | undefined;
  readonly destination: Target | undefined;
  readonly description: string | undefined;
}

export interface DynamicStepSite {
  readonly view: ViewRecord;
  readonly statement: Statement;
  readonly elements: readonly ElementRecord[];
  readonly relationship: RelationshipRecord | undefined;
  /** The `<source> -> <destination>` form's description and technology, as written. */
  readonly description?: string | undefined;
  readonly technology?: string | undefined;
  /** The relationship the `<source> -> <destination>` form shows, once the model is finished. */
  resolved?: Relationship | undefined;
}

/** The mutable state of one build: records, register, diagnostics and the statement index. */
export class Build {
  readonly report: Reporter;
  readonly constants = new Constants();
  readonly statements: Statement[] = [];
  readonly statementIndex = new Map<Statement, number>();
  readonly parents = new Map<Statement, Statement | undefined>();
  readonly roles = new Map<Statement, StatementRole>();
  readonly contexts = new Map<Statement, Context>();
  mode: IdentifierMode = "flat";
  readonly modeChanges: { readonly offset: number; readonly mode: IdentifierMode }[] = [];
  strategy: ImpliedStrategy = "unless-any";
  readonly register = new Map<string, Target>();
  readonly archetypes = new Map<ArchetypeBase, Map<string, ArchetypeRecord>>();
  readonly elements: ElementRecord[] = [];
  /** Kind, parent and name of every element so far: names are unique per kind and parent. */
  readonly names = new Set<string>();
  readonly relationships: RelationshipRecord[] = [];
  readonly groups: GroupRecord[] = [];
  readonly deployments: DeploymentRecord[] = [];
  readonly views: ViewRecord[] = [];
  readonly viewKeys = new Set<string>();
  readonly styles: StyleRecord[] = [];
  readonly themes: string[] = [];
  readonly terminology: Partial<Record<string, string>> & { metadataSymbols?: MetadataSymbols } =
    {};
  readonly workspace: WorkspaceInfo = {
    statement: undefined,
    extendsSource: undefined,
    name: "",
    description: "",
    nameToken: undefined,
    descriptionToken: undefined,
    nameStatements: [],
    descriptionStatements: [],
  };
  workspaceCount = 0;
  /** Top-level statements other than `workspace` and the directives (SPEC 3.8 rule 2). */
  readonly outside: Values[] = [];
  modelStatement: Statement | undefined;
  viewsStatement: Statement | undefined;
  stylesStatement: Statement | undefined;
  readonly modelProperties = new Map<string, string>();
  openWorld = false;
  readonly opaque: OpaqueSite[] = [];
  readonly references: ReferenceSite[] = [];
  readonly dynamicSteps: DynamicStepSite[] = [];
  readonly noRelationships: NoRelationshipSite[] = [];
  /** Animation steps the builder couldn't follow (an expression it doesn't evaluate there). */
  readonly uncheckedSteps: { readonly view: ViewRecord; readonly statement: Statement }[] = [];
  readonly pendingTerms: PendingTerm[] = [];
  readonly instances = new Map<ElementRecord, string[]>();
  readonly bulkElementFields = new Set<FieldName>();
  readonly bulkRelationshipFields = new Set<"description" | "technology" | "tags" | "url">();
  readonly deploymentEnvironments: Statement[] = [];
  private anonymous = 0;
  private notEditableViewReported = false;

  constructor(readonly text: string) {
    this.report = new Reporter(text);
    for (const base of [
      "group",
      "element",
      "person",
      "softwareSystem",
      "container",
      "component",
      "deploymentNode",
      "infrastructureNode",
      "relationship",
    ] as const) {
      this.archetypes.set(base, new Map());
    }
  }

  record(statement: Statement, parent: Statement | undefined, context: Context): void {
    this.statementIndex.set(statement, this.statements.length);
    this.statements.push(statement);
    this.parents.set(statement, parent);
    this.contexts.set(statement, context);
  }

  role(statement: Statement, role: StatementRole): void {
    this.roles.set(statement, role);
  }

  indexOf(statement: Statement): number {
    return this.statementIndex.get(statement) ?? -1;
  }

  values(statement: Statement, context: Context): Values {
    const read = (token: Token) => {
      const { value, unknown } = this.constants.tokenValue(token);
      for (const name of unknown) {
        this.report.note(
          "unknown-constant",
          "warning",
          `No !const or !var before this line defines ${name}, so it stays as written. Define the constant above, or remove the reference.`,
          token.range,
          () => `${context.anchor()}${this.report.statementText(statement.head)}`,
        );
      }
      return value;
    };
    const tokens = statement.tokens.map(read);
    const keyword = tokens[0] ?? "";
    return {
      statement,
      tokens,
      assignee: statement.assignee === undefined ? undefined : read(statement.assignee),
      keyword,
      lower: keyword.toLowerCase(),
      substituted: statement.tokens.map((token) => token.substitutes),
    };
  }

  /** The identity of a statement for a diagnostic: its block's prefix and its first line. */
  anchor(statement: Statement, context: Context): () => string {
    return () => `${context.anchor()}${this.report.statementText(statement.head)}`;
  }

  tokenRange(statement: Statement, token: number | undefined): TextRange {
    if (token === undefined) return statement.head;
    return statement.tokens[token]?.range ?? statement.head;
  }

  incompatible(
    values: Values,
    context: Context,
    message: string,
    code: DiagnosticCode = "invalid-statement",
    token?: number,
  ): void {
    this.report.incompatible(
      code,
      message,
      this.tokenRange(values.statement, token),
      this.anchor(values.statement, context),
    );
  }

  /** Unresolved references are compatibility errors in a closed world, warnings in an open one (SPEC 3.8). */
  unresolved(values: Values, context: Context, token: number | undefined, message: string): void {
    const range = this.tokenRange(values.statement, token);
    const anchor = this.anchor(values.statement, context);
    if (this.openWorld) {
      this.report.note("unresolved-reference", "warning", message, range, anchor);
    } else {
      this.report.incompatible("unresolved-reference", message, range, anchor);
    }
  }

  reject(values: Values, context: Context, code: DiagnosticCode, message: string, token?: number) {
    this.report.reject(
      code,
      message,
      this.tokenRange(values.statement, token),
      this.anchor(values.statement, context),
    );
  }

  /** Registers an identifier; false, with the reject of SPEC 3.8 rule 3, when it is taken. */
  registerKey(key: string, target: Target, values: Values, context: Context): boolean {
    const lower = key.toLowerCase();
    if (this.register.has(lower)) {
      this.report.reject(
        "duplicate-identifier",
        `The identifier “${key}” is already in use (identifiers ignore case). Give this one another identifier.`,
        values.statement.assignee?.range ?? values.statement.head,
        this.anchor(values.statement, context),
      );
      return false;
    }
    this.register.set(lower, target);
    return true;
  }

  /** Stands in for Structurizr's UUID of an anonymous item: no text can name it. */
  anonymousKey(): string {
    this.anonymous += 1;
    return `\u0000${this.anonymous}`;
  }

  /**
   * `DslContext.getElement`: in hierarchical mode, first under the keys of the element in scope
   * and its ancestors (or the environment), then the identifier as a top-level key.
   */
  lookup(
    identifier: string,
    context: Context,
    accept: (target: Target) => boolean = () => true,
  ): { readonly target: Target; readonly relativeTo: ElementRecord | undefined } | undefined {
    const lower = identifier.toLowerCase();
    const at = (key: string) => {
      const found = this.register.get(key);
      return found && !namesRelationship(found) && accept(found) ? found : undefined;
    };
    if (this.mode === "hierarchical") {
      for (let scope: ElementRecord | undefined = context.element; scope; scope = scope.parent) {
        const found = at(`${scope.registerKey}.${lower}`);
        if (found) return { target: found, relativeTo: scope };
      }
      for (
        let scope: DeploymentRecord | undefined = context.deployment;
        scope;
        scope = scope.parent
      ) {
        const found = at(`${scope.registerKey}.${lower}`);
        if (found) return { target: found, relativeTo: undefined };
      }
      const inEnvironment =
        context.deployment === undefined && context.environmentKey !== undefined
          ? at(`${context.environmentKey}.${lower}`)
          : undefined;
      if (inEnvironment) return { target: inEnvironment, relativeTo: undefined };
    }
    const found = at(lower);
    return found ? { target: found, relativeTo: undefined } : undefined;
  }

  /** A relationship written in a deployment context: identified, but not in the static model. */
  deploymentRelationshipNamed(identifier: string): boolean {
    const found = this.register.get(identifier.toLowerCase());
    return found?.type === "deployment" && found.kind === "deploymentRelationship";
  }

  relationshipNamed(identifier: string): RelationshipRecord | undefined {
    const found = this.register.get(identifier.toLowerCase());
    return found?.type === "relationship" ? found : undefined;
  }

  addOpaque(node: Statement | RawBlock): void {
    this.opaque.push({ node, text: this.text.slice(node.range.start, node.range.end) });
  }

  /** One info for the whole workspace: the canvas opens only the four static view types. */
  reportNotEditableView(values: Values, context: Context): void {
    if (this.notEditableViewReported) return;
    this.notEditableViewReported = true;
    this.report.note(
      "view-type-not-editable",
      "info",
      "Dynamic, deployment, filtered, custom and image views stay as written and are listed under Views, but only landscape, context, container and component views open on the canvas. Edit the others in the text.",
      values.statement.head,
      this.anchor(values.statement, context),
    );
  }

  elementId(record: ElementRecord | undefined): () => ElementId | undefined {
    return () => record?.id;
  }
}
