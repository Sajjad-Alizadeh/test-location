import { distance } from "./geometry";
import type { Point, SearchResult } from "./types";
export const DEMO_CENTER: Point = { lat: 35.71522, lng: 51.40595 };
export const DEMO_PLACES: SearchResult[] = [
  { id: "valiasr", lat: 35.71145, lng: 51.40705, title: "میدان ولیعصر", address: "تهران، میدان ولیعصر" },
  { id: "park", lat: 35.71522, lng: 51.40595, title: "خیابان زرتشت / محدوده نمونه", address: "تهران، محدوده خیابان ولیعصر و خیابان زرتشت" },
  { id: "hospital", lat: 35.71748, lng: 51.40952, title: "بیمارستان فیروزگر", address: "تهران، خیابان ولیعصر، خیابان به‌آفرین، بیمارستان فیروزگر" },
  { id: "azadi", lat: 35.69973, lng: 51.33774, title: "میدان آزادی", address: "تهران، میدان آزادی" },
  { id: "milad", lat: 35.74477, lng: 51.37535, title: "برج میلاد", address: "تهران، مجموعه برج میلاد" },
];
export function demoAddress(point: Point): string {
  const nearest = [...DEMO_PLACES].sort((a, b) => distance(point, a) - distance(point, b))[0];
  return distance(point, nearest) < 250 ? nearest.address : "";
}
