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
import { useSession } from "@/lib/use-session";

// 이 경로들에서는 세션이 없어도 정상 상태라 리다이렉트하지 않음.
const SKIP_PATHS = new Set(["/login", "/signup", "/privacy"]);

export function SessionGuard() {
  const { data: session, isFetched } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const wasLoggedIn = useRef(false);

  useEffect(() => {
    if (!isFetched) return;

    if (session) {
      wasLoggedIn.current = true;
      return;
    }

    if (wasLoggedIn.current && !SKIP_PATHS.has(pathname)) {
      wasLoggedIn.current = false;
      router.push("/login?expired=1");
    }
  }, [session, isFetched, pathname, router]);

  return null;
}
