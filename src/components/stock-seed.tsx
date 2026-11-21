"use client";

import { createContext, useContext } from "react";
import type { Stock } from "@/lib/stocks";

// ---------------------------------------------------------------------------
// 서버가 첫 HTML을 만들 때 DB에서 읽어 둔 종목 데이터를 화면 훅에 전달합니다
// (live-stock.ts). 스토어(useAdvisorStore)는 전역 싱글턴이라 서버에서 값을 넣으면
// 다른 요청과 섞이므로, 요청별로 안전한 React context로 넘겨요.
//
// 스토어의 유니버스가 아직 "loading"일 때만 이 값을 쓰고, /api/universe가 도착해
// 스토어가 채워지면 거기로 넘어갑니다 — 같은 DB 값이라 화면은 그대로입니다.
// ---------------------------------------------------------------------------

export type StockSeed = { stock: Stock; sectorStocks: Stock[] };

const StockSeedContext = createContext<StockSeed | null>(null);

export function StockSeedProvider({
  seed,
  children,
}: {
  seed: StockSeed | null;
  children: React.ReactNode;
}) {
  return (
    <StockSeedContext.Provider value={seed}>{children}</StockSeedContext.Provider>
  );
}

export function useStockSeed(): StockSeed | null {
  return useContext(StockSeedContext);
}
