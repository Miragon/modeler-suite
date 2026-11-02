import { join } from "node:path";
import { goldenSuite } from "./support/golden.js";

const TEST = join(import.meta.dirname, "..");

goldenSuite({
  title: "the vendored Structurizr fixtures",
  folder: join(TEST, "fixtures", "structurizr"),
  snapshot: join(TEST, "fixtures", "snapshots", "structurizr-fixtures.json"),
  files: 107,
  minimumCompared: 50,
  encoding: (file) => (file === "iso-8859.dsl" ? "latin1" : "utf8"),
  environment: new Set([
    "decisions/workspace.dsl",
    "docs/workspace.dsl",
    "extend/extend-workspace-from-dsl-url.dsl",
    "extend/extend-workspace-from-json-url.dsl",
    "image-view.dsl",
    "image-views/workspace-via-url.dsl",
    "include-url.dsl",
    "script-external-with-parameters.dsl",
    "script-external.dsl",
    "script-in-dynamic-view.dsl",
    "script-inline.dsl",
    "spring-petclinic/workspace.dsl",
  ]),
  refused: {
    "big-bank-plc/model/internet-banking-system/details.dsl": {
      code: "workspace-count",
      rejects: true,
    },
    "big-bank-plc/model/internet-banking-system/summary.dsl": {
      code: "workspace-count",
      rejects: true,
    },
    "big-bank-plc/model/people-and-software-systems.dsl": {
      code: "workspace-count",
      rejects: true,
    },
    "big-bank-plc/views/styles-people.dsl": { code: "workspace-count", rejects: true },
    "include/model.dsl": { code: "workspace-count", rejects: true },
    "include/model/software-system/model.dsl": { code: "workspace-count", rejects: true },
    "workspace-with-bom-model.dsl": { code: "workspace-count", rejects: true },
    "multiple-workspace-tokens.dsl": { code: "workspace-count", rejects: true },
    "multiple-model-tokens.dsl": { code: "duplicate-block", rejects: true },
    "multiple-view-tokens.dsl": { code: "duplicate-block", rejects: true },
    "unexpected-tokens-after-workspace.dsl": { code: "statement-outside-workspace", rejects: true },
    "unexpected-tokens-before-workspace.dsl": {
      code: "statement-outside-workspace",
      rejects: true,
    },
    "unexpected-tokens-in-workspace.dsl": { code: "element-not-permitted", rejects: true },
    "multi-line-with-error.dsl": { code: "element-not-permitted", rejects: true },
    "enterprise.dsl": { code: "element-not-permitted", rejects: true },
    "constant.dsl": { code: "invalid-statement", rejects: false },
    "group-url.dsl": { code: "invalid-statement", rejects: false },
    "group-without-brace.dsl": { code: "invalid-statement", rejects: false },
    "relationship-already-exists.dsl": { code: "relationship-exists", rejects: false },
  },
});
