"use client";

import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AreaChart,
  Bell,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Cpu,
  Heart,
  Home,
  Search,
  Settings,
  ArrowDown,
  ArrowUp,
  Sparkles,
  Sprout,
  Star,
  X,
} from "lucide-react";
import { HOLDINGS, formatKRW, formatMarketCapEok, type Stock } from "@/lib/stocks";
import type { NewsArticle } from "@/lib/naver-news";
import { UserMenu } from "@/components/user-menu";
import { ErrorBoundary } from "@/components/error-boundary";
import { useStockNews } from "@/lib/use-stock-news";
import { useInvestorTrend } from "@/lib/use-investor-trend";
import { useFinancials } from "@/lib/use-financials";
import {
  aggregateInvestorTrend,
  formatNetAmountEok,
  INVESTOR_TREND_PERIODS,
  type InvestorTrendPeriod,
  type InvestorTrendPoint,
} from "@/lib/investor-trend";
import { useDailyBars } from "@/lib/use-daily-bars";
import { computeMacdSeries, type MacdPoint } from "@/lib/indicators";
import type { DailyBar } from "@/lib/kis";
import {
  useIsWatched,
  useWatchlistHeart,
  useWatchlistQuery,
  WATCHLIST_QUERY_KEY,
  type WatchlistItem,
} from "@/lib/use-watchlist";
import {
  Allocation,
  EmptyState,
  MetricCard,
  SectionHeader,
  SectionTitle,
  TopBar,
  type IconComponent,
} from "@/components/ui-primitives";
import {
  getRecommendation,
  passesScreener,
  screenerChecks,
  screenerScore,
} from "@/lib/screener";
import {
  SCREENER_PASS_THRESHOLD,
  SCREENER_TOTAL_RULES,
} from "@/lib/screener-config";
import {
  useLiveStock,
  useLiveStocks,
  useMergedStocksWithLive,
  useSectorAvgPbr,
  useSectorAvgPer,
} from "@/lib/live-stock";
import { usePagedStocks } from "@/lib/use-paged-stocks";
import {
  RESPONSIVE_TEXT,
  UNIVERSE_PAGE_SIZE,
  UNIVERSE_SORT_FIELDS,
  WATCHLIST_LIMIT,
  type SortDirection,
  type SortField,
} from "@/lib/constants";
import { useAdvisorStore } from "@/stores/use-advisor-store";
import { StatusPill, WsStatusPill } from "@/components/status-pill";
import { RefreshUniverseButton } from "@/components/refresh-universe-button";

function usePortfolioTotals() {
  const stocks = useLiveStocks();
  const byTicker = Object.fromEntries(stocks.map((s) => [s.ticker, s]));
  const total = HOLDINGS.reduce(
    (sum, h) => sum + (byTicker[h.ticker]?.price ?? 0) * h.qty,
    0,
  );
  const cost = HOLDINGS.reduce((sum, h) => sum + h.avgBuy * h.qty, 0);
  const returnAmount = total - cost;
  const returnPct = cost ? +((returnAmount / cost) * 100).toFixed(1) : 0;
  return { stocks, byTicker, total, cost, returnAmount, returnPct };
}

// 예전엔 업종명을 "반도체/플랫폼/2차전지" 같은 고정 태그로 미리 정해두고
// 색을 매칭했는데, 실제 DB 유니버스는 KIS가 주는 업종명을 그대로 쓰기 때문에
// (예: "반도체와반도체장비") 이 고정 태그랑 안 맞으면 전부 매칭 실패로
// 회색(#d1d6db) 처리돼서 도넛이 온통 회색 한 덩어리로 보였어요 — 비중이
// 바뀌어도 색 구분이 안 되니 "그래프에 반영이 안 된다"고 느껴진 원인.
// 업종명이 뭐가 오든 항상 구분되는 색을 주도록 순서 기반 팔레트로 바꿨어요.
const CHART_PALETTE = [
  "#3182f6",
  "#ff7a00",
  "#00a878",
  "#8b5cf6",
  "#f04452",
  "#0ea5e9",
  "#c2984f",
  "#6b7684",
];

function chartColor(index: number) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

// 2026-08-29 세션: "추천"(/category)·"자산"(/analysis) 탭을 하단 nav/데스크톱
// 사이드바에서만 잠시 뺐어요 — 추천 탭은 업종 필터 4개 중 3개(반도체/바이오/
// 플랫폼)가 실제 DB 업종명이랑 안 맞아서 항상 0개만 나오는 버그가 있고,
// 자산 탭은 HOLDINGS(하단 stocks.ts)가 하드코딩된 예시 데이터라 로그인
// 계정과 무관하게 다 똑같이 보여요. 완전히 지우기엔 아직 확신이 없어서
// (계속 이 방향이 맞는지 논의 중) 화면/라우트/코드는 그대로 두고 nav
// 진입점만 주석 처리 — 필요해지면 그냥 주석만 풀면 됩니다. URL로 직접
// /category, /analysis에 들어가면 여전히 접근은 돼요(진입 경로만 숨김).
const navTabs = [
  { href: "/notifications", icon: Home, label: "홈" },
  // { href: "/category", icon: Star, label: "추천" },
  { href: "/watchlist", icon: Heart, label: "관심" },
  // { href: "/analysis", icon: AreaChart, label: "자산" },
  { href: "/alerts", icon: Bell, label: "알림" },
];

const categoryIcons: Record<string, IconComponent> = {
  반도체: Cpu,
  금융: CircleDollarSign,
  바이오: Sprout,
  플랫폼: Building2,
};
const categorySectors = ["반도체", "금융", "바이오", "플랫폼"];

const filters = ["시가총액", "최근 수익률", "PER", "배당수익률", "투자 성향"];

// history 데이터는 src/components/history-content.tsx로 옮겼습니다 (서버
// 컴포넌트 분리 확장).

export function NotificationsScreen() {
  const stocks = useLiveStocks();
  const passed = stocks.filter((s) => passesScreener(s));

  return (
    <AppShell>
      <HomeHeader />
      <section className="space-y-5 px-5 pb-8 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <PortfolioSummary />
          {/* <QuickActions /> */}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-3 lg:order-1">
            {/* SectionHeader를 다른 요소랑 같은 flex 줄에 욱여넣으면 내부의
                justify-between이 펼쳐질 공간을 못 받아서 제목이랑 "전체 보기"가
                딱 붙어버리는 문제가 있었음. 그래서 SectionHeader는 단독으로 한
                줄 전체를 쓰게 하고, 상태 뱃지들은 그 아래 별도 줄로 뺐어요.
                모바일 좁은 화면에서도 flex-wrap이 걸려서 넘치지 않고 줄바꿈됨. */}
            <SectionHeader
              title="스크리너 통과 종목"
              action="전체 보기"
              href="/search"
            />
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill />
              <WsStatusPill />
              <RefreshUniverseButton />
            </div>
            <p className="text-xs font-medium leading-5 text-[#8b95a1]">
              이동평균·거래량·52주 고저·RSI {SCREENER_TOTAL_RULES}개 공개 지표
              중 {SCREENER_PASS_THRESHOLD}개 이상 충족한 종목이에요. 최근
              기준으로 비중이 높아진 종목을 우선적으로 보여주고, 종목을 누르면
              어떤 조건을 왜 충족했는지 그대로 볼 수 있어요.
            </p>
            <PagedStockList
              emptyText="조건을 충족하는 종목이 없어요."
              screenerOnly
            />
          </div>

          {/* 모바일에서는 이 요약 카드가 전체 종목 리스트보다 먼저 보여야
              스크롤 안 해도 "몇 개 통과했는지"부터 바로 보임 — 예전엔 리스트
              DOM 뒤에 있어서 화면 맨 아래로 밀렸음(피드백으로 발견,
              2026-08-23 세션). 데스크톱(lg:)에서는 원래 의도대로 오른쪽
              사이드바 자리를 유지하도록 order로 되돌림. */}
          <aside className="order-first space-y-5 lg:order-2">
            {/* 참고: 이 숫자는 store에 이미 로드된 전체 목록(stocks, 웹소켓 실시간
                병합 포함)에서 클라이언트가 직접 계산한 값이고, 바로 아래 리스트는
                PagedStockList가 DB의 screenerOk 스냅샷을 페이지 단위로 서버에서
                가져온 값이라 소스가 달라요. 관심종목(실시간 갱신되는 것)은 둘 다
                최신이지만, 그 외 종목은 마지막 배치 시점 기준이라 두 값이 완전히
                일치하지 않을 수 있어요 — 오차가 커지면 통일하는 리팩터링이 필요. */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
              <p className="text-sm font-bold text-[#8b95a1]">스크리너 현황</p>
              <p className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[#191f28]">
                {passed.length}/{stocks.length}
                <span className="ml-1 text-base font-bold text-[#8b95a1]">
                  종목 통과
                </span>
              </p>
              <p className="mt-1 text-xs font-medium text-[#8b95a1]">
                {SCREENER_TOTAL_RULES}개 규칙 중 {SCREENER_PASS_THRESHOLD}개
                이상 충족한 종목 수예요. 수익률 예측이 아니라 공개 지표 충족
                개수입니다.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

export function CategoryScreen() {
  const router = useRouter();
  const sector = useAdvisorStore((s) => s.searchSector);
  const setSector = useAdvisorStore((s) => s.setSearchSector);
  const stocks = useLiveStocks();

  const resultCount = stocks.filter(
    (s) => sector === "전체" || s.sector === sector,
  ).length;

  return (
    <AppShell>
      <TopBar
        title="업종별 종목"
        left={<ChevronLeft />}
        onLeftClick={() => router.back()}
        right={<Search />}
        rightHref="/search"
      />
      <section className="px-5 pb-8 pt-3 lg:max-w-[960px] lg:px-8">
        <HeaderText
          title="업종을 골라볼까요?"
          subtitle="선택한 업종 안에서 스크리너 통과 여부를 바로 확인할 수 있어요."
        />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {categorySectors.map((label) => {
            const Icon = categoryIcons[label];
            const active = sector === label;
            const count = stocks.filter((s) => s.sector === label).length;
            return (
              <button
                className={`relative rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                  active
                    ? "border-[#3182f6] bg-[#f2f7ff]"
                    : "border-[#e5e8eb] bg-white"
                }`}
                key={label}
                onClick={() => setSector(active ? "전체" : label)}
              >
                {active ? (
                  <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#3182f6] text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : null}
                <div
                  className={`grid h-11 w-11 place-items-center rounded-full ${active ? "bg-white" : "bg-[#eaf1fd]"}`}
                >
                  <Icon
                    className={`h-6 w-6 ${active ? "text-[#3182f6]" : "text-[#4e5968]"}`}
                  />
                </div>
                <p className="mt-4 text-base font-bold text-[#191f28]">
                  {label}
                </p>
                <p className="mt-1 text-sm font-medium text-[#8b95a1]">
                  {count}개 종목
                </p>
              </button>
            );
          })}
        </div>

        <SectionTitle title="필터 (준비 중)" />
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {filters.map((filter) => (
            <button
              className="flex h-12 w-full items-center justify-between rounded-lg bg-white px-4 text-[15px] font-semibold text-[#333d4b] ring-1 ring-[#e5e8eb] opacity-60"
              disabled
              key={filter}
            >
              {filter}
              <span className="flex items-center gap-2 text-[#6b7684]">
                전체 <ChevronDown className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>

        <button
          className="mt-6 h-13 w-full rounded-lg bg-[#3182f6] text-base font-bold text-white shadow-[0_8px_20px_rgba(49,130,246,0.22)]"
          onClick={() => router.push("/search")}
        >
          결과 {resultCount}개 보기
        </button>
      </section>
    </AppShell>
  );
}

export function AnalysisScreen() {
  const router = useRouter();
  const { byTicker, total, returnAmount, returnPct } = usePortfolioTotals();

  const bySector: Record<string, number> = {};
  HOLDINGS.forEach((h) => {
    const s = byTicker[h.ticker];
    if (!s) return;
    bySector[s.sector] = (bySector[s.sector] ?? 0) + s.price * h.qty;
  });
  const sectorEntries = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  const donutStyle = buildDonutGradient(sectorEntries, total);

  return (
    <AppShell>
      <TopBar
        title="내 자산"
        left={<ChevronLeft />}
        onLeftClick={() => router.back()}
        right={<Settings />}
      />
      <section className="px-5 pb-8 pt-3 lg:max-w-[960px] lg:px-8">
        <HeaderText
          title="자산 흐름"
          subtitle="예시 보유 종목 기준으로 계산한 평가액과 배분이에요."
        />
        <StatusPill />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="총 평가액"
            value={`${formatKRW(total)}원`}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
          <MetricCard
            label="매입가 대비 손익"
            value={`${returnAmount >= 0 ? "+" : ""}${formatKRW(returnAmount)}원 (${returnPct >= 0 ? "+" : ""}${returnPct}%)`}
            positive={returnAmount >= 0}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb] lg:max-w-[620px]">
          <div>
            <h2 className="text-lg font-bold text-[#191f28]">자산 배분</h2>
            <p className="mt-1 text-sm font-semibold text-[#8b95a1]">
              예시 보유 종목 {HOLDINGS.length}개 기준
            </p>
          </div>
          <div className="mt-6 flex items-center gap-6">
            <div
              className="animate-donut-in grid h-28 w-28 shrink-0 origin-center place-items-center rounded-full"
              style={{ backgroundImage: donutStyle }}
            >
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white">
                <span className="text-xs font-bold text-[#191f28]">100%</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {sectorEntries.map(([sec, value], i) => (
                <Allocation
                  key={sec}
                  label={sec}
                  value={`${total ? Math.round((value / total) * 100) : 0}%`}
                  color={chartColor(i)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <h2 className="text-lg font-bold text-[#191f28]">보유 종목</h2>
          <div className="mt-3 space-y-2">
            {HOLDINGS.map((h) => {
              const s = byTicker[h.ticker];
              if (!s) return null;
              const ret = +(((s.price - h.avgBuy) / h.avgBuy) * 100).toFixed(1);
              return (
                <Link
                  key={h.ticker}
                  href={`/stock/${h.ticker}`}
                  className="flex items-center justify-between rounded-xl bg-[#f7f8fa] px-3 py-2.5"
                >
                  <span className="text-sm font-bold text-[#191f28]">
                    {s.name} · {h.qty}주
                  </span>
                  <span
                    className={`text-sm font-bold ${ret >= 0 ? "text-[#f04452]" : "text-[#3182f6]"}`}
                  >
                    {ret >= 0 ? "+" : ""}
                    {ret}%
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] font-medium leading-5 text-[#8b95a1]">
            실제 계좌와 연동되어 있지 않은 예시 데이터예요. 변동성·최대낙폭 같은
            지표는 시계열 데이터가 없어 정확히 계산할 수 없어 표시하지 않았어요.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

function buildDonutGradient(entries: [string, number][], total: number) {
  if (!total || entries.length === 0) return "conic-gradient(#d1d6db 0 100%)";
  let acc = 0;
  const stops = entries.map(([, value], i) => {
    const from = acc;
    const pct = (value / total) * 100;
    acc += pct;
    return `${chartColor(i)} ${from}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(",")})`;
}

// ---------------------------------------------------------------------------
// BackTopBar: "뒤로가기"(useRouter 필요)만 담당하는 작은 클라이언트 조각.
// 서버 컴포넌트인 page.tsx(예: src/app/history/page.tsx)가 AppShell과 함께
// 직접 조합해서 씁니다. ("시장 소식" 화면은 2026-08-14 세션에 아예
// 제거했습니다 — 목업 데이터만 있던 화면이라 정리했어요.)
// ---------------------------------------------------------------------------
export function BackTopBar({
  title,
  right,
  rightHref,
}: {
  title: string;
  right?: React.ReactNode;
  rightHref?: string;
}) {
  const router = useRouter();
  return (
    <TopBar
      title={title}
      left={<ChevronLeft />}
      onLeftClick={() => router.back()}
      right={right}
      rightHref={rightHref}
    />
  );
}

// MyPageScreen/HistoryScreen 제거됨 (2026-08-14 세션, 서버 컴포넌트 분리
// 확장). 둘 다 실제로는 정적 목업 콘텐츠라 뉴스 화면과 같은 패턴으로
// src/app/mypage/page.tsx, src/app/history/page.tsx(둘 다 서버 컴포넌트)에서
// 직접 조립합니다. `history` 데이터는 src/components/history-content.tsx로
// 옮겼어요.

function HomeHeader() {
  const router = useRouter();
  return (
    <header className="px-5 pb-2 pt-5 lg:px-8 lg:pt-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#3182f6]">전략투자</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="종목 검색"
            className="rounded-full p-2 text-[#333d4b] transition hover:bg-[#f2f4f6] active:scale-[0.95]"
            onClick={() => router.push("/search")}
            type="button"
          >
            <Search className="h-5 w-5" />
          </button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

// 홈 화면에서 제일 먼저 눈에 들어와야 하는 카드라, 나머지 흰 카드들과 구분되게
// 다크 톤으로 분리했어요. 시선이 자연스럽게 여기로 먼저 가고, 그 아래 흰 카드들은
// 옅은 보더만으로 충분히 정돈돼 보입니다.
function PortfolioSummary() {
  const { total, returnAmount, returnPct } = usePortfolioTotals();
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#191f28] p-5 text-white">
      {/* 데스크톱에서 이 카드가 QuickActions(고정폭)를 뺀 나머지 공간을 전부
          차지하다 보니, justify-between으로 양 끝에 내용을 붙이면 가운데가
          휑하게 비어 보였어요. 대신 내용은 왼쪽으로 모으고, 남는 공간엔 은은한
          워터마크 아이콘을 깔아서 "의도된 여백"처럼 보이게 했습니다. */}
      <AreaChart
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -right-8 hidden h-44 w-44 text-white/[0.05] lg:block"
      />
      <div className="relative lg:flex lg:items-end lg:gap-14">
        <div>
          <p className="text-[13px] font-medium text-[#8b95a1]">
            보유 자산 평가액
          </p>
          <p className="mt-1.5 text-[24px] font-extrabold tracking-[-0.03em] text-white">
            {formatKRW(total)}{" "}
            <span className="text-[18px] text-[#c1c9d2]">원</span>
          </p>
          <p
            className={`mt-1 text-sm font-bold ${returnAmount >= 0 ? "text-[#ff6b6b]" : "text-[#85b7eb]"}`}
          >
            매입가 대비 {returnAmount >= 0 ? "+" : ""}
            {formatKRW(returnAmount)}원 ({returnPct >= 0 ? "+" : ""}
            {returnPct}%)
          </p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 lg:mt-0 lg:min-w-[280px] lg:border-t-0 lg:pt-0">
          <SummaryItem label="보유 종목" value={`${HOLDINGS.length}개`} />
          <SummaryItem
            label="매입원가"
            value={`${formatKRW(HOLDINGS.reduce((s, h) => s + h.avgBuy * h.qty, 0) / 10000)}만원`}
          />
          <SummaryItem label="상세" value="자산 탭" link />
        </div>
      </div>
      <Link
        className="relative mt-4 flex h-12 items-center justify-center gap-2 rounded-sm bg-[#3182f6] text-[15px] font-bold text-white active:scale-[0.99] lg:w-[220px]"
        href="/category"
      >
        {/* <Sparkles className="h-4 w-4" /> */}
        업종별 스크리너 보기
      </Link>
    </section>
  );
}

function SummaryItem({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#8b95a1]">{label}</p>
      <p
        className={`mt-1 text-sm font-bold ${link ? "text-[#85b7eb]" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

function QuickActions() {
  return (
    <section className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-3 ring-1 ring-[#e5e8eb] lg:grid-cols-2 lg:gap-2">
      {[
        [AreaChart, "자산", "/analysis"],
        [Star, "추천", "/category"],
        [Bookmark, "관심종목", "/watchlist"],
      ].map(([Icon, label, href]) => {
        const TypedIcon = Icon as IconComponent;
        return (
          <Link
            className="flex flex-col items-center justify-center rounded-xl px-3 py-3 text-center active:scale-[0.98] lg:h-24 lg:justify-center lg:gap-1.5 lg:hover:bg-[#f7f8fa]"
            href={href as string}
            key={label as string}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf1fd] lg:h-10 lg:w-10">
              <TypedIcon className="h-[18px] w-[18px] text-[#3182f6]" />
            </span>
            <p className="mt-2 text-sm font-semibold text-[#333d4b] lg:mt-0">
              {label as string}
            </p>
          </Link>
        );
      })}
    </section>
  );
}

// 종목이 많은 리스트(검색 결과, 스크리너 통과 종목 등)를 react-virtuoso로
// AppShell은 news/page.tsx 같은 서버 컴포넌트 page.tsx에서 직접 import해서,
// 서버에서 렌더링한 children(정적 콘텐츠)을 이 클라이언트 셸 안에 끼워
// 넣는 용도로도 씁니다 (DesktopSidebar/BottomNav가 usePathname을 써서
// 셸 자체는 클라이언트여야 하지만, children으로 전달되는 내용은 각자의
// 렌더링 방식을 그대로 유지해요 — React Server Components의 "서버
// 컴포넌트를 클라이언트 컴포넌트의 children으로 전달" 패턴).
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#e9edf2] text-[#191f28]">
      <div
        className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-[#f7f8fa] shadow-[0_18px_50px_rgba(25,31,40,0.14)] sm:h-[812px] sm:rounded-[24px] sm:border sm:border-[#d1d6db] lg:h-dvh lg:max-w-none lg:flex-row lg:rounded-none lg:border-0 lg:shadow-none"
        data-testid="app-webview"
      >
        <DesktopSidebar />
        <div className="min-h-0 flex-1 overflow-y-auto pb-[72px] lg:pb-0">
          <div className="mx-auto w-full lg:max-w-[1280px]">{children}</div>
        </div>
        <BottomNav />
      </div>
    </main>
  );
}

// react-query(useInfiniteQuery)로 한 번에 20개씩 서버에서 실제로 페이지네이션
// 해오는 리스트입니다. /api/universe/paged가 DB에서 skip/take로 잘라서
// 내려주고, 리스트 끝에 도달하면(IntersectionObserver) 다음 페이지를 진짜
// fetch합니다 — 프론트에서 이미 다 받아놓은 걸 자르는 흉내가 아니라, 스크롤
// 안 하면 뒷부분은 아예 요청조차 안 나가요.
function PagedStockList({
  screenerOnly,
  sector,
  q,
  emptyText,
}: {
  screenerOnly?: boolean;
  sector?: string;
  q?: string;
  emptyText: string;
}) {
  // 정렬 필드를 아무것도 안 고르면(null) "기본 순서"예요. 버튼을 누를 때마다
  // 없음 → 자연방향 → 반대방향 → 없음, 3단으로 순환합니다.
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  function handleSortClick(field: SortField, naturalDirection: SortDirection) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir(naturalDirection);
      return;
    }
    if (sortDir === naturalDirection) {
      setSortDir(naturalDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(null);
  }

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = usePagedStocks({
    screenerOnly,
    sector,
    q,
    sort: sortField,
    dir: sortDir,
  });

  // 리스트 맨 아래 보이지 않는 센서(sentinel)가 화면에 들어오면 자동으로
  // 다음 페이지를 불러옵니다. 참고: 리스트 영역이 화면보다 짧으면(항목이
  // 몇 개 안 남았을 때 등) 센서가 계속 보이는 상태라 스크롤 안 해도 페이지가
  // 연달아 로드될 수 있어요 — 결과적으로 데이터가 틀리진 않지만, 의도한
  // "스크롤해야 더 온다"는 느낌은 덜할 수 있습니다. 그래도 항상 동작하는
  // "더 보기" 버튼을 같이 둬서 옵저버가 안 먹히는 기기에서도 안전하게 했어요.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const pages = data?.pages ?? [];
  // pages 자체가 안 바뀌었으면 flatMap도 다시 안 돌리도록 메모이즈. 그 위에
  // useMergedStocksWithLive가 티커별로 이전 live 참조를 기억해뒀다가 안 바뀐
  // 종목은 같은 객체를 재사용해요 — 그래야 아래 StockRow(React.memo)가 실제로
  // 리렌더를 건너뛸 수 있습니다. (자세한 이유는 live-stock.ts 참고)
  const rawStocks = useMemo(() => pages.flatMap((p) => p.stocks), [pages]);
  const stocks = useMergedStocksWithLive(rawStocks);
  const sectorAvgPer = useSectorAvgPer();
  const sectorAvgPbr = useSectorAvgPbr();
  const total = pages[0]?.total ?? 0;

  // 정렬 선택 칩은 로딩/에러/빈 목록 상태에서도 계속 보여야 다른 정렬로
  // 바로 바꿔볼 수 있어서, 이 아래 상태 분기랑 별개로 항상 렌더링합니다.
  // 버튼 하나가 필드 하나: 안 눌렀으면 화살표 없음(=기본 순서에 영향 없음),
  // 누르면 그 필드의 자연방향 화살표, 한 번 더 누르면 반대방향, 한 번 더
  // 누르면 다시 화살표 없음(기본 순서로 복귀).
  const sortChips = (
    <div className="flex flex-wrap gap-1.5">
      {UNIVERSE_SORT_FIELDS.map((field) => {
        const active = sortField === field.value;
        const shownDirection = active ? sortDir : null;
        return (
          <button
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
              active
                ? "bg-[#191f28] text-white"
                : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
            }`}
            key={field.value}
            onClick={() => handleSortClick(field.value, field.naturalDirection)}
            type="button"
          >
            {field.label}
            {shownDirection === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : shownDirection === "desc" ? (
              <ArrowDown className="h-3 w-3" />
            ) : null}
          </button>
        );
      })}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {sortChips}
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <StockRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        {sortChips}
        <EmptyState text="종목을 불러오지 못했어요." />
      </div>
    );
  }
  if (!stocks.length) {
    return (
      <div className="space-y-3">
        {sortChips}
        <EmptyState text={emptyText} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortChips}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#8b95a1]">
          {stocks.length}/{total}개 표시 중 (한 번에 {UNIVERSE_PAGE_SIZE}개씩)
        </p>
        {stocks.map((s) => (
          <StockRow
            key={s.ticker}
            stock={s}
            sectorAvgPer={sectorAvgPer[s.sector]}
            sectorAvgPbr={sectorAvgPbr[s.sector]}
          />
        ))}
        <div ref={sentinelRef} />
        {isFetchingNextPage ? (
          <LoadingSpinnerRow text={``} />
        ) : hasNextPage ? (
          <button
            className="w-full rounded-lg bg-white py-3 text-sm font-bold text-[#3182f6] ring-1 ring-[#e5e8eb] active:scale-[0.99]"
            onClick={() => fetchNextPage()}
            type="button"
          >
            {UNIVERSE_PAGE_SIZE}개 더 보기
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingSpinnerRow({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-white py-6 ring-1 ring-[#e5e8eb]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#e5e8eb] border-t-[#3182f6]" />
      <span className="text-xs font-semibold text-[#8b95a1]">{text}</span>
    </div>
  );
}

// 종목 리스트 첫 로딩 때, 빈 화면이나 스피너 한 줄 대신 카드 모양 그대로 회색
// 블록으로 채워서 보여줘요. 로딩이 끝나고 실제 StockRow로 바뀔 때 레이아웃이
// 거의 안 튀어서(카드 높이가 같음) 덜 깜빡이는 느낌을 줍니다.
function StockRowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-28 animate-pulse rounded-full bg-[#eef0f2]" />
        <div className="h-3 w-20 animate-pulse rounded-full bg-[#f2f4f6]" />
      </div>
      <div className="shrink-0 space-y-2 text-right">
        <div className="ml-auto h-4 w-16 animate-pulse rounded-full bg-[#eef0f2]" />
        <div className="ml-auto h-3 w-10 animate-pulse rounded-full bg-[#f2f4f6]" />
      </div>
    </div>
  );
}

function DisclaimerBar() {
  return (
    <div className="bg-[#fff4e8] px-5 py-2 text-center text-[11px] font-semibold leading-4 text-[#9a5b00] lg:px-8">
      투자 자문 아님 · &quot;스크리너 통과&quot;는 공개 지표 4개를 기계적으로
      적용한 결과이며 매수·매도 추천이 아니에요
    </div>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[236px] shrink-0 border-r border-[#e5e8eb] bg-white px-4 py-5 lg:flex lg:flex-col">
      <Link className="px-2" href="/notifications">
        <p className="text-sm font-bold text-[#3182f6]">전략투자</p>
        <p className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-[#191f28]">
          Stock Advisor
        </p>
      </Link>

      <nav className="mt-8 space-y-1">
        {navTabs.map((item) => {
          const active =
            pathname === item.href ||
            (pathname === "/history" && item.href === "/category");
          return (
            <Link
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${
                active
                  ? "bg-[#f2f7ff] text-[#3182f6]"
                  : "text-[#4e5968] hover:bg-[#f7f8fa]"
              }`}
              href={item.href}
              key={item.label}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg bg-[#f7f8fa] p-4">
        <p className="text-xs font-bold text-[#8b95a1]">오늘 기준</p>
        <p className="mt-1 text-sm font-semibold text-[#191f28]">
          시장 상태를 반영한 추천 결과입니다.
        </p>
      </div>
    </aside>
  );
}

// TopBar/IconButton은 src/components/ui-primitives.tsx로 옮겼습니다 (서버
// 컴포넌트 분리 확장 — ui-primitives.tsx 상단 주석 참고).

function HeaderText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-[23px] font-extrabold tracking-[-0.03em] text-[#191f28]">
        {title}
      </h1>
      <p className="mt-1 text-sm font-semibold leading-5 text-[#6b7684]">
        {subtitle}
      </p>
    </div>
  );
}

// stock 참조가 안 바뀌면(=이 종목 시세가 이번 틱에 안 바뀌었으면) 리렌더를
// 건너뜁니다. 위쪽 useMergedStocksWithLive/useLiveStocks가 티커별로 참조를
// 안정적으로 유지해주기 때문에 memo가 실제로 의미가 있어요.
//
// 예전엔 signal(buy/sell/hold) 3가지에 각각 다른 색(빨강/파랑/회색)을
// 입혔는데, 그 색이 "빨강=상승/매수, 파랑=하락/매도"라는 이 앱의 등락률
// 색 관례(StockRow의 up ? 빨강 : 파랑)랑 겹쳐서 은연중에 "매수/매도" 방향성을
// 계속 암시하고 있었어요. 라벨을 완전충족/조건충족/보류/주의 4단계로 바꾸면서
// (2026-08-23 세션) 색도 등락 방향과 무관한, 순서만 있는 중립 팔레트로
// 다시 짰습니다 — 인디고(완전충족) > 골드(조건충족) > 회색(보류) > 주황(주의).
// "완전충족"은 처음에 스크리너 통과 배지랑 같은 초록을 썼는데, 같은 카드 안에
// "스크리너 4/4 통과"(초록) 배지랑 나란히 붙어있으면 색이 겹쳐 보인다는
// 피드백으로 골드로 바꿨다가, 완전충족/조건충족끼리 색을 서로 바꿔서 지금은
// 완전충족=인디고, 조건충족=골드예요.
function recommendationStyle(label: string): string {
  switch (label) {
    case "완전충족":
      return "bg-[#eef2ff] text-[#4f46e5]";
    case "조건충족":
      return "bg-[#fef9c3] text-[#a16207]";
    case "주의":
      return "bg-[#fff7ed] text-[#c2410c]";
    default: // 보류
      return "bg-[#f2f4f6] text-[#8b95a1]";
  }
}

function RecommendationBadge({
  stock,
  sectorAvgPer,
  sectorAvgPbr,
  className,
}: {
  stock: Stock;
  sectorAvgPer?: number;
  sectorAvgPbr?: number;
  className?: string;
}) {
  const rec = getRecommendation(stock, sectorAvgPer, sectorAvgPbr);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${recommendationStyle(rec.label)} ${className ?? ""}`}
    >
      {rec.label}
    </span>
  );
}

const StockRow = memo(function StockRow({
  stock,
  sectorAvgPer,
  sectorAvgPbr,
}: {
  stock: Stock;
  sectorAvgPer?: number;
  sectorAvgPbr?: number;
}) {
  const score = screenerScore(stock);
  const pass = score >= SCREENER_PASS_THRESHOLD;
  const up = stock.chg >= 0;
  return (
    <Link
      href={`/stock/${stock.ticker}`}
      className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb] transition active:scale-[0.99] active:bg-[#f7f8fa]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold text-[#191f28]">
            {stock.name}
          </h3>
          <RecommendationBadge
            stock={stock}
            sectorAvgPer={sectorAvgPer}
            sectorAvgPbr={sectorAvgPbr}
          />
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              pass
                ? "bg-[#e6f9f1] text-[#00a878]"
                : "bg-[#f2f4f6] text-[#8b95a1]"
            }`}
          >
            스크리너 {score}/{SCREENER_TOTAL_RULES}
            {pass ? " 통과" : ""}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-medium text-[#8b95a1]">
          {stock.sector} · {stock.ticker} · {stock.cap}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-[#191f28]">
          {formatKRW(stock.price)}
        </p>
        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          <p
            className={`text-xs font-bold ${up ? "text-[#f04452]" : "text-[#3182f6]"}`}
          >
            {up ? "+" : ""}
            {stock.chg}%
          </p>
          <WatchlistHeartIndicator ticker={stock.ticker} />
        </div>
      </div>
    </Link>
  );
});

// 홈/검색 리스트 행에서 관심종목 여부만 보여주는 표시 전용 하트(2026-08-29
// 세션 — 토글 기능은 종목 상세 화면에만 남기고 홈 리스트는 누를 수 없는
// 상태 표시로 바꿈). 버튼이 아니라서 <Link> 안에 그냥 둬도 무효 HTML
// 문제가 없음 — 그래서 StockRow도 다시 통짜 <Link> 하나로 되돌렸어요.
function WatchlistHeartIndicator({ ticker }: { ticker: string }) {
  const watched = useIsWatched(ticker);
  return (
    <Heart
      aria-hidden="true"
      className={`h-[15px] w-[15px] shrink-0 ${watched ? "text-[#f04452]" : "text-[#c3c9d1]"}`}
      fill={watched ? "currentColor" : "none"}
    />
  );
}

// EmptyState/MetricCard/Allocation/SectionHeader/SectionTitle/MenuGrid/
// HistoryMetric은 전부 서버 컴포넌트 분리 작업으로 src/components/
// ui-primitives.tsx로 옮겼습니다 (위 AppShell 주석 참고).

function BottomNav() {
  const pathname = usePathname();

  // grid-cols-4가 아니라 navTabs 개수(지금 3개: 홈/관심/알림)에 맞춘
  // grid-cols-3 — 위 navTabs의 추천/자산 주석을 풀면 여기도 grid-cols-5로
  // 같이 맞춰야 칸이 안 남아요.
  return (
    <nav className="absolute bottom-0 left-0 z-30 grid h-[68px] w-full grid-cols-3 border-t border-[#e5e8eb] bg-white/96 backdrop-blur lg:hidden">
      {navTabs.map((item) => {
        const active =
          pathname === item.href ||
          (pathname === "/history" && item.href === "/category");
        return (
          <Link
            className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              active ? "text-[#3182f6]" : "text-[#8b95a1]"
            }`}
            href={item.href}
            key={item.label}
          >
            {/* Home(house)/AreaChart(chart-area)는 아이콘 안에 path가 2개예요
                — 문/축선 같은 "디테일 선"이 첫 번째, 집/차트 영역을 이루는
                "메인 도형"이 마지막(closed path)입니다. 활성일 때 메인
                도형(마지막 path)만 파란색으로 채우고, 디테일 선(마지막이
                아닌 path)은 상태와 상관없이 항상 고정 회색으로 둬서 파란
                채움 위에서도 안 묻히게 합니다. Star/Heart처럼 path가 1개뿐인
                아이콘은 그 path가 곧 마지막 path라 그대로 채워집니다. */}
            <item.icon
              className={`h-5 w-5 [&>path:not(:last-child)]:stroke-[#8b95a1] ${
                active ? "[&>path:last-child]:fill-[#3182f6]" : ""
              }`}
            />
            {item.label}
            {item.label === "뉴스" ? (
              <span className="absolute right-[27%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f04452] px-1 text-[9px] leading-none text-white">
                3
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 종목별 뉴스 카드 (2026-08-14 세션 추가). /api/news?name=종목명 을 호출해서
// 네이버 뉴스 검색 결과를 보여줍니다. 긍정/부정 배지는 키워드 포함 여부로
// 대충 분류한 거라(진짜 감성분석 아님) 참고만 하시라는 안내 문구를 같이 둡니다.
// 알고리즘(매매 판단)에는 아직 연결 안 함 — 화면 표시 전용.
// ---------------------------------------------------------------------------
const SENTIMENT_STYLE: Record<NewsArticle["sentiment"], string> = {
  positive: "bg-[#fdeeee] text-[#f04452]",
  negative: "bg-[#eef4ff] text-[#3182f6]",
  neutral: "bg-[#f2f4f6] text-[#8b95a1]",
};
const SENTIMENT_LABEL: Record<NewsArticle["sentiment"], string> = {
  positive: "호재 키워드",
  negative: "악재 키워드",
  neutral: "중립",
};
// 정렬 기준: "감성순"은 호재→중립→악재 순으로 먼저 묶고, 같은 그룹 안에서는
// 최신순으로 2차 정렬합니다.
const SENTIMENT_RANK: Record<NewsArticle["sentiment"], number> = {
  positive: 0,
  neutral: 1,
  negative: 2,
};
const NEWS_SORT_OPTIONS = [
  { key: "latest", label: "최신순" },
  { key: "sentiment", label: "호재순" },
] as const;
type NewsSortMode = (typeof NEWS_SORT_OPTIONS)[number]["key"];

// pubDate는 네이버가 RFC 822 형식("Fri, 14 Aug 2026 14:36:00 +0900")으로 줍니다.
// 절대 시각 대신 "10분 전"류 상대 시간으로 보여주고, 일주일 넘게 지난 기사는
// "8월 3일"처럼 날짜로 전환합니다. 렌더링 시점 기준 계산이라(실시간 카운트업
// 아님) 화면을 새로고침해야 값이 갱신돼요.
function formatNewsDate(pubDate: string): string {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return pubDate;
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function sortNewsArticles(
  articles: NewsArticle[],
  mode: NewsSortMode,
): NewsArticle[] {
  const byLatest = (a: NewsArticle, b: NewsArticle) =>
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  if (mode === "sentiment") {
    return [...articles].sort((a, b) => {
      const rankDiff =
        SENTIMENT_RANK[a.sentiment] - SENTIMENT_RANK[b.sentiment];
      return rankDiff !== 0 ? rankDiff : byLatest(a, b);
    });
  }
  return [...articles].sort(byLatest);
}

// 뉴스가 로딩 중일 때 <Suspense fallback>으로 보여주는 스켈레톤. 실제
// 카드(StockNewsCard)랑 바깥 padding/틀이 최대한 비슷해야 로딩→완료 전환이
// 덜 튀어 보여요.
function StockNewsCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <h2 className="text-base font-bold text-[#191f28]">관련 뉴스</h2>
      <p className="mt-3 text-[13px] text-[#8b95a1]">불러오는 중...</p>
    </div>
  );
}

function StockNewsCard({ name }: { name: string }) {
  // useSuspenseQuery는 데이터가 준비될 때까지 이 컴포넌트 렌더링 자체를
  // "중단"하고 가장 가까운 <Suspense fallback>을 대신 보여줍니다. 그래서
  // 여기엔 더 이상 로딩 상태(articles === null)가 없어요 — 이 줄까지
  // 왔다는 건 이미 데이터가 있다는 뜻.
  const { data: articles } = useStockNews(name);
  const [sortMode, setSortMode] = useState<NewsSortMode>("latest");

  const sortedArticles = useMemo(
    () => sortNewsArticles(articles, sortMode),
    [articles, sortMode],
  );

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#191f28]">관련 뉴스</h2>
        {articles.length > 0 ? (
          <div className="flex gap-1">
            {NEWS_SORT_OPTIONS.map((opt) => (
              <button
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  sortMode === opt.key
                    ? "bg-[#191f28] text-white"
                    : "bg-[#f2f4f6] text-[#8b95a1]"
                }`}
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {articles.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#8b95a1]">
          최근 관련 뉴스가 없어요.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {sortedArticles.map((a) => (
            <li key={a.link}>
              <a
                className="block"
                href={a.link}
                rel="noreferrer"
                target="_blank"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${SENTIMENT_STYLE[a.sentiment]}`}
                  >
                    {SENTIMENT_LABEL[a.sentiment]} · {a.eventType}
                  </span>
                  <span className="text-[11px] font-semibold text-[#8b95a1]">
                    {formatNewsDate(a.pubDate)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-5 text-[#191f28]">
                  {a.title}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 주가 라인차트 + MACD — 종목 상세 화면. 둘 다 같은 일봉 데이터(useDailyBars)
// 하나로 그려서 API 호출을 두 번 안 하게 묶었어요. StockNewsCard와 같은
// Suspense 패턴(로딩/에러 처리는 그쪽 주석 참고).
//
// 2026-08-24 세션: MACD는 "5일선 > 20일선" 스크리너 규칙이랑 개념이 겹치는
// 이동평균 교차 지표라, 화면에 매매 판단을 또 하나 얹는 게 아니라 — 지금
// 있는 배지들처럼 완전충족/조건충족 같은 "판정"을 내리지 않고, 계산된 값을
// 차트로 그대로 보여주기만 해요(스스로 해석하시라는 뜻). 투자자 매매동향
// 카드처럼 일/주/월 기간 토글도 고려했는데, MACD는 원래 일봉 기준이 제일
// 흔하고(주봉/월봉 MACD는 그 자체로 봉을 다시 만들어야 하는 별도 계산이라
// 지금 범위 밖) 데이터도 하루 단위로만 있어서 토글 없이 일봉 고정으로
// 갔습니다.
function PriceLineChart({ bars }: { bars: DailyBar[] }) {
  const width = 340;
  const height = 110;
  const padX = 2;
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const xStep = bars.length > 1 ? (width - padX * 2) / (bars.length - 1) : 0;
  const xAt = (i: number) => padX + i * xStep;
  const yAt = (v: number) => height - ((v - min) / range) * (height - 10) - 5;

  const linePath = bars
    .map((b, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(b.close).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${xAt(bars.length - 1).toFixed(1)},${height} L${xAt(0).toFixed(1)},${height} Z`;
  const gradientId = "price-fill-gradient";

  return (
    <svg
      className="mt-2 w-full"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3182f6" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#3182f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="#3182f6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

// 2026-08-31 세션 추가: 일봉(DailyBar)에 원래 volume 필드가 있었는데 화면에
// 안 쓰고 있었어요 — 새 API 호출 없이 이미 받아온 값 그대로 막대만 그림.
function VolumeChart({ bars }: { bars: DailyBar[] }) {
  const width = 340;
  const height = 46;
  const padX = 2;
  const maxVol = Math.max(1, ...bars.map((b) => b.volume));
  const xStep = bars.length > 1 ? (width - padX * 2) / (bars.length - 1) : 0;
  const xAt = (i: number) => padX + i * xStep;
  const barWidth = Math.max(1, xStep * 0.6);

  return (
    <svg
      className="mt-2 w-full"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      {bars.map((b, i) => {
        const barHeight = (b.volume / maxVol) * height;
        const up = i === 0 || b.close >= bars[i - 1].close;
        return (
          <rect
            fill={up ? "#f04452" : "#3182f6"}
            fillOpacity={0.55}
            height={barHeight}
            key={b.date}
            width={barWidth}
            x={xAt(i) - barWidth / 2}
            y={height - barHeight}
          />
        );
      })}
    </svg>
  );
}

function MacdChart({ points }: { points: MacdPoint[] }) {
  const width = 340;
  const height = 90;
  const padX = 2;
  const maxAbs = Math.max(
    1,
    ...points.flatMap((p) => [Math.abs(p.macd), Math.abs(p.signal), Math.abs(p.histogram)]),
  );
  const xStep = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const yMid = height / 2;
  const xAt = (i: number) => padX + i * xStep;
  const yAt = (v: number) => yMid - (v / maxAbs) * (yMid - 6);
  const barWidth = Math.max(1.5, xStep * 0.6);

  function pathFor(getValue: (p: MacdPoint) => number) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(getValue(p)).toFixed(1)}`)
      .join(" ");
  }

  return (
    <svg
      className="mt-2 w-full"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <line stroke="#e5e8eb" strokeWidth={1} x1={padX} x2={width - padX} y1={yMid} y2={yMid} />
      {points.map((p, i) => {
        const y = yAt(p.histogram);
        const barHeight = Math.abs(y - yMid);
        return (
          <rect
            fill={p.histogram >= 0 ? "#f04452" : "#3182f6"}
            height={barHeight}
            key={p.date}
            width={barWidth}
            x={xAt(i) - barWidth / 2}
            y={Math.min(y, yMid)}
          />
        );
      })}
      <path
        d={pathFor((p) => p.macd)}
        fill="none"
        stroke="#3182f6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        d={pathFor((p) => p.signal)}
        fill="none"
        stroke="#a16207"
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

const CHARTS_DISPLAY_DAYS = 60;

function StockChartsCardSkeleton() {
  return (
    <>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
        <h2 className="text-base font-bold text-[#191f28]">주가</h2>
        <p className="mt-3 text-[13px] text-[#8b95a1]">불러오는 중...</p>
      </div>
    </>
  );
}

function StockChartsCard({ ticker }: { ticker: string }) {
  const { data: bars } = useDailyBars(ticker);
  const macdPoints = useMemo(() => computeMacdSeries(bars), [bars]);
  const displayBars = bars.slice(-CHARTS_DISPLAY_DAYS);
  const displayMacd = macdPoints.slice(-CHARTS_DISPLAY_DAYS);

  return (
    <>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#191f28]">주가</h2>
          <span className="text-[11px] font-semibold text-[#8b95a1]">
            최근 {displayBars.length}거래일
          </span>
        </div>
        {displayBars.length < 2 ? (
          <p className="mt-3 text-[13px] text-[#8b95a1]">데이터가 부족해요.</p>
        ) : (
          <>
            <PriceLineChart bars={displayBars} />
            <p className="mt-3 text-[11px] font-semibold text-[#8b95a1]">거래량</p>
            <VolumeChart bars={displayBars} />
          </>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#191f28]">MACD</h2>
          <span className="text-[11px] font-semibold text-[#8b95a1]">12·26·9</span>
        </div>
        {displayMacd.length < 2 ? (
          <p className="mt-3 text-[13px] text-[#8b95a1]">
            데이터가 부족해요. (MACD는 최소 35거래일치 데이터가 필요해요)
          </p>
        ) : (
          <>
            <MacdChart points={displayMacd} />
            <div className="mt-2 flex flex-wrap gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4e5968]">
                <span className="h-2 w-2 rounded-full" style={{ background: "#3182f6" }} />
                MACD선
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4e5968]">
                <span className="h-2 w-2 rounded-full" style={{ background: "#a16207" }} />
                시그널선
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4e5968]">
                <span className="h-2 w-2 rounded-full" style={{ background: "#f04452" }} />
                모멘텀 +
              </span>
            </div>
          </>
        )}
        <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-[11px] leading-5 text-[#8b95a1]">
          단기(12일)·장기(26일) 지수이동평균의 차이(MACD선)와 그 9일
          이동평균(시그널선)이에요. MACD선이 시그널선을 위로 뚫으면 흔히
          "골든크로스", 아래로 뚫으면 "데드크로스"라고 부르지만, 이 화면은
          계산된 값을 그대로 보여줄 뿐 매매 판단을 내리지 않아요.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 업종 내 비교 — 종목 상세 화면 (2026-08-31 세션 추가). 새 API 호출 없이
// 이미 로드된 useLiveStocks()를 업종으로만 필터링해서 씀 — 서버(getUniverse)
// 가 이미 시가총액 내림차순으로 내려주기 때문에(universe.ts) 정렬을 다시
// 안 해도 앞에서부터가 곧 시총 상위. 지금 보고 있는 종목이 업종 시총 5위
// 밖이어도(작은 종목) 비교 대상에서 안 빠지게, 상위 4개 + 현재 종목으로 구성.
// ---------------------------------------------------------------------------
function SectorPeersCard({ stock }: { stock: Stock }) {
  const allStocks = useLiveStocks();
  const peers = useMemo(() => {
    const sectorStocks = allStocks.filter((s) => s.sector === stock.sector);
    const top = sectorStocks.slice(0, 5);
    if (top.some((s) => s.ticker === stock.ticker)) return top;
    const current = sectorStocks.find((s) => s.ticker === stock.ticker);
    return current ? [...top.slice(0, 4), current] : top;
  }, [allStocks, stock.sector, stock.ticker]);

  if (peers.length < 2) return null;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <h2 className="text-base font-bold text-[#191f28]">업종 내 비교</h2>
      <p className="mt-1 text-[11px] font-medium text-[#8b95a1]">
        {stock.sector} 시가총액 상위 종목
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[380px] text-[12px]">
          <thead>
            <tr className="text-left text-[#8b95a1]">
              <th className="py-1.5 font-semibold">종목명</th>
              <th className="py-1.5 text-right font-semibold">시가총액</th>
              <th className="py-1.5 text-right font-semibold">PER</th>
              <th className="py-1.5 text-right font-semibold">PBR</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr
                className={`border-t border-[#f2f4f6] ${
                  p.ticker === stock.ticker ? "bg-[#f2f7ff]" : ""
                }`}
                key={p.ticker}
              >
                <td className="py-1.5 font-semibold text-[#191f28]">
                  {p.name}
                </td>
                <td className="py-1.5 text-right text-[#4e5968]">{p.cap}</td>
                <td className="py-1.5 text-right text-[#4e5968]">
                  {p.per ? `${p.per}배` : "-"}
                </td>
                <td className="py-1.5 text-right text-[#4e5968]">
                  {p.pbr ? `${p.pbr}배` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 재무 정보(연도별 매출/영업이익/순이익 + ROE/부채비율 등) — 종목 상세 화면
// (2026-08-31 세션 추가). StockNewsCard/InvestorTrendCard와 같은 Suspense
// 패턴. use-financials.ts가 완결된 회계연도만 걸러서 주기 때문에(kis.ts
// fetchFinancials 주석 참고 — 진행 중인 연도는 증가율이 왜곡돼서 아예 뺌)
// 여기선 그냥 최근 N개만 자르면 됩니다. 다른 카드들처럼 계산된 숫자만
// 보여주고 "저평가/고평가"·"매수 신호" 같은 해석은 넣지 않습니다.
// ---------------------------------------------------------------------------
const FINANCIALS_DISPLAY_YEARS = 5;

function FinancialsCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <h2 className="text-base font-bold text-[#191f28]">재무 정보</h2>
      <p className="mt-3 text-[13px] text-[#8b95a1]">불러오는 중...</p>
    </div>
  );
}

function FinancialsCard({ ticker }: { ticker: string }) {
  const { data: years } = useFinancials(ticker);
  const recent = useMemo(
    () => years.slice(-FINANCIALS_DISPLAY_YEARS),
    [years],
  );
  const latest = recent[recent.length - 1];

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <h2 className="text-base font-bold text-[#191f28]">재무 정보</h2>

      {recent.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#8b95a1]">데이터가 없어요.</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12px]">
              <thead>
                <tr className="text-left text-[#8b95a1]">
                  <th className="py-1.5 font-semibold">결산연도</th>
                  <th className="py-1.5 text-right font-semibold">매출액</th>
                  <th className="py-1.5 text-right font-semibold">영업이익</th>
                  <th className="py-1.5 text-right font-semibold">순이익</th>
                </tr>
              </thead>
              <tbody>
                {[...recent].reverse().map((y) => (
                  <tr className="border-t border-[#f2f4f6]" key={y.year}>
                    <td className="py-1.5 font-semibold text-[#191f28]">
                      {y.year.slice(0, 4)}
                    </td>
                    <td className="py-1.5 text-right text-[#4e5968]">
                      {y.revenue !== null ? formatMarketCapEok(y.revenue) : "-"}
                    </td>
                    <td className="py-1.5 text-right text-[#4e5968]">
                      {y.operatingProfit !== null
                        ? formatMarketCapEok(y.operatingProfit)
                        : "-"}
                    </td>
                    <td className="py-1.5 text-right text-[#4e5968]">
                      {y.netIncome !== null ? formatMarketCapEok(y.netIncome) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latest ? (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                compact
                label="영업이익률"
                value={latest.opMarginPct !== null ? `${latest.opMarginPct}%` : "-"}
                valueClassName={RESPONSIVE_TEXT.metricValue}
              />
              <MetricCard
                compact
                label="ROE"
                value={latest.roe !== null ? `${latest.roe}%` : "-"}
                valueClassName={RESPONSIVE_TEXT.metricValue}
              />
              <MetricCard
                compact
                label="부채비율"
                value={latest.debtRatio !== null ? `${latest.debtRatio}%` : "-"}
                valueClassName={RESPONSIVE_TEXT.metricValue}
              />
              <MetricCard
                compact
                label="EPS"
                value={latest.eps !== null ? `${formatKRW(latest.eps)}원` : "-"}
                valueClassName={RESPONSIVE_TEXT.metricValue}
              />
            </div>
          ) : null}
        </>
      )}

      <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-[11px] leading-5 text-[#8b95a1]">
        KIS 종목별 재무제표(연간) 기준이에요. 완결된 결산연도까지만
        반영되고, 진행 중인 회계연도는 제외했어요. 이 화면도 계산된 값을
        그대로 보여줄 뿐 매매 판단을 내리지 않아요.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 투자자 매매동향(외국인/기관/개인 순매수 추이) — 종목 상세 화면.
// StockNewsCard와 같은 Suspense 패턴(useSuspenseQuery + <Suspense>)이라
// 로딩/에러 처리는 그쪽 주석 참고. 이 섹션에서만 필요한 건: 기간(일/주/달/연)
// 선택 + 보기 모드(차트/테이블) 선택 — 둘 다 이 컴포넌트의 로컬 state로
// 충분해요(다른 화면으로 안 옮겨가니 useAdvisorStore로 뺄 필요 없음, 새로고침
// 버튼 로딩 상태 때와는 다른 케이스).
// ---------------------------------------------------------------------------
type InvestorViewMode = "chart" | "table";

const INVESTOR_SERIES: {
  label: string;
  color: string;
  value: (p: InvestorTrendPoint) => number;
}[] = [
  { label: "외국인", color: "#4f46e5", value: (p) => p.frgnNetAmount },
  { label: "기관", color: "#00a878", value: (p) => p.orgnNetAmount },
  { label: "개인", color: "#c2410c", value: (p) => p.prsnNetAmount },
];

// 차트/테이블에 한 번에 너무 많은 점을 넣으면 안 보이니, 최근 이만큼만.
const INVESTOR_TREND_DISPLAY_LIMIT = 30;

function InvestorTrendCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <h2 className="text-base font-bold text-[#191f28]">투자자 매매동향</h2>
      <p className="mt-3 text-[13px] text-[#8b95a1]">불러오는 중...</p>
    </div>
  );
}

function InvestorTrendChart({ points }: { points: InvestorTrendPoint[] }) {
  const width = 600;
  const height = 160;
  const padX = 6;
  const padY = 14;
  const maxAbs = Math.max(
    1,
    ...points.flatMap((p) => INVESTOR_SERIES.map((s) => Math.abs(s.value(p)))),
  );
  const xStep =
    points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const yMid = height / 2;
  const xAt = (i: number) => padX + i * xStep;
  const yAt = (v: number) => yMid - (v / maxAbs) * (yMid - padY);

  function pathFor(getValue: (p: InvestorTrendPoint) => number) {
    return points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(getValue(p)).toFixed(1)}`,
      )
      .join(" ");
  }

  return (
    <div className="mt-3">
      <svg
        className="w-full"
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* 0 기준선 — 이 위는 순매수(+), 아래는 순매도(-) */}
        <line
          stroke="#e5e8eb"
          strokeWidth={1}
          x1={padX}
          x2={width - padX}
          y1={yMid}
          y2={yMid}
        />
        {INVESTOR_SERIES.map((s) => (
          <path
            d={pathFor(s.value)}
            fill="none"
            key={s.label}
            stroke={s.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {INVESTOR_SERIES.map((s) => (
          <span
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4e5968]"
            key={s.label}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      {points.length > 0 ? (
        <div className="mt-1 flex justify-between text-[10px] text-[#8b95a1]">
          <span>{points[0].label}</span>
          <span>{points[points.length - 1].label}</span>
        </div>
      ) : null}
    </div>
  );
}

function InvestorTrendTable({ points }: { points: InvestorTrendPoint[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] text-[12px]">
        <thead>
          <tr className="text-left text-[#8b95a1]">
            <th className="py-1.5 font-semibold">기간</th>
            <th className="py-1.5 text-right font-semibold">종가</th>
            {INVESTOR_SERIES.map((s) => (
              <th className="py-1.5 text-right font-semibold" key={s.label}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr className="border-t border-[#f2f4f6]" key={p.key}>
              <td className="py-1.5 font-semibold text-[#191f28]">{p.label}</td>
              <td className="py-1.5 text-right text-[#4e5968]">
                {formatKRW(p.close)}
              </td>
              {INVESTOR_SERIES.map((s) => {
                const v = s.value(p);
                return (
                  <td
                    className={`py-1.5 text-right font-semibold ${v >= 0 ? "text-[#f04452]" : "text-[#3182f6]"}`}
                    key={s.label}
                  >
                    {formatNetAmountEok(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorTrendCard({ ticker }: { ticker: string }) {
  // useSuspenseQuery라 여기 온 시점엔 이미 데이터가 있음(StockNewsCard와 동일).
  const { data: days } = useInvestorTrend(ticker);
  const [period, setPeriod] = useState<InvestorTrendPeriod>("day");
  const [viewMode, setViewMode] = useState<InvestorViewMode>("chart");

  const points = useMemo(
    () =>
      aggregateInvestorTrend(days, period).slice(-INVESTOR_TREND_DISPLAY_LIMIT),
    [days, period],
  );

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#191f28]">투자자 매매동향</h2>
        <div className="flex gap-1">
          {(["chart", "table"] as const).map((mode) => (
            <button
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                viewMode === mode
                  ? "bg-[#191f28] text-white"
                  : "bg-[#f2f4f6] text-[#8b95a1]"
              }`}
              key={mode}
              onClick={() => setViewMode(mode)}
              type="button"
            >
              {mode === "chart" ? "차트" : "테이블"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {INVESTOR_TREND_PERIODS.map((p) => (
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              period === p.value
                ? "bg-[#191f28] text-white"
                : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
            }`}
            key={p.value}
            onClick={() => setPeriod(p.value)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#8b95a1]">데이터가 없어요.</p>
      ) : viewMode === "chart" ? (
        <InvestorTrendChart points={points} />
      ) : (
        <InvestorTrendTable points={points} />
      )}

      <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-[11px] leading-5 text-[#8b95a1]">
        KIS 종목별 투자자매매동향(일별) 기준 순매수 거래대금이에요. 당일
        데이터는 장 종료 후 반영됩니다.
      </p>
    </div>
  );
}

export function StockDetailScreen({ ticker }: { ticker: string }) {
  const router = useRouter();
  const stock = useLiveStock(ticker);
  // stock이 없어도(종목을 못 찾은 경우) 훅 호출 순서는 항상 같아야 해서
  // (React Hooks 규칙) 아래 early return보다 먼저 호출합니다.
  const sectorAvgPer = useSectorAvgPer();
  const sectorAvgPbr = useSectorAvgPbr();
  // 훅 호출 순서를 지키려고 stock 유무와 무관하게 항상 호출(ticker prop
  // 기준이라 stock이 아직 null이어도 문제 없음).
  const heart = useWatchlistHeart(ticker);

  if (!stock) {
    return (
      <AppShell>
        <TopBar
          title="종목 정보"
          left={<ChevronLeft />}
          onLeftClick={() => router.back()}
        />
        <div className="px-5 py-16 text-center text-sm font-semibold text-[#8b95a1]">
          종목을 찾을 수 없어요.
        </div>
      </AppShell>
    );
  }

  const checks = screenerChecks(stock);
  const score = screenerScore(stock);
  const rec = getRecommendation(
    stock,
    sectorAvgPer[stock.sector],
    sectorAvgPbr[stock.sector],
  );
  const up = stock.chg >= 0;

  return (
    <AppShell>
      <TopBar
        title={stock.name}
        left={<ChevronLeft />}
        onLeftClick={() => router.back()}
        right={
          <Heart
            className={`h-5 w-5 ${heart.watched ? "text-[#f04452]" : ""}`}
            fill={heart.watched ? "currentColor" : "none"}
          />
        }
        onRightClick={() => heart.toggle()}
      />
      <section className="space-y-4 px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        <StatusPill />

        <div>
          <p className="text-sm font-bold text-[#8b95a1]">
            {stock.sector} · {stock.ticker}
          </p>
          <p className="mt-1 text-[30px] font-extrabold tracking-[-0.03em] text-[#191f28]">
            {formatKRW(stock.price)}원
          </p>
          <p
            className={`mt-1 text-sm font-bold ${up ? "text-[#f04452]" : "text-[#3182f6]"}`}
          >
            {up ? "▲" : "▼"} {Math.abs(stock.chg)}% 오늘
          </p>
          {heart.error ? (
            <p className="mt-1 text-xs font-semibold text-[#f04452]">
              {heart.error}
            </p>
          ) : null}
        </div>

        <ErrorBoundary
          fallback={(error) => (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
              <h2 className="text-base font-bold text-[#191f28]">주가</h2>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">
                {error.message || "일봉 데이터를 불러오지 못했어요."}
              </p>
            </div>
          )}
          resetKey={stock.ticker}
        >
          <Suspense fallback={<StockChartsCardSkeleton />}>
            <StockChartsCard ticker={stock.ticker} />
          </Suspense>
        </ErrorBoundary>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#191f28]">
              조건 충족 현황
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-sm font-extrabold ${recommendationStyle(rec.label)}`}
            >
              {rec.label}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#4e5968]">
            {rec.reason}
          </p>
          <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-[11px] leading-5 text-[#8b95a1]">
            아래 {SCREENER_TOTAL_RULES}개 공개 지표 조건식과 업종 평균 대비
            PER·PBR만으로 계산한 결과입니다.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#191f28]">
              스크리너 조건 충족 현황
            </h2>
            <span
              className={`text-sm font-extrabold ${score >= SCREENER_PASS_THRESHOLD ? "text-[#00a878]" : "text-[#8b95a1]"}`}
            >
              {score}/{SCREENER_TOTAL_RULES}
            </span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {checks.map((c) => (
              <li
                key={c.label}
                className="flex items-center gap-2.5 text-[13px] leading-5"
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                    c.pass ? "bg-[#e6f9f1]" : "bg-[#f2f4f6]"
                  }`}
                >
                  {c.pass ? (
                    <Check
                      className="h-2.5 w-2.5 text-[#00a878]"
                      strokeWidth={3}
                    />
                  ) : (
                    <span className="h-1 w-1 rounded-full bg-[#c3c9d1]" />
                  )}
                </span>
                <span className={c.pass ? "text-[#333d4b]" : "text-[#8b95a1]"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-[11px] leading-5 text-[#8b95a1]">
            위 {SCREENER_TOTAL_RULES}개 규칙은 전부 공개 지표로 계산됩니다. AI의
            판단이 아니라 조건식 결과이며, {SCREENER_PASS_THRESHOLD}개 이상 충족
            시 홈 화면의 &quot;스크리너 통과&quot;에 노출됩니다.
          </p>
        </div>

        <div
          className={`grid gap-3 ${stock.pbr ? "grid-cols-3" : "grid-cols-2"}`}
        >
          <MetricCard
            compact
            label="시가총액"
            value={stock.cap}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
          <MetricCard
            compact
            label="PER"
            value={`${stock.per}배`}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
          {stock.pbr ? (
            <MetricCard
              compact
              label="PBR"
              value={`${stock.pbr}배`}
              valueClassName={RESPONSIVE_TEXT.metricValue}
            />
          ) : null}
          <MetricCard
            compact
            label="52주 최고"
            value={`${formatKRW(stock.hi)}원`}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
          <MetricCard
            compact
            label="52주 최저"
            value={`${formatKRW(stock.lo)}원`}
            valueClassName={RESPONSIVE_TEXT.metricValue}
          />
        </div>

        <SectorPeersCard stock={stock} />

        <ErrorBoundary
          fallback={(error) => (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
              <h2 className="text-base font-bold text-[#191f28]">재무 정보</h2>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">
                {error.message || "재무 정보를 불러오지 못했어요."}
              </p>
            </div>
          )}
          resetKey={stock.ticker}
        >
          <Suspense fallback={<FinancialsCardSkeleton />}>
            <FinancialsCard ticker={stock.ticker} />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary
          fallback={(error) => (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
              <h2 className="text-base font-bold text-[#191f28]">
                투자자 매매동향
              </h2>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">
                {error.message || "투자자매매동향을 불러오지 못했어요."}
              </p>
            </div>
          )}
          resetKey={stock.ticker}
        >
          <Suspense fallback={<InvestorTrendCardSkeleton />}>
            <InvestorTrendCard ticker={stock.ticker} />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary
          fallback={(error) => (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
              <h2 className="text-base font-bold text-[#191f28]">관련 뉴스</h2>
              <p className="mt-3 text-[13px] leading-5 text-[#8b95a1]">
                {error.message || "뉴스를 불러오지 못했어요."}
              </p>
            </div>
          )}
          resetKey={stock.ticker}
        >
          <Suspense fallback={<StockNewsCardSkeleton />}>
            <StockNewsCard name={stock.name} />
          </Suspense>
        </ErrorBoundary>
      </section>
    </AppShell>
  );
}

export function SearchScreen() {
  const router = useRouter();
  const query = useAdvisorStore((s) => s.searchQuery);
  const sector = useAdvisorStore((s) => s.searchSector);
  const setQuery = useAdvisorStore((s) => s.setSearchQuery);
  const setSector = useAdvisorStore((s) => s.setSearchSector);
  const stocks = useLiveStocks();

  // DB 유니버스는 종목마다 KIS 업종명이 그대로 들어있어서(스크린 디자인 때
  // 쓰던 "반도체/플랫폼/2차전지" 같은 고정 태그와 다를 수 있음) 필터 버튼은
  // 지금 로드된 종목들의 실제 업종명을 그대로 뽑아 씁니다. (이건 이미
  // store에 로드돼있는 전체 목록에서 뽑는 거라 페이지네이션이랑 무관해요.)
  const sectorOptions = [
    "전체",
    ...Array.from(new Set(stocks.map((s) => s.sector))).sort(),
  ];

  // 검색어는 타이핑할 때마다 바로 서버에 쏘면 요청이 너무 잦아지니, 300ms
  // debounce를 걸어서 입력이 잠깐 멈췄을 때만 실제 쿼리(react-query)가
  // 나가도록 합니다. 입력창 자체는 debounce 없이 바로 반응해요.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <AppShell>
      <TopBar
        title="종목 검색"
        left={<ChevronLeft />}
        onLeftClick={() => router.back()}
      />
      <section className="space-y-4 px-5 pb-8 pt-3 lg:max-w-[720px] lg:px-8">
        <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 ring-1 ring-[#e5e8eb]">
          <Search className="h-4 w-4 text-[#8b95a1]" />
          <input
            autoFocus
            className="w-full bg-transparent text-sm font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1]"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 코드 검색"
            value={query}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {sectorOptions.map((sec) => (
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                sector === sec
                  ? "bg-[#191f28] text-white"
                  : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
              }`}
              key={sec}
              onClick={() => setSector(sec)}
            >
              {sec}
            </button>
          ))}
        </div>

        <PagedStockList
          emptyText="일치하는 종목이 없어요."
          q={debouncedQuery}
          sector={sector}
        />
      </section>
    </AppShell>
  );
}

// 관심종목 목록 로딩 중(useWatchlistQuery의 <Suspense> fallback) 보여주는
// 스켈레톤. TopBar는 이 아래(WatchlistScreen)에서 항상 먼저 그려지고, 여기
// 안쪽(검색창~목록)만 로딩 동안 이걸로 대체돼요.
function WatchlistBodySkeleton() {
  return (
    <section className="space-y-4 px-5 pb-8 pt-3 lg:max-w-[720px] lg:px-8">
      <EmptyState text="불러오는 중..." />
    </section>
  );
}

// ---------------------------------------------------------------------------
// "알림" 탭 — 공시 알림 온/오프 설정 (2026-08-31 세션). 값이 하나뿐이라
// react-query 없이 간단히 useState+fetch로 처리 — 낙관적 업데이트는
// useWatchlistHeart(use-watchlist.ts)와 같은 패턴(먼저 바꾸고, 실패하면
// 되돌림)이라 토글이 즉시 반응합니다.
// ---------------------------------------------------------------------------
export function AlertSettingsScreen() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setEnabled(data.enabled);
        else setError(data.message ?? "불러오지 못했어요.");
      })
      .catch(() => setError("서버에 연결할 수 없어요."));
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEnabled(!next);
        setError(data.message ?? "저장하지 못했어요.");
      }
    } catch {
      setEnabled(!next);
      setError("서버에 연결할 수 없어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <TopBar title="알림" left={<ChevronLeft />} onLeftClick={() => router.back()} />
      <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#191f28]">공시 알림</h2>
              <p className="mt-1 text-[13px] leading-5 text-[#8b95a1]">
                관심종목에 새 공시가 등록되면 휴대폰 알림으로 알려드려요.
              </p>
            </div>
            <button
              aria-label={enabled ? "알림 끄기" : "알림 켜기"}
              className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
                enabled ? "bg-[#3182f6]" : "bg-[#e5e8eb]"
              }`}
              disabled={enabled === null || saving}
              onClick={toggle}
              type="button"
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-[13px] font-semibold text-[#f04452]">{error}</p>
          ) : null}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[#8b95a1]">
          휴대폰 자체 알림 권한이 꺼져있으면 이 설정과 무관하게 알림이 안 와요
          — 기기 설정에서도 알림 권한을 확인해주세요.
        </p>
      </section>
    </AppShell>
  );
}

export function WatchlistScreen({
  initialItems,
}: {
  // 서버 컴포넌트(app/watchlist/page.tsx)가 DB에서 직접 읽어서 넘겨주는
  // 초기 목록 — SSR 쿠키 문제 피하려고 씀(use-watchlist.ts 주석 참고).
  initialItems?: WatchlistItem[];
} = {}) {
  const router = useRouter();
  return (
    <AppShell>
      <TopBar
        title="관심종목"
        left={<ChevronLeft />}
        onLeftClick={() => router.back()}
      />
      <ErrorBoundary
        fallback={(error) => (
          <section className="px-5 pb-8 pt-3 lg:max-w-[720px] lg:px-8">
            <EmptyState
              text={error.message || "관심종목을 불러오지 못했어요."}
            />
          </section>
        )}
      >
        <Suspense fallback={<WatchlistBodySkeleton />}>
          <WatchlistBody initialItems={initialItems} />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

// items 로딩(useWatchlistQuery)이 끝난 뒤에만 마운트되는 실제 화면 내용.
// TopBar를 이 컴포넌트 밖(WatchlistScreen)으로 뺀 이유는, useSuspenseQuery가
// 데이터를 기다리는 동안 이 컴포넌트 전체가 <Suspense fallback>으로
// 대체되기 때문 — TopBar까지 이 안에 있으면 로딩 중엔 뒤로가기 버튼도 같이
// 사라져버려요.
function WatchlistBody({ initialItems }: { initialItems?: WatchlistItem[] }) {
  const queryClient = useQueryClient();
  const universeStocks = useLiveStocks();
  const { data: items } = useWatchlistQuery(initialItems);

  const [query, setQuery] = useState("");
  const [busyTicker, setBusyTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(true);
  // 종목 추가 버튼(onMouseDown preventDefault) 때문에 브라우저에 따라 탭해도
  // input이 blur되지 않는 경우가 있어서, 추가가 끝나면 이 ref로 명시적으로
  // blur()를 걸어 드롭다운을 닫고 모바일 키보드도 내려가게 합니다.
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 추가 요청이 서버 왕복하는 동안(POST → 실시간 구독 → refetch) 화면에
  // 아무 반응이 없으면 사용자가 버튼이 안 눌린 줄 알 수 있어서, 낙관적으로
  // 리스트 맨 위에 스켈레톤 카드를 하나 끼워둡니다. Suspense를 다시 태우면
  // WatchlistBody 전체가 깜빡이니까(전체 로딩용 Suspense와는 별개 문제),
  // 이건 그냥 로컬 state로 처리합니다.
  const [pendingAdd, setPendingAdd] = useState<{
    ticker: string;
    name: string;
  } | null>(null);

  const refetchWatchlist = useCallback(
    () => queryClient.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY }),
    [queryClient],
  );

  const watchedTickers = new Set(items.map((i) => i.ticker));

  // 추가 후보는 "지금 유니버스(top 200)에 있고, 아직 관심종목이 아닌" 종목만.
  // stock-advisor-server가 DB Stock 테이블에 없는 종목은 실시간 갱신을 못 해서
  // (RealtimeUpdateService 참고) 유니버스 밖 종목은 애초에 후보에서 뺐어요.
  //
  // 기본값은 스크리너 통과(추천) 종목만 후보로 보여주고, "전체 종목 보기"를
  // 눌러야 200종목 전체가 후보로 나옵니다. 입력창에 아무것도 안 쳤어도
  // focus만 하면 해당 풀의 상위 종목이 최대 20개, 검색어를 치면 그 풀 안에서
  // 이름/코드 일치하는 것만 최대 8개 보여줍니다.
  const trimmedQuery = query.trim();
  // 홈 "종목 검색"(서버 Prisma `contains`)은 MySQL 기본 컬레이션 덕에
  // 대소문자 구분 없이 검색되는데, 여긴 순수 JS .includes()라 원래
  // 대소문자를 구분했음(예: "sk" 쳐도 "SK이노베이션"이 안 걸림) — 두 검색창
  // 동작을 맞추려고 toLowerCase 비교로 통일 (2026-08-22 세션).
  const lowerQuery = trimmedQuery.toLowerCase();
  const notWatched = universeStocks.filter(
    (s) => !watchedTickers.has(s.ticker),
  );
  const recommendedPool = notWatched.filter((s) => passesScreener(s));
  const candidatePool = showAllCandidates ? notWatched : recommendedPool;
  const candidates = trimmedQuery
    ? candidatePool
        .filter(
          (s) =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.ticker.toLowerCase().includes(lowerQuery),
        )
        .slice(0, 8)
    : inputFocused
      ? candidatePool.slice(0, 20)
      : [];

  async function addTicker(ticker: string, name: string) {
    setBusyTicker(ticker);
    setError(null);
    setPendingAdd({ ticker, name });
    try {
      const res = await fetch(`/api/watchlist/${ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "추가에 실패했어요.");
        return;
      }
      setQuery("");
      await refetchWatchlist();
      // 추가 성공 후엔 드롭다운을 닫고 모바일 키보드도 내려가게 함.
      setInputFocused(false);
      searchInputRef.current?.blur();
    } catch {
      setError("서버에 연결할 수 없어요.");
    } finally {
      setBusyTicker(null);
      setPendingAdd(null);
    }
  }

  async function removeTicker(ticker: string) {
    setBusyTicker(ticker);
    try {
      await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
      await refetchWatchlist();
    } finally {
      setBusyTicker(null);
    }
  }

  return (
    <section className="space-y-4 px-5 pb-8 pt-3 lg:max-w-[720px] lg:px-8">
      <div className="flex items-center justify-between">
        <WsStatusPill />
        <p className="text-sm font-bold text-[#8b95a1]">
          {items.length}/{WATCHLIST_LIMIT}개
        </p>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 ring-1 ring-[#e5e8eb]">
          <Search className="h-4 w-4 text-[#8b95a1]" />
          <input
            className="w-full bg-transparent text-sm font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1]"
            onBlur={() => setInputFocused(false)}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setInputFocused(true)}
            placeholder="종목명 또는 코드로 검색, 또는 눌러서 전체 목록 보기"
            ref={searchInputRef}
            value={query}
          />
        </div>
        {candidates.length ? (
          <div className="absolute z-10 mt-1 max-h-72 w-full space-y-1 overflow-y-auto rounded-lg bg-white p-2 shadow-lg ring-1 ring-[#e5e8eb]">
            {candidates.map((s) => (
              <button
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-semibold text-[#191f28] hover:bg-[#f2f4f6] disabled:opacity-50"
                disabled={busyTicker === s.ticker}
                key={s.ticker}
                // input이 blur되기 전에 클릭 이벤트가 씹히지 않도록, mousedown에서
                // 기본 동작(포커스 이동)을 막아둡니다. 이게 없으면 버튼을 누르는
                // 순간 input이 먼저 blur되면서 목록이 사라져 클릭이 안 먹혀요.
                onClick={() => addTicker(s.ticker, s.name)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span>
                  {s.name}{" "}
                  <span className="text-xs font-medium text-[#8b95a1]">
                    {s.ticker}
                  </span>
                </span>
                <span className="text-xs font-bold text-[#3182f6]">추가</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* <div className="flex items-center gap-1.5">
        <button
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            !showAllCandidates
              ? "bg-[#191f28] text-white"
              : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
          }`}
          onClick={() => setShowAllCandidates(false)}
          type="button"
        >
          추천종목만
        </button>
        <button
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            showAllCandidates
              ? "bg-[#191f28] text-white"
              : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
          }`}
          onClick={() => setShowAllCandidates(true)}
          type="button"
        >
          전체 종목
        </button>
      </div> */}

      {error ? (
        <p className="text-xs font-semibold text-[#f04452]">{error}</p>
      ) : null}

      <p className="text-xs font-medium leading-5 text-[#8b95a1]">
        검색창에 아무것도 안 쳐도 "추천종목만"이면 스크리너 통과 종목만, "전체
        종목"이면 유니버스(시가총액 상위 200종목) 전체가 후보로 나와요.
        관심종목은 stock-advisor-server가 KIS 웹소켓으로 실시간 구독해서
        체결가가 올 때마다 화면에 바로 반영되고, 세션 구독 한도 때문에 최대{" "}
        {WATCHLIST_LIMIT}개까지만 담을 수 있어요.
      </p>

      <div className="space-y-2">
        {items.length === 0 && !pendingAdd ? (
          <EmptyState text="아직 관심종목이 없어요. 위에서 검색해서 추가해보세요." />
        ) : (
          <>
            {/* 새로 추가 중인 종목은 아직 items(서버 응답)에 없으니 맨 위에
                낙관적으로 스켈레톤 카드를 하나 끼워둠. refetch가 끝나서
                items에 실제로 들어오면(watchedTickers에 잡히면) 곧바로 숨겨서
                실제 카드랑 잠깐이라도 중복으로 안 보이게 함. */}
            {pendingAdd && !watchedTickers.has(pendingAdd.ticker) ? (
              <WatchlistRowSkeleton
                key={`pending-${pendingAdd.ticker}`}
                name={pendingAdd.name}
                ticker={pendingAdd.ticker}
              />
            ) : null}
            {items.map((item) => (
              <WatchlistRow
                busy={busyTicker === item.ticker}
                item={item}
                key={item.ticker}
                onRemove={removeTicker}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

// 추가 요청이 서버 왕복하는 동안 리스트 맨 위에 낙관적으로 보여주는 카드.
// 이름/코드는 이미 알고 있으니(후보 목록에서 눌렀으니까) 그대로 보여주고,
// 아직 없는 시세/등락률 자리만 회색 펄스로 채워서 "확인 중" 느낌을 줍니다.
function WatchlistRowSkeleton({
  name,
  ticker,
}: {
  name: string;
  ticker: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white p-3 pl-4 ring-1 ring-[#e5e8eb]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold text-[#191f28]">
            {name}
          </h3>
          <span className="shrink-0 text-xs font-medium text-[#8b95a1]">
            {ticker}
          </span>
        </div>
        <div className="mt-2 h-3 w-24 animate-pulse rounded-full bg-[#f2f4f6]" />
      </div>
      <div className="shrink-0 space-y-2 text-right">
        <div className="ml-auto h-4 w-16 animate-pulse rounded-full bg-[#eef0f2]" />
        <div className="ml-auto h-3 w-10 animate-pulse rounded-full bg-[#f2f4f6]" />
      </div>
    </div>
  );
}

function WatchlistRow({
  item,
  busy,
  onRemove,
}: {
  item: WatchlistItem;
  busy: boolean;
  onRemove: (ticker: string) => void;
}) {
  // 유니버스에 있는 종목이면 useLiveStock이 실시간 병합된 값을 줌 — 웹소켓
  // 푸시가 오면 이 컴포넌트도 자동으로 다시 렌더링됨.
  const stock = useLiveStock(item.ticker);

  // 삭제 버튼을 카드 밖에 별도 원형 버튼으로 두면 카드 두 개가 붙어있는
  // 것처럼 어색해 보여서, 카드 하나 안에 이름/시세와 나란히 배치하는
  // 구조로 바꿨습니다. 평소엔 옅은 회색으로 있다가 누르기 전엔 눈에
  // 띄지 않고, hover/press 시에만 빨갛게 반응하는 "고스트" 버튼 스타일.
  if (!stock) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
        <p className="min-w-0 truncate text-sm font-semibold text-[#8b95a1]">
          {item.name ?? item.ticker} · 시세 정보 없음
        </p>
        <DeleteWatchlistButton
          busy={busy}
          onClick={() => onRemove(item.ticker)}
        />
      </div>
    );
  }

  const score = screenerScore(stock);
  const pass = score >= SCREENER_PASS_THRESHOLD;
  const up = stock.chg >= 0;

  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white p-3 pl-4 ring-1 ring-[#e5e8eb] transition active:scale-[0.99]">
      <Link
        aria-disabled={busy}
        className={`min-w-0 flex-1 ${busy ? "pointer-events-none opacity-60" : ""}`}
        href={`/stock/${stock.ticker}`}
        // 삭제 요청이 나간 동안(busy)엔 카드를 눌러도 상세 화면으로 안 가게
        // 막습니다 — pointer-events-none만으로는 키보드/스크린리더 접근이나
        // 혹시 남아있는 클릭 이벤트를 완전히 못 막을 수 있어서 onClick에서도
        // 한 번 더 막아둡니다.
        onClick={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold text-[#191f28]">
            {stock.name}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              pass
                ? "bg-[#e6f9f1] text-[#00a878]"
                : "bg-[#f2f4f6] text-[#8b95a1]"
            }`}
          >
            스크리너 {score}/{SCREENER_TOTAL_RULES}
            {pass ? " 통과" : ""}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-medium text-[#8b95a1]">
          {stock.sector} · {stock.ticker}
        </p>
      </Link>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-[#191f28]">
          {formatKRW(stock.price)}
        </p>
        <p
          className={`text-xs font-bold ${up ? "text-[#f04452]" : "text-[#3182f6]"}`}
        >
          {up ? "+" : ""}
          {stock.chg}%
        </p>
      </div>
      <DeleteWatchlistButton
        busy={busy}
        onClick={() => onRemove(item.ticker)}
      />
    </div>
  );
}

function DeleteWatchlistButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label="관심종목에서 삭제"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#c3c9d1] transition hover:bg-[#fdeeee] hover:text-[#f04452] active:scale-90 disabled:opacity-50"
      disabled={busy}
      onClick={onClick}
    >
      <X className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
