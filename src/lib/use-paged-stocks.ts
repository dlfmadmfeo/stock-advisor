"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Stock } from "@/lib/stocks";
import { UNIVERSE_PAGE_SIZE, type SortDirection, type SortField } from "@/lib/constants";

// 한 번에 UNIVERSE_PAGE_SIZE개씩 — /api/universe/paged가 실제로 DB에서
// skip/take로 잘라서 내려줍니다. 프론트에서 전체를 받아놓고 자르는 게 아니라
// 스크롤해서 다음 페이지가 필요해질 때만 진짜 서버 요청을 보내는 진짜
// 페이지네이션이에요.
const PAGE_SIZE = UNIVERSE_PAGE_SIZE;

// 실제 DB 쿼리는 20개 정도면 순식간(수십ms)에 끝나서, 로딩 스피너가 거의
// 안 보이고 지나가 버립니다. "페이지네이션 되고 있다"는 게 눈에 보이게
// 일부러 최소 1초는 걸리도록 지연을 넣어뒀어요 — 순전히 데모/UX용이고,
// 실제 서비스라면 빼는 게 맞습니다 (사용자 입장에선 빠를수록 좋으니까요).
const ARTIFICIAL_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PagedResponse = {
  stocks: Stock[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  status: "db" | "sample";
};

export function usePagedStocks(params: {
  screenerOnly?: boolean;
  sector?: string;
  q?: string;
  sort?: SortField | null;
  dir?: SortDirection;
}) {
  const { screenerOnly = false, sector, q, sort = null, dir = "desc" } = params;

  return useInfiniteQuery({
    queryKey: ["universe-paged", { screenerOnly, sector, q, sort, dir }],
    queryFn: async ({ pageParam }) => {
      const search = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      });
      if (screenerOnly) search.set("screenerOnly", "1");
      if (sector && sector !== "전체") search.set("sector", sector);
      if (q) search.set("q", q);
      if (sort) {
        search.set("sort", sort);
        search.set("dir", dir);
      }

      const [res] = await Promise.all([
        fetch(`/api/universe/paged?${search.toString()}`),
        sleep(ARTIFICIAL_DELAY_MS),
      ]);
      if (!res.ok) throw new Error("유니버스 조회에 실패했어요.");
      return (await res.json()) as PagedResponse;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}
