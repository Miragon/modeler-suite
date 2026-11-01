const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
/** A second basis, so the two halves of the hash collide independently. */
const SECOND_OFFSET_BASIS = 0x050c5d1f;

/**
 * The identity of a text for the history's preconditions (SPEC 1.4): FNV-1a over the UTF-16 code
 * units and, independently, over their bytes, plus the length. A hash rather than a counter, so a
 * redo after an undo applies to the text it was made against.
 */
export function hashText(text: string): string {
  let units = FNV_OFFSET_BASIS;
  let bytes = SECOND_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    units = Math.imul(units ^ unit, FNV_PRIME);
    bytes = Math.imul(bytes ^ (unit & 0xff), FNV_PRIME);
    bytes = Math.imul(bytes ^ (unit >>> 8), FNV_PRIME);
  }
  return `${hex(units)}${hex(bytes)}:${text.length}`;
}

function hex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
