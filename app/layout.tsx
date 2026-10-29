import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ProductAnalytics } from "@/components/product-analytics";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "IntroHall", template: "%s · IntroHall" },
  description: "Meet the right people at your conference.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        {children}
        <ProductAnalytics />
      </body>
    </html>
  );
}
