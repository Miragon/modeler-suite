/** What a new diagram starts with: valid, and empty apart from its title. */
export const EMPTY_DIAGRAM = 'title New diagram\n';

/** What "New Diagram from Example" writes and "Insert example" of the empty-file hint appends. */
export const EXAMPLE_DIAGRAM = `title Order fulfilment
node order "Place order" [40, 40]
node pay "Take payment" [280, 40]
node pick "Pick items" [520, 40]
node ship "Ship parcel" [520, 200]
`;

/** The example after what the file already holds (an empty file: just the example). */
export function withExampleInserted(current: string): string {
  if (current.trim() === '') return EXAMPLE_DIAGRAM;
  return `${current.replace(/\s*$/, '')}\n${EXAMPLE_DIAGRAM.replace(/^title .*\n/, '')}`;
}
