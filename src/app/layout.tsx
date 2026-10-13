import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
const vazirmatn = localFont({ src: [{ path: "../../public/fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" }, { path: "../../public/fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" }], variable: "--font-vazirmatn", display: "swap" });
export const metadata: Metadata = { title: "نشان | ارسال موقعیت برای امدادرسانی", description: "محل حضور بیمار را بررسی کنید و برای مرکز امداد بفرستید.", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#087f65" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fa" dir="rtl" className={vazirmatn.variable}><body>{children}</body></html>;
}
