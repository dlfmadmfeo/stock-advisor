import { Bell, Heart, ShieldCheck, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/mobile-screens";
import { MenuList, SectionTitle, TopBar } from "@/components/ui-primitives";
import { LogoutButton } from "@/components/logout-button";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatKstDate } from "@/lib/format-kst";
import { accountDeletionBlockReason } from "@/lib/account-deletion";

// 비로그인이면 /login으로 보낸다(watchlist·alerts와 동일).
// 프로필과 통계는 실제 세션·DB 값으로 보여주고, 메뉴는 앱에 있는 기능
// (관심종목, 알림 설정, 개인정보처리방침)만 둔다.
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

  const joinedAt = dbUser?.createdAt ? formatKstDate(dbUser.createdAt) : null;
  const notificationsOn = dbUser?.notificationsEnabled ?? true;
  const namePart = user.email.split("@")[0];

  return (
    <AppShell>
      <TopBar title="마이페이지" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        {/* 프로필과 통계를 카드 하나로 묶고, 안쪽 구분선으로만 나눈다. */}
        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-[#e5e8eb]">
          <div className="flex items-center gap-3 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-bold text-white">
              {namePart[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16px] font-bold tracking-[-0.02em] text-[#191f28]">
                {namePart}님
              </h1>
              <p className="mt-0.5 truncate text-[12px] font-medium text-[#6b7684]">
                {user.email}
              </p>
              {joinedAt ? (
                <p className="mt-0.5 text-[12px] text-[#6b7684]">
                  {joinedAt} 가입
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-[#f2f4f6]">
            <div className="border-r border-[#f2f4f6] px-4 py-3 text-center">
              <p className="text-[12px] text-[#6b7684]">관심종목</p>
              <p className="mt-1 text-base font-bold tracking-[-0.02em] text-[#191f28]">
                {watchlistCount}개
              </p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-[12px] text-[#6b7684]">공시 알림</p>
              <p
                className={`mt-1 text-base font-bold tracking-[-0.02em] ${
                  notificationsOn ? "text-[var(--brand)]" : "text-[#6b7684]"
                }`}
              >
                {notificationsOn ? "켜짐" : "꺼짐"}
              </p>
            </div>
          </div>
        </div>

        <SectionTitle title="메뉴" />
        <MenuList
          items={[
            [Heart, "관심종목", "/watchlist"],
            [Bell, "알림 설정", "/alerts"],
            [Smartphone, "활성 기기", "/devices"],
            [ShieldCheck, "개인정보처리방침", "/privacy"],
            // 관리자에게만 보이는 항목 — 일반 유저는 이 메뉴 자체가 존재하는지도
            // 몰라도 되는 내부 도구라서(admin/users/page.tsx 상단 주석 참고),
            // AI 추천 탭처럼 "권한 없음" 안내 대신 아예 항목을 안 보여줌.
            ...(user.isAdmin
              ? ([[Users, "유저 관리", "/admin/users"]] as Array<[typeof Users, string, string]>)
              : []),
          ]}
        />

        <LogoutButton />

        {/* 회원 탈퇴: 로그아웃 버튼과 구분되는 텍스트 링크. 탈퇴가 막힌 계정(데모·관리자)에는 숨긴다. */}
        {accountDeletionBlockReason(user) ? null : (
          <div className="mt-5 text-center">
            <Link className="text-[12px] font-semibold text-[#6b7684] underline" href="/mypage/delete">
              회원 탈퇴
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
