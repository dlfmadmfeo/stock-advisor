import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 관심종목 조회 로직 (2026-08-18 세션, SSR 쿠키 문제 수정하며 분리). 서버
// 전용 모듈이라 "use client" 파일(use-watchlist.ts)에서 직접 import하면 안
// 됩니다 — 대신 이 함수는 API 라우트(/api/watchlist)랑 서버 컴포넌트
// (app/watchlist/page.tsx)에서 각각 직접 호출해서 같은 로직을 공유해요.
//
// 원래는 페이지가 클라이언트 컴포넌트(WatchlistBody)의 useSuspenseQuery로
// /api/watchlist를 fetch했는데, 이 fetch가 Next.js의 최초 서버 렌더 패스
// 에서도 한 번 실행돼요(use-watchlist.ts 주석 참고). 그때는 Node 서버가
// 스스로에게 HTTP 요청을 보내는 거라 브라우저 쿠키(세션)가 자동으로 안
// 실려서, 로그인한 상태여도 그 자체 요청은 401을 받았어요(관심종목이
// 유저별로 바뀌면서 새로 생긴 문제). 그래서 이제 페이지가 이 함수를 직접
// 호출해서 initialData로 넘겨주고, useSuspenseQuery는 그 데이터를 그대로
// 쓰다가 브라우저에서만 다시 fetch(그땐 쿠키가 정상적으로 실림)합니다.
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
