"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Stock } from "@/lib/stocks";
import { UNIVERSE_PAGE_SIZE, type SortDirection, type SortField } from "@/lib/constants";

// 한 번에 UNIVERSE_PAGE_SIZE개씩 — /api/universe/paged가 실제로 DB에서
// skip/take로 잘라서 내려줍니다. 프론트에서 전체를 받아놓고 자르는 게 아니라
// 스크롤해서 다음 페이지가 필요해질 때만 진짜 서버 요청을 보내는 진짜
// 페이지네이션이에요.
const PAGE_SIZE = UNIVERSE_PAGE_SIZE;

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
  macdReboundOnly?: boolean;
  sector?: string;
  q?: string;
  sort?: SortField | null;
  dir?: SortDirection;
}) {
  const { screenerOnly = false, macdReboundOnly = false, sector, q, sort = null, dir = "desc" } = params;

  return useInfiniteQuery({
    queryKey: ["universe-paged", { screenerOnly, macdReboundOnly, sector, q, sort, dir }],
    queryFn: async ({ pageParam, signal }) => {
      const search = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      });
      if (screenerOnly) search.set("screenerOnly", "1");
      if (macdReboundOnly) search.set("macdReboundOnly", "1");
      if (sector && sector !== "전체") search.set("sector", sector);
      if (q) search.set("q", q);
      if (sort) {
        search.set("sort", sort);
        search.set("dir", dir);
      }

      const res = await fetch(`/api/universe/paged?${search.toString()}`, { signal });
      if (!res.ok) throw new Error("유니버스 조회에 실패했어요.");
      return (await res.json()) as PagedResponse;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}
