import { demoAddress, DEMO_PLACES } from "./demo";
import type { DispatchPayload, Point, Receipt, SearchResult, Session } from "./types";
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = "") { super(message); }
}
export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Avoid AbortSignal.any/timeout: older iOS/WebViews lack these methods.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 12000);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...options.headers } });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new ApiError(response.status === 401 || response.status === 410 ? "اعتبار لینک تمام شده است. با ۱۱۵ تماس بگیرید." : "ارسال انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.", response.status, error.error);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
export function submissionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const getSession = (token?: string) => requestJson<Session>("/api/emergency/session", token ? { method: "POST", body: JSON.stringify({ token }) } : {});
export async function reverseGeocode(point: Point, demo: boolean, signal: AbortSignal): Promise<string> {
  if (demo) return demoAddress(point);
  const result = await requestJson<{ address: string }>(`/api/emergency/geocode?lat=${point.lat}&lng=${point.lng}`, { signal });
  return result.address;
}
export async function searchPlaces(query: string, demo: boolean, signal: AbortSignal): Promise<SearchResult[]> {
  if (demo) return DEMO_PLACES.filter(p => (p.title + p.address).includes(query.replace(/ي/g, "ی").replace(/ك/g, "ک")));
  const result = await requestJson<{ results: SearchResult[] }>(`/api/emergency/search?q=${encodeURIComponent(query)}`, { signal });
  return result.results;
}
export async function sendLocation(payload: DispatchPayload, idempotencyKey: string, retry = false): Promise<Receipt> {
  return requestJson<Receipt>("/api/emergency/dispatch", { method: "POST", headers: { "Idempotency-Key": idempotencyKey, ...(retry ? { "X-Emergency-Retry": "1" } : {}) }, body: JSON.stringify(payload) });
}
