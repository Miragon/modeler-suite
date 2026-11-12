import '@miragon/__NOTATION__-ide-editor/zod-jitless';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@miragon/modeler-shell/shell.css';
import { mergeDiagramText } from '@miragon/__NOTATION__-renderer';
import { mountIdeEditor } from '@miragon/modeler-shell/ide';
import { orcaEditorHost } from '@miragon/modeler-shell/orca/webview';
import { diagramEditor } from '@miragon/__NOTATION__-ide-editor';

export const editor = mountIdeEditor(orcaEditorHost({ merge: mergeDiagramText }), diagramEditor);
