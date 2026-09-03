/**
 * The error type the domain throws, kept in its own module with no imports so
 * the domain can say "that slug is taken" without dragging the App Router —
 * and therefore React — in behind it. The test runner cannot load React.
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
