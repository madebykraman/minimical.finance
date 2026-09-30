import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinOS",
  description: "Private finance and invoicing operating system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}