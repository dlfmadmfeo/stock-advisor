"use client";

import { useMemo, useRef } from "react";
import { useAdvisorStore, type LiveQuote } from "@/stores/use-advisor-store";
import { getStock as getSampleStock, type Stock } from "@/lib/stocks";
import { sectorAveragePbr, sectorAveragePer } from "@/lib/screener";

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
    pbr: live.pbr ?? base.pbr,
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

// mergeLiveQuote(스토어)는 웹소켓 틱 하나마다 liveQuotes 객체 "전체"를 새로
// 만들어요(해당 티커만 바뀌고 나머지 티커의 값 객체 참조는 그대로 유지됨).
// 근데 그냥 base.map((s) => mergeLive(s, liveQuotes[s.ticker]))로 매번 새
// 배열을 만들면, 틱 하나 때문에 관련 없는 종목까지 전부 새 객체가 되어
// StockRow 같은 하위 컴포넌트가 React.memo를 써도 소용없이 다 리렌더돼요.
// 여기서는 티커별로 "이전에 쓴 live 참조"를 기억해뒀다가, 그 참조가 그대로면
// merge 결과 객체도 재사용해서 참조를 유지합니다 — 그래야 바뀐 종목만 새
// 객체가 되고, 나머지는 React.memo가 실제로 리렌더를 건너뛸 수 있어요.
function useMergedStocks(baseStocks: Stock[], liveQuotes: Record<string, LiveQuote>): Stock[] {
  const cacheRef = useRef<Map<string, { live: LiveQuote | undefined; merged: Stock }>>(new Map());

  return useMemo(() => {
    const prevCache = cacheRef.current;
    const nextCache = new Map<string, { live: LiveQuote | undefined; merged: Stock }>();

    const result = baseStocks.map((base) => {
      const live = liveQuotes[base.ticker];
      const cached = prevCache.get(base.ticker);
      if (cached && cached.live === live) {
        nextCache.set(base.ticker, cached);
        return cached.merged;
      }
      const merged = mergeLive(base, live);
      nextCache.set(base.ticker, { live, merged });
      return merged;
    });

    cacheRef.current = nextCache;
    return result;
  }, [baseStocks, liveQuotes]);
}

export function useLiveStocks(): Stock[] {
  const liveQuotes = useAdvisorStore((s) => s.liveQuotes);
  const universeStocks = useAdvisorStore((s) => s.universeStocks);
  return useMergedStocks(universeStocks, liveQuotes);
}

// PagedStockList(react-query로 페이지 단위로 받아온 종목 목록)도 같은
// 참조-안정적인 병합이 필요해서 export합니다.
export function useMergedStocksWithLive(baseStocks: Stock[]): Stock[] {
  const liveQuotes = useAdvisorStore((s) => s.liveQuotes);
  return useMergedStocks(baseStocks, liveQuotes);
}

// 업종 평균 PER 맵 — 매수/매도 판정의 밸류에이션 비교용. 로드된 전체
// 유니버스(useLiveStocks) 기준이라, 페이지네이션된 리스트 어디서든 같은
// 기준으로 비교할 수 있어요. universeStocks/liveQuotes가 실제로 안 바뀌면
// useLiveStocks가 같은 배열 참조를 재사용하므로 이 계산도 다시 안 돕니다.
export function useSectorAvgPer(): Record<string, number> {
  const stocks = useLiveStocks();
  return useMemo(() => sectorAveragePer(stocks), [stocks]);
}

// PBR 버전도 같은 방식 — useLiveStocks가 안 바뀌면 재계산 안 됨.
export function useSectorAvgPbr(): Record<string, number> {
  const stocks = useLiveStocks();
  return useMemo(() => sectorAveragePbr(stocks), [stocks]);
}

export function usePortfolio() {
  const stocks = useLiveStocks();
  const byTicker = Object.fromEntries(stocks.map((s) => [s.ticker, s]));
  return { stocks, byTicker };
}
