# نشان — emergency patient location

Persian RTL patient flow for Iran, built with Next.js 16.4 App Router, React 19.3, and strict TypeScript. Self-hosted Vazirmatn, 56px controls, persistent mobile submit button, street map with fixed center pin, landmark search, address correction, and visual Safari/Chrome permission help.

## Run

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

- `/` is an explicitly labeled interactive demonstration. No SMS or location is sent to dispatch. Demo reverse lookup and landmark search use a small Tehran fixture, not nationwide coverage.
- `/locate#token=<opaque-token>` is the real patient flow. No token or valid cookie means no real request. Missing production integration returns an explicit failure.
- `/api/emergency/incident` is the authenticated dispatcher trigger. It is deliberately not exposed as a public patient control.

Copy `.env.example` to `.env.local` and configure a real dispatch gateway before operational use. Secrets never use `NEXT_PUBLIC_` names. HTTPS is mandatory for production geolocation and secure cookies. Map and search failures retain manual address entry and a direct `tel:115` path. This application collects location; receiving location does **not** establish that an ambulance has been dispatched.

## Environment configuration and map providers

`.env.example` documents settings; Next.js does not load that filename. Copy it to `.env.local` **in the project root**, then restart `npm run dev`. Do not overwrite an existing `.env.local`; merge settings into it. Set `NEXT_PUBLIC_*` values before building production: they are compiled into browser JavaScript, so changing them requires rebuilding/redeploying. See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

For the local demonstration, use:

```dotenv
APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_MAP_PROVIDER=osm
```

Leave gateway/dispatcher credentials blank if only testing `/`. No OpenStreetMap account or API token is required for its standard raster tiles. These tiles do not supply our dispatch, carrier lookup, or gateway reverse-geocoding services.

| Variable | How to fill it |
| --- | --- |
| `APP_ORIGIN` | Exact app origin without path/trailing slash. Local: `http://localhost:3000` (match your actual port/host). Real patient/SMS use: public HTTPS origin such as `https://emergency.your-domain.ir`. Localhost on a patient's phone refers to that phone, not your PC. |
| `DISPATCHER_API_KEY` | Server-only shared secret for authorized callers of this app's `/api/emergency/incident`. Generate with `openssl rand -hex 32`; configure your trusted dispatcher to send the same value as a Bearer token. Not an OSM credential. |
| `DISPATCH_GATEWAY_URL` | HTTPS base URL of **your existing/implemented durable dispatch gateway**, e.g. `https://dispatch.your-domain.ir/api/`. It must implement the API contracts below; a random URL or OSM URL will not work. Leave empty for demo-only use. |
| `DISPATCH_GATEWAY_KEY` | Server-only credential issued/configured by the gateway operator, used by this app to authenticate to that gateway. SMS, operator LBS, and geocoder credentials are configured separately at the gateway. |
| `TRUSTED_CLIENT_IP_HEADER` | Optional: `cf-connecting-ip` or `x-real-ip` only when trusted ingress strips/overwrites incoming values. Leave blank locally or without that guarantee. Enables coarse IP baseline lookup through the gateway. |
| `NEXT_PUBLIC_MAP_PROVIDER` | `osm`, `custom`, or `disabled`. `osm` selects the policy-compliant built-in profile; no token. `custom` uses the following URL/credit settings. `disabled` sends no tile requests. Blank preserves OSM demo default; actual patient flow requires explicit configuration. |
| `NEXT_PUBLIC_MAP_TILE_URL` | Custom only: complete HTTPS **256px Web-Mercator raster XYZ** template containing `{z}`, `{x}`, `{y}`. Obtain from your chosen tile provider or self-hosted server. Browser-visible; only provider-approved public/domain-restricted credentials may appear here. Leave blank with `osm`. |
| `NEXT_PUBLIC_MAP_ATTRIBUTION_TEXT` | Custom only: provider's required visible credit text, including all underlying data licenses. Quote text with spaces/symbols in `.env.local`, e.g. `"© Your provider · © OpenStreetMap contributors"` for an OSM-derived service. |
| `NEXT_PUBLIC_MAP_ATTRIBUTION_URL` | Custom only: provider's HTTPS attribution/licensing page. Built-in OSM credit/link are supplied automatically and cannot be replaced with incorrect custom credit. |

Switch to another raster provider without changing patient logic:

```dotenv
NEXT_PUBLIC_MAP_PROVIDER=custom
NEXT_PUBLIC_MAP_TILE_URL=https://tiles.your-provider.ir/{z}/{x}/{y}.png
NEXT_PUBLIC_MAP_ATTRIBUTION_TEXT="© Your provider · © OpenStreetMap contributors"
NEXT_PUBLIC_MAP_ATTRIBUTION_URL=https://www.your-provider.ir/attribution
```

Replace these examples with the **actual** template and credits from your provider. A paid provider may require a browser-approved public key in its URL; do not place private keys in public variables. Tile provider selection is independent of the gateway's reverse-geocoding/search provider.

Provider architecture:

- `src/lib/map/providers.ts` owns provider selection, validation, URL, attribution, zoom limits, and request/referrer policy. Register unusual raster vendors here. Existing canonical OSM `NEXT_PUBLIC_MAP_TILE_URL` configurations still work.
- `src/lib/map/types.ts` defines the raster contract. `src/lib/map/tiles.ts` handles XYZ/TMS addressing and requests **only** viewport-intersecting tiles, with no prefetch.
- `RasterTileLayer.tsx` renders normal browser images, preserves upstream/browser HTTP caching, scopes errors to visible tiles, and retries failed images only on patient request. It does not append cache-busting parameters, invent headers, rotate hosts, or automatically fall back to a different provider.
- `LocationMap.tsx` retains accessible pan/zoom/pin interaction and renders selected provider credits. Geolocation acquisition, patient state, incident authorization, and dispatch stay provider-independent.

The configurable adapter handles raster XYZ. TMS profiles can be registered using `scheme: "tms"`; vendor zoom limits belong in their profile. Vector styles/tiles and SDK-only providers need a separate rendering adapter at the map boundary; they cannot work by pasting a `.pbf` or style JSON URL into an `<img>` template. This boundary avoids rewriting GPS/dispatch logic even when the renderer changes.

### OpenStreetMap 403 and tile policy

The original tile images used `referrerPolicy="no-referrer"`; OSM requires a valid `Referer` for web tiles. The OSM profile now sets **origin-only** image referrers (for example `http://localhost:3000/`). Document/API defaults remain `no-referrer`, and patient tokens/paths are not included in tile referrers. Native browser User-Agent and cache behavior are preserved. Attribution is visible and tiles are limited to the current viewport.

OSM standard tiles require no API token, but are a shared, best-effort service with no availability guarantee. Use a licensed/self-hosted service with suitable coverage/availability for real emergency operations. Follow [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). If 403 persists after this fix, check browser extensions/referrer stripping, VPN/proxy/network blocks, or provider rate restrictions. Do not bypass blocks through spoofed headers or host rotation.

Browser smoke tests intercept and fulfill tile requests with local fixtures; they do not pan/zoom/download real OSM tiles. Tests verify origin-only referrers, recovery after failed tiles, viewport-only loading, and provider attribution/configuration. Human preview remains ordinary interactive viewing.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/lib/location/engine.ts` | Freshness, uncertainty-aware speed rejection, rolling stability, conservative GPS lock |
| `src/lib/location/geometry.ts` | Iran polygon containment, distance, map projection |
| `src/lib/location/machine.ts` | Explicit permission, calibration, lock, manual, submission, terminal transitions |
| `src/lib/location/use-location.ts` | `watchPosition`, secure-context checks, 20-second fallback, stale watchdog, cleanup |
| `src/lib/location/services.ts` | Aborted/debounced geocoding/search, timeout-bounded API calls, dispatch retries |
| `src/components/emergency/LocationMap.tsx` | Native slippy map, fixed pin, zoom buttons, tap and keyboard alternatives to dragging |
| `src/lib/server/` | Token resolution, provider transport, bounded input, trusted ingress IP extraction |
| `src/app/api/emergency/` | Authenticated patient and dispatcher route handlers |

State flow: ready, requesting permission, calibrating GPS, accurate lock or manual fallback, submitting, acknowledged submission. Critical invalid/expired links terminate location submission. GPS events cannot overwrite manual selection or in-flight payloads. GPS capture stops when editing, submitting, or unmounting. Failed submissions retain a frozen payload and idempotency key for retries.

## Production gateway contract

This repository includes a typed, validated gateway adapter, not carrier credentials or a simulated production backend. The gateway must supply durable records and transactional queues. Every endpoint below receives server-side `Authorization: Bearer DISPATCH_GATEWAY_KEY`, JSON, and an eight-second timeout. URL paths are relative to `DISPATCH_GATEWAY_URL`. Responses are validated before use. No process-local incident database is used.

### Dispatcher trigger

`POST /api/emergency/incident`, with `Authorization: Bearer DISPATCHER_API_KEY`:

```json
{"incidentId":"INC-2026-001","phone":"+989121234567"}
```

The server creates a 256-bit cryptographically random token, SHA-256 hash, and 20-minute expiry. It calls gateway `POST incidents/create`, with `Idempotency-Key: incident:<incidentId>`:

```json
{
  "incidentId":"INC-2026-001",
  "phone":"+989121234567",
  "tokenHash":"sha256-hash",
  "expiresAt":1791883200000,
  "sms":{"link":"https://emergency.example.ir/locate#token=<token>","message":"Persian SMS text with the link"},
  "jobs":["sms","carrier-lbs"]
}
```

Required reply: `{"queued":true,"incidentId":"INC-2026-001"}`. The API returns 202 only after this acknowledgement. Gateway must atomically bind token hash to the incident and phone, persist expiry, and enqueue SMS plus carrier localization. Workers execute concurrently; unavailable carrier LBS must not delay SMS. Retriggering the same incident key must preserve the original queued SMS/token; it must not silently replace an active token with the newly proposed value. Queue writes and token binding must be transactional. Duplicate incident requests must not send extra SMS messages.

Carrier adapters belong at the gateway, under operator authorization. Normalize Cell-ID/LBS to latitude, longitude, source `carrier`, timestamp, and provider uncertainty radius. Do not assume a 100–1000m guarantee; rural estimates can be much broader. Asynchronous results update the incident baseline. Configure supported Iranian operators through their approved APIs; web browsers cannot query carrier Cell-ID.

### Token exchange and coarse baseline

Patient link uses a URL **fragment**, keeping the bearer token out of HTTP access paths and referrers. Browser exchanges it through same-origin JSON `POST /api/emergency/session`. Gateway `POST sessions/resolve` receives `{"tokenHash":"...","clientIp":"optional trusted IP"}`. A valid response:

```json
{
  "incidentId":"INC-2026-001",
  "phoneHint":"•••• ۵۶۷۸",
  "expiresAt":1791883200000,
  "lbsPending":true,
  "coarse":{"lat":35.71522,"lng":51.40595,"accuracy":800,"timestamp":1791882000000,"source":"carrier"}
}
```

`coarse` may be `null`; its source may be `carrier` or `ip`. Gateway chooses the best valid baseline and does not average correlated estimates. `lbsPending` covers pending carrier or IP baseline work. Gateway should keep this resolution fast; enqueue IP lookup asynchronously on the first trustworthy patient IP rather than delaying GPS permission. The browser polls pending baseline work every three seconds for up to twenty seconds. GPS samples take precedence; a manual edit prevents background recentering.

IP geolocation is optional and disabled unless `TRUSTED_CLIENT_IP_HEADER` names an ingress-overwritten `cf-connecting-ip` or `x-real-ip` header. Configure ingress to remove caller-supplied values. Never use an untrusted forwarded IP. VPNs, mobile NAT, and provider errors can make IP lookup wrong by many kilometers; preserve uncertainty and require patient verification. Never treat the server's outbound IP as the patient's IP.

Gateway must reject expired, revoked, unknown, or closed-incident tokens (401 or 410); apply distributed rate limits; and return only a masked phone hint. Cookies are HttpOnly, SameSite Strict, scoped to `/api/emergency`, and Secure in production. The fragment is removed after successful exchange. No patient coordinates, token, address, or phone are written to browser storage. The SMS link is a bearer capability bound **in the backend** to a phone/incident; it cannot prove that the opening device owns that SIM. Add operator-approved possession verification if your threat model requires it, without blocking the emergency fallback.

### Reverse geocoding and search

Gateway `POST geo/reverse`: `{lat,lng,incidentId,language:"fa"}`; reply `{address:"city, neighborhood, street, alley"}`. Gateway `POST geo/search`: `{query,incidentId,language:"fa",country:"IR"}`; reply:

```json
{"results":[{"id":"provider-id","title":"بیمارستان فیروزگر","address":"تهران، خیابان به‌آفرین","lat":35.71748,"lng":51.40952}]}
```

Return at most eight Iranian results. Backend validates coordinates, lengths, and payload shape. Use a licensed provider with tested Iranian street/alley coverage and an appropriate data-processing agreement. Provider credentials stay at the gateway. Failed address lookup requires patient address entry; it never invents an address. Stale reverse responses cannot attach to a moved pin. Browser aborts obsolete requests and debounces map geocoding by 450ms and search by 350ms. Provider failure does not prevent selecting a valid manual point.

### Location dispatch and receipt

Browser sends verified location, provider-reported uncertainty (or `null` for manual selection), source, capture timestamp, address, address source, patient arrival notes, and bounded device metadata. Phone/incident association comes from the validated server session, never client-supplied incident IDs. Gateway `POST dispatch/submit` receives this envelope plus `incidentId` and `tokenHash`; `Idempotency-Key` is `<incidentId>:<browser-uuid>`.

Required durable acknowledgement:

```json
{"locationAccepted":true,"receiptId":"dispatch-receipt","acceptedAt":1791882000000}
```

Persist the verified coordinates and address to the dispatch system **before** returning `locationAccepted:true`. Do not return an acknowledgement for an in-memory queue or unconfirmed upstream request. If operator dispatch uses a durable outbox, clearly define acceptance as durable receipt and monitor the subsequent delivery acknowledgement. The UI reports location received, never ambulance dispatched.

Gateway must atomically bind an idempotency key to the payload digest and receipt. Same key and payload return the original receipt; changed payload returns conflict. Failed/uncertain requests do not authorize a new key. Browser freezes inputs while receipt status is unresolved.

On retry, server first calls gateway `POST dispatch/status` with the same full envelope and idempotency key. Reply is the same receipt if accepted, or `{"locationAccepted":false}` if **authoritatively not accepted**. Serialize status with concurrent submissions and verify the payload digest. Unknown status must error, not return false. A stale GPS payload may look up its original receipt but cannot create a new dispatch. If receipt is absent and GPS expired, server returns 409; UI clears selection and permits fresh acquisition/manual confirmation. Expired sessions still require operator assistance.

## Precision limits

- Browser location may combine GNSS, Wi-Fi, and cell signals. JavaScript cannot identify its physical sensor, undo deliberate GPS jamming, or prove coordinates are authentic. Smooth spoofing can pass consistency filters. A stable lock is a validated browser estimate, not guaranteed truth.
- Reject invalid radii, duplicate/non-increasing timestamps, fixes older than 15 seconds, future timestamps, points outside the bundled Iran polygon, and travel above 50m/s after accounting for both reported uncertainties. Keep five samples in a 15-second window. Lock needs three stable samples spanning at least two seconds, with every reported radius and conservative output radius within 35m; after 12 seconds, threshold relaxes to 65m. Uncertainty never shrinks by averaging correlated readings.
- Conservative output radius is the maximum recent reported radius plus each sample's distance from the latest fix. It is not an independently measured or guaranteed error bound. Never present it as a guarantee.
- GPS lock becomes stale after 30 seconds; carrier/IP baseline after two minutes. Source and uncertainty remain distinct. Manual selection reports `accuracy:null` and patient verification, not fabricated meter accuracy. National-level map view cannot be submitted as a precise doorway; zoom/search first.
- Iran polygons are extracted from [datasets/geo-countries](https://github.com/datasets/geo-countries), which uses Natural Earth geometry. This is geographic filtering, not an official survey/jurisdiction boundary. Confirm operational border/island coverage with your dispatch authority before deployment.
- Demo tiles use OpenStreetMap, with visible attribution. Production `/locate` requires explicit map provider configuration; unconfigured patient flow has no external default. Map tiles reveal the viewed region to that provider. Use a provider allowed by your privacy policy and reachable on target Iranian networks. No satellite view is offered.
- Offline submissions are not stored or claimed as delivered. Patient selection stays in page memory; restore connectivity and retry, or call 115. No service worker caches patient data. Unsupported WebViews show manual fallback and browser instructions.

## Verification and operational readiness

Automated unit tests cover Iranian cities/islands, polygon rejection, map projection, sample freshness, dynamic accuracy thresholds, anomaly recovery, state isolation, verification requirements, metadata validation, and stale retry behavior. Browser smoke checks cover desktop/mobile layout, minimum touch sizes, real map loading, permission dialog, demo-only receipt, invalid links, mocked GPS acquisition, manual override, and retry idempotency. Run `node tests/browser-smoke.mjs http://localhost:3000` with an isolated Chrome debug session on port 9223; it saves screenshots to `/tmp/emergency-*.png`. `CHROME_DEBUG_URL` can select a different debug endpoint. Browser provider/sensor fixtures do not certify actual carrier delivery.

Before real emergency use, integrate and test the carrier/SMS/geocoder/dispatch gateway against provider sandboxes, verify durable receipts and distributed rate limits, deploy via HTTPS with ingress log redaction and encrypted data retention controls, and measure end-to-end timing on target mobile networks. Native iPhone Safari, Android Chrome, denied OS permissions, in-app browsers, interrupted connectivity, jammed/spoofed locations, and elderly-user comprehension require physical-device and operator acceptance tests. Provider outages and authoritative “not accepted” responses need monitored runbooks. This checkout has no real operator credentials and has not been certified for emergency operations.

Documentation: [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [browser geolocation requirements](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition), [Android permissions](https://support.google.com/chrome/answer/114662?co=GENIE.Platform%3DAndroid), [iPhone location settings](https://support.apple.com/en-ie/102647). Context7 was attempted outside the sandbox twice and failed with `fetch failed`; implementation was verified against installed Next.js 16.4 guides and official sources instead.

Vazirmatn is self-hosted from [rastikerdar/vazirmatn](https://github.com/rastikerdar/vazirmatn), licensed under SIL OFL; license included in `public/fonts/OFL.txt`.
