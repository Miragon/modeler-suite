# Token fixture

`cd-tokens.generated.css` and `cd-tokens.generated.json` of the Miragon design system
(`Miragon/corporate-identity`, `plugins/miragon-brand/skills/modeler-tool-design/assets`, also
published at <https://corporate-identity.netlify.app/brand/>), copied unchanged for the tests and
the demo. Both are listed in the repository's `.miragon/brand-assets.yaml`: `brand-assets.mjs` from
the `miragon-brand` plugin re-copies them, and CI checks them with
`sha256sum -c .miragon/brand-assets.sha256`. Never edit them by hand and give them no header.

The shell package itself ships no tokens; a modeler vendors its own copy.
