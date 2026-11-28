import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { EmptyState } from "@/components/ui-primitives";
import { getSessionUser } from "@/lib/auth";
import { getAdminUserList } from "@/lib/admin-users";
import { formatKstDateTime } from "@/lib/format-kst";

// 관리자 전용 유저 목록. 내부 도구라 하단 nav에 넣지 않고 관리자에게만 마이페이지
// 메뉴로 노출하며, 권한이 없으면 리다이렉트한다.
function formatDateTime(d: Date | null): string {
  return d ? formatKstDateTime(d) : "-";
}

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isAdmin) {
    redirect("/mypage");
  }

  const users = await getAdminUserList();

  return (
    <AppShell>
      <BackTopBar title="유저 관리" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        <p className="mb-3 text-xs font-semibold text-[#6b7684]">
          가입한 유저 {users.length}명. &quot;마지막 로그인&quot;은 실시간 활동이 아니라
          가장 최근에 새로 로그인한 시각이에요.
        </p>

        {users.length === 0 ? (
          <EmptyState text="가입한 유저가 없어요." />
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div className="rounded-lg bg-white p-4 ring-1 ring-[#e5e8eb]" key={u.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#191f28]">{u.email}</p>
                    <p className="mt-0.5 truncate text-[12px] font-medium text-[#6b7684]">
                      {u.name}
                    </p>
                  </div>
                  {u.isAdmin ? (
                    <span className="shrink-0 text-xs font-medium text-[var(--brand)]">
                      관리자
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-y-2 border-t border-[#f2f4f6] pt-3 text-[12px]">
                  <div>
                    <span className="text-[#6b7684]">가입일</span>
                    <p className="mt-0.5 font-semibold text-[#191f28]">
                      {formatDateTime(u.createdAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b7684]">마지막 로그인</span>
                    <p className="mt-0.5 font-semibold text-[#191f28]">
                      {formatDateTime(u.lastLoginAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b7684]">관심종목</span>
                    <p className="mt-0.5 font-semibold text-[#191f28]">{u.watchlistCount}개</p>
                  </div>
                  <div>
                    <span className="text-[#6b7684]">공시 알림 / 등록 기기</span>
                    <p className="mt-0.5 font-semibold text-[#191f28]">
                      {u.notificationsEnabled ? "켜짐" : "꺼짐"} · {u.deviceCount}대
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
