import type { ViewDefinition, Workspace } from "../../src/types.js";
import {
  component,
  container,
  custom,
  person,
  relationship,
  system,
  workspace,
  type WorkspaceSpec,
} from "./model.js";

/**
 * A small bank in flat ids written with dots (as hierarchical mode would key them):
 *
 * - customer, staff (people); printer, orphan (custom; printer prints for staff)
 * - banking with containers web, api (components signin, accounts) and db
 * - mainframe with container core; email; loner (unconnected)
 */
export const BANK_ELEMENTS = [
  person("customer", { name: "Customer" }),
  person("staff", { name: "Bank Staff", group: "Bank" }),
  system("banking", { name: "Internet Banking", group: "Bank" }),
  container("banking.web", "banking", { name: "Web App", technology: "Java" }),
  container("banking.api", "banking", { name: "API", technology: "Java", tags: ["Api"] }),
  component("banking.api.signin", "banking.api", { name: "Sign In", technology: "Spring" }),
  component("banking.api.accounts", "banking.api", {
    name: "Accounts",
    properties: { team: "blue" },
  }),
  container("banking.db", "banking", {
    name: "Database",
    technology: "Oracle",
    tags: ["Database"],
  }),
  system("mainframe", { name: "Mainframe", tags: ["Existing System"], group: "Bank" }),
  container("mainframe.core", "mainframe", { name: "Core" }),
  system("email", { name: "E-mail", tags: ["Existing System"] }),
  system("loner", { name: "Loner" }),
  custom("printer", { name: "Printer", metadata: "Hardware" }),
  custom("orphan", { name: "Orphan" }),
];

export const BANK_RELATIONSHIPS = [
  relationship("customer", "banking.web", { identifier: "uses", description: "Uses" }),
  relationship("banking.web", "banking.api.signin", { description: "Calls" }),
  relationship("banking.api.accounts", "mainframe", { description: "Reads", tags: ["Sync"] }),
  relationship("banking.api.signin", "banking.db", { description: "Reads from" }),
  relationship("email", "customer", { description: "Sends e-mails to", tags: ["Async"] }),
  relationship("banking.api.accounts", "email", { description: "Sends via", tags: ["Async"] }),
  relationship("staff", "mainframe.core", { description: "Operates" }),
  relationship("printer", "staff", { description: "Prints for" }),
];

export function bank(views: readonly ViewDefinition[] = [], spec: WorkspaceSpec = {}): Workspace {
  return workspace({
    elements: BANK_ELEMENTS,
    relationships: BANK_RELATIONSHIPS,
    groups: [
      {
        name: "Bank",
        identifier: "bankGroup",
        path: "Bank",
        members: ["staff", "banking", "mainframe"],
      },
    ],
    views,
    ...spec,
  });
}
