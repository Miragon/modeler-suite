# Design system

Every Miragon modeler follows the product design system of the `miragon-brand:modeler-tool-design`
skill (install: `/plugin marketplace add Miragon/corporate-identity`, then
`/plugin install miragon-brand@miragon`). Its guide says how the chrome looks and behaves; the shell
implements it, so a modeler mostly has to keep the values in one place and not fight the shell.

## Vendor the files

Copy three files of the skill's `assets/` **unchanged** into `packages/renderer/src/theme/`:

- `cd-tokens.generated.css`: the fixed `--cd-*` tokens, the `--cd-ui-*` roles per mode and the
  `--cd-shell-*` chrome sizes;
- `cd-tokens.generated.json`: the same as hex per mode (`hell`, `dunkel`, `hochkontrast`, `fest`,
  `shell`) for TypeScript (canvas colours, the theme-color, drift tests);
- `cd-canvas.css`: the mapping of diagram-js's variables onto the roles and the `cd-c-*` classes.

Give the two CSS files one header line,
`/* Vendored unchanged from Miragon/corporate-identity (design system 1.27.0, plugins/miragon-brand/skills/modeler-tool-design/assets). Do not edit; re-copy to update. */`,
keep the JSON byte-identical, mark all three `linguist-generated` in `.gitattributes` and
Prettier-ignore them. Never edit or reformat them, never fork a hex value: re-copy all three to
update. Design system 1.12.0 to 1.27.0 ship identical token files; `cd-canvas.css` is the same from
1.12.0 to 1.26.0 and changed in 1.27.0 (underlay switches and dark rules scoped to the nearest
`data-cd-theme` carrier), so a modeler is current on 1.27.0. The public copies of the two token files live at
<https://corporate-identity.netlify.app/brand/>; `cd-canvas.css` comes from the skill.

## Stylesheet rules

The renderer's stylesheet
([template](../assets/template/packages/renderer/src/assets/__NOTATION__.css)) starts with

```css
@import "../theme/cd-tokens.generated.css" layer(<notation>-tokens);
@import "diagram-js/assets/diagram-js.css";
@import "../theme/cd-canvas.css";
```

- **Tokens in a cascade layer.** A host page's own `--cd-*` tokens are unlayered and therefore win
  over this copy: Design IQ and a newer shell bring theirs, and an older vendored copy never
  overrides them. `cd-canvas.css` stays unlayered after `diagram-js.css`, so its mapping beats
  diagram-js's defaults.
- **Roles only.** Every rule reads `--cd-ui-*` roles and the mode-independent tokens (radius,
  shadow, motion), never a colour literal, never a fixed palette token. A drift test can grep for
  it (Event Storming's `theme.sync.test.ts`).
- **The canvas drawing stays light.** Shapes take literal light colours from the JSON's `hell` roles
  as SVG presentation attributes (template:
  [`styles.ts`](../assets/template/packages/renderer/src/draw/styles.ts)), never a `var()`, so an
  export looks the same everywhere. A notation's own colours (Wardley's note colours) are frozen
  as literals where the DSL stores them.
- **One root class.** Every rule sits below the renderer's root class (`.<notation>-container`) or
  its own classes, and nothing styles `html` or `body`: a host may prefix every rule with a
  descendant selector (see [Design IQ](design-iq.md)).

## Light until the joint dark-mode release

All modelers declare `themes: ['light']` in both apps until they flip to `['light', 'dark']` on the
same day. A light-only modeler stays light under a dark VS Code theme and a dark system setting
(the shell resolves it, and its kit checks that nothing turns half-dark); high contrast passes
through. A DSL directive such as `style dark` round-trips but renders nothing.

## Type, icons, language

- Geist and Geist Mono, bundled from `@fontsource-variable/*`; no font CDN (offline use, GDPR). SVG
  text names the family itself, since it does not inherit the container's font.
- Chrome icons come from the shell. Icons the renderer draws itself (palette tools, the dialog's
  close button) are Lucide geometry copied into a module with its ISC (and Feather MIT) legal
  comment, which the bundles keep (`comments.legal` in Vite 8, `legalComments` in esbuild). The VSIX
  and the web bundle carry the Lucide and Feather notices.
- The modeler's own icon (favicon, VS Code icon, file icons) comes from the `miragon-brand:icon-design`
  skill.
- The UI is English in every modeler (the design system's exception for modeler tools); numbers go
  through `Intl`.

## brand-lint

The `miragon-brand` plugin brings brand-lint, a Claude Code hook that checks every file Claude
writes or edits against the design system and reports each hard finding back to Claude, which
fixes it before going on. Use the plugin in 1.7.0 or later: older releases do not know the status
colours of the tokens. The hook runs only in a repository with a `.miragon/brand.json`; the
template ships [one](../assets/template/.miragon/brand.json) for an English modeler, as guide §2
asks:

- `"aus": ["A1", "A3", "A4", "A7", "A11"]` turns off the German copy rules (du, umlauts, German
  passive, the German claim, gender forms). C5 (one language per tool) stays on, and so do A2 (no
  em dash as a connector), the spellings, the anti-slop patterns and the colour rules.
- `ignorieren` skips the CHANGELOGs release-please writes, the generated third-party notices, the
  tests, the e2e suite with its snapshots and the fixtures. brand-lint skips the vendored
  `*.generated.*` tokens and `cd-canvas.css` by itself.

The hook takes the nearest `.miragon/brand.json` and never merges two, so a modeler inside a larger
repository (the suite) keeps the one at that repository's root and adds none of its own. An
intended notation colour that is no palette colour (a notation's own fills, strokes or note
colours) goes between `// brand-lint-disable` and `// brand-lint-enable`, or after
`// brand-lint-disable-next-line`, under a comment that says why. brand-lint reads no JSON and only
the colours of a TypeScript file, so the strings there (a diagnostic, a tooltip, the VS Code
manifest) stay a review point.

Run brand-lint by hand from the root. Its own walk of `.` skips every dot folder and dot file
(`.claude`, `.dependency-cruiser.cjs`), which the hook still checks, so give it the repository's
files:

```sh
node <miragon-brand plugin>/scripts/brand-lint.mjs $(git ls-files -co --exclude-standard)
```

The template's [`CLAUDE.md`](../assets/template/CLAUDE.md#design-system-mandatory) gives Claude in
the new repository the same notes.
