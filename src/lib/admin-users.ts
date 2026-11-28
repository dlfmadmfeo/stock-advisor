import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 유저 관리 화면(관리자 전용) 데이터 조합.
//
// better-auth 세션은 만료가 가까울 때만 갱신돼 Session.updatedAt이 최근 활동을
// 반영하지 않는다. 그래서 가장 최근에 생성된 세션 시각을 "마지막 로그인"으로 쓴다.
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
    // 관리자를 맨 위에 두고, 그다음은 최근 가입순.
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
