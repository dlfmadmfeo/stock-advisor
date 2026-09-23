"use client";

// ---------------------------------------------------------------------------
// 세션 만료 감지 (2026-09-13 세션). "세션은 30일인데, 만료되고 나서 화면
// 액션을 하거나 모바일 앱을 다시 포그라운드로 가져왔을 때 로그아웃된 상태를
// 표시하면서 로그인 화면으로 보내고 싶다"는 요청으로 추가.
//
// use-session.ts가 refetchOnWindowFocus: true로 바뀌어서, 화면을 다시
// 활성화할 때마다(모바일 앱 복귀 포함 — 웹뷰가 포커스/visibilitychange
// 이벤트를 그대로 쏴줌) 세션을 다시 확인합니다. 여기서는 "로그인해 있다가
// 갑자기 세션이 null이 됨"이라는 전이만 감지해서 /login으로 보내요 — 원래
// 비로그인 상태로 홈 화면을 구경하는 손님은 wasLoggedIn이 계속 false라
// 아무 영향 없습니다.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, useSession } from "@/lib/use-session";

// 이 경로들에서는 세션이 없어도 정상 상태라 리다이렉트하지 않음.
const SKIP_PATHS = new Set(["/login", "/signup", "/privacy"]);

// 2026-09-13 세션: "직접 로그아웃했는데도 세션 만료 문구가 뜬다"는 제보로
// 추가. logout-button.tsx가 authClient.signOut() 성공 직후 세션 쿼리
// 캐시를 null로 직접 밀어넣는데(react-query 캐시 갱신), 이 훅 입장에선
// "로그인해 있다가 세션이 null이 됨"이라는 전이가 실제 만료 때와 완전히
// 똑같이 보여서 구분을 못 했어요. logout-button.tsx가 signOut() 호출 직전에
// 이 플래그를 true로 세워두면, 여기서 그 한 번의 null 전이만 만료 안내 없이
// 조용히 넘어갑니다.
export const intentionalLogout = { current: false };

// window에 심는 필드라 any 대신 최소한의 타입만 덧붙임.
type WindowWithSessionHook = typeof window & { __refetchSession?: () => void };

export function SessionGuard() {
  const { data: session, isFetched } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const wasLoggedIn = useRef(false);

  // Flutter 앱(stock_advisor_app)이 백그라운드에서 포그라운드로 돌아올 때
  // 호출할 훅. WebView 안에 통째로 얹힌 웹페이지라 안드로이드 Activity의
  // pause/resume이 이 페이지의 document.visibilityState 변화로 자동
  // 이어지지 않아서(2026-09-13 세션, "5분 지나도 로그아웃 안 된다" 제보로
  // 발견), refetchOnWindowFocus만으로는 세션 재확인이 트리거 안 됐어요.
  // Flutter 쪽 main.dart의 didChangeAppLifecycleState가 앱 resume 시
  // window.__refetchSession()을 직접 실행해서 우회합니다.
  useEffect(() => {
    (window as WindowWithSessionHook).__refetchSession = () => {
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    };
    return () => {
      delete (window as WindowWithSessionHook).__refetchSession;
    };
  }, [queryClient]);

  // 2026-09-23 세션: "세션 만료 후에 아무 서버 호출이나 하면 그때 바로
  // 감지 안 되냐"는 요청 — 지금까진 세션 조회(useSession) 재확인이 일어날
  // 때만(창 포커스, 앱 복귀) 만료를 알아챘는데, 그 사이에 다른 API(관심종목
  // 토글 등)를 호출하면 401을 받고도 조용히 실패할 뿐이었음. fetch를
  // 감싸서 우리 API(/api/...)가 401을 주면 세션을 바로 재확인시킴 —
  // /api/auth/*(로그인/회원가입 자체의 401, 예: 비밀번호 틀림)는 세션
  // 만료가 아니라 정상적인 실패라 제외. 실제 만료가 맞을 때만 아래
  // useEffect의 기존 로직(wasLoggedIn이 true였을 때만 리다이렉트)이
  // 작동하므로, 비로그인 손님의 401은 여기서 걸려도 아무 일 안 일어남.
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
    }
  }, [session, isFetched, pathname, router]);

  return null;
}
