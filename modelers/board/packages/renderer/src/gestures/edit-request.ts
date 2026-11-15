// ── a text note that opens in its editor the moment it is added ──────────────

let editOnMount: string | null = null;
/** the toolbar's "Text": the new note is to be typed into at once */
export const requestEdit = (nodeId: string): void => void (editOnMount = nodeId);
/** a text node asks once, when it mounts */
export function takeEditRequest(nodeId: string): boolean {
  if (editOnMount !== nodeId) return false;
  editOnMount = null;
  return true;
}
