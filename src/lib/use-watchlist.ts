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
// 관심종목 목록 쿼리. 추가·삭제는 일반 fetch로 하고, 성공하면
// WATCHLIST_QUERY_KEY를 invalidate해 다시 불러온다. 추가·삭제 오류는 화면 안
// 배너로 보여줘야 해서 useMutation/에러 바운더리로 옮기지 않았다.
//
// 서버 렌더 중에는 쿠키 없이 자기 자신에게 요청하게 되어 401이 나므로,
// app/watchlist/page.tsx가 DB에서 읽은 초기 데이터를 initialData로 넘긴다.
// 그러면 서버에서는 fetch하지 않고, 브라우저에서 마운트된 뒤에만 다시 받아온다.
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
// 하트 표시·요약 카드용 내부 훅. useWatchlistQuery(useSuspenseQuery)를 비로그인
// 화면에서 쓰면 401 때 화면 전체가 ErrorBoundary로 떨어지므로, 일반 useQuery로
// 같은 쿼리키를 구독하고 로그인 상태일 때만 fetch한다. 쿼리키가 같아서
// WatchlistScreen과 캐시를 공유한다.
function useWatchlistItemsIfLoggedIn() {
  const { data: session } = useSession();
  const loggedIn = !!session;
  const { data: items } = useQuery({
    queryKey: WATCHLIST_QUERY_KEY,
    queryFn: fetchWatchlist,
    enabled: loggedIn,
  });
  return items;
}

function useWatchlistSet() {
  const items = useWatchlistItemsIfLoggedIn();
  return useMemo(
    () => new Set((items ?? []).map((i) => i.ticker)),
    [items],
  );
}

// 홈 요약 카드의 "관심종목 N개" 값. 비로그인이면 0(화면에 로그인 안내가 함께 뜬다).
export function useWatchlistCount(): number {
  const items = useWatchlistItemsIfLoggedIn();
  return items?.length ?? 0;
}

// 홈 리스트처럼 상태만 보여주는 하트용. 한 화면에 종목이 50개씩 렌더될 수 있어
// 클릭 핸들러·pending·error 상태 없이 포함 여부만 돌려준다.
export function useIsWatched(ticker: string): boolean {
  const tickers = useWatchlistSet();
  return tickers.has(ticker);
}

// 하트 버튼 하나에 필요한 상태와 동작을 묶은 훅. 비로그인이면 로그인 화면으로 보낸다.
//
// 낙관적 업데이트: POST 응답은 서버의 실시간 구독 요청까지 끝나야 오기 때문에,
// 요청 전에 캐시를 먼저 바꿔 하트가 바로 반응하게 하고 실패하면 되돌린다.
// 되돌릴 때 요청 전 전체 스냅샷을 쓰면 연속 클릭 시 다른 종목의 낙관적 반영까지
// 지워지므로, 반영과 롤백 모두 함수형 업데이터로 최신 캐시에서 이 티커만 바꾼다.
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
    setError(null);

    const wasWatched = watched;
    const setPresence = (present: boolean) => {
      queryClient.setQueryData<WatchlistItem[]>(WATCHLIST_QUERY_KEY, (old) => {
        const list = old ?? [];
        if (!present) return list.filter((i) => i.ticker !== ticker);
        if (list.some((i) => i.ticker === ticker)) return list;
        return [
          {
            ticker,
            addedAt: new Date().toISOString(),
            name: null,
            sector: null,
            price: null,
            chg: null,
            cap: null,
          },
          ...list,
        ];
      });
    };

    setPresence(!wasWatched);

    setPending(true);
    try {
      const res = await fetch(resolveApiUrl(`/api/watchlist/${ticker}`), {
        method: wasWatched ? "DELETE" : "POST",
      });
      if (!res.ok) {
        setPresence(wasWatched);
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "요청에 실패했어요.");
        return;
      }
      // 진짜 서버 상태(정확한 addedAt, 유니버스 밖 종목이면 name 등)로
      // 조용히 맞춰줍니다 — 위에서 이미 낙관적으로 반영해서 화면은 안 기다림.
      queryClient.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
    } catch {
      setPresence(wasWatched);
      setError("서버에 연결할 수 없어요.");
    } finally {
      setPending(false);
    }
  }, [session, watched, ticker, router, queryClient]);

  return { watched, pending, error, toggle };
}
