import { z } from "zod";
import { BLOCK_IDS } from "./blocks.js";
import { allStickies } from "./document.js";
import { isUsableStickyId } from "./ids.js";
import type { CanvasDocument, JsonValue } from "./types.js";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const attributeSchema = z.object({ key: z.string(), value: jsonValueSchema });
const noteSchema = z.object({
  text: z.string(),
  attributes: z.array(attributeSchema),
});

const stickySchema = z.object({
  id: z.string(),
  text: z.string(),
  color: z.string().optional(),
  attributes: z.array(attributeSchema),
  notes: z.array(noteSchema),
});

const documentSchema = z.object({
  header: z.array(attributeSchema),
  notes: z.array(noteSchema),
  blocks: z.array(
    z.object({
      blockId: z.enum(BLOCK_IDS),
      items: z.array(stickySchema),
      notes: z.array(noteSchema),
      attributes: z.array(attributeSchema),
    }),
  ),
  extras: z.array(attributeSchema),
});

function structuralFindings(document: CanvasDocument): string[] {
  const findings: string[] = [];
  const seenBlocks = new Set<string>();
  for (const block of document.blocks) {
    if (seenBlocks.has(block.blockId)) {
      findings.push(`The block "${block.blockId}" appears twice.`);
    }
    seenBlocks.add(block.blockId);
  }
  const seenIds = new Set<string>();
  for (const sticky of allStickies(document)) {
    if (!isUsableStickyId(sticky.id)) findings.push(`"${sticky.id}" is no usable sticky id.`);
    if (seenIds.has(sticky.id)) findings.push(`Duplicate sticky id "${sticky.id}".`);
    seenIds.add(sticky.id);
  }
  return findings;
}

/** A document a canvas can show; throws with every finding when it is not one. */
export function validateDocument(input: unknown): CanvasDocument {
  const result = documentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join(" "));
  }
  // zod's records leave out a `__proto__` key; the input holds every field the file had.
  const document = input as CanvasDocument;
  const findings = structuralFindings(document);
  if (findings.length > 0) throw new Error(findings.join(" "));
  return document;
}
