import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focuscape — ひとつのことに、深く。",
  description: "25分の集中と5分の休憩。好きな環境音を重ねて、自分だけの静かな作業空間を。登録不要の集中タイマー。",
};
export const viewport: Viewport = { themeColor: "#101614", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
