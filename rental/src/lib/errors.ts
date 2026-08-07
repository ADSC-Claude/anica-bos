/**
 * The error type the domain throws, kept in its own module with no imports.
 *
 * It used to live in guard.ts, which imports `next/navigation` for `redirect`.
 * That pulled the App Router — and therefore React — into anything that merely
 * wanted to throw a 409, including the test runner, where it fails outright.
 * The domain should not need a web framework to say "those dates are taken".
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
