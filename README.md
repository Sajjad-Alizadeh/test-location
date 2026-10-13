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
- Demo tiles use OpenStreetMap, with visible attribution. Production `/locate` requires your licensed/self-hosted tile URL; it has no external default. Map tiles reveal the viewed region to that provider. Use a provider allowed by your privacy policy and reachable on target Iranian networks. No satellite view is offered.
- Offline submissions are not stored or claimed as delivered. Patient selection stays in page memory; restore connectivity and retry, or call 115. No service worker caches patient data. Unsupported WebViews show manual fallback and browser instructions.

## Verification and operational readiness

30 automated unit tests cover Iranian cities/islands, polygon rejection, map projection, sample freshness, dynamic accuracy thresholds, anomaly recovery, state isolation, verification requirements, metadata validation, and stale retry behavior. Browser smoke checks cover desktop/mobile layout, minimum touch sizes, real map loading, permission dialog, demo-only receipt, invalid links, mocked GPS acquisition, manual override, and retry idempotency. Run `node tests/browser-smoke.mjs http://localhost:3000` with an isolated Chrome debug session on port 9223; it saves screenshots to `/tmp/emergency-*.png`. `CHROME_DEBUG_URL` can select a different debug endpoint. Browser provider/sensor fixtures do not certify actual carrier delivery.

Before real emergency use, integrate and test the carrier/SMS/geocoder/dispatch gateway against provider sandboxes, verify durable receipts and distributed rate limits, deploy via HTTPS with ingress log redaction and encrypted data retention controls, and measure end-to-end timing on target mobile networks. Native iPhone Safari, Android Chrome, denied OS permissions, in-app browsers, interrupted connectivity, jammed/spoofed locations, and elderly-user comprehension require physical-device and operator acceptance tests. Provider outages and authoritative “not accepted” responses need monitored runbooks. This checkout has no real operator credentials and has not been certified for emergency operations.

Documentation: [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [browser geolocation requirements](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition), [Android permissions](https://support.google.com/chrome/answer/114662?co=GENIE.Platform%3DAndroid), [iPhone location settings](https://support.apple.com/en-ie/102647). Context7 was attempted outside the sandbox twice and failed with `fetch failed`; implementation was verified against installed Next.js 16.4 guides and official sources instead.

Vazirmatn is self-hosted from [rastikerdar/vazirmatn](https://github.com/rastikerdar/vazirmatn), licensed under SIL OFL; license included in `public/fonts/OFL.txt`.
