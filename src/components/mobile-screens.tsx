"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AreaChart,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Cpu,
  Heart,
  Home,
  Newspaper,
  Search,
  Settings,
  ArrowDown,
  ArrowUp,
  Sparkles,
  Sprout,
  Star,
  X,
} from "lucide-react";
import { HOLDINGS, formatKRW, type Stock } from "@/lib/stocks";
import type { NewsArticle } from "@/lib/naver-news";
import { CompactNewsRow, newsItems } from "@/components/news-content";
import { UserMenu } from "@/components/user-menu";
import { ErrorBoundary } from "@/components/error-boundary";
import { useStockNews } from "@/lib/use-stock-news";
import { useWatchlistQuery, WATCHLIST_QUERY_KEY, type WatchlistItem } from "@/lib/use-watchlist";
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
  type RecommendationSignal,
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

const navTabs = [
  { href: "/notifications", icon: Home, label: "홈" },
  { href: "/category", icon: Star, label: "추천" },
  { href: "/watchlist", icon: Heart, label: "관심" },
  { href: "/analysis", icon: AreaChart, label: "자산" },
  { href: "/news", icon: Newspaper, label: "뉴스" },
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <PortfolioSummary />
          {/* <QuickActions /> */}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="space-y-3">
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

          <aside className="space-y-5">
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

            <div className="space-y-3">
              {/* <SectionHeader title="시장 소식" action="더 보기" href="/news" /> */}
              <div className="space-y-2">
                {newsItems.slice(0, 3).map((item) => (
                  <CompactNewsRow item={item} key={item.title} />
                ))}
              </div>
            </div>
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
          <MetricCard label="총 평가액" value={`${formatKRW(total)}원`} />
          <MetricCard
            label="매입가 대비 손익"
            value={`${returnAmount >= 0 ? "+" : ""}${formatKRW(returnAmount)}원 (${returnPct >= 0 ? "+" : ""}${returnPct}%)`}
            positive={returnAmount >= 0}
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
// 2026-08-14 세션: 서버 컴포넌트 분리 파일럿으로 NewsScreen을 제거했습니다.
// "시장 소식" 화면(/news)은 이제 src/app/news/page.tsx(서버 컴포넌트)가
// AppShell + BackTopBar(아래, 뒤로가기 버튼만 담당하는 작은 클라이언트
// 조각) + NewsContent(src/components/news-content.tsx, 서버 컴포넌트)를
// 직접 조합해서 렌더링합니다. 화면 내용 자체는 이제 클라이언트 JS로 안
// 내려가요 — 상세한 이유는 news-content.tsx 상단 주석 참고.
//
// BackTopBar는 "뒤로가기"(useRouter 필요)만 담당하는 범용 조각이라, 다른
// 화면을 같은 방식으로 서버 컴포넌트화할 때도 재사용할 수 있습니다.
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
  return (
    <header className="px-5 pb-2 pt-5 lg:px-8 lg:pt-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#3182f6]">전략투자</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        [Newspaper, "뉴스", "/news"],
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
const RECOMMENDATION_STYLE: Record<RecommendationSignal, string> = {
  buy: "bg-[#fdecec] text-[#f04452]",
  sell: "bg-[#eaf1fd] text-[#3182f6]",
  hold: "bg-[#f2f4f6] text-[#8b95a1]",
};

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
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${RECOMMENDATION_STYLE[rec.signal]} ${className ?? ""}`}
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
          {stock.sector} · {stock.ticker}
        </p>
      </div>
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
    </Link>
  );
});

// EmptyState/MetricCard/Allocation/SectionHeader/SectionTitle/MenuGrid/
// HistoryMetric/NewsRow/thumbnailStyle은 전부 서버 컴포넌트 분리 작업으로
// src/components/ui-primitives.tsx, src/components/news-content.tsx로
// 옮겼습니다 (위 AppShell 주석 참고). CompactNewsRow는 홈 화면
// (NotificationsScreen, 클라이언트)에서 계속 쓰여서 news-content.tsx에서
// import해왔습니다.

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="absolute bottom-0 left-0 z-30 grid h-[68px] w-full grid-cols-5 border-t border-[#e5e8eb] bg-white/96 backdrop-blur lg:hidden">
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
            <item.icon className="h-5 w-5" />
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

export function StockDetailScreen({ ticker }: { ticker: string }) {
  const router = useRouter();
  const stock = useLiveStock(ticker);
  // stock이 없어도(종목을 못 찾은 경우) 훅 호출 순서는 항상 같아야 해서
  // (React Hooks 규칙) 아래 early return보다 먼저 호출합니다.
  const sectorAvgPer = useSectorAvgPer();
  const sectorAvgPbr = useSectorAvgPbr();

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
        </div>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#191f28]">매매 판단</h2>
            <span
              className={`rounded-full px-3 py-1 text-sm font-extrabold ${RECOMMENDATION_STYLE[rec.signal]}`}
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
          <MetricCard label="시가총액" value={stock.cap} />
          <MetricCard label="PER" value={`${stock.per}배`} />
          {stock.pbr ? (
            <MetricCard label="PBR" value={`${stock.pbr}배`} />
          ) : null}
          <MetricCard label="52주 최고" value={`${formatKRW(stock.hi)}원`} />
          <MetricCard label="52주 최저" value={`${formatKRW(stock.lo)}원`} />
        </div>

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

export function WatchlistScreen() {
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
            <EmptyState text={error.message || "관심종목을 불러오지 못했어요."} />
          </section>
        )}
      >
        <Suspense fallback={<WatchlistBodySkeleton />}>
          <WatchlistBody />
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
function WatchlistBody() {
  const queryClient = useQueryClient();
  const universeStocks = useLiveStocks();
  const { data: items } = useWatchlistQuery();

  const [query, setQuery] = useState("");
  const [busyTicker, setBusyTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

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
  const notWatched = universeStocks.filter(
    (s) => !watchedTickers.has(s.ticker),
  );
  const recommendedPool = notWatched.filter((s) => passesScreener(s));
  const candidatePool = showAllCandidates ? notWatched : recommendedPool;
  const candidates = trimmedQuery
    ? candidatePool
        .filter(
          (s) =>
            s.name.includes(trimmedQuery) || s.ticker.includes(trimmedQuery),
        )
        .slice(0, 8)
    : inputFocused
      ? candidatePool.slice(0, 20)
      : [];

  async function addTicker(ticker: string) {
    setBusyTicker(ticker);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "추가에 실패했어요.");
        return;
      }
      setQuery("");
      await refetchWatchlist();
    } catch {
      setError("서버에 연결할 수 없어요.");
    } finally {
      setBusyTicker(null);
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
                  onClick={() => addTicker(s.ticker)}
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

        <div className="flex items-center gap-1.5">
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
        </div>

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
          {items.length === 0 ? (
            <EmptyState text="아직 관심종목이 없어요. 위에서 검색해서 추가해보세요." />
          ) : (
            items.map((item) => (
              <WatchlistRow
                busy={busyTicker === item.ticker}
                item={item}
                key={item.ticker}
                onRemove={removeTicker}
              />
            ))
          )}
        </div>
    </section>
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
      <Link className="min-w-0 flex-1" href={`/stock/${stock.ticker}`}>
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
