export type Point = { lat: number; lng: number };
export type LocationSource = "gps" | "carrier" | "ip" | "manual";
export type Fix = Point & {
  accuracy: number | null;
  timestamp: number;
  source: LocationSource;
};
export type SearchResult = Point & { id: string; title: string; address: string };
export type Session = {
  incidentId: string;
  phoneHint: string;
  expiresAt: number;
  coarse: Fix | null;
  lbsPending: boolean;
};
export type DispatchPayload = {
  location: Fix;
  address: string;
  addressSource: "reverse" | "patient";
  details: string;
  verified: true;
  device: { userAgent: string; language: string; platform: string; viewport: string };
};
export type Receipt = { receiptId: string; acceptedAt: number };
