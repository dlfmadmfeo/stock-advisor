"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// WatchlistScreen(mobile-screens.tsx)의 목록 로딩을 Suspense로 전환하면서
// 추가 (2026-08-14 세션). 관심종목 추가/삭제(POST/DELETE)는 그대로 일반
// fetch로 하고, 성공하면 queryClient.invalidateQueries(["watchlist"])로
// 이 쿼리만 다시 불러오게 합니다 — mutation까지 useMutation으로 옮기는 건
// 이번 범위에서는 뺐어요(add/remove 쪽 에러 처리가 화면 안 배너로 남아있어야
// 해서, 그 부분까지 Suspense/에러 바운더리로 넘기면 UX가 바뀜).
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

async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch("/api/watchlist");
  if (!res.ok) throw new Error("관심종목을 불러오지 못했어요.");
  const data = await res.json();
  return data.items ?? [];
}

export const WATCHLIST_QUERY_KEY = ["watchlist"] as const;

export function useWatchlistQuery() {
  return useSuspenseQuery({
    queryKey: WATCHLIST_QUERY_KEY,
    queryFn: fetchWatchlist,
  });
}
