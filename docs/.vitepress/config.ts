// The docs site, built with the Miragon docs kit (docs/.vitepress/miragon/, vendored from
// Miragon/corporate-identity, skill docs-site). The kit sets everything else: base from
// DOCS_BASE, theme, colours light and dark, GitHub anchors, Mermaid, search, the legal row.
import { posix } from "node:path";
import type MarkdownIt from "markdown-it";
import { miragonDocs } from "./miragon/config";

const repositoryBlobUrl = "https://github.com/Miragon/modeler-suite/blob/main/";

function linkRepositoryFilesOutsideDocsToGitHub(markdown: MarkdownIt) {
  markdown.core.ruler.push("repository-links", (state) => {
    const pageDirectory = posix.dirname(`docs/${state.env.relativePath}`);
    for (const inlineToken of state.tokens) {
      for (const token of inlineToken.children ?? []) {
        const href = token.type === "link_open" ? token.attrGet("href") : null;
        if (!href || /^[a-z]+:|^#|^\//.test(href)) continue;
        const repositoryPath = posix.normalize(posix.join(pageDirectory, href));
        if (!repositoryPath.startsWith("docs/"))
          token.attrSet("href", repositoryBlobUrl + repositoryPath);
      }
    }
  });
}

const modelers = [
  { text: "Wardley Maps", link: "/modelers/wardley-maps" },
  { text: "Event Storming", link: "/modelers/event-storming" },
  { text: "Team Topologies", link: "/modelers/team-topologies" },
  { text: "Context Maps", link: "/modelers/context-maps" },
  { text: "Value Chain", link: "/modelers/value-chain" },
];

export default miragonDocs({
  repo: "Miragon/modeler-suite",
  title: "Miragon Modeler Suite",
  description:
    "Five diagram-js modelers for strategy and architecture notations, as web apps, VS Code extensions and npm libraries.",
  footerMessage: "Released under the MIT License.",
  srcExclude: ["assets/**"],
  markdown: { config: linkRepositoryFilesOutsideDocsToGitHub },
  // Mermaid 12 wraps flowchart labels at 120px, and the page's paragraph line height cuts off the
  // last line of a wrapped label. 200px keeps them on the lines they had under Mermaid 11. It can
  // go once the kit's theme keeps Mermaid's line height for the label paragraphs.
  mermaid: { flowchart: { wrappingWidth: 200 } },
  nav: [
    { text: "Getting started", link: "/getting-started" },
    { text: "Modelers", items: modelers },
    { text: "Platform", link: "/platform/api" },
  ],
  sidebar: [
    { text: "Start", items: [{ text: "Getting started", link: "/getting-started" }] },
    { text: "Modelers", items: modelers },
    {
      text: "Platform",
      items: [
        { text: "Modeler API", link: "/platform/api" },
        { text: "Modeler shell", link: "/platform/shell" },
        { text: "Shell implementation notes", link: "/shell/implementation-notes" },
      ],
    },
    { text: "Project", items: [{ text: "CI and releases", link: "/ci-and-releases" }] },
  ],
});
