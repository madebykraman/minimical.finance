import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MinBooks — Finance OS",
  description: "Invoices, receipts, statements and financial records for modern independent businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
