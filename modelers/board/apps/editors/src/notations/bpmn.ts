import type { EditorModule } from "@miragon/board-host";
import "@miragon/bpmn-modeler/styles.css";
import { createCollaborativeModeler } from "../bpmn/collaborative-bpmn.js";
import { bpmnTextRules } from "../bpmn/text-rules.js";

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = bpmnTextRules;
