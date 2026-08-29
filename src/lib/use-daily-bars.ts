"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/api-url";
// 타입만 가져와요(import type) — 실제로는 erase돼서 컴파일 결과물에 안
// 남으니, kis.ts가 서버 전용 시크릿을 다룬다 해도 이 클라이언트 파일에
// 안전하게 섞어 쓸 수 있어요 (auth-client.ts의 `import type { auth }`와
// 같은 패턴).
import type { DailyBar } from "@/lib/kis";

// use-stock-news.ts/use-investor-trend.ts와 같은 Suspense 패턴.
// /api/daily-bars/[ticker]를 감싸서 종목 상세 화면의 주가 차트/MACD
// 카드가 씁니다.
async function fetchDailyBars(ticker: string): Promise<DailyBar[]> {
  const res = await fetch(resolveApiUrl(`/api/daily-bars/${ticker}`));
  const data: { ok: boolean; message: string; bars: DailyBar[] } = await res.json();
  if (!data.ok) throw new Error(data.message || "일봉 데이터를 불러오지 못했어요.");
  return data.bars;
}

export function useDailyBars(ticker: string) {
  return useSuspenseQuery({
    queryKey: ["daily-bars", ticker],
    queryFn: () => fetchDailyBars(ticker),
    staleTime: 5 * 60_000,
  });
}
