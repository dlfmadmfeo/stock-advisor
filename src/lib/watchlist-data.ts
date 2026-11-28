import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 서버 전용 관심종목 조회 로직. API 라우트(/api/watchlist)와 서버 컴포넌트
// (app/watchlist/page.tsx)가 함께 쓴다. "use client" 파일에서 import하면 안 된다.
//
// 페이지가 클라이언트 fetch에만 의존하면 서버 렌더 중 쿠키 없는 자기 호출로 401이
// 나므로, 페이지가 이 함수를 직접 호출해 initialData로 넘긴다.
// ---------------------------------------------------------------------------

export type WatchlistItem = {
  ticker: string;
  addedAt: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  chg: number | null;
  cap: string | null;
};

export async function getWatchlistItems(userId: string): Promise<WatchlistItem[]> {
  const rows = await prisma.watchlist.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
  });
  const tickers = rows.map((r) => r.ticker);

  const stocks = tickers.length
    ? await prisma.stock.findMany({ where: { ticker: { in: tickers } } })
    : [];
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  return rows.map((r) => {
    const s = stockByTicker.get(r.ticker);
    return {
      ticker: r.ticker,
      addedAt: r.addedAt.toISOString(),
      // 유니버스(top 200)에 없는 종목이면 시세 정보가 없을 수 있음 — 그땐
      // 화면에서 "종목명/시세 정보 없음"으로 표시하면 됨.
      name: s?.name ?? null,
      sector: s?.sector ?? null,
      price: s?.price ?? null,
      chg: s?.chg ?? null,
      cap: s?.cap ?? null,
    };
  });
}
