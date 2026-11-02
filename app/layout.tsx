import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { OverlapBackdrop } from "@/components/overlap";
import { ProductAnalytics } from "@/components/product-analytics";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "IntroHall", template: "%s · IntroHall" },
  description: "Meet the right people at your conference.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables go on <html>: the theme tokens in globals.css read them at :root.
    <html lang="en" className={`${geistSans.variable} ${bricolage.variable}`}>
      <body className="antialiased">
        <OverlapBackdrop />
        {children}
        <Toaster />
        <ProductAnalytics />
      </body>
    </html>
  );
}
