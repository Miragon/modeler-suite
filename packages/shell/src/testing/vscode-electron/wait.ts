export const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Reads until `done` holds or `timeoutMs` passed, and returns the last value either way. */
export async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
): Promise<{ value: T; met: boolean }> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return { value, met: true };
    if (performance.now() >= deadline) return { value, met: false };
    await delay(intervalMs);
  }
}
