import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focuscape — A quieter place to focus",
  description: "25分の集中と5分の休憩。好きな環境音を混ぜて、心地よい作業空間を。登録不要の集中タイマー。",
  applicationName: "Focuscape",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111715", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
