"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/use-session";
import { RETURNING_USER_COOKIE } from "@/lib/returning-user-mark";

// ---------------------------------------------------------------------------
// 공시 푸시 알림을 눌러서 들어온 경우(Flutter 앱이 주소에 ?from=push를 붙여줌)
// 로그아웃 상태면 종목 화면 대신 로그인 화면으로 보냅니다.
//
// 예전엔 종목 페이지(서버)가 searchParams와 세션 쿠키를 읽어서 직접 redirect
// 했는데, 그러면 페이지가 요청마다 새로 렌더링돼서 정적 생성/ISR을 쓸 수
// 없었어요(검색 노출과 첫 응답 속도에 불리). 그래서 이 확인만 브라우저로
// 옮겼습니다. 안내 문구는 예전과 같은 두 갈래예요: 재방문 마커(sa_returning)가
// 남아 있으면 세션이 저절로 만료된 것(?expired=1), 없으면 직접 로그아웃한
// 상태(?loggedout=1).
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
