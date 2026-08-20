"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/api-url";
import type { WatchlistItem } from "@/lib/watchlist-data";

// ---------------------------------------------------------------------------
// WatchlistScreen(mobile-screens.tsx)의 목록 로딩을 Suspense로 전환하면서
// 추가 (2026-08-14 세션). 관심종목 추가/삭제(POST/DELETE)는 그대로 일반
// fetch로 하고, 성공하면 queryClient.invalidateQueries(["watchlist"])로
// 이 쿼리만 다시 불러오게 합니다 — mutation까지 useMutation으로 옮기는 건
// 이번 범위에서는 뺐어요(add/remove 쪽 에러 처리가 화면 안 배너로 남아있어야
// 해서, 그 부분까지 Suspense/에러 바운더리로 넘기면 UX가 바뀜).
//
// 2026-08-18 세션: 이 fetch가 Next.js 최초 서버 렌더 패스에서도 한 번
// 실행되는데(아래 fetchWatchlist 참고), 그건 Node 서버가 자기 자신한테
// HTTP 요청을 보내는 거라 브라우저 쿠키(로그인 세션)가 자동으로 안 실려서
// /api/watchlist가 401을 냄 — 관심종목이 유저별로 바뀌면서 새로 생긴 문제.
// 그래서 app/watchlist/page.tsx(서버 컴포넌트)가 DB에서 직접 초기 데이터를
// 읽어서 initialItems로 넘겨주고, 여기서는 그걸 react-query의 initialData로
// 써요 — 그러면 서버 렌더 패스에서 fetchWatchlist 자체가 아예 호출되지
// 않고(이미 데이터가 있으니까), 브라우저에서 마운트된 뒤에만 다시
// fetch(그땐 쿠키가 정상적으로 실림)해서 최신 상태로 갱신합니다.
// ---------------------------------------------------------------------------

export type { WatchlistItem };

async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch(resolveApiUrl("/api/watchlist"));
  if (!res.ok) throw new Error("관심종목을 불러오지 못했어요.");
  const data = await res.json();
  return data.items ?? [];
}

export const WATCHLIST_QUERY_KEY = ["watchlist"] as const;

export function useWatchlistQuery(initialItems?: WatchlistItem[]) {
  return useSuspenseQuery({
    queryKey: WATCHLIST_QUERY_KEY,
    queryFn: fetchWatchlist,
    ...(initialItems ? { initialData: initialItems } : {}),
  });
}
