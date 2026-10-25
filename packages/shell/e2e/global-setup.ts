import { buildDemoWebview } from "./demo-webview.js";

// Once per run, before any worker starts: the csp case of every IDE harness opens this bundle.
export default buildDemoWebview;
