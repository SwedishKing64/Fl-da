import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floda",
  description: "Supplier paperwork in, shop-ready listings out.",
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
