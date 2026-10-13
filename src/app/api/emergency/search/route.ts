import { gateway, object } from "@/lib/server/gateway";
import { failure, HttpError, json, text } from "@/lib/server/http";
import { resolveSession } from "@/lib/server/session";
import { inIran } from "@/lib/location/geometry";
export async function GET(request: Request) {
  try {
    const session = await resolveSession();
    const q = new URL(request.url).searchParams.get("q");
    if (!text(q, 2, 100)) throw new HttpError(400, "Invalid search");
    const result = object(await gateway("geo/search", { query: q, incidentId: session.incidentId, language: "fa", country: "IR" }));
    if (!Array.isArray(result.results)) throw new HttpError(502, "Search unavailable");
    const results = result.results.slice(0, 8).map(item => object(item)).filter(item => text(item.id, 1, 100) && text(item.title, 1, 150) && text(item.address, 3, 500) && inIran({ lat: item.lat as number, lng: item.lng as number })).map(item => ({ id: item.id, title: item.title, address: item.address, lat: item.lat, lng: item.lng }));
    return json({ results });
  } catch (error) { return failure(error); }
}
