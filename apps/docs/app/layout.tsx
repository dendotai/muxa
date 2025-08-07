import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Body } from "./layout.client";
import { Provider } from "./provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "muxa - Multiple Process Manager",
    template: "%s | muxa",
  },
  description:
    "Run your entire dev stack in multiple virtual terminals with one concise command instead of long config files.",
  metadataBase: new URL("https://docs.den.ai/muxa"),
  openGraph: {
    title: "muxa Documentation",
    description:
      "Run your entire dev stack in multiple virtual terminals with one concise command.",
    url: "https://docs.den.ai/muxa",
    siteName: "muxa",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.className}>
      <Body>
        <Provider>{children}</Provider>
      </Body>
    </html>
  );
}
