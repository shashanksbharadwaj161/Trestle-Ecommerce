export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Requests fail with a clear message instead of leaving a button spinning forever. */
const TIMEOUT_MS = 25_000;

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const ms = init.timeoutMs ?? TIMEOUT_MS;
  const timeout =
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ms)
      : new AbortController().signal;
  // older browsers without AbortSignal.any keep the caller's signal (the timeout is a best effort there)
  const signal = init.signal
    ? typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : init.signal
    : timeout;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (timeout.aborted)
      throw new ApiClientError(
        0,
        "timeout",
        "The server is taking too long to respond. Please try again.",
      );
    if (init.signal?.aborted) throw err;
    throw new ApiClientError(
      0,
      "network",
      "Couldn’t reach the server. Check your connection and try again.",
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "shortMessage" in err &&
    typeof (err as { shortMessage: unknown }).shortMessage === "string"
  ) {
    return (err as { shortMessage: string }).shortMessage;
  }
  if (err instanceof Error) return err.message.split("\n")[0]!;
  return "Something went wrong";
}
