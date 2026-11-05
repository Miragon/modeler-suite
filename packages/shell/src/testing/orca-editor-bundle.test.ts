import { describe, expect, it } from "vitest";

import { ORCA_FRAME_POLICY } from "./orca-frame.js";
import { orcaEditorHtml } from "./orca-editor-bundle.js";

const ENTRY = `<!doctype html>
<html lang="en" class="cd-shell-document">
  <head>
    <link rel="stylesheet" href="dist/main.css" />
  </head>
  <body><div id="app"></div><script type="module" src="dist/main.js"></script></body>
</html>`;

describe("orcaEditorHtml", () => {
  it("puts the frame's policy and the stub ahead of the entry's own head, and Orca's mode on <html>", () => {
    const html = orcaEditorHtml(ENTRY, { text: "title A\n", colorScheme: "dark" });
    expect(html).toContain('<html lang="en" class="dark cd-shell-document">');
    const head = html.slice(html.indexOf("<head>"), html.indexOf("<link"));
    expect(head).toContain(`content="${ORCA_FRAME_POLICY}"`);
    expect(head).toContain(
      'data-options="{&quot;text&quot;:&quot;title A\\n&quot;,&quot;colorScheme&quot;:&quot;dark&quot;}"',
    );
  });

  it("adds the class to an <html> without one, light by default", () => {
    expect(orcaEditorHtml("<html><head></head></html>", { text: "" })).toContain(
      '<html class="light">',
    );
  });
});
