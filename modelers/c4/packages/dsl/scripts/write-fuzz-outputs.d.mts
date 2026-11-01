import type { ViewCatalog, ViewEntry, ViewMembers, Workspace } from "@miragon/c4-schema-model";
import type { C4Edit, EditContext, EditOutcome, ParseResult } from "../src/types.js";

export interface FuzzApi {
  parseWorkspace(text: string): ParseResult;
  applyEdit(document: ParseResult, edit: C4Edit, context: EditContext): EditOutcome;
  viewCatalog(workspace: Workspace): ViewCatalog;
  viewMembers(workspace: Workspace, view: ViewEntry): ViewMembers;
}

export interface FuzzStep {
  readonly before: ParseResult;
  readonly view: string;
  readonly edit: C4Edit;
  readonly outcome: EditOutcome;
}

export const FUZZ_BASES: readonly string[];
export const ACCEPTANCE_SEEDS: number;
export function prng(seed: number): () => number;
export function runFuzzSequence(
  seed: number,
  api: FuzzApi,
  bases: readonly { readonly name: string; readonly text: string }[],
  length?: number,
): { readonly base: string; readonly text: string; readonly steps: readonly FuzzStep[] };
export function readBases(fixtures: string): { readonly name: string; readonly text: string }[];
export function fuzzFileName(seed: number): string;
