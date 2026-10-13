import { gateway, object } from "@/lib/server/gateway";
import { failure, HttpError, json, text } from "@/lib/server/http";
import { resolveSession } from "@/lib/server/session";
import { inIran } from "@/lib/location/geometry";
export async function GET(request: Request) {
  try {
    const session = await resolveSession();
    const query = new URL(request.url).searchParams;
    const point = { lat: Number(query.get("lat")), lng: Number(query.get("lng")) };
    if (!query.has("lat") || !query.has("lng") || !inIran(point)) throw new HttpError(400, "Invalid location");
    const result = object(await gateway("geo/reverse", { ...point, incidentId: session.incidentId, language: "fa" }));
    if (!text(result.address, 3, 500)) throw new HttpError(502, "Address unavailable");
    return json({ address: result.address });
  } catch (error) { return failure(error); }
}
