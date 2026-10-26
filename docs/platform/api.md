# Modeler API

`@miragon/modeler-api` is the one interface every Miragon modeler implements: the collaborative-modeler contract and its conformance kit. A collaborative host (a shared Y.Text, a re-import on every remote change) relies on behaviour a standalone modeler never shows; the contract states it as seven laws, and the kit makes each law a test that runs in every modeler's `test:browser`.

| Law | Requirement                                                             |
| --- | ----------------------------------------------------------------------- |
| L1  | `importText` is silent: no change events, the undo history erased       |
| L2  | `exportText` is canonical and a byte fixpoint on canonical input        |
| L3  | `onContentChanged` fires for every user-visible change and nothing else |
| L4  | undo directly after an import is a no-op                                |
| L5  | view state survives a re-import                                         |
| L6  | foreign content survives import and export                              |
| L7  | a rejected import leaves no trace                                       |

```sh
npm i --save-exact @miragon/modeler-api
```

The full laws, the kit and the versioning rules are in the [package README](https://github.com/Miragon/modeler-suite/tree/main/packages/api#readme).
