import * as vscode from "vscode";
import { locateUrlAddresses, parseDSLWithDiagnostics } from "@miragon/wardley-dsl";
import { MAP_LINK_REFUSALS, isRelativeAddress, resolveMapLink } from "./mapLinks.js";
import type { WorkspaceMaps } from "./workspaceMaps.js";

export const WARDLEY_LANGUAGE_ID = "wardley-owm";
const REFRESH_DELAY_MS = 200;

/** Read-only copies (Git diffs, history) would list every problem a second time. */
const IGNORED_SCHEMES: ReadonlySet<string> = new Set(["git", "gitlens", "vscode-scm"]);

/** What the link check needs of `WorkspaceMaps`. */
export type KnownMaps = Pick<WorkspaceMaps, "ready" | "includes" | "onDidChange">;

/** Whether `document` is a Wardley map worth checking (`.wmap`/`.owm` get the language id). */
export function isWardleyDocument(document: vscode.TextDocument): boolean {
  return document.languageId === WARDLEY_LANGUAGE_ID && !IGNORED_SCHEMES.has(document.uri.scheme);
}

function warning(range: vscode.Range, message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
  diagnostic.source = "wardley";
  return diagnostic;
}

/**
 * The parser is lenient: a typo or a dangling link drops the statement instead of failing the
 * whole map. Its findings become warnings, so the text editor shows squiggles and the Problems view
 * lists them even when only the diagram is open.
 */
export function wardleyDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const { diagnostics } = parseDSLWithDiagnostics(document.getText());
  const lastLine = Math.max(document.lineCount - 1, 0);
  return diagnostics.map((finding) => {
    const line = document.lineAt(Math.min(Math.max(finding.line - 1, 0), lastLine));
    const range = new vscode.Range(
      line.lineNumber,
      line.firstNonWhitespaceCharacterIndex,
      line.lineNumber,
      line.text.length,
    );
    return warning(range, finding.message);
  });
}

function brokenLinkMessage(
  mapUri: vscode.Uri,
  address: string,
  maps: KnownMaps,
): string | undefined {
  const { target, refusal } = resolveMapLink(mapUri, address);
  switch (refusal) {
    case "notAMap":
      return `The link “${address}” doesn't lead to a map. ${MAP_LINK_REFUSALS.notAMap}`;
    case "outsideWorkspace":
      return `The linked map “${address}” is outside the workspace. ${MAP_LINK_REFUSALS.outsideWorkspace}`;
    default:
      return maps.includes(target) ? undefined : `The linked map “${address}” doesn't exist.`;
  }
}

/**
 * The relative links of `document` that "Open link" couldn't follow, as warnings under their
 * address: resolved as `openMapLink` resolves them and looked up among the workspace's map files,
 * so the check asks the file system nothing. Web and mail addresses aren't checked, nor is a map
 * outside the workspace, none of whose links opens; nothing is reported until the workspace's
 * maps are known.
 */
export function mapLinkDiagnostics(
  document: vscode.TextDocument,
  maps: KnownMaps,
): vscode.Diagnostic[] {
  if (!maps.ready || !vscode.workspace.getWorkspaceFolder(document.uri)) return [];
  return locateUrlAddresses(document.getText()).flatMap(({ address, line, start, end }) => {
    if (!isRelativeAddress(address)) return [];
    const message = brokenLinkMessage(document.uri, address, maps);
    return message ? [warning(new vscode.Range(line - 1, start, line - 1, end), message)] : [];
  });
}

/** A map whose number of problems changed without a change of its text. */
export interface ProblemCountChange {
  readonly document: vscode.TextDocument;
  readonly count: number;
}

/** Keeps the 'wardley' DiagnosticCollection in step with open map documents. */
export class WardleyDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly countChanged = new vscode.EventEmitter<ProblemCountChange>();

  /**
   * Fires for each open map whose links were checked again because a map file appeared or went
   * away, when that changed its number of problems.
   */
  readonly onDidChangeCount = this.countChanged.event;

  /** Without `maps`, only the parser's findings are reported. */
  constructor(private readonly maps?: KnownMaps) {
    this.collection = vscode.languages.createDiagnosticCollection("wardley");
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.scheduleRefresh(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.clear(document.uri)),
      this.countChanged,
    );
    if (maps) this.subscriptions.push(maps.onDidChange(() => this.recheckOpenMaps()));
    for (const document of vscode.workspace.textDocuments) this.refresh(document);
  }

  /** Checks `document` now and returns how many problems it has (0 for a document it skips). */
  refresh(document: vscode.TextDocument): number {
    if (!isWardleyDocument(document)) return 0;
    this.cancelPending(document.uri);
    const diagnostics = wardleyDiagnostics(document);
    if (this.maps) diagnostics.push(...mapLinkDiagnostics(document, this.maps));
    this.collection.set(document.uri, diagnostics);
    return diagnostics.length;
  }

  /**
   * Typing fires a change per keystroke; parse once the user pauses. An open map editor refreshes
   * at once instead (`registerMapEditor`): its canvas imports every change, and the pill counts
   * what the canvas shows.
   */
  scheduleRefresh(document: vscode.TextDocument): void {
    if (!isWardleyDocument(document)) return;
    this.cancelPending(document.uri);
    this.pending.set(
      document.uri.toString(),
      setTimeout(() => this.refresh(document), REFRESH_DELAY_MS),
    );
  }

  count(uri: vscode.Uri): number {
    return this.collection.get(uri)?.length ?? 0;
  }

  clear(uri: vscode.Uri): void {
    this.cancelPending(uri);
    this.collection.delete(uri);
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.collection.dispose();
  }

  /** The open maps only: a closed one keeps no problems. */
  private recheckOpenMaps(): void {
    for (const document of vscode.workspace.textDocuments) {
      if (!isWardleyDocument(document)) continue;
      const before = this.count(document.uri);
      const count = this.refresh(document);
      if (count !== before) this.countChanged.fire({ document, count });
    }
  }

  private cancelPending(uri: vscode.Uri): void {
    const key = uri.toString();
    const timer = this.pending.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pending.delete(key);
  }
}
