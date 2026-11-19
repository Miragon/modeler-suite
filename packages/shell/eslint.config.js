import { grandfatheredCeilings, sharedPackageEslintConfig } from "../../tooling/eslint.mjs";

export default sharedPackageEslintConfig(
  import.meta.dirname,
  grandfatheredCeilings("src/dom/feedback/problems-popover.ts", { functionLines: 215 }),
  grandfatheredCeilings("src/dom/feedback/toasts.ts", { functionLines: 308 }),
  grandfatheredCeilings("src/dom/menu.ts", { functionLines: 344 }),
  grandfatheredCeilings("src/dom/mount.ts", { complexity: 79, functionLines: 631 }),
  grandfatheredCeilings("src/dom/tooltip.ts", { functionLines: 205 }),
  grandfatheredCeilings("src/testing/cases.ts", { functionLines: 155, fileLines: 1290 }),
  grandfatheredCeilings("src/testing/checks.ts", { complexity: 55, fileLines: 1025 }),
  grandfatheredCeilings("src/testing/dialog-facts.ts", { complexity: 53, functionLines: 257 }),
  grandfatheredCeilings("src/testing/orca-stub.ts", { functionLines: 163 }),
  grandfatheredCeilings("src/testing/page-tools.ts", { functionLines: 161 }),
  grandfatheredCeilings("src/testing/vscode-electron/driver.ts", {
    functionLines: 287,
    fileLines: 1235,
  }),
  grandfatheredCeilings("src/testing/vscode-electron/keys.ts", { functionLines: 162 }),
  grandfatheredCeilings("src/testing/vscode-electron/reload.ts", { functionLines: 160 }),
  grandfatheredCeilings("src/testing/vscode-host-stub.ts", { functionLines: 237 }),
  grandfatheredCeilings("src/testing/web-checks.ts", { fileLines: 1078 }),
  grandfatheredCeilings("src/vscode/extension/modeler-editor.ts", { functionLines: 160 }),
);
