# Vendored design-system files

Copy these three files here **unchanged** from the `miragon-brand:modeler-tool-design` skill
(`plugins/miragon-brand/skills/modeler-tool-design/assets/` of Miragon/corporate-identity, design
system 1.27.0; the token files are the same from 1.12.0 on) and re-copy them to update; never edit or
reformat them:

- `cd-tokens.generated.css`, with this header as its new first line:
  `/* Vendored unchanged from Miragon/corporate-identity (design system 1.27.0, plugins/miragon-brand/skills/modeler-tool-design/assets). Do not edit; re-copy to update. */`
- `cd-tokens.generated.json`, byte-identical (JSON has no comments)
- `cd-canvas.css`, with the same header line

`../assets/__NOTATION__.css` imports the token CSS in a cascade layer and `cd-canvas.css` after
`diagram-js.css`; `../draw/styles.ts` reads the light roles from the JSON.
