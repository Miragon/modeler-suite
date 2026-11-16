export interface Build {
  /** dist/index.html */
  html: string;
  /** every built sheet by its file name under dist/assets */
  sheets: Readonly<Record<string, string>>;
  /** every built script */
  scripts: readonly string[];
  /** the names of the files beside dist/index.html: what the public folder brought */
  files: readonly string[];
  /** every file of the example folder as text, by its path below the folder */
  example: Readonly<Record<string, string>>;
}

export interface BuildCheck {
  problems: string[];
  /** the sheets index.html links, in its order */
  linked: string[];
  /** the sheets that come later, each with the script of its notation */
  later: string[];
}

export declare const RENDERER_ROOTS: Readonly<Record<string, string>>;
export declare const LICENCE_COMMENTS: Readonly<Record<string, RegExp>>;
export declare const START_MARK: string;
export declare const MARKER_MIN_LENGTH: number;
export declare function exampleMarker(text: string): string | undefined;
export declare function buildProblems(build: Build): BuildCheck;
