import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "minimical.finance",
  description: "Internal finance and invoicing OS for Minimical.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}