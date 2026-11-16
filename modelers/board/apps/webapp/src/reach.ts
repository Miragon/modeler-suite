import { PICTURE_SUFFIXES, suffixRule } from "@miragon/board-files";
import { SUITE_SUFFIXES } from "board-suite-editors/suffixes";

/**
 * What this page lets its board reach, as the files port asks every host: a text is opened only
 * for a file one of the suite's editors shows, and bytes are read only of a picture a board
 * draws. The table and not the registry, so that the rule is plain data and loads no editor.
 */
export const REACH = suffixRule({
  models: SUITE_SUFFIXES.flatMap((entry) => entry.suffixes),
  pictures: PICTURE_SUFFIXES,
});
