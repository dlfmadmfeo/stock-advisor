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
      <head>
        {/* 한글 글꼴(Pretendard Variable, 동적 서브셋): Inter는 라틴 전용이라
            한글이 시스템 글꼴로 떨어져서 화면마다 굵기·숫자 모양이 제각각이었어요
            (2026-11-20 세션). 쓰는 글자만 받는 서브셋 CSS라 용량 부담이 작고,
            로딩 전엔 시스템 글꼴로 먼저 보여줍니다(font-display: swap). */}
        <link href="https://cdn.jsdelivr.net" rel="preconnect" crossOrigin="anonymous" />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AppLoaders />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
