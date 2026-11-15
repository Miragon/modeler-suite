/// <reference types="vite/client" />
/**
 * The folder `modelers/board/example` as the repository the web app shows: the board file, and
 * every model and picture beside it under the path a node stores. The bundler reads the folder,
 * so a model or an SVG picture added there is in the app without a line here.
 */
import type { ExampleRepository } from "./storage.js";

const FOLDER = "../../../example/";

const boards = import.meta.glob<string>("../../../example/example.board", {
  query: "?raw",
  import: "default",
  eager: true,
});
const models = import.meta.glob<string>("../../../example/models/**", {
  query: "?raw",
  import: "default",
  eager: true,
});
// A picture as text: an SVG is one, and the bundler's own data URL of an SVG is rewritten, not
// the file's bytes. A picture of another type needs a glob of its own (`?inline`, which is
// base64 for every type but SVG); example.test.ts fails for a file no glob here reads.
const vectorPictures = import.meta.glob<string>("../../../example/assets/**/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const pathOf = (key: string): string => key.slice(FOLDER.length);

const board = boards[`${FOLDER}example.board`];
if (board === undefined) throw new Error("modelers/board/example has no example.board");

export const EXAMPLE: ExampleRepository = {
  board,
  files: {
    ...Object.fromEntries(Object.entries(models).map(([key, text]) => [pathOf(key), text])),
    ...Object.fromEntries(
      Object.entries(vectorPictures).map(([key, text]) => [
        pathOf(key),
        { bytes: new TextEncoder().encode(text), mime: "image/svg+xml" },
      ]),
    ),
  },
};
