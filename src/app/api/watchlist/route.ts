import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 사용자가 화면에서 보는 관심종목 목록 조회(GET)만 여기서 처리합니다.
// 추가(POST)/삭제(DELETE)는 둘 다 티커를 URL 경로에 받는 게 일관돼서
// src/app/api/watchlist/[ticker]/route.ts로 옮겼습니다(2026-08-14 세션).
//
// DB(Watchlist 테이블)가 "무엇을 관심종목으로 뒀는지"의 소스 오브 트루스이고,
// stock-advisor-server(Spring)는 이 목록을 KIS 웹소켓으로 실시간 구독하는
// 역할만 합니다.
// ---------------------------------------------------------------------------

export async function GET() {
  const rows = await prisma.watchlist.findMany({ orderBy: { addedAt: "asc" } });
  const tickers = rows.map((r) => r.ticker);

  const stocks = tickers.length
    ? await prisma.stock.findMany({ where: { ticker: { in: tickers } } })
    : [];
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const items = rows.map((r) => {
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

  return NextResponse.json({ items });
}
