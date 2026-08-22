"use client";

import { create } from "zustand";
import { STOCKS, type Stock } from "@/lib/stocks";

// ---------------------------------------------------------------------------
// 검색/필터 상태 + 실시간 시세 병합 상태를 담는 전역 스토어입니다.
// 예전에는 투자 성향(capital/riskLevel/style/horizon) 입력값을 들고 있었지만,
// 정성적 "성향 기반 추천"에서 투명한 규칙 기반 스크리너로 방향을 바꾸면서
// 더 이상 필요하지 않아 검색/실시간 시세 상태로 교체했습니다.
// ---------------------------------------------------------------------------

// 가격/등락률만 오는 경우(예: Yahoo 폴백)와, 스크리너 4개 지표까지 실제로
// 계산되어 오는 경우(KIS 일봉 기반)를 둘 다 표현합니다. 후자만 와도 화면은
// 부분 필드만 덮어쓰고 나머지는 stocks.ts 스냅샷을 그대로 씁니다.
export type LiveQuote = {
  price: number;
  chg: number;
  ma5over20?: boolean;
  volRatio?: number;
  rsi?: number;
  hi?: number;
  lo?: number;
  cap?: string;
  per?: number;
  pbr?: number;
};
export type LiveStatus = "checking" | "live" | "sample";
export type LiveSource = "kis" | "yahoo" | "yahoo-fallback" | null;

// DB(배치로 계산된 유니버스)를 아직 못 받아왔거나 실패했을 때의 상태.
// "loading"일 땐 stocks.ts의 10종목 샘플을 기본값으로 보여주다가, /api/universe
// 응답이 오면 "db"(실제 배치 데이터) 또는 "sample"(DB가 비어서 대체)로 바뀝니다.
export type UniverseStatus = "loading" | "db" | "sample";

interface AdvisorState {
  searchQuery: string;
  searchSector: string;
  setSearchQuery: (query: string) => void;
  setSearchSector: (sector: string) => void;

  liveQuotes: Record<string, LiveQuote>;
  liveStatus: LiveStatus;
  liveSource: LiveSource;
  setLiveQuotes: (quotes: Record<string, LiveQuote>, status: LiveStatus, source?: LiveSource) => void;
  // stock-advisor-server(웹소켓 푸시)에서 종목 하나씩 실시간으로 들어올 때 씀.
  // setLiveQuotes처럼 전체를 갈아치우지 않고 해당 티커만 병합합니다.
  mergeLiveQuote: (ticker: string, quote: LiveQuote) => void;

  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  universeStocks: Stock[];
  universeStatus: UniverseStatus;
  universeUpdatedAt: string | null;
  setUniverse: (stocks: Stock[], status: UniverseStatus, updatedAt?: string | null) => void;

  // "유니버스 새로고침" 버튼의 진행 상태. RefreshUniverseButton의 로컬
  // useState였던 걸 여기로 옮겼어요(2026-08-22 세션) — 홈 화면을 벗어났다
  // 돌아오면 그 컴포넌트가 언마운트/재마운트되면서 로컬 state가 idle로
  // 리셋돼서, 서버에서는 갱신이 계속 진행 중인데도 로딩 표시가 사라지는
  // 문제가 있었음. 스토어는 컴포넌트 마운트 여부와 무관하게 유지되니
  // 화면을 오가도 진행 상태가 그대로 보임.
  universeRefreshState: "idle" | "loading" | "done" | "error";
  universeRefreshMessage: string | null;
  setUniverseRefreshState: (
    state: "idle" | "loading" | "done" | "error",
    message?: string | null,
  ) => void;
}

export const useAdvisorStore = create<AdvisorState>((set) => ({
  searchQuery: "",
  searchSector: "전체",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchSector: (searchSector) => set({ searchSector }),

  liveQuotes: {},
  liveStatus: "checking",
  liveSource: null,
  setLiveQuotes: (liveQuotes, liveStatus, liveSource = null) => set({ liveQuotes, liveStatus, liveSource }),
  mergeLiveQuote: (ticker, quote) =>
    set((s) => ({ liveQuotes: { ...s.liveQuotes, [ticker]: { ...s.liveQuotes[ticker], ...quote } } })),

  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),

  universeStocks: STOCKS,
  universeStatus: "loading",
  universeUpdatedAt: null,
  setUniverse: (universeStocks, universeStatus, universeUpdatedAt = null) =>
    set({ universeStocks, universeStatus, universeUpdatedAt }),

  universeRefreshState: "idle",
  universeRefreshMessage: null,
  setUniverseRefreshState: (universeRefreshState, universeRefreshMessage = null) =>
    set({ universeRefreshState, universeRefreshMessage }),
}));
