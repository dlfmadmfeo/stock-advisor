import {
  Bell,
  Bookmark,
  BriefcaseBusiness,
  ChevronRight,
  Heart,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/mobile-screens";
import { MenuGrid, MetricCard, SectionTitle, TopBar } from "@/components/ui-primitives";
import { LogoutButton } from "@/components/logout-button";

// ---------------------------------------------------------------------------
// 서버 컴포넌트 분리 확장 (2026-08-14 세션). 전부 정적 목업 콘텐츠라
// "use client" 없이 서버에서 렌더링합니다. TopBar에 onLeftClick이 없어서
// (이 화면은 하단 탭에서 바로 진입하는 최상위 화면이라 뒤로가기 버튼 자체가
// 없음) BackTopBar(클라이언트)도 필요 없이 TopBar를 직접 씁니다.
// ---------------------------------------------------------------------------
export default function MyPagePage() {
  return (
    <AppShell>
      <TopBar right={<Settings />} title="마이" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[960px] lg:px-8">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-[#f2f7ff]">
              <UserRound className="h-8 w-8 text-[#3182f6]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#191f28]">
                  김투자님
                </h1>
                <span className="rounded-full bg-[#191f28] px-2.5 py-1 text-xs font-bold text-white">
                  VIP
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-[#6b7684]">
                투자 경력 2년 3개월
              </p>
              <p className="text-sm font-medium text-[#6b7684]">
                kimtuja@example.com
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-[#8b95a1]" />
          </div>
        </div>

        <SectionTitle action="자세히" title="포트폴리오 요약" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="총 자산" value="32,450,000원" />
          <MetricCard label="평가 손익" positive value="+2,530,000원" />
          <MetricCard label="보유 종목" value="24개" />
          <MetricCard label="현금 비중" value="12.5%" />
        </div>

        <SectionTitle title="자주 쓰는 메뉴" />
        <MenuGrid
          items={[
            [WalletCards, "거래 내역"],
            [BriefcaseBusiness, "입출금"],
            [Bookmark, "추천 이력"],
            [Heart, "관심 종목"],
            [Bell, "알림 설정"],
            [ShieldCheck, "보안 설정"],
          ]}
        />

        <LogoutButton />
      </section>
    </AppShell>
  );
}
