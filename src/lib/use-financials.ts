"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/api-url";

// use-investor-trend.ts와 같은 패턴. kis.ts는 서버 전용(프리즈마/시크릿
// 포함)이라 클라이언트에서 import하면 안 돼서, FinancialYear 타입을
// 그대로 옮겨 씁니다(investor-trend.ts가 InvestorTrendDay를 따로 정의해둔
//것과 같은 이유) — 집계 로직이 따로 없어서 investor-trend.ts 같은 별도
// 순수 헬퍼 파일 없이 여기 바로 둡니다.
export type FinancialYear = {
  year: string;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  opMarginPct: number | null;
  roe: number | null;
  debtRatio: number | null;
  eps: number | null;
  bps: number | null;
  revenueGrowthPct: number | null;
  opGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
};

async function fetchFinancials(ticker: string): Promise<FinancialYear[]> {
  const res = await fetch(resolveApiUrl(`/api/financials/${ticker}`));
  const data: { ok: boolean; message: string; years: FinancialYear[] } = await res.json();
  if (!data.ok) throw new Error(data.message || "재무 정보를 불러오지 못했어요.");
  return data.years;
}

export function useFinancials(ticker: string) {
  return useSuspenseQuery({
    queryKey: ["financials", ticker],
    queryFn: () => fetchFinancials(ticker),
    staleTime: 6 * 60 * 60_000,
  });
}
