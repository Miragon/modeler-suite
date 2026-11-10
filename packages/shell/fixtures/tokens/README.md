# Token fixture

`cd-tokens.generated.css` and `cd-tokens.generated.json` of the Miragon design system
(`Miragon/corporate-identity`, `plugins/miragon-brand/skills/modeler-tool-design/assets`, also
published at <https://corporate-identity.netlify.app/brand/>), vendored byte-identical for the
tests and the demo. Never edit them by hand: re-copy both with `brand-assets.mjs` of the
`miragon-brand` plugin, which reads `.miragon/brand-assets.yaml` at the repository root.

The shell package itself ships no tokens; a modeler vendors its own copy.
