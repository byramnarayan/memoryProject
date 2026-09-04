import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MnemoGraph - Institutional Knowledge & Collective Memory",
  description: "MnemoGraph: Graph-Augmented Collective Memory, Research Intelligence, and Knowledge Cartography platform",
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen bg-white text-ink font-sans antialiased tracking-normal" suppressHydrationWarning>
        <Providers>
          {/* Centralized Single Site Header */}
          <Header />
          
          {/* Main Full-Width Page Body Container */}
          <div className="flex-grow w-full pt-16">
            {children}
          </div>
          
          {/* Centralized Single Site Footer */}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
