// ── notices: what the board tells the person about a file it took or refused ──

export interface Notice {
  id: number;
  kind: "refused" | "added";
  text: string;
}

/** a refusal stays long enough to be read, and can be closed; a confirmation goes sooner */
const NOTICE_MS = { refused: 15_000, added: 6_000 } as const;

function createNotices() {
  let list: readonly Notice[] = [];
  let next = 1;
  const listeners = new Set<() => void>();
  const set = (to: readonly Notice[]): void => {
    list = to;
    for (const listener of [...listeners]) listener();
  };
  const dismiss = (id: number): void => set(list.filter((notice) => notice.id !== id));
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: (): readonly Notice[] => list,
    push(kind: Notice["kind"], text: string): void {
      const id = next++;
      // the last three: a folder of files dropped at once must not bury the board
      set([...list, { id, kind, text }].slice(-3));
      setTimeout(() => dismiss(id), NOTICE_MS[kind]);
    },
    dismiss,
  };
}

/** one board per page: the toolbar shows them */
export const notices = createNotices();
