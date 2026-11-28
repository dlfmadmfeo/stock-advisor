"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/use-session";
import { RETURNING_USER_COOKIE } from "@/lib/returning-user-mark";

// ---------------------------------------------------------------------------
// 공시 푸시를 눌러 들어온 경우(?from=push) 로그아웃 상태면 로그인 화면으로 보낸다.
// 서버에서 searchParams·쿠키를 읽으면 종목 페이지의 ISR이 꺼지므로 브라우저에서 확인한다.
// 재방문 마커(sa_returning)가 있으면 세션 만료(?expired=1), 없으면 직접 로그아웃한
// 상태(?loggedout=1)로 안내한다.
// ---------------------------------------------------------------------------

function Gate() {
  const router = useRouter();
  const from = useSearchParams().get("from");
  const { data: session, isFetched } = useSession();

  useEffect(() => {
    if (from !== "push" || !isFetched || session) return;
    const wasLoggedIn = document.cookie
      .split("; ")
      .includes(`${RETURNING_USER_COOKIE}=1`);
    router.replace(wasLoggedIn ? "/login?expired=1" : "/login?loggedout=1");
  }, [from, isFetched, session, router]);

  return null;
}

export function PushLoginGate() {
  // useSearchParams는 Suspense 안에 둬야 페이지 전체가 동적 렌더링으로 바뀌지 않아요.
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
