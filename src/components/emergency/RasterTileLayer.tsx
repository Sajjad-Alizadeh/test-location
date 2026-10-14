"use client";
/* Tiles must retain browser/provider caching, without Next image proxying. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { tileUrl, type VisibleTile } from "@/lib/map/tiles";
import type { RasterMapProvider } from "@/lib/map/types";

type TileState = { status: "loaded" | "failed" | "pending"; attempt: number };
export function RasterTileLayer({ provider, tiles }: { provider: RasterMapProvider; tiles: VisibleTile[] }) {
  const [states, setStates] = useState<Record<string, TileState>>({});
  const failed = tiles.filter(tile => states[tile.key]?.status === "failed");
  const allFailed = tiles.length > 0 && failed.length === tiles.length;
  function record(key: string, status: TileState["status"]) {
    setStates(previous => {
      // Bound state to current viewport, and ignore events from departed tiles.
      const current: Record<string, TileState> = {};
      for (const tile of tiles) if (previous[tile.key]) current[tile.key] = previous[tile.key];
      if (tiles.some(tile => tile.key === key)) current[key] = { status, attempt: previous[key]?.attempt ?? 0 };
      return current;
    });
  }
  function retry() {
    setStates(previous => {
      const current = { ...previous };
      for (const tile of failed) current[tile.key] = { status: "pending", attempt: (previous[tile.key]?.attempt ?? 0) + 1 };
      return current;
    });
  }
  return <>
    <div className="map-tiles" aria-hidden="true">
      {tiles.map(tile => {
        const url = tileUrl(provider, tile);
        if (!url) return null;
        return <img
          key={`${tile.key}:${states[tile.key]?.attempt ?? 0}`}
          src={url} alt="" draggable={false} width={256} height={256}
          referrerPolicy={provider.referrerPolicy}
          style={{ left: tile.left, top: tile.top }}
          onLoad={() => record(tile.key, "loaded")}
          onError={() => record(tile.key, "failed")}
        />;
      })}
    </div>
    {failed.length > 0 && <div className="map-unavailable" role="status" onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
      <span>{allFailed ? "نقشه بارگیری نشد. اتصال اینترنت را بررسی کنید؛ اگر مشکل ادامه داشت، با ۱۱۵ تماس بگیرید." : "بخشی از نقشه بارگیری نشد. می‌توانید دوباره تلاش کنید."}</span>
      <button type="button" onClick={retry}>بارگیری دوباره نقشه</button>
    </div>}
  </>;
}
