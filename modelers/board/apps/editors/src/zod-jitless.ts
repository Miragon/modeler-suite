import { config } from "zod";

// A webview's CSP forbids eval. Zod probes for it with `new Function` when it builds its first
// object schema, and the browser reports that probe as a CSP violation even though zod catches the
// error. An app under such a CSP imports this first, so it runs before any schema module.
config({ jitless: true });
