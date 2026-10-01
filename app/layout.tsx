import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "minimical finance",
  description: "Private financial workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
