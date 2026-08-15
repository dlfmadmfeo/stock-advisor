import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppLoaders } from "@/components/app-loaders";
import { QueryProvider } from "@/components/query-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Stock Advisor",
  description: "공개 지표 기반 스크리너로 종목을 투명하게 필터링하는 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AppLoaders />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
