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

// 홈 리스트처럼 "누를 수는 없고 상태만 보여주는" 하트용 (2026-08-29 세션 —
// 토글은 종목 상세 화면에만 남기고 홈 리스트는 표시 전용으로 바꿈). 클릭
// 핸들러/pending/error가 필요 없어서 useWatchlistHeart 전체를 안 쓰고 이
// 훅만 씀 — 한 화면에 종목이 50개씩 렌더될 수 있어서 불필요한 상태를
// 최대한 줄임.
export function useIsWatched(ticker: string): boolean {
  const tickers = useWatchlistSet();
  return tickers.has(ticker);
}

// 하트 버튼 하나가 필요로 하는 상태/동작을 전부 묶은 훅. 비로그인 상태에서
// 누르면 로그인 화면으로 보내고(서버도 401을 주긴 하지만, 미리 안내하는 게
// 나아서), 로그인 상태면 POST/DELETE 후 WATCHLIST_QUERY_KEY를
// invalidate해서 이 훅을 쓰는 모든 곳(하트들 + 관심종목 화면)이 한 번에
// 최신 상태로 갱신되게 합니다.
//
// 2026-08-29 세션 추가: 처음엔 캐시를 낙관적으로 안 바꾸고 fetch 응답을
// 기다린 뒤에야 하트가 채워졌는데, POST가 서버에서 실시간 구독
// 요청(stock-advisor-server 왕복)까지 끝나야 응답이 와서 체감 지연이
// 있었어요("하트 누를 때마다 API 호출돼서 지연되는 것 같다"는 피드백). 그래서
// 요청을 보내기 전에 캐시를 먼저 바꿔서 하트가 즉시 반응하게 하고, 실패하면
// 그때 원래 캐시로 되돌립니다 — 실시간 구독 왕복은 백그라운드에서 계속
// 진행되고 화면은 안 기다려요.
//
// 이 버전엔 롤백을 "요청 시작 전 전체 리스트 스냅샷"으로 통째로 되돌리는
// 버그가 있었어요 — 하트 여러 개를 연달아 누르면, 먼저 누른 하트의 요청이
// 실패해서 롤백될 때 그 스냅샷이 "나중에 누른 다른 하트"의 낙관적 반영보다
// 오래된 상태라, 그 다른 하트의 변경까지 같이 지워져버렸어요(빨갛게
// 채워졌다가 다시 빈 하트로 돌아가는 걸로 보임, 2026-08-29 세션 제보). 그래서
// "전체 스냅샷 저장/복원" 대신, add/remove를 함수형 업데이터로만 표현해서
// 낙관적 반영이든 롤백이든 항상 "그 순간의 최신 캐시" 위에서 이 티커 하나만
// 건드리게 바꿨습니다 — 다른 하트가 그 사이에 넣은 변경은 안 건드림.
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
