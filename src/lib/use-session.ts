"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// 로그인 세션 조회 훅(better-auth authClient.getSession()). 로그인 상태가 필요한
// 화면은 이 훅을 쓴다.
// ---------------------------------------------------------------------------

export type SessionUser = { id: string; email: string; isAdmin: boolean } | null;

async function fetchSession(): Promise<SessionUser> {
  const { data } = await authClient.getSession();
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email, isAdmin: data.user.isAdmin };
}

export const SESSION_QUERY_KEY = ["session"] as const;

// refetchOnWindowFocus는 앱 전체 기본값으로 꺼져 있지만 세션만 켠다. 화면 복귀 시
// 만료를 바로 알아야 session-guard.tsx가 로그인 화면으로 보낼 수 있다.
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    refetchOnWindowFocus: true,
  });
}
