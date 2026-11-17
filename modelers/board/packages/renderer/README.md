# @miragon/board-renderer

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/board/LICENSE)

View and edit a board in the browser. A board is a canvas of a repository's own files: models
shown and edited in place, each by an editor the host hands in and each saved in its own file,
next to notes, images, groups and arrows. The board stores where a file sits, never what is in
it. The canvas is [React Flow](https://github.com/xyflow/xyflow) on React; the board itself is a
live document on [Yjs](https://github.com/yjs/yjs), element by element. It implements the
collaborative-modeler contract of [`@miragon/modeler-api`](../../../../packages/api)
(`createCollaborativeModeler`). Browser and DOM only. **A preview, in progress**: the board ships
no viewer, no themes and no image export yet.

The file format and its reader are [`@miragon/board-schema-model`](../schema-model), a dependency
of this package.

## Install

A release of the suite publishes this package to npm under this name. Its first publish is still
to come; until then it is used from this repository.

```bash
npm install @miragon/board-renderer react react-dom yjs @xyflow/react@~12.12.1
```

React, React DOM, Yjs and React Flow are peers, so that the host and the board share one copy of
each: the store tells its elements by `instanceof Y.Map`, a second React has hooks of its own, and
a second React Flow a store the board's parts cannot read. The ranges are `react` and `react-dom`
`^19.0.0`, `yjs` `^13.6.0` and `@xyflow/react` `~12.12.1`: the canvas reads fields of React Flow's
internal store as 12.12.1 has them, so a newer minor is a change the board has not been measured
on. `@miragon/modeler-api`, `@miragon/board-schema-model`, `lucide-react`, `markdown-it` and
`dompurify` come as dependencies. The package is an ES module with types. Its parts that load
later (the node types, the arrows, the toolbar, the gestures, the presence layer) are chunks of
their own, and markdown-it and DOMPurify are imported with the first note: a host's bundler keeps
all of them lazy.

## The sheet

```ts
import "@miragon/board-renderer/assets/board.css";
```

One sheet and nothing else: it carries React Flow's own sheet, so a host does not import
`@xyflow/react/dist/style.css` again, the board's rules on the roles of the Miragon design system,
the design system's tokens in the cascade layer `board-tokens` (a page's own `--cd-*` tokens,
unlayered, win), and a base for the board's own elements in the layer `board-base`. The script
imports no sheet: a host imports this one once. The board draws light; dark is not designed. No
fonts ship and nothing loads from a CDN: provide Geist, e.g.
`import "@fontsource-variable/geist/wght.css"`; the font stack starts with
`"Geist Variable", Geist, …`.

## A host

```ts
import * as Y from "yjs";
import { createCollaborativeModeler, type BoardHost } from "@miragon/board-renderer";
import "@miragon/board-renderer/assets/board.css";

// The live document the people on this board share, e.g. through a sync provider.
const doc = new Y.Doc();

// Every part of a host is optional: without one the board is a board of notes, groups and arrows.
const host: BoardHost = {
  models: {
    list: () => ["models/tea.wmap"], // what the model picker offers
    onChange: () => () => {},
    describe: (path) => ({ title: path, kind: "Wardley Map" }),
    open({ element, path }) {
      const editor = mountEditor(element, path); // your editor of the file, into the board's element
      return {
        ready: editor.ready, // settles once the model is drawn and fitted
        release: () => editor.blur(), // before an armed model becomes a preview again
        focus: () => editor.focus(), // after the board armed it: take the keys
        destroy: () => editor.destroy(), // the editor first, then what it was bound to
      };
    },
  },
};

const modeler = createCollaborativeModeler({ host, liveDocument: doc });
modeler.attachTo(container); // an element in the document, with a size
await modeler.board.mounted; // the canvas exists
const stop = modeler.onContentChanged(() => save(modeler.exportText()));

// when the board goes
stop();
modeler.destroy();
await modeler.board.unmounted; // every editor has had its destroy()
hub.destroy(); // now end what the editors were bound to, here the host's live sessions
```

- **`createCollaborativeModeler(options)`** takes the contract's options (`fitOnImport`,
  `freeArea` in its `insets` form, `undoRedoKeys`) and two of the board's own: `host`, what the
  board asks of the place it runs in, and `liveDocument`, a `Y.Doc` the host shares with other
  people. With `liveDocument` the board works on that document in place of one of its own and
  never destroys it; `importText` reconciles into it under an origin of its own, so a sync
  provider sends it on as this client's change. Without it the board keeps a document of its own,
  filled by `importText`. One document takes one board per page. Whoever hands the package a
  `Y.Doc` loads the same copy of `yjs`.
- **`BoardHost`** has four parts, each optional and independent: `models` (the picker's list, a
  title per file, and `open(context)`, which returns an editor, a promise of one, or `undefined`
  for a file the host cannot show), `images` (`read`, `onChange`, and `store` and `taken` for a
  picture that is pasted, dropped or picked), `references` (what the models say about each
  other, drawn as arrows that are never stored) and `presence` (cursors and selections of the
  people who have this board open). The JSDoc of `BoardHost` and its parts is the specification.
- **An editor in a node** is mounted into the element the board made for it, `.board-engine`.
  As a preview it sits in the node, `inert`, scaled with the board: it reads layout px
  (`clientWidth`), never client rects. Armed, it moves into a layer above the board at zoom 1,
  where the board sizes it; `focus()` is the one call after the move. A host hides its editor's
  own chrome in a preview with rules of its own on `.board-engine[data-armed="false"]`.
- **The change event.** `onContentChanged` reports the board's gestures, its undo and redo and
  its amends, and nothing else: a peer's update, an import or a host's write calls no listener.
- **The end of the board.** `destroy()` stops every delivery at once and returns before the
  editors are destroyed, since the canvas unmounts a microtask later, so a host may call it from
  a listener. `modeler.board.unmounted` resolves once the canvas is gone and every editor of a
  model node has had its `destroy()` (an armed one its `release()` before), an editor whose
  `open()` answered after the board went included. After it the board calls no editor, and a
  host ends what its editors were bound to: a live session, a files port, the document. It
  settles once, also after a second `destroy()` and for a board that never mounted, and never
  rejects; it stays pending for as long as a promise that `open()` returned does.

## API

| Export                                                                                                                                                           | What it is                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCollaborativeModeler(options)`                                                                                                                            | The contract's modeler (`attachTo`, `importText`, `exportText`, `onContentChanged`, `getViewState`, `setViewState`, `destroy`, `elements`), plus `contentBounds()` and `board`: `store`, `undo()`, `redo()`, `mounted` and `unmounted`. `meta.notation` is `NOTATION` (`"board"`). |
| `BoardModelerOptions`, `CollaborativeBoard`, `BoardHandle`, `BoardElementsSurface`                                                                               | The types of the factory, its modeler and the board's handle.                                                                                                                                                                                                                      |
| `BoardHost`, `BoardModels`, `BoardImages`, `BoardReferences`, `BoardPresence` and their types                                                                    | What a host hands in (`EmbeddedEditor`, `EmbeddedEditorContext`, `ModelDescription`, `BoardReference`, `BoardPeer`, `BoardPresenceUser`, `BoardCanvasPresence`).                                                                                                                   |
| `createBoardStore(doc)`, `createBoardDoc(seed)`, `boardText(doc)`, `readSnapshot`, `reconcileSnapshot`, `ELEMENTS_KEY`, `META_KEY`, `BOARD_LOCAL`, `BOARD_AMEND` | The document half: the board on a `Y.Doc`, element by element, readable and writable without a canvas.                                                                                                                                                                             |
| the actions (`addNode`, `addArrow`, `writeGeometry`, `writeRemoval`, `checkImage`, `assetPath`, …) and the arm rules (`armViewport`, `DEFAULT_RULES`, …)         | What the board's features write into the document, and the rules for editing a model on a board, as plain functions.                                                                                                                                                               |

No React component, no React Flow type and no type of another product crosses the boundary: a
host calls the factory and never React or React Flow itself.

## The DOM

What the board writes, and what a host may read or style:

- `attachTo(element)` appends `div.board-module` (inline width and height 100 %) >
  `.board-root[data-embedded]` > `.board-root__canvas` > `.react-flow[data-board-view]` >
  `.react-flow__pane`, which takes the board's keys (`tabindex="0"`, `aria-label="Board"`).
- A model node is `.board-node[data-armed]` with a header (`.board-node__title`,
  `.board-node__notation`, `button.board-node__arm`) and a body that holds the editor's element,
  `.board-engine[data-armed][data-layout="preview"|"overlay"]`; armed, that element is in
  `.board-overlay-layer`. A host may add classes and data attributes of its own to the
  `.board-engine` it was given, never a position or a size.
- `.board-toolbar` is the board's own toolbar, with the Done control (`[data-board-done]`, the
  armed node's id). A host with chrome of its own may set a start margin on `.board-toolbar` and
  `display: none` on `.board-toolbar__group[aria-label="Zoom"]`; nothing else of the toolbar is a
  host's to restyle, and the Done control is never hidden.
- Neither the element the board is attached to nor its ancestors carry a `transform`, a `filter`,
  a `perspective`, a `contain` or a `will-change`: an armed editor's fixed popups are placed
  against the window.

## Licence and notices

[MIT](../../LICENSE). The built sheet carries two works of others, React Flow's sheet
(`@xyflow/react`, MIT, Copyright (c) 2019-2025 webkid GmbH) and the preflight of Tailwind CSS
(MIT, Copyright (c) Tailwind Labs, Inc.), whose legal comment opens the sheet. Their notices are
in `dist/THIRD_PARTY_NOTICES.md` of the package ([`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
here); a host that bundles the sheet ships them with it. The scripts carry nothing but the
package's own sources.

Part of the [Modeler Board](https://github.com/Miragon/modeler-suite/tree/main/modelers/board) in
the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).
