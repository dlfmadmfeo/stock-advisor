import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 유저 관리 화면(관리자 전용, 2026-09-13 세션)용 데이터 조합.
//
// "마지막 접속 일시"는 실제로는 추적하고 있지 않아요 — better-auth 세션은
// 슬라이딩 방식이라(만료 임박할 때만 DB row가 갱신됨, session.mjs의
// updateAge 로직 참고) Session.updatedAt이 "최근 활동"을 정확히 반영하지
// 않습니다. 대신 이 유저의 세션 중 가장 최근에 "생성"된 시각(=가장 최근
// 로그인 시각)을 씁니다 — 새 기기/앱 재설치·재로그인 때마다 새 Session row가
// 생기니, 이 값이 실제로 있는 데이터 중 가장 정직한 근사치예요. 그래서
// 화면 라벨도 "마지막 접속"이 아니라 "마지막 로그인"으로 정확히 표기합니다.
// ---------------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  watchlistCount: number;
  deviceCount: number;
  lastLoginAt: Date | null;
};

export async function getAdminUserList(): Promise<AdminUserRow[]> {
  const [users, watchlistGroups, deviceGroups, sessionGroups] = await Promise.all([
    // 관리자를 항상 맨 위에 고정(2026-09-23 세션) — 그다음은 최근 가입순.
    prisma.user.findMany({ orderBy: [{ isAdmin: "desc" }, { createdAt: "desc" }] }),
    prisma.watchlist.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.pushToken.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.session.groupBy({ by: ["userId"], _max: { createdAt: true } }),
  ]);

  const watchlistByUser = new Map(watchlistGroups.map((g) => [g.userId, g._count._all]));
  const deviceByUser = new Map(deviceGroups.map((g) => [g.userId, g._count._all]));
  const lastLoginByUser = new Map(sessionGroups.map((g) => [g.userId, g._max.createdAt]));

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    notificationsEnabled: u.notificationsEnabled,
    createdAt: u.createdAt,
    watchlistCount: watchlistByUser.get(u.id) ?? 0,
    deviceCount: deviceByUser.get(u.id) ?? 0,
    lastLoginAt: lastLoginByUser.get(u.id) ?? null,
  }));
}
