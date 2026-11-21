import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PushLoginGate } from "@/components/push-login-gate";
import { StockSeedProvider } from "@/components/stock-seed";
import { StockDetailScreen } from "@/components/mobile-screens";
import { SITE_NAME } from "@/lib/site";
import { formatKRW } from "@/lib/stocks";
import { getStockPageData, listStockTickers } from "@/lib/stock-page";

// 종목 상세는 로그인 없이 볼 수 있는 공개 페이지라 검색 노출과 첫 응답 속도가
// 중요해서 서버에서 미리 만들어 둡니다(정적 생성 + 5분마다 갱신).
// - 유니버스 종목(상위 200)은 빌드 때 미리 생성, 그 밖의 종목은 첫 요청 때 생성
// - 주가 스냅샷은 배치가 하루 한 번 갱신하고, 실시간 값은 화면이 열린 뒤 덮어써요
//
// 주의: 이 파일에서 searchParams / cookies() 같은 요청 정보를 읽으면 페이지가
// 요청마다 새로 렌더링돼서 위 캐시가 꺼집니다. 공시 푸시(?from=push) 로그인
// 확인은 PushLoginGate(브라우저)가 맡고 있어요.
export const revalidate = 300;

export async function generateStaticParams() {
  const tickers = await listStockTickers();
  return tickers.map(({ ticker }) => ({ ticker }));
}

type Params = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const data = await getStockPageData(ticker);
  if (data.kind !== "found") {
    // 없는 종목이거나 DB를 못 읽은 경우: 임시 문구가 색인되지 않게 합니다.
    return { title: "종목 정보", robots: { index: false } };
  }

  const { stock } = data;
  const title = `${stock.name}(${stock.ticker}) 주가·재무·지표`;
  const sign = stock.chg >= 0 ? "+" : "-";
  const description =
    `${stock.name} ${stock.sector} 종목. 현재가 ${formatKRW(stock.price)}원 ` +
    `(${sign}${Math.abs(stock.chg).toFixed(2)}%), 시가총액 ${stock.cap}, PER ${stock.per}배. ` +
    `이동평균·거래량·RSI 등 공개 지표 기준 스크리너 조건 충족 현황과 재무 정보를 확인하세요.`;

  return {
    title,
    description,
    alternates: { canonical: `/stock/${stock.ticker}` },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "ko_KR",
      title,
      description,
      url: `/stock/${stock.ticker}`,
    },
  };
}

export default async function StockPage({ params }: Params) {
  const { ticker } = await params;
  const data = await getStockPageData(ticker);
  if (data.kind === "not-found") notFound();

  const seed =
    data.kind === "found"
      ? { stock: data.stock, sectorStocks: data.sectorStocks }
      : null;

  return (
    <StockSeedProvider seed={seed}>
      <PushLoginGate />
      <StockDetailScreen ticker={ticker} />
    </StockSeedProvider>
  );
}
