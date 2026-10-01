import type { Metadata } from "next";
import "./globals.css";

// UI typography and visual primitives are defined by the dark-native product system.

export const metadata: Metadata = {
  title: "minimical finance",
  description: "Private financial workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
