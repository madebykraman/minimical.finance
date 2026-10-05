import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance workspace",
  description: "Invoices, payments, documents and financial records for independent businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
