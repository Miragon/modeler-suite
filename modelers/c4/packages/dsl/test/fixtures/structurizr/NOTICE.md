# Structurizr DSL test fixtures

The `.dsl` files in this folder are the test fixtures of the Structurizr DSL reference parser,
copied unchanged, at their relative paths, from
[structurizr/structurizr](https://github.com/structurizr/structurizr):

- folder: `structurizr-dsl/src/test/resources/dsl/`
- commit: `e3a736a90194d3ac692ad7b5c1c7a48287355347` (Structurizr 6.2.4)
- licence: Apache License 2.0, in [`LICENSE`](LICENSE)
- copyright: Structurizr (https://docs.structurizr.com)

They hold all 107 `.dsl` files of that folder, the nested ones that `!include` and `extends` name
included. The other files of the folder are inputs only the reference parser reads (Markdown
documentation and decision records, JSON workspaces, scripts, images, a plugin JAR and a
Structurizr cache folder) and are left out: the suite's Prettier and ESLint would rewrite or
lint the Markdown, JSON and JavaScript. Run the reference parser on a checkout of the commit above
when a fixture needs them.

`@miragon/c4-dsl` reads every file here byte for byte (`test/syntax/fixtures.test.ts`); keep them
unchanged. To update, copy the `.dsl` files of a newer commit and name it here.
