import { Bell, Heart, ShieldCheck, Smartphone, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/mobile-screens";
import { MenuList, SectionTitle, TopBar } from "@/components/ui-primitives";
import { LogoutButton } from "@/components/logout-button";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatKstDate } from "@/lib/format-kst";

// watchlist/alerts와 같은 이유로 로그인 안 했으면 /login으로 보냅니다.
//
// 2026-09-12 세션: 이 화면 전체가 "김투자님"/"kimtuja@example.com"/"VIP"/
// "투자 경력 2년 3개월"/"총 자산 32,450,000원" 같은 완전한 정적 목업이라
// 누가 로그인하든 항상 똑같이 보였어요(사용자 지적으로 발견). 게다가
// "거래내역/입출금/추천이력/보안설정" 메뉴는 이 앱에 애초에 없는
// 기능이고(이 앱은 증권 계좌 연동이 없는 공개 지표 스크리너예요),
// 버튼 자체에 onClick/href도 없어서 눌러도 아무 일도 안 났습니다.
// 실제 세션/DB 값과, 실제로 존재하는 기능(관심종목/알림 설정/개인정보
// 처리방침)으로만 다시 구성했고, 같은 세션에서 시각적으로도 한 번 더
// 다듬었습니다 — 프로필/통계를 카드 하나로 묶고, 메뉴는 라벨 길이에
// 안 흔들리는 세로 리스트로.
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
        {/* 프로필 + 통계를 카드 하나로 묶음 — 예전엔 "누구인지"(아바타/이메일)와
            "내 지표"(관심종목 수 등)가 각각 다른 카드로 떨어져 있어서 한
            화면인데 두 덩어리처럼 보였어요. 안쪽 구분선(border-t)만으로
            나눠서 시각적으로는 하나의 프로필 단위로 읽히게 했습니다. */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e8eb]">
          <div className="flex items-center gap-3 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3182f6] to-[#1b64da] text-sm font-extrabold text-white shadow-md shadow-[#3182f6]/20">
              {namePart[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-[#191f28]">
                {namePart}님
              </h1>
              <p className="mt-0.5 truncate text-[12px] font-medium text-[#8b95a1]">
                {user.email}
              </p>
              {joinedAt ? (
                <span className="mt-1.5 inline-block rounded-full bg-[#f2f4f6] px-2 py-0.5 text-[10px] font-bold text-[#6b7684]">
                  {joinedAt} 가입
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-[#f2f4f6]">
            <div className="border-r border-[#f2f4f6] px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-[#8b95a1]">관심종목</p>
              <p className="mt-1 text-base font-extrabold tracking-[-0.02em] text-[#191f28]">
                {watchlistCount}개
              </p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-[#8b95a1]">공시 알림</p>
              <p
                className={`mt-1 text-base font-extrabold tracking-[-0.02em] ${
                  notificationsOn ? "text-[#3182f6]" : "text-[#8b95a1]"
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
      </section>
    </AppShell>
  );
}
