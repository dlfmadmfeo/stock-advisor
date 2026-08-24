"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/api-url";
import type { InvestorTrendDay } from "@/lib/investor-trend";

// use-stock-news.ts와 같은 패턴: /api/investor-trend/[ticker]를 감싸는
// Suspense 기반 훅. 서버 응답이 { ok: false }면 throw해서 호출부의
// <ErrorBoundary>가 처리하게 통일합니다.
async function fetchInvestorTrend(ticker: string): Promise<InvestorTrendDay[]> {
  const res = await fetch(resolveApiUrl(`/api/investor-trend/${ticker}`));
  const data: { ok: boolean; message: string; days: InvestorTrendDay[] } = await res.json();
  if (!data.ok) throw new Error(data.message || "투자자매매동향을 불러오지 못했어요.");
  return data.days;
}

export function useInvestorTrend(ticker: string) {
  return useSuspenseQuery({
    queryKey: ["investor-trend", ticker],
    queryFn: () => fetchInvestorTrend(ticker),
    staleTime: 5 * 60_000,
  });
}
