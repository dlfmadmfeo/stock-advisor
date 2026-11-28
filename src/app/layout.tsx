import type { Metadata } from "next";
import "./globals.css";
import { FontLoader } from "@/components/font-loader";
import { AppLoaders } from "@/components/app-loaders";
import { QueryProvider } from "@/components/query-provider";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  // canonical / Open Graph의 상대 주소를 절대 주소로 바꾸는 기준
  metadataBase: new URL(SITE_URL),
  title: { default: "Stock Advisor", template: `%s | ${SITE_NAME}` },
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
      className="h-full antialiased"
    >
      <head>
        {/* Pretendard Variable(동적 서브셋 92개)은 자체 호스팅한다
            (public/fonts/pretendard, 캐시 1년 — next.config.ts). 글꼴 CSS는 첫 화면을
            막지 않도록 FontLoader가 로드 후에 붙인다(<head>나 번들 CSS에 넣으면
            FCP가 0.8s → 2.6s로 늘어난다). */}
      </head>
      <body className="min-h-full flex flex-col">
        <FontLoader />
        <QueryProvider>
          <AppLoaders />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
