import { timingSafeEqual, createHash } from "node:crypto";
import { gateway, object } from "@/lib/server/gateway";
import { failure, HttpError, json, readBody, text } from "@/lib/server/http";
import { tokenHash, newToken } from "@/lib/server/tokens";
export async function POST(request: Request) {
  try {
    const expected = process.env.DISPATCHER_API_KEY;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!expected) throw new HttpError(503, "Dispatcher integration not configured");
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!timingSafeEqual(digest(expected), digest(supplied))) throw new HttpError(401, "Unauthorized");
    const body = await readBody(request);
    if (!text(body.incidentId, 1, 80) || !/^[A-Za-z0-9_-]+$/.test(body.incidentId) || typeof body.phone !== "string" || !/^\+989\d{9}$/.test(body.phone)) throw new HttpError(400, "Invalid incident or Iranian mobile number");
    const origin = process.env.APP_ORIGIN;
    if (!origin || !origin.startsWith("https://")) throw new HttpError(503, "HTTPS origin required");
    const token = newToken();
    const expiresAt = Date.now() + 20 * 60 * 1000;
    const link = `${origin.replace(/\/$/, "")}/locate#token=${token}`;
    // Gateway must atomically persist the incident and enqueue BOTH jobs.
    // Jobs execute concurrently and retry independently; LBS failure never delays SMS.
    const ack = object(await gateway("incidents/create", { incidentId: body.incidentId, phone: body.phone, tokenHash: tokenHash(token), expiresAt, sms: { link, message: `اورژانس: برای ارسال محل خود این لینک را باز کنید: ${link}` }, jobs: ["sms", "carrier-lbs"] }, `incident:${body.incidentId}`));
    if (ack.queued !== true || ack.incidentId !== body.incidentId) throw new HttpError(502, "Incident queue not acknowledged");
    return json({ incidentId: body.incidentId, queued: true }, 202);
  } catch (error) { return failure(error); }
}
