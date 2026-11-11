# Vendored design-system files

`brand-assets.mjs` of the `miragon-brand` plugin copies three files of the
`miragon-brand:modeler-tool-design` skill here **unchanged** and lists them in the repository's
`.miragon/brand-assets.yaml`. From the repository root:

```sh
node <miragon-brand plugin>/scripts/brand-assets.mjs --init
node <miragon-brand plugin>/scripts/brand-assets.mjs --add skills/modeler-tool-design/assets/cd-tokens.generated.css packages/renderer/src/theme/cd-tokens.generated.css
node <miragon-brand plugin>/scripts/brand-assets.mjs --add skills/modeler-tool-design/assets/cd-tokens.generated.json packages/renderer/src/theme/cd-tokens.generated.json
node <miragon-brand plugin>/scripts/brand-assets.mjs --add skills/modeler-tool-design/assets/cd-canvas.css packages/renderer/src/theme/cd-canvas.css
```

Each `--add` also rewrites the checksums in `.miragon/brand-assets.sha256`, which CI checks with
`sha256sum -c`. Run `brand-assets.mjs --check` before committing, and `brand-assets.mjs` without an
option to update. Never edit, reformat or add a header to the copies.

`../assets/__NOTATION__.css` imports the token CSS in a cascade layer and `cd-canvas.css` after
`diagram-js.css`; `../draw/styles.ts` reads the light roles from the JSON.
