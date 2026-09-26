// G-04-1 (04-04 Task 2): a client-side race-with-cleanup timeout, same shape
// as app/lib/storage/supabase-helpers.ts's withTimeout but kept as its own
// module rather than imported from there — that helper file's directory is
// currently only imported by server code, and this is a client component;
// duplicating the small helper avoids adding a cross-boundary import for it.
// Kept dependency-free (no react/next imports) so it stays unit-testable
// under plain node:test.
export function withClientTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    const maybeUnref = (timer as unknown as { unref?: () => void }).unref;
    if (typeof maybeUnref === "function") {
      maybeUnref.call(timer);
    }

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
