import { gateway, object } from "@/lib/server/gateway";
import { assertOrigin, failure, HttpError, json, readBody, text } from "@/lib/server/http";
import { resolveSession } from "@/lib/server/session";
import type { Receipt } from "@/lib/location/types";
import { cleanPayload, validPayload } from "@/lib/location/validation";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const session = await resolveSession();
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new HttpError(400, "Idempotency key required");
    const payload = await readBody(request);
    if (!validPayload(payload, Date.now(), false)) throw new HttpError(400, "Invalid location");
    const envelope = { ...cleanPayload(payload), incidentId: session.incidentId, tokenHash: session.hash };
    if (request.headers.get("x-emergency-retry") === "1") {
      const status = object(await gateway("dispatch/status", envelope, `${session.incidentId}:${key}`));
      if (status.locationAccepted === true) return json(receipt(status));
      // A false result must be authoritative and serialized against concurrent submit.
      if (status.locationAccepted !== false) throw new HttpError(502, "Unknown delivery status");
    }
    if (!validPayload(payload)) throw new HttpError(409, "Location expired; select again");
    const ack = object(await gateway("dispatch/submit", envelope, `${session.incidentId}:${key}`));
    return json(receipt(ack));
  } catch (error) { return failure(error); }
}

function receipt(ack: Record<string, unknown>): Receipt {
  if (ack.locationAccepted !== true || !text(ack.receiptId, 1, 100) || typeof ack.acceptedAt !== "number" || !Number.isFinite(ack.acceptedAt) || ack.acceptedAt > Date.now() + 2000 || Date.now() - ack.acceptedAt > 3600000) throw new HttpError(502, "Delivery not acknowledged");
  return { receiptId: ack.receiptId, acceptedAt: ack.acceptedAt };
}
