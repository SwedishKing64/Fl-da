import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="antialiased">
      <body>{children}</body>
    </html>
  );
}
