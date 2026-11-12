export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data: { error?: string; code?: string } & Record<string, unknown> = {};
  try {
    data = await r.json();
  } catch {
    /* non-JSON body */
  }
  if (!r.ok) throw new ApiError(data.error ?? `Request failed (${r.status})`, r.status, data.code);
  return data as T;
}
