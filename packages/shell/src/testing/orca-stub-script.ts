import {
  installOrcaEditorStub,
  type OrcaEditorStub,
  type OrcaEditorStubOptions,
} from "./orca-stub.js";
import { STUB_OPTIONS_ATTRIBUTE } from "./vscode-stub-script.js";

/**
 * Installs the Orca stub with the options its own `<script>` element carries in `data-options`:
 * the classic script `openOrcaEditorBundle` serves as the first script of the editor's `<head>`.
 */
export function installOrcaEditorStubFromScript(script: Element | null): OrcaEditorStub {
  const options = script?.getAttribute(STUB_OPTIONS_ATTRIBUTE);
  if (!options) {
    throw new Error(
      `@miragon/modeler-shell: the Orca stub's <script> carries no ${STUB_OPTIONS_ATTRIBUTE}`,
    );
  }
  return installOrcaEditorStub(JSON.parse(options) as OrcaEditorStubOptions);
}
