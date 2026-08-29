"use client";

import { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { resolveApiUrl } from "@/lib/api-url";
import type { WatchlistItem } from "@/lib/watchlist-data";
import { useSession } from "@/lib/use-session";

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

// ---------------------------------------------------------------------------
// 2026-08-29 세션: 홈 리스트/종목 상세의 하트 토글용. 위 useWatchlistQuery는
// useSuspenseQuery라서 홈 화면처럼 로그인 없이도 봐야 하는 화면에 그대로
// 쓰면, 비로그인 유저는 /api/watchlist가 401을 내는 순간 화면 전체가
// ErrorBoundary로 떨어져요. 그래서 여기는 일반 useQuery로 같은 쿼리키
// (WATCHLIST_QUERY_KEY)를 구독하되, 로그인 상태일 때만(enabled) 실제로
// fetch하고, 결과는 그냥 티커 Set으로만 넘깁니다 — 같은 쿼리키를 쓰니까
// WatchlistScreen(useSuspenseQuery)과 캐시가 자동으로 공유/동기화돼요.
function useWatchlistSet() {
  const { data: session } = useSession();
  const loggedIn = !!session;
  const { data: items } = useQuery({
    queryKey: WATCHLIST_QUERY_KEY,
    queryFn: fetchWatchlist,
    enabled: loggedIn,
  });
  return useMemo(
    () => new Set((items ?? []).map((i) => i.ticker)),
    [items],
  );
}

// 하트 버튼 하나가 필요로 하는 상태/동작을 전부 묶은 훅. 비로그인 상태에서
// 누르면 로그인 화면으로 보내고(서버도 401을 주긴 하지만, 미리 안내하는 게
// 나아서), 로그인 상태면 POST/DELETE 후 WATCHLIST_QUERY_KEY를
// invalidate해서 이 훅을 쓰는 모든 곳(하트들 + 관심종목 화면)이 한 번에
// 최신 상태로 갱신되게 합니다.
export function useWatchlistHeart(ticker: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const tickers = useWatchlistSet();
  const watched = tickers.has(ticker);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (!session) {
      router.push("/login");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(resolveApiUrl(`/api/watchlist/${ticker}`), {
        method: watched ? "DELETE" : "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "요청에 실패했어요.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
    } catch {
      setError("서버에 연결할 수 없어요.");
    } finally {
      setPending(false);
    }
  }, [session, watched, ticker, router, queryClient]);

  return { watched, pending, error, toggle };
}
