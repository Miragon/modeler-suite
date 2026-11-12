import { installOrcaEditorStub } from '@miragon/modeler-shell/testing/orca-stub';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from '../../apps/ide-editor/src/examples.js';

const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DIAGRAM,
  empty: EMPTY_DIAGRAM,
  blank: '',
};
const search = new URLSearchParams(location.search);
const text = search.get('text') ?? DOCUMENTS[search.get('doc') ?? 'example'] ?? EXAMPLE_DIAGRAM;

// The stub stands in for Orca's editor tab and frame, and must be in place before the editor runs.
installOrcaEditorStub({
  text,
  colorScheme: search.get('theme') === 'dark' ? 'dark' : 'light',
});
const { editor } = await import('../../apps/orca/src/main.js');

// For the tests only: the shipped bundle publishes nothing on window.
window.shell = editor.shell;
window.modeler = editor.modeler;
window.connection = editor.connection;
void editor.ready.then(() => {
  window.editorReady = true;
});
