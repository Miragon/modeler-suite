# The tests of the board host

Two projects, as in the renderer: `npx vitest run --project=unit packages/host` in Node, and the
browser files through the board's browser project. Read
[the renderer's test README](../../renderer/test/README.md) first: what it says of a browser test
of the board holds here too.

## The unit project

| File                   | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fit.test.ts`          | `fitBox`: the content centred in what the insets leave, at most at 100 %, and what it answers for an element without a size and for content without an extent                                                                                                                                                                                                                                                                                                                                     |
| `text-session.test.ts` | `bindTextSession` on a text session double and the stand-in modeler: what is written and when (the notation's rules, once per change, never an echo, each write with the text it was made from), what is imported and when (the view kept, a text the rules call the same, the file's text read when the import starts), a change on the canvas that crosses one from outside (dropped by the session, and the canvas ends on the file's text), the states it reports, a held gesture, the unbind |
| `registry.test.ts`     | one load of an entry's code, tried again after a failure                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `models.test.ts`       | the list, `describe` (two files of one name are told apart by their folder), `open` for a file without an editor                                                                                                                                                                                                                                                                                                                                                                                  |
| `images.test.ts`       | the same Blob until a change, `taken` from the list, a store that has the bytes before it tells, a load that a later one overtook                                                                                                                                                                                                                                                                                                                                                                 |
| `files-host.test.ts`   | the parts of `createFilesHost` and its `dispose`; the files server's limit for a new file is the board's limit for a picture, and the picture suffixes of a host's rule are the ones the board draws                                                                                                                                                                                                                                                                                              |

## The browser project

| File                                 | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser/real-input.browser.test.ts` | the command `commands.realInput` itself (`test-support/real-input.ts`), which every test with real input stands on                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `browser/embed.browser.test.ts`      | `embedModeler` without a board, in an element the test sizes, scales and arms: what it writes on the element, the first fit in layout px, the preview rule of `embed.css`, `release()`, `focus()`, the history keys, `destroy()`, a binding of the host's own; and `openEditor` on the port's double: nobody reading its `ready`, and a file that could not be opened asked for again when the list has its path                                                                                                                                                                            |
| `browser/files-host.browser.test.ts` | the real board (`createCollaborativeModeler` of the renderer) on `createFilesHost` over `connectBackend(createMemoryBackend(...))`: loading, arming by a real double-click, one write per real gesture, a second node on the path, a drop and an edit that cross a change from outside, changes from outside (imported, the same, invalid with the default line and with a host's own, removed, moved), a path the host's rule or a dot folder refuses, a file that comes after its node, new pictures, the end of the board, an editor that cannot be made, the state line under the sheet |

No test here imports a renderer of the suite: the editor is the stand-in. The seven real modelers
run on the same host in `apps/editors/test/browser`.

## Support

- `support/stand-in-modeler.ts`: a modeler of the contract with a canvas service as diagram-js
  has one and the DOM names the sheet and the release act on (`.djs-container`, its svg, a
  palette with a z-index beside it, `.djs-overlay-container` with a pad while something is
  selected). It draws real boxes that take real input: a click selects, Delete removes, a drag
  moves and is one gesture of the contract's interaction surface, Control + Z undoes from a
  listener on the document. Its text is one line per item, and `standInRules` keeps the comments
  of a file, as Wardley's rules do. It touches no DOM before `attachTo`, so the unit tests drive
  it through `commands` and `gesture`. `record` holds what a test asserts on: the imports, the
  viewboxes, the views a host set, the change events. `standInModule` is what a load yields,
  `standInEditors` a registry entry that counts its loads and can fail or wait.
- `support/fake-files.ts`: the files port and a text session as doubles that answer when the test
  says so, for the unit tests. The session drops a write made on another text than it has, as the
  port's session does, and keeps it under `dropped`; the port refuses every `openText` and counts
  them under `opens`.
- `support/board.ts`: `mountHostBoard(files, boardText, options)`, the real board on a host of
  this package, in a box of 1200 x 720. It counts the sessions the host opens and how often each
  is closed, and every path the host asked for under `opens`; the rule it hands `connectBackend`
  is the stand-in's suffixes and the board's pictures unless `rule` says another; and its
  `destroy()` waits until the board's editors are gone before it ends the host
  and the port.
- `support/window-errors.ts`: `watchWindowErrors()`. The renderer's README warns against a window
  listener in a browser test, because Vitest stops counting unhandled errors of a page that has
  one. The two browser files here watch on purpose and assert the list after every test: that the
  page reported nothing is one of the things they hold.

## Notes for whoever writes a test here

- What a person does is real input: `commands.realInput([...])` with client px read off
  `getBoundingClientRect()`. A preview is `inert`, which only real input respects.
- What the outside does is a call on the memory backend (`outside`, `remove`, `move`). It reaches
  the page a task later, message by message. To wait for something to happen, poll. To assert
  that nothing happened, await `delivered(board)` first (in `files-host.browser.test.ts`): the
  port keeps its order, so the answer to a question asked now comes after everything said before.
- A zoom of the board is refused while a press is held in the armed editor (the board's rule), so
  no test can release an editor under a held drag that way. `release()` under a held drag is
  tested on the adapter alone.
- Hit testing skips an inert subtree: `document.elementFromPoint` says nothing about the paint
  order over an editor whose file is invalid or gone, unless the test lifts `inert` for the
  question.
- The board's move to an armed node takes the page's `--cd-motion-base`. The file sets it to
  `0ms` before every test but one, which arms with the board's own motion.
- To see that an assertion can fail without touching the tree: a Vitest config in scratch that
  spreads the sandbox config and adds a plugin whose `transform` changes one statement of one
  source file. Give the plugin a name that carries the change, since Vitest keeps transformed
  modules on disk under a key that holds the plugins' names and not their options.
