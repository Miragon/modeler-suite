/**
 * The models of a board host, from the files of a repository and a registry of editors: the list
 * the model picker offers, what a file is called, and its editor.
 */
import { bySuffix, type BoardFiles } from "@miragon/board-files";
import type { BoardModels, ModelDescription } from "@miragon/board-renderer";

import { openEditor } from "../facade/open-editor.js";
import type { EditorEntry } from "../registry.js";

export interface ModelsOptions {
  files: BoardFiles;
  editors: readonly EditorEntry[];
  /** see `EmbedOptions.containHistoryKeys` */
  containHistoryKeys?: boolean | undefined;
}

interface FileName {
  folder: string;
  name: string;
  /** the name without the suffix its editor is registered for */
  stem: string;
}

function fileName(path: string, suffixes: readonly string[]): FileName {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const suffix = suffixes.find(
    (one) => name.toLowerCase().endsWith(one) && name.length > one.length,
  );
  return {
    folder: slash < 0 ? "" : path.slice(0, slash),
    name,
    stem: suffix ? name.slice(0, name.length - suffix.length) : name,
  };
}

export function modelsFrom(options: ModelsOptions): BoardModels {
  const { files, editors } = options;
  let from: readonly string[] | undefined;
  let listed: readonly string[] = [];
  let names = new Map<string, FileName>();
  const described = new Map<string, ModelDescription>();
  const list = (): readonly string[] => {
    const paths = files.paths();
    if (paths !== from) {
      from = paths;
      listed = paths.filter((path) => bySuffix(editors, path) !== undefined);
      names = new Map(
        listed.map((path) => [path, fileName(path, bySuffix(editors, path)?.suffixes ?? [])]),
      );
      described.clear();
    }
    return listed;
  };
  const titleOf = (path: string, own: FileName): string => {
    const others = [...names].filter(([other]) => other !== path).map(([, name]) => name);
    const sameStem = others.filter((other) => other.stem === own.stem);
    if (sameStem.length === 0) return own.stem;
    // two files of one name are told apart by their folder, and in one folder by their suffix
    const name = sameStem.some((other) => other.folder === own.folder) ? own.name : own.stem;
    return own.folder ? `${name} in ${own.folder}` : name;
  };
  return {
    list,
    onChange: (listener) => files.onPaths(listener),
    describe(path) {
      list();
      const entry = bySuffix(editors, path);
      if (!entry) return undefined;
      let description = described.get(path);
      if (!description) {
        description = { title: titleOf(path, fileName(path, entry.suffixes)), kind: entry.kind };
        described.set(path, description);
      }
      return description;
    },
    open(context) {
      const entry = bySuffix(editors, context.path);
      // a file no editor of this host shows, a board among them
      if (!entry) return undefined;
      return openEditor(context, {
        entry,
        files,
        containHistoryKeys: options.containHistoryKeys,
      });
    },
  };
}
