"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { inIran, project, unproject } from "@/lib/location/geometry";
import type { Point } from "@/lib/location/types";
import { clampMapZoom, mapZoomLimits, readMapEnvironment, resolveMapProvider } from "@/lib/map/providers";
import { visibleTiles } from "@/lib/map/tiles";
import { RasterTileLayer } from "./RasterTileLayer";
import { Icon } from "./Icon";

export function LocationMap({ center, zoom: requestedZoom, onZoom, onChange, onInteract, onLocate, disabled, radius, demo }: {
  center: Point; zoom: number; onZoom: (zoom: number) => void; onChange: (point: Point) => void;
  onInteract: () => void; onLocate: () => void; disabled: boolean; radius: number | null; demo: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [buttons, setButtons] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; center: Point } | null>(null);
  const configuration = useMemo(() => resolveMapProvider(readMapEnvironment(), demo), [demo]);
  const provider = configuration.status === "ready" ? configuration.provider : null;
  const zoom = clampMapZoom(requestedZoom, provider);
  const limits = mapZoomLimits(provider);
  const pixel = project(center, zoom);
  useEffect(() => {
    if (configuration.status === "invalid") console.error("Map provider configuration:", configuration.reason);
  }, [configuration]);
  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const tiles = visibleTiles(center, zoom, size, offset);
  function move(x: number, y: number) {
    if (disabled) return;
    const next = unproject({ lng: pixel.lng + x, lat: pixel.lat + y }, zoom);
    if (inIran(next)) { onInteract(); onChange(next); }
  }
  const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / 2 ** zoom;
  const diameter = radius ? radius * 2 / metersPerPixel : 0;
  return <div className="map-shell">
    <div ref={element} className={`map-canvas ${offset.x || offset.y ? "dragging" : ""}`} role="application" aria-label="نقشه انتخاب محل. با کلیدهای جهت، محل را جابه‌جا کنید." tabIndex={disabled ? -1 : 0}
      onKeyDown={e => { const directions: Record<string, [number, number]> = { ArrowLeft: [-35, 0], ArrowRight: [35, 0], ArrowUp: [0, -35], ArrowDown: [0, 35] }; if (directions[e.key]) { e.preventDefault(); move(...directions[e.key]); } }}
      onPointerDown={e => {
        if (disabled || drag.current || e.button !== 0) return;
        element.current?.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, center };
      }}
      onPointerMove={e => { if (drag.current?.id !== e.pointerId) return; const x = e.clientX - drag.current.x, y = e.clientY - drag.current.y; if (Math.abs(x) + Math.abs(y) > 4) onInteract(); setOffset({ x, y }); }}
      onPointerUp={e => {
        if (drag.current?.id !== e.pointerId) return;
        const x = e.clientX - drag.current.x, y = e.clientY - drag.current.y;
        const origin = project(drag.current.center, zoom);
        const rect = element.current!.getBoundingClientRect();
        const dragged = Math.abs(x) + Math.abs(y) > 5;
        const next = unproject({ lng: origin.lng + (dragged ? -x : e.clientX - rect.left - rect.width / 2), lat: origin.lat + (dragged ? -y : e.clientY - rect.top - rect.height / 2) }, zoom);
        drag.current = null; setOffset({ x: 0, y: 0 });
        if (inIran(next)) { onInteract(); onChange(next); }
        element.current?.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setOffset({ x: 0, y: 0 }); }}>
      {provider && <RasterTileLayer key={`${provider.id}:${provider.tileUrlTemplate}`} provider={provider} tiles={tiles} />}
      {diameter > 0 && <div className="accuracy-area" style={{ width: Math.min(diameter, 3000), height: Math.min(diameter, 3000) }} aria-hidden="true" />}
      <div className="center-marker" aria-hidden="true"><div className="marker-label">{demo ? "محل نمونه" : "محل انتخاب‌شده"}</div><svg width="48" height="62" viewBox="0 0 48 62"><path d="M24 59C21 49 4 36 4 23a20 20 0 0 1 40 0c0 13-17 26-20 36Z" fill="#087f65" stroke="white" strokeWidth="3"/><circle cx="24" cy="23" r="7" fill="white"/></svg><span className="marker-crosshair" /></div>
    </div>
    <div className="map-kind"><span /> نقشه خیابان‌ها</div>
    <div className="zoom-controls"><button disabled={disabled || !provider || zoom >= limits.max} onClick={() => onZoom(Math.min(limits.max, zoom + 1))} aria-label="بزرگ کردن نقشه"><Icon name="plus" /></button><button disabled={disabled || !provider || zoom <= limits.min} onClick={() => onZoom(Math.max(limits.min, zoom - 1))} aria-label="کوچک کردن نقشه"><Icon name="minus" /></button></div>
    <button className="map-locate" disabled={disabled} onClick={onLocate} aria-label="پیدا کردن موقعیت من"><Icon name="locate" /></button>
    <div className="map-instruction"><Icon name="pin" size={20} /><span>نقشه را حرکت دهید؛ نشانگر را روی محل خود بگذارید.</span></div>
    {provider && <span className="map-attribution" dir="ltr">{provider.attributions.map((item, index) => <span key={item.url}>{index > 0 && " · "}<a href={item.url} target="_blank" rel="noreferrer">{item.text}</a></span>)}</span>}
    {!provider && <div className="map-unavailable" role="status">نقشه در دسترس نیست. نشانی و نشانه نزدیک را بنویسید یا با ۱۱۵ تماس بگیرید.</div>}
    <button className="map-keyboard" disabled={disabled} aria-expanded={buttons} onClick={() => setButtons(v => !v)}>جابه‌جایی بدون کشیدن <Icon name="chevron" size={16} /></button>
    {buttons && <div className="direction-controls" aria-label="جابه‌جایی نشانگر"><button onClick={() => move(0, -40)} disabled={disabled}>شمال</button><button onClick={() => move(40, 0)} disabled={disabled}>شرق</button><button onClick={() => move(0, 40)} disabled={disabled}>جنوب</button><button onClick={() => move(-40, 0)} disabled={disabled}>غرب</button></div>}
  </div>;
}
