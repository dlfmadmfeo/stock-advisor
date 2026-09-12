import { Bell, Heart, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/mobile-screens";
import { MenuGrid, MetricCard, SectionTitle, TopBar } from "@/components/ui-primitives";
import { LogoutButton } from "@/components/logout-button";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// watchlist/alerts와 같은 이유로 로그인 안 했으면 /login으로 보냅니다.
//
// 2026-09-12 세션: 이 화면 전체가 "김투자님"/"kimtuja@example.com"/"VIP"/
// "투자 경력 2년 3개월"/"총 자산 32,450,000원" 같은 완전한 정적 목업이라
// 누가 로그인하든 항상 똑같이 보였어요(사용자 지적으로 발견). 게다가
// "거래내역/입출금/추천이력/보안설정" 메뉴는 이 앱에 애초에 없는
// 기능이고(이 앱은 증권 계좌 연동이 없는 공개 지표 스크리너예요),
// 버튼 자체에 onClick/href도 없어서 눌러도 아무 일도 안 났습니다.
// 실제 세션/DB 값과, 실제로 존재하는 기능(관심종목/알림 설정/개인정보
// 처리방침)으로만 다시 구성했습니다.
export default async function MyPagePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [watchlistCount, dbUser] = await Promise.all([
    prisma.watchlist.count({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { createdAt: true, notificationsEnabled: true },
    }),
  ]);

  const joinedAt = dbUser?.createdAt
    ? `${dbUser.createdAt.getFullYear()}.${String(dbUser.createdAt.getMonth() + 1).padStart(2, "0")}.${String(dbUser.createdAt.getDate()).padStart(2, "0")}`
    : null;

  return (
    <AppShell>
      <TopBar title="마이" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[960px] lg:px-8">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#f2f7ff]">
              <UserRound className="h-8 w-8 text-[#3182f6]" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-[#191f28]">
                {user.email.split("@")[0]}님
              </h1>
              <p className="truncate text-sm font-medium text-[#6b7684]">
                {user.email}
              </p>
              {joinedAt ? (
                <p className="text-sm font-medium text-[#6b7684]">
                  {joinedAt} 가입
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <SectionTitle title="내 정보" />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="관심종목" value={`${watchlistCount}개`} />
          <MetricCard
            label="공시 알림"
            value={dbUser?.notificationsEnabled ?? true ? "켜짐" : "꺼짐"}
          />
        </div>

        <SectionTitle title="메뉴" />
        <MenuGrid
          items={[
            [Heart, "관심종목", "/watchlist"],
            [Bell, "알림 설정", "/alerts"],
            [ShieldCheck, "개인정보처리방침", "/privacy"],
          ]}
        />

        <LogoutButton />
      </section>
    </AppShell>
  );
}
