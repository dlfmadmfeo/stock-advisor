"use client";

import { useAdvisorStore, type LiveQuote } from "@/stores/use-advisor-store";
import { getStock as getSampleStock, type Stock } from "@/lib/stocks";

// 실시간 시세(/api/quotes)가 성공한 종목은 값을 덮어쓰고, 실패한 종목은
// stocks.ts의 스냅샷 값을 그대로 씁니다. liveStatus로 어느 쪽인지 판별합니다.
// KIS 연동 성공 시 ma5over20/volRatio/rsi/hi/lo까지 실제 계산값으로 덮어쓰고,
// Yahoo 폴백처럼 가격만 온 경우엔 나머지 스크리너 지표는 스냅샷 값을 유지합니다.
// PagedStockList(react-query로 페이지 단위로 받아온 종목 목록)에도 같은
// 실시간 병합 로직을 쓰기 위해 export 합니다.
export function mergeLive(base: Stock, live?: LiveQuote): Stock {
  if (!live) return base;
  return {
    ...base,
    price: live.price ?? base.price,
    chg: live.chg ?? base.chg,
    ma5over20: live.ma5over20 ?? base.ma5over20,
    volRatio: live.volRatio ?? base.volRatio,
    rsi: live.rsi ?? base.rsi,
    hi: live.hi ?? base.hi,
    lo: live.lo ?? base.lo,
    cap: live.cap ?? base.cap,
    per: live.per ?? base.per,
  };
}

export function useLiveStock(ticker: string): Stock | undefined {
  const live = useAdvisorStore((s) => s.liveQuotes[ticker]);
  const universeStocks = useAdvisorStore((s) => s.universeStocks);
  // DB 유니버스(배치 결과)에 없는 티커면(예: 예시 포트폴리오에만 있는 종목)
  // stocks.ts 샘플로 한 번 더 찾아봅니다.
  const base = universeStocks.find((s) => s.ticker === ticker) ?? getSampleStock(ticker);
  if (!base) return undefined;
  return mergeLive(base, live);
}

export function useLiveStocks(): Stock[] {
  const liveQuotes = useAdvisorStore((s) => s.liveQuotes);
  const universeStocks = useAdvisorStore((s) => s.universeStocks);
  return universeStocks.map((s) => mergeLive(s, liveQuotes[s.ticker]));
}

export function usePortfolio() {
  const stocks = useLiveStocks();
  const byTicker = Object.fromEntries(stocks.map((s) => [s.ticker, s]));
  return { stocks, byTicker };
}
