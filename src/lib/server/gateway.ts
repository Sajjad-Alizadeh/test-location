import "server-only";
import { HttpError } from "./http";
// Gateway owns durable incident records, hashed tokens, queueing, rate limits,
// provider credentials, and transactional idempotency. Never use process memory.
export async function gateway(path: string, body: unknown, idempotencyKey?: string): Promise<unknown> {
  const base = process.env.DISPATCH_GATEWAY_URL;
  const key = process.env.DISPATCH_GATEWAY_KEY;
  if (!base || !key || !base.startsWith("https://")) throw new HttpError(503, "Dispatch integration not configured");
  let response: Response;
  try {
    response = await fetch(new URL(path, base.endsWith("/") ? base : base + "/"), {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body: JSON.stringify(body),
    });
  } catch { throw new HttpError(503, "Provider unavailable"); }
  if (!response.ok) throw new HttpError([401, 410, 409, 429].includes(response.status) ? response.status : 503, "Provider rejected request");
  const raw = await response.text();
  if (raw.length > 65536) throw new HttpError(502, "Invalid provider reply");
  try { return JSON.parse(raw) as unknown; } catch { throw new HttpError(502, "Invalid provider reply"); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(502, "Invalid provider reply");
  return value as Record<string, unknown>;
}
