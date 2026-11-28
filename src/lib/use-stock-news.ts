"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { NewsArticle } from "@/lib/naver-news";
import { resolveApiUrl } from "@/lib/api-url";

// ---------------------------------------------------------------------------
// StockNewsCard용 뉴스 쿼리(useSuspenseQuery). API가 { ok: false }를 주는 경우
// (뉴스 API 미설정 등)도 throw해 호출부의 ErrorBoundary가 같은 방식으로 처리한다.
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
