import type { Metadata } from "next";
import { GeistSans, GeistMono } from "geist/font/sans";
import "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinOS",
  description: "Private finance and invoicing operating system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}><body className={GeistSans.className}>{children}</body></html>;
}
