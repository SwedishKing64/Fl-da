import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

/* Two faces: Inter for everything read and typed, Manrope — rounder, more geometric — for the
   headings and the wordmark. Both are fetched at build time and served from the app itself, so the
   desktop copy has them without a network. */
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], weight: ["600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Flöda",
  description: "Supplier paperwork in, shop-ready listings out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`antialiased ${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
