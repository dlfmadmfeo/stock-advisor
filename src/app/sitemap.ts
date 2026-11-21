import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listStockTickers } from "@/lib/stock-page";

// 검색엔진에 알려줄 주소: 종목 상세(공개) + 공개 안내 페이지.
// 로그인이 필요한 화면은 넣지 않습니다.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stocks = await listStockTickers();
  return [
    ...stocks.map(({ ticker, updatedAt }) => ({
      url: `${SITE_URL}/stock/${ticker}`,
      lastModified: updatedAt,
      changeFrequency: "daily" as const,
    })),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly" as const },
    { url: `${SITE_URL}/account-deletion`, changeFrequency: "yearly" as const },
  ];
}
