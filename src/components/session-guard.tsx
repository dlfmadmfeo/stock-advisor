"use client";

// ---------------------------------------------------------------------------
// 세션 만료 감지. use-session.ts가 refetchOnWindowFocus로 화면 복귀 때마다 세션을
// 다시 확인하고, 여기서는 "로그인 상태에서 세션이 null이 됨" 전이만 감지해 /login으로
// 보낸다. 처음부터 비로그인인 방문자는 wasLoggedIn이 false라 영향이 없다.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, useSession } from "@/lib/use-session";

// 이 경로들에서는 세션이 없어도 정상 상태라 리다이렉트하지 않음.
const SKIP_PATHS = new Set(["/login", "/signup", "/privacy"]);

// 로그인해야만 볼 수 있는 화면(서버가 비로그인 접속을 /login으로 보내는 곳 +
// 홈). 종목 상세처럼 비로그인도 볼 수 있는 화면은 넣지 않습니다.
const MEMBER_ONLY_PATHS = ["/notifications", "/mypage", "/alerts", "/devices"];

function isMemberOnlyPath(pathname: string): boolean {
  return MEMBER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// 직접 로그아웃할 때도 세션 캐시가 null로 바뀌어 만료와 구분되지 않는다.
// logout-button.tsx가 signOut() 직전에 이 플래그를 세우면, 그 한 번의 전이는
// 만료 안내 없이 넘어간다.
export const intentionalLogout = { current: false };

// window에 심는 필드라 any 대신 최소한의 타입만 덧붙임.
type WindowWithSessionHook = typeof window & { __refetchSession?: () => void };

export function SessionGuard() {
  const { data: session, isFetched } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const wasLoggedIn = useRef(false);

  // Flutter 앱이 포그라운드로 돌아올 때 호출하는 훅. WebView에서는 Activity의
  // pause/resume이 document.visibilityState로 이어지지 않아 refetchOnWindowFocus가
  // 동작하지 않으므로, main.dart가 resume 시 window.__refetchSession()을 실행한다.
  useEffect(() => {
    (window as WindowWithSessionHook).__refetchSession = () => {
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    };
    return () => {
      delete (window as WindowWithSessionHook).__refetchSession;
    };
  }, [queryClient]);

  // 세션 조회 외의 API 호출에서도 만료를 바로 감지하기 위해 fetch를 감싸, 우리
  // API(/api/...)가 401을 주면 세션을 다시 확인한다. /api/auth/*의 401(비밀번호 오류
  // 등)은 만료가 아니므로 제외한다. 리다이렉트는 아래 useEffect가 wasLoggedIn이
  // true일 때만 하므로 비로그인 방문자의 401에는 영향이 없다.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : (input as Request).url;
        const path = new URL(url, window.location.origin).pathname;
        if (response.status === 401 && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
          queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
        }
      } catch {
        // URL 파싱 실패 등은 무시 — 원래 응답은 그대로 반환.
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isFetched) return;

    if (session) {
      wasLoggedIn.current = true;
      return;
    }

    if (intentionalLogout.current) {
      intentionalLogout.current = false;
      wasLoggedIn.current = false;
      return;
    }

    if (wasLoggedIn.current && !SKIP_PATHS.has(pathname)) {
      wasLoggedIn.current = false;
      router.push("/login?expired=1");
      return;
    }

    // 로그아웃 뒤 뒤로가기로 회원 전용 화면이 기록·캐시에서 복원된 경우. 서버가
    // 로그인 여부를 다시 확인하지 않으므로 여기서 로그인 화면으로 replace한다.
    if (isMemberOnlyPath(pathname)) {
      router.replace("/login");
    }
  }, [session, isFetched, pathname, router]);

  return null;
}
