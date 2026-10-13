import "server-only";
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function assertOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN || (process.env.NODE_ENV !== "production" ? new URL(request.url).origin : "");
  if (!expected || request.headers.get("origin") !== expected) throw new HttpError(403, "Invalid origin");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "JSON required");
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 8192) throw new HttpError(413, "Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); throw new HttpError(413, "Body too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, "Invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid body");
  return value as Record<string, unknown>;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
}
export function failure(error: unknown) {
  return json({ error: error instanceof HttpError ? error.message : "Service unavailable" }, error instanceof HttpError ? error.status : 503);
}
export function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}
