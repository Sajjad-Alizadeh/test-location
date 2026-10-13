import type { CSSProperties } from "react";
export type IconName = "pin" | "shield" | "phone" | "check" | "arrow" | "search" | "locate" | "plus" | "minus" | "help" | "close" | "chevron" | "lock" | "clock" | "signal" | "alert" | "ambulance" | "menu" | "external" | "home";
const paths: Record<IconName, string> = {
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  shield: "M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4ZM8 12l3 3 5-6",
  phone: "M8 3H4a1 1 0 0 0-1 1c0 10 7 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 3a14 14 0 0 1-7-7l3-2-2-5Z",
  check: "m5 12 4 4L19 6",
  arrow: "M20 12H4m6-6-6 6 6 6",
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  plus: "M12 5v14M5 12h14", minus: "M5 12h14",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  close: "m6 6 12 12M6 18 18 6", chevron: "m8 10 4 4 4-4",
  lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  signal: "M4 18v2m5-7v7m5-12v12m5-17v17",
  alert: "M12 8v5m0 4h.01M10 3 2 18a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 3a2 2 0 0 0-4 0Z",
  ambulance: "M3 16V5h11v11M14 9h4l3 5v4h-3m-11 0h7M3 16v2h2M8 8v5m-2.5-2.5h5M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm9 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  menu: "M4 6h16M4 12h16M4 18h16", external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7", home: "m3 10 9-7 9 7v11H3V10Zm6 11v-8h6v8",
};
export function Icon({ name, size = 22, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
