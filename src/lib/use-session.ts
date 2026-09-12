"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// 실제 로그인 세션 조회 (2026-08-18 세션 추가, 2026-08-20 세션에 better-auth로
// 교체). user-menu.tsx, logout-button.tsx 이후로 로그인 상태를 보여줘야
// 하는 화면은 다 이 훅을 쓰면 됩니다. 함수 시그니처(SessionUser,
// SESSION_QUERY_KEY, useSession)는 그대로 유지해서 이 훅을 쓰던 컴포넌트는
// 손 안 대도 되게 했어요 — 내부 구현만 authClient.getSession()으로 교체.
// ---------------------------------------------------------------------------

export type SessionUser = { id: string; email: string; isAdmin: boolean } | null;

async function fetchSession(): Promise<SessionUser> {
  const { data } = await authClient.getSession();
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email, isAdmin: data.user.isAdmin };
}

export const SESSION_QUERY_KEY = ["session"] as const;

// refetchOnWindowFocus는 QueryProvider가 앱 전체 기본값으로 꺼뒀지만(불필요한
// API 재호출 방지), 세션만은 예외로 다시 켭니다(2026-09-13 세션) — 화면을
// 다시 포그라운드로 가져왔을 때(모바일 앱 복귀 포함, 웹뷰가 focus/
// visibilitychange 이벤트를 그대로 쏴줌) 세션이 만료됐는지 바로 알아채야
// session-guard.tsx가 로그인 화면으로 보낼 수 있어요.
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    refetchOnWindowFocus: true,
  });
}
