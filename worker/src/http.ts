/** Throw from anywhere to answer `{ message, details }` with the given HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json(err.details ? { message: err.message, details: err.details } : { message: err.message }, err.status);
  }
  console.error('Unhandled error', err);
  return json({ message: 'Server error' }, 500);
}

/** Reads a JSON object body; anything else is a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Bad request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Bad request');
  return body as Record<string, unknown>;
}

/** Throws 400 "Validation failed" when any field has an error. */
export function throwIfErrors(errors: Record<string, string>, message = 'Validation failed'): void {
  if (Object.keys(errors).length > 0) throw new ApiError(400, message, errors);
}
