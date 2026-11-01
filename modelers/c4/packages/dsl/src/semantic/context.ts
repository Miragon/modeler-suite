import type { ElementKind } from "@miragon/c4-schema-model";
import type {
  DeploymentRecord,
  ElementRecord,
  GroupRecord,
  RelationshipRecord,
  StyleRecord,
  ViewRecord,
} from "./records.js";

/** The block a statement sits in, as the reference parser's context stack names it (R-DSL §3). */
export type ContextKind =
  | "root"
  | "workspace"
  | "model"
  | "element"
  | "deploymentEnvironment"
  | "deploymentNode"
  | "infrastructureNode"
  | "instance"
  | "relationship"
  | "bulkElements"
  | "bulkRelationships"
  | "archetypes"
  | "archetype"
  | "properties"
  | "perspectives"
  | "perspective"
  | "views"
  | "view"
  | "dynamicStep"
  | "imageScheme"
  | "animation"
  | "styles"
  | "elementStyle"
  | "relationshipStyle"
  | "terminology"
  | "configuration"
  | "users"
  | "docs"
  | "opaque"
  | "unknown"
  | "unresolved";

/** What a `properties` block writes to. */
export type PropertyTarget =
  | { readonly kind: "element"; readonly element: ElementRecord }
  | { readonly kind: "relationship"; readonly relationship: RelationshipRecord }
  | { readonly kind: "view"; readonly view: ViewRecord }
  | { readonly kind: "model" }
  | { readonly kind: "archetype"; readonly archetype: ArchetypeRecord }
  | { readonly kind: "ignored" };

export type ArchetypeBase =
  | "group"
  | "element"
  | "person"
  | "softwareSystem"
  | "container"
  | "component"
  | "deploymentNode"
  | "infrastructureNode"
  | "relationship";

export interface ArchetypeRecord {
  readonly name: string;
  readonly base: ArchetypeBase;
  metadata: string;
  description: string;
  technology: string;
  readonly tags: string[];
  readonly properties: Map<string, string>;
}

export interface Context {
  readonly kind: ContextKind;
  /** The element in scope: element blocks, re-opens, and `!elements` inside an element block. */
  readonly element?: ElementRecord | undefined;
  readonly deployment?: DeploymentRecord | undefined;
  /** An open `group` block: elements created in it join it. */
  readonly group?: GroupRecord | undefined;
  readonly relationship?: RelationshipRecord | undefined;
  readonly view?: ViewRecord | undefined;
  readonly archetype?: ArchetypeRecord | undefined;
  readonly properties?: PropertyTarget | undefined;
  readonly style?: StyleRecord | undefined;
  readonly scheme?: "light" | "dark" | undefined;
  /** Opened by `!element` or `!relationship`: what it sets is a re-open (SPEC 3.5). */
  readonly reopened?: boolean | undefined;
  /** Deployment contexts: the environment's register key, for hierarchical lookups. */
  readonly environmentKey?: string | undefined;
  readonly environmentName?: string | undefined;
  /** Statement identity prefix: the ids of the element or the key of the view the block belongs to. */
  readonly anchor: () => string;
}

export const ROOT: Context = { kind: "root", anchor: () => "" };

/** Element keywords and the one context kind that defines each (R-DSL §3). */
export const ELEMENT_KEYWORDS: Readonly<Record<string, ElementKind>> = {
  person: "person",
  softwaresystem: "softwareSystem",
  container: "container",
  component: "component",
  element: "custom",
};

export function child(context: Context, kind: ContextKind, extra: Partial<Context> = {}): Context {
  return { anchor: context.anchor, ...extra, kind };
}
