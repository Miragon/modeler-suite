import {
  installVsCodeWebviewStub,
  type VsCodeWebviewStub,
  type VsCodeWebviewStubOptions,
} from "./vscode-stub.js";

/** The attribute of the stub's `<script>` that carries its options as JSON. */
export const STUB_OPTIONS_ATTRIBUTE = "data-options";

/**
 * Installs the VS Code stub with the options its own `<script>` element carries in `data-options`:
 * the classic script `openWebviewBundle` serves as the first script of the page's `<body>`.
 */
export function installVsCodeWebviewStubFromScript(script: Element | null): VsCodeWebviewStub {
  const options = script?.getAttribute(STUB_OPTIONS_ATTRIBUTE);
  if (!options) {
    throw new Error(
      `@miragon/modeler-shell: the VS Code stub's <script> carries no ${STUB_OPTIONS_ATTRIBUTE}`,
    );
  }
  return installVsCodeWebviewStub(JSON.parse(options) as VsCodeWebviewStubOptions);
}
