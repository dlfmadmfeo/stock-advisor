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

export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession });
}
