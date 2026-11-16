import { describe, expect, test } from "vitest";
import { bySuffix, isNewAssetPath, PICTURE_SUFFIXES, repoPath, suffixRule } from "../src/index.js";

describe("repoPath", () => {
  test.each([
    "example.board",
    "models/tea.owm",
    "a/b/c/d.vc.json",
    "assets/logo.png",
    "notes/a:b.txt",
    "with space/Über sicht.tt",
    "~/x",
    // a dot anywhere but at the start of a segment
    "models/v1.2/tea.owm",
    "models/tea..owm",
    "models/a.b/c.d.owm",
    // what only reads like a way out: no place decodes a path, and none of these is one
    "%2e%2e/secret.owm",
    "models/tea.owm.",
    // names that only look like the short name Windows has for Git's folder
    "git/config",
    "git~/config",
    "models/git~1.owm",
    "legit~1/config",
  ])("takes %j as it is", (path) => {
    expect(repoPath(path)).toBe(path);
  });

  test.each([
    ["an absolute path", "/etc/passwd"],
    ["a scheme", "file:///etc/passwd"],
    ["a scheme without slashes", "javascript:alert(1)"],
    ["a scheme with a plus", "vscode-remote+ssh:host/x"],
    ["a drive letter", "C:/Users/x.owm"],
    ["a drive letter without a slash", "c:x.owm"],
    ["a first segment of two dots", "../outside/secret.owm"],
    ["two dots in the middle", "models/../../secret.owm"],
    ["two dots at the end", "models/.."],
    ["two dots alone", ".."],
    ["one dot alone", "."],
    ["a first segment of one dot", "./models/tea.owm"],
    ["one dot in the middle", "models/./tea.owm"],
    ["a backslash", "models\\tea.owm"],
    ["two dots behind a backslash", "models\\..\\secret.owm"],
    ["a NUL", "models/tea.owm\0.png"],
    ["a line break at the end", "models/tea.owm\n"],
    ["a line break in a folder", "mod\rels/tea.owm"],
    ["a tab", "models/tea\t.owm"],
    ["an escape character", "models/\u001b[2Jtea.owm"],
    ["the delete character", "models/tea\u007f.owm"],
    ["the empty string", ""],
    // a segment that starts with a dot, at every depth: what a repository keeps there is on no board
    ["a dot folder with a dot file in it", ".hidden/..file"],
    ["Git's folder", ".git/config"],
    ["a folder below Git's", ".git/hooks/pre-commit"],
    ["the workflows", ".github/workflows/ci.yml"],
    ["the editor's settings", ".vscode/settings.json"],
    ["a dot file of the root", ".env"],
    ["a model in a dot folder", ".drafts/tea.owm"],
    ["a dot folder in the middle", "models/.drafts/tea.owm"],
    ["a dot folder at the depth of five", "a/b/c/d/.e/tea.owm"],
    ["a dot file at the end", "models/.tea.owm"],
    ["a dot file below assets", "assets/.logo.png"],
    // on NTFS `.git` usually has a short name, which opens Git's folder without a dot
    ["the short name Windows has for Git's folder", "GIT~1/config"],
    ["that name in lower case", "git~1/hooks/pre-commit"],
    ["that name with another number", "sub/Git~12/config"],
    ["that name alone", "GIT~1"],
    ["two dots and a percent sign", "..%2fsecret.owm"],
    ["two dots and a space", "models/.. /secret.owm"],
    ["three dots", "models/.../tea.owm"],
    ["an empty segment", "models//tea.owm"],
    ["a slash at the end", "models/"],
    ["a network path", "//server/share/x"],
  ])("refuses %s", (_what, path) => {
    expect(repoPath(path)).toBeUndefined();
  });

  test("takes 1024 characters and refuses 1025", () => {
    expect(repoPath("a".repeat(1024))).toBe("a".repeat(1024));
    expect(repoPath("a".repeat(1025))).toBeUndefined();
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["an object", { path: "models/tea.owm" }],
    ["an array", ["models/tea.owm"]],
    ["a String object", new String("models/tea.owm")],
  ])("refuses %s: a message can hold anything", (_what, input) => {
    expect(repoPath(input)).toBeUndefined();
  });
});

describe("isNewAssetPath", () => {
  test.each([
    "assets/logo.png",
    "assets/screen-shot_2.PNG",
    "assets/a",
    "assets/a.b.c",
    // names that only start like a device of Windows
    "assets/console.png",
    "assets/nul-2.png",
    "assets/com10.png",
    "assets/com0.png",
    "assets/auxiliary",
    "assets/lpt.png",
  ])("takes %j", (path) => {
    expect(isNewAssetPath(path)).toBe(true);
  });

  test.each([
    ["a file of another folder", "models/tea.owm"],
    ["a file of the root", "logo.png"],
    ["a folder below assets", "assets/icons/logo.png"],
    ["the folder alone", "assets/"],
    ["the folder without a slash", "assets"],
    ["a folder that only starts like it", "assets2/logo.png"],
    ["assets below another folder", "docs/assets/logo.png"],
    ["two dots as the name", "assets/.."],
    ["one dot as the name", "assets/."],
    ["a space in the name", "assets/my logo.png"],
    ["a letter outside ASCII", "assets/Übersicht.png"],
    ["a backslash", "assets\\logo.png"],
    ["a line break after the name", "assets/logo.png\n"],
    ["another case of the folder", "Assets/logo.png"],
    ["a dot file", "assets/.gitignore"],
    ["a dot file with a suffix", "assets/.hidden.png"],
    ["a dot at the end, which Windows drops", "assets/logo.png."],
    ["a name of dots and a letter", "assets/a.."],
    ["a device name of Windows", "assets/nul"],
    ["a device name with a suffix", "assets/con.png"],
    ["a device name in capitals", "assets/AUX.svg"],
    ["a device name with two suffixes", "assets/prn.tar.gz"],
    ["a serial port", "assets/COM1.png"],
    ["a printer port", "assets/lpt9"],
    ["more than 1024 characters", `assets/${"a".repeat(1024)}`],
  ])("refuses %s", (_what, path) => {
    expect(isNewAssetPath(path)).toBe(false);
  });
});

describe("bySuffix", () => {
  const wardley = { notation: "wardley", suffixes: [".wmap", ".owm"] };
  const teams = { notation: "team-topologies", suffixes: [".tt", ".ttm.json"] };
  const valueChain = { notation: "value-chain", suffixes: [".vc", ".vc.json"] };
  const json = { notation: "json", suffixes: [".json"] };
  const entries = [wardley, teams, json, valueChain];

  test("finds the entry by the end of the file name", () => {
    expect(bySuffix(entries, "models/tea.owm")).toBe(wardley);
    expect(bySuffix(entries, "tea.wmap")).toBe(wardley);
    expect(bySuffix(entries, "a/b/sample.tt")).toBe(teams);
  });

  test("takes the longest suffix, wherever its entry stands in the list", () => {
    expect(bySuffix(entries, "porter.vc.json")).toBe(valueChain);
    expect(bySuffix(entries, "sample.ttm.json")).toBe(teams);
    expect(bySuffix(entries, "package.json")).toBe(json);
    expect(bySuffix([valueChain, json], "porter.vc.json")).toBe(valueChain);
  });

  test("ignores the case of the name and of the suffix", () => {
    expect(bySuffix(entries, "models/TEA.OWM")).toBe(wardley);
    expect(bySuffix([{ suffixes: [".OWM"] }], "tea.owm")).toBeDefined();
  });

  test("a file named only the suffix is none", () => {
    expect(bySuffix(entries, "models/.owm")).toBeUndefined();
    expect(bySuffix(entries, ".vc.json")).toBe(json);
  });

  test("reads the file name, not its folders", () => {
    expect(bySuffix(entries, "models.owm/readme.md")).toBeUndefined();
    expect(bySuffix(entries, "tea.owm/")).toBeUndefined();
  });

  test("answers undefined for a name no entry ends, for no entries and for an empty suffix", () => {
    expect(bySuffix(entries, "example.board")).toBeUndefined();
    expect(bySuffix(entries, "owm")).toBeUndefined();
    expect(bySuffix([], "tea.owm")).toBeUndefined();
    expect(bySuffix([{ suffixes: [""] }], "tea.owm")).toBeUndefined();
  });

  test("of two entries with one suffix the first is taken", () => {
    const first = { suffixes: [".owm"] };
    const second = { suffixes: [".owm"] };
    expect(bySuffix([first, second], "tea.owm")).toBe(first);
  });
});

describe("suffixRule", () => {
  const rule = suffixRule({ models: [".owm", ".vc.json"], pictures: [".png", ".svg"] });

  test("calls a model what ends in a suffix of the editors, and a picture what ends in one of the pictures", () => {
    expect(rule.model("models/tea.owm")).toBe(true);
    expect(rule.model("porter.vc.json")).toBe(true);
    expect(rule.model("models/TEA.OWM")).toBe(true);
    expect(rule.picture("assets/logo.png")).toBe(true);
    expect(rule.picture("assets/Drawing.SVG")).toBe(true);
  });

  test("keeps the two apart: a model is no picture and a picture no model", () => {
    expect(rule.picture("models/tea.owm")).toBe(false);
    expect(rule.model("assets/logo.png")).toBe(false);
  });

  test.each([
    "notes/readme.md",
    "package.json",
    "example.board",
    "models/tea",
    "models/tea.owm.",
    "models/tea.owm.bak",
    "models.owm/readme.md",
    "owm",
  ])("calls %j neither", (path) => {
    expect(rule.model(path)).toBe(false);
    expect(rule.picture(path)).toBe(false);
  });

  test("a rule without suffixes lets a board reach nothing", () => {
    const none = suffixRule({ models: [], pictures: [] });
    expect(none.model("models/tea.owm")).toBe(false);
    expect(none.picture("assets/logo.png")).toBe(false);
  });

  test("the pictures a board draws are named once, lower case and with the dot", () => {
    expect(PICTURE_SUFFIXES).toEqual([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
    const pictures = suffixRule({ models: [], pictures: PICTURE_SUFFIXES });
    for (const suffix of PICTURE_SUFFIXES) expect(pictures.picture(`assets/a${suffix}`)).toBe(true);
    expect(pictures.picture("assets/a.bmp")).toBe(false);
  });
});
