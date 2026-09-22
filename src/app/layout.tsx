import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rubin",
  description: "Shopify catalogue tools for a ski shop: supplier invoices in, ready-to-import products out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
