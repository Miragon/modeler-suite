import type { Note } from "@miragon/business-model-canvas-schema-model";
import { NOTE_DOT } from "./glyph.js";

/** The class of the one hover card for a sticky, a block and the whole canvas. */
export const NOTES_CARD_CLASS = "bmc-notes-card";

const SHOWN_NOTES = 3;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function noteHtml(note: Note): string {
  return `<div class="bmc-notes-card-note">${NOTE_DOT}<span>${escapeHtml(note.text)}</span></div>`;
}

/**
 * The same card wherever notes show on hover: a title (a sticky's full text, or the place), then
 * up to three notes and how many more.
 */
export function notesCardHtml(title: string, notes: readonly Note[]): string {
  const more = notes.length - SHOWN_NOTES;
  return (
    `<div class="bmc-notes-card-title">${escapeHtml(title)}</div>` +
    notes.slice(0, SHOWN_NOTES).map(noteHtml).join("") +
    (more > 0 ? `<div class="bmc-notes-card-more">+${more} more</div>` : "")
  );
}

/** A short label in the same card, for a control that says what it does. */
export function labelCardHtml(label: string): string {
  return `<div>${escapeHtml(label)}</div>`;
}
