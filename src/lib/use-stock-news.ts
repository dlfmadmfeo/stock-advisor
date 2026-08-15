"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { NewsArticle } from "@/lib/naver-news";
import { resolveApiUrl } from "@/lib/api-url";

// ---------------------------------------------------------------------------
// StockNewsCard(mobile-screens.tsx)를 Suspense로 전환하면서 추가 (2026-08-14
// 세션). 예전엔 컴포넌트 안에서 useState(null) + useEffect + fetch로 직접
// 로딩 상태를 관리했는데, 그 자리를 useSuspenseQuery + <Suspense>로
// 대체합니다. API가 { ok: false }를 주는 경우(뉴스 API 미설정 등)도 여기서
// throw해서, 호출부의 <ErrorBoundary>가 로딩 실패랑 같은 방식으로 처리하게
// 통일했어요.
// ---------------------------------------------------------------------------

async function fetchStockNews(name: string): Promise<NewsArticle[]> {
  const res = await fetch(resolveApiUrl(`/api/news?name=${encodeURIComponent(name)}`));
  const data: { ok: boolean; message: string; articles: NewsArticle[] } = await res.json();
  if (!data.ok) throw new Error(data.message || "뉴스를 불러오지 못했어요.");
  return data.articles;
}

export function useStockNews(name: string) {
  return useSuspenseQuery({
    queryKey: ["stock-news", name],
    queryFn: () => fetchStockNews(name),
    staleTime: 60_000,
  });
}
