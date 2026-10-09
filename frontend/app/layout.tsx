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
  title: "MnemoGraph - Enterprise Intelligence & Collective Memory",
  description: "One database for AI, institutional knowledge, and autonomous agents powered by Memgraph and PostgreSQL Vector Search.",
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
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen dark:bg-[#06090e] bg-slate-50 dark:text-slate-100 text-slate-900 font-sans antialiased tracking-normal selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden transition-colors duration-200" suppressHydrationWarning>
        {/* Ambient background glows & micro-grid */}
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[450px] bg-gradient-to-b from-cyan-500/15 via-sky-600/6 to-transparent blur-[120px] -z-10" />
        <div className="pointer-events-none fixed top-[600px] -right-32 w-[600px] h-[600px] bg-cyan-950/20 blur-[140px] -z-10" />
        <div className="pointer-events-none fixed inset-0 opacity-20 dot-grid -z-10" />

        <Providers>
          {/* Centralized Glass Header */}
          <Header />
          
          {/* Main Page Body Container */}
          <div className="flex-grow w-full pt-16">
            {children}
          </div>
          
          {/* Centralized Glass Footer */}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
