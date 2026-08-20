/**
 * Client-safe API helpers.
 *
 * These run only in the browser (or during client rendering). They must never
 * import from `src/server/*`. Error mapping mirrors the backend's uniform
 * `{ error: { code, message } }` envelope produced by `src/server/api.ts`.
 */

export interface ApiErrorEnvelope {
  error: { code: string; message: string };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const JSON_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Thin fetch wrapper that throws a typed `ApiClientError` on non-2xx. */
export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...init, headers });

  if (!res.ok) {
    let envelope: ApiErrorEnvelope | null = null;
    try {
      envelope = (await res.json()) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }
    if (envelope?.error?.code && envelope?.error?.message) {
      throw new ApiClientError(res.status, envelope.error.code, envelope.error.message);
    }
    throw new ApiClientError(res.status, "ERROR", `Request failed (${res.status}).`);
  }

  if (res.status === 204) return undefined as T;
  if (JSON_METHODS.has(init?.method ?? "GET") && !res.headers.get("content-type")?.includes("json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Submit a JSON body — convenience for POST/PATCH. */
export function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * True when a call failed because the session is invalid/expired. Callers
 * should redirect to /login rather than showing a generic error.
 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 401;
}

/** Hard redirect to the login page (safe to call from client effects). */
export function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}
