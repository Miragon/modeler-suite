import { config } from 'zod';

// The webview CSP forbids eval. zod 4 probes for it with `new Function` when it builds its first
// object schema, and the browser reports that caught probe as a CSP violation. Imported first by
// the editor entries, so it runs before any schema module.
config({ jitless: true });
