import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { Header, HeaderShell } from "@/components/Header";
import { PageLoading } from "@/components/PageLoading";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Who Ordered Tax?", template: "%s · Who Ordered Tax?" },
  description: "Itemized bill splitting. Everyone pays for what they ordered, plus their share of tax and tip.",
  appleWebApp: { capable: true, title: "WhoTax", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Suspense fallback={<HeaderShell />}>
          <Header />
        </Suspense>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-24 pt-4">
          <Suspense fallback={<PageLoading />}>{children}</Suspense>
        </main>
        <RegisterSW />
      </body>
    </html>
  );
}
